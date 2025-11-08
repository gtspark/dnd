/**
 * D&D 5e Equipment Properties Reference
 * Used for populating equipment stats when items are added
 */

const WEAPONS = {
    // Simple Melee Weapons
    'club': { damage: '1d4', damageType: 'bludgeoning', properties: ['light'], range: '5 ft' },
    'dagger': { damage: '1d4', damageType: 'piercing', properties: ['finesse', 'light', 'thrown'], range: '5 ft (20/60 thrown)' },
    'greatclub': { damage: '1d8', damageType: 'bludgeoning', properties: ['two-handed'], range: '5 ft' },
    'handaxe': { damage: '1d6', damageType: 'slashing', properties: ['light', 'thrown'], range: '5 ft (20/60 thrown)' },
    'javelin': { damage: '1d6', damageType: 'piercing', properties: ['thrown'], range: '5 ft (30/120 thrown)' },
    'light hammer': { damage: '1d4', damageType: 'bludgeoning', properties: ['light', 'thrown'], range: '5 ft (20/60 thrown)' },
    'mace': { damage: '1d6', damageType: 'bludgeoning', properties: [], range: '5 ft' },
    'quarterstaff': { damage: '1d6', damageType: 'bludgeoning', properties: ['versatile (1d8)'], range: '5 ft' },
    'sickle': { damage: '1d4', damageType: 'slashing', properties: ['light'], range: '5 ft' },
    'spear': { damage: '1d6', damageType: 'piercing', properties: ['thrown', 'versatile (1d8)'], range: '5 ft (20/60 thrown)' },

    // Simple Ranged Weapons
    'light crossbow': { damage: '1d8', damageType: 'piercing', properties: ['ammunition', 'loading', 'two-handed'], range: '80/320 ft' },
    'dart': { damage: '1d4', damageType: 'piercing', properties: ['finesse', 'thrown'], range: '20/60 ft' },
    'shortbow': { damage: '1d6', damageType: 'piercing', properties: ['ammunition', 'two-handed'], range: '80/320 ft' },
    'sling': { damage: '1d4', damageType: 'bludgeoning', properties: ['ammunition'], range: '30/120 ft' },

    // Martial Melee Weapons
    'battleaxe': { damage: '1d8', damageType: 'slashing', properties: ['versatile (1d10)'], range: '5 ft' },
    'flail': { damage: '1d8', damageType: 'bludgeoning', properties: [], range: '5 ft' },
    'glaive': { damage: '1d10', damageType: 'slashing', properties: ['heavy', 'reach', 'two-handed'], range: '10 ft' },
    'greataxe': { damage: '1d12', damageType: 'slashing', properties: ['heavy', 'two-handed'], range: '5 ft' },
    'greatsword': { damage: '2d6', damageType: 'slashing', properties: ['heavy', 'two-handed'], range: '5 ft' },
    'halberd': { damage: '1d10', damageType: 'slashing', properties: ['heavy', 'reach', 'two-handed'], range: '10 ft' },
    'lance': { damage: '1d12', damageType: 'piercing', properties: ['reach', 'special'], range: '10 ft' },
    'longsword': { damage: '1d8', damageType: 'slashing', properties: ['versatile (1d10)'], range: '5 ft' },
    'maul': { damage: '2d6', damageType: 'bludgeoning', properties: ['heavy', 'two-handed'], range: '5 ft' },
    'morningstar': { damage: '1d8', damageType: 'piercing', properties: [], range: '5 ft' },
    'pike': { damage: '1d10', damageType: 'piercing', properties: ['heavy', 'reach', 'two-handed'], range: '10 ft' },
    'rapier': { damage: '1d8', damageType: 'piercing', properties: ['finesse'], range: '5 ft' },
    'scimitar': { damage: '1d6', damageType: 'slashing', properties: ['finesse', 'light'], range: '5 ft' },
    'shortsword': { damage: '1d6', damageType: 'piercing', properties: ['finesse', 'light'], range: '5 ft' },
    'trident': { damage: '1d6', damageType: 'piercing', properties: ['thrown', 'versatile (1d8)'], range: '5 ft (20/60 thrown)' },
    'war pick': { damage: '1d8', damageType: 'piercing', properties: [], range: '5 ft' },
    'warhammer': { damage: '1d8', damageType: 'bludgeoning', properties: ['versatile (1d10)'], range: '5 ft' },
    'whip': { damage: '1d4', damageType: 'slashing', properties: ['finesse', 'reach'], range: '10 ft' },

    // Martial Ranged Weapons
    'blowgun': { damage: '1', damageType: 'piercing', properties: ['ammunition', 'loading'], range: '25/100 ft' },
    'hand crossbow': { damage: '1d6', damageType: 'piercing', properties: ['ammunition', 'light', 'loading'], range: '30/120 ft' },
    'heavy crossbow': { damage: '1d10', damageType: 'piercing', properties: ['ammunition', 'heavy', 'loading', 'two-handed'], range: '100/400 ft' },
    'longbow': { damage: '1d8', damageType: 'piercing', properties: ['ammunition', 'heavy', 'two-handed'], range: '150/600 ft' },
    'net': { damage: '-', damageType: 'special', properties: ['special', 'thrown'], range: '5/15 ft' }
};

const ARMOR = {
    // Light Armor
    'padded': { ac: 11, acModifier: 'dex', type: 'light', stealthDisadvantage: true },
    'leather': { ac: 11, acModifier: 'dex', type: 'light', stealthDisadvantage: false },
    'studded leather': { ac: 12, acModifier: 'dex', type: 'light', stealthDisadvantage: false },

    // Medium Armor
    'hide': { ac: 12, acModifier: 'dex (max 2)', type: 'medium', stealthDisadvantage: false },
    'chain shirt': { ac: 13, acModifier: 'dex (max 2)', type: 'medium', stealthDisadvantage: false },
    'scale mail': { ac: 14, acModifier: 'dex (max 2)', type: 'medium', stealthDisadvantage: true },
    'breastplate': { ac: 14, acModifier: 'dex (max 2)', type: 'medium', stealthDisadvantage: false },
    'half plate': { ac: 15, acModifier: 'dex (max 2)', type: 'medium', stealthDisadvantage: true },

    // Heavy Armor
    'ring mail': { ac: 14, acModifier: 'none', type: 'heavy', stealthDisadvantage: true },
    'chain mail': { ac: 16, acModifier: 'none', type: 'heavy', stealthDisadvantage: true },
    'splint': { ac: 17, acModifier: 'none', type: 'heavy', stealthDisadvantage: true },
    'plate': { ac: 18, acModifier: 'none', type: 'heavy', stealthDisadvantage: true },

    // Shields
    'shield': { ac: 2, acModifier: 'bonus', type: 'shield', stealthDisadvantage: false }
};

/**
 * Look up weapon properties by name (case-insensitive, partial match)
 * @param {string} weaponName - Name of the weapon
 * @returns {object|null} Weapon properties or null if not found
 */
function getWeaponProperties(weaponName) {
    const nameLower = weaponName.toLowerCase();

    // Try exact match first
    if (WEAPONS[nameLower]) {
        return WEAPONS[nameLower];
    }

    // Try partial match (e.g., "Warhammer +1" matches "warhammer")
    for (const [key, value] of Object.entries(WEAPONS)) {
        if (nameLower.includes(key) || key.includes(nameLower)) {
            return value;
        }
    }

    return null;
}

/**
 * Look up armor properties by name (case-insensitive, partial match)
 * @param {string} armorName - Name of the armor
 * @returns {object|null} Armor properties or null if not found
 */
function getArmorProperties(armorName) {
    const nameLower = armorName.toLowerCase();

    // Try exact match first
    if (ARMOR[nameLower]) {
        return ARMOR[nameLower];
    }

    // Try partial match (e.g., "Plate Mail +1" matches "plate")
    for (const [key, value] of Object.entries(ARMOR)) {
        if (nameLower.includes(key) || key.includes(nameLower)) {
            return value;
        }
    }

    return null;
}

/**
 * Get equipment properties for any item
 * @param {string} itemName - Name of the equipment
 * @param {string} itemType - Type of equipment ('weapon', 'armor', 'shield', 'gear')
 * @returns {object} Properties object
 */
function getEquipmentProperties(itemName, itemType) {
    if (itemType === 'weapon') {
        return getWeaponProperties(itemName) || {};
    } else if (itemType === 'armor' || itemType === 'shield') {
        return getArmorProperties(itemName) || {};
    }
    return {};
}

module.exports = {
    WEAPONS,
    ARMOR,
    getWeaponProperties,
    getArmorProperties,
    getEquipmentProperties
};
