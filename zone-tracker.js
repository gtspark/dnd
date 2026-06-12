/**
 * Zone Tracker - range-band positioning for theater-of-the-mind combat
 *
 * A 1-D lane of four bands instead of a grid:
 *   0 engaged - melee range (within 5 ft)
 *   1 near    - one move away (~30 ft)
 *   2 far     - two moves / normal ranged distance (~60-90 ft)
 *   3 distant - long range, disadvantage on ranged attacks
 *
 * Positions live in combatState.positions keyed by normalized combatant id.
 * Pure functions only - no I/O.
 */

const BANDS = ['engaged', 'near', 'far', 'distant'];

function normalizeKey(value) {
    return (value ?? '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function bandIndex(band) {
    if (typeof band === 'number') return Math.max(0, Math.min(BANDS.length - 1, band));
    const idx = BANDS.indexOf((band || '').toString().toLowerCase().trim());
    return idx === -1 ? null : idx;
}

function bandName(idx) {
    return BANDS[Math.max(0, Math.min(BANDS.length - 1, idx))];
}

function combatantKey(combatant) {
    return normalizeKey(combatant?.uid || combatant?.id || combatant?.name);
}

/**
 * Find a combatant's position key with fuzzy name matching.
 */
function findPositionKey(combatState, name) {
    const positions = combatState?.positions || {};
    const wanted = normalizeKey(name);
    if (!wanted) return null;

    // 1. Exact key match
    if (positions[wanted]) return wanted;

    // 2. Exact match against position entry names
    for (const [key, pos] of Object.entries(positions)) {
        if (normalizeKey(pos.name) === wanted) return key;
    }

    // 3. Resolve via initiative order (exact id/uid/name first)
    const order = Array.isArray(combatState?.initiativeOrder) ? combatState.initiativeOrder : [];
    let found = order.find(c =>
        normalizeKey(c.name) === wanted || normalizeKey(c.uid) === wanted || normalizeKey(c.id) === wanted
    );
    if (!found && wanted.length >= 3) {
        // 4. Fuzzy: prefer the longest-name match so 'Goblin Archer' beats 'Goblin'
        const candidates = order.filter(c => {
            const cn = normalizeKey(c.name);
            return cn.includes(wanted) || wanted.includes(cn);
        }).sort((a, b) => normalizeKey(b.name).length - normalizeKey(a.name).length);
        found = candidates[0] || null;
    }
    if (found) {
        const key = combatantKey(found);
        if (positions[key]) return key;
    }

    // 5. Last resort: substring over position keys, longest first
    const keyMatches = Object.keys(positions)
        .filter(key => key.includes(wanted) || (wanted.length >= 3 && wanted.includes(key)))
        .sort((a, b) => b.length - a.length);
    return keyMatches[0] || null;
}

/**
 * Initialize positions for all combatants: players at 'near', enemies at 'far'
 * (one move apart), unless a starting_zone was provided on the entry.
 */
function initPositions(combatState) {
    const positions = {};
    const all = [
        ...(combatState.participants?.players || []),
        ...(combatState.participants?.enemies || [])
    ];
    for (const combatant of all) {
        const key = combatantKey(combatant);
        if (!key) continue;
        const startBand = bandIndex(combatant.starting_zone);
        positions[key] = {
            band: startBand !== null ? startBand : (combatant.isPlayer ? 1 : 2),
            name: combatant.name
        };
    }
    combatState.positions = positions;
    return positions;
}

function getBand(combatState, name) {
    const key = findPositionKey(combatState, name);
    if (!key || !combatState.positions?.[key]) return null;
    return combatState.positions[key].band;
}

/**
 * Distance in bands between two combatants (0 = same band/engaged).
 */
function bandDistance(combatState, nameA, nameB) {
    const a = getBand(combatState, nameA);
    const b = getBand(combatState, nameB);
    if (a === null || b === null) return null;
    return Math.abs(a - b);
}

/**
 * Move a combatant to a band.
 *
 * @returns {{ok: boolean, reason?: string, from?: string, to?: string,
 *            bandsMoved?: number, requiresDash?: boolean, opportunityAttackers?: Array}}
 */
function moveCombatant(combatState, name, toBand, options = {}) {
    const key = findPositionKey(combatState, name);
    if (!key || !combatState.positions?.[key]) {
        return { ok: false, reason: `No position tracked for '${name}'` };
    }
    const target = bandIndex(toBand);
    if (target === null) {
        return { ok: false, reason: `Unknown zone '${toBand}' (use: ${BANDS.join(', ')})` };
    }

    const pos = combatState.positions[key];
    const from = pos.band;
    const bandsMoved = Math.abs(target - from);

    if (bandsMoved === 0) {
        return { ok: true, from: bandName(from), to: bandName(target), bandsMoved: 0, requiresDash: false, opportunityAttackers: [] };
    }
    if (bandsMoved > 2) {
        return { ok: false, reason: `Cannot move ${bandsMoved} bands in one turn (max 2 with Dash)` };
    }

    // Leaving a shared band provokes opportunity attacks from hostile melee
    // combatants there (unless disengaging or the mover is defeated).
    const opportunityAttackers = [];
    if (!options.disengage) {
        const moverIsPlayer = isPlayerKey(combatState, key);
        const order = Array.isArray(combatState.initiativeOrder) ? combatState.initiativeOrder : [];
        for (const other of order) {
            const otherKey = combatantKey(other);
            if (!otherKey || otherKey === key) continue;
            if (other.isDefeated || other.hp?.current === 0) continue;
            if ((other.isPlayer === true) === moverIsPlayer) continue; // same side
            const otherPos = combatState.positions[otherKey];
            if (otherPos && otherPos.band === from && from === 0) {
                // Only being engaged (band 0) counts as within melee reach
                const reactionAvailable = combatState.actionEconomy?.[otherKey]?.reaction !== false;
                if (reactionAvailable) {
                    opportunityAttackers.push({ key: otherKey, name: other.name, isPlayer: other.isPlayer === true });
                }
            }
        }
    }

    pos.band = target;
    return {
        ok: true,
        from: bandName(from),
        to: bandName(target),
        bandsMoved,
        requiresDash: bandsMoved === 2,
        opportunityAttackers
    };
}

function isPlayerKey(combatState, key) {
    const order = Array.isArray(combatState.initiativeOrder) ? combatState.initiativeOrder : [];
    const found = order.find(c => combatantKey(c) === key);
    return found ? found.isPlayer === true : false;
}

/**
 * Validate an attack between two combatants given their bands.
 *
 * @param {string} kind - 'melee' | 'ranged'
 * @returns {{valid: boolean, reason?: string, rangePenalty?: 'disadvantage'|null, distance?: number}}
 */
function validateAttack(combatState, attackerName, targetName, kind = 'melee') {
    const distance = bandDistance(combatState, attackerName, targetName);
    if (distance === null) {
        // No position data - don't block (graceful degradation)
        return { valid: true, rangePenalty: null, distance: null, untracked: true };
    }

    if (kind === 'melee') {
        const attackerBand = getBand(combatState, attackerName);
        if (distance === 0 && attackerBand === 0) {
            return { valid: true, rangePenalty: null, distance };
        }
        if (distance === 0) {
            return { valid: false, distance, reason: `Both at '${bandName(attackerBand)}' but not engaged — call move_combatant to zone 'engaged' first` };
        }
        return { valid: false, distance, reason: `Target is ${distance} band(s) away — melee requires both combatants engaged. Move first.` };
    }

    // Ranged
    if (distance <= 2) {
        return { valid: true, rangePenalty: null, distance };
    }
    if (distance === 3) {
        return { valid: true, rangePenalty: 'disadvantage', distance, reason: 'long range' };
    }
    return { valid: false, distance, reason: 'Target is beyond long range' };
}

module.exports = {
    BANDS,
    initPositions,
    getBand,
    bandName,
    bandIndex,
    bandDistance,
    moveCombatant,
    validateAttack,
    findPositionKey
};
