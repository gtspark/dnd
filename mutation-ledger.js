/**
 * Mutation Ledger - audit trail for game-state mutations
 *
 * Every HP/gold/item/condition change (DM tool, player edit, or system) gets a
 * ledger entry in campaignState.mutationLog so the UI can render audit cards
 * and offer one-click undo. Pure functions only - no I/O; callers persist.
 */

const MUTATION_LOG_CAP = 300;

let entryCounter = 0;

function generateMutationId() {
    entryCounter = (entryCounter + 1) % 1000;
    return `mut-${Date.now()}-${entryCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Create a ledger entry and append it to campaignState.mutationLog.
 *
 * @param {Object} campaignState - mutated in place (mutationLog array)
 * @param {Object} fields
 * @param {string} fields.actor - 'dm' | 'player' | 'system'
 * @param {string} fields.type - hp_change | gold_change | item_add | item_remove |
 *   condition_add | condition_remove | condition_expired | movement | transaction | xp
 * @param {Object} fields.target - { kind: 'character'|'enemy', id, name }
 * @param {number} [fields.delta]
 * @param {*} [fields.before]
 * @param {*} [fields.after]
 * @param {string} [fields.reason]
 * @param {Object} [fields.refs] - e.g. { rollQueueId, round, item }
 * @param {string} [fields.status] - defaults to 'applied'
 * @returns {Object} the entry
 */
function createEntry(campaignState, fields) {
    if (!Array.isArray(campaignState.mutationLog)) {
        campaignState.mutationLog = [];
    }

    const entry = {
        id: generateMutationId(),
        ts: new Date().toISOString(),
        actor: fields.actor || 'system',
        type: fields.type,
        target: fields.target || null,
        delta: fields.delta ?? null,
        before: fields.before ?? null,
        after: fields.after ?? null,
        reason: fields.reason || null,
        refs: fields.refs || {},
        status: fields.status || 'applied'
    };

    campaignState.mutationLog.push(entry);
    if (campaignState.mutationLog.length > MUTATION_LOG_CAP) {
        campaignState.mutationLog = campaignState.mutationLog.slice(-MUTATION_LOG_CAP);
    }

    return entry;
}

function findEntry(campaignState, mutationId) {
    return (campaignState.mutationLog || []).find(e => e.id === mutationId) || null;
}

/**
 * Revert a ledger entry by applying its inverse to the targets.
 *
 * @param {Object} entry - the ledger entry to undo
 * @param {Object} campaignState - campaign state (characters/party)
 * @param {Object|null} combatState - active combat state (for enemy targets / HP mirror)
 * @returns {{ok: boolean, reason?: string}}
 */
function revertEntry(entry, campaignState, combatState) {
    if (!entry) return { ok: false, reason: 'Entry not found' };
    if (entry.status !== 'applied') {
        return { ok: false, reason: `Entry is '${entry.status}', only 'applied' entries can be undone` };
    }

    const targetKind = entry.target?.kind;
    const targetName = entry.target?.name || entry.target?.id;
    if (!targetName) return { ok: false, reason: 'Entry has no target' };

    const charData = targetKind === 'character'
        ? findCharacter(campaignState, targetName)
        : null;
    const combatant = combatState ? findCombatant(combatState, targetName) : null;

    switch (entry.type) {
        case 'hp_change': {
            if (charData && charData.hp && typeof charData.hp === 'object') {
                charData.hp.current = clampHp(entry.before, charData.hp.max);
            } else if (charData && typeof charData.hp === 'number') {
                charData.hp = Math.max(0, Number(entry.before) || 0);
            } else if (!combatant) {
                return { ok: false, reason: `Target ${targetName} not found` };
            }
            if (combatant && combatant.hp) {
                combatant.hp.current = clampHp(entry.before, combatant.hp.max);
                if (combatant.hp.current > 0 && combatant.isDefeated) {
                    combatant.isDefeated = false;
                }
                if (combatant.hp.current === 0) {
                    combatant.isDefeated = true;
                }
            }
            break;
        }
        case 'gold_change':
        case 'transaction': {
            if (!charData) return { ok: false, reason: `Character ${targetName} not found` };
            const resourceKey = charData.credits !== undefined ? 'credits' : 'gold';
            charData[resourceKey] = Math.max(0, Number(entry.before) || 0);
            // Transactions also moved an item; restore it if snapshotted
            if (entry.type === 'transaction' && entry.refs?.item) {
                revertItemMove(charData, entry);
            }
            break;
        }
        case 'item_add': {
            if (!charData) return { ok: false, reason: `Character ${targetName} not found` };
            removeItemByName(charData, entry.refs?.item?.name || entry.reason);
            break;
        }
        case 'item_remove': {
            if (!charData) return { ok: false, reason: `Character ${targetName} not found` };
            if (!entry.refs?.item) return { ok: false, reason: 'No item snapshot to restore' };
            if (!Array.isArray(charData.inventory)) charData.inventory = [];
            charData.inventory.push(entry.refs.item);
            break;
        }
        case 'condition_add': {
            const condName = entry.refs?.condition || entry.after;
            if (charData) removeCondition(charData, condName);
            if (combatant) removeCondition(combatant, condName);
            break;
        }
        case 'condition_remove': {
            const condName = entry.refs?.condition || entry.before;
            if (!condName) return { ok: false, reason: 'No condition recorded to restore' };
            if (charData) addCondition(charData, entry.refs?.conditionObject || condName);
            if (combatant) addCondition(combatant, entry.refs?.conditionObject || condName);
            break;
        }
        default:
            return { ok: false, reason: `Mutation type '${entry.type}' cannot be undone` };
    }

    entry.status = 'undone';
    entry.undoneAt = new Date().toISOString();
    return { ok: true };
}

// --- helpers ---

function clampHp(value, max) {
    const v = Number(value) || 0;
    const m = Number(max);
    return Math.max(0, Number.isFinite(m) && m > 0 ? Math.min(m, v) : v);
}

function normalizeName(name) {
    return (name ?? '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findCharacter(campaignState, name) {
    const pools = [campaignState?.characters, campaignState?.party];
    const wanted = normalizeName(name);
    for (const pool of pools) {
        if (!pool || typeof pool !== 'object') continue;
        for (const [key, data] of Object.entries(pool)) {
            if (!data || typeof data !== 'object') continue;
            if (normalizeName(data.name) === wanted || normalizeName(key) === wanted) {
                return data;
            }
        }
    }
    return null;
}

function findCombatant(combatState, name) {
    const order = Array.isArray(combatState?.initiativeOrder) ? combatState.initiativeOrder : [];
    const wanted = normalizeName(name);
    return order.find(c =>
        normalizeName(c.name) === wanted ||
        normalizeName(c.uid) === wanted ||
        normalizeName(c.id) === wanted ||
        (wanted.length >= 3 && (normalizeName(c.name).includes(wanted) || wanted.includes(normalizeName(c.name))))
    ) || null;
}

function removeItemByName(charData, itemName) {
    if (!Array.isArray(charData.inventory) || !itemName) return;
    const wanted = normalizeName(itemName);
    const idx = charData.inventory.findIndex(i =>
        normalizeName(typeof i === 'string' ? i : i.name) === wanted
    );
    if (idx !== -1) charData.inventory.splice(idx, 1);
}

function revertItemMove(charData, entry) {
    const item = entry.refs.item;
    if (entry.refs.itemDirection === 'added') {
        removeItemByName(charData, item.name);
    } else if (entry.refs.itemDirection === 'removed') {
        if (!Array.isArray(charData.inventory)) charData.inventory = [];
        charData.inventory.push(item);
    }
}

function conditionName(cond) {
    return typeof cond === 'string' ? cond : cond?.name;
}

function removeCondition(holder, condName) {
    if (!Array.isArray(holder.conditions) || !condName) return;
    const wanted = normalizeName(condName);
    holder.conditions = holder.conditions.filter(c => normalizeName(conditionName(c)) !== wanted);
}

function addCondition(holder, cond) {
    if (!Array.isArray(holder.conditions)) holder.conditions = [];
    const wanted = normalizeName(conditionName(cond));
    if (!holder.conditions.some(c => normalizeName(conditionName(c)) === wanted)) {
        holder.conditions.push(cond);
    }
}

module.exports = {
    createEntry,
    revertEntry,
    findEntry,
    MUTATION_LOG_CAP
};
