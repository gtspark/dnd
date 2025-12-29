/**
 * Debug script to test loot drops with various enemy types
 */

const lootGenerator = require('./loot-generator');
const xpCalculator = require('./xp-calculator');

async function testLootDrops() {
    console.log('\n' + '='.repeat(60));
    console.log('LOOT DROP DEBUG TEST');
    console.log('='.repeat(60) + '\n');

    const testCases = [
        {
            name: 'Three Goblins (CR 1/4 each)',
            enemies: [
                { name: 'Goblin 1', cr: '1/4', hp: { current: 0, max: 7 }, isDefeated: true },
                { name: 'Goblin 2', cr: '1/4', hp: { current: 0, max: 7 }, isDefeated: true },
                { name: 'Goblin 3', cr: '1/4', hp: { current: 0, max: 7 }, isDefeated: true }
            ]
        },
        {
            name: 'Single Wolf (CR 1/4)',
            enemies: [
                { name: 'Wolf', cr: '1/4', hp: { current: 0, max: 11 }, isDefeated: true }
            ]
        },
        {
            name: 'Hobgoblin Captain + 2 Hobgoblins (CR 3 + 2x CR 1/2)',
            enemies: [
                { name: 'Hobgoblin Captain', cr: '3', hp: { current: 0, max: 39 }, isDefeated: true },
                { name: 'Hobgoblin 1', cr: '1/2', hp: { current: 0, max: 11 }, isDefeated: true },
                { name: 'Hobgoblin 2', cr: '1/2', hp: { current: 0, max: 11 }, isDefeated: true }
            ]
        },
        {
            name: 'Ogre (CR 2)',
            enemies: [
                { name: 'Ogre', cr: '2', hp: { current: 0, max: 59 }, isDefeated: true }
            ]
        },
        {
            name: 'Young Dragon (CR 10)',
            enemies: [
                { name: 'Young Red Dragon', cr: '10', hp: { current: 0, max: 178 }, isDefeated: true }
            ]
        },
        {
            name: 'Wolves with no CR set (should show warning)',
            enemies: [
                { name: 'Wolf 1', hp: { current: 0, max: 11 }, isDefeated: true },
                { name: 'Wolf 2', hp: { current: 0, max: 11 }, isDefeated: true }
            ]
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n--- ${testCase.name} ---`);
        
        // Calculate XP
        const xpData = xpCalculator.getXPBreakdown(testCase.enemies);
        console.log(`XP: ${xpData.totalXP} total`);
        if (xpData.enemies.length > 0) {
            xpData.enemies.forEach(e => console.log(`  - ${e.name}: ${e.xp} XP (CR ${e.cr})`));
        }
        
        // Generate loot
        try {
            const loot = await lootGenerator.generateLoot(testCase.enemies);
            console.log('Loot:', JSON.stringify(loot, null, 2));
        } catch (err) {
            console.log('Loot generation error:', err.message);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60) + '\n');
}

testLootDrops().catch(console.error);
