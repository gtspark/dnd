/**
 * Loot Generator for D&D 5e
 * Generates treasure based on DMG treasure tables with RAG quest item integration
 */

function rollDice(notation) {
    const match = notation.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!match) return { total: 0, rolls: [] };
    
    const numDice = parseInt(match[1]);
    const diceType = parseInt(match[2]);
    const modifier = match[3] ? parseInt(match[3]) : 0;
    
    let total = modifier;
    const rolls = [];
    
    for (let i = 0; i < numDice; i++) {
        const roll = Math.floor(Math.random() * diceType) + 1;
        rolls.push(roll);
        total += roll;
    }
    
    return { total, rolls, modifier, notation };
}

function roll(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const TREASURE_HOARDS = {
    '0-4': {
        coins: {
            gp: { min: 2, max: 16 },
            pp: { min: 0, max: 0 }
        },
        gems: {
            chance: 0.4,
            count: { min: 1, max: 3 },
            value: 10
        },
        art: {
            chance: 0.25,
            count: { min: 1, max: 4 },
            value: 25
        },
        magicItems: {
            chance: 0.1,
            tables: ['A', 'B']
        }
    },
    '5-10': {
        coins: {
            gp: { min: 4, max: 40 },
            pp: { min: 17, max: 50 },
            ep: { min: 0, max: 0 },
            sp: { min: 0, max: 0 }
        },
        gems: {
            chance: 0.5,
            count: { min: 1, max: 6 },
            value: 50
        },
        art: {
            chance: 0.4,
            count: { min: 1, max: 4 },
            value: 100
        },
        magicItems: {
            chance: 0.15,
            tables: ['C', 'D']
        }
    },
    '11-16': {
        coins: {
            gp: { min: 41, max: 100 },
            pp: { min: 2, max: 16 },
            gp: { min: 0, max: 0 },
            pp: { min: 0, max: 0 },
            ep: { min: 0, max: 0 },
            sp: { min: 0, max: 0 }
        },
        gems: {
            chance: 0.6,
            count: { min: 1, max: 6 },
            value: 100
        },
        art: {
            chance: 0.5,
            count: { min: 1, max: 4 },
            value: 250
        },
        magicItems: {
            chance: 0.25,
            tables: ['E', 'F']
        }
    },
    '17+': {
        coins: {
            gp: { min: 101, max: 400 },
            pp: { min: 7, max: 33 }
        },
        gems: {
            chance: 0.7,
            count: { min: 1, max: 8 },
            value: 250
        },
        art: {
            chance: 0.6,
            count: { min: 1, max: 4 },
            value: 750
        },
        magicItems: {
            chance: 0.4,
            tables: ['G', 'H', 'I']
        }
    }
};

const MAGIC_ITEM_TABLES = {
    'A': [
        { name: 'Potion of Healing', weight: 15 },
        { name: 'Potion of Greater Healing', weight: 8 },
        { name: 'Potion of Climbing', weight: 5 },
        { name: 'Potion of Jumping', weight: 5 },
        { name: 'Scroll of Protection (Aberration)', weight: 3 },
        { name: 'Scroll of Protection (Beast)', weight: 3 },
        { name: 'Scroll of Protection (Celestial)', weight: 3 },
        { name: 'Scroll of Protection (Elemental)', weight: 3 },
        { name: 'Scroll of Protection (Fey)', weight: 3 },
        { name: 'Scroll of Protection (Fiend)', weight: 3 },
        { name: 'Scroll of Protection (Undead)', weight: 3 },
        { name: 'Potion of Flying', weight: 4 },
        { name: 'Potion of Heroism', weight: 4 },
        { name: 'Potion of Invisibility', weight: 4 },
        { name: 'Potion of Mind Reading', weight: 4 },
        { name: 'Potion of Animal Friendship', weight: 4 },
        { name: 'Potion of Speed', weight: 4 },
        { name: 'Potion of Resistance (Acid)', weight: 4 },
        { name: 'Potion of Resistance (Cold)', weight: 4 },
        { name: 'Potion of Resistance (Fire)', weight: 4 },
        { name: 'Potion of Resistance (Force)', weight: 4 },
        { name: 'Potion of Resistance (Lightning)', weight: 4 },
        { name: 'Potion of Resistance (Necrotic)', weight: 4 },
        { name: 'Potion of Resistance (Poison)', weight: 4 },
        { name: 'Potion of Resistance (Psychic)', weight: 4 },
        { name: 'Potion of Resistance (Radiant)', weight: 4 },
        { name: 'Potion of Resistance (Thunder)', weight: 4 }
    ],
    'B': [
        { name: '+1 Weapon', weight: 15 },
        { name: '+1 Armor (Light)', weight: 8 },
        { name: '+1 Armor (Medium)', weight: 7 },
        { name: '+1 Armor (Heavy)', weight: 6 },
        { name: 'Amulet of Proof Against Detection and Location', weight: 10 },
        { name: 'Cloak of Protection', weight: 5 },
        { name: 'Gauntlets of Ogre Power', weight: 5 },
        { name: 'Gauntlets of Stone Giant Strength', weight: 2 },
        { name: 'Potion of Greater Healing', weight: 15 },
        { name: 'Potion of Healing', weight: 15 },
        { name: 'Ring of Protection', weight: 10 },
        { name: 'Ring of Warmth', weight: 5 },
        { name: 'Wand of Magic Detection', weight: 5 }
    ],
    'C': [
        { name: 'Potion of Invisibility', weight: 15 },
        { name: 'Potion of Speed', weight: 14 },
        { name: 'Amulet of Proof Against Poison and Location', weight: 15 },
        { name: 'Bag of Holding', weight: 20 },
        { name: 'Bag of Tricks (Gray)', weight: 15 },
        { name: '+1 Shield', weight: 8 },
        { name: '+1 Weapon', weight: 15 },
        { name: 'Boots of the Winterlands', weight: 8 },
        { name: 'Hat of Disguise', weight: 7 },
        { name: 'Medallion of Thoughts', weight: 5 },
        { name: 'Necklace of Fireballs', weight: 2 },
        { name: 'Pearl of Power', weight: 5 }
    ],
    'D': [
        { name: 'Amulet of Proof Against Detection and Location', weight: 5 },
        { name: 'Bag of Holding', weight: 20 },
        { name: '+1 Weapon', weight: 15 },
        { name: 'Cloak of Elvenkind', weight: 7 },
        { name: 'Cloak of Protection', weight: 5 },
        { name: 'Goggles of Night', weight: 8 },
        { name: '+1 Weapon', weight: 15 },
        { name: 'Wand of Paralysis', weight: 4 },
        { name: 'Wand of the War Mage +1', weight: 8 },
        { name: 'Wand of Web', weight: 8 }
    ],
    'E': [
        { name: 'Cloak of the Bat', weight: 7 },
        { name: 'Cloak of Displacement', weight: 4 },
        { name: '+2 Weapon', weight: 10 },
        { name: 'Gloves of Missile Snaring', weight: 5 },
        { name: 'Mace of Smiting', weight: 5 },
        { name: 'Potion of Flying', weight: 9 },
        { name: '+1 Studded Leather Armor', weight: 8 },
        { name: '+1 Scale Mail', weight: 7 },
        { name: '+1 Splint Mail', weight: 6 },
        { name: '+1 Plate Armor', weight: 4 },
        { name: 'Amulet of Proof Against Poison', weight: 5 }
    ],
    'F': [
        { name: 'Bag of Holding', weight: 5 },
        { name: '+2 Shield', weight: 8 },
        { name: '+2 Weapon', weight: 10 },
        { name: 'Bracers of Defense', weight: 5 },
        { name: 'Gauntlets of Ogre Power', weight: 4 },
        { name: '+1 Breastplate', weight: 8 },
        { name: '+1 Half Plate', weight: 7 },
        { name: '+1 Ring Mail', weight: 6 },
        { name: '+1 Chain Mail', weight: 5 },
        { name: '+2 Longsword', weight: 8 },
        { name: '+2 Longbow', weight: 5 }
    ],
    'G': [
        { name: 'Belt of Dwarvenkind', weight: 3 },
        { name: '+2 Breastplate', weight: 8 },
        { name: '+2 Chain Mail', weight: 5 },
        { name: '+2 Studded Leather Armor', weight: 8 },
        { name: 'Helm of Brilliance', weight: 1 },
        { name: 'Potion of Flying', weight: 9 },
        { name: '+2 Longsword', weight: 8 },
        { name: 'Potion of Speed', weight: 7 },
        { name: '+2 Shield', weight: 8 },
        { name: 'Wand of Fireballs', weight: 4 }
    ],
    'H': [
        { name: '+2 Plate Armor', weight: 4 },
        { name: 'Potion of Invisibility', weight: 9 },
        { name: 'Potion of Speed', weight: 7 },
        { name: '+3 Longsword', weight: 5 },
        { name: '+3 Mace', weight: 3 },
        { name: 'Potion of Flying', weight: 6 },
        { name: 'Horn of Valhalla (Silver or Brass)', weight: 4 },
        { name: 'Bag of Holding', weight: 3 }
    ],
    'I': [
        { name: '+2 Armor (Any)', weight: 10 },
        { name: 'Helm of Teleportation', weight: 3 },
        { name: 'Potion of Flying', weight: 6 },
        { name: '+3 Weapon', weight: 8 },
        { name: 'Potion of Speed', weight: 5 },
        { name: '+3 Shield', weight: 5 },
        { name: 'Bag of Holding', weight: 3 }
    ]
};

function rollMagicItemFromTable(tableName) {
    const table = MAGIC_ITEM_TABLES[tableName];
    if (!table) return null;
    
    const totalWeight = table.reduce((sum, item) => sum + item.weight, 0);
    const rollVal = roll(1, totalWeight);
    let cumulativeWeight = 0;
    
    for (const item of table) {
        cumulativeWeight += item.weight;
        if (rollVal <= cumulativeWeight) {
            return item.name;
        }
    }
    
    return table[0]?.name || null;
}

function rollFromTable(tables) {
    if (!Array.isArray(tables) || tables.length === 0) return null;
    const tableIndex = Math.floor(Math.random() * tables.length);
    return rollMagicItemFromTable(tables[tableIndex]);
}

function getTreasureTier(totalCR) {
    if (totalCR <= 4) return '0-4';
    if (totalCR <= 10) return '5-10';
    if (totalCR <= 16) return '11-16';
    return '17+';
}

async function generateLoot(defeatedEnemies, campaignId, memoryClient) {
    const loot = {
        coins: {},
        items: [],
        questItems: []
    };
    
    if (!Array.isArray(defeatedEnemies) || defeatedEnemies.length === 0) {
        return loot;
    }
    
    const xpCalc = require('./xp-calculator');
    const { calculateTotalXP } = xpCalc;
    
    const totalCR = defeatedEnemies.reduce((sum, enemy) => {
        return sum + parseFloat(xpCalc.parseCR(enemy?.cr || '0') || 0);
    }, 0);
    
    const tier = getTreasureTier(totalCR);
    const hoard = TREASURE_HOARDS[tier] || TREASURE_HOARDS['0-4'];
    
    loot.coins = rollCoins(hoard.coins);
    
    const gemRoll = Math.random();
    if (gemRoll < hoard.gems.chance) {
        const gemCount = roll(hoard.gems.count.min, hoard.gems.count.max);
        const gemValue = hoard.gems.value;
        for (let i = 0; i < gemCount; i++) {
            loot.items.push({
                name: `Gem (${gemValue} GP)`,
                type: 'gem',
                value: gemValue
            });
        }
    }
    
    const artRoll = Math.random();
    if (artRoll < hoard.art.chance) {
        const artCount = roll(hoard.art.count.min, hoard.art.count.max);
        const artValue = hoard.art.value;
        for (let i = 0; i < artCount; i++) {
            loot.items.push({
                name: `Art Object (${artValue} GP)`,
                type: 'art',
                value: artValue
            });
        }
    }
    
    const magicRoll = Math.random();
    if (magicRoll < hoard.magicItems.chance) {
        const magicItem = rollFromTable(hoard.magicItems.tables);
        if (magicItem) {
            loot.items.push({
                name: magicItem,
                type: 'magic_item'
            });
        }
    }
    
    loot.totalXP = calculateTotalXP(defeatedEnemies);
    
    return loot;
}

function rollCoins(coinConfig) {
    const coins = {};
    if (!coinConfig) return coins;
    
    const coinTypes = ['pp', 'gp', 'ep', 'sp', 'cp'];
    
    for (const type of coinTypes) {
        const config = coinConfig[type];
        if (config && config.min !== undefined && config.max !== undefined) {
            coins[type] = roll(config.min, config.max);
        }
    }
    
    return coins;
}

module.exports = {
    generateLoot,
    rollCoins,
    rollMagicItemFromTable,
    getTreasureTier,
    TREASURE_HOARDS,
    MAGIC_ITEM_TABLES
};
