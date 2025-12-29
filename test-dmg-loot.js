#!/usr/bin/env node
/**
 * Test script for DMG-accurate loot generation
 * Tests both Individual Treasure and Treasure Hoard systems
 */

const lootGen = require('./loot-generator-dmg');

console.log('═══════════════════════════════════════════════════════════');
console.log('   DMG-ACCURATE LOOT GENERATOR TEST SUITE');
console.log('═══════════════════════════════════════════════════════════\n');

// Helper to format coins
function formatCoins(coins) {
    if (!coins) return 'None';
    const parts = [];
    if (coins.pp) parts.push(`${coins.pp} pp`);
    if (coins.gp) parts.push(`${coins.gp} gp`);
    if (coins.ep) parts.push(`${coins.ep} ep`);
    if (coins.sp) parts.push(`${coins.sp} sp`);
    if (coins.cp) parts.push(`${coins.cp} cp`);
    return parts.length > 0 ? parts.join(', ') : 'None';
}

// Helper to format items
function formatItems(items) {
    if (!items || items.length === 0) return 'None';
    return items.map(i => `  - ${i.name} (${i.type})`).join('\n');
}

// ============================================================================
// TEST 1: Individual Treasure (Random Encounters)
// ============================================================================
console.log('───────────────────────────────────────────────────────────');
console.log('TEST 1: Individual Treasure (Random Encounters)');
console.log('───────────────────────────────────────────────────────────\n');

console.log('Scenario: 2 Wolves (CR 1/4 each) - Random wilderness encounter\n');

const wolves = [
    { name: 'Wolf', cr: '1/4' },
    { name: 'Wolf', cr: '1/4' }
];

// Run 10 simulations
console.log('Running 10 simulations...\n');
let magicItemCount = 0;
for (let i = 0; i < 10; i++) {
    const loot = lootGen.generateIndividualTreasure(wolves);
    const hasMagic = loot.items.some(item => item.type === 'magic_item');
    if (hasMagic) magicItemCount++;
    console.log(`  Run ${i + 1}: ${formatCoins(loot.coins)}${hasMagic ? ' + MAGIC ITEM!' : ''}`);
}

console.log(`\nMagic items dropped: ${magicItemCount}/10 (expected: 0 for CR 0-4)\n`);

// ============================================================================
// TEST 2: Quest Combat (No Loot)
// ============================================================================
console.log('───────────────────────────────────────────────────────────');
console.log('TEST 2: Quest Combat (Deferred Loot)');
console.log('───────────────────────────────────────────────────────────\n');

console.log('Scenario: Combat during active quest\n');

const goblins = [
    { name: 'Goblin', cr: '1/4' },
    { name: 'Goblin', cr: '1/4' },
    { name: 'Hobgoblin', cr: '1/2' }
];

// Test the synchronous path in generateLoot's switch statement
// For quest_combat, it returns a special object immediately
async function testQuestCombat() {
    const questCombatLoot = await lootGen.generateLoot(goblins, 'quest_combat');
    console.log(`Loot Type: ${questCombatLoot.lootType}`);
    console.log(`Coins: ${formatCoins(questCombatLoot.coins)}`);
    console.log(`Items: ${questCombatLoot.items?.length || 0}`);
    console.log(`Message: ${questCombatLoot.message || 'N/A'}\n`);
}

// ============================================================================
// TEST 3: Treasure Hoard (Boss Fight)
// ============================================================================
console.log('───────────────────────────────────────────────────────────');
console.log('TEST 3: Treasure Hoard (Boss Fight)');
console.log('───────────────────────────────────────────────────────────\n');

console.log('Scenario: Necromancer (CR 5) boss fight\n');

const necromancer = [{ name: 'Necromancer', cr: '5' }];

console.log('Running 5 simulations...\n');
for (let i = 0; i < 5; i++) {
    const loot = lootGen.generateTreasureHoard(necromancer);
    console.log(`Run ${i + 1}:`);
    console.log(`  Coins: ${formatCoins(loot.coins)}`);
    console.log(`  Items (${loot.items.length}):`);
    loot.items.forEach(item => {
        console.log(`    - ${item.name} (${item.type}${item.value ? `, ${item.value} gp` : ''})`);
    });
    console.log('');
}

// ============================================================================
// TEST 4: Quest Treasure (Quest Completion)
// ============================================================================
console.log('───────────────────────────────────────────────────────────');
console.log('TEST 4: Quest Treasure (Quest Completion)');
console.log('───────────────────────────────────────────────────────────\n');

console.log('Scenario: Completed "Clear the Goblin Camp" quest');
console.log('  - Combat 1: 2 Goblin Scouts (CR 1/4 each) = 0.5 CR');
console.log('  - Combat 2: 3 Goblins + 1 Hobgoblin (0.75 + 0.5) = 1.25 CR');
console.log('  - Combat 3: Bugbear Chief (CR 1) = 1.0 CR');
console.log('  - Total Quest CR: 2.75\n');

const questLoot = lootGen.generateQuestTreasure(2.75, 'Clear the Goblin Camp');
console.log(`Quest: ${questLoot.questName}`);
console.log(`Loot Type: ${questLoot.lootType}`);
console.log(`Coins: ${formatCoins(questLoot.coins)}`);
console.log(`Items (${questLoot.items.length}):`);
questLoot.items.forEach(item => {
    console.log(`  - ${item.name} (${item.type}${item.value ? `, ${item.value} gp` : ''})`);
});
console.log('');

// ============================================================================
// TEST 5: CR Tier Comparison
// ============================================================================
console.log('───────────────────────────────────────────────────────────');
console.log('TEST 5: Treasure Tier Comparison');
console.log('───────────────────────────────────────────────────────────\n');

const tiers = [
    { cr: 2, name: 'CR 0-4 (Goblins)' },
    { cr: 7, name: 'CR 5-10 (Ogre Boss)' },
    { cr: 13, name: 'CR 11-16 (Vampire)' },
    { cr: 20, name: 'CR 17+ (Ancient Dragon)' }
];

for (const tier of tiers) {
    console.log(`${tier.name}:`);
    const enemies = [{ name: 'Enemy', cr: tier.cr }];
    const loot = lootGen.generateTreasureHoard(enemies);
    
    // Calculate total coin value in GP
    const totalGP = 
        (loot.coins.pp || 0) * 10 +
        (loot.coins.gp || 0) +
        (loot.coins.ep || 0) * 0.5 +
        (loot.coins.sp || 0) * 0.1 +
        (loot.coins.cp || 0) * 0.01;
    
    const gemArtValue = loot.items
        .filter(i => i.type === 'gem' || i.type === 'art')
        .reduce((sum, i) => sum + (i.value || 0), 0);
    
    const magicItems = loot.items.filter(i => i.type === 'magic_item');
    
    console.log(`  Coin Value: ~${Math.round(totalGP)} gp`);
    console.log(`  Gem/Art Value: ${gemArtValue} gp`);
    console.log(`  Magic Items: ${magicItems.length} (${magicItems.map(m => m.name).join(', ') || 'None'})`);
    console.log('');
}

// ============================================================================
// TEST 6: Probability Check (Magic Items from Individual Treasure)
// ============================================================================
console.log('───────────────────────────────────────────────────────────');
console.log('TEST 6: Magic Item Probability (1000 simulations)');
console.log('───────────────────────────────────────────────────────────\n');

const testCases = [
    { enemies: [{ cr: 1 }], name: 'CR 0-4', expected: '0%' },
    { enemies: [{ cr: 7 }], name: 'CR 5-10', expected: '~1%' },
    { enemies: [{ cr: 13 }], name: 'CR 11-16', expected: '~1%' },
    { enemies: [{ cr: 20 }], name: 'CR 17+', expected: '~1%' }
];

for (const testCase of testCases) {
    let magicCount = 0;
    const runs = 1000;
    
    for (let i = 0; i < runs; i++) {
        const loot = lootGen.generateIndividualTreasure(testCase.enemies);
        if (loot.items.some(item => item.type === 'magic_item')) {
            magicCount++;
        }
    }
    
    const percentage = ((magicCount / runs) * 100).toFixed(1);
    console.log(`${testCase.name}: ${magicCount}/${runs} (${percentage}%) - Expected: ${testCase.expected}`);
}

// ============================================================================
// Run async tests
// ============================================================================
async function runAsyncTests() {
    console.log('\n───────────────────────────────────────────────────────────');
    console.log('TEST 7: Async generateLoot Function');
    console.log('───────────────────────────────────────────────────────────\n');
    
    // Test random_encounter
    console.log('random_encounter (2 wolves):');
    const randomLoot = await lootGen.generateLoot(wolves, 'random_encounter');
    console.log(`  Type: ${randomLoot.lootType}`);
    console.log(`  Coins: ${formatCoins(randomLoot.coins)}`);
    console.log(`  Magic Items: ${randomLoot.items.filter(i => i.type === 'magic_item').length}\n`);
    
    // Test quest_combat
    console.log('quest_combat (goblins):');
    const questCombatLoot = await lootGen.generateLoot(goblins, 'quest_combat');
    console.log(`  Type: ${questCombatLoot.lootType}`);
    console.log(`  Message: ${questCombatLoot.message}\n`);
    
    // Test boss_fight
    console.log('boss_fight (necromancer):');
    const bossLoot = await lootGen.generateLoot(necromancer, 'boss_fight');
    console.log(`  Type: ${bossLoot.lootType}`);
    console.log(`  Coins: ${formatCoins(bossLoot.coins)}`);
    console.log(`  Items: ${bossLoot.items.length}\n`);
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   TEST SUITE COMPLETE');
    console.log('═══════════════════════════════════════════════════════════\n');
}

runAsyncTests().catch(console.error);
