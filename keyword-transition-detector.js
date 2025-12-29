const IDLE = 'IDLE';
const COMBAT_PENDING = 'COMBAT_PENDING';
const COMBAT_ACTIVE = 'COMBAT_ACTIVE';
const COMBAT_PAUSED = 'COMBAT_PAUSED';
const COMBAT_ENDED = 'COMBAT_ENDED';

const TRANSITIONS = {
    [IDLE]: {
        [COMBAT_PENDING]: [
            { pattern: /roll\s+for\s+initiative/gi, confidence: 0.9 },
            { pattern: /combat\s+begins?/gi, confidence: 0.8 },
            { pattern: /engages?(?:\s+in)?\s+combat/gi, confidence: 0.8 },
            { pattern: /attack(?:s|ing)?/gi, confidence: 0.6 },
            { pattern: /draws?\s+(?:his\s+|her\s+|their\s+|a\s+)?(?:\w+\s+)?weapon/gi, confidence: 0.7 }
        ]
    },
    [COMBAT_PENDING]: {
        [COMBAT_ENDED]: [
            { pattern: /flees?\b/gi, confidence: 0.8 },
            { pattern: /surrenders?\b/gi, confidence: 0.9 },
            { pattern: /retreats?\b/gi, confidence: 0.8 },
            { pattern: /defeated/gi, confidence: 0.9 },
            { pattern: /dies?\b/gi, confidence: 0.8 },
            { pattern: /slain\b/gi, confidence: 0.9 },
            { pattern: /victory/gi, confidence: 0.9 },
            { pattern: /combat\s+ends?/gi, confidence: 0.9 },
            { pattern: /is\s+over/gi, confidence: 0.8 },
            { pattern: /we\s+flee/gi, confidence: 0.9 },
            { pattern: /we\s+retreat/gi, confidence: 0.9 },
            { pattern: /stand\s+down/gi, confidence: 0.8 },
            { pattern: /backs?\s+off/gi, confidence: 0.7 }
        ],
        [COMBAT_ACTIVE]: [
            { pattern: /initiative\s+(?:order|rolled|set)/gi, confidence: 0.9 },
            { pattern: /round\s+1/gi, confidence: 0.8 },
            { pattern: /first\s+turn/gi, confidence: 0.8 }
        ]
    },
    [COMBAT_ACTIVE]: {
        [COMBAT_PAUSED]: [
            { pattern: /pause\b/gi, confidence: 0.9 },
            { pattern: /stop\s+fighting/gi, confidence: 0.9 },
            { pattern: /parley/gi, confidence: 0.9 },
            { pattern: /let'?s\s+talk/gi, confidence: 0.8 },
            { pattern: /wait\b/gi, confidence: 0.7 },
            { pattern: /hold\b/gi, confidence: 0.7 }
        ],
        [COMBAT_ENDED]: [
            { pattern: /flees?\b/gi, confidence: 0.8 },
            { pattern: /surrenders?\b/gi, confidence: 0.9 },
            { pattern: /retreats?\b/gi, confidence: 0.8 },
            { pattern: /defeated/gi, confidence: 0.9 },
            { pattern: /dies?\b/gi, confidence: 0.8 },
            { pattern: /slain\b/gi, confidence: 0.9 },
            { pattern: /victory/gi, confidence: 0.9 },
            { pattern: /combat\s+ends?/gi, confidence: 0.9 },
            { pattern: /is\s+over/gi, confidence: 0.8 },
            { pattern: /we\s+flee/gi, confidence: 0.9 },
            { pattern: /we\s+retreat/gi, confidence: 0.9 }
        ]
    },
    [COMBAT_PAUSED]: {
        [COMBAT_ACTIVE]: [
            { pattern: /back\s+to\s+fighting/gi, confidence: 0.9 },
            { pattern: /let'?s\s+get\s+back\s+to\s+it/gi, confidence: 0.8 },
            { pattern: /resume\b/gi, confidence: 0.9 },
            { pattern: /continue\b/gi, confidence: 0.7 }
        ]
    },
    [COMBAT_ENDED]: {
        [IDLE]: [
            { pattern: /campaign\s+(?:continues?|resumes?|proceeds?)/gi, confidence: 0.9 },
            { pattern: /carry\s+on/gi, confidence: 0.8 },
            { pattern: /let'?s\s+go/gi, confidence: 0.7 },
            { pattern: /continue\b/gi, confidence: 0.6 }
        ]
    }
};

function detectTransition(text, currentState) {
    if (!text || !currentState) {
        return null;
    }

    const stateTransitions = TRANSITIONS[currentState];
    if (!stateTransitions) {
        return null;
    }

    for (const [targetState, patterns] of Object.entries(stateTransitions)) {
        for (const { pattern, confidence } of patterns) {
            const match = text.match(pattern);
            if (match) {
                return {
                    targetState,
                    keyword: match[0],
                    confidence
                };
            }
        }
    }

    return null;
}

function getTransitionKeywords(targetState) {
    const keywords = [];

    for (const [fromState, transitions] of Object.entries(TRANSITIONS)) {
        const patterns = transitions[targetState];
        if (patterns) {
            patterns.forEach(({ pattern, confidence }) => {
                keywords.push({
                    fromState,
                    targetState,
                    pattern: pattern.source,
                    flags: pattern.flags,
                    confidence
                });
            });
        }
    }

    return keywords;
}

module.exports = {
    detectTransition,
    getTransitionKeywords
};
