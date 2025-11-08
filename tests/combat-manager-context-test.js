const fs = require('fs');
const os = require('os');
const path = require('path');

const CombatManager = require('../combat-manager');

async function run() {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'combat-manager-test-'));
    const campaignId = 'test-campaign';
    const campaignDir = path.join(tmpRoot, campaignId);
    fs.mkdirSync(campaignDir);

    const combatManager = new CombatManager(tmpRoot);

    const handoffData = {
        context: {
            reason: 'Riven intercepts cultists beneath the chapel.',
            location: 'Thornhaven catacombs'
        },
        participants: {
            players: [
                {
                    name: 'Kira',
                    id: 'kira',
                    initiative: 18,
                    ac: 13,
                    hp: { current: 18, max: 18 }
                },
                {
                    name: 'Riven',
                    id: 'riven',
                    initiative: 17,
                    ac: 15,
                    hp: { current: 20, max: 20 }
                }
            ],
            enemies: [
                {
                    name: 'Cult Fanatic',
                    id: 'cult-fanatic-1',
                    initiative: 16,
                    ac: 12,
                    hp: { current: 22, max: 22 }
                }
            ]
        }
    };

    try {
        await combatManager.startCombat(campaignId, handoffData);
        console.log('✅ CombatManager.startCombat accepted structured context without errors.');
    } catch (error) {
        console.error('❌ CombatManager.startCombat threw an error:', error);
        process.exitCode = 1;
    }
}

run();
