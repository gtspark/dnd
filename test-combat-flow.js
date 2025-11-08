#!/usr/bin/env node
/**
 * Combat Flow Test Harness
 *
 * Tests the complete combat flow:
 * 1. Narrative action that triggers combat
 * 2. Combat start with hand-off data
 * 3. Combat actions during turns
 * 4. Combat state transitions
 * 5. State file persistence
 *
 * Usage:
 *   node test-combat-flow.js                    # Run full test suite
 *   node test-combat-flow.js --action           # Test narrative action only
 *   node test-combat-flow.js --combat-start     # Test combat start only
 *   node test-combat-flow.js --combat-action    # Test combat action only
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'http://localhost:3003';
const CAMPAIGN_ID = 'test-silverpeak';

// Test configuration
const config = {
    campaignId: CAMPAIGN_ID,
    character: 'Thorne',
    verbose: process.argv.includes('--verbose') || process.argv.includes('-v')
};

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function httpRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const payload = data ? JSON.stringify(data) : null;
        const opts = { ...options };
        opts.headers = { ...(options.headers || {}) };
        if (payload) {
            opts.headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = http.request(opts, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    if (config.verbose) {
                        log(`${options.method || 'GET'} ${options.path} → ${res.statusCode}`, 'gray');
                    }
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body ? JSON.parse(body) : null
                    });
                } catch (e) {
                    if (config.verbose) {
                        log(`${options.method || 'GET'} ${options.path} → ${res.statusCode} (non-JSON)`, 'gray');
                    }
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body
                    });
                }
            });
        });

        req.on('error', reject);

        if (payload) {
            req.write(payload);
        }

        req.end();
    });
}

async function testNarrativeAction() {
    log('\n📖 TEST: Narrative Action Endpoint', 'bright');
    log('═'.repeat(60), 'gray');

    const payload = {
        action: 'I draw my sword and prepare for combat',
        character: config.character,
        campaignId: config.campaignId,
        mode: 'IC'
    };

    const options = {
        hostname: 'localhost',
        port: 3003,
        path: '/dnd-api/dnd/action',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-campaign': config.campaignId
        }
    };

    try {
        const start = Date.now();
        const response = await httpRequest(options, payload);
        const duration = Date.now() - start;

        if (response.statusCode === 200) {
            log(`✅ Status: ${response.statusCode} (${duration}ms)`, 'green');

            if (config.verbose && response.body) {
                log('\nResponse:', 'cyan');
                log(JSON.stringify(response.body, null, 2), 'gray');
            } else if (response.body?.narrative) {
                log(`📝 Narrative preview: ${response.body.narrative.substring(0, 100)}...`, 'gray');
            }

            return { success: true, data: response.body };
        } else {
            log(`❌ Status: ${response.statusCode}`, 'red');
            log(`Error: ${JSON.stringify(response.body)}`, 'red');
            return { success: false, error: response.body };
        }
    } catch (error) {
        log(`❌ Request failed: ${error.message}`, 'red');
        return { success: false, error: error.message };
    }
}

async function testCombatStart() {
    log('\n⚔️  TEST: Combat Start Endpoint', 'bright');
    log('═'.repeat(60), 'gray');

    // Simulate hand-off data from narrative
    const handoffData = {
        initiativeOrder: [
            { name: 'Thorne', initiative: 18, isPlayer: true },
            { name: 'Cult Fanatic', initiative: 15, isPlayer: false },
            { name: 'Riven', initiative: 12, isPlayer: true },
            { name: 'Cultist 2', initiative: 11, isPlayer: false },
            { name: 'Cultist 1', initiative: 9, isPlayer: false },
            { name: 'Kira', initiative: 8, isPlayer: true }
        ],
        enemies: [
            { name: 'Cult Fanatic', hp: 22, ac: 13 },
            { name: 'Cultist 1', hp: 9, ac: 12 },
            { name: 'Cultist 2', hp: 9, ac: 12 }
        ],
        context: 'The cultists ambush the party in the Laughing Griffin tavern!'
    };

    const options = {
        hostname: 'localhost',
        port: 3003,
        path: '/dnd-api/dnd/combat/start',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-campaign': config.campaignId
        }
    };

    try {
        const start = Date.now();
        const response = await httpRequest(options, handoffData);
        const duration = Date.now() - start;

        if (response.statusCode === 200) {
            log(`✅ Status: ${response.statusCode} (${duration}ms)`, 'green');

            if (response.body?.combatState) {
                const state = response.body.combatState;
                log(`📊 Combat State:`, 'cyan');
                log(`   Active: ${state.active}`, 'gray');
                log(`   Round: ${state.round}`, 'gray');
                log(`   Initiative Order: ${state.initiativeOrder?.length || 0} combatants`, 'gray');
                log(`   Current Turn: ${state.currentTurnName || 'N/A'}`, 'gray');
            }

            if (config.verbose) {
                log('\nFull Response:', 'cyan');
                log(JSON.stringify(response.body, null, 2), 'gray');
            }

            return { success: true, data: response.body };
        } else {
            log(`❌ Status: ${response.statusCode}`, 'red');
            log(`Error: ${JSON.stringify(response.body)}`, 'red');
            return { success: false, error: response.body };
        }
    } catch (error) {
        log(`❌ Request failed: ${error.message}`, 'red');
        return { success: false, error: error.message };
    }
}

async function testCombatAction() {
    log('\n🎯 TEST: Combat Action Endpoint', 'bright');
    log('═'.repeat(60), 'gray');

    const payload = {
        action: 'I attack the Cult Fanatic with my longsword',
        character: config.character
    };

    const options = {
        hostname: 'localhost',
        port: 3003,
        path: '/dnd-api/dnd/combat/action',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-campaign': config.campaignId
        }
    };

    try {
        const start = Date.now();
        const response = await httpRequest(options, payload);
        const duration = Date.now() - start;

        if (response.statusCode === 200) {
            log(`✅ Status: ${response.statusCode} (${duration}ms)`, 'green');

            if (response.body?.narrative) {
                log(`📝 Narrative preview: ${response.body.narrative.substring(0, 100)}...`, 'gray');
            }

            if (response.body?.combatState) {
                const state = response.body.combatState;
                log(`📊 Round: ${state.round}, Turn: ${state.currentTurnName || 'N/A'}`, 'gray');
            }

            if (config.verbose) {
                log('\nFull Response:', 'cyan');
                log(JSON.stringify(response.body, null, 2), 'gray');
            }

            return { success: true, data: response.body };
        } else {
            log(`❌ Status: ${response.statusCode}`, 'red');
            log(`Error: ${JSON.stringify(response.body)}`, 'red');
            return { success: false, error: response.body };
        }
    } catch (error) {
        log(`❌ Request failed: ${error.message}`, 'red');
        return { success: false, error: error.message };
    }
}

async function testRollQueueLifecycle() {
    log('\n🎲 TEST: Roll Queue Lifecycle', 'bright');
    log('═'.repeat(60), 'gray');

    const createPayload = {
        campaignId: config.campaignId,
        reason: 'Dexterity save vs. collapsing ceiling',
        ability: 'dex',
        dc: 14,
        advantage: 'normal',
        participants: [
            {
                participantId: 'kira',
                name: 'Kira Moonwhisper',
                entityType: 'player',
                ability: 'dex'
            }
        ]
    };

    const createOptions = {
        hostname: 'localhost',
        port: 3003,
        path: '/dnd-api/dnd/roll-queue',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-campaign': config.campaignId
        }
    };

    let queueId = null;
    let participantId = createPayload.participants[0].participantId;

    try {
        const createResponse = await httpRequest(createOptions, createPayload);
        if (createResponse.statusCode !== 200) {
            log(`❌ Failed to create roll queue entry: ${createResponse.statusCode}`, 'red');
            log(JSON.stringify(createResponse.body, null, 2), 'red');
            return { success: false, error: createResponse.body };
        }

        queueId = createResponse.body?.entry?.queueId;
        if (!queueId) {
            log('❌ Roll queue entry missing queueId', 'red');
            return { success: false, error: 'Missing queueId' };
        }

        log(`✅ Created roll queue entry ${queueId}`, 'green');

        const fetchOptions = {
            hostname: 'localhost',
            port: 3003,
            path: `/dnd-api/dnd/roll-queue?campaign=${config.campaignId}`,
            method: 'GET',
            headers: {
                'x-campaign': config.campaignId
            }
        };

        const fetchResponse = await httpRequest(fetchOptions);
        if (fetchResponse.statusCode !== 200) {
            log(`❌ Failed to fetch roll queue: ${fetchResponse.statusCode}`, 'red');
            return { success: false, error: fetchResponse.body };
        }

        const queue = fetchResponse.body?.rollQueue || [];
        const entryFound = queue.find(entry => entry.queueId === queueId);

        if (!entryFound) {
            log('❌ Newly created roll queue entry not found', 'red');
            return { success: false, error: 'Entry not found' };
        }

        log(`🔎 Queue contains ${queue.length} entries`, 'gray');

        const resolveOptions = {
            hostname: 'localhost',
            port: 3003,
            path: `/dnd-api/dnd/roll-queue/${queueId}/resolve`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-campaign': config.campaignId
            }
        };

        const resolvePayload = {
            campaignId: config.campaignId,
            participantId,
            total: 18,
            natural: 15,
            modifier: 3,
            notation: '1d20+3',
            auto: true,
            submittedBy: 'test-harness',
            metadata: {
                ability: 'dex',
                source: 'test-suite'
            }
        };

        const resolveResponse = await httpRequest(resolveOptions, resolvePayload);
        if (resolveResponse.statusCode !== 200) {
            log(`❌ Failed to resolve roll queue entry: ${resolveResponse.statusCode}`, 'red');
            log(JSON.stringify(resolveResponse.body, null, 2), 'red');
            return { success: false, error: resolveResponse.body };
        }

        log(`✅ Resolved participant ${participantId}`, 'green');

        const deleteOptions = {
            hostname: 'localhost',
            port: 3003,
            path: `/dnd-api/dnd/roll-queue/${queueId}`,
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'x-campaign': config.campaignId
            }
        };

        const deleteResponse = await httpRequest(deleteOptions, { campaignId: config.campaignId });
        if (deleteResponse.statusCode !== 200) {
            log(`❌ Failed to delete roll queue entry: ${deleteResponse.statusCode}`, 'red');
            if (config.verbose) {
                log(JSON.stringify(deleteResponse.body, null, 2), 'red');
            }
            return { success: false, error: deleteResponse.body };
        }

        log(`✅ Deleted roll queue entry ${queueId}`, 'green');
        return { success: true };
    } catch (error) {
        log(`❌ Roll queue lifecycle error: ${error.message}`, 'red');
        return { success: false, error: error.message };
    }
}

async function verifyCombatState() {
    log('\n🔍 TEST: Combat State Persistence', 'bright');
    log('═'.repeat(60), 'gray');

    const campaignDir = path.join(__dirname, 'campaigns', config.campaignId);
    const combatStateFile = path.join(campaignDir, 'combat-state.json');
    const campaignStateFile = path.join(campaignDir, 'campaign-state.json');

    try {
        // Check combat-state.json
        const combatStateRaw = await fs.readFile(combatStateFile, 'utf8');
        const combatState = JSON.parse(combatStateRaw);

        log(`✅ combat-state.json exists`, 'green');
        log(`   Active: ${combatState.active}`, 'gray');
        log(`   Round: ${combatState.round || 0}`, 'gray');
        log(`   Participants: ${combatState.initiativeOrder?.length || 0}`, 'gray');

        // Check campaign-state.json
        const campaignStateRaw = await fs.readFile(campaignStateFile, 'utf8');
        const campaignState = JSON.parse(campaignStateRaw);

        log(`✅ campaign-state.json exists`, 'green');
        if (campaignState.combat) {
            log(`   Combat.active: ${campaignState.combat.active}`, 'gray');
        }

        // Verify sync
        if (combatState.active === campaignState.combat?.active) {
            log(`✅ State files in sync`, 'green');
        } else {
            log(`⚠️  State files out of sync!`, 'yellow');
        }

        return { success: true };
    } catch (error) {
        log(`❌ State verification failed: ${error.message}`, 'red');
        return { success: false, error: error.message };
    }
}

async function runFullSuite() {
    log('\n' + '═'.repeat(60), 'bright');
    log('🧪 COMBAT FLOW TEST SUITE', 'bright');
    log('═'.repeat(60) + '\n', 'bright');

    const results = {
        narrativeAction: null,
        combatStart: null,
        combatAction: null,
        rollQueue: null,
        stateVerification: null
    };

    // Test 1: Narrative Action
    results.narrativeAction = await testNarrativeAction();

    // Test 2: Combat Start
    results.combatStart = await testCombatStart();

    // Test 3: Combat Action (only if combat started successfully)
    if (results.combatStart.success) {
        results.combatAction = await testCombatAction();
    } else {
        log('\n⏭️  Skipping combat action test (combat start failed)', 'yellow');
    }

    // Test 4: Roll Queue Lifecycle
    results.rollQueue = await testRollQueueLifecycle();

    // Test 4: State Verification
    results.stateVerification = await verifyCombatState();

    // Summary
    log('\n' + '═'.repeat(60), 'bright');
    log('📊 TEST SUMMARY', 'bright');
    log('═'.repeat(60), 'gray');

    const tests = [
        ['Narrative Action', results.narrativeAction],
        ['Combat Start', results.combatStart],
        ['Combat Action', results.combatAction],
        ['Roll Queue', results.rollQueue],
        ['State Persistence', results.stateVerification]
    ];

    let passed = 0;
    let failed = 0;

    tests.forEach(([name, result]) => {
        if (result === null) {
            log(`⏭️  ${name}: Skipped`, 'gray');
        } else if (result.success) {
            log(`✅ ${name}: PASS`, 'green');
            passed++;
        } else {
            log(`❌ ${name}: FAIL`, 'red');
            failed++;
        }
    });

    log('', 'reset');
    log(`Total: ${passed} passed, ${failed} failed\n`, passed === tests.length ? 'green' : 'red');

    return passed === tests.length;
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--action')) {
        await testNarrativeAction();
    } else if (args.includes('--combat-start')) {
        await testCombatStart();
    } else if (args.includes('--combat-action')) {
        await testCombatAction();
    } else if (args.includes('--roll-queue')) {
        await testRollQueueLifecycle();
    } else if (args.includes('--verify')) {
        await verifyCombatState();
    } else if (args.includes('--help') || args.includes('-h')) {
        log('\nCombat Flow Test Harness\n', 'bright');
        log('Usage:', 'cyan');
        log('  node test-combat-flow.js                    Run full test suite', 'gray');
        log('  node test-combat-flow.js --action           Test narrative action', 'gray');
        log('  node test-combat-flow.js --combat-start     Test combat start', 'gray');
        log('  node test-combat-flow.js --combat-action    Test combat action', 'gray');
        log('  node test-combat-flow.js --roll-queue       Test roll queue lifecycle', 'gray');
        log('  node test-combat-flow.js --verify           Verify state files', 'gray');
        log('  node test-combat-flow.js --verbose          Show full responses', 'gray');
        log('');
    } else {
        const success = await runFullSuite();
        process.exit(success ? 0 : 1);
    }
}

main().catch(error => {
    log(`\n❌ Unexpected error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
