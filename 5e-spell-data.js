/**
 * D&D 5e Spell Properties Reference
 * Used for populating spell stats when spells are added
 */

const SPELLS = {
    // Cantrips (Level 0)
    'fire bolt': { level: 0, school: 'evocation', damage: '1d10', damageType: 'fire', range: '120 ft', castingTime: 'action' },
    'ray of frost': { level: 0, school: 'evocation', damage: '1d8', damageType: 'cold', range: '60 ft', castingTime: 'action' },
    'shocking grasp': { level: 0, school: 'evocation', damage: '1d8', damageType: 'lightning', range: 'touch', castingTime: 'action' },
    'sacred flame': { level: 0, school: 'evocation', damage: '1d8', damageType: 'radiant', range: '60 ft', castingTime: 'action', savingThrow: 'Dexterity' },
    'eldritch blast': { level: 0, school: 'evocation', damage: '1d10', damageType: 'force', range: '120 ft', castingTime: 'action' },
    'toll the dead': { level: 0, school: 'necromancy', damage: '1d8 (1d12 wounded)', damageType: 'necrotic', range: '60 ft', castingTime: 'action', savingThrow: 'Wisdom' },
    'poison spray': { level: 0, school: 'conjuration', damage: '1d12', damageType: 'poison', range: '10 ft', castingTime: 'action', savingThrow: 'Constitution' },
    'chill touch': { level: 0, school: 'necromancy', damage: '1d8', damageType: 'necrotic', range: '120 ft', castingTime: 'action' },
    'mage hand': { level: 0, school: 'conjuration', range: '30 ft', castingTime: 'action', duration: '1 minute' },
    'prestidigitation': { level: 0, school: 'transmutation', range: '10 ft', castingTime: 'action', duration: '1 hour' },
    'minor illusion': { level: 0, school: 'illusion', range: '30 ft', castingTime: 'action', duration: '1 minute' },
    'light': { level: 0, school: 'evocation', range: 'touch', castingTime: 'action', duration: '1 hour' },
    'mending': { level: 0, school: 'transmutation', range: 'touch', castingTime: '1 minute', duration: 'instantaneous' },
    'guidance': { level: 0, school: 'divination', range: 'touch', castingTime: 'action', duration: '1 minute (concentration)' },
    'resistance': { level: 0, school: 'abjuration', range: 'touch', castingTime: 'action', duration: '1 minute (concentration)' },
    'spare the dying': { level: 0, school: 'necromancy', range: 'touch', castingTime: 'action', duration: 'instantaneous' },

    // 1st Level
    'magic missile': { level: 1, school: 'evocation', damage: '3d4+3', damageType: 'force', range: '120 ft', castingTime: 'action' },
    'burning hands': { level: 1, school: 'evocation', damage: '3d6', damageType: 'fire', range: '15 ft cone', castingTime: 'action', savingThrow: 'Dexterity' },
    'thunderwave': { level: 1, school: 'evocation', damage: '2d8', damageType: 'thunder', range: '15 ft cube', castingTime: 'action', savingThrow: 'Constitution' },
    'cure wounds': { level: 1, school: 'evocation', healing: '1d8 + mod', range: 'touch', castingTime: 'action' },
    'healing word': { level: 1, school: 'evocation', healing: '1d4 + mod', range: '60 ft', castingTime: 'bonus action' },
    'shield': { level: 1, school: 'abjuration', effect: '+5 AC', range: 'self', castingTime: 'reaction', duration: '1 round' },
    'mage armor': { level: 1, school: 'abjuration', effect: 'AC 13 + Dex', range: 'touch', castingTime: 'action', duration: '8 hours' },
    'sleep': { level: 1, school: 'enchantment', effect: '5d8 HP pool', range: '90 ft', castingTime: 'action', duration: '1 minute' },
    'charm person': { level: 1, school: 'enchantment', range: '30 ft', castingTime: 'action', duration: '1 hour', savingThrow: 'Wisdom' },
    'disguise self': { level: 1, school: 'illusion', range: 'self', castingTime: 'action', duration: '1 hour' },
    'bless': { level: 1, school: 'enchantment', effect: '+1d4 to attacks/saves', range: '30 ft', castingTime: 'action', duration: '1 minute (concentration)' },
    'bane': { level: 1, school: 'enchantment', effect: '-1d4 to attacks/saves', range: '30 ft', castingTime: 'action', duration: '1 minute (concentration)', savingThrow: 'Charisma' },

    // 2nd Level
    'scorching ray': { level: 2, school: 'evocation', damage: '3 rays, 2d6 each', damageType: 'fire', range: '120 ft', castingTime: 'action' },
    'shatter': { level: 2, school: 'evocation', damage: '3d8', damageType: 'thunder', range: '60 ft', castingTime: 'action', savingThrow: 'Constitution' },
    'hold person': { level: 2, school: 'enchantment', range: '60 ft', castingTime: 'action', duration: '1 minute (concentration)', savingThrow: 'Wisdom' },
    'spiritual weapon': { level: 2, school: 'evocation', damage: '1d8 + mod', damageType: 'force', range: '60 ft', castingTime: 'bonus action', duration: '1 minute' },
    'prayer of healing': { level: 2, school: 'evocation', healing: '2d8 + mod (6 targets)', range: '30 ft', castingTime: '10 minutes' },
    'invisibility': { level: 2, school: 'illusion', range: 'touch', castingTime: 'action', duration: '1 hour (concentration)' },
    'misty step': { level: 2, school: 'conjuration', range: 'self (30 ft teleport)', castingTime: 'bonus action', duration: 'instantaneous' },
    'mirror image': { level: 2, school: 'illusion', range: 'self', castingTime: 'action', duration: '1 minute' },

    // 3rd Level
    'fireball': { level: 3, school: 'evocation', damage: '8d6', damageType: 'fire', range: '150 ft', castingTime: 'action', savingThrow: 'Dexterity' },
    'lightning bolt': { level: 3, school: 'evocation', damage: '8d6', damageType: 'lightning', range: '100 ft line', castingTime: 'action', savingThrow: 'Dexterity' },
    'counterspell': { level: 3, school: 'abjuration', range: '60 ft', castingTime: 'reaction', duration: 'instantaneous' },
    'dispel magic': { level: 3, school: 'abjuration', range: '120 ft', castingTime: 'action', duration: 'instantaneous' },
    'revivify': { level: 3, school: 'necromancy', range: 'touch', castingTime: 'action', effect: 'restore 1 HP', cost: '300 GP diamond' },
    'spirit guardians': { level: 3, school: 'conjuration', damage: '3d8', damageType: 'radiant/necrotic', range: '15 ft radius', castingTime: 'action', duration: '10 minutes (concentration)', savingThrow: 'Wisdom' },
    'beacon of hope': { level: 3, school: 'abjuration', effect: 'Adv on Wis/death saves, max healing', range: '30 ft', castingTime: 'action', duration: '1 minute (concentration)' },
    'haste': { level: 3, school: 'transmutation', effect: '+2 AC, Adv on Dex, double speed, extra action', range: '30 ft', castingTime: 'action', duration: '1 minute (concentration)' },
    'fly': { level: 3, school: 'transmutation', effect: 'fly speed 60 ft', range: 'touch', castingTime: 'action', duration: '10 minutes (concentration)' },

    // 4th Level
    'ice storm': { level: 4, school: 'evocation', damage: '2d8 bludgeoning + 4d6 cold', damageType: 'cold', range: '300 ft', castingTime: 'action', savingThrow: 'Dexterity' },
    'wall of fire': { level: 4, school: 'evocation', damage: '5d8', damageType: 'fire', range: '120 ft', castingTime: 'action', duration: '1 minute (concentration)', savingThrow: 'Dexterity' },
    'polymorph': { level: 4, school: 'transmutation', range: '60 ft', castingTime: 'action', duration: '1 hour (concentration)', savingThrow: 'Wisdom' },
    'banishment': { level: 4, school: 'abjuration', range: '60 ft', castingTime: 'action', duration: '1 minute (concentration)', savingThrow: 'Charisma' },
    'dimension door': { level: 4, school: 'conjuration', range: '500 ft teleport', castingTime: 'action', duration: 'instantaneous' },
    'greater invisibility': { level: 4, school: 'illusion', range: 'touch', castingTime: 'action', duration: '1 minute (concentration)' },

    // 5th Level
    'cone of cold': { level: 5, school: 'evocation', damage: '8d8', damageType: 'cold', range: '60 ft cone', castingTime: 'action', savingThrow: 'Constitution' },
    'flame strike': { level: 5, school: 'evocation', damage: '4d6 fire + 4d6 radiant', damageType: 'fire/radiant', range: '60 ft', castingTime: 'action', savingThrow: 'Dexterity' },
    'cloudkill': { level: 5, school: 'conjuration', damage: '5d8', damageType: 'poison', range: '120 ft', castingTime: 'action', duration: '10 minutes (concentration)', savingThrow: 'Constitution' },
    'mass cure wounds': { level: 5, school: 'evocation', healing: '3d8 + mod (6 targets)', range: '60 ft', castingTime: 'action' },
    'raise dead': { level: 5, school: 'necromancy', range: 'touch', castingTime: '1 hour', cost: '500 GP diamond' },
    'teleportation circle': { level: 5, school: 'conjuration', range: '10 ft', castingTime: '1 minute', duration: '1 round' },
};

/**
 * Look up spell properties by name (case-insensitive, partial match)
 * @param {string} spellName - Name of the spell
 * @returns {object|null} Spell properties or null if not found
 */
function getSpellProperties(spellName) {
    const nameLower = spellName.toLowerCase();

    // Try exact match first
    if (SPELLS[nameLower]) {
        return SPELLS[nameLower];
    }

    // Try partial match (e.g., "Fireball (3rd Level)" matches "fireball")
    for (const [key, value] of Object.entries(SPELLS)) {
        if (nameLower.includes(key) || key.includes(nameLower)) {
            return value;
        }
    }

    return null;
}

module.exports = {
    SPELLS,
    getSpellProperties
};
