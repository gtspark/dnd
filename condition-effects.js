/**
 * Condition Effects - mechanical enforcement of D&D 5e conditions
 *
 * Replaces prompt-prose condition rules with code: roll requests get
 * pre-annotated with advantage/disadvantage, and durations auto-expire
 * at turn boundaries. Pure functions only - no I/O.
 *
 * Condition shape (strings still tolerated everywhere):
 *   { name: 'poisoned', source: 'spider bite', appliedRound: 2,
 *     duration: { type: 'rounds', value: 3, remaining: 3 } }
 */

// Per-condition mechanical effects. Keys are roll contexts:
//   ownAttack      - the conditioned creature makes an attack roll
//   abilityCheck   - the conditioned creature makes an ability check (skills included)
//   dexSave        - the conditioned creature makes a DEX saving throw
//   attackedByMelee / attackedByRanged - attackers rolling AGAINST the conditioned creature
// Values: 'advantage' | 'disadvantage' | 'autofail'
const CONDITION_RULES = {
    blinded: {
        ownAttack: 'disadvantage',
        attackedByMelee: 'advantage',
        attackedByRanged: 'advantage'
    },
    frightened: {
        ownAttack: 'disadvantage',
        abilityCheck: 'disadvantage'
    },
    invisible: {
        ownAttack: 'advantage',
        attackedByMelee: 'disadvantage',
        attackedByRanged: 'disadvantage'
    },
    paralyzed: {
        ownAttack: 'autofail',          // can't act at all
        dexSave: 'autofail',
        attackedByMelee: 'advantage',
        attackedByRanged: 'advantage'
    },
    poisoned: {
        ownAttack: 'disadvantage',
        abilityCheck: 'disadvantage'
    },
    prone: {
        ownAttack: 'disadvantage',
        attackedByMelee: 'advantage',
        attackedByRanged: 'disadvantage'
    },
    restrained: {
        ownAttack: 'disadvantage',
        dexSave: 'disadvantage',
        attackedByMelee: 'advantage',
        attackedByRanged: 'advantage'
    },
    stunned: {
        ownAttack: 'autofail',
        dexSave: 'autofail',
        attackedByMelee: 'advantage',
        attackedByRanged: 'advantage'
    },
    unconscious: {
        ownAttack: 'autofail',
        dexSave: 'autofail',
        attackedByMelee: 'advantage',
        attackedByRanged: 'advantage'
    },
    grappled: {
        // speed 0 - enforced by zone tracker (movement), no roll effects
    },
    incapacitated: {
        ownAttack: 'autofail'
    }
};

function conditionName(cond) {
    return (typeof cond === 'string' ? cond : cond?.name || '').toLowerCase().trim();
}

/**
 * Normalize a condition to object form. Accepts strings ('Prone') and objects.
 * Plain strings stay duration-less (manual removal), object form may carry duration.
 */
function normalizeCondition(cond, currentRound = null) {
    if (typeof cond === 'string') {
        return { name: cond.toLowerCase().trim(), source: null, appliedRound: currentRound, duration: null };
    }
    if (!cond || typeof cond !== 'object' || !cond.name) return null;
    const normalized = {
        name: cond.name.toLowerCase().trim(),
        source: cond.source || null,
        appliedRound: cond.appliedRound ?? currentRound,
        duration: null
    };
    if (cond.duration && typeof cond.duration === 'object' && Number(cond.duration.value) > 0) {
        normalized.duration = {
            type: cond.duration.type || 'rounds',
            value: Number(cond.duration.value),
            remaining: Number(cond.duration.remaining ?? cond.duration.value)
        };
    } else if (Number(cond.duration_rounds) > 0) {
        // Tool-input shorthand
        normalized.duration = { type: 'rounds', value: Number(cond.duration_rounds), remaining: Number(cond.duration_rounds) };
    }
    return normalized;
}

/**
 * Map a roll request type string to a roll context for CONDITION_RULES.
 */
function classifyRollType(rollType) {
    const t = (rollType || '').toLowerCase();
    if (/attack/.test(t)) return 'ownAttack';
    if (/dex(terity)?\s*sav/.test(t)) return 'dexSave';
    if (/sav/.test(t)) return 'save';
    if (/initiative/.test(t)) return null; // initiative unaffected by these conditions
    return 'abilityCheck'; // skill checks, ability checks
}

/**
 * Compute advantage/disadvantage for a roll from active conditions.
 *
 * @param {Object} params
 * @param {string} params.rollType - e.g. 'Attack', 'Perception', 'Dexterity Saving Throw'
 * @param {Array} params.rollerConditions - conditions on the creature rolling
 * @param {Array} [params.targetConditions] - conditions on the target (attack rolls)
 * @param {Array} [params.extra] - extra modifiers [{advantage:'...', reason:'...'}] e.g. long range
 * @returns {{advantage: 'advantage'|'disadvantage'|'normal', reasons: string[], autofail: boolean}}
 */
function computeRollModifiers({ rollType, rollerConditions = [], targetConditions = [], extra = [] }) {
    const context = classifyRollType(rollType);
    const reasons = [];
    let advCount = 0;
    let disCount = 0;
    let autofail = false;

    const apply = (effect, why) => {
        if (effect === 'advantage') { advCount++; reasons.push(`advantage (${why})`); }
        else if (effect === 'disadvantage') { disCount++; reasons.push(`disadvantage (${why})`); }
        else if (effect === 'autofail') { autofail = true; reasons.push(`auto-fail (${why})`); }
    };

    if (context) {
        for (const cond of rollerConditions) {
            const name = conditionName(cond);
            const rules = CONDITION_RULES[name];
            if (!rules) continue;
            if (context === 'ownAttack' && rules.ownAttack) apply(rules.ownAttack, name);
            else if (context === 'dexSave' && (rules.dexSave || rules.abilityCheck === 'autofail')) apply(rules.dexSave, name);
            else if ((context === 'abilityCheck' || context === 'save') && rules.abilityCheck && context !== 'save') apply(rules.abilityCheck, name);
        }

        // Attack rolls: target's conditions matter too (melee assumed unless stated)
        if (context === 'ownAttack') {
            const isRanged = /ranged|bow|crossbow|gun|pistol|rifle|thrown/i.test(rollType || '');
            const key = isRanged ? 'attackedByRanged' : 'attackedByMelee';
            for (const cond of targetConditions) {
                const name = conditionName(cond);
                const rules = CONDITION_RULES[name];
                if (rules && rules[key]) apply(rules[key], `target ${name}`);
            }
        }
    }

    for (const mod of extra) {
        if (mod && mod.advantage) apply(mod.advantage, mod.reason || 'situational');
    }

    // 5e: any advantage + any disadvantage = normal
    let advantage = 'normal';
    if (advCount > 0 && disCount === 0) advantage = 'advantage';
    else if (disCount > 0 && advCount === 0) advantage = 'disadvantage';

    return { advantage, reasons, autofail };
}

/**
 * Tick duration-bearing conditions for a combatant whose turn is starting.
 * Mutates the condition list in place.
 *
 * @param {Array} conditions - the combatant's condition list (strings/objects mixed)
 * @returns {{remaining: Array, expired: Array}} expired = normalized condition objects removed
 */
function tickConditions(conditions) {
    if (!Array.isArray(conditions)) return { remaining: conditions || [], expired: [] };
    const expired = [];
    const remaining = [];

    for (const cond of conditions) {
        if (typeof cond === 'object' && cond?.duration && cond.duration.type === 'rounds') {
            const left = Number(cond.duration.remaining ?? cond.duration.value) - 1;
            if (left <= 0) {
                expired.push(cond);
                continue;
            }
            cond.duration.remaining = left;
        }
        remaining.push(cond);
    }

    return { remaining, expired };
}

module.exports = {
    CONDITION_RULES,
    normalizeCondition,
    conditionName,
    classifyRollType,
    computeRollModifiers,
    tickConditions
};
