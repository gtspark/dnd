#!/usr/bin/env node
/**
 * Reset Combat State - Emergency tool to clear stuck combat
 * Usage: node reset-combat.js [campaign-id]
 */

const fs = require('fs').promises;
const path = require('path');

async function resetCombat(campaignId = 'test-silverpeak') {
    console.log(`🔧 Resetting combat for campaign: ${campaignId}`);

    const campaignDir = path.join(__dirname, 'campaigns', campaignId);
    const combatStateFile = path.join(campaignDir, 'combat-state.json');
    const campaignStateFile = path.join(campaignDir, 'campaign-state.json');

    // Reset combat-state.json
    try {
        const inactiveCombatState = {
            active: false,
            round: 0,
            currentTurn: 0,
            initiativeOrder: [],
            participants: { players: [], enemies: [] },
            actionEconomy: {},
            conditions: {},
            conversationHistory: []
        };

        await fs.writeFile(combatStateFile, JSON.stringify(inactiveCombatState, null, 2));
        console.log('✅ Reset combat-state.json');
    } catch (error) {
        console.log('⚠️  combat-state.json not found or could not be reset:', error.message);
    }

    // Reset combat flag in campaign-state.json
    try {
        const campaignStateRaw = await fs.readFile(campaignStateFile, 'utf8');
        const campaignState = JSON.parse(campaignStateRaw);

        if (campaignState.combat) {
            campaignState.combat.active = false;
            campaignState.combat.turnOrder = [];
            campaignState.combat.currentTurn = 0;

            await fs.writeFile(campaignStateFile, JSON.stringify(campaignState, null, 2));
            console.log('✅ Reset combat flag in campaign-state.json');
        } else {
            console.log('ℹ️  No combat section in campaign-state.json');
        }
    } catch (error) {
        console.error('❌ Failed to reset campaign-state.json:', error.message);
        process.exit(1);
    }

    console.log('✅ Combat reset complete! Restart PM2 process if needed.');
}

const campaignId = process.argv[2] || 'test-silverpeak';
resetCombat(campaignId).catch(error => {
    console.error('❌ Reset failed:', error);
    process.exit(1);
});
