// COMPLETE INTELLIGENT D&D CAMPAIGN SERVER
// Combines intelligent context retrieval with full game management

// Load environment variables from .env file
require('dotenv').config();
if (!process.env.CLAUDE_API_KEY) {
    console.warn('⚠️ CLAUDE_API_KEY not found in environment – enhanced server will be unable to call the DM provider.');
}

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');

// Database and RAG integration (Silverpeak only)
const CampaignDatabase = require('./database/CampaignDatabase');
const MemoryClient = require('./MemoryClient');
const { getEquipmentProperties } = require('./5e-equipment-data');
const { getSpellProperties } = require('./5e-spell-data');
const DnDRulesService = require('./DnDRulesService');

// Combat System
const CombatManager = require('./combat-manager');

const rulesLookupService = new DnDRulesService();

// ==================== AI PROVIDER SYSTEM ====================

class AIProviderManager {
    constructor() {
        this.providers = {
            claude: new ClaudeProvider(),
            deepseek: new DeepSeekProvider(),
            gpt4: new GPT4Provider()
        };

        // Load saved provider or default to claude
        this.currentProvider = this.loadSavedProvider() || 'claude';
        console.log(`🔄 AI Provider Manager initialized with: ${this.currentProvider.toUpperCase()}`);
    }

    loadSavedProvider() {
        try {
            const fs = require('fs');
            const path = require('path');
            const settingsPath = path.join(__dirname, 'ai-provider-settings.json');

            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                return settings.currentProvider;
            }
        } catch (error) {
            console.log('No saved AI provider settings found, using default');
        }
        return null;
    }

    saveCurrentProvider() {
        try {
            const fs = require('fs');
            const path = require('path');
            const settingsPath = path.join(__dirname, 'ai-provider-settings.json');

            const settings = {
                currentProvider: this.currentProvider,
                lastUpdated: new Date().toISOString()
            };

            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
            console.log(`💾 Saved AI provider preference: ${this.currentProvider.toUpperCase()}`);
        } catch (error) {
            console.error('Failed to save AI provider settings:', error);
        }
    }

    setProvider(providerName) {
        if (this.providers[providerName]) {
            this.currentProvider = providerName;
            this.saveCurrentProvider();
            console.log(`🔄 Switched to AI provider: ${providerName.toUpperCase()}`);
            return true;
        }
        return false;
    }

    getCurrentProvider() {
        return this.currentProvider;
    }

    getAvailableProviders() {
        return Object.keys(this.providers);
    }

    async generateResponse(system, messages) {
        const provider = this.providers[this.currentProvider];
        if (!provider) {
            throw new Error(`Provider ${this.currentProvider} not found`);
        }

        return await provider.generateResponse(system, messages);
    }
}

class BaseAIProvider {
    constructor(name, modelName) {
        this.name = name;
        this.modelName = modelName;
    }

    getModelName() {
        return this.modelName;
    }

    async generateResponse(system, messages) {
        throw new Error('generateResponse must be implemented by subclass');
    }
}

// Claude Provider
class ClaudeProvider extends BaseAIProvider {
    constructor() {
        super('claude', 'claude-sonnet-4-5-20250929');
        const DnDRulesService = require('./DnDRulesService');
        this.rulesService = new DnDRulesService();
    }

    async generateResponse(system, messages) {
        const startTime = Date.now();
        const fetch = require('node-fetch');
        const apiKey = this.getApiKey();

        console.log('🤖 [AI] Claude request starting', {
            model: this.modelName,
            messageCount: messages.length,
            systemPromptLength: system.length
        });

        // Define D&D 5e tools
        const tools = [
            {
                "name": "get_spell_details",
                "description": "Get complete D&D 5e SRD spell details including damage, components, casting time, and duration. Use this when a character casts a spell or you need accurate spell mechanics.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "spell_name": {
                            "type": "string",
                            "description": "Name of the spell (e.g., 'Magic Missile', 'Fireball')"
                        },
                        "cast_at_level": {
                            "type": "integer",
                            "description": "Spell slot level used for casting (1-9). Optional, defaults to spell's base level."
                        }
                    },
                    "required": ["spell_name"]
                }
            },
            {
                "name": "get_monster_stats",
                "description": "Get complete D&D 5e monster stat block including HP, AC, abilities, and actions. Use when characters encounter creatures in combat.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "monster_name": {
                            "type": "string",
                            "description": "Name of the monster (e.g., 'goblin', 'adult-red-dragon')"
                        }
                    },
                    "required": ["monster_name"]
                }
            },
            {
                "name": "get_item_details",
                "description": "Get D&D 5e equipment details including damage, AC, weight, and properties. Use when characters find or use equipment/weapons/armor.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "item_name": {
                            "type": "string",
                            "description": "Name of the item (e.g., 'longsword', 'plate-armor')"
                        }
                    },
                    "required": ["item_name"]
                }
            }
        ];

        // Enhanced system prompt with D&D 5e instructions
        const enhancedSystem = system + `

═══════════════════════════════════════════════════════════
D&D 5E COMBAT MECHANICS - COMPREHENSIVE IMPLEMENTATION
═══════════════════════════════════════════════════════════

CRITICAL DICE ROLL RULES - FOLLOW EXACTLY OR FAIL:
- EXACT FORMAT: "🎲 Roll [SkillName] (DC [number]) to [action]" - NO EXCEPTIONS
- FORBIDDEN: "Roll Unknown" - ALWAYS name the actual skill (Perception, Athletics, etc.)
- FORBIDDEN: Line breaks between "Roll" and skill name - MUST be single line
- FORBIDDEN: Multiple rolls in one response
- FORBIDDEN: Inline dice text within narrative
- CRITICAL: If player action requires skill check, STOP IMMEDIATELY after roll request
- FORBIDDEN: Writing outcomes/results after requesting a roll in the same response
- FORBIDDEN: Describing success or failure before dice are rolled
- CORRECT: "Setup narrative... 🎲 Roll Perception (DC 15) to notice the trap" [STOP HERE]
- WRONG: "🎲 Roll Perception (DC 15)... You notice the trap and..." - DO NOT DESCRIBE OUTCOMES

───────────────────────────────────────────────────────────
TOOL USAGE - D&D 5E SRD DATABASE
───────────────────────────────────────────────────────────
You have access to tools for looking up official D&D 5e SRD data.

WHEN TO USE TOOLS:
✓ Character casts a spell → ALWAYS call get_spell_details first
✓ NEW enemies appear → IMMEDIATELY call get_monster_stats to get AC, HP, abilities, CR
✓ Character examines/uses equipment → call get_item_details for accurate properties

CRITICAL: Always use tools BEFORE narrating spell/monster mechanics. Never guess.

───────────────────────────────────────────────────────────
COMBAT FLOW - INITIATIVE AND TURN ORDER
───────────────────────────────────────────────────────────

STARTING COMBAT:
1. Describe the threatening situation
2. STOP and request initiative: "🎲 Roll Initiative for [Name1], [Name2], [Name3], and [Enemy description]"
3. Wait for player to provide initiative results
4. After receiving initiative order, begin Round 1 in that order

INITIATIVE FORMAT:
✓ "🎲 Roll Initiative for Kira, Thorne, Riven, and the Cult Fanatic"
✓ "🎲 Roll Initiative for all party members and the two Goblins"
✗ Multiple separate roll requests - do it in ONE line

ROUND STRUCTURE:
- Each round = 6 seconds of game time
- Track initiative order - it stays the same every round
- Announce whose turn it is: "[Name]'s turn. [Next name], you're on deck."
- After everyone acts, announce: "Round [X] ends. Round [Y] begins with [First name]."

TURN STRUCTURE (each participant gets):
1. START OF TURN: Death saves (if at 0 HP), ongoing effects trigger
2. MOVEMENT: Up to their speed (can split before/after action)
3. ONE ACTION: Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use Object
4. ONE BONUS ACTION: Only if a feature/spell grants one (can't use unless specified)
5. ONE FREE OBJECT INTERACTION: Draw/sheathe weapon, open door, pick up item
6. ONE REACTION: Between turns (Opportunity Attack, Counterspell, Shield, etc.) - resets at start of their next turn

───────────────────────────────────────────────────────────
ACTION ECONOMY - CRITICAL RULES
───────────────────────────────────────────────────────────

MOVEMENT:
- Characters can move up to their speed (usually 30 feet)
- Can split movement: "Move 15 feet, attack, move 15 feet more"
- Difficult terrain costs 2 feet per 1 foot moved
- Climbing/swimming costs 2 feet per 1 foot (unless special speed)
- Standing up from prone costs HALF movement

OPPORTUNITY ATTACKS:
- Trigger: Enemy moves OUT OF your reach (not just within reach)
- Uses your Reaction (only one per round)
- Make ONE melee attack
- Avoided by: Disengage action, teleporting, being forcibly moved

BONUS ACTION SPELL RESTRICTION:
CRITICAL: If ANY spell (including cantrip) is cast as a bonus action, the ONLY other spell that can be cast that turn is a cantrip with casting time of 1 action.
✓ Legal: Healing Word (bonus action) + Fire Bolt (action cantrip)
✗ Illegal: Healing Word (bonus action) + Cure Wounds (action spell)
✗ Illegal: Misty Step (bonus action) + Fireball (action)

REACTIONS:
- Each creature gets ONE reaction per round
- Resets at the start of their next turn
- Using a reaction (like Opportunity Attack or Shield) consumes it until next turn
- Track who has used reactions

───────────────────────────────────────────────────────────
HP TRACKING AND DAMAGE
───────────────────────────────────────────────────────────

APPLYING DAMAGE:
- Subtract damage from current HP
- State damage clearly: "The goblin strikes for 7 slashing damage. You're at 11/18 HP."
- Track resistance/vulnerability (half/double damage)

TEMPORARY HP:
- Acts as damage buffer (absorbed before real HP)
- Does NOT stack - choose which to keep if gaining new temp HP
- Does NOT wake unconscious creatures or stabilize them
- Separate from max HP - not added to it

DROPPING TO 0 HP:
When a creature reaches 0 HP:

1. CHECK FOR INSTANT DEATH:
   - If remaining damage ≥ max HP, creature dies instantly
   - Example: 8 current HP, 20 damage taken = 12 remaining. If max HP is 12 or less, instant death

2. IF NOT INSTANT DEATH:
   - Fall unconscious and prone
   - Begin making death saving throws at start of each turn
   - Drop whatever being held
   - Can't move, speak, or take actions

DEATH SAVING THROWS:
- Roll d20 at START of your turn (no modifiers)
- 10+ = Success (mark one success)
- 9 or lower = Failure (mark one failure)
- Natural 20 = Regain 1 HP immediately (back in the fight!)
- Natural 1 = TWO failures
- 3 Successes = Stabilized (unconscious but not dying)
- 3 Failures = Death

TAKING DAMAGE AT 0 HP:
CRITICAL RULE: Any damage while at 0 HP = 1 death save failure
- Melee attack within 5 feet = Automatic critical = 2 death save failures
- This is VERY dangerous - downed PCs can die quickly

STABILIZING:
Methods: Spare the Dying cantrip, Healer's Kit, DC 10 Medicine check, any healing, natural 20 on death save
Effect: Unconscious at 0 HP but no longer dying

CONCENTRATION CHECKS:
When taking damage while concentrating on a spell:
- DC = 10 OR half the damage taken (whichever is higher)
- Roll Constitution saving throw
- Failure = spell ends immediately
- Note: Temp HP doesn't reduce this DC - use total damage dealt

───────────────────────────────────────────────────────────
ATTACK RESOLUTION
───────────────────────────────────────────────────────────

ATTACK ROLLS:
Format: d20 + ability modifier + proficiency bonus (if proficient)
- Melee: Usually STR (or DEX for finesse weapons)
- Ranged: Usually DEX
- Spell attacks: Spellcasting ability

HIT DETERMINATION:
- Attack total ≥ AC = HIT
- Attack total < AC = MISS
- Matching AC exactly = HIT

CRITICAL HITS (Natural 20):
- Automatically hits regardless of AC
- Roll ALL damage dice twice, add modifiers once
- Example: Longsword (1d8+3) → Critical = 2d8+3
- Announce: "Natural 20! Critical hit! Roll damage dice twice!"

CRITICAL MISS (Natural 1):
- Automatically misses regardless of modifiers
- No additional effects (per RAW)

ADVANTAGE/DISADVANTAGE:
- Advantage: Roll 2d20, use higher result
- Disadvantage: Roll 2d20, use lower result
- If you have BOTH, they cancel (roll 1d20 normally, regardless of how many sources)
- Don't stack - multiple sources of advantage still = roll 2d20

Common Advantage sources:
- Attacking prone enemy from within 5 feet
- Attacking restrained/paralyzed/stunned/unconscious enemy
- Unseen attacker
- Help action

Common Disadvantage sources:
- Attacking while prone
- Attacking while blinded
- Attacking beyond normal range
- Attacking in melee with ranged weapon while enemy within 5 feet

COVER:
- Half Cover: +2 AC and Dex saves (low wall, furniture, creature)
- Three-Quarters Cover: +5 AC and Dex saves (portcullis, arrow slit)
- Total Cover: Cannot be targeted directly

───────────────────────────────────────────────────────────
ENEMY HP TRACKING AND STATUS
───────────────────────────────────────────────────────────

WHEN ENEMIES APPEAR:
1. Use get_monster_stats tool to get AC, HP, abilities, CR
2. Track starting HP for each enemy
3. As damage is dealt, track current HP mentally

ENEMY STATUS REPORTING:
Report enemy condition after taking damage:
- 100%-76% HP: "The [enemy] looks fresh and ready"
- 75%-51% HP: "The [enemy] has taken some hits but fights on"
- 50%-26% HP: "The [enemy] is BLOODIED, wounds visible and bleeding"
- 25%-1% HP: "The [enemy] is barely standing, grievously wounded"
- 0 HP: "The [enemy] collapses, defeated!"

Include HP status in combat narration:
✓ "Your strike deals 12 damage! The cultist is now bloodied, clutching their wounded side."
✓ "The goblin takes 8 damage and is barely standing, grievously wounded."
✗ "The goblin takes damage." (too vague)

───────────────────────────────────────────────────────────
NPC/ENEMY ACTIONS
───────────────────────────────────────────────────────────

ROLLING FOR ENEMIES:
- YOU roll for all NPCs and enemies - NEVER ask player to roll for them
- Report results clearly with full calculation
- Example: "The goblin attacks Thorne! (Rolled 12+4 = 16 to hit)"

ATTACK RESOLUTION:
If hit: "That hits! The goblin's scimitar deals 5 slashing damage."
If miss: "That misses - the attack glances off Thorne's armor."

NPC SPELLCASTING:
- Use get_spell_details to get accurate mechanics
- YOU roll damage for NPC spells
- Request saves from players: "The cultist casts Burning Hands! 🎲 Roll Dexterity Save (DC 13) to dodge the flames"

───────────────────────────────────────────────────────────
SPELL MECHANICS IN COMBAT
───────────────────────────────────────────────────────────

SPELL SLOT TRACKING:
- Note when PCs use spell slots
- Cantrips don't use slots (unlimited)
- Remind when slots are getting low: "That's your last 2nd-level slot."

AUTO-HIT SPELLS (Magic Missile, etc.):
1. Use get_spell_details to get damage formula
2. YOU calculate damage (roll the dice mentally or use formula)
3. State damage clearly in narrative
✓ "The three missiles streak toward the cultist, each dealing force damage! (Rolled 4, 3, 4) That's 11 total force damage!"
✓ "Magic Missile automatically hits for 12 damage (3d4+3 = 2+4+3+3)!"

ATTACK ROLL SPELLS (Fire Bolt, etc.):
1. Use get_spell_details to get attack bonus and damage
2. Request attack roll: "🎲 Roll Spell Attack (+6 to hit, vs AC 13) with Fire Bolt"
3. After player rolls, determine hit/miss and damage

SAVING THROW SPELLS (Fireball, Hold Person, etc.):
1. Use get_spell_details to get save DC and effects
2. State spell description with components
3. Request save: "🎲 Roll Dexterity Save (DC 15) to dodge the Fireball!"
4. After roll, apply damage/effects (usually half damage on success)

CONCENTRATION:
- Mark when PC casts concentration spell
- When they take damage: "You take 14 damage. 🎲 Roll Constitution Save (DC 12) to maintain concentration on [spell]."
- DC = 10 or half damage, whichever is higher
- On failure: "Your concentration breaks! [Spell] ends."
- Casting another concentration spell ends the first automatically

SPELL PRESENTATION:
Include narrative flavor with mechanics:
✓ "Kira weaves her fingers in complex patterns (S) and speaks words of eldritch power (V). As a reaction, she casts Shield, causing a shimmering barrier to appear! (+5 AC until start of her next turn)"
✓ "Taking her full action, Kira unleashes Fire Bolt, a mote of flame streaking from her fingertip!"

───────────────────────────────────────────────────────────
CONDITIONS AND STATUS EFFECTS
───────────────────────────────────────────────────────────

COMMON CONDITIONS (apply mechanical effects):

PRONE:
- Disadvantage on attack rolls
- Attacks against from within 5 feet have advantage
- Attacks against from more than 5 feet have disadvantage
- Standing up costs half movement

GRAPPLED:
- Speed becomes 0
- Ends if grappler is incapacitated or forced away

RESTRAINED:
- Speed becomes 0
- Attack rolls have disadvantage
- Attack rolls against have advantage
- Disadvantage on Dex saves

PARALYZED/STUNNED/UNCONSCIOUS:
- Can't take actions or reactions
- Auto-fail Strength and Dexterity saves
- Attack rolls against have advantage
- Hits from within 5 feet are automatic criticals (unconscious/paralyzed)

BLINDED:
- Auto-fail sight-based checks
- Attack rolls have disadvantage
- Attack rolls against have advantage

POISONED:
- Disadvantage on attack rolls and ability checks

FRIGHTENED:
- Disadvantage on checks and attacks while source in sight
- Can't move closer to source

Track conditions and remind players of effects:
✓ "You're prone, so attacks against you from nearby enemies have advantage."
✓ "You're restrained by the web - your speed is 0 and attacks against you have advantage."

───────────────────────────────────────────────────────────
XP AWARDS AND ENCOUNTER RESOLUTION
───────────────────────────────────────────────────────────

AFTER COMBAT ENDS:
1. Announce victory
2. Calculate XP from defeated enemies
3. Award XP to party

XP CALCULATION:
Use monster CR from get_monster_stats:
- CR 0 = 10 XP (if has attacks) or 0 XP
- CR 1/8 = 25 XP
- CR 1/4 = 50 XP
- CR 1/2 = 100 XP
- CR 1 = 200 XP
- CR 2 = 450 XP
- CR 3 = 700 XP
- CR 4 = 1,100 XP
- CR 5 = 1,800 XP
- CR 6 = 2,300 XP
- CR 7 = 2,900 XP
- CR 8 = 3,900 XP
- CR 9 = 5,000 XP
- CR 10 = 5,900 XP
(Higher CRs: consult standard progression)

AWARD FORMAT:
✓ "Combat ends! You defeated 2 Goblins (CR 1/4 each = 50 XP) and 1 Hobgoblin (CR 1/2 = 100 XP). Total XP: 200 XP divided among the party."
✓ "Victory! The Cult Fanatic (CR 2 = 450 XP) is defeated. Each party member gains 150 XP."

───────────────────────────────────────────────────────────
COMBAT COMMUNICATION EXAMPLES
───────────────────────────────────────────────────────────

STARTING COMBAT:
"The goblin shrieks and draws its scimitar! Two more emerge from the shadows, bows ready. Combat begins!
🎲 Roll Initiative for Kira, Thorne, Riven, and the three Goblins"

ANNOUNCING TURNS:
"Round 1 begins! Kira, you're up first. Thorne, you're on deck."

REQUESTING ATTACKS:
"The cultist is 20 feet away, AC 13. What do you do?"
[Player: "I attack with my longsword"]
"🎲 Roll Attack (vs AC 13) with your longsword"

RESOLVING ATTACKS:
"That's an 18 - that hits! Roll damage for your longsword."
[Player rolls 6 damage]
"Your blade cuts deep, dealing 6 slashing damage! The cultist is bloodied, blood streaming from the wound."

ENEMY ATTACKS:
"The goblin attacks Thorne with its scimitar! (Rolled 15+4 = 19 to hit) That beats your AC 16 - the blade finds a gap in your armor, dealing 5 slashing damage. You're at 19/24 HP."

SPELL CASTING:
"Kira gestures and speaks arcane words (V, S), casting Magic Missile at 1st level! Three bolts of force streak toward the cultist. (Rolling 1d4+1 each: 3, 4, 2) That's 9 force damage total! The cultist staggers, now badly wounded and barely standing."

DEATH SAVES:
"You're unconscious at 0 HP. At the start of your turn, roll a d20 for your death saving throw."
[Player rolls 12]
"That's a success - one success, zero failures. You're still unconscious but stable so far."

ENDING COMBAT:
"The last goblin falls! Combat ends. You defeated 3 Goblins (CR 1/4 each = 50 XP × 3 = 150 XP total). Each of you gains 50 XP. The chamber falls silent except for your heavy breathing."

═══════════════════════════════════════════════════════════
END D&D 5E COMBAT MECHANICS
═══════════════════════════════════════════════════════════`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.modelName,
                system: enhancedSystem,
                messages: messages,
                max_tokens: 2000,
                temperature: 0.7,
                tools: tools
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.log(`❌ Claude API Error Details: ${errorBody}`);
            throw new Error(`Claude API error: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const data = await response.json();

        // Handle tool use
        if (data.stop_reason === 'tool_use') {
            console.log('🔧 Claude requested tool use');
            const toolResults = await this.handleToolUse(data.content);

            // Continue conversation with tool results
            const followUpMessages = [...messages, {
                role: 'assistant',
                content: data.content
            }, {
                role: 'user',
                content: toolResults
            }];

            // Recursive call without tools to get final response - pass enhanced system prompt
            return await this.generateResponseWithoutTools(enhancedSystem, followUpMessages, apiKey);
        }

        // Normal text response
        if (data.content && data.content[0]) {
            const duration = Date.now() - startTime;
            let content = data.content[0].text;
            const tokens = data.usage?.input_tokens + data.usage?.output_tokens || 'unknown';

            console.log(`✅ [AI] Claude response received (${duration}ms)`, {
                tokens,
                responseLength: content.length,
                inputTokens: data.usage?.input_tokens,
                outputTokens: data.usage?.output_tokens,
                stopReason: data.stop_reason
            });

            content = content.replace(/\*\*DM \([^)]+\)\*\*/g, '').trim();
            // Don't add DM signature - it's in the UI header
            return content;
        } else {
            throw new Error('No content in Claude response');
        }
    }

    async handleToolUse(contentBlocks) {
        const toolResults = [];

        for (const block of contentBlocks) {
            if (block.type === 'tool_use') {
                console.log(`🔍 Tool: ${block.name} with input:`, block.input);
                let result;

                try {
                    if (block.name === 'get_spell_details') {
                        result = await this.rulesService.getSpellDetails(
                            block.input.spell_name,
                            block.input.cast_at_level
                        );
                    } else if (block.name === 'get_monster_stats') {
                        result = await this.rulesService.getMonsterStats(block.input.monster_name);
                    } else if (block.name === 'get_item_details') {
                        result = await this.rulesService.getItemDetails(block.input.item_name);
                    }

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: JSON.stringify(result, null, 2)
                    });
                } catch (error) {
                    console.error(`❌ Tool error:`, error);
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: block.id,
                        content: `Error: ${error.message}`,
                        is_error: true
                    });
                }
            }
        }

        return toolResults;
    }

    async generateResponseWithoutTools(system, messages, apiKey) {
        const fetch = require('node-fetch');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.modelName,
                system: system,
                messages: messages,
                max_tokens: 2000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status}`);
        }

        const data = await response.json();
        if (data.content && data.content[0]) {
            let content = data.content[0].text;
            content = content.replace(/\*\*DM \([^)]+\)\*\*/g, '').trim();
            // Don't add DM signature - it's in the UI header
            return content;
        } else {
            throw new Error('No content in Claude response');
        }
    }

    getApiKey() {
        try {
            const fs = require('fs');
            const config = JSON.parse(fs.readFileSync('./api-config.json', 'utf8'));
            const fileKey = (config.api_key || '').trim();
            if (fileKey) {
                if (!this._apiKeyLoggedFromFile) {
                    console.log('🔑 Using Claude API key from api-config.json');
                    this._apiKeyLoggedFromFile = true;
                }
                return fileKey;
            }
        } catch (err) {
            // Fall through to environment lookup below
        }

        const envKey = process.env.CLAUDE_API_KEY && process.env.CLAUDE_API_KEY.trim();
        if (envKey) {
            if (!this._apiKeyLoggedFromEnv) {
                console.log('🔑 Using Claude API key from environment variables');
                this._apiKeyLoggedFromEnv = true;
            }
            return envKey;
        }

        console.error('❌ Claude API key not configured in api-config.json or environment');
        throw new Error('Claude API key not configured in api-config.json or environment');
    }
}

// DeepSeek Provider
class DeepSeekProvider extends BaseAIProvider {
    constructor() {
        super('deepseek', 'deepseek-chat');
    }

    async generateResponse(system, messages) {
        const startTime = Date.now();
        const fetch = require('node-fetch');
        const apiKey = process.env.DEEPSEEK_API_KEY;

        if (!apiKey) {
            throw new Error('DeepSeek API key not found in environment variables');
        }

        console.log('🤖 [AI] DeepSeek request starting', {
            model: this.modelName,
            messageCount: messages.length,
            systemPromptLength: system.length
        });

        const enhancedSystem = system + `

CRITICAL: You are the Dungeon Master. Follow the INTELLIGENT DICE ROLL SYSTEM in your context:
- ONLY request dice when outcome is truly uncertain and mechanically significant
- For routine actions, complete the narrative directly WITHOUT asking for rolls
- If dice ARE needed: Use EXACTLY "🎲 Roll [SkillName] (DC [number]) to [action]" then STOP
- NEVER provide multiple roll options - pick ONE roll or complete the narrative
- FORBIDDEN: Describing outcomes after requesting a roll in the same response
- Phase 2 responses (after rolls): Continue narrative based on result, NO MORE DICE

SILVERPEAK LORE GUARDRAILS:
- The campaign is Silverpeak Chronicles, a high-fantasy realm with medieval technology and pervasive magic.
- Keep references grounded in Thornhaven, the Silverpeak Mountains, and the Whispering Woods when relevant.
- Use gold pieces, spell slots, potions, and other fantasy terminology—never credits, plasma weapons, or sci-fi tech.`;

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: this.modelName,
                messages: [
                    { role: 'system', content: enhancedSystem },
                    ...messages
                ],
                max_tokens: 2000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const duration = Date.now() - startTime;
            const content = data.choices[0].message.content;
            const tokens = data.usage?.total_tokens || 'unknown';

            console.log(`✅ [AI] DeepSeek response received (${duration}ms)`, {
                tokens,
                responseLength: content.length,
                promptTokens: data.usage?.prompt_tokens,
                completionTokens: data.usage?.completion_tokens
            });

            let cleanedContent = content.replace(/\*\*DM \([^)]+\)\*\*/g, '').trim();
            cleanedContent += '\n\n**DM (DEEPSEEK)**';
            return cleanedContent;
        } else {
            throw new Error('No content in DeepSeek response');
        }
    }
}

// GPT-4 Provider
class GPT4Provider extends BaseAIProvider {
    constructor() {
        super('gpt4', 'gpt-4o');
    }

    async generateResponse(system, messages) {
        const startTime = Date.now();
        const fetch = require('node-fetch');
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error('OpenAI API key not found in environment variables');
        }

        console.log('🤖 [AI] GPT-4 request starting', {
            model: this.modelName,
            messageCount: messages.length,
            systemPromptLength: system.length
        });

        const enhancedSystem = system + `

CRITICAL: You are the Dungeon Master. Follow the INTELLIGENT DICE ROLL SYSTEM in your context:
- ONLY request dice when outcome is truly uncertain and mechanically significant
- For routine actions, complete the narrative directly WITHOUT asking for rolls
- If dice ARE needed: Use EXACTLY "🎲 Roll [SkillName] (DC [number]) to [action]" then STOP
- NEVER provide multiple roll options - pick ONE roll or complete the narrative
- FORBIDDEN: Describing outcomes after requesting a roll in the same response
- Phase 2 responses (after rolls): Continue narrative based on result, NO MORE DICE

SILVERPEAK LORE GUARDRAILS:
- The campaign is Silverpeak Chronicles, a high-fantasy realm with medieval technology and pervasive magic.
- Keep references grounded in Thornhaven, the Silverpeak Mountains, and the Whispering Woods when relevant.
- Use gold pieces, spell slots, potions, and other fantasy terminology—never credits, plasma weapons, or sci-fi tech.`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: this.modelName,
                messages: [
                    { role: 'system', content: enhancedSystem },
                    ...messages
                ],
                max_tokens: 2000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`GPT-4 API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const duration = Date.now() - startTime;
            const content = data.choices[0].message.content;
            const tokens = data.usage?.total_tokens || 'unknown';

            console.log(`✅ [AI] GPT-4 response received (${duration}ms)`, {
                tokens,
                responseLength: content.length,
                promptTokens: data.usage?.prompt_tokens,
                completionTokens: data.usage?.completion_tokens
            });

            let cleanedContent = content.replace(/\*\*DM \([^)]+\)\*\*/g, '').trim();
            // Don't add DM signature - it's in the UI header
            return cleanedContent;
        } else {
            throw new Error('No content in GPT-4 response');
        }
    }
}

// ==================== INTELLIGENT CONTEXT MANAGER ====================
class IntelligentContextManager {
    constructor(campaignId = 'default') {
        // Store campaign ID for this context
        this.campaignId = campaignId;

        // Initialize AI provider manager
        this.aiProvider = new AIProviderManager();

        // System prompt (DM personality and rules) - will be loaded from campaign-specific file
        this.CORE_FACTS = null;

        // Complete memory storage
        this.completeMemory = {
            fullCampaignText: '',
            indexedEvents: [],
            characterHistories: {},
            locationMemories: {},
            npcInteractions: {},
            itemHistory: {},
            combatLog: [],
            plotThreads: {},
            timelineIndex: []
        };

        // Combat state management
        this.combatState = {
            active: false,
            round: 0,
            currentTurn: 0,
            initiativeOrder: []
        };

        // Context windows
        this.contextWindows = {
            immediate: [],
            recent: [],
            session: [],
            relevant: []
        };

        // Search indices for instant retrieval
        this.searchIndices = {
            keywords: {},
            locations: {},
            npcs: {},
            items: {},
            timeframes: {},
            combat: {}
        };

        // Campaign state (for game mechanics)
        this.campaignState = null;
        this.characterSheets = {};

        // Database for structured storage (Silverpeak only)
        this.db = null;
        // RAG memory service (Silverpeak only)
        this.memoryClient = null;

        // Lightweight caches
        this.monsterCache = new Map();

        // Campaign-specific file paths
        const campaignDir = `./campaigns/${campaignId}`;
        this.paths = {
            fullCampaign: `${campaignDir}/FULL_CAMPAIGN_MEMORY.json`,
            searchIndex: `${campaignDir}/SEARCH_INDEX.json`,
            campaignState: `${campaignDir}/campaign-state.json`,
            conversationHistory: `${campaignDir}/conversation-history.json`,
            emergencyExport: `${campaignDir}/EMERGENCY-CAMPAIGN-EXPORT-2025-09-23.md`,
            dmPrompt: `${campaignDir}/dm-prompt.md`,
            defaultDmPrompt: './dm-system-prompt.md'
        };

        this.isLoaded = false;
        this.totalMemorySize = 0;
    }


    async initialize() {
        console.log('🧠 Initializing Complete Intelligent Campaign System...');

        // Load EVERYTHING
        await this.loadSystemPrompt();
        await this.loadCompleteHistory();
        await this.loadCampaignState();
        await this.buildSearchIndices();
        await this.createRelevanceMap();

        // Initialize database for Silverpeak
        if (this.campaignId === 'test-silverpeak') {
            console.log('📊 Initializing database for Silverpeak...');
            try {
                this.db = new CampaignDatabase(this.campaignId);
                await this.db.initialize();
                console.log('✅ Database initialized');
            } catch (error) {
                console.error('❌ Failed to initialize database:', error);
                console.error('   Falling back to JSON state management');
                this.db = null;
            }

            // Initialize RAG memory service
            console.log('🧠 Initializing RAG memory service...');
            try {
                this.memoryClient = new MemoryClient('http://localhost:5003', this.campaignId);
                const health = await this.memoryClient.checkHealth();
                if (health) {
                    console.log('✅ RAG memory service connected');
                } else {
                    console.warn('⚠️  RAG memory service not responding');
                    this.memoryClient = null;
                }
            } catch (error) {
                console.error('❌ Failed to connect to RAG service:', error);
                this.memoryClient = null;
            }
        }

        this.isLoaded = true;
        console.log(`✅ Loaded ${this.totalMemorySize} bytes of campaign history`);
        console.log(`📊 Indexed ${this.indexedEvents.length} discrete events`);
        console.log(`🎲 Campaign state loaded with ${Object.keys(this.characterSheets).length} characters`);
    }

    async loadCompleteHistory() {
        try {
            // First try to load the emergency export (the massive file)
            const campaignExport = await fs.readFile(this.paths.emergencyExport, 'utf8');
            this.completeMemory.fullCampaignText = campaignExport;
            this.totalMemorySize = campaignExport.length;

            console.log(`📚 Loaded emergency export: ${(this.totalMemorySize / 1024 / 1024).toFixed(2)} MB`);

            // Parse into events
            this.parseIntoEvents(campaignExport);

            // ALWAYS also load current conversation history on top of emergency export
            try {
                const convHistory = await fs.readFile(this.paths.conversationHistory, 'utf8');
                const history = JSON.parse(convHistory);
                console.log(`📚 Adding ${history.length} current conversation entries...`);
                this.parseConversationHistory(history);
            } catch (convErr) {
                console.log('📝 No current conversation history found, using emergency export only');
            }

        } catch (err) {
            console.log('📝 No emergency export found, loading from conversation history...');
            
            // Fallback to conversation history
            try {
                // Initialize indexed events array
                this.indexedEvents = [];
                const convHistory = await fs.readFile(this.paths.conversationHistory, 'utf8');
                const history = JSON.parse(convHistory);
                console.log(`📚 Parsing ${history.length} conversation entries...`);
                this.parseConversationHistory(history);
            } catch (err2) {
                console.log('❌ Failed to load conversation history:', err2.message);
                console.log('📂 Checking file:', this.paths.conversationHistory);
                this.indexedEvents = [];
            }
        }
    }

    async loadCampaignState() {
        try {
            const stateData = await fs.readFile(this.paths.campaignState, 'utf8');
            this.campaignState = JSON.parse(stateData);
            
            // Extract character sheets
            if (this.campaignState.party) {
                this.characterSheets = this.campaignState.party;
            }
            
            // Ensure critical NPCs exist (campaign-specific)
            if (!this.campaignState.key_npcs) {
                this.campaignState.key_npcs = {};
            }

            // Silverpeak campaign: ensure crucial NPC anchors exist
            if (this.campaignId === 'test-silverpeak') {
                if (!this.campaignState.world) {
                    this.campaignState.world = {};
                }
                this.campaignState.world.currentLocation = this.campaignState.world.currentLocation || 'Thornhaven';
                this.campaignState.world.timeOfDay = this.campaignState.world.timeOfDay || 'Afternoon';
                this.campaignState.world.weather = this.campaignState.world.weather || 'Crisp autumn breeze from the mountains';

                if (!this.campaignState.key_npcs.elder_miriam) {
                    this.campaignState.key_npcs.elder_miriam = {
                        name: "Elder Miriam",
                        role: "Village elder of Thornhaven",
                        status: "Anxious about the missing Westmarch caravan",
                        importance: "Quest giver and moral compass for the party"
                    };
                }
            }
            
            console.log('📋 Campaign state loaded successfully');
            
        } catch (err) {
            console.log('⚠️ No campaign state found, using defaults');
            this.campaignState = this.getDefaultCampaignState();
        }
    }

    async loadSystemPrompt() {
        try {
            // Try to load campaign-specific DM prompt first
            console.log(`🎭 Looking for campaign-specific DM prompt: ${this.paths.dmPrompt}`);
            const campaignPrompt = await fs.readFile(this.paths.dmPrompt, 'utf8');
            this.CORE_FACTS = campaignPrompt;
            console.log(`✅ Loaded campaign-specific DM prompt for ${this.campaignId} (${campaignPrompt.length} chars)`);
        } catch (err) {
            // Fall back to default DM prompt
            console.log(`📝 No campaign-specific prompt found, using default: ${this.paths.defaultDmPrompt}`);
            try {
                const defaultPrompt = await fs.readFile(this.paths.defaultDmPrompt, 'utf8');
                this.CORE_FACTS = defaultPrompt;
                console.log(`✅ Loaded default DM prompt (${defaultPrompt.length} chars)`);
            } catch (defaultErr) {
                console.log('❌ Failed to load any DM prompt:', defaultErr.message);
                // Use minimal fallback prompt
                this.CORE_FACTS = `You are the Dungeon Master. Run an engaging D&D campaign with fair rulings and compelling storytelling.`;
            }
        }
    }

    getDefaultCampaignState() {
        return {
            current_time: "Late afternoon",
            current_location: "Thornhaven - Laughing Griffin Tavern",
            characters: {
                kira: {
                    name: "Kira Moonwhisper",
                    ancestry: "Moon Elf",
                    class: "Arcane Scholar",
                    level: 3,
                    hp: { current: 18, max: 18 },
                    ac: 13,
                    abilities: {
                        strength: 10,
                        dexterity: 14,
                        constitution: 12,
                        intelligence: 18,
                        wisdom: 13,
                        charisma: 15
                    },
                    gold: 500,
                    credits: 500,
                    inventory: [
                        "Advance payment pouch (250 gp from Elder Miriam)",
                        "Arcane focus crystal",
                        "Traveling spellbook"
                    ],
                    spells: [
                        "Prestidigitation",
                        "Mage Hand",
                        "Fire Bolt",
                        "Detect Magic",
                        "Shield",
                        "Magic Missile",
                        "Misty Step",
                        "Detect Thoughts"
                    ],
                    conditions: []
                },
                thorne: {
                    name: "Thorne Ironheart",
                    ancestry: "Mountain Dwarf",
                    class: "Battle Cleric",
                    level: 3,
                    hp: { current: 24, max: 24 },
                    ac: 16,
                    abilities: {
                        strength: 16,
                        dexterity: 10,
                        constitution: 16,
                        intelligence: 10,
                        wisdom: 17,
                        charisma: 12
                    },
                    gold: 500,
                    credits: 500,
                    inventory: [
                        "Healing potion",
                        "Healer's kit (10 uses)",
                        "Holy symbol of Moradin",
                        "Rations (1 day)"
                    ],
                    spells: [
                        "Cure Wounds",
                        "Bless",
                        "Guiding Bolt"
                    ],
                    conditions: []
                },
                riven: {
                    name: "Riven Shadowstep",
                    ancestry: "Half-Elf",
                    class: "Shadow Rogue",
                    level: 3,
                    hp: { current: 20, max: 20 },
                    ac: 15,
                    abilities: {
                        strength: 12,
                        dexterity: 18,
                        constitution: 13,
                        intelligence: 14,
                        wisdom: 12,
                        charisma: 14
                    },
                    gold: 500,
                    credits: 500,
                    inventory: [
                        "Thieves' tools",
                        "Shortbow with 20 arrows",
                        "Throwing daggers (x3)",
                        "Cloak of muted hues"
                    ],
                    features: [
                        "Sneak Attack",
                        "Cunning Action",
                        "Uncanny Dodge"
                    ],
                    conditions: []
                }
            },
            party: {
                credits: 1500,
                gold: 1500,
                inventory: [],
                reputation: {}
            },
            world: {
                currentLocation: "Thornhaven",
                timeOfDay: "Afternoon",
                weather: "Crisp autumn breeze rolling down from the Silverpeak Mountains"
            },
            quests: {
                active: [
                    {
                        id: "whispering-woods-shadows",
                        title: "Investigate the Whispering Woods",
                        summary: "Follow the trail of the missing Westmarch caravan and confront the shadowy force lurking between the pines.",
                        status: "open"
                    }
                ],
                completed: []
            },
            key_npcs: {
                elder_miriam: {
                    name: "Elder Miriam",
                    role: "Village elder of Thornhaven",
                    status: "Awaiting news from the adventurers",
                    importance: "Quest giver and trusted community leader"
                }
            }
        };
    }

    parseIntoEvents(campaignText) {
        const lines = campaignText.split('\n');
        let currentEvent = {
            index: 0,
            type: '',
            content: '',
            metadata: {}
        };

        let isHistorical = true; // Start as historical, becomes current after chapter break

        lines.forEach((line, i) => {
            // Detect chapter break - marks transition from historical to current
            if (line.includes('[END OF CHAPTER 1: THE WANDERER]') ||
                line.includes('CHAPTER 2: TITAN STATION')) {
                isHistorical = false;
                console.log(`📖 Chapter break detected at line ${i} - switching to current events`);
            }

            // Detect player actions
            if (line.includes('player:') || line.includes('**Player Action**')) {
                if (currentEvent.content) {
                    this.indexedEvents.push(currentEvent);
                }
                currentEvent = {
                    index: this.indexedEvents.length,
                    type: 'PLAYER_ACTION',
                    content: line,
                    lineNumber: i,
                    metadata: this.extractMetadata(line, isHistorical)
                };
            }
            // Detect DM responses
            else if (line.includes('🎲') || line.includes('DM:') ||
                     line.startsWith('The ') || line.startsWith('You ')) {
                if (currentEvent.type === 'PLAYER_ACTION') {
                    currentEvent.type = 'EXCHANGE';
                }
                currentEvent.content += '\n' + line;

                // Update metadata with historical context
                currentEvent.metadata.isHistorical = isHistorical;

                // Check for dice rolls
                if (line.includes('🎲')) {
                    currentEvent.metadata.hasDiceRoll = true;
                    currentEvent.metadata.diceRollText = line;
                }
            }
            else {
                currentEvent.content += '\n' + line;
            }
        });
        
        if (currentEvent.content) {
            this.indexedEvents.push(currentEvent);
        }
    }

    parseConversationHistory(history) {
        history.forEach((entry, i) => {
            // All conversation history is current (Chapter 2+)
            this.indexedEvents.push({
                index: i,
                type: entry.role === 'player' ? 'PLAYER_ACTION' : 'DM_RESPONSE',
                content: entry.content,
                timestamp: entry.timestamp,
                metadata: this.extractMetadata(entry.content, false) // false = current, not historical
            });
        });
    }

    extractMetadata(text, isHistorical = false) {
        const metadata = {
            keywords: [],
            npcs: [],
            locations: [],
            items: [],
            combat: false,
            dice: false,
            hasDiceRoll: false,
            isHistorical: isHistorical
        };
        
        const lowerText = text.toLowerCase();
        
        // Extract NPCs
        const npcPatterns = [
            'elder miriam',
            'ewan',
            'thornhaven guard',
            'silverpeak ranger',
            'kira',
            'thorne',
            'riven',
            'innkeeper',
            'travelling merchant',
            'shadowed figure',
            'druid',
            'warden'
        ];
        npcPatterns.forEach(npc => {
            if (lowerText.includes(npc)) {
                metadata.npcs.push(npc);
            }
        });
        
        // Extract locations
        const locationPatterns = [
            'thornhaven',
            'laughing griffin',
            'silverpeak',
            'whispering woods',
            'moonwell',
            'ancient ruins',
            'village square',
            'temple',
            'catacombs',
            'mountain pass',
            'forest glade',
            'caravan trail'
        ];
        locationPatterns.forEach(loc => {
            if (lowerText.includes(loc)) {
                metadata.locations.push(loc);
            }
        });
        
        // Extract items
        const itemPatterns = [
            'longsword',
            'warhammer',
            'dagger',
            'shortbow',
            'holy symbol',
            'spellbook',
            'focus',
            'potion',
            'gold',
            'map',
            'amulet',
            'arcane crystal',
            'scroll',
            'ancient relic'
        ];
        itemPatterns.forEach(item => {
            if (lowerText.includes(item)) {
                metadata.items.push(item);
            }
        });
        
        // Detect combat and dice
        if (lowerText.includes('attack') || lowerText.includes('fight') || 
            lowerText.includes('combat') || lowerText.includes('🎲')) {
            metadata.combat = true;
            metadata.dice = lowerText.includes('🎲');
            metadata.hasDiceRoll = lowerText.includes('🎲');
        }
        
        // Extract keywords
        const words = text.split(/\s+/);
        words.forEach(word => {
            if (word.length > 4 && !['that', 'this', 'with', 'from'].includes(word.toLowerCase())) {
                metadata.keywords.push(word.toLowerCase().replace(/[^a-z0-9]/g, ''));
            }
        });
        
        return metadata;
    }

    async buildSearchIndices() {
        console.log('🔨 Building search indices...');
        
        this.indexedEvents.forEach(event => {
            // Index by keywords
            if (event.metadata && event.metadata.keywords && Array.isArray(event.metadata.keywords)) {
                event.metadata.keywords.forEach(keyword => {
                    if (!this.searchIndices.keywords[keyword]) {
                        this.searchIndices.keywords[keyword] = [];
                    }
                    this.searchIndices.keywords[keyword].push(event.index);
                });
            }
            
            // Index by NPCs
            if (event.metadata && event.metadata.npcs && Array.isArray(event.metadata.npcs)) {
                event.metadata.npcs.forEach(npc => {
                    if (!this.searchIndices.npcs[npc]) {
                        this.searchIndices.npcs[npc] = [];
                    }
                    this.searchIndices.npcs[npc].push(event.index);

                    // Build NPC interaction history
                    if (!this.completeMemory.npcInteractions[npc]) {
                        this.completeMemory.npcInteractions[npc] = [];
                    }
                    this.completeMemory.npcInteractions[npc].push({
                        eventIndex: event.index,
                        content: event.content
                    });
                });
            }

            // Index by locations
            if (event.metadata && event.metadata.locations && Array.isArray(event.metadata.locations)) {
                event.metadata.locations.forEach(location => {
                    if (!this.searchIndices.locations[location]) {
                        this.searchIndices.locations[location] = [];
                    }
                    this.searchIndices.locations[location].push(event.index);

                    // Build location memories
                    if (!this.completeMemory.locationMemories[location]) {
                        this.completeMemory.locationMemories[location] = [];
                    }
                    this.completeMemory.locationMemories[location].push({
                        eventIndex: event.index,
                        content: event.content
                    });
                });
            }
            
            // Index combat
            if (event.metadata.combat) {
                this.completeMemory.combatLog.push({
                    eventIndex: event.index,
                    content: event.content,
                    hasDice: event.metadata.hasDiceRoll
                });
            }
        });
        
        console.log(`✅ Indexed ${Object.keys(this.searchIndices.npcs).length} NPCs`);
        console.log(`✅ Indexed ${Object.keys(this.searchIndices.locations).length} locations`);
    }

    async createRelevanceMap() {
        // Create relevance connections between events
        this.relevanceMap = {};
        
        this.indexedEvents.forEach((event, i) => {
            this.relevanceMap[i] = {
                directlyRelated: [],
                topicallyRelated: [],
                chronologically: []
            };
            
            // Find directly related (within 5 events)
            for (let j = Math.max(0, i - 5); j < Math.min(this.indexedEvents.length, i + 5); j++) {
                if (j !== i) {
                    this.relevanceMap[i].directlyRelated.push(j);
                }
            }
        });
    }

    // ==================== INTELLIGENT RETRIEVAL ====================
    async retrieveRelevantContext(playerAction) {
        console.log(`🎯 Retrieving context for: "${playerAction.substring(0, 50)}..."`);

        const relevantContext = {
            immediate: this.getCurrentEvents(100), // Comprehensive recent context - last 100 current events
            specific: [],
            historical: this.getHistoricalEvents(5), // Minimal historical context
            worldState: this.getCurrentWorldState(),
            campaignState: this.campaignState
        };
        
        const actionLower = playerAction.toLowerCase();
        
        // Check for dice roll request
        if (actionLower.includes('roll') || actionLower.includes('🎲')) {
            relevantContext.needsDiceRoll = true;
        }
        
        // Simple continuation check
        if (this.isSimpleContinuation(actionLower)) {
            relevantContext.specific = this.getCurrentEvents(8); // EXTREME recency bias for continuations
            console.log('📋 Simple continuation - using only last 8 current events');
            return relevantContext;
        }
        
        // NPC references
        const referencedNpcs = this.findReferencedNPCs(actionLower);
        if (referencedNpcs.length > 0) {
            console.log(`👥 Found NPC references: ${referencedNpcs.join(', ')}`);
            referencedNpcs.forEach(npc => {
                const npcHistory = this.completeMemory.npcInteractions[npc] || [];
                relevantContext.specific.push({
                    type: 'NPC_HISTORY',
                    npc: npc,
                    interactions: npcHistory.slice(-2) // Only last 2 interactions per NPC
                });
            });
        }
        
        // Location references
        const referencedLocations = this.findReferencedLocations(actionLower);
        if (referencedLocations.length > 0) {
            console.log(`📍 Found location references: ${referencedLocations.join(', ')}`);
            referencedLocations.forEach(location => {
                const locationHistory = this.completeMemory.locationMemories[location] || [];
                relevantContext.specific.push({
                    type: 'LOCATION_HISTORY',
                    location: location,
                    events: locationHistory.slice(-1) // Only last 1 event per location
                });
            });
        }

        // CRITICAL FIX: Always include timeline/meeting context
        console.log(`⏰ Adding timeline context (legal meeting, deadlines, urgent events)`);
        const timelineContext = this.getTimelineContext();
        if (timelineContext.length > 0) {
            relevantContext.specific.push({
                type: 'TIMELINE_CRITICAL',
                events: timelineContext
            });
        }
        
        // Memory references
        if (actionLower.includes('remember') || actionLower.includes('recall') || 
            actionLower.includes('that time') || actionLower.includes('earlier')) {
            console.log('💭 Memory reference detected');
            const memoryKeywords = this.extractKeywords(actionLower);
            const relatedEvents = this.searchByKeywords(memoryKeywords);
            relevantContext.historical = relatedEvents.slice(0, 5);
        }
        
        // Combat context
        if (actionLower.includes('attack') || actionLower.includes('fight') || 
            actionLower.includes('combat')) {
            console.log('⚔️ Combat context needed');
            relevantContext.specific.push({
                type: 'COMBAT_STATUS',
                recentCombat: this.completeMemory.combatLog.slice(-2)
            });
        }
        

        console.log(`📊 Context retrieved: ${relevantContext.immediate.length} immediate, ${relevantContext.specific.length} specific, ${relevantContext.historical.length} historical`);
        return relevantContext;
    }

    getTimelineContext() {
        // Find events about legal meetings, deadlines, time pressure
        const timelineKeywords = [
            'legal meeting', 'meeting', '0600', '0800',
            'deadline', 'hours remain', 'timeline', 'kellerman',
            'three hours', 'osprey', 'torres', 'holbrook',
            'charges', 'filing', 'advancing', 'brutal'
        ];

        const timelineEvents = [];

        // Search through all events for timeline-critical information
        this.indexedEvents.forEach(event => {
            const contentLower = event.content.toLowerCase();

            if (timelineKeywords.some(keyword => contentLower.includes(keyword))) {
                timelineEvents.push(event);
            }
        });

        // Return the most recent 5 timeline-critical events
        console.log(`⏰ Found ${timelineEvents.length} timeline events`);
        return timelineEvents.slice(-5);
    }

    isSimpleContinuation(action) {
        const continuationPhrases = [
            'looks', 'walks', 'says', 'nods', 'shakes', 'continues',
            'waits', 'thinks', 'considers', 'watches', 'listens', 'smiles'
        ];
        
        return continuationPhrases.some(phrase => action.includes(phrase)) &&
               !action.includes('remember') &&
               !action.includes('recall') &&
               !action.includes('earlier') &&
               !action.includes('roll');
    }

    findReferencedNPCs(text) {
        const npcs = [];
        Object.keys(this.searchIndices.npcs || {}).forEach(npc => {
            if (text.includes(npc)) {
                npcs.push(npc);
            }
        });
        return npcs;
    }

    findReferencedLocations(text) {
        const locations = [];
        Object.keys(this.searchIndices.locations || {}).forEach(location => {
            if (text.includes(location)) {
                locations.push(location);
            }
        });
        return locations;
    }

    extractKeywords(text) {
        const words = text.split(/\s+/);
        return words.filter(word => 
            word.length > 4 && 
            !['that', 'when', 'where', 'what', 'this'].includes(word)
        ).map(word => word.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }

    searchByKeywords(keywords) {
        const relevantIndices = new Set();
        keywords.forEach(keyword => {
            const indices = this.searchIndices.keywords[keyword] || [];
            indices.forEach(i => relevantIndices.add(i));
        });
        return Array.from(relevantIndices)
            .map(i => this.indexedEvents[i])
            .sort((a, b) => b.index - a.index);
    }

    getLastNEvents(n) {
        // Always send at least what was requested, more if we can
        const minimum = Math.min(n * 10, 300); // 10x more, max 300
        const actualCount = Math.max(n, minimum);
        return this.indexedEvents.slice(-actualCount);
    }

    getCurrentEvents(n) {
        // Get only current (non-historical) events
        const currentEvents = this.indexedEvents.filter(event =>
            !event.metadata || !event.metadata.isHistorical
        );
        return currentEvents.slice(-n);
    }

    getHistoricalEvents(n) {
        // Get only historical events for background context
        const historicalEvents = this.indexedEvents.filter(event =>
            event.metadata && event.metadata.isHistorical
        );
        return historicalEvents.slice(-n);
    }

    getCurrentWorldState() {
        const recent = this.indexedEvents.slice(-50);

        // Extract current time/location dynamically from recent events
        const currentTime = this.extractCurrentTime(recent);
        const currentLocation = this.extractCurrentLocation(recent);

        const state = {
            currentLocation: currentLocation,
            currentTime: currentTime,
            activeNPCs: [],
            currentThreats: this.extractCurrentThreats(recent),
            party: this.campaignState?.party || {}
        };
        
        // Find recently active NPCs
        const recentNPCs = new Set();
        recent.slice(-10).forEach(event => {
            if (event.metadata && event.metadata.npcs) {
                event.metadata.npcs.forEach(npc => recentNPCs.add(npc));
            }
        });
        state.activeNPCs = Array.from(recentNPCs);
        
        return state;
    }

    extractCurrentTime(recentEvents) {
        // Look for time references in most recent events
        for (const event of recentEvents.slice(-20).reverse()) {
            const content = event.content.toLowerCase();

            // Look for specific time mentions
            const timeMatch = content.match(/(\d{2}):?(\d{2})\s*hours?|(\d{1,2})\s*minutes?\s*(until|remaining)/i);
            if (timeMatch) {
                return `Current time context from recent events`;
            }

            // Look for chronometer mentions
            if (content.includes('chronometer') || content.includes('shows')) {
                const chronoMatch = content.match(/(?:chronometer|shows)\s*(\d{2}):?(\d{2})/i);
                if (chronoMatch) {
                    return `${chronoMatch[1]}:${chronoMatch[2]} hours`;
                }
            }
        }

        // Default if no time found
        return 'Time progressing naturally';
    }

    extractCurrentLocation(recentEvents) {
        // Look for location references in most recent events
        for (const event of recentEvents.slice(-10).reverse()) {
            const content = event.content.toLowerCase();

            if (content.includes('laughing griffin') || content.includes('tavern')) {
                return 'Thornhaven - Laughing Griffin Tavern';
            }
            if (content.includes('thornhaven')) {
                return 'Thornhaven';
            }
            if (content.includes('whispering woods') || content.includes('forest')) {
                return 'Whispering Woods';
            }
            if (content.includes('mountain') || content.includes('pass')) {
                return 'Silverpeak Mountains';
            }
            if (content.includes('ruins') || content.includes('temple')) {
                return 'Ancient ruins near Silverpeak';
            }
        }

        return this.campaignState?.world?.currentLocation || 'Silverpeak Hinterlands';
    }

    extractCurrentThreats(recentEvents) {
        // Look for current threats/deadlines in recent conversation
        const threats = {
            immediate: [],
            timeline: []
        };

        for (const event of recentEvents.slice(-30)) {
            const content = event.content.toLowerCase();

            if (content.includes('shadow') || content.includes('darkness') || content.includes('whispering')) {
                threats.immediate.push('Shadow-haunted presence in the Whispering Woods');
            }
            if (content.includes('caravan') || content.includes('missing')) {
                threats.timeline.push('Missing Westmarch caravan');
            }
            if (content.includes('ritual') || content.includes('corruption') || content.includes('blight')) {
                threats.timeline.push('Arcane corruption spreading through the woods');
            }
            if (content.includes('village') && content.includes('threat')) {
                threats.immediate.push('Thornhaven in immediate danger');
            }
        }

        return {
            immediate: threats.immediate.join(', ') || 'Lingering menace near Thornhaven',
            timeline: threats.timeline.join(', ') || 'Mystery of the Whispering Woods'
        };
    }

    // Simple keyword search through conversation history (Claude Web approach)
    searchConversationHistory(keywords, maxResults = 10) {
        const results = [];
        const lowerKeywords = keywords.map(k => k.toLowerCase());

        // Get conversation history from indexedEvents
        const conversationEntries = this.indexedEvents.filter(event =>
            !event.metadata || !event.metadata.isHistorical
        );

        // Search backwards through history (recent first)
        for (let i = conversationEntries.length - 1; i >= 0; i--) {
            const entry = conversationEntries[i];
            const content = entry.content.toLowerCase();

            // Check if this entry contains any keywords
            if (lowerKeywords.some(keyword => content.includes(keyword))) {
                results.push(entry);

                // Include surrounding context (2 before, 2 after)
                for (let j = Math.max(0, i - 2); j <= Math.min(conversationEntries.length - 1, i + 2); j++) {
                    if (j !== i && !results.includes(conversationEntries[j])) {
                        results.push(conversationEntries[j]);
                    }
                }

                if (results.length >= maxResults) break;
            }
        }

        return results;
    }

    // Extract keywords from player action (Claude Web approach)
    extractKeywords(action) {
        const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
                             'of', 'with', 'by', 'from', 'about', 'as', 'is', 'was', 'are', 'were',
                             'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                             'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can'];

        const words = action.toLowerCase().split(/\s+/);
        return words.filter(word =>
            word.length > 3 &&
            !commonWords.includes(word) &&
            isNaN(word)
        );
    }

    // Helper to determine if a roll request is for an enemy
    isRollRequestForEnemy(rollRequest, combatState) {
        if (!rollRequest || !combatState || !combatState.active || !Array.isArray(combatState.initiativeOrder)) {
            return { isEnemy: false, combatantName: null };
        }

        // During combat, the roll request is for whoever's turn it is
        // Check current turn first
        if (typeof combatState.currentTurn === 'number' &&
            combatState.currentTurn >= 0 &&
            combatState.currentTurn < combatState.initiativeOrder.length) {

            const currentCombatant = combatState.initiativeOrder[combatState.currentTurn];
            if (currentCombatant && !currentCombatant.isPlayer) {
                console.log(`🎲 Roll is for current turn holder: ${currentCombatant.name} (enemy)`);
                return { isEnemy: true, combatantName: currentCombatant.name };
            } else if (currentCombatant) {
                console.log(`🎲 Roll is for current turn holder: ${currentCombatant.name} (player)`);
                return { isEnemy: false, combatantName: currentCombatant.name };
            }
        }

        // If we can't determine from turn order, look for explicit actor mentions
        // Pattern: "Roll [action] for [Name]" or "Name rolls"
        const lowerRollRequest = rollRequest.toLowerCase();
        const forMatch = lowerRollRequest.match(/\bfor\s+([a-z]+)/i);

        if (forMatch) {
            const actorName = forMatch[1];
            const combatant = combatState.initiativeOrder.find(c =>
                c.name.toLowerCase().includes(actorName) || actorName.includes(c.name.toLowerCase())
            );
            if (combatant) {
                return {
                    isEnemy: !combatant.isPlayer,
                    combatantName: combatant.name
                };
            }
        }

        // Default: assume it's for a player if we're unsure
        return { isEnemy: false, combatantName: null };
    }


    getPartyRoster() {
        const rosterMap = new Map();

        const addAlias = (set, value) => {
            if (!value && value !== 0) {
                return;
            }
            const normalized = normalizeCombatantName(value);
            if (normalized) {
                set.add(normalized);
            }
        };

        const coerceHp = (hpData = {}) => {
            if (!hpData || typeof hpData !== 'object') {
                return null;
            }
            const current = hpData.current ?? hpData.value ?? hpData.hp ?? null;
            const max = hpData.max ?? hpData.maximum ?? hpData.total ?? hpData.maxHp ?? current ?? null;
            if (current === null && max === null) {
                return null;
            }
            return {
                current: current,
                max: max
            };
        };

        const upsertEntry = (rawId, record) => {
            if (!rawId && !record) {
                return;
            }

            const nameCandidate = (record && typeof record === 'object')
                ? (record.name || record.fullName || record.displayName)
                : (typeof record === 'string' ? record : null);

            const displayName = nameCandidate || rawId;
            if (!displayName) {
                return;
            }

            const aliasSet = new Set();
            addAlias(aliasSet, displayName);
            if (rawId) {
                addAlias(aliasSet, rawId);
            }

            if (typeof record === 'object' && record) {
                if (Array.isArray(record.aliases)) {
                    record.aliases.forEach(alias => addAlias(aliasSet, alias));
                }
                if (record.shortName) {
                    addAlias(aliasSet, record.shortName);
                }
                if (record.firstName) {
                    addAlias(aliasSet, record.firstName);
                }
            }

            const nameParts = displayName.split(/\s+/).filter(Boolean);
            if (nameParts.length) {
                addAlias(aliasSet, nameParts[0]);
                if (nameParts.length > 1) {
                    addAlias(aliasSet, nameParts[nameParts.length - 1]);
                }
            }

            const keySeed = (rawId && rawId.toString()) || displayName;
            const normalizedKey = (keySeed || '').toString().trim().toLowerCase() || normalizeCombatantName(displayName);
            if (!normalizedKey) {
                return;
            }

            const hp = typeof record === 'object' ? (record.hp || record.health || null) : null;
            const ac = typeof record === 'object'
                ? (record.ac ?? record.armorClass ?? record.armourClass ?? null)
                : null;

            const existing = rosterMap.get(normalizedKey) || {
                id: rawId || normalizeCombatantName(displayName) || normalizedKey,
                name: displayName,
                aliasSet: new Set(),
                hp: null,
                ac: null,
                raw: record
            };

            aliasSet.forEach(alias => existing.aliasSet.add(alias));

            const coercedHp = coerceHp(hp);
            if (coercedHp) {
                existing.hp = {
                    current: coercedHp.current,
                    max: coercedHp.max
                };
            }

            if (ac !== null && ac !== undefined) {
                existing.ac = ac;
            }

            if (!existing.name && displayName) {
                existing.name = displayName;
            }

            rosterMap.set(normalizedKey, existing);
        };

        const characters = this.campaignState?.characters;
        if (characters && typeof characters === 'object') {
            Object.entries(characters).forEach(([id, record]) => upsertEntry(id, record));
        }

        const partyObject = this.campaignState?.party;
        if (partyObject && typeof partyObject === 'object') {
            Object.entries(partyObject).forEach(([id, record]) => upsertEntry(id, record));
        }

        const partyMembers = this.campaignState?.partyMembers;
        if (Array.isArray(partyMembers)) {
            partyMembers.forEach(name => upsertEntry(name, { name }));
        }

        if (this.characterSheets && typeof this.characterSheets === 'object') {
            Object.entries(this.characterSheets).forEach(([id, record]) => upsertEntry(id, record));
        }

        if (this.character && this.character.name) {
            upsertEntry(this.character.id || this.character.name, this.character);
        }

        if (rosterMap.size === 0) {
            ['Kira Moonwhisper', 'Thorne Ironheart', 'Riven Shadowstep'].forEach(defaultName => {
                upsertEntry(defaultName, { name: defaultName });
            });
        }

        return Array.from(rosterMap.values()).map(entry => ({
            id: entry.id,
            name: entry.name,
            hp: entry.hp,
            ac: entry.ac,
            aliasSet: entry.aliasSet,
            raw: entry.raw || {}
        }));
    }

    matchPartyMember(name) {
        const normalizedName = normalizeCombatantName(name);
        if (!normalizedName) {
            return null;
        }
        const roster = this.getPartyRoster();
        for (const member of roster) {
            if (member.aliasSet.has(normalizedName)) {
                return member;
            }
        }
        return null;
    }

    // Extract enemy data from DM response for combat mode
    async extractEnemyData(response) {
        try {
            // Look for JSON combat data block in the response
            const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n```/);
            if (jsonMatch) {
                const combatData = JSON.parse(jsonMatch[1]);
                if (combatData.combat && combatData.enemies) {
                    console.log(`⚔️  Detected ${combatData.enemies.length} enemies in DM response`);

                    // Check if this is the NEW format (name + count) or OLD format (full stats)
                    const firstEnemy = combatData.enemies[0];
                    if (firstEnemy.name && firstEnemy.count !== undefined && !firstEnemy.hp) {
                        // NEW FORMAT: {"name": "Goblin", "count": 3}
                        // Fetch stats from 5e API and expand into multiple enemies
                        console.log('⚔️  New JSON format detected - fetching stats from 5e API...');
                        const expandedEnemies = await this.fetch5eEnemyStats(combatData.enemies);
                        return { combat: true, enemies: expandedEnemies };
                    } else {
                        // OLD FORMAT: Full stats already provided
                        console.log('⚔️  Old JSON format detected - using provided stats');
                        return combatData;
                    }
                }
            }

            const buildCombatPayload = (combatants, reason = 'Combat encounter detected') => {
                const ensureActionEconomy = () => ({
                    action: true,
                    bonusAction: true,
                    movement: 30,
                    reaction: true
                });

                const toCharacterId = (name) => {
                    if (!name || !this.campaignState?.characters) return null;
                    const lower = name.toLowerCase();
                    if (this.campaignState.characters[lower]) {
                        return lower;
                    }
                    for (const [id, char] of Object.entries(this.campaignState.characters)) {
                        if ((char?.name || '').toLowerCase() === lower) {
                            return id;
                        }
                    }
                    return null;
                };

                const initiativeOrder = combatants.map(combatant => {
                    const partyMatch = this.matchPartyMember(combatant.name);
                    const provisionalId = combatant.id || partyMatch?.id;
                    const id = provisionalId || (combatant.isPlayer ? toCharacterId(combatant.name) : null);
                    const charData = id ? this.campaignState?.characters?.[id] : null;
                    const hpSource = combatant.hp || partyMatch?.hp || charData?.hp || {};
                    const acSource = combatant.ac ?? partyMatch?.ac ?? charData?.ac ?? charData?.armorClass ?? null;
                    const resolvedInitiative = Number.isFinite(Number(combatant.initiative))
                        ? Number(combatant.initiative)
                        : null;

                    return {
                        name: combatant.name,
                        id,
                        isPlayer: combatant.isPlayer || !!partyMatch,
                        initiative: resolvedInitiative,
                        ac: acSource,
                        hp: {
                            current: hpSource.current ?? hpSource.value ?? null,
                            max: hpSource.max ?? hpSource.maximum ?? hpSource.total ?? hpSource.maxHp ?? null
                        },
                        actionEconomy: ensureActionEconomy(),
                        conditions: Array.isArray(combatant.conditions) ? [...combatant.conditions] : []
                    };
                });

                const players = initiativeOrder
                    .filter(entry => entry.isPlayer)
                    .map(entry => ({ ...entry }));
                const enemies = initiativeOrder
                    .filter(entry => !entry.isPlayer)
                    .map(entry => ({ ...entry }));

                return {
                    combat: true,
                    initiativeOrder,
                    participants: {
                        players,
                        enemies
                    },
                    enemies,
                    context: {
                        reason,
                        source: 'initiativeOrder'
                    }
                };
            };

            // Check for INITIATIVE ORDER or Turn Order which is a clear combat indicator
            if (response.match(/INITIATIVE ORDER|Turn Order/i) || response.match(/ROUND \d+ BEGINS/i)) {
                console.log('⚔️  Detected INITIATIVE ORDER/Turn Order - combat has begun!');

                // Parse initiative list to extract ALL combatants (party + enemies)
                // Match multiple heading formats: "INITIATIVE ORDER", "Turn Order - Round 1", "═══ INITIATIVE ORDER ═══", "📋 INITIATIVE ORDER" etc.
                // Capture until next section (marked by ##, ---, or **ROUND)
                const initiativeMatch = response.match(/(?:##\s*)?\*\*(?:[^\w\s]*\s*)?(?:═+\s*)?(?:INITIATIVE ORDER|Turn Order|TURN ORDER)(?:\s+═+)?(?:\s*-\s*Round\s+\d+)?[:\s]*\*\*?[\s\S]*?(?=\n(?:##|---|---\n|\*\*(?:ROUND|Round)))/i);
                console.log('🔍 DEBUG: Initiative regex matched:', !!initiativeMatch);
                if (!initiativeMatch) {
                    console.log('🔍 DEBUG: Response snippet:', response.substring(0, 500));
                }
                if (initiativeMatch) {
                    const combatants = [];
                    const initiativeText = initiativeMatch[0];

                    console.log('🔍 DEBUG: Initiative text to parse:', initiativeText.substring(0, 200));

                    // Split into lines and parse each one
                    const lines = initiativeText.split('\n');
                    for (const line of lines) {
                        // Skip lines with placeholders
                        if (line.includes('awaiting') || line.includes('pending') || line.includes('Still need')) {
                            continue;
                        }

                        // Try format 1: "1. **Name: 14**" or "1. Name: 14"
                        let match = line.match(/\d+\.\s+\*{0,2}([^:*]+?)\*{0,2}:\s*(\d+)/);
                        if (!match) {
                            // Try format 2: "1. **Name** - 14" or "1. Name - 14"
                            match = line.match(/\d+\.\s+\*{0,2}([^*-]+?)\*{0,2}\s*-\s*(\d+)/);
                        }
                        if (!match) {
                            // Try format 3: "1. **Name** (14)" or "1. Name (14)" or "1. Name (Initiative 14)"
                            match = line.match(/\d+\.\s+\*{0,2}([^*(]+?)\*{0,2}\s*\((?:Initiative\s+)?(\d+)\)/i);
                        }
                        if (!match) {
                            // Try format 4: "- **Name**: 14" or bullet list variations
                            match = line.match(/[-•]\s+\*{0,2}([^:*]+?)\*{0,2}:\s*(\d+)/);
                        }
                        if (!match) {
                            // Try format 5: "- **Name** (14)" bullet style
                            match = line.match(/[-•]\s+\*{0,2}([^*(]+?)\*{0,2}\s*\((?:Initiative\s+)?(\d+)\)/i);
                        }

                        if (match) {
                            const rawName = match[1].trim();
                            // Clean up name: remove emoji, arrows, and extra markers
                            const name = rawName.replace(/[⚔️←→↑↓✨🎯🛡️]/g, '').trim();
                            const initiative = parseInt(match[2], 10);
                            const partyMatch = this.matchPartyMember(name);
                            const isPartyMember = !!partyMatch;

                            console.log(`🔍 DEBUG: Parsed combatant - Name: "${name}", Initiative: ${initiative}, IsPlayer: ${isPartyMember}`);

                            const hpSource = partyMatch?.hp || null;
                            combatants.push({
                                name,
                                id: partyMatch?.id || null,
                                hp: hpSource ? { ...hpSource } : null,
                                maxHp: hpSource?.max ?? null,
                                ac: partyMatch?.ac ?? null,
                                initiative: initiative,
                                isPlayer: isPartyMember
                            });
                        }
                    }

                    if (combatants.length > 0) {
                        console.log(`⚔️  Extracted ${combatants.length} combatants from INITIATIVE ORDER: ${combatants.map(c => c.name).join(', ')}`);
                        return buildCombatPayload(combatants, 'Initiative order detected');
                    } else {
                        console.log('⚠️  Turn Order detected but no combatants could be parsed');
                    }
                }
            }

            // Fallback: Look for enemy mentions in text (basic pattern matching)
            const enemyPatterns = [
                /(?:a|an|the)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:attacks?|appears?|emerges?|charges?|lunges?)/g,
                /(?:fought?|facing?|encounter(?:s|ed)?)\s+(?:a|an|the)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
            ];

            const enemies = [];
            const blockedEnemyTerms = [
                'caravan',
                'woods',
                'forest',
                'tavern',
                'common room',
                'villager',
                'villagers',
                'laughing griffin',
                'elder miriam',
                'thornhaven'
            ];

            for (const pattern of enemyPatterns) {
                let match;
                while ((match = pattern.exec(response)) !== null) {
                    const enemyName = match[1].trim();
                    const normalized = enemyName.toLowerCase();

                    if (blockedEnemyTerms.some(term => normalized.includes(term))) {
                        continue;
                    }

                    if (this.matchPartyMember(enemyName)) {
                        // Skip party members that appear in narrative descriptions
                        continue;
                    }

                    if (!enemies.find(e => e.name === enemyName)) {
                        enemies.push({
                            name: enemyName,
                            hp: null, // Unknown, will need to be set manually
                            maxHp: null,
                            ac: null,
                            initiative: null,
                            isPlayer: false
                        });
                    }
                }
            }

            if (enemies.length > 0) {
                console.log(`⚔️  Pattern-matched ${enemies.length} potential enemies: ${enemies.map(e => e.name).join(', ')}`);
                return buildCombatPayload(enemies, 'Hostile activity detected');
            }

            return null;
        } catch (error) {
            console.error('❌ Error extracting enemy data:', error);
            return null;
        }
    }

    // Fetch enemy stats from D&D 5e API and expand count into multiple enemies
    async fetch5eEnemyStats(enemySpecs) {
        const expandedEnemies = [];
        const cache = this.monsterCache || new Map();
        this.monsterCache = cache;

        const buildEnemyInstance = (baseStats, index, name, count) => ({
            name: count > 1 ? `${name} ${index + 1}` : name,
            hp: baseStats.hp,
            maxHp: baseStats.maxHp,
            ac: baseStats.ac,
            initiative: null,
            isPlayer: false,
            cr: baseStats.cr,
            size: baseStats.size,
            type: baseStats.type,
            actions: baseStats.actions ? [...baseStats.actions] : [],
            source: baseStats.source
        });

        for (const spec of enemySpecs) {
            const { name, count } = spec;
            const quantity = Number.isFinite(Number(count)) && Number(count) > 0 ? Number(count) : 1;
            const apiName = name.toLowerCase().replace(/\s+/g, '-');
            const cacheKey = apiName;
            let cached = cache.get(cacheKey);

            if (!cached) {
                try {
                    console.log(`🔍 Fetching stats for "${name}" from 5e API...`);
                    const response = await fetch(`https://www.dnd5eapi.co/api/monsters/${apiName}`);

                    if (!response.ok) {
                        console.warn(`⚠️  Monster "${name}" not found in 5e API, using placeholder`);
                        cached = {
                            status: 'missing',
                            payload: {
                                hp: 10,
                                maxHp: 10,
                                ac: 10,
                                cr: null,
                                size: null,
                                type: null,
                                actions: [],
                                source: 'placeholder'
                            }
                        };
                        cache.set(cacheKey, cached);
                    } else {
                        const monsterData = await response.json();
                        const hp = monsterData.hit_points || 10;
                        const ac = monsterData.armor_class
                            ? (Array.isArray(monsterData.armor_class) ? monsterData.armor_class[0].value : monsterData.armor_class)
                            : 10;

                        console.log(`✅ Fetched "${name}": HP ${hp}, AC ${ac}`);

                        const payload = {
                            hp,
                            maxHp: hp,
                            ac,
                            cr: monsterData.challenge_rating ?? null,
                            size: monsterData.size ?? null,
                            type: monsterData.type ?? null,
                            actions: Array.isArray(monsterData.actions) ? monsterData.actions.map(a => a.name) : [],
                            source: '5eapi'
                        };

                        cached = { status: 'ok', payload };
                        cache.set(cacheKey, cached);

                        // Store in RAG for future quick access (only once per monster)
                        if (this.memoryClient && this.campaignId === 'test-silverpeak') {
                            try {
                                await this.memoryClient.storeMonsterStats(name, monsterData);
                                console.log(`💾 Stored "${name}" stats in campaign RAG`);
                            } catch (error) {
                                console.warn(`⚠️  Failed to store monster stats in RAG:`, error.message);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error fetching stats for "${name}":`, error.message);
                    cached = {
                        status: 'missing',
                        payload: {
                            hp: 10,
                            maxHp: 10,
                            ac: 10,
                            cr: null,
                            size: null,
                            type: null,
                            actions: [],
                            source: 'error'
                        }
                    };
                    cache.set(cacheKey, cached);
                }
            }

            const baseStats = cached?.payload || {
                hp: 10,
                maxHp: 10,
                ac: 10,
                cr: null,
                size: null,
                type: null,
                actions: [],
                source: 'fallback'
            };

            for (let i = 0; i < quantity; i++) {
                expandedEnemies.push(buildEnemyInstance(baseStats, i, name, quantity));
            }
        }

        console.log(`⚔️  Expanded ${enemySpecs.length} enemy specs into ${expandedEnemies.length} combatants`);
        return expandedEnemies;
    }

    generateEmergencyExportFromConversation(conversationHistory) {
        // Convert JSON conversation back to emergency export markdown format
        let markdown = `# EMERGENCY CAMPAIGN EXPORT - ${new Date().toISOString().split('T')[0]}\n\n`;

        conversationHistory.forEach((entry, index) => {
            const entryType = entry.role || entry.type || 'UNKNOWN';
            const timestamp = entry.timestamp || 'No timestamp';
            markdown += `### Entry ${index} - ${entryType.toUpperCase()} [${timestamp}]\n`;
            markdown += `${entry.content}\n\n`;
        });

        return markdown;
    }

    // ==================== PROMPT BUILDING ====================
    async buildSmartPrompt(playerAction, context, mode = 'ic') {
        let prompt = `You are the Dungeon Master. Maintain continuity with the story.\n\n`;

        // Add mode-specific instructions
        if (mode === 'dm-question') {
            prompt += `**DM QUESTION MODE**: The player is asking you a question about the game, rules, or world. Answer helpfully but don't advance the story or change any game state. This is a clarification, not an in-character action.\n\n`;
        } else if (mode === 'ooc') {
            prompt += `**OUT-OF-CHARACTER MODE**: The player is talking to you meta/casually, not role-playing. Respond in a friendly, conversational tone like "Sure! I'll give them weapons" or "Yep, makes sense - added!". Be casual and brief. Still extract any game state changes they request, but skip the dramatic narrative.\n\n`;
        } else {
            // IC mode - default behavior
            prompt += `**IN-CHARACTER MODE**: This is a canon player action that advances the story and affects game state.\n\n`;
        }

        // Add combat mode instructions if active
        if (this.combatState.active && this.combatState.initiativeOrder.length > 0) {
            const currentCombatant = this.combatState.initiativeOrder[this.combatState.currentTurn];
            prompt += `⚔️  **COMBAT MODE ACTIVE - Round ${this.combatState.round}**
Current Turn: ${currentCombatant.name}

**COMBAT FOCUS:**
- Describe attacks, damage rolls, and saving throws with mechanical precision
- Track action economy carefully (action, bonus action, movement, reaction)
- Apply D&D 5e combat rules (advantage/disadvantage, cover, opportunity attacks)
- Request specific rolls for attacks (d20 + modifiers), damage (weapon dice), and saves
- Keep narrative concise and tactical - focus on positioning and combat flow
- Describe enemy tactics and counters strategically
- Note when combatants are bloodied (below half HP)

**Current Combatant's Actions:**
- Action: ${currentCombatant.actionEconomy?.action ? '✓ Available' : '✗ Used'}
- Bonus Action: ${currentCombatant.actionEconomy?.bonusAction ? '✓ Available' : '✗ Used'}
- Movement: ${currentCombatant.actionEconomy?.movement || 0}ft remaining
- Reaction: ${currentCombatant.actionEconomy?.reaction ? '✓ Available' : '✗ Used'}

**Initiative Order:**
${this.combatState.initiativeOrder.map((c, i) =>
    `${i === this.combatState.currentTurn ? '→' : ' '} ${c.initiative}: ${c.name} (HP: ${c.hp?.current || '?'}/${c.hp?.max || '?'}, AC: ${c.ac || '?'})`
).join('\n')}

`;
        }

        // Add core facts
        prompt += this.CORE_FACTS + '\n\n';

        // Add immediate context (recent history) - MOST RECENT FIRST
        if (context.immediate && context.immediate.length > 0) {
            prompt += `## RECENT HISTORY (most recent first - last ${context.immediate.length} exchanges):\n`;
            prompt += context.immediate.slice().reverse().map(event =>
                `${(event.type || 'ENTRY').toUpperCase()}: ${event.content.substring(0, 500)}${event.content.length > 500 ? '...' : ''}`
            ).join('\n\n');
            prompt += '\n\n';
        }

        // Add specific context if any
        if (context.specific && context.specific.length > 0) {
            prompt += `## RELEVANT CONTEXT:\n`;
            prompt += context.specific.map(item => {
                if (item.content) {
                    // Regular event with content
                    return `${(item.type || 'ENTRY').toUpperCase()}: ${item.content.substring(0, 300)}${item.content.length > 300 ? '...' : ''}`;
                } else if (item.type === 'NPC_HISTORY' && item.interactions) {
                    // NPC history structure
                    return `${item.npc.toUpperCase()} HISTORY:\n${item.interactions.filter(int => int && int.content).map(int => `- ${int.content.substring(0, 200)}...`).join('\n')}`;
                } else if (item.type === 'LOCATION_HISTORY' && item.events) {
                    // Location history structure
                    return `${item.location.toUpperCase()} HISTORY:\n${item.events.filter(evt => evt && evt.content).map(evt => `- ${evt.content.substring(0, 200)}...`).join('\n')}`;
                } else if (item.type === 'COMBAT_STATUS' && item.recentCombat) {
                    // Combat status structure
                    return `RECENT COMBAT:\n${item.recentCombat.filter(combat => combat && combat.content).map(combat => `- ${combat.content.substring(0, 200)}...`).join('\n')}`;
                } else {
                    return `${(item.type || 'UNKNOWN').toUpperCase()}: [Complex structure]`;
                }
            }).join('\n\n');
            prompt += '\n\n';
        }

        // Add historical context
        if (context.historical && context.historical.length > 0) {
            prompt += `## BACKGROUND CONTEXT:\n`;
            prompt += context.historical.map(event =>
                `${(event.type || 'ENTRY').toUpperCase()}: ${event.content?.substring(0, 200) || '[No content]'}${event.content?.length > 200 ? '...' : ''}`
            ).join('\n\n');
            prompt += '\n\n';
        }

        prompt += `CURRENT PLAYER ACTION: ${playerAction}\n\n`;
        prompt += 'Respond as the DM. You have recent history and any relevant past context above.\n';
        prompt += 'For dice rolls, use format: 🎲 Roll [Skill] (DC [number]) to [action]';

        return prompt;
    }


    // ==================== ACTION PROCESSING ====================
    detectCombatTrigger(message) {
        // Regex patterns for more flexible combat trigger detection
        const startPattern = /\b(roll\s+initiative|combat\s+begins?|enter\s+combat|start\s+combat|initiative!|begin\s+(?:the\s+)?(?:fight|battle|combat))\b/i;
        const endPattern = /\b(combat|battle|fight)\s+(ends?|over|concludes?|finished?|complete[sd]?|stops?)\b/i;

        if (startPattern.test(message)) return 'enter';
        if (endPattern.test(message)) return 'exit';
        return null;
    }

    async processPlayerAction(playerAction, sessionId, mode = 'ic') {
        try {
            console.log('\n📝 Processing:', playerAction.substring(0, 50) + '...');
            console.log('🎭 Message mode:', mode);

            const wasCombatActive = !!(this.combatState?.active);
            const previousInitiativeCount = Array.isArray(this.combatState?.initiativeOrder)
                ? this.combatState.initiativeOrder.length
                : 0;

            // Check for combat mode triggers
            const combatTrigger = this.detectCombatTrigger(playerAction);
            if (combatTrigger === 'exit') {
                console.log('⚔️  Combat exit trigger detected!');
                this.combatState.active = false;
                this.combatState.round = 0;
                this.combatState.currentTurn = 0;
                this.combatState.initiativeOrder = [];
            } else if (combatTrigger === 'enter') {
                console.log('⚔️  Combat enter trigger detected! (UI will handle initiative setup)');
            }

            // Retrieve relevant context
            const balancedContext = await this.retrieveRelevantContext(playerAction);

            console.log(`📊 Balanced context retrieved:`);
            console.log('🔍 Context structure debug:', Object.keys(balancedContext));
            console.log(`  - Immediate: ${balancedContext.immediate?.length || 0} recent events`);
            console.log(`  - Specific: ${balancedContext.specific?.length || 0} relevant events`);
            console.log(`  - Historical: ${balancedContext.historical?.length || 0} background events`);

            // Build smart prompt with mode-specific instructions
            const prompt = await this.buildSmartPrompt(playerAction, balancedContext, mode);

            console.log(`📏 Prompt size: ${prompt.length} characters`);
            if (this.totalMemorySize > 0) {
                console.log(`📉 Compression: ${(prompt.length / this.totalMemorySize * 100).toFixed(3)}%`);
            }

            // Send to AI for Phase 1
            const response = await this.sendToAI(prompt, playerAction);

            // Check if we got a valid response
            if (!response) {
                console.log('❌ No response from AI, using fallback');
                return {
                    success: true,
                    narrative: this.getFallbackResponse(playerAction)
                };
            }

            // Detect phase and handle accordingly
            const phaseInfo = this.detectPhase(response);

            if (phaseInfo.phase === 'setup') {
                // Phase 1: Setup + Roll Request - DON'T save to conversation history yet
                console.log('🎲 Two-phase flow: Setup phase completed, awaiting roll result');
                return {
                    success: true,
                    narrative: phaseInfo.setup,
                    type: 'roll_request',
                    rollRequest: phaseInfo.rollRequest,
                    phase: 'setup',
                    setupNarrative: phaseInfo.setup
                };
            } else {
                            // Complete narrative - save normally with mode
                            await this.updateMemory(playerAction, response, sessionId, mode);
                
                            // Check for [TURN_COMPLETE] signal from AI during active combat
                            let narrative = response;
                            if (this.combatState.active && narrative.includes('[TURN_COMPLETE]')) {
                                console.log('➡️  [COMBAT] AI signaled turn complete. Advancing turn...');
                                const updatedCombatState = await combatManager.nextTurn(this.campaignId);
                                updateSharedCombatState(this, updatedCombatState);
                                narrative = narrative.replace('[TURN_COMPLETE]', '').trim();
                            }
                
                            // Extract enemy data if present (for combat mode triggers)
                            const enemyData = await this.extractEnemyData(narrative);
                            console.log('🔍 DEBUG extractEnemyData result:', JSON.stringify(enemyData, null, 2));
                
                            const result = {
                                success: true,
                                narrative: narrative
                            };
                const nowCombatActive = !!(this.combatState?.active) && Array.isArray(this.combatState?.initiativeOrder) && this.combatState.initiativeOrder.length > 0;


                // Include enemy data if detected
                if (enemyData && enemyData.combat) {
                    const participants = enemyData.participants || {
                        players: [],
                        enemies: enemyData.enemies || []
                    };
                    const initiativeOrder = enemyData.initiativeOrder || [
                        ...participants.players,
                        ...participants.enemies
                    ];
                    const contextInfo = enemyData.context || {
                        reason: 'Combat detected',
                        source: 'parser'
                    };

                    result.combatDetected = true;
                    result.handoffData = {
                        participants,
                        initiativeOrder,
                        context: contextInfo
                    };
                    result.enemies = participants.enemies;
                    result.initiativeOrder = initiativeOrder;

                    console.log(`⚔️  Combat encounter detected! ${participants.enemies.length} enemies found`);
                } else if (nowCombatActive && (!wasCombatActive || previousInitiativeCount === 0)) {
                    const participants = this.combatState.participants || {
                        players: [],
                        enemies: []
                    };
                    const initiativeOrder = Array.isArray(this.combatState.initiativeOrder)
                        ? this.combatState.initiativeOrder
                        : [];
                    const contextInfo = this.combatState.context || {
                        reason: 'Combat detected via state changes',
                        source: 'stateChanges'
                    };

                    result.combatDetected = true;
                    result.handoffData = {
                        participants,
                        initiativeOrder,
                        context: contextInfo
                    };
                    result.enemies = participants.enemies;
                    result.initiativeOrder = initiativeOrder;

                    console.log('⚔️  Combat activation inferred from state changes; issuing handoff payload');
                }

                // Check if there are roll requests in the narrative (e.g., "🎲 Roll Initiative...")
                // This happens when combat starts and DM asks for initiative/saves in one response
                // Handle formats like:
                //   - "🎲 **Roll Initiative** for Kira, Thorne"
                //   - "🎲 **Kira, roll Wisdom Save (DC 11)**"
                //   - "🎲 Roll Initiative for..."
                const allRollRequests = [];

                // Find all lines with dice emoji
                const diceLines = response.split('\n').filter(line => line.includes('🎲'));

                for (const line of diceLines) {
                    // Try multiple formats:
                    // Format 1: "🎲 **[Name], roll [Check]**"
                    let match = line.match(/🎲\s*\*\*([^,]+),\s*roll\s+([^*]+)\*\*/i);
                    if (match) {
                        const name = match[1].trim();
                        const check = match[2].trim();
                        const sanitized = this.sanitizeRollCommand(`Roll ${check} for ${name}`);
                        if (sanitized) {
                            allRollRequests.push(sanitized);
                            continue;
                        }
                    }

                    // Format 2: "🎲 **Roll [Check]** [additional text]"
                    match = line.match(/🎲\s*\*\*?(Roll[^*\n]+)\*\*?\s*(.+?)$/i);
                    if (match) {
                        const combined = `${match[1].trim()} ${match[2].trim()}`.trim();
                        const sanitized = this.sanitizeRollCommand(combined) || this.sanitizeRollCommand(match[1].trim());
                        if (sanitized) {
                            allRollRequests.push(sanitized);
                            continue;
                        }
                    }

                    // Format 3: Simple "🎲 Roll [Check]"
                    match = line.match(/🎲\s*\*\*?(Roll\s+[^\n*]+?)\*\*?/i);
                    if (match) {
                        const sanitized = this.sanitizeRollCommand(match[1].trim());
                        if (sanitized) {
                            allRollRequests.push(sanitized);
                        }
                    }
                }

                // Store all roll requests (will be processed by roll queue)
                if (allRollRequests.length > 0) {
                    result.rollRequests = allRollRequests;
                    // Keep first one in rollRequest for backward compatibility
                    result.rollRequest = allRollRequests[0];
                    console.log(`🎲 Found ${allRollRequests.length} roll request(s) in narrative:`, allRollRequests);
                }

                return result;
            }
        } catch (error) {
            console.error('❌ Error in processPlayerAction:', error);
            return {
                success: true,
                narrative: this.getFallbackResponse(playerAction)
            };
        }
    }

    async sendToAI(systemPrompt, playerAction) {
        const fetch = require('node-fetch');

        try {
            // Retrieve relevant RAG memories (Silverpeak only)
            let enhancedPrompt = systemPrompt;
            if (this.campaignId === 'test-silverpeak' && this.memoryClient) {
                try {
                    const memories = await this.memoryClient.retrieveMemories(playerAction, 5);
                    if (memories && memories.length > 0) {
                        const memoryContext = this.memoryClient.formatMemoriesForContext(memories);
                        enhancedPrompt = systemPrompt + '\n\n' + memoryContext;
                        console.log(`🧠 Retrieved ${memories.length} relevant memories`);
                    }
                } catch (error) {
                    console.warn('⚠️  Failed to retrieve RAG memories:', error.message);
                    // Continue without memories
                }
            }

            const messages = [{ role: "user", content: playerAction }];
            const response = await this.aiProvider.generateResponse(enhancedPrompt, messages);
            return response;

        } catch (error) {
            console.error(`${this.aiProvider.getCurrentProvider().toUpperCase()} API Error:`, error);

            // Fallback response
            return this.getFallbackResponse(playerAction);
        }
    }

    // ==================== TWO-PHASE DICE SYSTEM ====================
    async detectPhase(response) { // Made async to allow await for processRollResult
        // Check if this looks like a roll REQUEST (dice emoji near the END asking for an action)
        // vs roll RESULTS (initiative order or dice shown in the narrative)
        const diceEmojiIndex = response.lastIndexOf('🎲');

        if (diceEmojiIndex !== -1) {
            // Get text after the last dice emoji
            const textAfterDice = response.substring(diceEmojiIndex);

            // Check if it's asking for a roll (has "Roll" command after the emoji)
            // and is near the end of the response (last 200 chars)
            const isRollRequest = textAfterDice.match(/🎲\s*Roll\s+/i) &&
                                  (response.length - diceEmojiIndex < 200);

            // Check if it's part of initiative order display (has numbered list or "INITIATIVE ORDER")
            const isInitiativeDisplay = response.match(/INITIATIVE ORDER|TURN ORDER|Round \d+ begins/i);

            if (isRollRequest && !isInitiativeDisplay) {
                const rollRequest = this.extractRollRequest(response);
                const setupNarrative = response.substring(0, diceEmojiIndex).trim();

                // Check if this roll request is for an enemy
                const { isEnemy, combatantName } = this.isRollRequestForEnemy(rollRequest, this.combatState);

                if (isEnemy) {
                    console.log(`🎲 Auto-rolling for enemy: ${combatantName} - Request: ${rollRequest}`);
                    // Parse roll details to get dice notation (e.g., "1d20+5")
                    // This is a simplified parsing, might need to be more robust
                    const diceMatch = rollRequest.match(/(\d*d\d+)([+-]\d+)?/i);
                    let diceNotation = '1d20'; // Default to 1d20
                    let reason = rollRequest;

                    if (diceMatch) {
                        diceNotation = diceMatch[0];
                        reason = rollRequest.replace(diceMatch[0], '').trim();
                    } else if (rollRequest.toLowerCase().includes('initiative')) {
                        diceNotation = '1d20'; // Initiative rolls are always 1d20
                    } else if (rollRequest.toLowerCase().includes('attack')) {
                        diceNotation = '1d20'; // Attack rolls are always 1d20
                    }

                    const rollResult = DiceRollManager.rollDice(diceNotation);
                    const formattedRollResult = `${rollResult.total} (rolled ${rollResult.rolls.join(', ')}${rollResult.modifier ? (rollResult.modifier > 0 ? '+' : '') + rollResult.modifier : ''})`;

                    console.log(`🎲 Enemy auto-roll result: ${formattedRollResult}`);

                    // Process the roll result internally
                    const phase2Response = await this.processRollResult(setupNarrative, rollRequest, formattedRollResult);

                    return {
                        phase: 'complete',
                        narrative: phase2Response,
                        rollRequest: null // No roll request to send to client
                    };
                } else {
                    console.log('🎲 Phase 1 detected: Setup + Roll Request');
                    console.log('🔍 Full response:', response);
                    return {
                        phase: 'setup',
                        rollRequest: rollRequest,
                        setup: setupNarrative
                    };
                }
            }
        }

        console.log('📖 Complete narrative detected');
        return { phase: 'complete' };
    }

    sanitizeRollCommand(command) {
        if (!command) {
            return '';
        }

        const flavorHint = /\s*\((?:[^)]*?(?:waiting|pending|determine|narrative|context|flavor|dm is thinking|preparing|holding|hangs|ready|awaits|conclusion|decision))[^)]*\)\s*$/i;

        let sanitized = command
            .replace(/\*\*/g, '')
            .replace(/^🎲\s*/, '')
            .trim();

        sanitized = sanitized.replace(/\s+/g, ' ').replace(/\s*\*+$/g, '').trim();

        while (flavorHint.test(sanitized)) {
            sanitized = sanitized.replace(flavorHint, '').trim();
        }

        if (sanitized && !/^roll\b/i.test(sanitized)) {
            const rollIndex = sanitized.toLowerCase().indexOf('roll ');
            sanitized = rollIndex !== -1 ? sanitized.substring(rollIndex).trim() : `Roll ${sanitized}`;
        }

        return sanitized;
    }

    extractRollRequest(response) {
        if (!response) {
            return "Roll required";
        }

        const diceIndex = response.lastIndexOf('🎲');
        const segment = diceIndex !== -1 ? response.substring(diceIndex) : response;
        const segmentLines = segment.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const candidateLine = segmentLines.length > 0 ? segmentLines[0] : segment;

        const primaryCommand = this.sanitizeRollCommand(candidateLine);

        const parseCommand = (text) => {
            if (!text) {
                return null;
            }

            const rollMatch = text.match(/Roll (.+?) \(DC (\d+)\) to (.+?)$/i);
            if (rollMatch) {
                const skill = rollMatch[1].trim();
                const dc = rollMatch[2].trim();
                const action = rollMatch[3].replace(/to\s+to/gi, 'to').trim();
                return `Roll ${skill} (DC ${dc}) to ${action}`;
            }

            const initMatch = text.match(/Roll Initiative\s+(?:to\s+)?for (.+?)$/i);
            if (initMatch) {
                return `Roll Initiative for ${initMatch[1].trim()}`;
            }

            const simpleMatch = text.match(/Roll ([^]+?)$/i);
            if (simpleMatch) {
                const command = simpleMatch[1].trim();
                return `Roll ${command}`;
            }

            return null;
        };

        const parsedPrimary = parseCommand(primaryCommand);
        if (parsedPrimary) {
            return parsedPrimary;
        }

        // Special handling for Initiative rolls - be forgiving with malformed text
        const fallbackText = this.sanitizeRollCommand(response.replace(/\n+/g, ' '));
        const parsedFallback = parseCommand(fallbackText);
        if (parsedFallback) {
            return parsedFallback;
        }

        return primaryCommand || "Roll required";
    }

    async processRollResult(setup, rollRequest, rollResult) {
        console.log('🎲 Phase 2: Processing roll result with full campaign context');

        // Get full campaign context for Phase 2 (same as Phase 1)
        const rollContinuationAction = `Continue story after roll: ${rollRequest} Result: ${rollResult}`;
        const context = await this.retrieveRelevantContext(rollContinuationAction);

        console.log(`📊 Phase 2 context retrieved:`);
        console.log(`  - Immediate: ${context.immediate?.length || 0} recent events`);
        console.log(`  - Specific: ${context.specific?.length || 0} relevant events`);
        console.log(`  - Historical: ${context.historical?.length || 0} background events`);

        // Build comprehensive Phase 2 prompt with full context
        let phase2Prompt = `You are the Dungeon Master. Maintain continuity with the story.\n\n`;

        // Add core facts
        phase2Prompt += this.CORE_FACTS + '\n\n';

        // Add immediate context (recent history) - MOST RECENT FIRST
        if (context.immediate && context.immediate.length > 0) {
            phase2Prompt += `## RECENT HISTORY (most recent first - last ${context.immediate.length} exchanges):\n`;
            phase2Prompt += context.immediate.slice().reverse().map(event =>
                `${(event.type || 'ENTRY').toUpperCase()}: ${event.content.substring(0, 500)}${event.content.length > 500 ? '...' : ''}`
            ).join('\n\n');
            phase2Prompt += '\n\n';
        }

        // Add specific context if any
        if (context.specific && context.specific.length > 0) {
            phase2Prompt += `## RELEVANT CONTEXT:\n`;
            phase2Prompt += context.specific.map(item => {
                if (item.content) {
                    return `${(item.type || 'ENTRY').toUpperCase()}: ${item.content.substring(0, 300)}${item.content.length > 300 ? '...' : ''}`;
                } else {
                    return `${item.type}: ${JSON.stringify(item).substring(0, 200)}`;
                }
            }).join('\n\n');
            phase2Prompt += '\n\n';
        }

        // Add historical context
        if (context.historical && context.historical.length > 0) {
            phase2Prompt += `## BACKGROUND CONTEXT:\n`;
            phase2Prompt += context.historical.map(event =>
                `${(event.type || 'ENTRY').toUpperCase()}: ${event.content?.substring(0, 200) || '[No content]'}${event.content?.length > 200 ? '...' : ''}`
            ).join('\n\n');
            phase2Prompt += '\n\n';
        }

        // Add Phase 2 specific instructions
        phase2Prompt += `## PHASE 2 CONTINUATION:
Previous Setup: ${setup}
Roll Request: ${rollRequest}
Roll Result: ${rollResult}

INSTRUCTIONS: Continue the narrative based on this roll result. Write what happens next based on whether the roll succeeded or failed. Do NOT repeat the setup - continue directly from where it left off with the actual campaign story and characters.`;

        try {
            const messages = [{ role: "user", content: "Continue narrative based on roll result with full campaign context" }];
            const response = await this.aiProvider.generateResponse(phase2Prompt, messages);
            console.log('📖 Phase 2 complete with full context');
            return response;
        } catch (error) {
            console.error('❌ Phase 2 error:', error);
            return this.getFallbackResponse(`Roll result: ${rollResult}`);
        }
    }

    getFallbackResponse(action) {
        const location =
            this.campaignState?.current_location ||
            this.campaignState?.world?.currentLocation ||
            "Thornhaven";
        const time =
            this.campaignState?.world?.timeOfDay ||
            this.campaignState?.current_time ||
            "Late afternoon";

        return `The ${time.toLowerCase()} sun hangs low over ${location}, casting warm amber light across the cobbled streets. The distant peaks of the Silverpeak Mountains glow like polished silver against the horizon.

Kira, Thorne, and Riven stand ready, sensing that the Whispering Woods hold answers—and dangers—that cannot wait.

What do you do?`;
    }

    async updateMemory(playerAction, dmResponse, sessionId, mode = 'ic') {
        const newEvent = {
            index: this.indexedEvents.length,
            type: 'EXCHANGE',
            content: `PLAYER: ${playerAction}\nDM: ${dmResponse}`,
            metadata: this.extractMetadata(playerAction + ' ' + dmResponse),
            timestamp: new Date().toISOString(),
            sessionId: sessionId,
            mode: mode  // Store mode with event
        };

        this.indexedEvents.push(newEvent);

        // Update indices in real-time
        newEvent.metadata.keywords.forEach(keyword => {
            if (!this.searchIndices.keywords[keyword]) {
                this.searchIndices.keywords[keyword] = [];
            }
            this.searchIndices.keywords[keyword].push(newEvent.index);
        });

        // Update conversation history file with mode
        await this.saveConversationHistory(playerAction, dmResponse, mode);

        // Memory management: keep indexedEvents array bounded to prevent heap overflow
        const MAX_INDEXED_EVENTS = 500;
        if (this.indexedEvents.length > MAX_INDEXED_EVENTS) {
            console.log(`🧹 Trimming indexedEvents from ${this.indexedEvents.length} to ${MAX_INDEXED_EVENTS}`);
            const removedCount = this.indexedEvents.length - MAX_INDEXED_EVENTS;
            this.indexedEvents = this.indexedEvents.slice(-MAX_INDEXED_EVENTS);

            // Clean up searchIndices that reference removed events (indices < removedCount)
            for (const keyword in this.searchIndices.keywords) {
                this.searchIndices.keywords[keyword] = this.searchIndices.keywords[keyword]
                    .filter(idx => idx >= removedCount)
                    .map(idx => idx - removedCount);
            }
            for (const npc in this.searchIndices.npcs) {
                this.searchIndices.npcs[npc] = this.searchIndices.npcs[npc]
                    .filter(idx => idx >= removedCount)
                    .map(idx => idx - removedCount);
            }
            for (const location in this.searchIndices.locations) {
                this.searchIndices.locations[location] = this.searchIndices.locations[location]
                    .filter(idx => idx >= removedCount)
                    .map(idx => idx - removedCount);
            }
        }

        // Periodic save of indices
        if (this.indexedEvents.length % 10 === 0) {
            await this.saveIndices();
        }
    }

    async handleCombatTurnAnnouncements(dmResponse) {
        try {
            if (!dmResponse || !this.campaignId) {
                return;
            }

            const combatState = combatManager.getCombatState(this.campaignId);
            if (!combatState?.active || !Array.isArray(combatState.initiativeOrder) || combatState.initiativeOrder.length === 0) {
                return;
            }

            const turnPatterns = [
                /([A-Za-z][A-Za-z0-9' \-]*?),\s*you're up\b/i,
                /(?:it['’]s|it is)\s+([A-Za-z][A-Za-z0-9' \-]*?)'s turn\b/i,
                /([A-Za-z][A-Za-z0-9' \-]*?)\s+is\s+up\b/i,
                /turn\s+passes\s+to\s+([A-Za-z][A-Za-z0-9' \-]+)/i
            ];

            let announcedName = null;
            for (const pattern of turnPatterns) {
                const match = pattern.exec(dmResponse);
                if (match && match[1]) {
                    announcedName = match[1].trim();
                    break;
                }
            }

            if (!announcedName) {
                return;
            }

            const normalizedTarget = normalizeCombatantName(announcedName);
            if (!normalizedTarget) {
                return;
            }

            let targetIndex = combatState.initiativeOrder.findIndex(c => normalizeCombatantName(c.name) === normalizedTarget);
            if (targetIndex === -1) {
                targetIndex = combatState.initiativeOrder.findIndex(c => normalizeCombatantName(c.name).startsWith(normalizedTarget));
            }
            if (targetIndex === -1) {
                return;
            }

            const totalCombatants = combatState.initiativeOrder.length;
            let currentIndex = Number.isInteger(combatState.currentTurn) ? combatState.currentTurn : 0;

            if (targetIndex === currentIndex) {
                return;
            }

            let steps = (targetIndex - currentIndex + totalCombatants) % totalCombatants;
            if (steps <= 0 || steps > totalCombatants) {
                return;
            }

            for (let i = 0; i < steps; i++) {
                await combatManager.nextTurn(this.campaignId);
            }

            const updatedState = combatManager.getCombatState(this.campaignId);
            const sharedState = updateSharedCombatState(this, updatedState);
            this.combatState = sharedState;
            if (!this.campaignState) {
                this.campaignState = {};
            }
            this.campaignState.combat = JSON.parse(JSON.stringify(sharedState));

            console.log(`🧭 [COMBAT] Detected turn handoff to ${announcedName} (index ${targetIndex}) via DM narration.`);
        } catch (error) {
            console.warn('⚠️  Failed to synchronize combat turn from narration:', error.message);
        }
    }

    async saveConversationHistory(playerAction, dmResponse, mode = 'ic') {
        console.log('💾 saveConversationHistory called');
        console.log('📝 Player action length:', playerAction?.length || 0, 'chars');
        console.log('📝 DM response length:', dmResponse?.length || 0, 'chars');
        console.log('🎭 Message mode for state extraction:', mode);
        try {
            let history = [];
            try {
                const data = await fs.readFile(this.paths.conversationHistory, 'utf8');
                history = JSON.parse(data);
            } catch (err) {
                // File doesn't exist yet
            }

            const timestamp = new Date().toISOString();

            // Validate and add player message
            if (playerAction && playerAction.trim()) {
                history.push({
                    role: 'player',
                    content: playerAction,
                    timestamp: timestamp,
                    mode: mode  // Store mode with message
                });
            } else {
                console.warn('⚠️  Rejected empty player message from being added to history');
            }

            // Extract state changes for all modes (IC, dm-question, and OOC)
            // OOC mode still extracts state for equipment/inventory management
            let stateChanges = null;
            console.log(`✅ ${mode} mode: Extracting state changes`);
            stateChanges = await this.extractStateChanges(dmResponse, playerAction);

            // Check for combat encounter in DM response
            const enemyData = await this.extractEnemyData(dmResponse);
            if (enemyData && enemyData.enemies && enemyData.enemies.length > 0) {
                console.log(`⚔️  Combat detected! Adding ${enemyData.enemies.length} enemies to stateChanges`);
                if (!stateChanges) stateChanges = {};
                stateChanges.combat = {
                    active: true,
                    enemies: enemyData.enemies,
                    turnOrder: [],
                    currentTurn: 0
                };
            }

            // Validate and add DM response
            if (dmResponse && dmResponse.trim()) {
                history.push({
                    role: 'assistant',
                    content: dmResponse,
                    timestamp: timestamp,
                    mode: mode,  // Store mode with response
                    stateChanges: stateChanges // Store for rollback (null for OOC)
                });
            } else {
                console.warn('⚠️  Rejected empty DM response from being added to history');
            }

            // Apply state changes if any were extracted
            if (stateChanges && Object.keys(stateChanges).length > 0) {
                await this.applyStateChanges(stateChanges);
                console.log('🔄 State changes applied:', stateChanges);
            }

            // The handleCombatTurnAnnouncements logic is now handled by processPlayerAction
            // await this.handleCombatTurnAnnouncements(dmResponse);

            // Record in RAG memory (Silverpeak only)
            if (this.campaignId === 'test-silverpeak' && this.memoryClient) {
                try {
                    await this.memoryClient.addAction('player', playerAction);
                    await this.memoryClient.addAction('assistant', dmResponse);
                    console.log('🧠 Actions recorded in RAG memory');
                } catch (error) {
                    console.error('⚠️  Failed to record in RAG:', error);
                }
            }

            // Keep last 1000 entries in the file
            if (history.length > 1000) {
                history = history.slice(-1000);
            }

            await fs.writeFile(
                this.paths.conversationHistory,
                JSON.stringify(history, null, 2)
            );
        } catch (error) {
            console.error('Failed to save conversation history:', error);
        }
    }

    async extractStateChanges(dmResponse, playerAction = '') {
        try {
            // Detect campaign structure (sci-fi vs fantasy)
            const isFantasyStructure = this.campaignState.characters !== undefined;

            let extractionPrompt;

            if (isFantasyStructure) {
                // Fantasy structure (Silverpeak, etc.)
                const characterNames = Object.keys(this.campaignState.characters || {});
                extractionPrompt = `You are a state extraction system for a D&D campaign. Extract game state changes from DM responses.

Current State:
- Party Credits: ${this.campaignState.party?.credits || 0} GP
- Characters: ${characterNames.join(', ')}

Player Request:
"${playerAction}"

DM Response:
"${dmResponse}"

IMPORTANT: If the player explicitly asked to add/modify items, equipment, spells, or stats, and the DM provided a list or description, treat that as a state change even if the DM phrased it as suggestions or possibilities.

Extract state changes as JSON. Return ONLY valid JSON, nothing else. If no changes, return {}.

Schema:
{
  "party": { "credits": <number> },  // Absolute value after changes
  "characters": {
    "character_name": {
      "hp": { "current": <number>, "max": <number> },
      "credits": <number>,
      "inventory": { "add": [...], "remove": [...] },  // Consumables, tools, quest items, misc
      "equipment": { "add": [...], "remove": [...] },  // Armor, weapons, shields, worn items
      "spells": { "add": [...], "remove": [...] },
      "conditions": { "add": [...], "remove": [...] }
    }
  }
}

Rules:
- Credits are absolute values, not deltas
- Inventory/equipment/spells/conditions use add/remove arrays
- Inventory = consumables (potions, rations), tools, quest items, misc items
- Equipment = armor, weapons, shields, worn/wielded gear
- Include ALL items mentioned in lists when player requested additions
- Only include fields that actually changed`;
            } else {
                // Sci-fi structure (Dax, etc.)
                extractionPrompt = `You are a state extraction system for a D&D campaign. Extract ONLY actual game state changes from this DM narrative.

Current State:
- Total Party Fund: ${this.campaignState.resources?.party_credits || 0} credits (shared money pool)
- Individual Contributions (tracking only, DON'T change on spending):
  * Dax contributed: ${this.campaignState.party?.dax?.credits || 0}
  * Chen contributed: ${this.campaignState.party?.chen?.credits || 0}
  * Yuen contributed: ${this.campaignState.party?.yuen?.credits || 0}

DM Response:
"${dmResponse}"

Extract state changes as JSON. Return ONLY valid JSON, nothing else. If no changes, return {}.

Schema:
{
  "resources": { "party_credits": <number> },  // Group fund (spending comes from here)
  "inventory": { "dax": { "add": [...], "remove": [...] }, ... },
  "hp": { "dax": { "damage": <number>, "healing": <number> }, ... },
  "conditions": { "dax": { "add": [...], "remove": [...] }, ... },
  "ship": { "name": <string>, "hull": <number>, "fuel": <number>, ... }
}

Critical Rules:
- ALL spending comes from party_credits (the group fund)
- Individual credits are contribution tracking ONLY - never change on spending
- Individual credits only change when someone personally contributes new money
- party_credits is ABSOLUTE value after changes, NOT A DELTA/CHANGE
  Example: If current fund is 15800 and 10000 spent, return {"resources": {"party_credits": 5800}}
- Only include fields that actually changed
- Inventory items are strings
- Conditions are objects: {name: string, type: "positive"/"negative"}`;
            }

            const messages = [
                { role: 'user', content: extractionPrompt }
            ];

            console.log(`📊 Current state for extraction: party_credits=${this.campaignState.resources?.party_credits || 0}`);

            const extractionResponse = await this.aiProvider.generateResponse('You are a JSON extraction system. Return only valid JSON.', messages);

            console.log(`🤖 AI extraction response: ${extractionResponse.substring(0, 500)}`);

            // Parse JSON from response
            let jsonMatch = extractionResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const stateChanges = JSON.parse(jsonMatch[0]);
                console.log(`📋 Parsed state changes:`, JSON.stringify(stateChanges, null, 2));
                return stateChanges;
            }

            console.log(`⚠️  No JSON found in extraction response`);
            return {};
        } catch (error) {
            console.error('State extraction failed:', error);
            return {};
        }
    }

    async applyStateChanges(changes) {
        try {
            const isFantasyStructure = this.campaignState.characters !== undefined;

            console.log('🔄 [STATE] Applying state changes', {
                campaign: this.campaignId,
                structure: isFantasyStructure ? 'fantasy' : 'sci-fi',
                changeTypes: Object.keys(changes)
            });

            if (isFantasyStructure) {
                // FANTASY STRUCTURE (Silverpeak, etc.)

                // Apply party credits
                if (changes.party?.credits !== undefined) {
                    if (!this.campaignState.party) this.campaignState.party = {};
                    const oldCredits = this.campaignState.party.credits || 0;
                    this.campaignState.party.credits = changes.party.credits;
                    console.log(`  💰 [STATE] Party credits: ${oldCredits} → ${changes.party.credits}`);
                }

                // Apply character changes
                if (changes.characters) {
                    Object.keys(changes.characters).forEach(char => {
                        if (this.campaignState.characters[char]) {
                            const charChanges = changes.characters[char];
                            const charState = this.campaignState.characters[char];

                            // HP changes
                            if (charChanges.hp) {
                                const oldHP = charState.hp?.current || 0;
                                charState.hp = { ...charState.hp, ...charChanges.hp };
                                const newHP = charState.hp.current || 0;
                                const delta = newHP - oldHP;
                                console.log(`  ❤️  [STATE] ${char} HP: ${oldHP} → ${newHP} (${delta > 0 ? '+' : ''}${delta})`);
                            }

                            // Credits
                            if (charChanges.credits !== undefined) {
                                charState.credits = charChanges.credits;
                            }

                            // Inventory (add/remove) - consumables, tools, misc
                            if (charChanges.inventory) {
                                if (!charState.inventory) charState.inventory = [];
                                if (charChanges.inventory.add) {
                                    charState.inventory.push(...charChanges.inventory.add);
                                }
                                if (charChanges.inventory.remove) {
                                    charChanges.inventory.remove.forEach(item => {
                                        const idx = charState.inventory.indexOf(item);
                                        if (idx > -1) charState.inventory.splice(idx, 1);
                                    });
                                }
                            }

                            // Equipment (add/remove) - armor, weapons, worn gear
                            if (charChanges.equipment) {
                                if (!charState.equipment) charState.equipment = [];
                                if (charChanges.equipment.add) {
                                    charState.equipment.push(...charChanges.equipment.add);
                                }
                                if (charChanges.equipment.remove) {
                                    charChanges.equipment.remove.forEach(item => {
                                        const idx = charState.equipment.indexOf(item);
                                        if (idx > -1) charState.equipment.splice(idx, 1);
                                    });
                                }
                            }

                            // Spells (add/remove)
                            if (charChanges.spells) {
                                if (!charState.spells) charState.spells = [];
                                if (charChanges.spells.add) {
                                    charState.spells.push(...charChanges.spells.add);
                                }
                                if (charChanges.spells.remove) {
                                    charChanges.spells.remove.forEach(spell => {
                                        const idx = charState.spells.indexOf(spell);
                                        if (idx > -1) charState.spells.splice(idx, 1);
                                    });
                                }
                            }

                            // Conditions (add/remove)
                            if (charChanges.conditions) {
                                if (!charState.conditions) charState.conditions = [];
                                if (charChanges.conditions.add) {
                                    charState.conditions.push(...charChanges.conditions.add);
                                }
                                if (charChanges.conditions.remove) {
                                    charChanges.conditions.remove.forEach(cond => {
                                        const idx = charState.conditions.findIndex(c => c.name === cond);
                                        if (idx > -1) charState.conditions.splice(idx, 1);
                                    });
                                }
                            }
                        }
                    });
                }
            } else {
                // SCI-FI STRUCTURE (Dax, etc.)

                // Apply party_credits changes (group fund)
                if (changes.resources?.party_credits !== undefined) {
                    if (!this.campaignState.resources) {
                        this.campaignState.resources = {};
                    }
                    this.campaignState.resources.party_credits = changes.resources.party_credits;
                }

                // Apply individual credits changes (contribution tracking)
                if (changes.credits) {
                    Object.keys(changes.credits).forEach(char => {
                        if (this.campaignState.party[char]) {
                            this.campaignState.party[char].credits = changes.credits[char];
                        }
                    });
                }

                // Apply inventory changes
                if (changes.inventory) {
                    Object.keys(changes.inventory).forEach(char => {
                        if (this.campaignState.party[char]) {
                            const charInv = this.campaignState.party[char].inventory || [];

                            if (changes.inventory[char].add) {
                                changes.inventory[char].add.forEach(item => {
                                    charInv.push(typeof item === 'string' ? item : item.name);
                                });
                            }

                            if (changes.inventory[char].remove) {
                                changes.inventory[char].remove.forEach(itemToRemove => {
                                    const index = charInv.findIndex(i =>
                                        (typeof i === 'string' ? i : i.name) === itemToRemove
                                    );
                                    if (index > -1) charInv.splice(index, 1);
                                });
                            }

                            this.campaignState.party[char].inventory = charInv;
                        }
                    });
                }

                // Apply HP changes
                if (changes.hp) {
                    Object.keys(changes.hp).forEach(char => {
                        if (this.campaignState.party[char]?.hp) {
                            const before = this.campaignState.party[char].hp.current;
                            if (changes.hp[char].damage) {
                                this.campaignState.party[char].hp.current -= changes.hp[char].damage;
                                console.log(`💔 ${char} HP: ${before} → ${this.campaignState.party[char].hp.current} (${changes.hp[char].damage} damage)`);
                            }
                            if (changes.hp[char].healing) {
                                this.campaignState.party[char].hp.current += changes.hp[char].healing;
                                // Cap at max
                                if (this.campaignState.party[char].hp.current > this.campaignState.party[char].hp.max) {
                                    this.campaignState.party[char].hp.current = this.campaignState.party[char].hp.max;
                                }
                                console.log(`💚 ${char} HP: ${before} → ${this.campaignState.party[char].hp.current} (${changes.hp[char].healing} healing)`);
                            }
                        } else {
                            console.log(`⚠️  Cannot apply HP changes to ${char}: character or HP not found`);
                        }
                    });
                }

                // Apply condition changes
                if (changes.conditions) {
                    Object.keys(changes.conditions).forEach(char => {
                        if (this.campaignState.party[char]) {
                            if (!this.campaignState.party[char].conditions) {
                                this.campaignState.party[char].conditions = [];
                            }

                            if (changes.conditions[char].add) {
                                this.campaignState.party[char].conditions.push(...changes.conditions[char].add);
                            }

                            if (changes.conditions[char].remove) {
                                changes.conditions[char].remove.forEach(condName => {
                                    this.campaignState.party[char].conditions =
                                        this.campaignState.party[char].conditions.filter(c => c.name !== condName);
                                });
                            }
                        }
                    });
                }

                // Apply ship changes
                if (changes.ship) {
                    this.campaignState.ship = { ...this.campaignState.ship, ...changes.ship };
                }
            }

            // Apply combat state (both fantasy and sci-fi)
            if (changes.combat) {
                console.log('⚔️  Applying combat state to campaign');
                this.campaignState.combat = changes.combat;
            }

            // Save updated state
            // For Silverpeak: save to database AND JSON (backwards compat)
            if (this.campaignId === 'test-silverpeak' && this.db) {
                try {
                    // Save to database
                    await this.applyStateToDB(changes);
                    console.log('💾 State saved to database');
                } catch (error) {
                    console.error('❌ Failed to save to database:', error);
                }
            }

            // Always save to JSON (for backwards compatibility and other campaigns)
            await this.updateCampaignState(this.campaignState);
            console.log('✅ [STATE] State changes applied and saved');
        } catch (error) {
            console.error('❌ [STATE] Failed to apply state changes:', error);
        }
    }
    async applyStateToDB(changes) {
        if (!this.db) return;

        try {
            // Update world state
            if (changes.world) {
                await this.db.updateCampaignState({
                    currentLocation: changes.world.currentLocation,
                    timeOfDay: changes.world.timeOfDay,
                    weather: changes.world.weather
                });
            }

            // Update party credits
            if (changes.party?.credits !== undefined) {
                await this.db.updateCampaignState({
                    partyCredits: changes.party.credits
                });
            }

            // Update characters
            if (changes.characters) {
                for (const [charName, charChanges] of Object.entries(changes.characters)) {
                    const character = await this.db.getCharacter(charName);
                    if (!character) {
                        console.warn(`⚠️  Character ${charName} not found in database`);
                        continue;
                    }

                    // HP changes
                    if (charChanges.hp) {
                        await this.db.updateCharacterHP(
                            character.id,
                            charChanges.hp.current,
                            charChanges.hp.max
                        );
                    }

                    // Credits
                    if (charChanges.credits !== undefined) {
                        await this.db.updateCharacterCredits(character.id, charChanges.credits);
                    }

                    // Equipment additions
                    if (charChanges.equipment?.add) {
                        // Get existing equipment to check for duplicates
                        const existingEquipment = await this.db.getEquipment(character.id);

                        for (const item of charChanges.equipment.add) {
                            // Check if item already exists (prevent duplicates during rollback)
                            const alreadyExists = existingEquipment.some(eq => eq.item_name === item);
                            if (alreadyExists) {
                                console.log(`⏭️  Skipping duplicate equipment: ${item} for ${charName}`);
                                continue;
                            }

                            // Try to categorize equipment type
                            let itemType = 'gear';
                            const itemLower = item.toLowerCase();
                            if (itemLower.includes('sword') || itemLower.includes('hammer') ||
                                itemLower.includes('axe') || itemLower.includes('bow') ||
                                itemLower.includes('dagger') || itemLower.includes('spear') ||
                                itemLower.includes('mace') || itemLower.includes('crossbow')) {
                                itemType = 'weapon';
                            } else if (itemLower.includes('armor') || itemLower.includes('mail') ||
                                       itemLower.includes('plate') || itemLower.includes('leather') ||
                                       itemLower.includes('breastplate')) {
                                itemType = 'armor';
                            } else if (itemLower.includes('shield')) {
                                itemType = 'shield';
                            }

                            // Look up D&D 5e properties for this equipment
                            const properties = getEquipmentProperties(item, itemType);
                            console.log(`📝 Adding ${itemType}: ${item} with properties:`, properties);

                            await this.db.addEquipment(character.id, item, itemType, properties, true, 'ai-extracted');
                        }
                    }

                    // Equipment removals
                    if (charChanges.equipment?.remove) {
                        const equipment = await this.db.getEquipment(character.id);
                        for (const itemName of charChanges.equipment.remove) {
                            const eq = equipment.find(e => e.item_name === itemName);
                            if (eq) {
                                await this.db.removeEquipment(eq.id);
                            }
                        }
                    }

                    // Inventory additions
                    if (charChanges.inventory?.add) {
                        // Get existing inventory to check for duplicates
                        const existingInventory = await this.db.getInventory(character.id);

                        for (const item of charChanges.inventory.add) {
                            // Check if item already exists (prevent duplicates during rollback)
                            const alreadyExists = existingInventory.some(inv => inv.item_name === item);
                            if (alreadyExists) {
                                console.log(`⏭️  Skipping duplicate inventory: ${item} for ${charName}`);
                                continue;
                            }

                            await this.db.addInventoryItem(character.id, item, 'misc', 1, {}, 'ai-extracted');
                        }
                    }

                    // Inventory removals
                    if (charChanges.inventory?.remove) {
                        const inventory = await this.db.getInventory(character.id);
                        for (const itemName of charChanges.inventory.remove) {
                            const item = inventory.find(i => i.item_name === itemName);
                            if (item) {
                                await this.db.removeInventoryItem(item.id);
                            }
                        }
                    }

                    // Spell additions
                    if (charChanges.spells?.add) {
                        // Get existing spells to check for duplicates
                        const existingSpells = await this.db.getSpells(character.id);

                        for (const spell of charChanges.spells.add) {
                            // Check if spell already exists (prevent duplicates during rollback)
                            const alreadyExists = existingSpells.some(s => s.spell_name === spell);
                            if (alreadyExists) {
                                console.log(`⏭️  Skipping duplicate spell: ${spell} for ${charName}`);
                                continue;
                            }

                            // Detect if it's an ability vs spell
                            const isAbility = spell.includes('Feature') || spell.includes('Expertise') || spell.includes('Action');

                            // Look up D&D 5e properties for this spell
                            const spellProps = getSpellProperties(spell);

                            // Try to extract level from spell name or use looked-up level
                            let spellLevel = spellProps?.level || null;
                            let spellSchool = spellProps?.school || null;

                            if (!spellLevel) {
                                const levelMatch = spell.match(/\((\d+)(?:st|nd|rd|th) Level\)/i);
                                if (levelMatch) {
                                    spellLevel = parseInt(levelMatch[1]);
                                } else if (spell.includes('Cantrip')) {
                                    spellLevel = 0;
                                }
                            }

                            console.log(`✨ Adding spell: ${spell} with properties:`, spellProps || 'none found');

                            await this.db.addSpell(character.id, spell, spellLevel, spellSchool, isAbility, spellProps || {});
                        }
                    }

                    // Spell removals
                    if (charChanges.spells?.remove) {
                        const spells = await this.db.getSpells(character.id);
                        for (const spellName of charChanges.spells.remove) {
                            const spell = spells.find(s => s.spell_name === spellName);
                            if (spell) {
                                await this.db.removeSpell(spell.id);
                            }
                        }
                    }

                    // Condition additions
                    if (charChanges.conditions?.add) {
                        for (const condition of charChanges.conditions.add) {
                            await this.db.addCondition(character.id, condition);
                        }
                    }

                    // Condition removals
                    if (charChanges.conditions?.remove) {
                        const conditions = await this.db.getConditions(character.id);
                        for (const condName of charChanges.conditions.remove) {
                            const cond = conditions.find(c => c.condition_name === condName);
                            if (cond) {
                                await this.db.removeCondition(cond.id);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error applying state to database:', error);
            throw error;
        }
    }

    async rollbackStateChanges(removedEntries) {
        try {
            // Process removed entries in reverse order to undo changes
            for (let i = removedEntries.length - 1; i >= 0; i--) {
                const entry = removedEntries[i];
                if (!entry.stateChanges || Object.keys(entry.stateChanges).length === 0) continue;

                const changes = entry.stateChanges;

                // Reverse credits changes (would need original values, so we'll reload from backup)
                // Instead of reversing, we'll rebuild state from remaining history
            }

            // Alternative approach: Rebuild state from scratch from remaining history
            // This is more reliable than trying to reverse each change
            await this.rebuildStateFromHistory();

        } catch (error) {
            console.error('Failed to rollback state changes:', error);
        }
    }

    async rebuildStateFromHistory() {
        try {
            // Read the current (rolled back) conversation history
            const data = await fs.readFile(this.paths.conversationHistory, 'utf8');
            const history = JSON.parse(data);

            // Load the INITIAL campaign state (from campaign directory, not modified state file)
            let initialState;
            try {
                // Look for initial-state.json or campaign-state-initial.json in campaign directory
                const initialStatePath = path.join(__dirname, 'campaigns', this.campaignId, 'initial-state.json');
                try {
                    const initialData = await fs.readFile(initialStatePath, 'utf8');
                    initialState = JSON.parse(initialData);
                    console.log('🔄 Loaded initial state from initial-state.json');
                } catch (err) {
                    // Fallback: Use default fantasy structure
                    initialState = this.getDefaultCampaignState();
                    console.log('🔄 Using default campaign state as baseline');
                }
            } catch (err) {
                // Last resort: Empty state
                initialState = this.getDefaultCampaignState();
                console.log('⚠️ No initial state found, using default state');
            }

            // Deep clone to avoid mutations
            this.campaignState = JSON.parse(JSON.stringify(initialState));

            // Replay all state changes from remaining history
            console.log(`🔄 Replaying state changes from ${history.length} history entries...`);
            let changesApplied = 0;
            for (const entry of history) {
                if (entry.role === 'assistant' && entry.stateChanges && Object.keys(entry.stateChanges).length > 0) {
                    await this.applyStateChanges(entry.stateChanges);
                    changesApplied++;
                }
            }

            // Save the rebuilt state to file
            await this.updateCampaignState(this.campaignState);

            console.log(`🔄 Campaign state rebuilt: ${changesApplied} state changes replayed and saved`);
        } catch (error) {
            console.error('Failed to rebuild state from history:', error);
        }
    }

    async saveIndices() {
        try {
            await fs.writeFile(
                this.paths.searchIndex,
                JSON.stringify(this.searchIndices, null, 2)
            );
            console.log('💾 Search indices saved');
        } catch (error) {
            console.error('Failed to save indices:', error);
        }
    }

    async updateCampaignState(updates) {
        if (updates && typeof updates === 'object') {
            this.campaignState = { ...this.campaignState, ...updates };
            await fs.writeFile(
                this.paths.campaignState,
                JSON.stringify(this.campaignState, null, 2)
            );
        }
    }
}

// ==================== DICE ROLL MANAGER ====================
class DiceRollManager {
    static rollDice(diceString) {
        // Parse dice notation (e.g., "1d20+5")
        const match = diceString.match(/(\d+)d(\d+)([+-]\d+)?/);
        if (!match) {
            return { error: 'Invalid dice notation' };
        }
        
        const numDice = parseInt(match[1]);
        const diceType = parseInt(match[2]);
        const modifier = match[3] ? parseInt(match[3]) : 0;
        
        let total = modifier;
        const rolls = [];
        
        for (let i = 0; i < numDice; i++) {
            const roll = Math.floor(Math.random() * diceType) + 1;
            rolls.push(roll);
            total += roll;
        }
        
        return {
            notation: diceString,
            rolls: rolls,
            modifier: modifier,
            total: total,
            critical: rolls.includes(20) && diceType === 20,
            fumble: rolls.includes(1) && diceType === 20 && numDice === 1
        };
    }
}

// ==================== EXPRESS SERVER ====================
const app = express();

// ==================== MULTI-CAMPAIGN CONTEXT MANAGEMENT ====================
// Phase 2: Lazy-load context managers per campaign
const campaignContexts = new Map();

async function getCampaignContext(campaignId) {
    if (campaignId === 'test-silverpeak') {
        if (!campaignContexts.has(campaignId)) {
            campaignContexts.set(campaignId, contextManager);
        }
        return campaignContexts.get(campaignId);
    }

    if (!campaignContexts.has(campaignId)) {
        console.log(`🎮 Loading context manager for campaign: ${campaignId}`);
        const context = new IntelligentContextManager(campaignId);
        await context.initialize();
        campaignContexts.set(campaignId, context);
    }
    return campaignContexts.get(campaignId);
}

// Pre-load Silverpeak campaign (with database and RAG support)
const contextManager = new IntelligentContextManager('test-silverpeak');

// Initialize Combat Manager
const combatManager = new CombatManager(path.join(__dirname, 'campaigns'));

function updateSharedCombatState(context, updates = {}) {
    const emptyState = {
        active: false,
        round: 0,
        currentTurn: 0,
        initiativeOrder: [],
        participants: {
            players: [],
            enemies: []
        },
        context: {},
        actionEconomy: {},
        conditions: {},
        conversationHistory: [],
        rollQueue: []
    };

    if (!context) {
        return { ...emptyState, ...updates };
    }

    const mergedState = {
        ...emptyState,
        ...(context.combatState || {}),
        ...updates
    };

    context.combatState = mergedState;
    if (!context.campaignState) {
        context.campaignState = {};
    }
    context.campaignState.combat = JSON.parse(JSON.stringify(mergedState));

    return mergedState;
}

const DEFAULT_ROLL_QUEUE_LIMIT = 50;
const ROLL_QUEUE_STATUS = Object.freeze({
    PENDING: 'pending',
    PARTIAL: 'partial',
    COMPLETE: 'complete',
    CANCELLED: 'cancelled'
});
const ROLL_PARTICIPANT_STATUS = Object.freeze({
    PENDING: 'pending',
    ROLLED: 'rolled',
    AUTO: 'auto',
    OVERRIDE: 'override',
    CANCELLED: 'cancelled'
});
const ABILITY_PATTERNS = [
    { key: 'str', label: 'Strength', patterns: ['strength', 'str'] },
    { key: 'dex', label: 'Dexterity', patterns: ['dexterity', 'dex'] },
    { key: 'con', label: 'Constitution', patterns: ['constitution', 'con'] },
    { key: 'int', label: 'Intelligence', patterns: ['intelligence', 'int'] },
    { key: 'wis', label: 'Wisdom', patterns: ['wisdom', 'wis'] },
    { key: 'cha', label: 'Charisma', patterns: ['charisma', 'cha'] }
];

function normalizeParticipantKey(value) {
    return (value || '').toString().trim().toLowerCase();
}

function normalizeCombatantName(name) {
    return (name || '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/**
 * Fuzzy match combatant names to handle variations like "Thorne" vs "Thorne Ironheart"
 * Returns true if names match using first-word or full-name comparison
 */
function fuzzyMatchCombatantName(name1, name2) {
    if (!name1 || !name2) return false;

    const n1 = name1.toString().trim().toLowerCase();
    const n2 = name2.toString().trim().toLowerCase();

    // Exact match
    if (n1 === n2) return true;

    // Normalized match (remove special chars)
    const normalized1 = n1.replace(/[^a-z0-9]/g, '');
    const normalized2 = n2.replace(/[^a-z0-9]/g, '');
    if (normalized1 === normalized2) return true;

    // First word match (handles "Thorne" matching "Thorne Ironheart")
    const firstWord1 = n1.split(/\s+/)[0];
    const firstWord2 = n2.split(/\s+/)[0];
    if (firstWord1 && firstWord2 && firstWord1 === firstWord2 && firstWord1.length >= 3) {
        return true;
    }

    // One name contains the other (handles partial matches)
    if (n1.includes(n2) || n2.includes(n1)) {
        return true;
    }

    return false;
}

function ensureRollQueueArray(state) {
    if (!state || typeof state !== 'object') {
        return [];
    }
    if (!Array.isArray(state.rollQueue)) {
        state.rollQueue = [];
    }
    return state.rollQueue;
}

function trimRollQueue(queue, limit = DEFAULT_ROLL_QUEUE_LIMIT) {
    if (!Array.isArray(queue)) {
        return;
    }

    while (queue.length > limit) {
        const [oldest] = queue;
        if (oldest && oldest.status === ROLL_QUEUE_STATUS.PENDING) {
            break;
        }
        queue.shift();
    }
}

function generateRollQueueId() {
    return `rq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function getSharedCombatStateWithQueue(context, campaignId) {
    let combatState = combatManager.getCombatState(campaignId);
    if (!combatState || typeof combatState !== 'object' || Object.keys(combatState).length === 0) {
        try {
            combatState = await combatManager.loadCombatState(campaignId);
        } catch (error) {
            console.warn('⚠️  Roll queue: no persisted combat state, using defaults', {
                campaignId,
                message: error.message
            });
            combatState = null;
        }
    }

    if (!combatState) {
        combatState = {
            active: false,
            round: 0,
            currentTurn: 0,
            initiativeOrder: [],
            rollQueue: []
        };
    }

    ensureRollQueueArray(combatState);
    const sharedState = updateSharedCombatState(context, combatState);
    ensureRollQueueArray(sharedState);
    return sharedState;
}

async function persistCombatStateWithQueue(context, campaignId, combatState) {
    ensureRollQueueArray(combatState);

    context.combatState = combatState;
    if (!context.campaignState) {
        context.campaignState = {};
    }
    context.campaignState.combat = combatState;

    await combatManager.setCombatState(campaignId, combatState, true);

    if (typeof context.updateCampaignState === 'function') {
        try {
            await context.updateCampaignState({ combat: combatState });
        } catch (error) {
            console.error('⚠️  Failed to persist combat state with roll queue to campaign file:', error.message);
        }
    }

    return combatState;
}

function createParticipantDescriptor(raw = {}, overrides = {}, fallbackName) {
    const name = (overrides.name || raw.name || fallbackName || '').toString().trim();
    if (!name) {
        return null;
    }

    const id = overrides.participantId || raw.participantId || raw.id || null;
    const entityType = overrides.entityType || (raw.isPlayer === false ? 'enemy' : 'player');
    const isPlayer = overrides.isPlayer !== undefined ? overrides.isPlayer : entityType !== 'enemy';

    const aliasSet = new Set();
    const normalizedName = normalizeParticipantKey(name);
    if (normalizedName) aliasSet.add(normalizedName);
    name.split(/\s+/).forEach(chunk => aliasSet.add(normalizeParticipantKey(chunk)));
    if (id) aliasSet.add(normalizeParticipantKey(id));
    if (Array.isArray(raw.aliases)) {
        raw.aliases.forEach(alias => aliasSet.add(normalizeParticipantKey(alias)));
    }
    if (Array.isArray(overrides.aliases)) {
        overrides.aliases.forEach(alias => aliasSet.add(normalizeParticipantKey(alias)));
    }

    return {
        participantId: id || normalizedName || `participant-${Math.random().toString(36).slice(2, 7)}`,
        id: id,
        name,
        entityType,
        isPlayer,
        abilityScores: raw.abilities || raw.abilityScores || null,
        initiative: raw.initiative ?? null,
        dc: raw.dc ?? null,
        advantage: overrides.advantage || raw.advantage || 'normal',
        abilityKey: raw.abilityKey || overrides.abilityKey || null,
        aliases: Array.from(aliasSet).filter(Boolean),
        raw
    };
}

function collectCampaignParticipants(context, combatState) {
    const players = [];
    const enemies = [];
    const seenPlayers = new Set();
    const seenEnemies = new Set();

    const pushDescriptor = (target, seen, raw, overrides = {}) => {
        const descriptor = createParticipantDescriptor(raw, overrides);
        if (!descriptor) {
            return;
        }

        const key = normalizeParticipantKey(descriptor.participantId || descriptor.name);
        if (!key || seen.has(key)) {
            return;
        }

        seen.add(key);
        target.push(descriptor);
    };

    const state = context?.campaignState || {};

    if (state.characters && typeof state.characters === 'object') {
        Object.entries(state.characters).forEach(([id, data]) => {
            if (data && typeof data === 'object') {
                pushDescriptor(players, seenPlayers, { ...data, id }, { entityType: 'player', isPlayer: true });
            }
        });
    }

    if (state.party && typeof state.party === 'object') {
        Object.entries(state.party).forEach(([id, data]) => {
            if (data && typeof data === 'object' && (data.name || data.hp)) {
                pushDescriptor(players, seenPlayers, { ...data, id }, { entityType: 'player', isPlayer: true });
            }
        });
    }

    const initiativeOrder = Array.isArray(combatState?.initiativeOrder) ? combatState.initiativeOrder : [];
    initiativeOrder.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        const overrides = {
            entityType: entry.isPlayer === false ? 'enemy' : 'player',
            isPlayer: entry.isPlayer !== false
        };
        if (entry.isPlayer === false) {
            pushDescriptor(enemies, seenEnemies, entry, overrides);
        } else {
            pushDescriptor(players, seenPlayers, entry, overrides);
        }
    });

    if (combatState?.participants) {
        if (Array.isArray(combatState.participants.players)) {
            combatState.participants.players.forEach(entry => pushDescriptor(players, seenPlayers, entry, { entityType: 'player', isPlayer: true }));
        }
        if (Array.isArray(combatState.participants.enemies)) {
            combatState.participants.enemies.forEach(entry => pushDescriptor(enemies, seenEnemies, entry, { entityType: 'enemy', isPlayer: false }));
        }
    }

    return { players, enemies };
}

function deriveParticipantsForRoll(context, combatState, rollRequest, explicitParticipants) {
    const { players, enemies } = collectCampaignParticipants(context, combatState);
    const allParticipants = [...players, ...enemies];
    const selections = new Map();
    const normalizedRequest = (rollRequest || '').toLowerCase();

    const selectDescriptor = descriptor => {
        if (!descriptor) return;
        const key = normalizeParticipantKey(descriptor.participantId || descriptor.name);
        if (!key || selections.has(key)) return;
        selections.set(key, descriptor);
    };

    if (Array.isArray(explicitParticipants) && explicitParticipants.length) {
        explicitParticipants.forEach(explicit => {
            const targetKey = normalizeParticipantKey(explicit.participantId || explicit.id || explicit.name);
            if (!targetKey) {
                return;
            }
            const match = allParticipants.find(candidate => {
                const aliases = new Set(candidate.aliases || []);
                [
                    candidate.participantId,
                    candidate.id,
                    candidate.name
                ].forEach(token => aliases.add(normalizeParticipantKey(token)));
                return aliases.has(targetKey);
            });
            if (match) {
                selectDescriptor(match);
            }
        });
    }

    const matchByMention = descriptor => descriptor.aliases?.some(alias => alias && normalizedRequest.includes(alias));

    players.filter(matchByMention).forEach(selectDescriptor);
    enemies.filter(matchByMention).forEach(selectDescriptor);

    if (!selections.size && /enemy|enemies|opponent|foe/i.test(normalizedRequest)) {
        enemies.forEach(selectDescriptor);
    }

    if (!selections.size) {
        players.forEach(selectDescriptor);
    }

    return Array.from(selections.values());
}

function buildSlug(value = '') {
    return value
        .toLowerCase()
        .trim()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9\s-]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function deriveCombatActionMetadata(rollRequest = '', options = {}) {
    if (!rollRequest || typeof rollRequest !== 'string') {
        return null;
    }

    const normalized = rollRequest.replace(/\s+/g, ' ').trim();

    const attackMatch = normalized.match(/Roll\s+((?:Spell|Weapon)?\s*Attack)\s*\(\s*([+\-]?\d+)\s*to hit(?:,\s*vs\s*AC\s*(\d+))?\)\s*(?:with\s+([^:(]+))/i);
    if (attackMatch) {
        const [, attackKindRaw, bonusRaw, acRaw, attackNameRaw] = attackMatch;
        const attackType = (attackKindRaw || '').toLowerCase().includes('spell') ? 'spell' : 'weapon';
        const attackBonusValue = Number.parseInt(bonusRaw, 10);
        const attackName = attackNameRaw
            ? attackNameRaw.replace(/\b(your|the|their)\b/gi, '').trim()
            : null;

        return {
            kind: 'attack',
            source: options.source || 'narrative',
            attacker: options.attacker || null,
            attackType,
            attackName: attackName || null,
            attackSlug: attackName ? buildSlug(attackName) : null,
            attackBonus: Number.isFinite(attackBonusValue) ? attackBonusValue : null,
            targetAC: acRaw ? Number.parseInt(acRaw, 10) : null,
            pendingSteps: attackType ? ['attack', 'damage'] : ['attack'],
            movement: options.movement || null,
            resourceUse: options.resourceUse || null
        };
    }

    const saveMatch = normalized.match(/Roll\s+([A-Za-z\s]+)\s+Saving Throw\s*\(DC\s*(\d+)\)\s+to\s+(.+)/i);
    if (saveMatch) {
        const [, abilityRaw, dcRaw, description] = saveMatch;
        return {
            kind: 'saving-throw',
            source: options.source || 'narrative',
            attacker: options.attacker || null,
            ability: abilityRaw.trim().toLowerCase(),
            dc: Number.parseInt(dcRaw, 10),
            description: description.trim()
        };
    }

    return null;
}

function cloneRollResult(result) {
    if (!result) {
        return null;
    }
    return {
        total: Number.isFinite(result.total) ? result.total : null,
        natural: Number.isFinite(result.natural) ? result.natural : null,
        modifier: Number.isFinite(result.modifier) ? result.modifier : null,
        formula: result.formula || null,
        rolls: Array.isArray(result.rolls) ? [...result.rolls] : result.rolls || null,
        auto: !!result.auto,
        submittedBy: result.submittedBy || null,
        submittedAt: result.submittedAt || null,
        notes: result.notes || null,
        metadata: result.metadata ? { ...result.metadata } : {}
    };
}

function doubleDiceFormula(formula = '') {
    if (!formula) return null;
    return formula.replace(/(\d+)\s*d\s*(\d+)/gi, (_, count, sides) => `${Number(count) * 2}d${sides}`);
}

function normalizeCombatName(value) {
    return (value || '').toString().trim().toLowerCase();
}

function pickDamageByLevel(map, level) {
    if (!map || typeof map !== 'object') {
        return null;
    }
    const keys = Object.keys(map)
        .map(key => Number.parseInt(key, 10))
        .filter(num => Number.isFinite(num))
        .sort((a, b) => a - b);

    if (!keys.length) {
        return null;
    }

    if (!Number.isFinite(level)) {
        return map[String(keys[0])];
    }

    let selected = keys[0];
    for (const key of keys) {
        if (level >= key) {
            selected = key;
        } else {
            break;
        }
    }
    return map[String(selected)];
}

function inferCharacterLevel(context, combatState, attacker) {
    const defaultLevel = 3;
    if (!attacker) {
        return defaultLevel;
    }

    const names = new Set();
    if (typeof attacker === 'string') {
        names.add(normalizeCombatName(attacker));
    } else {
        if (attacker.name) names.add(normalizeCombatName(attacker.name));
        if (attacker.id) names.add(normalizeCombatName(attacker.id));
    }

    if (!names.size) {
        return defaultLevel;
    }

    const matchNames = (...candidates) => {
        for (const candidate of candidates) {
            if (!candidate) continue;
            const normalized = normalizeCombatName(candidate);
            if (names.has(normalized)) {
                return true;
            }
        }
        return false;
    };

    const searchPool = [];
    if (context?.characterSheets && typeof context.characterSheets === 'object') {
        Object.values(context.characterSheets).forEach(sheet => searchPool.push(sheet));
    }
    if (context?.campaignState?.party && typeof context.campaignState.party === 'object') {
        Object.values(context.campaignState.party).forEach(entry => searchPool.push(entry));
    }
    if (combatState?.participants?.players) {
        combatState.participants.players.forEach(entry => searchPool.push(entry));
    }

    for (const candidate of searchPool) {
        if (candidate && matchNames(candidate.name, candidate.id, candidate.characterName)) {
            const level = candidate.level ?? candidate.levels ?? candidate.characterLevel;
            if (Number.isFinite(level)) {
                return level;
            }
        }
    }

    return defaultLevel;
}

async function resolveDamageInformation(combatAction, context, combatState) {
    if (!combatAction || combatAction.kind !== 'attack' || !combatAction.attackName) {
        return null;
    }

    try {
        if (combatAction.attackType === 'spell') {
            const spellDetails = await rulesLookupService.getSpellDetails(combatAction.attackName);
            if (!spellDetails || !spellDetails.damage) {
                return null;
            }

            const level = inferCharacterLevel(context, combatState, combatAction.attacker);
            let formula = spellDetails.damage.formula || null;

            if (!formula && spellDetails.damage.damage_at_character_level) {
                formula = pickDamageByLevel(spellDetails.damage.damage_at_character_level, level);
            }

            if (!formula && spellDetails.damage.damage_at_slot_level) {
                formula = pickDamageByLevel(spellDetails.damage.damage_at_slot_level, combatAction.slotLevel || null);
            }

            const type = spellDetails.damage.type || null;
            return formula ? { formula, type } : null;
        }

        if (combatAction.attackType === 'weapon') {
            const itemDetails = await rulesLookupService.getItemDetails(combatAction.attackName);
            if (itemDetails?.damage?.dice) {
                return {
                    formula: itemDetails.damage.dice,
                    type: itemDetails.damage.type || null
                };
            }
        }
    } catch (error) {
        console.warn(`⚠️  Unable to resolve damage data for ${combatAction.attackName}:`, error.message);
    }

    return null;
}

async function enrichCombatActionMetadata(combatAction, context, combatState) {
    if (!combatAction) {
        return null;
    }

    const enriched = { ...combatAction };

    if (enriched.kind === 'attack') {
        const damageInfo = await resolveDamageInformation(enriched, context, combatState);
        if (damageInfo) {
            enriched.damage = {
                formula: damageInfo.formula,
                type: damageInfo.type || null,
                critFormula: doubleDiceFormula(damageInfo.formula)
            };
        }

        enriched.steps = Array.isArray(enriched.steps) ? enriched.steps : [];
        if (!enriched.steps.some(step => step.type === 'attack')) {
            enriched.steps.push({ type: 'attack', status: 'pending' });
        }
        if (enriched.damage && !enriched.steps.some(step => step.type === 'damage')) {
            enriched.steps.push({
                type: 'damage',
                status: 'pending',
                formula: enriched.damage.formula || null,
                critFormula: enriched.damage.critFormula || null,
                damageType: enriched.damage.type || null
            });
        }
        enriched.currentStepIndex = 0;
        enriched.awaitingDamage = false;
    }

    if (!enriched.initialReason && enriched.reason) {
        enriched.initialReason = enriched.reason;
    }

    return enriched;
}

function parseRollRequestDetails(rollRequest = '') {
    const details = {
        type: 'generic',
        ability: null,
        abilityKey: null,
        advantage: 'normal',
        dc: null,
        metadata: {
            rawRequest: rollRequest
        }
    };

    const lower = rollRequest.toLowerCase();

    if (lower.includes('saving throw')) {
        details.type = 'saving-throw';
    } else if (lower.includes('attack roll')) {
        details.type = 'attack-roll';
    } else if (lower.includes('check')) {
        details.type = 'skill-check';
    }

    const dcMatch = rollRequest.match(/dc\s*(\d+)/i);
    if (dcMatch) {
        details.dc = parseInt(dcMatch[1], 10);
    }

    if (lower.includes('advantage')) {
        details.advantage = 'advantage';
    } else if (lower.includes('disadvantage')) {
        details.advantage = 'disadvantage';
    }

    for (const pattern of ABILITY_PATTERNS) {
        if (pattern.patterns.some(token => lower.includes(token))) {
            details.ability = pattern.label;
            details.abilityKey = pattern.key;
            details.metadata.abilityLabel = pattern.label;
            break;
        }
    }

    details.metadata.checkType = details.type;

    return details;
}

async function enqueueRollQueueEntry(context, campaignId, combatState, options) {
    const rollQueue = ensureRollQueueArray(combatState);
    const now = new Date().toISOString();
    const timeoutSeconds = Number(options.timeoutSeconds || 0);
    const expiresAt = options.expiresAt ||
        (timeoutSeconds > 0 ? new Date(Date.now() + timeoutSeconds * 1000).toISOString() : null);

    const participants = Array.isArray(options.participants) ? options.participants.filter(Boolean) : [];
    if (!participants.length) {
        throw new Error('Roll queue entry requires at least one participant');
    }

    const entry = {
        queueId: generateRollQueueId(),
        campaignId,
        reason: options.reason || 'Dice roll required',
        type: options.type || 'generic',
        requestedBy: options.requestedBy || 'system',
        source: options.source || 'manual',
        requestedAt: now,
        createdAt: now,
        lastUpdatedAt: now,
        expiresAt,
        status: ROLL_QUEUE_STATUS.PENDING,
        ability: options.ability || null,
        dc: options.dc ?? null,
        advantage: options.advantage || 'normal',
        metadata: {
            ...(options.metadata || {}),
            ...(options.combatAction ? { combatAction: options.combatAction } : {})
        },
        participants: participants.map((participant, index) => {
            const participantId = participant.participantId || participant.id || `${options.defaultParticipantPrefix || 'participant'}-${index + 1}`;
            return {
                participantId,
                id: participant.id || null,
                name: participant.name || `Participant ${index + 1}`,
                entityType: participant.entityType || (participant.isPlayer === false ? 'enemy' : 'player'),
                ability: participant.ability ?? options.ability ?? null,
                dc: participant.dc ?? options.dc ?? null,
                advantage: participant.advantage || options.advantage || 'normal',
                status: ROLL_PARTICIPANT_STATUS.PENDING,
                result: null,
                notes: participant.notes || null,
                submittedBy: null,
                submittedAt: null,
                lastUpdatedAt: now,
                aliases: Array.isArray(participant.aliases) ? participant.aliases : undefined
            };
        })
    };

    if (!entry.metadata.rawRequest && typeof entry.reason === 'string') {
        entry.metadata.rawRequest = entry.reason;
    }

    rollQueue.push(entry);
    trimRollQueue(rollQueue);

    await persistCombatStateWithQueue(context, campaignId, combatState);

    console.log('🎲  [ROLL QUEUE] Created entry', {
        campaign: campaignId,
        queueId: entry.queueId,
        participants: entry.participants.map(p => p.name),
        reason: entry.reason
    });

    return entry;
}

function findRollQueueEntry(combatState, queueId) {
    const rollQueue = ensureRollQueueArray(combatState);
    return rollQueue.find(entry => entry.queueId === queueId);
}

function findRollQueueParticipant(entry, identifier) {
    if (!entry || !identifier) {
        return null;
    }

    const normalized = normalizeParticipantKey(identifier);
    if (!normalized) {
        return null;
    }

    return entry.participants.find(participant => {
        const candidates = [
            participant.participantId,
            participant.id,
            participant.name
        ];

        if (Array.isArray(participant.aliases)) {
            candidates.push(...participant.aliases);
        }

        return candidates.some(value => normalizeParticipantKey(value) === normalized);
    });
}

function updateRollQueueStatus(entry) {
    if (!entry) {
        return;
    }

    if (entry.status === ROLL_QUEUE_STATUS.CANCELLED) {
        return;
    }

    const total = entry.participants.length;
    const pendingCount = entry.participants.filter(p => p.status === ROLL_PARTICIPANT_STATUS.PENDING).length;

    if (total === 0) {
        entry.status = ROLL_QUEUE_STATUS.PENDING;
        entry.completedAt = null;
        return;
    }

    if (pendingCount === 0) {
        entry.status = ROLL_QUEUE_STATUS.COMPLETE;
        entry.completedAt = entry.completedAt || new Date().toISOString();
    } else if (pendingCount === total) {
        entry.status = ROLL_QUEUE_STATUS.PENDING;
        entry.completedAt = null;
    } else {
        entry.status = ROLL_QUEUE_STATUS.PARTIAL;
        entry.completedAt = null;
    }
}

async function recordParticipantResult(context, campaignId, combatState, queueId, payload) {
    const entry = findRollQueueEntry(combatState, queueId);
    if (!entry) {
        throw new Error('Queue entry not found');
    }

    if (entry.status === ROLL_QUEUE_STATUS.CANCELLED) {
        throw new Error('Queue entry has been cancelled');
    }

    const participantIdentifier = payload.participantId || payload.participantName;
    const participant = findRollQueueParticipant(entry, participantIdentifier);

    if (!participant) {
        throw new Error('Participant not found for queue entry');
    }

    if (participant.status !== ROLL_PARTICIPANT_STATUS.PENDING && !payload.force) {
        throw new Error('Participant already resolved');
    }

    const now = new Date().toISOString();
    const auto = !!payload.auto;
    const resultPayload = {
        total: payload.total ?? payload.result?.total ?? null,
        natural: payload.natural ?? payload.result?.natural ?? null,
        modifier: payload.modifier ?? payload.result?.modifier ?? null,
        formula: payload.formula || payload.notation || payload.result?.notation || null,
        rolls: payload.rolls || payload.result?.rolls || null,
        auto,
        submittedBy: payload.submittedBy || 'player',
        submittedAt: now,
        notes: payload.notes || null,
        metadata: payload.metadata || {}
    };

    participant.status = payload.status || (auto ? ROLL_PARTICIPANT_STATUS.AUTO : ROLL_PARTICIPANT_STATUS.ROLLED);
    participant.result = resultPayload;
    participant.submittedBy = resultPayload.submittedBy;
    participant.submittedAt = now;
    participant.lastUpdatedAt = now;

    entry.lastUpdatedAt = now;
    if (!Array.isArray(entry.results)) {
        entry.results = [];
    }
    const summaryKey = normalizeParticipantKey(participant.participantId || participant.name);
    let shouldAddSummary = true;

    const combatAction = entry.metadata?.combatAction || null;
    const steps = Array.isArray(combatAction?.steps) ? combatAction.steps : null;
    const currentStepIndex = steps ? (combatAction.currentStepIndex ?? 0) : null;
    const currentStep = steps && currentStepIndex !== null ? steps[currentStepIndex] : null;

    if (combatAction && currentStep) {
        if (currentStep.type === 'attack') {
            currentStep.status = 'complete';
            currentStep.result = cloneRollResult(resultPayload);

            const attackTotal = Number.isFinite(resultPayload.total) ? resultPayload.total : null;
            const attackNatural = Number.isFinite(resultPayload.natural) ? resultPayload.natural : null;
            const attackModifier = Number.isFinite(resultPayload.modifier) ? resultPayload.modifier : null;
            const targetAC = Number.isFinite(combatAction.targetAC) ? combatAction.targetAC : null;
            let hit = null;
            if (targetAC !== null && attackTotal !== null) {
                hit = attackTotal >= targetAC;
            }
            const crit = attackNatural === 20;
            const fumble = attackNatural === 1;

            combatAction.outcome = {
                total: attackTotal,
                natural: attackNatural,
                modifier: attackModifier,
                targetAC,
                hit: crit ? true : hit,
                crit,
                fumble
            };

            const nextStep = steps[currentStepIndex + 1];
            const shouldRequestDamage = nextStep && nextStep.type === 'damage' && (combatAction.outcome.hit !== false);

            if (shouldRequestDamage) {
                nextStep.status = 'pending';
                if (combatAction.damage) {
                    nextStep.formula = nextStep.formula || combatAction.damage.formula || null;
                    nextStep.critFormula = nextStep.critFormula || combatAction.damage.critFormula || null;
                    nextStep.damageType = nextStep.damageType || combatAction.damage.type || null;
                }
                combatAction.currentStepIndex = currentStepIndex + 1;
                combatAction.awaitingDamage = true;

                const damageFormula = combatAction.outcome.crit && nextStep.critFormula
                    ? nextStep.critFormula
                    : nextStep.formula;
                const damagePrompt = `Roll damage${damageFormula ? ` (${damageFormula})` : ''} for ${combatAction.attackName || 'attack'}`;

                entry.reason = damagePrompt;
                entry.metadata.rawRequest = damagePrompt;
                entry.metadata.description = damagePrompt;
                entry.metadata.combatAction = combatAction;

                participant.status = ROLL_PARTICIPANT_STATUS.PENDING;
                participant.result = null;
                participant.submittedBy = null;
                participant.submittedAt = null;
                participant.lastUpdatedAt = now;

                entry.status = ROLL_QUEUE_STATUS.PENDING;
                entry.completedAt = null;
                entry.results = entry.results.filter(record => normalizeParticipantKey(record.participantId) !== summaryKey);

                shouldAddSummary = false;

                await persistCombatStateWithQueue(context, campaignId, combatState);
                console.log('🎲  [ROLL QUEUE] Awaiting damage roll', {
                    campaign: campaignId,
                    queueId,
                    participant: participant.name
                });
                return entry;
            } else if (nextStep && nextStep.type === 'damage') {
                nextStep.status = 'skipped';
                combatAction.currentStepIndex = currentStepIndex;
                combatAction.awaitingDamage = false;
            }

            entry.metadata.combatAction = combatAction;
        } else if (currentStep.type === 'damage') {
            currentStep.status = 'complete';
            currentStep.result = cloneRollResult(resultPayload);
            combatAction.currentStepIndex = currentStepIndex;
            combatAction.awaitingDamage = false;

            if (combatAction.outcome) {
                combatAction.outcome.damage = {
                    total: resultPayload.total,
                    formula: currentStep.formula || resultPayload.formula || null,
                    type: currentStep.damageType || combatAction.damage?.type || null
                };
            }

            if (combatAction.initialReason) {
                entry.reason = combatAction.initialReason;
                entry.metadata.rawRequest = combatAction.initialReason;
                entry.metadata.description = combatAction.initialReason;
            }

            entry.metadata.combatAction = combatAction;
        }
    }

    if (shouldAddSummary) {
        const index = entry.results.findIndex(record => normalizeParticipantKey(record.participantId) === summaryKey);
        const summary = {
            participantId: participant.participantId,
            name: participant.name,
            status: participant.status,
            total: participant.result.total,
            auto: participant.result.auto,
            submittedBy: participant.result.submittedBy,
            submittedAt: participant.result.submittedAt
        };
        if (index >= 0) {
            entry.results[index] = summary;
        } else {
            entry.results.push(summary);
        }
    }

    updateRollQueueStatus(entry);

    await persistCombatStateWithQueue(context, campaignId, combatState);
    console.log('🎲  [ROLL QUEUE] Participant resolved', {
        campaign: campaignId,
        queueId,
        participant: participant.name,
        total: participant.result ? participant.result.total : null,
        status: participant.status
    });
    return entry;
}

async function overrideRollQueueEntry(context, campaignId, combatState, queueId, payload) {
    const entry = findRollQueueEntry(combatState, queueId);
    if (!entry) {
        throw new Error('Queue entry not found');
    }

    const now = new Date().toISOString();
    const targetStatus = payload.status || ROLL_QUEUE_STATUS.CANCELLED;

    if (Array.isArray(payload.results)) {
        payload.results.forEach(result => {
            const participant = findRollQueueParticipant(entry, result.participantId || result.participantName);
            if (!participant) {
                return;
            }

            participant.status = result.status || ROLL_PARTICIPANT_STATUS.OVERRIDE;
            participant.result = {
                total: result.total ?? null,
                natural: result.natural ?? null,
                modifier: result.modifier ?? null,
                formula: result.formula ?? null,
                rolls: result.rolls ?? null,
                auto: !!result.auto,
                submittedBy: result.submittedBy || payload.overriddenBy || 'override',
                submittedAt: now,
                notes: result.notes || null,
                metadata: result.metadata || {}
            };
            participant.lastUpdatedAt = now;
        });
    }

    entry.status = targetStatus;
    entry.lastUpdatedAt = now;
    entry.resolution = {
        ...(entry.resolution || {}),
        ...payload.resolution,
        overriddenBy: payload.overriddenBy || 'dm',
        overrideAt: now,
        reason: payload.reason || payload.resolution?.reason || entry.resolution?.reason || null
    };

    if (targetStatus === ROLL_QUEUE_STATUS.CANCELLED) {
        entry.completedAt = null;
    } else if (targetStatus === ROLL_QUEUE_STATUS.COMPLETE) {
        entry.completedAt = entry.completedAt || now;
    } else {
        updateRollQueueStatus(entry);
    }

    await persistCombatStateWithQueue(context, campaignId, combatState);
    console.log('🎲  [ROLL QUEUE] Entry overridden', {
        campaign: campaignId,
        queueId,
        status: entry.status,
        overriddenBy: entry.resolution?.overriddenBy
    });
    return entry;
}

async function removeRollQueueEntry(context, campaignId, combatState, queueId) {
    const rollQueue = ensureRollQueueArray(combatState);
    const index = rollQueue.findIndex(entry => entry.queueId === queueId);
    if (index === -1) {
        throw new Error('Queue entry not found');
    }

    const [removed] = rollQueue.splice(index, 1);
    await persistCombatStateWithQueue(context, campaignId, combatState);
    console.log('🗑️  [ROLL QUEUE] Entry removed', {
        campaign: campaignId,
        queueId: removed?.queueId,
        reason: removed?.reason
    });
    return removed;
}

async function enqueueRollRequestFromNarrative(context, campaignId, rollRequest, options = {}) {
    if (!rollRequest || typeof rollRequest !== 'string') {
        return null;
    }

    const combatState = await getSharedCombatStateWithQueue(context, campaignId);
    const rollQueue = ensureRollQueueArray(combatState);
    const duplicate = rollQueue.find(entry =>
        entry.status === ROLL_QUEUE_STATUS.PENDING &&
        entry.metadata &&
        entry.metadata.rawRequest === rollRequest
    );

    if (duplicate) {
        duplicate.metadata = duplicate.metadata || {};
        duplicate.metadata.duplicateCount = (duplicate.metadata.duplicateCount || 0) + 1;
        return null;
    }

    const details = parseRollRequestDetails(rollRequest);
    let combatAction = deriveCombatActionMetadata(rollRequest, {
        source: options.source || 'narrative',
        attacker: options.requestedBy || null
    });

    if (combatAction) {
        combatAction.reason = rollRequest;
        combatAction = await enrichCombatActionMetadata(combatAction, context, combatState);
    }

    const derivedParticipants = deriveParticipantsForRoll(context, combatState, rollRequest, options.participants);

    if (!derivedParticipants.length) {
        console.log('⚠️  Roll request detected but no participants resolved', { campaignId, rollRequest });
        return null;
    }

    // Auto-resolve rolls for enemy-only participants (DM-controlled NPCs)
    const allParticipantsAreEnemies = derivedParticipants.every(p => p.entityType === 'enemy');
    if (allParticipantsAreEnemies) {
        console.log('🎲 Auto-resolving enemy roll:', rollRequest);
        // Don't queue - enemies roll automatically
        return null;
    }

    return enqueueRollQueueEntry(context, campaignId, combatState, {
        reason: rollRequest,
        type: details.type,
        requestedBy: options.requestedBy || 'dm',
        source: options.source || 'narrative',
        dc: details.dc,
        ability: details.abilityKey,
        advantage: details.advantage,
        combatAction,
        metadata: {
            rawRequest: rollRequest,
            ability: details.ability,
            abilityKey: details.abilityKey,
            checkType: details.type,
            autoCreated: true,
            combatAction
        },
        participants: derivedParticipants.map(descriptor => ({
            participantId: descriptor.participantId,
            id: descriptor.id,
            name: descriptor.name,
            entityType: descriptor.entityType,
            ability: descriptor.abilityKey || descriptor.ability || details.abilityKey,
            dc: descriptor.dc ?? details.dc ?? null,
            advantage: descriptor.advantage || details.advantage || 'normal',
            aliases: descriptor.aliases
        })),
        timeoutSeconds: options.timeoutSeconds || null
    });
}

app.use(cors());
app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            console.error('❌ Invalid JSON received:', e.message);
            console.error('Raw body:', buf.toString().substring(0, 200));
            throw new SyntaxError('Invalid JSON');
        }
    }
}));

// ==================== CAMPAIGN-SPECIFIC ROUTING (MUST BE BEFORE STATIC FILES) ====================

// Serve the main game interface with campaign routing
app.get('/dnd/game.html', (req, res) => {
    const campaignId = req.query.campaign || 'default';

    // Check if campaign has its own HTML file
    const campaignHtmlPath = path.join(__dirname, 'campaigns', campaignId, 'index.html');
    const fs = require('fs');

    if (fs.existsSync(campaignHtmlPath)) {
        // Serve campaign-specific HTML
        console.log(`📄 Serving campaign-specific HTML for: ${campaignId}`);
        res.sendFile(campaignHtmlPath);
    } else {
        // Fall back to default game.html (for Dax/default campaign)
        console.log(`📄 Serving default game.html for: ${campaignId}`);
        res.sendFile(path.join(__dirname, 'game.html'));
    }
});

// Serve splash page
app.get('/dnd/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Static files (after routing)
// Serve shared resources at /dnd/shared/
app.use('/dnd/shared', express.static(path.join(__dirname, 'shared')));

// Serve campaign-specific resources at /dnd/campaigns/
app.use('/dnd/campaigns', express.static(path.join(__dirname, 'campaigns')));

// Serve root-level static files under /dnd/
app.use('/dnd', express.static(__dirname));

// ==================== MAIN GAME ENDPOINTS ====================

// Process player action with intelligent context - Handler function
async function handleActionRequest(req, res) {
    const { action, character, campaignState, sessionId, useRealClaude, mode, campaignId, campaign } = req.body;

    // Get the appropriate campaign context (accept both 'campaign' and 'campaignId')
    const activeCampaignId = campaignId || campaign || 'default';
    const context = await getCampaignContext(activeCampaignId);

    if (!context.isLoaded) {
        return res.status(503).json({ error: 'System still loading...' });
    }

    try {
        // DO NOT accept campaignState from client - server is authoritative
        // The client sending state was causing corruption where Dax data merged into Silverpeak

        // Process with intelligent retrieval, passing mode parameter
        const result = await context.processPlayerAction(
            action,
            sessionId || 'default',
            mode || 'ic'  // Default to IC mode if not specified
        );

        // Enqueue all roll requests found in the narrative
        const queuedRollEntries = [];
        const rollRequests = result.rollRequests || (result.rollRequest ? [result.rollRequest] : []);

        for (const rollRequestText of rollRequests) {
            if (typeof rollRequestText === 'string' && rollRequestText.trim()) {
                try {
                    const queuedEntry = await enqueueRollRequestFromNarrative(context, activeCampaignId, rollRequestText.trim(), {
                        requestedBy: character?.name || character?.id || 'dm',
                        source: 'narrative'
                    });
                    if (queuedEntry) {
                        queuedRollEntries.push(queuedEntry);
                    }
                } catch (error) {
                    console.error('⚠️  Failed to enqueue roll request from narrative response:', error.message);
                }
            }
        }

        // For backward compatibility, keep the first entry payload
        const rollQueueEntryPayload = queuedRollEntries.length > 0
            ? {
                queueId: queuedRollEntries[0].queueId,
                status: queuedRollEntries[0].status,
                requestedAt: queuedRollEntries[0].requestedAt,
                participants: queuedRollEntries[0].participants.map(p => ({
                    participantId: p.participantId,
                    name: p.name,
                    entityType: p.entityType,
                    status: p.status
                })),
                // Include info about multiple entries
                totalEntries: queuedRollEntries.length
            }
            : null;

        // Handle both old and new two-phase response formats
        if (result.type === 'roll_request') {
            // Two-phase system: Phase 1 (setup + roll request)
            res.json({
                narrative: result.narrative,
                type: result.type,
                rollRequest: result.rollRequest,
                phase: result.phase,
                setupNarrative: result.setupNarrative,
                campaignState: context.campaignState,
                contextActive: true,
                rollQueueEntry: rollQueueEntryPayload
            });
        } else {
            // Traditional complete narrative
            const responseData = {
                narrative: result.narrative || result.message,
                campaignState: result.campaignState || context.campaignState,
                contextActive: true,
                contextStats: result.contextStats,
                combatDetected: result.combatDetected,
                enemies: result.enemies,
                handoffData: result.handoffData,  // Include full combat handoff with initiativeOrder
                rollRequest: result.rollRequest,  // Include roll request if found in narrative
                rollQueueEntry: rollQueueEntryPayload
            };
            console.log('📤 Sending response to client:', {
                hasCombatDetected: !!responseData.combatDetected,
                hasEnemies: !!responseData.enemies,
                enemiesCount: responseData.enemies?.length || 0,
                hasHandoffData: !!responseData.handoffData,
                initiativeOrderLength: responseData.handoffData?.initiativeOrder?.length,
                hasRollRequest: !!responseData.rollRequest,
                rollRequest: responseData.rollRequest
            });
            res.json(responseData);
        }
    } catch (error) {
        console.error('Action error:', error);
        res.status(500).json({ error: error.message });
    }
}

// Register action endpoint on multiple paths for compatibility
const actionRoutes = [
    '/api/dnd/action',
    '/dnd-api/dnd/action',
    '/dnd/api/dnd/action'
];
actionRoutes.forEach(route => app.post(route, handleActionRequest));

// Get current context and state
app.get('/api/dnd/context', async (req, res) => {
    const campaignId = req.query.campaign || 'default';
    const context = await getCampaignContext(campaignId);

    res.json({
        initialized: context.isLoaded,
        campaignState: context.campaignState,
        historyLength: context.indexedEvents.length,
        npcsTracked: Object.keys(context.completeMemory.npcInteractions).length,
        locationsTracked: Object.keys(context.completeMemory.locationMemories).length
    });
});

// Get campaign state
app.get('/api/dnd/state', async (req, res) => {
    const campaignId = req.query.campaign || 'default';
    const context = await getCampaignContext(campaignId);

    res.json(context.campaignState || {});
});

// Update campaign state
app.post('/api/dnd/state', async (req, res) => {
    const campaignId = req.body.campaignId || req.query.campaign || 'default';
    const context = await getCampaignContext(campaignId);

    try {
        await context.updateCampaignState(req.body);
        res.json({
            success: true,
            campaignState: context.campaignState
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update state' });
    }
});

// ==================== DICE ROLLING ====================

// Roll dice
app.post('/api/dnd/roll', (req, res) => {
    const { dice, reason } = req.body;
    
    try {
        const result = DiceRollManager.rollDice(dice);
        
        if (result.error) {
            return res.status(400).json(result);
        }
        
        // Log the roll in the campaign
        const rollEvent = `🎲 Rolled ${dice} for ${reason || 'unknown reason'}: ${result.total}`;
        console.log(rollEvent);
        
        res.json({
            ...result,
            reason: reason,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to roll dice' });
    }
});

// Phase 2: Process roll result and continue narrative
app.post('/api/dnd/roll-result', async (req, res) => {
    try {
        const { setup, rollRequest, rollResult, sessionId } = req.body;

        console.log('🎲 Phase 2: Processing roll result');
        console.log(`  Setup: ${setup?.substring(0, 50)}...`);
        console.log(`  Roll: ${rollRequest}`);
        console.log(`  Result: ${rollResult}`);

        // Generate Phase 2 outcome
        const outcome = await contextManager.processRollResult(setup, rollRequest, rollResult);

        // Combine setup + outcome for complete narrative
        const completeNarrative = `${setup}\n\n${outcome}`;

        // NOW save the complete story to conversation history
        await contextManager.updateMemory(rollRequest, completeNarrative, sessionId || 'main-campaign');

        res.json({
            success: true,
            narrative: outcome,
            completeNarrative: completeNarrative,
            campaignState: contextManager.campaignState
        });

    } catch (error) {
        console.error('❌ Phase 2 error:', error);
        res.status(500).json({ error: 'Failed to process roll result' });
    }
});

const rollQueueRoutes = [
    '/api/dnd/roll-queue',
    '/dnd-api/dnd/roll-queue',
    '/dnd/api/dnd/roll-queue'
];

rollQueueRoutes.forEach(route => {
    app.get(route, async (req, res) => {
        try {
            const campaignId = req.query.campaign || req.query.campaignId || 'test-silverpeak';
            const context = await getCampaignContext(campaignId);
            const combatState = await getSharedCombatStateWithQueue(context, campaignId);
            let rollQueue = ensureRollQueueArray(combatState);

            const statusFilter = req.query.status ? req.query.status.toLowerCase() : null;
            if (statusFilter) {
                rollQueue = rollQueue.filter(entry => entry.status === statusFilter);
            }

            if (req.query.includeResolved === 'false') {
                rollQueue = rollQueue.filter(entry =>
                    entry.status === ROLL_QUEUE_STATUS.PENDING || entry.status === ROLL_QUEUE_STATUS.PARTIAL
                );
            }

            res.json({
                success: true,
                rollQueue,
                combatStateUpdatedAt: combatState.lastUpdatedAt || combatState.updatedAt || null
            });
        } catch (error) {
            console.error('❌ Roll queue fetch error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post(route, async (req, res) => {
        try {
            const payload = req.body || {};
            const campaignId = payload.campaignId || payload.campaign || req.query.campaign || 'test-silverpeak';
            const context = await getCampaignContext(campaignId);
            const combatState = await getSharedCombatStateWithQueue(context, campaignId);

            let participants = Array.isArray(payload.participants) ? payload.participants.filter(Boolean) : [];
            if (!participants.length) {
                const derived = deriveParticipantsForRoll(
                    context,
                    combatState,
                    payload.reason || payload.rollRequest || payload.description || '',
                    payload.explicitParticipants
                );
                participants = derived.map(descriptor => ({
                    participantId: descriptor.participantId,
                    id: descriptor.id,
                    name: descriptor.name,
                    entityType: descriptor.entityType,
                    ability: descriptor.abilityKey || descriptor.ability || payload.ability || null,
                    dc: descriptor.dc ?? payload.dc ?? null,
                    advantage: descriptor.advantage || payload.advantage || 'normal',
                    aliases: descriptor.aliases
                }));
            }

            if (!participants.length) {
                return res.status(400).json({
                    success: false,
                    error: 'No participants supplied and unable to derive participants for roll queue entry'
                });
            }

            let combatAction = payload.combatAction;
            if (!combatAction && (payload.reason || payload.rollRequest)) {
                combatAction = deriveCombatActionMetadata(payload.reason || payload.rollRequest || '', {
                    source: payload.source || 'manual',
                    attacker: payload.requestedBy || null,
                    movement: payload.movement || null,
                    resourceUse: payload.resourceUse || null
                });
            }

            if (combatAction) {
                combatAction.reason = payload.reason || payload.rollRequest || combatAction.reason;
                combatAction = await enrichCombatActionMetadata(combatAction, context, combatState);
            }

            const entry = await enqueueRollQueueEntry(context, campaignId, combatState, {
                reason: payload.reason || payload.rollRequest || 'Dice roll requested',
                type: payload.type || 'manual',
                requestedBy: payload.requestedBy || 'manual',
                source: payload.source || 'manual',
                dc: payload.dc ?? null,
                ability: payload.ability || null,
                advantage: payload.advantage || 'normal',
                timeoutSeconds: payload.timeoutSeconds || null,
                combatAction,
                metadata: {
                    ...(payload.metadata || {}),
                    ...(combatAction ? { combatAction } : {})
                },
                participants
            });

            res.json({
                success: true,
                entry,
                rollQueue: ensureRollQueueArray(combatState)
            });
        } catch (error) {
            console.error('❌ Roll queue creation error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post(`${route}/:queueId/resolve`, async (req, res) => {
        try {
            const payload = req.body || {};
            const campaignId = payload.campaignId || payload.campaign || req.query.campaign || 'test-silverpeak';
            const context = await getCampaignContext(campaignId);
            const combatState = await getSharedCombatStateWithQueue(context, campaignId);

            const entry = await recordParticipantResult(context, campaignId, combatState, req.params.queueId, payload);

            res.json({
                success: true,
                entry,
                rollQueue: ensureRollQueueArray(combatState)
            });
        } catch (error) {
            const statusCode = /not found/i.test(error.message) ? 404 : 400;
            console.error('❌ Roll queue resolve error:', error);
            res.status(statusCode).json({ success: false, error: error.message });
        }
    });

    app.post(`${route}/:queueId/override`, async (req, res) => {
        try {
            const payload = req.body || {};
            const campaignId = payload.campaignId || payload.campaign || req.query.campaign || 'test-silverpeak';
            const context = await getCampaignContext(campaignId);
            const combatState = await getSharedCombatStateWithQueue(context, campaignId);

            const entry = await overrideRollQueueEntry(context, campaignId, combatState, req.params.queueId, payload);

            res.json({
                success: true,
                entry,
                rollQueue: ensureRollQueueArray(combatState)
            });
        } catch (error) {
            const statusCode = /not found/i.test(error.message) ? 404 : 400;
            console.error('❌ Roll queue override error:', error);
            res.status(statusCode).json({ success: false, error: error.message });
        }
    });

    app.delete(`${route}/:queueId`, async (req, res) => {
        try {
            const campaignId = req.body?.campaignId || req.body?.campaign || req.query.campaign || 'test-silverpeak';
            const context = await getCampaignContext(campaignId);
            const combatState = await getSharedCombatStateWithQueue(context, campaignId);

            const removed = await removeRollQueueEntry(context, campaignId, combatState, req.params.queueId);

            res.json({
                success: true,
                removed,
                rollQueue: ensureRollQueueArray(combatState)
            });
        } catch (error) {
            const statusCode = /not found/i.test(error.message) ? 404 : 400;
            console.error('❌ Roll queue delete error:', error);
            res.status(statusCode).json({ success: false, error: error.message });
        }
    });
});

// ==================== MEMORY & SEARCH ====================

// Search campaign memory
app.post('/api/dnd/search', async (req, res) => {
    const { query } = req.body;
    
    const keywords = contextManager.extractKeywords(query.toLowerCase());
    const results = contextManager.searchByKeywords(keywords);
    
    res.json({
        query,
        keywords,
        results: results.slice(0, 10).map(event => ({
            index: event.index,
            type: event.type,
            preview: event.content.substring(0, 200) + '...'
        }))
    });
});

// Debug: See what context would be retrieved
app.post('/api/dnd/debug-context', async (req, res) => {
    const { action } = req.body;
    
    const relevantContext = await contextManager.retrieveRelevantContext(action);
    
    res.json({
        action: action.substring(0, 100),
        contextRetrieved: {
            immediateCount: relevantContext.immediate.length,
            specificItems: relevantContext.specific.map(item => ({
                type: item.type,
                size: JSON.stringify(item).length
            })),
            historicalCount: (relevantContext.historical || []).length,
            worldState: relevantContext.worldState,
            needsDiceRoll: relevantContext.needsDiceRoll
        }
    });
});

// ==================== COMBAT SYSTEM ====================

async function handleCombatStateRequest(req, res) {
    try {
        const campaignId = req.query.campaign || 'test-silverpeak';
        const context = await getCampaignContext(campaignId);

        if (!context) {
            return res.status(503).json({ success: false, error: 'Context manager not initialized' });
        }

        // Prefer live combat manager state; fall back to context snapshot
        let managerState;
        try {
            managerState = await combatManager.loadCombatState(campaignId);
        } catch (error) {
            console.warn('⚠️ Combat state load failed:', error.message || error);
            managerState = combatManager.getCombatState(campaignId);
        }

        const baseState = managerState && managerState.active !== undefined
            ? managerState
            : (context.combatState || {});

        const combatState = updateSharedCombatState(context, baseState);

        if (!combatState.participants || (!combatState.participants.players && !combatState.participants.enemies)) {
            combatState.participants = {
                players: combatState.initiativeOrder.filter(c => c && c.isPlayer),
                enemies: combatState.initiativeOrder.filter(c => c && !c.isPlayer)
            };
        }

        res.json({
            success: true,
            combatState
        });
    } catch (error) {
        console.error('❌ Combat state error:', error);
        res.status(500).json({ success: false, error: 'Failed to get combat state' });
    }
}

const combatStateRoutes = [
    '/api/dnd/combat/state',
    '/api/dnd/combat-state',
    '/dnd-api/dnd/combat/state',
    '/dnd-api/dnd/combat-state',
    '/dnd/api/dnd/combat/state',
    '/dnd/api/dnd/combat-state'
];
combatStateRoutes.forEach(route => app.get(route, handleCombatStateRequest));

// Start combat (from narrative handoff)
const startCombatRoutes = [
    '/api/dnd/combat/start',
    '/dnd-api/dnd/combat/start',
    '/dnd/api/dnd/combat/start'
];
const combatNextTurnRoutes = [
    '/api/dnd/combat/next-turn',
    '/dnd-api/dnd/combat/next-turn',
    '/dnd/api/dnd/combat/next-turn'
];
const combatActionEconomyRoutes = [
    '/api/dnd/combat/action-economy',
    '/dnd-api/dnd/combat/action-economy',
    '/dnd/api/dnd/combat/action-economy'
];
const combatHpRoutes = [
    '/api/dnd/combat/hp',
    '/dnd-api/dnd/combat/hp',
    '/dnd/api/dnd/combat/hp'
];
const combatConditionRoutes = [
    '/api/dnd/combat/condition',
    '/dnd-api/dnd/combat/condition',
    '/dnd/api/dnd/combat/condition'
];
const combatEndRoutes = [
    '/api/dnd/combat/end',
    '/dnd-api/dnd/combat/end',
    '/dnd/api/dnd/combat/end'
];
const combatActionRoutes = [
    '/api/dnd/combat/action',
    '/dnd-api/dnd/combat/action',
    '/dnd/api/dnd/combat/action'
];

startCombatRoutes.forEach(route => app.post(route, async (req, res) => {
    try {
        const { campaignId, campaign, handoffData, initiativeOrder, enemies } = req.body;
        const activeCampaignId = campaignId || campaign || 'test-silverpeak';
        const context = await getCampaignContext(activeCampaignId);

        if (!context) {
            return res.status(503).json({ error: 'Context manager not initialized' });
        }

        if (handoffData && handoffData.context && handoffData.participants) {
            console.log(`⚔️ Starting combat via handoff for campaign: ${activeCampaignId}`);
            console.log(`  Reason: ${handoffData.context.reason}`);
            console.log(`  Players: ${handoffData.participants.players.length}`);
            console.log(`  Enemies: ${handoffData.participants.enemies.length}`);

            try {
                const combatState = await combatManager.startCombat(activeCampaignId, handoffData);
                const sharedState = updateSharedCombatState(context, {
                    ...combatState,
                    participants: handoffData.participants,
                    context: handoffData.context
                });

                return res.json({
                    success: true,
                    combatState: sharedState,
                    systemPrompt: combatManager.getCombatSystemPrompt(sharedState)
                });
            } catch (error) {
                console.error('❌ Combat start via handoff failed, falling back to manual initialization:', error);

                const cloneCombatant = (entry = {}, forcePlayer) => ({
                    ...entry,
                    isPlayer: typeof forcePlayer === 'boolean' ? forcePlayer : entry.isPlayer === true
                });

                const fallbackPlayers = (handoffData.participants.players || []).map(entry => cloneCombatant(entry, true));
                const fallbackEnemies = (handoffData.participants.enemies || []).map(entry => cloneCombatant(entry, false));
                const baseOrder = Array.isArray(handoffData.initiativeOrder) && handoffData.initiativeOrder.length
                    ? handoffData.initiativeOrder.map(entry => ({ ...entry }))
                    : [...fallbackPlayers.map(entry => ({ ...entry })), ...fallbackEnemies.map(entry => ({ ...entry }))];

                const fallbackState = {
                    active: true,
                    round: 1,
                    currentTurn: 0,
                    initiativeOrder: baseOrder,
                    participants: {
                        players: fallbackPlayers,
                        enemies: fallbackEnemies
                    },
                    actionEconomy: {},
                    conditions: {},
                    context: handoffData.context || {},
                    conversationHistory: []
                };

                try {
                    combatManager.prepareCombatState(fallbackState);
                    await combatManager.setCombatState(activeCampaignId, fallbackState, false);
                } catch (fallbackError) {
                    console.error('⚠️ Failed to persist fallback combat state:', fallbackError);
                }

                const sharedState = updateSharedCombatState(context, fallbackState);
                return res.json({
                    success: true,
                    combatState: sharedState,
                    systemPrompt: combatManager.getCombatSystemPrompt(sharedState),
                    fallback: true
                });
            }
        }

        const safeOrder = Array.isArray(initiativeOrder) ? initiativeOrder : [];
        console.log(`🔍 DEBUG: Received initiativeOrder with ${safeOrder.length} entries`);
        safeOrder.forEach(e => console.log(`  - ${e.name}: init=${e.initiative}, isPlayer=${e.isPlayer}`));
        const normalizedOrder = safeOrder.map(entry => {
            const safeHp = entry.hp && typeof entry.hp === 'object'
                ? {
                    current: Number.isFinite(Number(entry.hp.current)) ? Number(entry.hp.current) : null,
                    max: Number.isFinite(Number(entry.hp.max)) ? Number(entry.hp.max) : null
                }
                : { current: null, max: null };

            return {
                ...entry,
                hp: safeHp,
                isPlayer: !!entry.isPlayer,
                actionEconomy: entry.actionEconomy || null,
                conditions: Array.isArray(entry.conditions) ? entry.conditions : []
            };
        });

        const defaultEconomy = {
            action: true,
            bonusAction: true,
            movement: 30,
            reaction: true
        };

        const actionEconomy = {};
        const conditions = {};
        normalizedOrder.forEach(combatant => {
            actionEconomy[combatant.name] = {
                ...defaultEconomy,
                ...(combatant.actionEconomy || {})
            };
            conditions[combatant.name] = Array.isArray(combatant.conditions) ? combatant.conditions : [];
        });

        const participantSummary = {
            players: normalizedOrder.filter(c => c.isPlayer),
            enemies: normalizedOrder.filter(c => !c.isPlayer)
        };

        const manualState = {
            active: true,
            round: 1,
            currentTurn: 0,
            initiativeOrder: normalizedOrder,
            participants: participantSummary,
            actionEconomy,
            conditions,
            context: {
                reason: 'Combat initiated manually',
                source: 'initiativeOrder'
            },
            conversationHistory: []
        };

        await combatManager.setCombatState(activeCampaignId, manualState, true);

        const combatState = updateSharedCombatState(context, manualState);

        console.log(`⚔️ Combat mode activated for ${activeCampaignId} (initiative payload)`);
        console.log(`   Initiative order contains ${normalizedOrder.length} entries`);

        if (context.db && activeCampaignId === 'test-silverpeak') {
            await context.db.recordEvent(
                'combat',
                `Combat began! Initiative: ${normalizedOrder.map(c => `${c.name} (${c.initiative ?? '??'})`).join(', ')}`,
                { initiativeOrder: normalizedOrder, round: combatState.round }
            );
        }

        return res.json({
            success: true,
            combatState
        });
    } catch (error) {
        console.error('❌ Combat start error:', error);
        res.status(500).json({ error: error.message });
    }
}));

// Advance to next turn
combatNextTurnRoutes.forEach(route => app.post(route, async (req, res) => {
    try {
        const { campaignId, campaign } = req.body;
        const activeCampaignId = campaignId || campaign || 'test-silverpeak';
        const context = await getCampaignContext(activeCampaignId);

        if (!context) {
            return res.status(503).json({ success: false, error: 'Context manager not initialized' });
        }

        const combatState = await combatManager.nextTurn(activeCampaignId);
        const sharedState = updateSharedCombatState(context, combatState);

        console.log(`⚔️ Combat turn advanced - Round ${sharedState.round}, Turn ${sharedState.currentTurn + 1}/${sharedState.initiativeOrder.length}`);

        res.json({
            success: true,
            combatState: sharedState,
            systemPrompt: combatManager.getCombatSystemPrompt(sharedState)
        });
    } catch (error) {
        console.error('❌ Next turn error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}));

// Update action economy
combatActionEconomyRoutes.forEach(route => app.post(route, async (req, res) => {
    try {
        const { campaignId, campaign, combatantName, updates } = req.body;
        const activeCampaignId = campaignId || campaign || 'test-silverpeak';
        const context = await getCampaignContext(activeCampaignId);

        if (!context) {
            return res.status(503).json({ success: false, error: 'Context manager not initialized' });
        }

        const combatState = await combatManager.updateActionEconomy(activeCampaignId, combatantName, updates);
        const sharedState = updateSharedCombatState(context, combatState);

        res.json({
            success: true,
            combatState: sharedState
        });
    } catch (error) {
        console.error('❌ Action economy update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}));

// Update HP
combatHpRoutes.forEach(route => app.post(route, async (req, res) => {
    try {
        const { campaignId, campaign, combatantName, damage, isHealing } = req.body;
        const activeCampaignId = campaignId || campaign || 'test-silverpeak';
        const context = await getCampaignContext(activeCampaignId);

        if (!context) {
            return res.status(503).json({ success: false, error: 'Context manager not initialized' });
        }

        const combatState = await combatManager.updateHP(activeCampaignId, combatantName, damage, isHealing);
        const sharedState = updateSharedCombatState(context, combatState);

        console.log(`⚔️ HP updated - ${combatantName}: ${isHealing ? '+' : '-'}${damage}`);

        res.json({
            success: true,
            combatState: sharedState
        });
    } catch (error) {
        console.error('❌ HP update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}));

// Update condition
combatConditionRoutes.forEach(route => app.post(route, async (req, res) => {
    try {
        const { campaignId, campaign, combatantName, condition, add } = req.body;
        const activeCampaignId = campaignId || campaign || 'test-silverpeak';
        const context = await getCampaignContext(activeCampaignId);

        if (!context) {
            return res.status(503).json({ success: false, error: 'Context manager not initialized' });
        }

        const combatState = await combatManager.updateCondition(activeCampaignId, combatantName, condition, add);
        const sharedState = updateSharedCombatState(context, combatState);

        console.log(`⚔️ Condition ${add ? 'added' : 'removed'} - ${combatantName}: ${condition}`);

        res.json({
            success: true,
            combatState: sharedState
        });
    } catch (error) {
        console.error('❌ Condition update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}));

// End combat (return to narrative)
combatEndRoutes.forEach(route => app.post(route, async (req, res) => {
    try {
        const { campaignId, campaign } = req.body;
        const activeCampaignId = campaignId || campaign || 'test-silverpeak';
        const context = await getCampaignContext(activeCampaignId);

        if (!context) {
            return res.status(503).json({ success: false, error: 'Context manager not initialized' });
        }

        const summary = await combatManager.endCombat(activeCampaignId);
        const finalState = combatManager.getCombatState(activeCampaignId);
        const sharedState = updateSharedCombatState(context, finalState);

        console.log(`⚔️ Combat ended - ${summary.rounds} rounds`);
        console.log(`  Player casualties: ${summary.casualties.players.length}`);
        console.log(`  Enemy casualties: ${summary.casualties.enemies.length}`);

        if (context.db && activeCampaignId === 'test-silverpeak') {
            await context.db.recordEvent(
                'combat',
                `Combat ended after ${summary.rounds} rounds`,
                summary
            );
        }

        if (context.completeMemory) {
            context.completeMemory.combatLog = context.completeMemory.combatLog || [];
            context.completeMemory.combatLog.push({
                timestamp: new Date().toISOString(),
                ...summary
            });
        }

        res.json({
            success: true,
            summary,
            combatState: sharedState
        });
    } catch (error) {
        console.error('❌ Combat end error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}));

// Process combat action with separate Claude conversation
combatActionRoutes.forEach(route => app.post(route, async (req, res) => {
    try {
        const { campaignId, campaign, action, sessionId } = req.body;
        const activeCampaignId = campaignId || campaign || 'test-silverpeak';
        const context = await getCampaignContext(activeCampaignId);

        if (!context) {
            return res.status(503).json({ success: false, error: 'Context manager not initialized' });
        }

        // Get current combat state
        let combatState = combatManager.getCombatState(activeCampaignId);

        if (!combatState.active) {
            return res.status(400).json({ success: false, error: 'No active combat' });
        }

        // Build system prompt with current state
        const systemPrompt = combatManager.getCombatSystemPrompt(combatState);

        // Get combat conversation history (stored in combat state)
        const conversationHistory = combatState.conversationHistory || [];

        // Call AI provider with combat system prompt
        const provider = context.aiProvider || contextManager.aiProvider;
        if (!provider || typeof provider.generateResponse !== 'function') {
            throw new Error('AI provider unavailable for combat action');
        }

        const combatMessages = [
            ...(Array.isArray(conversationHistory) ? conversationHistory : []),
            { role: 'user', content: action }
        ];

        const response = await provider.generateResponse(systemPrompt, combatMessages);

        // Check if combat should end
        if (response.includes('COMBAT_ENDED')) {
            const narrative = response.replace('COMBAT_ENDED', '').trim();
            const summary = await combatManager.endCombat(activeCampaignId);
            const finalState = combatManager.getCombatState(activeCampaignId);
            const sharedState = updateSharedCombatState(context, finalState);

            return res.json({
                success: true,
                narrative,
                combatEnded: true,
                summary,
                combatState: sharedState
            });
        }

        let sharedState;

        // Check if turn should advance
        if (response.toLowerCase().includes('turn complete')) {
            combatState = await combatManager.nextTurn(activeCampaignId);
        }

        // Update conversation history (with validation)
        if (action && action.trim()) {
            conversationHistory.push({ role: 'user', content: action });
        } else {
            console.warn('⚠️  Rejected empty user action from combat history');
        }
        if (response && response.trim()) {
            conversationHistory.push({ role: 'assistant', content: response });
        } else {
            console.warn('⚠️  Rejected empty assistant response from combat history');
        }
        combatState.conversationHistory = conversationHistory;
        await combatManager.saveCombatState(activeCampaignId, combatState);

        sharedState = updateSharedCombatState(context, combatState);

        res.json({
            success: true,
            narrative: response,
            combatState: sharedState,
            combatEnded: false
        });

    } catch (error) {
        console.error('❌ Combat action error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}));

// ==================== SESSION MANAGEMENT ====================

// Clear history (mark new session, don't actually delete)
app.post('/api/dnd/clear-history', async (req, res) => {
    // Just mark a new session boundary
    contextManager.indexedEvents.push({
        index: contextManager.indexedEvents.length,
        type: 'SESSION_BOUNDARY',
        content: '=== NEW SESSION STARTED ===',
        timestamp: new Date().toISOString(),
        metadata: {}
    });
    
    res.json({ 
        success: true, 
        message: 'New session marked (history preserved)'
    });
});

// ==================== BACKUP & RECOVERY ====================

// Create backup
app.post('/api/dnd/backup', async (req, res) => {
    const { reason = 'manual' } = req.body;
    
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `./backups/backup-${reason}-${timestamp}`;
        
        await fs.mkdir('./backups', { recursive: true });
        await fs.mkdir(backupPath, { recursive: true });
        
        // Backup all critical files
        const filesToBackup = [
            'campaign-state.json',
            'conversation-history.json',
            'SEARCH_INDEX.json',
            'FULL_CAMPAIGN_MEMORY.json'
        ];
        
        for (const file of filesToBackup) {
            try {
                const data = await fs.readFile(`./${file}`, 'utf8');
                await fs.writeFile(`${backupPath}/${file}`, data);
            } catch (err) {
                // File might not exist yet
            }
        }
        
        console.log(`📦 Backup created: ${backupPath}`);
        res.json({ success: true, path: backupPath });
        
    } catch (error) {
        res.status(500).json({ error: 'Backup failed' });
    }
});

// ==================== STATISTICS & MONITORING ====================

// Get system statistics
app.get('/api/dnd/stats', (req, res) => {
    res.json({
        memory: {
            totalBytes: contextManager.totalMemorySize,
            totalMB: (contextManager.totalMemorySize / 1024 / 1024).toFixed(2)
        },
        events: {
            total: contextManager.indexedEvents.length,
            player: contextManager.indexedEvents.filter(e => e.type === 'PLAYER_ACTION').length,
            dm: contextManager.indexedEvents.filter(e => e.type === 'DM_RESPONSE').length,
            exchanges: contextManager.indexedEvents.filter(e => e.type === 'EXCHANGE').length
        },
        indices: {
            npcs: Object.keys(contextManager.completeMemory.npcInteractions).length,
            locations: Object.keys(contextManager.completeMemory.locationMemories).length,
            keywords: Object.keys(contextManager.searchIndices.keywords).length,
            combat: contextManager.completeMemory.combatLog.length
        },
        characters: Object.keys(contextManager.campaignState?.party || {}).length,
        isLoaded: contextManager.isLoaded
    });
});

// Rollback Management Endpoint
// AI Provider endpoints
app.get('/api/dnd/ai-provider', async (req, res) => {
    const campaignId = req.query.campaign || 'default';
    const context = await getCampaignContext(campaignId);

    const currentProvider = context.aiProvider.getCurrentProvider();
    const capabilities = {
        claude: { available: true },
        deepseek: { available: !!process.env.DEEPSEEK_API_KEY },
        gpt4: { available: !!process.env.OPENAI_API_KEY }
    };

    res.json({
        current: currentProvider,
        capabilities: capabilities
    });
});

app.post('/api/dnd/ai-provider', async (req, res) => {
    const { provider, campaign } = req.body;
    const campaignId = campaign || 'default';
    const context = await getCampaignContext(campaignId);

    if (context.aiProvider.setProvider(provider)) {
        res.json({
            success: true,
            provider: context.aiProvider.getCurrentProvider()
        });
    } else {
        res.status(400).json({
            success: false,
            error: 'Invalid provider',
            availableProviders: context.aiProvider.getAvailableProviders()
        });
    }
});

app.post('/api/dnd/rollback', async (req, res) => {
    try {
        const { index, campaign } = req.body;
        const campaignId = campaign || 'default';

        if (typeof index !== 'number' || index < 0) {
            return res.status(400).json({ error: 'Valid index required' });
        }

        // Get the appropriate campaign context
        const context = await getCampaignContext(campaignId);

        // Load current conversation history from file
        let currentHistory = [];
        try {
            const data = await fs.readFile(context.paths.conversationHistory, 'utf8');
            currentHistory = JSON.parse(data);
        } catch (err) {
            return res.status(500).json({ error: 'Could not load conversation history' });
        }

        if (index >= currentHistory.length) {
            return res.status(400).json({ error: 'Index out of range' });
        }

        // Trim history to rollback point
        const rolledBackHistory = currentHistory.slice(0, index + 1);

        // ROLLBACK STATE CHANGES: Reverse all state changes after rollback point
        const removedEntries = currentHistory.slice(index + 1);
        await context.rollbackStateChanges(removedEntries);

        // Save rolled back history to file
        await fs.writeFile(
            context.paths.conversationHistory,
            JSON.stringify(rolledBackHistory, null, 2)
        );

        // ROLLBACK FIX: Regenerate emergency export from rolled-back conversation
        const exportContent = context.generateEmergencyExportFromConversation(rolledBackHistory);
        await fs.writeFile(context.paths.emergencyExport, exportContent);

        // Clear existing memory before reload (prevents duplication)
        context.indexedEvents = [];
        context.completeMemory = {
            fullCampaignText: '',
            npcInteractions: {},
            locationMemories: {},
            itemInventory: [],
            questLog: [],
            combatLog: [],
            characterDevelopment: []
        };

        // Reload ONLY from emergency export (conversation history already included in export)
        const campaignExport = await fs.readFile(context.paths.emergencyExport, 'utf8');
        context.completeMemory.fullCampaignText = campaignExport;
        context.totalMemorySize = campaignExport.length;
        context.parseIntoEvents(campaignExport);

        // Rebuild indices from reloaded data
        await context.buildSearchIndices();
        await context.createRelevanceMap();

        console.log(`🔄 Rolled back conversation from ${currentHistory.length} to ${rolledBackHistory.length} entries`);
        console.log(`📚 Regenerated emergency export and reloaded server memory`);
        console.log(`🔄 Rolled back ${removedEntries.filter(e => e.stateChanges).length} state changes`);

        res.json({
            success: true,
            originalLength: currentHistory.length,
            newLength: rolledBackHistory.length,
            message: `Rolled back to entry ${index}`,
            exportRegenerated: true,
            stateChangesRolledBack: removedEntries.filter(e => e.stateChanges).length
        });

    } catch (error) {
        console.error('Error during rollback:', error);
        res.status(500).json({ error: 'Failed to rollback' });
    }
});

// ==================== CAMPAIGN MANAGEMENT ====================

// Get list of all campaigns
app.get('/api/dnd/campaigns', async (req, res) => {
    try {
        const campaignsIndexPath = path.join(__dirname, 'campaigns', 'campaigns-index.json');
        const data = await fs.readFile(campaignsIndexPath, 'utf8');
        const index = JSON.parse(data);

        // Don't send password hashes to client
        const safeCampaigns = index.campaigns.map(c => ({
            id: c.id,
            name: c.name,
            created: c.created,
            lastPlayed: c.lastPlayed,
            characters: c.characters,
            description: c.description,
            thumbnail: c.thumbnail,
            hasPassword: !!c.passwordHash
        }));

        res.json({ campaigns: safeCampaigns });
    } catch (error) {
        console.error('Error loading campaigns:', error);
        res.status(500).json({ error: 'Failed to load campaigns' });
    }
});

// Authenticate campaign access
app.post('/api/dnd/campaigns/:id/auth', async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;

    try {
        const bcrypt = require('bcrypt');
        const campaignsIndexPath = path.join(__dirname, 'campaigns', 'campaigns-index.json');
        const data = await fs.readFile(campaignsIndexPath, 'utf8');
        const index = JSON.parse(data);

        const campaign = index.campaigns.find(c => c.id === id);

        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        // Validate password with bcrypt
        let isValid = false;
        if (!campaign.passwordHash) {
            // No password set, allow access
            isValid = true;
        } else {
            // Compare with bcrypt hash
            isValid = await bcrypt.compare(password, campaign.passwordHash);
        }

        if (isValid) {
            // Generate simple auth token (in production, use JWT)
            const token = Buffer.from(`${id}:${Date.now()}`).toString('base64');

            res.json({ success: true, token });
        } else {
            res.json({ success: false, error: 'Invalid password' });
        }
    } catch (error) {
        console.error('Error authenticating campaign:', error);
        res.status(500).json({ success: false, error: 'Authentication failed' });
    }
});

// ==================== SCENE GENERATION ====================

app.post('/api/dnd/generate-scene', async (req, res) => {
    try {
        const campaignId = req.body.campaign || 'default';
        console.log(`🎨 Scene generation requested for campaign: ${campaignId}`);

        // Get campaign-specific context
        const context = await getCampaignContext(campaignId);

        // Read fresh conversation history directly from file (use campaign-specific path)
        let conversationHistory = [];
        const historyPath = path.join(__dirname, context.paths.conversationHistory);
        try {
            const data = await fs.readFile(historyPath, 'utf8');
            conversationHistory = JSON.parse(data);
            console.log(`✅ Loaded conversation history from: ${historyPath}`);
        } catch (err) {
            console.error('❌ Failed to load conversation history from', historyPath, ':', err);
        }

        // Filter out empty entries first, then get last 6 with actual content
        const entriesWithContent = conversationHistory.filter(e => e.content && e.content.trim());
        const recentEntries = entriesWithContent.slice(-6);

        console.log(`📊 Found ${recentEntries.length} recent entries with content from file`);
        console.log(`📊 Total conversation history: ${conversationHistory.length} entries (${entriesWithContent.length} with content)`);

        // Debug: Check entry structure
        if (recentEntries.length > 0) {
            console.log(`📋 Sample entry structure:`, JSON.stringify(recentEntries[0], null, 2).substring(0, 300));
            console.log(`📋 Roles in recent:`, recentEntries.map(e => e.role).join(', '));
        }

        // Build scene context from recent entries (DM messages only for better scene extraction)
        // Fresh data uses role field: 'assistant' for DM messages
        const sceneContext = recentEntries
            .filter(entry => entry.role === 'assistant') // DM messages
            .map(entry => entry.content || '') // Get content
            .filter(content => content && content.trim()) // Remove empty (safety check)
            .join('\n\n')
            .substring(0, 2000); // Limit context length

        console.log(`📖 Extracting scene from ${recentEntries.length} recent entries`);
        console.log(`📝 Scene context length: ${sceneContext.length} chars`);
        console.log(`📝 Scene context preview: ${sceneContext.substring(0, 300)}...`);

        if (recentEntries.length === 0 || sceneContext.length === 0) {
            return res.json({
                success: false,
                error: 'No recent adventure to visualize',
                details: 'The campaign log appears to be empty or recent messages have no content. Play some of the campaign first to generate scene images from your adventures!',
                sceneDescription: ''
            });
        }

        // Step 1: Detect campaign structure to determine genre
        const isFantasyStructure = context.campaignState.characters !== undefined;

        // Step 2: Extract visual scene description using genre-appropriate prompt
        let extractionPrompt;

        if (isFantasyStructure) {
            // Fantasy extraction prompt
            extractionPrompt = `You are a scene description extractor for a high fantasy D&D campaign. Read the following recent adventure events and create a single, vivid visual description for image generation.

Recent Adventure:
${sceneContext}

Extract the CURRENT scene location/environment ONLY. This is a HIGH FANTASY setting with medieval/renaissance aesthetics. Focus on:
- Physical environment: taverns, forests, dungeons, castles, villages, caves, mountains
- Fantasy elements: torchlight, magical glows, ancient stonework, wooden beams, natural environments
- Lighting and atmosphere: firelight, moonlight, shadows, mist, magical illumination
- Spatial details: weathered wood, mossy stones, iron fixtures, natural textures

IMPORTANT: DO NOT include any people, characters, or living beings. Focus ONLY on the empty fantasy environment where the action takes place.

Write a single paragraph (300-400 characters) describing the scene visually, as if instructing an artist. Use present tense, be concrete and specific. DO NOT include character dialogue or abstract concepts.

Example good output: "A dimly lit medieval tavern interior with worn wooden tables and benches. A stone fireplace casts flickering orange light across rough-hewn beams. Iron lanterns hang from the ceiling, their warm glow reflecting off pewter mugs. Shadows dance on the stone walls."

Extract scene description:`;
        } else {
            // Sci-fi extraction prompt
            extractionPrompt = `You are a scene description extractor for a sci-fi space opera D&D campaign. Read the following recent adventure events and create a single, vivid visual description for image generation.

Recent Adventure:
${sceneContext}

Extract the CURRENT scene location/environment ONLY. This is a SPACE OPERA setting on starships and space stations (think The Expanse, spacepunk aesthetic). Focus on:
- Physical environment: ship corridors, station modules, airlocks, cargo bays, bridge areas
- Sci-fi technology: holographic displays, conduits, maintenance panels, zero-g equipment
- Lighting and atmosphere: emergency lighting, holographic interfaces, running lights, atmospheric processors
- Spatial details: worn metal bulkheads, reinforced viewports, engineering details

IMPORTANT: DO NOT include any people, characters, or living beings. Focus ONLY on the empty sci-fi environment where the action takes place.

Write a single paragraph (300-400 characters) describing the scene visually, as if instructing an artist. Use present tense, be concrete and specific. DO NOT include character dialogue or abstract concepts.

Example good output: "A cramped space station maintenance junction with flickering holographic status displays. Exposed conduits run along worn metal bulkheads, emergency red lighting casting sharp shadows. A wall-mounted diagnostic terminal shows scrolling data while tools float in low gravity near an open maintenance hatch."

Extract scene description:`;
        }

        const messages = [{ role: 'user', content: extractionPrompt }];
        const sceneDescription = await context.aiProvider.generateResponse(
            'You are a scene description extractor. Return only the scene description, nothing else.',
            messages
        );

        // Clean up the response (remove any AI provider stamps)
        const cleanDescription = sceneDescription
            .replace(/\*\*DM \([^)]+\)\*\*/g, '')
            .trim()
            .substring(0, 400); // Limit to 400 chars for Stable Diffusion

        console.log(`🎨 Scene description extracted: "${cleanDescription.substring(0, 100)}..."`);

        // Step 3: Send to Stability AI API
        const STABILITY_API_KEY = 'ASK_CHRIS_FOR_NEW_STABILITY_KEY';

        // Enhance prompt with genre-appropriate style keywords
        let enhancedPrompt;
        if (isFantasyStructure) {
            enhancedPrompt = `${cleanDescription}, high fantasy D&D, medieval fantasy tavern, dungeon atmosphere, fantasy landscape, no people, empty environment, detailed digital painting, dramatic lighting, cinematic composition, fantasy art style`;
        } else {
            enhancedPrompt = `${cleanDescription}, space station interior, spaceship corridor, sci-fi spacepunk, The Expanse aesthetic, no people, empty environment, detailed digital painting, dramatic lighting, cinematic composition`;
        }

        console.log('🖼️ Sending to Stability AI...');
        console.log('🎨 Prompt:', enhancedPrompt);

        // Use form-data for multipart request
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('prompt', enhancedPrompt);
        formData.append('output_format', 'png');
        formData.append('aspect_ratio', '16:9'); // Widescreen format for scene visualizer

        const sdResponse = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
            method: 'POST',
            headers: {
                'authorization': STABILITY_API_KEY,
                'accept': 'image/*',
                ...formData.getHeaders()
            },
            body: formData
        });

        console.log('📡 Stability AI response status:', sdResponse.status);

        if (!sdResponse.ok) {
            const errorText = await sdResponse.text();
            console.error('❌ Stability AI error:', errorText);

            return res.json({
                success: false,
                error: 'Scene generation service unavailable',
                details: `The image generation API returned an error (${sdResponse.status}). ${errorText}`,
                sceneDescription: cleanDescription
            });
        }

        // Save image to campaign-specific directory
        const imageBuffer = Buffer.from(await sdResponse.arrayBuffer());
        const campaignScenesDir = path.join(__dirname, 'campaigns', campaignId, 'generated-scenes');

        // Ensure directory exists
        await fs.mkdir(campaignScenesDir, { recursive: true });

        // Save timestamped version for history
        const timestampedFilename = `scene-${Date.now()}.png`;
        const timestampedPath = path.join(campaignScenesDir, timestampedFilename);
        await fs.writeFile(timestampedPath, imageBuffer);

        // Save as latest.png (overwrites previous)
        const latestPath = path.join(campaignScenesDir, 'latest.png');
        await fs.writeFile(latestPath, imageBuffer);

        console.log('✅ Scene image generated successfully');
        console.log(`📁 Saved to: ${campaignScenesDir}/latest.png`);

        // Return URL to latest.png (account for /dnd/ prefix in proxy setup)
        const imageUrl = `/dnd/campaigns/${campaignId}/generated-scenes/latest.png?t=${Date.now()}`;

        res.json({
            success: true,
            imageUrl: imageUrl,
            sceneDescription: cleanDescription,
            prompt: enhancedPrompt
        });

    } catch (error) {
        console.error('❌ Scene generation error:', error);
        res.status(500).json({
            error: 'Failed to generate scene image',
            details: error.message
        });
    }
});


// ==================== EQUIPMENT MANAGEMENT API (Silverpeak only) ====================

// Get all equipment for a character
app.get('/api/dnd/equipment/:character', async (req, res) => {
    try {
        const { character } = req.params;
        const { campaign } = req.query;

        if (campaign !== 'test-silverpeak') {
            return res.status(400).json({
                error: 'Equipment API only available for Silverpeak campaign'
            });
        }

        if (!contextManager.db) {
            return res.status(503).json({
                error: 'Database not initialized for this campaign'
            });
        }

        const char = await contextManager.db.getCharacter(character);
        if (!char) {
            return res.status(404).json({ error: 'Character not found' });
        }

        const equipment = await contextManager.db.getEquipment(char.id);
        const inventory = await contextManager.db.getInventory(char.id);
        const spells = await contextManager.db.getSpells(char.id);

        res.json({
            success: true,
            character: character,
            equipment: equipment,
            inventory: inventory,
            spells: spells
        });
    } catch (error) {
        console.error('Equipment API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add equipment to a character
app.post('/api/dnd/equipment/add', async (req, res) => {
    try {
        const { campaign, character, itemName, itemType, properties } = req.body;

        if (campaign !== 'test-silverpeak') {
            return res.status(400).json({
                error: 'Equipment API only available for Silverpeak campaign'
            });
        }

        if (!contextManager.db) {
            return res.status(503).json({
                error: 'Database not initialized for this campaign'
            });
        }

        const char = await contextManager.db.getCharacter(character);
        if (!char) {
            return res.status(404).json({ error: 'Character not found' });
        }

        const result = await contextManager.db.addEquipment(
            char.id,
            itemName,
            itemType || 'gear',
            properties || {},
            true,
            'player'
        );

        // Also update JSON state for backwards compatibility
        // Extract first name (e.g., "Thorne Ironheart" -> "thorne")
        const firstName = character.split(' ')[0].toLowerCase();
        if (contextManager.campaignState.characters[firstName]) {
            if (!contextManager.campaignState.characters[firstName].equipment) {
                contextManager.campaignState.characters[firstName].equipment = [];
            }
            contextManager.campaignState.characters[firstName].equipment.push(itemName);
            await contextManager.updateCampaignState(contextManager.campaignState);
        }

        res.json({
            success: true,
            message: `Added ${itemName} to ${character}`,
            equipmentId: result.lastID
        });
    } catch (error) {
        console.error('Add equipment error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove equipment from a character
app.delete('/api/dnd/equipment/:equipmentId', async (req, res) => {
    try {
        const { equipmentId } = req.params;
        const { campaign } = req.query;

        if (campaign !== 'test-silverpeak') {
            return res.status(400).json({
                error: 'Equipment API only available for Silverpeak campaign'
            });
        }

        if (!contextManager.db) {
            return res.status(503).json({
                error: 'Database not initialized for this campaign'
            });
        }

        // Get the equipment item before deleting (to sync JSON state)
        const allEquipment = await contextManager.db.all(
            `SELECT e.*, c.name as character_name FROM equipment e
             JOIN characters c ON e.character_id = c.id WHERE e.id = ?`,
            [equipmentId]
        );

        const equipment = allEquipment[0];

        await contextManager.db.removeEquipment(equipmentId);

        // Also update JSON state for backwards compatibility (so DM sees the change)
        if (equipment) {
            const firstName = equipment.character_name.split(' ')[0].toLowerCase();
            if (contextManager.campaignState.characters[firstName]) {
                const equipList = contextManager.campaignState.characters[firstName].equipment || [];
                const index = equipList.indexOf(equipment.item_name);
                if (index > -1) {
                    equipList.splice(index, 1);
                    contextManager.campaignState.characters[firstName].equipment = equipList;
                    await contextManager.updateCampaignState(contextManager.campaignState);
                    console.log(`🗑️  Removed ${equipment.item_name} from ${equipment.character_name} (synced to JSON)`);
                }
            }
        }

        res.json({
            success: true,
            message: 'Equipment removed'
        });
    } catch (error) {
        console.error('Remove equipment error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update character HP
app.post('/api/dnd/character/hp', async (req, res) => {
    try {
        const { campaign, character, hpCurrent, hpMax } = req.body;

        if (campaign !== 'test-silverpeak') {
            return res.status(400).json({ error: 'Only available for Silverpeak' });
        }

        if (!contextManager.db) {
            return res.status(503).json({ error: 'Database not initialized' });
        }

        const char = await contextManager.db.getCharacter(character);
        if (!char) {
            return res.status(404).json({ error: 'Character not found' });
        }

        await contextManager.db.updateCharacterHP(char.id, hpCurrent, hpMax);

        // Log event
        const change = hpCurrent - char.hp_current;
        const eventType = change < 0 ? 'damage' : 'healing';
        await contextManager.db.recordEvent(
            eventType,
            `${character} ${change < 0 ? 'took' : 'healed'} ${Math.abs(change)} HP`,
            { character: character, hp_change: change }
        );

        // Sync JSON state
        const firstName = character.split(' ')[0].toLowerCase();
        if (contextManager.campaignState.characters[firstName]) {
            contextManager.campaignState.characters[firstName].hp = {
                current: hpCurrent,
                max: hpMax || char.hp_max
            };
            await contextManager.updateCampaignState(contextManager.campaignState);
        }

        res.json({ success: true, hpCurrent, hpMax });
    } catch (error) {
        console.error('Update HP error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update character credits
app.post('/api/dnd/character/credits', async (req, res) => {
    try {
        const { campaign, character, credits, reason } = req.body;

        if (campaign !== 'test-silverpeak') {
            return res.status(400).json({ error: 'Only available for Silverpeak' });
        }

        if (!contextManager.db) {
            return res.status(503).json({ error: 'Database not initialized' });
        }

        const char = await contextManager.db.getCharacter(character);
        if (!char) {
            return res.status(404).json({ error: 'Character not found' });
        }

        await contextManager.db.updateCharacterCredits(char.id, credits);

        // Log event
        const change = credits - char.credits;
        await contextManager.db.recordEvent(
            'transaction',
            `${character} ${change < 0 ? 'spent' : 'gained'} ${Math.abs(change)} GP${reason ? `: ${reason}` : ''}`,
            { character: character, credit_change: change, reason: reason }
        );

        // Sync JSON state
        const firstName = character.split(' ')[0].toLowerCase();
        if (contextManager.campaignState.characters[firstName]) {
            contextManager.campaignState.characters[firstName].credits = credits;
            await contextManager.updateCampaignState(contextManager.campaignState);
        }

        res.json({ success: true, credits });
    } catch (error) {
        console.error('Update credits error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add condition to character
app.post('/api/dnd/character/condition/add', async (req, res) => {
    try {
        const { campaign, character, condition, duration } = req.body;

        if (campaign !== 'test-silverpeak') {
            return res.status(400).json({ error: 'Only available for Silverpeak' });
        }

        if (!contextManager.db) {
            return res.status(503).json({ error: 'Database not initialized' });
        }

        const char = await contextManager.db.getCharacter(character);
        if (!char) {
            return res.status(404).json({ error: 'Character not found' });
        }

        await contextManager.db.addCondition(char.id, condition, null, duration);

        // Log event
        await contextManager.db.recordEvent(
            'condition',
            `${character} gained condition: ${condition}`,
            { character: character, condition: condition, action: 'add' }
        );

        // Sync JSON state
        const firstName = character.split(' ')[0].toLowerCase();
        if (contextManager.campaignState.characters[firstName]) {
            if (!contextManager.campaignState.characters[firstName].conditions) {
                contextManager.campaignState.characters[firstName].conditions = [];
            }
            contextManager.campaignState.characters[firstName].conditions.push(condition);
            await contextManager.updateCampaignState(contextManager.campaignState);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Add condition error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove condition from character
app.delete('/api/dnd/character/condition/:conditionId', async (req, res) => {
    try {
        const { conditionId } = req.params;
        const { campaign } = req.query;

        if (campaign !== 'test-silverpeak') {
            return res.status(400).json({ error: 'Only available for Silverpeak' });
        }

        if (!contextManager.db) {
            return res.status(503).json({ error: 'Database not initialized' });
        }

        // Get condition details before deleting
        const conditions = await contextManager.db.all(
            `SELECT c.*, ch.name as character_name FROM conditions c
             JOIN characters ch ON c.character_id = ch.id WHERE c.id = ?`,
            [conditionId]
        );

        const condition = conditions[0];

        await contextManager.db.removeCondition(conditionId);

        // Log event
        if (condition) {
            await contextManager.db.recordEvent(
                'condition',
                `${condition.character_name} lost condition: ${condition.condition_name}`,
                { character: condition.character_name, condition: condition.condition_name, action: 'remove' }
            );

            // Sync JSON state
            const firstName = condition.character_name.split(' ')[0].toLowerCase();
            if (contextManager.campaignState.characters[firstName]) {
                const condList = contextManager.campaignState.characters[firstName].conditions || [];
                const index = condList.indexOf(condition.condition_name);
                if (index > -1) {
                    condList.splice(index, 1);
                    contextManager.campaignState.characters[firstName].conditions = condList;
                    await contextManager.updateCampaignState(contextManager.campaignState);
                }
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Remove condition error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get recent campaign events
app.get('/api/dnd/events/recent', async (req, res) => {
    try {
        const { campaign, limit } = req.query;

        if (campaign !== 'test-silverpeak') {
            return res.status(400).json({ error: 'Only available for Silverpeak' });
        }

        if (!contextManager.db) {
            return res.status(503).json({ error: 'Database not initialized' });
        }

        const events = await contextManager.db.getRecentEvents(parseInt(limit) || 20);

        res.json({
            success: true,
            events: events
        });
    } catch (error) {
        console.error('Get events error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get quests
app.get('/api/dnd/quests', async (req, res) => {
    try {
        const { campaign, status } = req.query;

        if (campaign !== 'test-silverpeak') {
            return res.status(400).json({ error: 'Only available for Silverpeak' });
        }

        if (!contextManager.db) {
            return res.status(503).json({ error: 'Database not initialized' });
        }

        const quests = await contextManager.db.getQuests(status || 'active');

        res.json({
            success: true,
            quests: quests
        });
    } catch (error) {
        console.error('Get quests error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        contextLoaded: contextManager.isLoaded,
        memorySize: contextManager.totalMemorySize,
        eventsIndexed: contextManager.indexedEvents.length,
        timestamp: new Date().toISOString()
    });
});

// ==================== SERVER INITIALIZATION ====================

async function start() {
    console.log('🎮 Starting Complete Intelligent D&D Campaign Server...');
    
    try {
        await contextManager.initialize();
        
        const PORT = process.env.PORT || 3001;
        app.listen(PORT, () => {
            console.log('\n' + '='.repeat(60));
            console.log('✨ COMPLETE INTELLIGENT CAMPAIGN SYSTEM ACTIVE ✨');
            console.log('='.repeat(60));
            console.log(`📊 Campaign Memory: ${(contextManager.totalMemorySize / 1024 / 1024).toFixed(2)} MB loaded`);
            console.log(`🧠 Events Indexed: ${contextManager.indexedEvents.length} total exchanges`);
            console.log(`👥 NPCs Tracked: ${Object.keys(contextManager.completeMemory.npcInteractions).length} characters`);
            console.log(`📍 Locations: ${Object.keys(contextManager.completeMemory.locationMemories).length} areas mapped`);
            console.log(`🎲 Game State: ${Object.keys(contextManager.campaignState?.party || {}).length} party members`);
            console.log(`🔍 Smart Retrieval: ENABLED (99.9% compression)`);
            console.log('='.repeat(60));
            console.log(`🌐 Server: http://localhost:${PORT}/`);
            console.log(`📝 API: http://localhost:${PORT}/api/dnd/action`);
            console.log('='.repeat(60));
            console.log('\n💡 System ready! Context is dynamically optimized per action.\n');
        });
    } catch (error) {
        console.error('❌ Failed to start:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n📝 Saving final state...');
    await contextManager.saveIndices();
    await contextManager.saveConversationHistory('', '');
    console.log('✅ State saved. Goodbye!');
    process.exit(0);
});

// Start the server
start().catch(console.error);

module.exports = app;
