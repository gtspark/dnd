/**
 * State Machine Integration Tests
 * Tests keyword detection, state transitions, and AI tool integration
 */

const { CombatStateMachine, STATE, TRIGGER_KEYWORDS } = require('./combat-state-machine');
const { detectTransition, getTransitionKeywords } = require('./keyword-transition-detector');

// Test counters
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`Expected "${expected}" but got "${actual}". ${message}`);
    }
}

function assertIncludes(array, value, message = '') {
    if (!array.includes(value)) {
        throw new Error(`Expected array to include "${value}". ${message}`);
    }
}

function assertNotNull(value, message = '') {
    if (value === null || value === undefined) {
        throw new Error(`Expected value to be non-null. ${message}`);
    }
}

function assertNull(value, message = '') {
    if (value !== null) {
        throw new Error(`Expected null but got "${JSON.stringify(value)}". ${message}`);
    }
}

console.log('\n========================================');
console.log('COMBAT STATE MACHINE TESTS');
console.log('========================================\n');

// ==================== STATE MACHINE UNIT TESTS ====================
console.log('--- State Machine Unit Tests ---\n');

test('STATE constants are defined correctly', () => {
    assertEqual(STATE.IDLE, 'IDLE');
    assertEqual(STATE.COMBAT_PENDING, 'COMBAT_PENDING');
    assertEqual(STATE.COMBAT_ACTIVE, 'COMBAT_ACTIVE');
    assertEqual(STATE.COMBAT_PAUSED, 'COMBAT_PAUSED');
    assertEqual(STATE.COMBAT_ENDED, 'COMBAT_ENDED');
});

test('CombatStateMachine initializes to IDLE', () => {
    const sm = new CombatStateMachine();
    assertEqual(sm.getCurrentState(), 'IDLE');
});

test('canTransition returns true for valid IDLE → COMBAT_PENDING', () => {
    const sm = new CombatStateMachine();
    assertEqual(sm.canTransition(STATE.COMBAT_PENDING), true);
});

test('canTransition returns false for invalid IDLE → COMBAT_ACTIVE', () => {
    const sm = new CombatStateMachine();
    assertEqual(sm.canTransition(STATE.COMBAT_ACTIVE), false);
});

test('transition IDLE → COMBAT_PENDING succeeds', () => {
    const sm = new CombatStateMachine();
    const record = sm.transition(STATE.COMBAT_PENDING, { trigger: 'ai_start_combat' });
    assertEqual(sm.getCurrentState(), 'COMBAT_PENDING');
    assertEqual(record.fromState, 'IDLE');
    assertEqual(record.toState, 'COMBAT_PENDING');
});

test('transition COMBAT_PENDING → COMBAT_ACTIVE succeeds', () => {
    const sm = new CombatStateMachine();
    sm.transition(STATE.COMBAT_PENDING, { trigger: 'ai_start_combat' });
    const record = sm.transition(STATE.COMBAT_ACTIVE, { initiative: [1, 2, 3] });
    assertEqual(sm.getCurrentState(), 'COMBAT_ACTIVE');
});

test('transition COMBAT_ACTIVE → COMBAT_PAUSED succeeds', () => {
    const sm = new CombatStateMachine();
    sm.transition(STATE.COMBAT_PENDING, { trigger: 'ai_start_combat' });
    sm.transition(STATE.COMBAT_ACTIVE, { initiative: [1, 2, 3] });
    sm.transition(STATE.COMBAT_PAUSED, { trigger: 'pause' });
    assertEqual(sm.getCurrentState(), 'COMBAT_PAUSED');
});

test('transition COMBAT_PAUSED → COMBAT_ACTIVE succeeds (resume)', () => {
    const sm = new CombatStateMachine();
    sm.transition(STATE.COMBAT_PENDING, { trigger: 'ai_start_combat' });
    sm.transition(STATE.COMBAT_ACTIVE, { initiative: [1, 2, 3] });
    sm.transition(STATE.COMBAT_PAUSED, { trigger: 'pause' });
    sm.transition(STATE.COMBAT_ACTIVE, { trigger: 'resume' });
    assertEqual(sm.getCurrentState(), 'COMBAT_ACTIVE');
});

test('transition COMBAT_ACTIVE → COMBAT_ENDED succeeds', () => {
    const sm = new CombatStateMachine();
    sm.transition(STATE.COMBAT_PENDING, { trigger: 'ai_start_combat' });
    sm.transition(STATE.COMBAT_ACTIVE, { initiative: [1, 2, 3] });
    sm.transition(STATE.COMBAT_ENDED, { reason: 'enemies_defeated' });
    assertEqual(sm.getCurrentState(), 'COMBAT_ENDED');
});

test('transition COMBAT_ENDED → IDLE succeeds', () => {
    const sm = new CombatStateMachine();
    sm.transition(STATE.COMBAT_PENDING, { trigger: 'ai_start_combat' });
    sm.transition(STATE.COMBAT_ACTIVE, { initiative: [1, 2, 3] });
    sm.transition(STATE.COMBAT_ENDED, { reason: 'enemies_defeated' });
    sm.transition(STATE.IDLE, {});
    assertEqual(sm.getCurrentState(), 'IDLE');
});

test('invalid transition throws error', () => {
    const sm = new CombatStateMachine();
    try {
        sm.transition(STATE.COMBAT_ENDED, { reason: 'enemies_defeated' });
        throw new Error('Should have thrown');
    } catch (e) {
        assertIncludes(e.message, 'Invalid transition');
    }
});

test('reset() returns state machine to IDLE', () => {
    const sm = new CombatStateMachine();
    sm.transition(STATE.COMBAT_PENDING, { trigger: 'ai_start_combat' });
    sm.transition(STATE.COMBAT_ACTIVE, { initiative: [1, 2, 3] });
    sm.reset();
    assertEqual(sm.getCurrentState(), 'IDLE');
    assertEqual(sm.getTransitionHistory().length, 0);
});

test('transition history is tracked', () => {
    const sm = new CombatStateMachine();
    sm.transition(STATE.COMBAT_PENDING, { trigger: 'ai_start_combat' });
    sm.transition(STATE.COMBAT_ACTIVE, { initiative: [1, 2, 3] });
    const history = sm.getTransitionHistory();
    assertEqual(history.length, 2);
    assertEqual(history[0].fromState, 'IDLE');
    assertEqual(history[0].toState, 'COMBAT_PENDING');
    assertEqual(history[1].fromState, 'COMBAT_PENDING');
    assertEqual(history[1].toState, 'COMBAT_ACTIVE');
});

// ==================== KEYWORD DETECTOR TESTS ====================
console.log('\n--- Keyword Transition Detector Tests ---\n');

test('detectTransition finds "roll for initiative" from IDLE', () => {
    const result = detectTransition('The goblin snarls. Roll for initiative!', 'IDLE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_PENDING');
    assertIncludes(result.keyword.toLowerCase(), 'roll');
});

test('detectTransition finds "combat begins" from IDLE', () => {
    const result = detectTransition('Combat begins as the orcs charge!', 'IDLE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_PENDING');
});

test('detectTransition finds "draws weapon" from IDLE', () => {
    const result = detectTransition('The bandit draws his weapon menacingly.', 'IDLE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_PENDING');
});

test('detectTransition finds "attack" from IDLE', () => {
    const result = detectTransition('The wolf attacks without warning!', 'IDLE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_PENDING');
});

test('detectTransition finds "pause" from COMBAT_ACTIVE', () => {
    const result = detectTransition('Wait! Let us pause and talk this through.', 'COMBAT_ACTIVE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_PAUSED');
});

test('detectTransition finds "parley" from COMBAT_ACTIVE', () => {
    const result = detectTransition('I call for parley!', 'COMBAT_ACTIVE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_PAUSED');
});

test('detectTransition finds "stop fighting" from COMBAT_ACTIVE', () => {
    const result = detectTransition('Everyone stop fighting! We need to negotiate.', 'COMBAT_ACTIVE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_PAUSED');
});

test('detectTransition finds "resume" from COMBAT_PAUSED', () => {
    const result = detectTransition('Enough talk. Resume the battle!', 'COMBAT_PAUSED');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_ACTIVE');
});

test('detectTransition finds "back to fighting" from COMBAT_PAUSED', () => {
    const result = detectTransition('Get back to fighting!', 'COMBAT_PAUSED');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_ACTIVE');
});

test('detectTransition finds "flees" from COMBAT_ACTIVE', () => {
    const result = detectTransition('The goblin flees into the darkness!', 'COMBAT_ACTIVE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_ENDED');
});

test('detectTransition finds "surrenders" from COMBAT_ACTIVE', () => {
    const result = detectTransition('The bandit surrenders, dropping his weapon.', 'COMBAT_ACTIVE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_ENDED');
});

test('detectTransition finds "victory" from COMBAT_ACTIVE', () => {
    const result = detectTransition('Victory! All enemies are defeated.', 'COMBAT_ACTIVE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_ENDED');
});

test('detectTransition finds "defeated" from COMBAT_ACTIVE', () => {
    const result = detectTransition('The last orc is defeated!', 'COMBAT_ACTIVE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_ENDED');
});

test('detectTransition finds "we flee" from COMBAT_ACTIVE', () => {
    const result = detectTransition('This is too dangerous. We flee!', 'COMBAT_ACTIVE');
    assertNotNull(result);
    assertEqual(result.targetState, 'COMBAT_ENDED');
});

test('detectTransition returns null for non-matching text', () => {
    const result = detectTransition('The wizard examines the ancient tome.', 'IDLE');
    assertNull(result);
});

test('detectTransition returns null for wrong state', () => {
    // "pause" should not work from IDLE state
    const result = detectTransition('Pause the game please.', 'IDLE');
    assertNull(result);
});

test('detectTransition returns null for empty input', () => {
    const result = detectTransition('', 'IDLE');
    assertNull(result);
});

test('detectTransition returns null for null input', () => {
    const result = detectTransition(null, 'IDLE');
    assertNull(result);
});

test('getTransitionKeywords returns patterns for COMBAT_PENDING', () => {
    const keywords = getTransitionKeywords('COMBAT_PENDING');
    assertEqual(keywords.length > 0, true);
    assertEqual(keywords[0].targetState, 'COMBAT_PENDING');
});

// ==================== INTEGRATION TESTS ====================
console.log('\n--- Integration Tests ---\n');

test('Full combat flow: IDLE → PENDING → ACTIVE → PAUSED → ACTIVE → ENDED → IDLE', () => {
    const sm = new CombatStateMachine();
    
    // Start combat
    assertEqual(sm.getCurrentState(), 'IDLE');
    sm.transition(STATE.COMBAT_PENDING, { trigger: 'draw weapon' });
    assertEqual(sm.getCurrentState(), 'COMBAT_PENDING');
    
    // Initiative rolled
    sm.transition(STATE.COMBAT_ACTIVE, { initiative: [20, 15, 10] });
    assertEqual(sm.getCurrentState(), 'COMBAT_ACTIVE');
    
    // Pause for roleplay
    sm.transition(STATE.COMBAT_PAUSED, { trigger: 'parley' });
    assertEqual(sm.getCurrentState(), 'COMBAT_PAUSED');
    
    // Resume fighting
    sm.transition(STATE.COMBAT_ACTIVE, { trigger: 'resume' });
    assertEqual(sm.getCurrentState(), 'COMBAT_ACTIVE');
    
    // Victory
    sm.transition(STATE.COMBAT_ENDED, { reason: 'enemies_defeated' });
    assertEqual(sm.getCurrentState(), 'COMBAT_ENDED');
    
    // Back to exploration
    sm.transition(STATE.IDLE, {});
    assertEqual(sm.getCurrentState(), 'IDLE');
    
    // Verify full history
    assertEqual(sm.getTransitionHistory().length, 6);
});

test('Keyword detection feeds into state machine correctly', () => {
    const sm = new CombatStateMachine();
    
    // Simulate narrative text triggering combat
    const text1 = "The goblin draws a weapon and snarls!";
    const detection1 = detectTransition(text1, sm.getCurrentState());
    assertNotNull(detection1);
    
    sm.transition(detection1.targetState, { trigger: detection1.keyword });
    assertEqual(sm.getCurrentState(), 'COMBAT_PENDING');
    
    // Move to active (simulate initiative rolled)
    sm.transition(STATE.COMBAT_ACTIVE, { initiative: [18, 12, 8] });
    
    // Simulate pause request
    const text2 = "Wait! I want to parley with them!";
    const detection2 = detectTransition(text2, sm.getCurrentState());
    assertNotNull(detection2);
    
    sm.transition(detection2.targetState, { trigger: detection2.keyword });
    assertEqual(sm.getCurrentState(), 'COMBAT_PAUSED');
    
    // Resume
    const text3 = "Negotiations failed. Resume combat!";
    const detection3 = detectTransition(text3, sm.getCurrentState());
    assertNotNull(detection3);
    
    sm.transition(detection3.targetState, { trigger: detection3.keyword });
    assertEqual(sm.getCurrentState(), 'COMBAT_ACTIVE');
    
    // Victory
    const text4 = "The last enemy is defeated!";
    const detection4 = detectTransition(text4, sm.getCurrentState());
    assertNotNull(detection4);
    
    sm.transition(detection4.targetState, { reason: 'enemies_defeated' });
    assertEqual(sm.getCurrentState(), 'COMBAT_ENDED');
});

// ==================== SUMMARY ====================
console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
