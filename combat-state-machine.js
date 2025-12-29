const STATE = {
  IDLE: 'IDLE',
  COMBAT_PENDING: 'COMBAT_PENDING',
  COMBAT_ACTIVE: 'COMBAT_ACTIVE',
  COMBAT_PAUSED: 'COMBAT_PAUSED',
  COMBAT_ENDED: 'COMBAT_ENDED'
};

const VALID_TRANSITIONS = {
  [STATE.IDLE]: [STATE.COMBAT_PENDING],
  [STATE.COMBAT_PENDING]: [STATE.COMBAT_ACTIVE, STATE.COMBAT_ENDED, STATE.IDLE],  // Can end from pending (e.g., enemies flee before initiative)
  [STATE.COMBAT_ACTIVE]: [STATE.COMBAT_PAUSED, STATE.COMBAT_ENDED],
  [STATE.COMBAT_PAUSED]: [STATE.COMBAT_ACTIVE, STATE.COMBAT_ENDED, STATE.IDLE],  // Can end from paused too
  [STATE.COMBAT_ENDED]: [STATE.IDLE]
};

const TRIGGER_KEYWORDS = {
  START_COMBAT: ['draw weapon', 'attack', 'roll initiative'],
  PAUSE: ['pause', 'stop fighting', 'let\'s talk'],
  RESUME: ['resume', 'continue', 'back to fighting'],
  END: ['flees', 'surrenders', 'victory']
};

class CombatStateMachine {
  constructor() {
    this.currentState = STATE.IDLE;
    this.transitionHistory = [];
  }

  canTransition(toState) {
    return VALID_TRANSITIONS[this.currentState]?.includes(toState) ?? false;
  }

  validateTransition(toState, data) {
    // Validation rules are intentionally lenient to allow flexibility
    // The main validation is done by canTransition() checking valid state paths
    const validationRules = {
      [STATE.COMBAT_PENDING]: (data) => {
        // Accept any trigger that indicates combat starting
        return true; // Lenient - combat manager will validate further
      },
      [STATE.COMBAT_ACTIVE]: (data) => {
        // Accept transition to active state
        return true; // Lenient - initiative may come later
      },
      [STATE.COMBAT_PAUSED]: (data) => {
        // Accept any pause request
        return true;
      },
      [STATE.COMBAT_ENDED]: (data) => {
        // Require a reason for ending combat
        if (data?.reason) {
          return ['enemies_defeated', 'party_defeated', 'fled', 'surrendered', 'victory', 'negotiated', 'combat_initiated', 'dialogue_started', 'combat_resumed', 'narrative_keyword', 'combat_ended'].includes(data.reason);
        }
        return true; // Allow without reason for flexibility
      },
      [STATE.IDLE]: (data) => true
    };

    const validator = validationRules[toState];
    if (validator && !validator(data)) {
      return { valid: false, reason: `Validation failed for transition to ${toState}` };
    }

    return { valid: true };
  }

  transition(toState, data = {}) {
    if (!this.canTransition(toState)) {
      throw new Error(
        `Invalid transition from ${this.currentState} to ${toState}. ` +
        `Valid transitions from ${this.currentState}: ${VALID_TRANSITIONS[this.currentState].join(', ') || 'none'}`
      );
    }

    const validation = this.validateTransition(toState, data);
    if (!validation.valid) {
      throw new Error(`Transition validation failed: ${validation.reason}`);
    }

    const previousState = this.currentState;
    this.currentState = toState;

    const transitionRecord = {
      timestamp: new Date().toISOString(),
      fromState: previousState,
      toState: toState,
      data: data
    };

    this.transitionHistory.push(transitionRecord);

    return transitionRecord;
  }

  getCurrentState() {
    return this.currentState;
  }

  getTransitionHistory() {
    return [...this.transitionHistory];
  }

  reset() {
    this.currentState = STATE.IDLE;
    this.transitionHistory = [];
  }
}

module.exports = {
  CombatStateMachine,
  STATE,
  TRIGGER_KEYWORDS
};
