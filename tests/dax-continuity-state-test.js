const assert = require('assert');
const fs = require('fs');
const path = require('path');

const statePath = path.join(__dirname, '..', 'campaigns', 'dax', 'campaign-state.json');
const combatStatePath = path.join(__dirname, '..', 'campaigns', 'dax', 'combat-state.json');
const serverPath = path.join(__dirname, '..', 'complete-intelligent-server.js');
const combatManagerPath = path.join(__dirname, '..', 'combat-manager.js');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const combatState = JSON.parse(fs.readFileSync(combatStatePath, 'utf8'));
const serverSource = fs.readFileSync(serverPath, 'utf8');
const combatManagerSource = fs.readFileSync(combatManagerPath, 'utf8');

assert.strictEqual(state.current_scene?.scene_id, 47, 'Dax should remain anchored to scene 47');
assert.match(
    state.current_scene?.situation || '',
    /Sub-Level 4 Weyland relay node/i,
    'Current scene should reflect the selected relay-node lead'
);

const activeQuestIds = new Set((state.quests?.active || []).map(quest => quest.id));
[
    'weyland-relay-node',
    'sector-9-pharma-bay',
    'kellerman-liaison-office',
    'ardent-preflight',
    'okafor-recruitment',
    'project-lachesis'
].forEach(id => {
    assert(activeQuestIds.has(id), `Missing active quest: ${id}`);
});

assert.strictEqual(state.combat?.active, false, 'Dax should not have active tactical combat');
assert.strictEqual(state.combat?.pending, false, 'Dax should not have pending tactical combat');
assert.deepStrictEqual(state.combat?.rollQueue, [], 'Dax should not have stale pending roll requests');
assert.deepStrictEqual(state.combat?.enemyInitiatives, [], 'Dax should not retain old Osprey initiative data');
assert.strictEqual(combatState.active, false, 'Persisted combat-state should not have active tactical combat');
assert.strictEqual(combatState.pending, false, 'Persisted combat-state should not have pending tactical combat');
assert.deepStrictEqual(combatState.rollQueue, [], 'Persisted combat-state should not resurrect stale rolls on save');
assert.deepStrictEqual(combatState.enemyInitiatives, [], 'Persisted combat-state should not retain old Osprey initiatives');

const daxInventory = state.characters?.dax?.inventory || [];
assert(daxInventory.length > 0, 'Dax inventory should not be empty');
daxInventory.forEach((item, index) => {
    assert.strictEqual(typeof item, 'object', `Inventory item ${index} should be structured`);
    assert(item.name, `Inventory item ${index} should have a name`);
});

assert(state.key_npcs?.holbrook, 'Holbrook should be in key_npcs');
assert(state.key_npcs?.vance, 'Vance should be in key_npcs');
assert(state.relationship_beats?.dax_chen, 'Dax/Chen relationship beat should be tracked');
assert.strictEqual(state.ship?.crew_stations?.helm, 'Dax Stargazer', 'Dax should be assigned to helm');
assert.strictEqual(state.ship?.crew_stations?.engineering, 'Chen', 'Chen should be assigned to engineering');
assert.strictEqual(state.ship?.crew_stations?.sensors, 'Dr. Yuen', 'Yuen should be assigned to sensors/science');
assert(
    serverSource.includes('DAX ACTIVE QUEST LEDGER') &&
    serverSource.includes('DAX CHARACTER CONTINUITY') &&
    serverSource.includes('DAX PRIORITY NPC ROLES'),
    'Prompt builder should inject Dax quest, relationship, and priority NPC anchors'
);
assert(
    serverSource.includes("mode === 'continue'") &&
    serverSource.includes('skipping synthetic player history entry') &&
    serverSource.includes("processPlayerAction(continueAction, 'continue-session', 'continue')"),
    'Continue endpoint should not persist the synthetic system prompt as a player message'
);
[
    'getCampaignEntityPatterns',
    'titan station',
    'sub-level 4',
    'project lachesis',
    'weyland encrypted data packet',
    'zara okafor'
].forEach(needle => {
    assert(serverSource.includes(needle), `Dax entity extraction should include ${needle}`);
});
assert(serverSource.includes('async function atomicWriteFile'), 'Server should define atomicWriteFile');
[
    'atomicWriteFile(\n                this.paths.conversationHistory',
    'atomicWriteFile(this.paths.conversationHistory',
    'atomicWriteFile(\n                this.paths.campaignState',
    'atomicWriteFile(\n                    this.paths.campaignState',
    'atomicWriteFile(\n            context.paths.conversationHistory'
].forEach(needle => {
    assert(serverSource.includes(needle), `Server persistence should use atomic write for ${needle}`);
});
assert(combatManagerSource.includes('async function atomicWriteFile'), 'Combat manager should define atomicWriteFile');
assert(
    combatManagerSource.includes('atomicWriteFile(combatFile, JSON.stringify(combatState, null, 2))'),
    'Combat state persistence should use atomic writes'
);
assert(
    combatManagerSource.includes('const hasRollQueue = Array.isArray(combatState.rollQueue) && combatState.rollQueue.length > 0') &&
    combatManagerSource.includes('if (combatState.active || hasRollQueue)'),
    'Inactive combat states with queued rolls should remain addressable by roll-queue routes'
);
assert(
    serverSource.includes("Save already in progress, waiting") &&
    !serverSource.includes('Save still in progress after wait, skipping'),
    'Concurrent history saves should wait instead of silently skipping'
);
[
    "app.post(['/api/dnd/backup', '/dnd-api/dnd/backup']",
    "path.join('.', 'backups', activeCampaignId",
    "context.paths.campaignState",
    "context.paths.conversationHistory",
    "combat-state.json",
    "manifest.json"
].forEach(needle => {
    assert(serverSource.includes(needle), `Backup endpoint should be campaign scoped and manifest-backed: ${needle}`);
});
assert(
    serverSource.includes('async rebuildStateFromHistory(retainedHistory = null)') &&
    serverSource.includes('await context.rollbackStateChanges(removedEntries, rolledBackHistory)'),
    'Rollback rebuild should use the exact trimmed history, not reread stale pre-rollback history'
);
assert(
    serverSource.indexOf('JSON.stringify(rolledBackHistory, null, 2)') <
    serverSource.indexOf('await context.rollbackStateChanges(removedEntries, rolledBackHistory)'),
    'Rollback should write trimmed history before rebuilding state'
);
assert(
    serverSource.includes('STRUCTURED ROLL QUEUE') &&
    serverSource.includes('authoritative roll results') &&
    serverSource.includes('Do not ask the player to reroll a completed queue entry'),
    'Prompt builder should expose structured roll queue results to the DM'
);
assert(
    serverSource.includes('const hasAddressableCombatState = combatState && typeof combatState ===') &&
    serverSource.includes('await combatManager.loadCombatState(campaignId)'),
    'Roll queue routes should reload persisted inactive combat state instead of trusting empty defaults'
);
assert(
    serverSource.includes('Crew Stations:') &&
    serverSource.includes('Use station assignments to frame ship checks'),
    'DM prompt should include ship crew stations as gameplay anchors'
);

console.log('✅ Dax continuity state is anchored and structured.');
