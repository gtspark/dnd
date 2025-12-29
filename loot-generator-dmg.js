/**
 * DMG-Accurate Loot Generator for D&D 5e
 * Implements official treasure tables from DMG Chapter 7
 * 
 * Two systems:
 * 1. Individual Treasure - for random encounters (small coins, rare magic items)
 * 2. Treasure Hoards - for boss fights, quest completion (generous loot + magic items)
 * 
 * All dice rolls happen server-side (silent) - players only see results
 */

// ============================================================================
// DICE ROLLING UTILITIES
// ============================================================================

/**
 * Rolls dice with notation like "3d6", "2d4+3", etc.
 * @param {string} notation - Dice notation (e.g., "3d6", "2d4+3")
 * @returns {{ total: number, rolls: number[], modifier: number, notation: string }}
 */
function rollDice(notation) {
    const match = notation.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!match) return { total: 0, rolls: [], modifier: 0, notation };
    
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

/**
 * Rolls dice with multiplier notation: "6d6×100", "2d4×25"
 * @param {string} notation - Dice notation with multiplier (e.g., "6d6×100")
 * @returns {number} Final value
 */
function rollDiceWithMultiplier(notation) {
    // Handle both × and x as multiplier symbols
    const match = notation.match(/^(\d+)d(\d+)[×x](\d+)$/i);
    if (!match) {
        // Try without multiplier
        const simpleResult = rollDice(notation);
        return simpleResult.total;
    }
    
    const numDice = parseInt(match[1]);
    const diceType = parseInt(match[2]);
    const multiplier = parseInt(match[3]);
    
    const result = rollDice(`${numDice}d${diceType}`);
    return result.total * multiplier;
}

/**
 * Rolls d100 (percentile dice)
 * @returns {number} 1-100
 */
function rollD100() {
    return Math.floor(Math.random() * 100) + 1;
}

/**
 * Simple random integer between min and max (inclusive)
 */
function roll(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================================
// DMG INDIVIDUAL TREASURE TABLES (Table 7-1)
// For random encounters - small amounts, rare magic items
// ============================================================================

const DMG_INDIVIDUAL_TREASURE = {
    '0-4': {
        table: [
            { range: [1, 30], coins: { type: 'cp', notation: '5d6' } },
            { range: [31, 60], coins: { type: 'sp', notation: '4d6' } },
            { range: [61, 70], coins: { type: 'ep', notation: '3d6' } },
            { range: [71, 95], coins: { type: 'gp', notation: '3d6' } },
            { range: [96, 100], coins: { type: 'pp', notation: '1d6' } }
        ],
        magicChance: 0  // No magic items for CR 0-4 individual treasure
    },
    '5-10': {
        table: [
            { range: [1, 30], coins: { type: 'cp', notation: '4d6×100' } },
            { range: [31, 60], coins: { type: 'sp', notation: '6d6×10' } },
            { range: [61, 70], coins: { type: 'ep', notation: '3d6×10' } },
            { range: [71, 95], coins: { type: 'gp', notation: '4d6×10' } },
            { range: [96, 100], coins: { type: 'pp', notation: '2d6×10' } }
        ],
        magicChance: 0.01,  // 1% chance
        magicTable: 'A'
    },
    '11-16': {
        table: [
            { range: [1, 20], coins: { type: 'sp', notation: '4d6×100' } },
            { range: [21, 35], coins: { type: 'gp', notation: '1d6×100' } },
            { range: [36, 75], coins: { type: 'gp', notation: '2d6×10' } },
            { range: [76, 100], coins: { type: 'pp', notation: '2d6×10' } }
        ],
        magicChance: 0.01,  // 1% chance
        magicTable: 'B'
    },
    '17+': {
        table: [
            { range: [1, 15], coins: { type: 'ep', notation: '2d6×1000' } },
            { range: [16, 55], coins: { type: 'gp', notation: '8d6×100' } },
            { range: [56, 100], coins: { type: 'pp', notation: '1d6×100' } }
        ],
        magicChance: 0.01,  // 1% chance
        magicTable: 'C'
    }
};

// ============================================================================
// DMG TREASURE HOARD TABLES (Tables 7-2 through 7-5)
// For boss fights, quest completion - generous loot with magic items
// ============================================================================

const DMG_TREASURE_HOARDS = {
    '0-4': {
        coins: {
            cp: '6d6×100',
            sp: '3d6×100',
            gp: '2d6×10'
        },
        d100Table: [
            { range: [1, 6], gems: null, art: null, magic: null },
            { range: [7, 16], gems: { notation: '2d6', value: 10 }, art: null, magic: null },
            { range: [17, 26], gems: null, art: { notation: '2d4', value: 25 }, magic: null },
            { range: [27, 36], gems: { notation: '2d6', value: 50 }, art: null, magic: null },
            { range: [37, 44], gems: { notation: '2d6', value: 10 }, art: null, magic: { table: 'A', rolls: '1d6' } },
            { range: [45, 52], gems: null, art: { notation: '2d4', value: 25 }, magic: { table: 'A', rolls: '1d6' } },
            { range: [53, 60], gems: { notation: '2d6', value: 50 }, art: null, magic: { table: 'A', rolls: '1d6' } },
            { range: [61, 65], gems: { notation: '2d6', value: 10 }, art: null, magic: { table: 'B', rolls: '1d4' } },
            { range: [66, 70], gems: null, art: { notation: '2d4', value: 25 }, magic: { table: 'B', rolls: '1d4' } },
            { range: [71, 75], gems: { notation: '2d6', value: 50 }, art: null, magic: { table: 'B', rolls: '1d4' } },
            { range: [76, 78], gems: { notation: '2d6', value: 10 }, art: null, magic: { table: 'C', rolls: '1d4' } },
            { range: [79, 80], gems: null, art: { notation: '2d4', value: 25 }, magic: { table: 'C', rolls: '1d4' } },
            { range: [81, 85], gems: { notation: '2d6', value: 50 }, art: null, magic: { table: 'C', rolls: '1d4' } },
            { range: [86, 92], gems: null, art: { notation: '2d4', value: 25 }, magic: { table: 'F', rolls: '1d4' } },
            { range: [93, 97], gems: { notation: '2d6', value: 50 }, art: null, magic: { table: 'F', rolls: '1d4' } },
            { range: [98, 99], gems: null, art: { notation: '2d4', value: 25 }, magic: { table: 'G', rolls: '1' } },
            { range: [100, 100], gems: { notation: '2d6', value: 50 }, art: null, magic: { table: 'G', rolls: '1' } }
        ]
    },
    '5-10': {
        coins: {
            cp: '2d6×100',
            sp: '2d6×1000',
            gp: '6d6×100',
            pp: '3d6×10'
        },
        d100Table: [
            { range: [1, 4], gems: null, art: null, magic: null },
            { range: [5, 10], gems: null, art: { notation: '2d4', value: 25 }, magic: null },
            { range: [11, 16], gems: { notation: '3d6', value: 50 }, art: null, magic: null },
            { range: [17, 22], gems: { notation: '3d6', value: 100 }, art: null, magic: null },
            { range: [23, 28], gems: null, art: { notation: '2d4', value: 250 }, magic: null },
            { range: [29, 32], gems: null, art: { notation: '2d4', value: 25 }, magic: { table: 'A', rolls: '1d6' } },
            { range: [33, 36], gems: { notation: '3d6', value: 50 }, art: null, magic: { table: 'A', rolls: '1d6' } },
            { range: [37, 40], gems: { notation: '3d6', value: 100 }, art: null, magic: { table: 'A', rolls: '1d6' } },
            { range: [41, 44], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'A', rolls: '1d6' } },
            { range: [45, 49], gems: null, art: { notation: '2d4', value: 25 }, magic: { table: 'B', rolls: '1d4' } },
            { range: [50, 54], gems: { notation: '3d6', value: 50 }, art: null, magic: { table: 'B', rolls: '1d4' } },
            { range: [55, 59], gems: { notation: '3d6', value: 100 }, art: null, magic: { table: 'B', rolls: '1d4' } },
            { range: [60, 63], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'B', rolls: '1d4' } },
            { range: [64, 66], gems: null, art: { notation: '2d4', value: 25 }, magic: { table: 'C', rolls: '1d4' } },
            { range: [67, 69], gems: { notation: '3d6', value: 50 }, art: null, magic: { table: 'C', rolls: '1d4' } },
            { range: [70, 72], gems: { notation: '3d6', value: 100 }, art: null, magic: { table: 'C', rolls: '1d4' } },
            { range: [73, 74], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'C', rolls: '1d4' } },
            { range: [75, 76], gems: null, art: { notation: '2d4', value: 25 }, magic: { table: 'D', rolls: '1' } },
            { range: [77, 78], gems: { notation: '3d6', value: 50 }, art: null, magic: { table: 'D', rolls: '1' } },
            { range: [79, 79], gems: { notation: '3d6', value: 100 }, art: null, magic: { table: 'D', rolls: '1' } },
            { range: [80, 80], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'D', rolls: '1' } },
            { range: [81, 84], gems: null, art: { notation: '2d4', value: 25 }, magic: { table: 'F', rolls: '1d4' } },
            { range: [85, 88], gems: { notation: '3d6', value: 50 }, art: null, magic: { table: 'F', rolls: '1d4' } },
            { range: [89, 91], gems: { notation: '3d6', value: 100 }, art: null, magic: { table: 'F', rolls: '1d4' } },
            { range: [92, 94], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'F', rolls: '1d4' } },
            { range: [95, 96], gems: { notation: '3d6', value: 100 }, art: null, magic: { table: 'G', rolls: '1d4' } },
            { range: [97, 98], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'G', rolls: '1d4' } },
            { range: [99, 99], gems: { notation: '3d6', value: 100 }, art: null, magic: { table: 'H', rolls: '1' } },
            { range: [100, 100], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'H', rolls: '1' } }
        ]
    },
    '11-16': {
        coins: {
            gp: '4d6×1000',
            pp: '5d6×100'
        },
        d100Table: [
            { range: [1, 3], gems: null, art: null, magic: null },
            { range: [4, 6], gems: null, art: { notation: '2d4', value: 250 }, magic: null },
            { range: [7, 9], gems: null, art: { notation: '2d4', value: 750 }, magic: null },
            { range: [10, 12], gems: { notation: '3d6', value: 500 }, art: null, magic: null },
            { range: [13, 15], gems: { notation: '3d6', value: 1000 }, art: null, magic: null },
            { range: [16, 19], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'A', rolls: '1d4' } },
            { range: [20, 23], gems: null, art: { notation: '2d4', value: 750 }, magic: { table: 'A', rolls: '1d4' } },
            { range: [24, 26], gems: { notation: '3d6', value: 500 }, art: null, magic: { table: 'A', rolls: '1d4' } },
            { range: [27, 29], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'A', rolls: '1d4' } },
            { range: [30, 35], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'B', rolls: '1d6' } },
            { range: [36, 40], gems: null, art: { notation: '2d4', value: 750 }, magic: { table: 'B', rolls: '1d6' } },
            { range: [41, 45], gems: { notation: '3d6', value: 500 }, art: null, magic: { table: 'B', rolls: '1d6' } },
            { range: [46, 50], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'B', rolls: '1d6' } },
            { range: [51, 54], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'C', rolls: '1d6' } },
            { range: [55, 58], gems: null, art: { notation: '2d4', value: 750 }, magic: { table: 'C', rolls: '1d6' } },
            { range: [59, 62], gems: { notation: '3d6', value: 500 }, art: null, magic: { table: 'C', rolls: '1d6' } },
            { range: [63, 66], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'C', rolls: '1d6' } },
            { range: [67, 68], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'D', rolls: '1d4' } },
            { range: [69, 70], gems: null, art: { notation: '2d4', value: 750 }, magic: { table: 'D', rolls: '1d4' } },
            { range: [71, 72], gems: { notation: '3d6', value: 500 }, art: null, magic: { table: 'D', rolls: '1d4' } },
            { range: [73, 74], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'D', rolls: '1d4' } },
            { range: [75, 76], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'E', rolls: '1' } },
            { range: [77, 78], gems: null, art: { notation: '2d4', value: 750 }, magic: { table: 'E', rolls: '1' } },
            { range: [79, 79], gems: { notation: '3d6', value: 500 }, art: null, magic: { table: 'E', rolls: '1' } },
            { range: [80, 80], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'E', rolls: '1' } },
            { range: [81, 84], gems: null, art: { notation: '2d4', value: 250 }, magic: { table: 'F', rolls: '1d4' } },
            { range: [85, 88], gems: null, art: { notation: '2d4', value: 750 }, magic: { table: 'F', rolls: '1d4' } },
            { range: [89, 92], gems: { notation: '3d6', value: 500 }, art: null, magic: { table: 'F', rolls: '1d4' } },
            { range: [93, 96], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'F', rolls: '1d4' } },
            { range: [97, 98], gems: null, art: { notation: '2d4', value: 750 }, magic: { table: 'G', rolls: '1d4' } },
            { range: [99, 99], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'G', rolls: '1d4' } },
            { range: [100, 100], gems: null, art: { notation: '2d4', value: 750 }, magic: { table: 'H', rolls: '1' } }
        ]
    },
    '17+': {
        coins: {
            gp: '12d6×1000',
            pp: '8d6×1000'
        },
        d100Table: [
            { range: [1, 2], gems: null, art: null, magic: null },
            { range: [3, 5], gems: { notation: '3d6', value: 1000 }, art: null, magic: null },
            { range: [6, 8], gems: null, art: { notation: '1d10', value: 2500 }, magic: null },
            { range: [9, 11], gems: null, art: { notation: '1d4', value: 7500 }, magic: null },
            { range: [12, 14], gems: { notation: '1d8', value: 5000 }, art: null, magic: null },
            { range: [15, 22], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'C', rolls: '1d8' } },
            { range: [23, 30], gems: null, art: { notation: '1d10', value: 2500 }, magic: { table: 'C', rolls: '1d8' } },
            { range: [31, 38], gems: null, art: { notation: '1d4', value: 7500 }, magic: { table: 'C', rolls: '1d8' } },
            { range: [39, 46], gems: { notation: '1d8', value: 5000 }, art: null, magic: { table: 'C', rolls: '1d8' } },
            { range: [47, 52], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'D', rolls: '1d6' } },
            { range: [53, 58], gems: null, art: { notation: '1d10', value: 2500 }, magic: { table: 'D', rolls: '1d6' } },
            { range: [59, 63], gems: null, art: { notation: '1d4', value: 7500 }, magic: { table: 'D', rolls: '1d6' } },
            { range: [64, 68], gems: { notation: '1d8', value: 5000 }, art: null, magic: { table: 'D', rolls: '1d6' } },
            { range: [69, 70], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'E', rolls: '1d6' } },
            { range: [71, 72], gems: null, art: { notation: '1d10', value: 2500 }, magic: { table: 'E', rolls: '1d6' } },
            { range: [73, 74], gems: null, art: { notation: '1d4', value: 7500 }, magic: { table: 'E', rolls: '1d6' } },
            { range: [75, 76], gems: { notation: '1d8', value: 5000 }, art: null, magic: { table: 'E', rolls: '1d6' } },
            { range: [77, 78], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'G', rolls: '1d4' } },
            { range: [79, 80], gems: null, art: { notation: '1d10', value: 2500 }, magic: { table: 'G', rolls: '1d4' } },
            { range: [81, 82], gems: null, art: { notation: '1d4', value: 7500 }, magic: { table: 'G', rolls: '1d4' } },
            { range: [83, 85], gems: { notation: '1d8', value: 5000 }, art: null, magic: { table: 'G', rolls: '1d4' } },
            { range: [86, 87], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'H', rolls: '1d4' } },
            { range: [88, 89], gems: null, art: { notation: '1d10', value: 2500 }, magic: { table: 'H', rolls: '1d4' } },
            { range: [90, 91], gems: null, art: { notation: '1d4', value: 7500 }, magic: { table: 'H', rolls: '1d4' } },
            { range: [92, 93], gems: { notation: '1d8', value: 5000 }, art: null, magic: { table: 'H', rolls: '1d4' } },
            { range: [94, 95], gems: { notation: '3d6', value: 1000 }, art: null, magic: { table: 'I', rolls: '1' } },
            { range: [96, 97], gems: null, art: { notation: '1d10', value: 2500 }, magic: { table: 'I', rolls: '1' } },
            { range: [98, 99], gems: null, art: { notation: '1d4', value: 7500 }, magic: { table: 'I', rolls: '1' } },
            { range: [100, 100], gems: { notation: '1d8', value: 5000 }, art: null, magic: { table: 'I', rolls: '1' } }
        ]
    }
};

// ============================================================================
// GEM DESCRIPTIONS (DMG p. 134)
// ============================================================================

const GEM_DESCRIPTIONS = {
    10: [
        'Azurite (opaque mottled deep blue)',
        'Banded agate (translucent striped brown/blue/white/red)',
        'Blue quartz (transparent pale blue)',
        'Eye agate (translucent circles of gray/white/brown/blue/green)',
        'Hematite (opaque gray-black)',
        'Lapis lazuli (opaque light/dark blue with yellow flecks)',
        'Malachite (opaque striated light/dark green)',
        'Moss agate (translucent pink/yellow-white with mossy gray/green)',
        'Obsidian (opaque black)',
        'Rhodochrosite (opaque light pink)',
        'Tiger eye (translucent brown with golden center)',
        'Turquoise (opaque light blue-green)'
    ],
    50: [
        'Bloodstone (opaque dark gray with red flecks)',
        'Carnelian (opaque orange to red-brown)',
        'Chalcedony (opaque white)',
        'Chrysoprase (translucent green)',
        'Citrine (transparent pale yellow-brown)',
        'Jasper (opaque blue/black/brown)',
        'Moonstone (translucent white with pale blue glow)',
        'Onyx (opaque bands of black and white)',
        'Quartz (transparent white/smoky gray/yellow)',
        'Sardonyx (opaque bands of red and white)',
        'Star rose quartz (translucent rosy stone with star center)',
        'Zircon (transparent pale blue-green)'
    ],
    100: [
        'Amber (transparent watery gold to rich gold)',
        'Amethyst (transparent deep purple)',
        'Chrysoberyl (transparent yellow-green to pale green)',
        'Coral (opaque crimson)',
        'Garnet (transparent red/brown-green/violet)',
        'Jade (translucent light green/deep green/white)',
        'Jet (opaque deep black)',
        'Pearl (opaque lustrous white/yellow/pink)',
        'Spinel (transparent red/red-brown/deep green)',
        'Tourmaline (transparent pale green/blue/brown/red)'
    ],
    500: [
        'Alexandrite (transparent dark green)',
        'Aquamarine (transparent pale blue-green)',
        'Black pearl (opaque pure black)',
        'Blue spinel (transparent deep blue)',
        'Peridot (transparent rich olive green)',
        'Topaz (transparent golden yellow)'
    ],
    1000: [
        'Black opal (translucent dark green with black/golden mottling)',
        'Blue sapphire (transparent blue-white to medium blue)',
        'Emerald (transparent deep bright green)',
        'Fire opal (translucent fiery red)',
        'Opal (translucent pale blue with green/golden mottling)',
        'Star ruby (translucent ruby with star center)',
        'Star sapphire (translucent blue sapphire with star center)',
        'Yellow sapphire (transparent fiery yellow/yellow-green)'
    ],
    5000: [
        'Black sapphire (translucent lustrous black with glowing highlights)',
        'Diamond (transparent blue-white/canary/pink/brown/blue)',
        'Jacinth (transparent fiery orange)',
        'Ruby (transparent clear red to deep crimson)'
    ]
};

// ============================================================================
// ART OBJECT DESCRIPTIONS (DMG p. 135)
// ============================================================================

const ART_OBJECT_DESCRIPTIONS = {
    25: [
        'Silver ewer',
        'Carved bone statuette',
        'Small gold bracelet',
        'Cloth-of-gold vestments',
        'Black velvet mask stitched with silver thread',
        'Copper chalice with silver filigree',
        'Pair of engraved bone dice',
        'Small mirror set in a painted wooden frame',
        'Embroidered silk handkerchief',
        'Gold locket with a painted portrait inside'
    ],
    250: [
        'Gold ring set with bloodstones',
        'Carved ivory statuette',
        'Large gold bracelet',
        'Silver necklace with a gemstone pendant',
        'Bronze crown',
        'Silk robe with gold embroidery',
        'Large well-made tapestry',
        'Brass mug with jade inlay',
        'Box of turquoise animal figurines',
        'Gold bird cage with electrum filigree'
    ],
    750: [
        'Silver chalice set with moonstones',
        'Silver-plated steel longsword with jet set in hilt',
        'Carved harp of exotic wood with ivory inlay and zircon gems',
        'Small gold idol',
        'Gold dragon comb set with red garnets as eyes',
        'Bottle stopper cork embossed with gold leaf and set with amethysts',
        'Ceremonial electrum dagger with a black pearl in the pommel',
        'Silver and gold brooch',
        'Obsidian statuette with gold fittings and inlay',
        'Painted gold war mask'
    ],
    2500: [
        'Fine gold chain set with a fire opal',
        'Old masterpiece painting',
        'Embroidered silk and velvet mantle set with numerous moonstones',
        'Platinum bracelet set with a sapphire',
        'Embroidered glove set with jewel chips',
        'Jeweled anklet',
        'Gold music box',
        'Gold circlet set with four aquamarines',
        'Eye patch with a mock eye set in blue sapphire and moonstone',
        'A necklace string of small pink pearls'
    ],
    7500: [
        'Jeweled gold crown',
        'Jeweled platinum ring',
        'Small gold statuette set with rubies',
        'Gold cup set with emeralds',
        'Gold jewelry box with platinum filigree',
        'Painted gold child\'s sarcophagus',
        'Jade game board with solid gold playing pieces',
        'Bejeweled ivory drinking horn with gold filigree'
    ]
};

// ============================================================================
// MAGIC ITEM TABLES (Simplified from DMG)
// Weighted selection - higher weight = more common
// ============================================================================

const MAGIC_ITEM_TABLES = {
    'A': [
        { name: 'Potion of Healing', weight: 50 },
        { name: 'Spell Scroll (cantrip)', weight: 20 },
        { name: 'Potion of Climbing', weight: 10 },
        { name: 'Spell Scroll (1st level)', weight: 10 },
        { name: 'Spell Scroll (2nd level)', weight: 5 },
        { name: 'Potion of Greater Healing', weight: 3 },
        { name: 'Bag of Holding', weight: 1 },
        { name: 'Driftglobe', weight: 1 }
    ],
    'B': [
        { name: 'Potion of Greater Healing', weight: 30 },
        { name: 'Potion of Fire Breath', weight: 10 },
        { name: 'Potion of Resistance', weight: 10 },
        { name: 'Ammunition, +1 (20)', weight: 10 },
        { name: 'Potion of Animal Friendship', weight: 8 },
        { name: 'Potion of Hill Giant Strength', weight: 7 },
        { name: 'Potion of Growth', weight: 5 },
        { name: 'Potion of Water Breathing', weight: 5 },
        { name: 'Spell Scroll (2nd level)', weight: 5 },
        { name: 'Spell Scroll (3rd level)', weight: 4 },
        { name: 'Bag of Holding', weight: 3 },
        { name: 'Keoghtom\'s Ointment', weight: 2 },
        { name: 'Oil of Slipperiness', weight: 1 }
    ],
    'C': [
        { name: 'Potion of Superior Healing', weight: 20 },
        { name: 'Spell Scroll (4th level)', weight: 15 },
        { name: 'Ammunition, +2 (20)', weight: 12 },
        { name: 'Potion of Clairvoyance', weight: 10 },
        { name: 'Potion of Diminution', weight: 8 },
        { name: 'Potion of Gaseous Form', weight: 7 },
        { name: 'Potion of Frost Giant Strength', weight: 6 },
        { name: 'Potion of Stone Giant Strength', weight: 5 },
        { name: 'Potion of Heroism', weight: 5 },
        { name: 'Potion of Invulnerability', weight: 4 },
        { name: 'Potion of Mind Reading', weight: 3 },
        { name: 'Spell Scroll (5th level)', weight: 3 },
        { name: 'Elixir of Health', weight: 1 },
        { name: 'Oil of Etherealness', weight: 1 }
    ],
    'D': [
        { name: 'Potion of Supreme Healing', weight: 20 },
        { name: 'Potion of Invisibility', weight: 15 },
        { name: 'Potion of Speed', weight: 12 },
        { name: 'Spell Scroll (6th level)', weight: 10 },
        { name: 'Spell Scroll (7th level)', weight: 8 },
        { name: 'Ammunition, +3 (20)', weight: 8 },
        { name: 'Potion of Flying', weight: 7 },
        { name: 'Potion of Cloud Giant Strength', weight: 5 },
        { name: 'Potion of Fire Giant Strength', weight: 5 },
        { name: 'Potion of Longevity', weight: 4 },
        { name: 'Potion of Vitality', weight: 3 },
        { name: 'Spell Scroll (8th level)', weight: 2 },
        { name: 'Horseshoes of Speed', weight: 1 }
    ],
    'E': [
        { name: 'Spell Scroll (8th level)', weight: 20 },
        { name: 'Potion of Storm Giant Strength', weight: 15 },
        { name: 'Potion of Supreme Healing', weight: 15 },
        { name: 'Spell Scroll (9th level)', weight: 10 },
        { name: 'Universal Solvent', weight: 10 },
        { name: 'Arrow of Slaying', weight: 8 },
        { name: 'Sovereign Glue', weight: 7 },
        { name: '+2 Ammunition (20)', weight: 5 },
        { name: '+3 Ammunition (20)', weight: 5 },
        { name: 'Manual of Bodily Health', weight: 2 },
        { name: 'Manual of Gainful Exercise', weight: 2 },
        { name: 'Manual of Quickness of Action', weight: 1 }
    ],
    'F': [
        { name: '+1 Weapon', weight: 20 },
        { name: '+1 Shield', weight: 15 },
        { name: '+1 Armor (leather)', weight: 12 },
        { name: '+1 Armor (chain shirt)', weight: 10 },
        { name: '+1 Armor (scale mail)', weight: 8 },
        { name: 'Sentinel Shield', weight: 8 },
        { name: 'Amulet of Proof against Detection and Location', weight: 6 },
        { name: 'Boots of Elvenkind', weight: 5 },
        { name: 'Cloak of Elvenkind', weight: 5 },
        { name: 'Cloak of Protection', weight: 4 },
        { name: 'Gauntlets of Ogre Power', weight: 3 },
        { name: 'Gloves of Missile Snaring', weight: 2 },
        { name: 'Gloves of Swimming and Climbing', weight: 1 },
        { name: 'Ring of Jumping', weight: 1 }
    ],
    'G': [
        { name: '+2 Weapon', weight: 20 },
        { name: '+1 Armor (half plate)', weight: 12 },
        { name: '+1 Armor (plate)', weight: 10 },
        { name: '+2 Shield', weight: 10 },
        { name: 'Boots of Speed', weight: 8 },
        { name: 'Bracers of Defense', weight: 7 },
        { name: 'Cloak of Displacement', weight: 6 },
        { name: 'Flame Tongue', weight: 5 },
        { name: 'Helm of Telepathy', weight: 5 },
        { name: 'Periapt of Wound Closure', weight: 4 },
        { name: 'Ring of Evasion', weight: 4 },
        { name: 'Ring of Feather Falling', weight: 3 },
        { name: 'Ring of Free Action', weight: 3 },
        { name: 'Ring of Protection', weight: 2 },
        { name: 'Ring of X-ray Vision', weight: 1 }
    ],
    'H': [
        { name: '+3 Weapon', weight: 15 },
        { name: '+2 Armor (half plate)', weight: 12 },
        { name: '+2 Armor (plate)', weight: 10 },
        { name: '+3 Shield', weight: 8 },
        { name: 'Cloak of Arachnida', weight: 7 },
        { name: 'Dancing Sword', weight: 6 },
        { name: 'Demon Armor', weight: 5 },
        { name: 'Dragon Scale Mail', weight: 5 },
        { name: 'Dwarven Plate', weight: 5 },
        { name: 'Dwarven Thrower', weight: 5 },
        { name: 'Efreeti Bottle', weight: 4 },
        { name: 'Figurine of Wondrous Power', weight: 4 },
        { name: 'Frost Brand', weight: 4 },
        { name: 'Horn of Valhalla', weight: 4 },
        { name: 'Instrument of the Bards', weight: 3 },
        { name: 'Ioun Stone', weight: 2 },
        { name: 'Mantle of Spell Resistance', weight: 1 }
    ],
    'I': [
        { name: '+3 Armor (half plate)', weight: 12 },
        { name: '+3 Armor (plate)', weight: 10 },
        { name: 'Armor of Invulnerability', weight: 8 },
        { name: 'Belt of Cloud Giant Strength', weight: 7 },
        { name: 'Belt of Storm Giant Strength', weight: 6 },
        { name: 'Cloak of Invisibility', weight: 6 },
        { name: 'Crystal Ball', weight: 5 },
        { name: 'Holy Avenger', weight: 5 },
        { name: 'Iron Flask', weight: 5 },
        { name: 'Luck Blade', weight: 5 },
        { name: 'Ring of Djinni Summoning', weight: 5 },
        { name: 'Ring of Invisibility', weight: 5 },
        { name: 'Ring of Spell Turning', weight: 5 },
        { name: 'Ring of Three Wishes', weight: 4 },
        { name: 'Rod of Lordly Might', weight: 4 },
        { name: 'Sphere of Annihilation', weight: 4 },
        { name: 'Staff of the Magi', weight: 2 },
        { name: 'Vorpal Sword', weight: 2 }
    ]
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determines treasure tier based on total CR
 * @param {number} totalCR - Combined CR of all defeated enemies
 * @returns {string} Tier key ('0-4', '5-10', '11-16', '17+')
 */
function getTreasureTier(totalCR) {
    if (totalCR <= 4) return '0-4';
    if (totalCR <= 10) return '5-10';
    if (totalCR <= 16) return '11-16';
    return '17+';
}

/**
 * Finds matching d100 table entry
 * @param {Array} table - d100 lookup table
 * @param {number} roll - d100 result (1-100)
 * @returns {Object} Matching table entry
 */
function findD100Entry(table, roll) {
    for (const entry of table) {
        if (roll >= entry.range[0] && roll <= entry.range[1]) {
            return entry;
        }
    }
    // Fallback to first entry
    return table[0];
}

/**
 * Rolls for a magic item from a specific table
 * @param {string} tableName - Table letter (A-I)
 * @returns {string|null} Magic item name or null
 */
function rollMagicItemFromTable(tableName) {
    const table = MAGIC_ITEM_TABLES[tableName];
    if (!table || table.length === 0) return null;
    
    const totalWeight = table.reduce((sum, item) => sum + item.weight, 0);
    let rollVal = roll(1, totalWeight);
    let cumulativeWeight = 0;
    
    for (const item of table) {
        cumulativeWeight += item.weight;
        if (rollVal <= cumulativeWeight) {
            return item.name;
        }
    }
    
    return table[0]?.name || null;
}

/**
 * Gets random gem description for a value tier
 * @param {number} value - Gem value (10, 50, 100, 500, 1000, 5000)
 * @returns {string} Full gem description with value
 */
function getRandomGemDescription(value) {
    const options = GEM_DESCRIPTIONS[value];
    if (!options || options.length === 0) {
        return `Gem (${value} gp)`;
    }
    const randomGem = options[Math.floor(Math.random() * options.length)];
    return `${randomGem} (${value} gp)`;
}

/**
 * Gets random art object description for a value tier
 * @param {number} value - Art value (25, 250, 750, 2500, 7500)
 * @returns {string} Full art description with value
 */
function getRandomArtDescription(value) {
    const options = ART_OBJECT_DESCRIPTIONS[value];
    if (!options || options.length === 0) {
        return `Art object (${value} gp)`;
    }
    const randomArt = options[Math.floor(Math.random() * options.length)];
    return `${randomArt} (${value} gp)`;
}

/**
 * Parses CR string to float (handles "1/4", "1/2", "1", etc.)
 * @param {string|number} cr - Challenge rating
 * @returns {number} CR as float
 */
function parseCR(cr) {
    if (typeof cr === 'number') return cr;
    if (!cr) return 0;
    
    const crStr = String(cr).trim();
    if (crStr.includes('/')) {
        const [num, den] = crStr.split('/').map(Number);
        return num / den;
    }
    return parseFloat(crStr) || 0;
}

/**
 * Calculates total CR from defeated enemies
 * @param {Array} defeatedEnemies - Array of enemy objects with cr property
 * @returns {number} Total CR
 */
function calculateTotalCR(defeatedEnemies) {
    if (!Array.isArray(defeatedEnemies)) return 0;
    return defeatedEnemies.reduce((sum, enemy) => {
        return sum + parseCR(enemy?.cr || 0);
    }, 0);
}

// ============================================================================
// MAIN LOOT GENERATION FUNCTIONS
// ============================================================================

/**
 * Generates Individual Treasure (for random encounters)
 * Small coin amounts, rare magic items only at higher CRs
 * 
 * @param {Array} defeatedEnemies - Array of defeated enemy objects
 * @returns {Object} Loot object with coins and items
 */
function generateIndividualTreasure(defeatedEnemies) {
    const loot = {
        coins: {},
        items: [],
        questItems: [],
        lootType: 'individual'
    };
    
    if (!Array.isArray(defeatedEnemies) || defeatedEnemies.length === 0) {
        return loot;
    }
    
    const totalCR = calculateTotalCR(defeatedEnemies);
    const tier = getTreasureTier(totalCR);
    const tierData = DMG_INDIVIDUAL_TREASURE[tier];
    
    // Roll d100 to determine coin type
    const d100Result = rollD100();
    const entry = findD100Entry(tierData.table, d100Result);
    
    // Roll for coins
    if (entry.coins) {
        const coinAmount = rollDiceWithMultiplier(entry.coins.notation);
        loot.coins[entry.coins.type] = coinAmount;
    }
    
    // Check for magic items (only CR 5+ has a chance)
    if (tierData.magicChance > 0 && Math.random() < tierData.magicChance) {
        const magicItem = rollMagicItemFromTable(tierData.magicTable);
        if (magicItem) {
            loot.items.push({
                name: magicItem,
                type: 'magic_item'
            });
        }
    }
    
    return loot;
}

/**
 * Generates Treasure Hoard (for boss fights, quest completion)
 * Generous coin amounts, gems, art objects, and magic items
 * 
 * @param {Array} defeatedEnemies - Array of defeated enemy objects
 * @returns {Object} Loot object with coins, gems, art, and magic items
 */
function generateTreasureHoard(defeatedEnemies) {
    const loot = {
        coins: {},
        items: [],
        questItems: [],
        lootType: 'hoard'
    };
    
    if (!Array.isArray(defeatedEnemies) || defeatedEnemies.length === 0) {
        return loot;
    }
    
    const totalCR = calculateTotalCR(defeatedEnemies);
    const tier = getTreasureTier(totalCR);
    const hoard = DMG_TREASURE_HOARDS[tier];
    
    // Step 1: Roll coins
    for (const [coinType, notation] of Object.entries(hoard.coins)) {
        const amount = rollDiceWithMultiplier(notation);
        if (amount > 0) {
            loot.coins[coinType] = amount;
        }
    }
    
    // Step 2: Roll d100 for additional treasure
    const d100Result = rollD100();
    const treasureEntry = findD100Entry(hoard.d100Table, d100Result);
    
    // Step 3: Add gems if present
    if (treasureEntry.gems) {
        const gemCount = rollDice(treasureEntry.gems.notation).total;
        for (let i = 0; i < gemCount; i++) {
            loot.items.push({
                name: getRandomGemDescription(treasureEntry.gems.value),
                type: 'gem',
                value: treasureEntry.gems.value
            });
        }
    }
    
    // Step 4: Add art objects if present
    if (treasureEntry.art) {
        const artCount = rollDice(treasureEntry.art.notation).total;
        for (let i = 0; i < artCount; i++) {
            loot.items.push({
                name: getRandomArtDescription(treasureEntry.art.value),
                type: 'art',
                value: treasureEntry.art.value
            });
        }
    }
    
    // Step 5: Roll for magic items if present
    if (treasureEntry.magic) {
        // Handle both "1" and "1d6" notation
        const rollsNotation = treasureEntry.magic.rolls;
        const numRolls = rollsNotation === '1' ? 1 : rollDice(rollsNotation).total;
        
        for (let i = 0; i < numRolls; i++) {
            const magicItem = rollMagicItemFromTable(treasureEntry.magic.table);
            if (magicItem) {
                loot.items.push({
                    name: magicItem,
                    type: 'magic_item'
                });
            }
        }
    }
    
    return loot;
}

/**
 * Main entry point for loot generation
 * Routes to appropriate system based on combat type
 * 
 * @param {Array} defeatedEnemies - Array of defeated enemy objects with cr property
 * @param {string} combatType - Type of combat encounter
 * @param {string} campaignId - Campaign identifier (for quest items integration)
 * @returns {Promise<Object>} Loot object
 */
async function generateLoot(defeatedEnemies, combatType = 'random_encounter', campaignId = null) {
    // Handle different combat types
    switch (combatType) {
        case 'random_encounter':
            // Wandering monsters, wilderness encounters - individual treasure
            return generateIndividualTreasure(defeatedEnemies);
            
        case 'quest_combat':
            // Combat during active quest - no loot (quest awards at end)
            return {
                coins: {},
                items: [],
                questItems: [],
                lootType: 'quest_combat',
                message: 'Loot will be awarded upon quest completion'
            };
            
        case 'boss_fight':
        case 'treasure_find':
            // Major encounters, boss fights, treasure caches - treasure hoard
            return generateTreasureHoard(defeatedEnemies);
            
        default:
            // Unknown type - default to individual treasure
            return generateIndividualTreasure(defeatedEnemies);
    }
}

/**
 * Generates treasure hoard for quest completion
 * Called when a quest is completed (may have had multiple combats)
 * 
 * @param {number} totalCR - Total CR of all enemies defeated during quest
 * @param {string} questName - Name of completed quest
 * @returns {Object} Loot object representing quest reward
 */
function generateQuestTreasure(totalCR, questName = 'Quest') {
    // Create a fake enemy array with the total CR
    const fakeEnemies = [{ cr: totalCR, name: 'Quest Enemies' }];
    
    const loot = generateTreasureHoard(fakeEnemies);
    loot.questName = questName;
    loot.lootType = 'quest_reward';
    
    return loot;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Main functions
    generateLoot,
    generateIndividualTreasure,
    generateTreasureHoard,
    generateQuestTreasure,
    
    // Utility functions
    rollDice,
    rollDiceWithMultiplier,
    rollD100,
    getTreasureTier,
    parseCR,
    calculateTotalCR,
    rollMagicItemFromTable,
    getRandomGemDescription,
    getRandomArtDescription,
    
    // Data (for testing/debugging)
    DMG_INDIVIDUAL_TREASURE,
    DMG_TREASURE_HOARDS,
    GEM_DESCRIPTIONS,
    ART_OBJECT_DESCRIPTIONS,
    MAGIC_ITEM_TABLES
};
