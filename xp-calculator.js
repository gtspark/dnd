/**
 * XP Calculator for D&D 5e
 * Calculates experience points based on monster Challenge Rating (CR)
 */

const CR_TO_XP = {
    '0': 10,
    '1/8': 25,
    '1/4': 50,
    '1/2': 100,
    '1': 200,
    '2': 450,
    '3': 700,
    '4': 1100,
    '5': 1800,
    '6': 2300,
    '7': 2900,
    '8': 3900,
    '9': 5000,
    '10': 5900,
    '11': 7200,
    '12': 8400,
    '13': 10000,
    '14': 11500,
    '15': 13000,
    '16': 15000,
    '17': 18000,
    '18': 20000,
    '19': 22000,
    '20': 25000,
    '21': 33000,
    '22': 41000,
    '23': 50000,
    '24': 62000,
    '25': 75000,
    '26': 90000,
    '27': 105000,
    '28': 120000,
    '29': 135000,
    '30': 155000
};

const LEVEL_XP_THRESHOLDS = [
    0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000,
    305000, 355000
];

function getLevelForXP(xp) {
    const total = Math.max(0, Number(xp) || 0);
    let level = 1;
    for (let candidate = 1; candidate <= 20; candidate++) {
        if (total >= LEVEL_XP_THRESHOLDS[candidate]) {
            level = candidate;
        }
    }
    return level;
}

function getXPForLevel(level) {
    const normalized = Math.max(1, Math.min(20, Number(level) || 1));
    return LEVEL_XP_THRESHOLDS[normalized];
}

function getNextLevelXP(level) {
    const normalized = Math.max(1, Math.min(20, Number(level) || 1));
    return normalized >= 20 ? null : LEVEL_XP_THRESHOLDS[normalized + 1];
}

function getProficiencyBonus(level) {
    const normalized = Math.max(1, Math.min(20, Number(level) || 1));
    return 2 + Math.floor((normalized - 1) / 4);
}

function getLevelProgress(xp) {
    const total = Math.max(0, Number(xp) || 0);
    const level = getLevelForXP(total);
    const currentLevelXP = getXPForLevel(level);
    const nextLevelXP = getNextLevelXP(level);
    const xpIntoLevel = total - currentLevelXP;
    const xpNeededForNext = nextLevelXP === null ? null : nextLevelXP - total;
    const progressPct = nextLevelXP === null
        ? 100
        : Math.max(0, Math.min(100, Math.round((xpIntoLevel / (nextLevelXP - currentLevelXP)) * 100)));

    return {
        level,
        totalXP: total,
        currentLevelXP,
        nextLevelXP,
        xpIntoLevel,
        xpNeededForNext,
        progressPct,
        proficiencyBonus: getProficiencyBonus(level)
    };
}

/**
 * Parse CR string to normalized key
 * @param {string|number} cr - Challenge rating (e.g., "1/4", 5, "10")
 * @returns {string} Normalized CR key
 */
function parseCR(cr) {
    if (cr == null || cr === undefined) {
        return '0';
    }
    const crString = String(cr).trim();
    
    // Check if already a valid key
    if (CR_TO_XP[crString]) {
        return crString;
    }
    
    // Convert fractions
    const fractionMatch = crString.match(/^(\d+)\/(\d+)$/);
    if (fractionMatch) {
        const num = parseInt(fractionMatch[1]);
        const den = parseInt(fractionMatch[2]);
        if (den === 2 && num === 1) return '1/2';
        if (den === 4 && num === 1) return '1/4';
        if (den === 8 && num === 1) return '1/8';
    }
    
    // Default to whole number
    const num = parseInt(crString);
    return Number.isFinite(num) ? String(num) : '0';
}

/**
 * Get XP value for a single enemy
 * @param {Object} enemy - Enemy object with CR
 * @returns {number} XP value
 */
function getXPForEnemy(enemy) {
    const cr = enemy?.cr || '0';
    const normalizedCR = parseCR(cr);
    return CR_TO_XP[normalizedCR] || 0;
}

/**
 * Calculate total XP for multiple defeated enemies
 * @param {Array} enemies - Array of defeated enemies
 * @returns {number} Total XP
 */
function calculateTotalXP(enemies) {
    if (!Array.isArray(enemies)) {
        return 0;
    }
    
    return enemies.reduce((total, enemy) => {
        // Only count defeated enemies
        if (enemy?.isDefeated || enemy?.hp?.current === 0) {
            return total + getXPForEnemy(enemy);
        }
        return total;
    }, 0);
}

/**
 * Distribute XP among party members
 * @param {number} totalXP - Total XP to distribute
 * @param {number} partySize - Number of party members
 * @returns {number} XP per party member
 */
function distributeXP(totalXP, partySize) {
    if (!Number.isFinite(partySize) || partySize <= 0) {
        return totalXP;
    }
    
    return Math.floor(totalXP / partySize);
}

/**
 * Get detailed XP breakdown for display
 * @param {Array} enemies - Array of enemies
 * @returns {Object} XP breakdown by enemy
 */
function getXPBreakdown(enemies) {
    if (!Array.isArray(enemies)) {
        return { enemies: [], totalXP: 0 };
    }
    
    const breakdown = enemies
        .filter(e => e?.isDefeated || e?.hp?.current === 0)
        .map(enemy => ({
            name: enemy?.name || 'Unknown',
            cr: parseCR(enemy?.cr || '0'),
            xp: getXPForEnemy(enemy),
            isDefeated: enemy?.isDefeated || enemy?.hp?.current === 0
        }));
    
    const totalXP = breakdown.reduce((sum, e) => sum + e.xp, 0);
    
    return {
        enemies: breakdown,
        totalXP
    };
}

module.exports = {
    CR_TO_XP,
    LEVEL_XP_THRESHOLDS,
    parseCR,
    getLevelForXP,
    getXPForLevel,
    getNextLevelXP,
    getProficiencyBonus,
    getLevelProgress,
    getXPForEnemy,
    calculateTotalXP,
    distributeXP,
    getXPBreakdown
};
