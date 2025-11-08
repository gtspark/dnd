/**
 * Combat Manager - Handles D&D 5e combat system
 * Separate conversation management for tactical combat
 */

const fs = require('fs').promises;
const path = require('path');

class CombatManager {
    constructor(campaignDataPath) {
        this.campaignDataPath = campaignDataPath;
        this.activeCombats = new Map(); // campaignId -> combat state
    }

    normalizeIdentifier(value) {
        return (value ?? '')
            .toString()
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    getCombatantKey(combatant) {
        if (!combatant) {
            return null;
        }
        if (combatant.uid) {
            return combatant.uid;
        }
        const baseId = combatant.id ?? combatant.name ?? '';
        const normalized = this.normalizeIdentifier(baseId);
        return normalized || null;
    }

    prepareCombatState(combatState = {}) {
        if (!Array.isArray(combatState.initiativeOrder)) {
            combatState.initiativeOrder = [];
        }

        const seenKeys = new Map();
        const defaultEconomy = {
            action: true,
            bonusAction: true,
            movement: 30,
            reaction: true
        };

        const existingEconomy = combatState.actionEconomy || {};
        const existingConditions = combatState.conditions || {};

        combatState.initiativeOrder = combatState.initiativeOrder.map((entry = {}, index) => {
            const combatant = { ...entry };

            combatant.name = combatant.name || combatant.id || `Combatant ${index + 1}`;
            combatant.isPlayer = combatant.isPlayer === true;
            combatant.type = combatant.isPlayer ? 'player' : 'enemy';

            const numericInitiative = Number(combatant.initiative);
            combatant.initiative = Number.isFinite(numericInitiative) ? numericInitiative : null;

            const baseKey = combatant.uid || combatant.id || combatant.name || `combatant-${index + 1}`;
            const normalizedBase = this.normalizeIdentifier(baseKey) || `combatant-${index + 1}`;
            const occurrence = seenKeys.get(normalizedBase) || 0;
            seenKeys.set(normalizedBase, occurrence + 1);
            const finalKey = occurrence === 0 ? normalizedBase : `${normalizedBase}#${occurrence + 1}`;
            combatant.uid = finalKey;

            const economySource = existingEconomy[finalKey]
                || existingEconomy[combatant.name]
                || combatant.actionEconomy;
            const mergedEconomy = {
                ...defaultEconomy,
                ...(economySource || {})
            };

            const conditionsSource = existingConditions[finalKey]
                || existingConditions[combatant.name]
                || combatant.conditions;
            const mergedConditions = Array.isArray(conditionsSource) ? [...conditionsSource] : [];

            combatant.actionEconomy = mergedEconomy;
            combatant.conditions = mergedConditions;

            if (!combatant.hp || typeof combatant.hp !== 'object') {
                combatant.hp = { current: null, max: null };
            } else {
                combatant.hp = {
                    current: combatant.hp.current ?? combatant.hp.value ?? null,
                    max: combatant.hp.max ?? combatant.hp.maximum ?? combatant.hp.total ?? combatant.hp.maxHp ?? null
                };
            }

            return combatant;
        });

        const normalizedEconomy = {};
        const normalizedConditions = {};
        combatState.initiativeOrder.forEach(combatant => {
            const key = combatant.uid;
            normalizedEconomy[key] = combatant.actionEconomy || { ...defaultEconomy };
            normalizedConditions[key] = Array.isArray(combatant.conditions) ? combatant.conditions : [];
        });

        combatState.actionEconomy = normalizedEconomy;
        combatState.conditions = normalizedConditions;

        const lookup = new Map(combatState.initiativeOrder.map(combatant => [combatant.uid, combatant]));

        const rebuildGroup = (group, predicate) => {
            if (!Array.isArray(group) || group.length === 0) {
                return combatState.initiativeOrder.filter(predicate);
            }
            return group
                .map(entry => {
                    if (entry?.uid && lookup.has(entry.uid)) {
                        return lookup.get(entry.uid);
                    }
                    if (entry?.id && lookup.has(entry.id)) {
                        return lookup.get(entry.id);
                    }
                    const normalized = this.normalizeIdentifier(entry?.name);
                    if (!normalized) {
                        return null;
                    }
                    for (const combatant of combatState.initiativeOrder) {
                        if (this.normalizeIdentifier(combatant.name) === normalized && predicate(combatant)) {
                            return combatant;
                        }
                    }
                    return null;
                })
                .filter(entry => entry && predicate(entry));
        };

        combatState.participants = combatState.participants || {};
        combatState.participants.players = rebuildGroup(combatState.participants.players, combatant => combatant.isPlayer);
        combatState.participants.enemies = rebuildGroup(combatState.participants.enemies, combatant => !combatant.isPlayer);

        if (!Array.isArray(combatState.rollQueue)) {
            combatState.rollQueue = [];
        }

        return combatState;
    }

    /**
     * Initialize combat from narrative handoff
     */
    async startCombat(campaignId, handoffData) {
        const startTime = Date.now();
        const { context, participants } = handoffData;

        let contextPreview = '';
        if (typeof context === 'string') {
            contextPreview = context.substring(0, 50);
        } else if (context && typeof context === 'object') {
            if (context.reason && typeof context.reason === 'string') {
                contextPreview = context.reason.substring(0, 50);
            } else if (context.source && typeof context.source === 'string') {
                contextPreview = context.source.substring(0, 50);
            } else {
                try {
                    contextPreview = JSON.stringify(context).substring(0, 50);
                } catch {
                    contextPreview = '[context object]';
                }
            }
        } else if (context != null) {
            contextPreview = String(context).substring(0, 50);
        } else {
            contextPreview = '[no context]';
        }

        console.log('⚔️  [COMBAT] Starting combat', {
            campaign: campaignId,
            players: participants.players.length,
            enemies: participants.enemies.length,
            context: contextPreview ? `${contextPreview}...` : undefined
        });

        const sanitizeCombatant = (entry, isPlayerDefault) => {
            const combatant = { ...(entry || {}) };
            combatant.isPlayer = isPlayerDefault || combatant.isPlayer === true;
            combatant.type = combatant.isPlayer ? 'player' : 'enemy';
            const numericInitiative = Number(combatant.initiative);
            combatant.initiative = Number.isFinite(numericInitiative) ? numericInitiative : null;
            combatant.conditions = Array.isArray(combatant.conditions) ? [...combatant.conditions] : [];
            return combatant;
        };

        const playerCombatants = (participants.players || []).map(player => sanitizeCombatant(player, true));
        const enemyCombatants = (participants.enemies || []).map(enemy => sanitizeCombatant(enemy, false));
        const allCombatants = [...playerCombatants, ...enemyCombatants];

        allCombatants.sort((a, b) => {
            const aInit = Number.isFinite(a.initiative) ? a.initiative : -Infinity;
            const bInit = Number.isFinite(b.initiative) ? b.initiative : -Infinity;
            return bInit - aInit;
        });

        console.log('📊 [COMBAT] Initiative order:', allCombatants.map(c =>
            `${c.name}(${Number.isFinite(c.initiative) ? c.initiative : '—'})${c.isPlayer ? '👤' : '💀'}`
        ).join(', '));

        const combatState = {
            active: true,
            round: 1,
            currentTurn: 0,
            initiativeOrder: allCombatants,
            participants: {
                players: playerCombatants,
                enemies: enemyCombatants
            },
            actionEconomy: {},
            conditions: {},
            context,
            conversationHistory: [], // Separate combat conversation
            startTime: new Date().toISOString(),
            rollQueue: []
        };

        this.prepareCombatState(combatState);

        this.activeCombats.set(campaignId, combatState);
        await this.saveCombatState(campaignId, combatState);

        const duration = Date.now() - startTime;
        console.log(`✅ [COMBAT] Combat started successfully (${duration}ms)`, {
            round: combatState.round,
            firstTurn: allCombatants[0]?.name,
            totalCombatants: allCombatants.length
        });

        return combatState;
    }

    /**
     * Fuzzy match combatant names to handle variations
     */
    fuzzyMatchName(name1, name2) {
        if (!name1 || !name2) return false;

        const n1 = name1.toString().trim().toLowerCase();
        const n2 = name2.toString().trim().toLowerCase();

        // Exact match
        if (n1 === n2) return true;

        // Normalized match (remove special chars)
        const normalized1 = n1.replace(/[^a-z0-9]/g, '');
        const normalized2 = n2.replace(/[^a-z0-9]/g, '');
        if (normalized1 === normalized2) return true;

        // First word match
        const firstWord1 = n1.split(/\s+/)[0];
        const firstWord2 = n2.split(/\s+/)[0];
        if (firstWord1 && firstWord2 && firstWord1 === firstWord2 && firstWord1.length >= 3) {
            return true;
        }

        // One contains the other
        if (n1.includes(n2) || n2.includes(n1)) {
            return true;
        }

        return false;
    }

    /**
     * Find combatant with fuzzy name matching
     */
    findCombatant(combat, name) {
        return combat.initiativeOrder.find(c => this.fuzzyMatchName(c.name, name));
    }

    /**
     * Get current combat state
     */
    getCombatState(campaignId) {
        const state = this.activeCombats.get(campaignId);
        if (!state) {
            return {
                active: false,
                round: 0,
                currentTurn: 0,
                initiativeOrder: [],
                rollQueue: []
            };
        }

        if (!Array.isArray(state.rollQueue)) {
            state.rollQueue = [];
        }

        return state;
    }

    /**
     * Advance to next turn
     */
    async nextTurn(campaignId) {
        const combat = this.activeCombats.get(campaignId);
        if (!combat || !combat.active) {
            throw new Error('No active combat');
        }

        // Guard against empty initiative order
        if (!combat.initiativeOrder || combat.initiativeOrder.length === 0) {
            throw new Error('Cannot advance turn with empty initiative order');
        }

        const previousCombatant = combat.initiativeOrder[combat.currentTurn];

        // Reset action economy for current combatant
        const currentCombatant = combat.initiativeOrder[combat.currentTurn];
        const currentKey = this.getCombatantKey(currentCombatant);
        if (!currentKey) {
            throw new Error('Unable to resolve combatant key for action economy reset');
        }
        combat.actionEconomy[currentKey] = {
            action: true,
            bonusAction: true,
            movement: 30,
            reaction: true
        };
        currentCombatant.actionEconomy = combat.actionEconomy[currentKey];

        // Advance turn, skipping defeated combatants
        let attempts = 0;
        const maxAttempts = combat.initiativeOrder.length;

        do {
            combat.currentTurn++;

            // Check if round ended
            if (combat.currentTurn >= combat.initiativeOrder.length) {
                combat.currentTurn = 0;
                combat.round++;
                console.log(`🔄 [COMBAT] Round ${combat.round} starting`, {
                    campaign: campaignId,
                    combatants: combat.initiativeOrder.length
                });
            }

            attempts++;
        } while (
            combat.initiativeOrder[combat.currentTurn]?.isDefeated &&
            attempts < maxAttempts
        );

        // If all combatants defeated, combat should end
        if (attempts >= maxAttempts) {
            console.log('⚠️  [COMBAT] All combatants defeated, combat should end');
        }

        const nextCombatant = combat.initiativeOrder[combat.currentTurn];
        console.log(`➡️  [COMBAT] Turn advance: ${previousCombatant.name} → ${nextCombatant.name}${nextCombatant.isDefeated ? ' (DEFEATED - SKIPPED)' : ''}`, {
            round: combat.round,
            turn: combat.currentTurn + 1,
            isPlayer: nextCombatant.isPlayer
        });

        await this.saveCombatState(campaignId, combat);
        return combat;
    }

    /**
     * Update action economy for a combatant
     */
    async updateActionEconomy(campaignId, combatantName, updates) {
        const combat = this.activeCombats.get(campaignId);
        if (!combat) {
            throw new Error('No active combat');
        }

        // Find combatant with fuzzy matching
        const combatant = this.findCombatant(combat, combatantName);
        if (!combatant) {
            throw new Error(`Combatant ${combatantName} not found`);
        }

        const key = this.getCombatantKey(combatant);
        if (!key) {
            throw new Error(`Unable to resolve combatant key for ${combatantName}`);
        }

        if (!combat.actionEconomy[key]) {
            combat.actionEconomy[key] = {
                action: true,
                bonusAction: true,
                movement: 30,
                reaction: true
            };
        }

        Object.assign(combat.actionEconomy[key], updates);
        combatant.actionEconomy = combat.actionEconomy[key];

        await this.saveCombatState(campaignId, combat);
        return combat;
    }

    /**
     * Update HP for a combatant
     */
    async updateHP(campaignId, combatantName, damage, isHealing = false) {
        const combat = this.activeCombats.get(campaignId);
        if (!combat) {
            throw new Error('No active combat');
        }

        // Find combatant with fuzzy matching
        const combatant = this.findCombatant(combat, combatantName);
        if (!combatant) {
            throw new Error(`Combatant ${combatantName} not found`);
        }

        if (!combatant.hp) {
            combatant.hp = { current: combatant.maxHp || 10, max: combatant.maxHp || 10 };
        }

        if (isHealing) {
            combatant.hp.current = Math.min(combatant.hp.current + damage, combatant.hp.max);
            // If healed above 0, revive
            if (combatant.hp.current > 0 && combatant.isDefeated) {
                combatant.isDefeated = false;
                console.log(`✨ [COMBAT] ${combatantName} revived!`);
            }
        } else {
            combatant.hp.current = Math.max(combatant.hp.current - damage, 0);
            // Mark as defeated when HP reaches 0
            if (combatant.hp.current === 0 && !combatant.isDefeated) {
                combatant.isDefeated = true;
                console.log(`💀 [COMBAT] ${combatantName} defeated!`);
            }
        }

        await this.saveCombatState(campaignId, combat);
        return combat;
    }

    /**
     * Add/remove condition
     */
    async updateCondition(campaignId, combatantName, condition, add = true) {
        const combat = this.activeCombats.get(campaignId);
        if (!combat) {
            throw new Error('No active combat');
        }

        // Find combatant with fuzzy matching
        const combatant = this.findCombatant(combat, combatantName);
        if (!combatant) {
            throw new Error(`Combatant ${combatantName} not found`);
        }

        const key = this.getCombatantKey(combatant);
        if (!key) {
            throw new Error(`Unable to resolve combatant key for ${combatantName}`);
        }
        if (!combat.conditions[key]) {
            combat.conditions[key] = [];
        }
        const conditions = combat.conditions[key];

        if (add) {
            if (!conditions.includes(condition)) {
                conditions.push(condition);
            }
        } else {
            const index = conditions.indexOf(condition);
            if (index > -1) {
                conditions.splice(index, 1);
            }
        }

        combatant.conditions = combat.conditions[key];

        await this.saveCombatState(campaignId, combat);
        return combat;
    }

    /**
     * End combat and generate summary
     */
    async endCombat(campaignId) {
        const combat = this.activeCombats.get(campaignId);
        if (!combat) {
            throw new Error('No active combat');
        }

        const duration = new Date() - new Date(combat.startTime);
        const durationMins = Math.round(duration / 60000);

        console.log('🏁 [COMBAT] Ending combat', {
            campaign: campaignId,
            rounds: combat.round,
            duration: `${durationMins}m`,
            turns: combat.conversationHistory.length
        });

        // Generate combat summary
        const summary = this.generateCombatSummary(combat);

        // Mark combat as inactive
        combat.active = false;
        combat.endTime = new Date().toISOString();

        await this.saveCombatState(campaignId, combat);
        this.activeCombats.delete(campaignId);

        console.log('✅ [COMBAT] Combat ended successfully', {
            survivors: combat.initiativeOrder.filter(c => !c.isDefeated).length,
            defeated: combat.initiativeOrder.filter(c => c.isDefeated).length
        });

        return summary;
    }

    /**
     * Generate combat summary for handoff back to narrative
     */
    generateCombatSummary(combat) {
        const casualties = {
            players: combat.initiativeOrder
                .filter(c => c.isPlayer && c.isDefeated)
                .map(c => c.name),
            enemies: combat.initiativeOrder
                .filter(c => !c.isPlayer && c.isDefeated)
                .map(c => c.name)
        };

        const hpChanges = {};
        combat.initiativeOrder
            .filter(c => c.isPlayer && c.hp)
            .forEach(c => {
                hpChanges[c.name] = {
                    current: c.hp.current,
                    max: c.hp.max,
                    damage: c.hp.max - c.hp.current,
                    isDefeated: c.isDefeated || false
                };
            });

        return {
            combatComplete: true,
            rounds: combat.round,
            duration: combat.endTime ?
                new Date(combat.endTime) - new Date(combat.startTime) : 0,
            casualties,
            hpChanges,
            context: combat.context.reason,
            survivors: combat.initiativeOrder
                .filter(c => !c.isDefeated)
                .map(c => ({ name: c.name, isPlayer: c.isPlayer }))
        };
    }

    /**
     * Save combat state to disk
     */
    async saveCombatState(campaignId, combatState) {
        this.prepareCombatState(combatState);
        if (!Array.isArray(combatState.rollQueue)) {
            combatState.rollQueue = [];
        }

        const combatFile = path.join(this.campaignDataPath, campaignId, 'combat-state.json');
        await fs.writeFile(combatFile, JSON.stringify(combatState, null, 2));
    }

    /**
     * Replace current combat state (optionally persisting it)
     */
    async setCombatState(campaignId, combatState, persist = false) {
        this.prepareCombatState(combatState);
        if (!Array.isArray(combatState.rollQueue)) {
            combatState.rollQueue = [];
        }

        this.activeCombats.set(campaignId, combatState);
        if (persist) {
            await this.saveCombatState(campaignId, combatState);
        }
    }

    /**
     * Load combat state from disk
     */
    async loadCombatState(campaignId) {
        try {
            const combatFile = path.join(this.campaignDataPath, campaignId, 'combat-state.json');
            const data = await fs.readFile(combatFile, 'utf8');
            const combatState = JSON.parse(data);
            if (!Array.isArray(combatState.rollQueue)) {
                combatState.rollQueue = [];
            }

            if (combatState.active) {
                this.prepareCombatState(combatState);
                this.activeCombats.set(campaignId, combatState);
            } else {
                this.activeCombats.delete(campaignId);
            }

            return combatState;
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.activeCombats.delete(campaignId);
                return {
                    active: false,
                    round: 0,
                    currentTurn: 0,
                    initiativeOrder: [],
                    rollQueue: []
                };
            }
            throw error;
        }
    }

    /**
     * Get combat system prompt
     */
    getCombatSystemPrompt(combatState) {
        const currentCombatant = combatState.initiativeOrder[combatState.currentTurn];
        const economy = combatState.actionEconomy[currentCombatant.name];

        return `You are the Combat Manager for a D&D 5e tactical combat encounter.

CURRENT COMBAT STATE:
Round: ${combatState.round}
Current Turn: ${currentCombatant.name} (${currentCombatant.isPlayer ? 'PLAYER-CONTROLLED' : 'ENEMY'})
Action Economy:
  - Action: ${economy.action ? 'Available' : 'Used'}
  - Bonus Action: ${economy.bonusAction ? 'Available' : 'Used'}
  - Movement: ${economy.movement}ft remaining
  - Reaction: ${economy.reaction ? 'Available' : 'Used'}

INITIATIVE ORDER:
${combatState.initiativeOrder.map((c, i) =>
  `${i === combatState.currentTurn ? '→ ' : '  '}${c.initiative}: ${c.name} ${c.isPlayer ? '(PC)' : '(Enemy)'} - ${c.hp ? `${c.hp.current}/${c.hp.max} HP` : 'HP unknown'}`
).join('\n')}

YOUR ROLE:
1. For PLAYER turns (Kira, Thorne, Riven):
   - Request actions from the player
   - Process their commands flexibly (any order: bonus→action→move, or move→action, etc.)
   - Track action economy as they use abilities
   - Call for dice rolls when needed
   - Apply damage/healing/conditions

2. For ENEMY turns:
   - You control the enemy completely
   - Make tactical decisions
   - Roll their attacks and damage
   - Describe actions mechanically (not narratively)
   - Advance to next turn automatically

COMBAT RULES:
- Action economy is FLEXIBLE - player can use in any order
- Movement can be split (move 10ft, attack, move 20ft more)
- Mark actions as "used" when consumed
- Track HP changes precisely
- Apply conditions (poisoned, stunned, etc.)
- Use D&D 5e rules strictly

OUTPUT FORMAT:
- State whose turn it is
- Show available actions
- Request player input OR control enemies
- Resolve dice rolls
- Update HP/conditions
- When enemy turn complete, output: [TURN_COMPLETE]

IMPORTANT:
- NO narrative storytelling - pure tactics only
- Be concise and mechanical
- Trust player to control ALL party members (Kira, Thorne, Riven)
- When combat ends (all enemies defeated), output: COMBAT_ENDED

Begin combat!`;
    }
}

module.exports = CombatManager;
