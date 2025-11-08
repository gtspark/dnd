// Enhanced D&D Campaign Server with Full Context Management
// This properly maintains story continuity across API calls

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3001;

// ==================== AI PROVIDER ABSTRACTION LAYER ====================

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
            this.saveCurrentProvider(); // Persist the change
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

    switchProvider(providerName) {
        return this.setProvider(providerName);
    }

    async generateResponse(system, messages) {
        const provider = this.providers[this.currentProvider];
        if (!provider) {
            throw new Error(`Provider ${this.currentProvider} not found`);
        }

        try {
            const response = await provider.generateResponse(system, messages);
            return {
                content: response,
                provider: this.currentProvider,
                model: provider.getModelName()
            };
        } catch (error) {
            console.error(`❌ ${this.currentProvider.toUpperCase()} API Error:`, error);
            throw error;
        }
    }
}

// Base AI Provider Class
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

// Claude Provider (maintains exact current behavior)
class ClaudeProvider extends BaseAIProvider {
    constructor() {
        super('claude', 'claude-sonnet-4-20250514');
    }

    async generateResponse(system, messages) {
        const fetch = require('node-fetch');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.modelName,
                system: system,
                messages: messages,
                max_tokens: 1000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.content && data.content[0]) {
            let content = data.content[0].text;

            // Add provider label for consistency (remove any existing stamps first)
            content = content.replace(/\*\*DM \([^)]+\)\*\*/g, '').trim();
            content += '\n\n**DM (CLAUDE)**';

            return content;
        } else {
            throw new Error('No content in Claude response');
        }
    }
}

// DeepSeek Provider (standardized to match Claude behavior)
class DeepSeekProvider extends BaseAIProvider {
    constructor() {
        super('deepseek', 'deepseek-chat');
    }

    async generateResponse(system, messages) {
        const fetch = require('node-fetch');

        // Enhanced system prompt to match Claude's D&D style
        const enhancedSystem = system + `

CRITICAL: You are replacing Claude as the Dungeon Master. Match these exact patterns:

1. **Roll Requests**: Use EXACTLY this format: "🎲 Roll [Skill] (DC [number]) to [action]"
   Examples: "🎲 Roll Technology/Hacking (DC 15) to access the terminal"

2. **Narrative Style**:
   - Use present tense, immediate action
   - Include character emotions and environmental details
   - End scenes with clear next action prompts

3. **Token Length**: Aim for ~400-600 tokens (similar to Claude responses)

4. **Character Consistency**: Maintain established character relationships and plot threads

5. **Response Labels**: Always end with "**DM (DEEPSEEK)**" to indicate provider`;

        // Convert messages to OpenAI-compatible format
        const openaiMessages = [];
        if (enhancedSystem) {
            openaiMessages.push({ role: 'system', content: enhancedSystem });
        }
        openaiMessages.push(...messages);

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: this.modelName,
                messages: openaiMessages,
                max_tokens: 1000,  // Match Claude's token limit
                temperature: 0.7,  // Match Claude's temperature
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            let content = data.choices[0].message.content;

            // Post-process to ensure Claude-like formatting (remove any existing stamps first)
            content = content.replace(/\*\*DM \([^)]+\)\*\*/g, '').trim();
            content += '\n\n**DM (DEEPSEEK)**';

            return content;
        } else {
            throw new Error('No content in DeepSeek response');
        }
    }
}

// GPT-4 Provider (standardized to match Claude behavior)
class GPT4Provider extends BaseAIProvider {
    constructor() {
        super('gpt4', 'gpt-4-turbo-preview');
    }

    async generateResponse(system, messages) {
        const fetch = require('node-fetch');

        // Enhanced system prompt to match Claude's D&D style
        const enhancedSystem = system + `

CRITICAL: You are replacing Claude as the Dungeon Master. Match these exact patterns:

1. **Roll Requests**: Use EXACTLY this format: "🎲 Roll [Skill] (DC [number]) to [action]"
   Examples: "🎲 Roll Technology/Hacking (DC 15) to access the terminal"

2. **Narrative Style**:
   - Use present tense, immediate action
   - Include character emotions and environmental details
   - End scenes with clear next action prompts
   - Match Claude's tone: dramatic, immersive, but concise

3. **Token Length**: Aim for ~400-600 tokens (similar to Claude responses)

4. **Character Consistency**: Maintain established character relationships and plot threads

5. **Response Labels**: Always end with "**DM (GPT-4)**" to indicate provider`;

        // Convert messages to OpenAI format
        const openaiMessages = [];
        if (enhancedSystem) {
            openaiMessages.push({ role: 'system', content: enhancedSystem });
        }
        openaiMessages.push(...messages);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: this.modelName,
                messages: openaiMessages,
                max_tokens: 1000,  // Match Claude's token limit
                temperature: 0.7,  // Match Claude's temperature
                presence_penalty: 0.1,  // Encourage variety like Claude
                frequency_penalty: 0.1  // Reduce repetition
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            let content = data.choices[0].message.content;

            // Post-process to ensure Claude-like formatting (remove any existing stamps first)
            content = content.replace(/\*\*DM \([^)]+\)\*\*/g, '').trim();
            content += '\n\n**DM (GPT-4)**';

            return content;
        } else {
            throw new Error('No content in OpenAI response');
        }
    }
}

// Initialize AI Provider Manager
const aiProviderManager = new AIProviderManager();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased for large context
app.use(express.static(__dirname));

// ==================== CONTEXT MANAGEMENT ====================

class CampaignContextManager {
    constructor() {
        this.campaignState = null;
        this.fullStoryLog = null;
        this.conversationHistory = [];
        this.maxHistoryEntries = 10000; // Much higher limit to preserve story
        this.isInitialized = false;
    }

    async initialize() {
        try {
            // Load campaign state
            const stateData = await fs.readFile('./campaign-state.json', 'utf8');
            this.campaignState = JSON.parse(stateData);

            // Load full story log
            this.fullStoryLog = await fs.readFile('./dax campaign full log.txt', 'utf8');

            // Load DM system prompt
            try {
                this.dmSystemPrompt = await fs.readFile('./dm-system-prompt.md', 'utf8');
                console.log('✅ DM system prompt loaded successfully');
            } catch (err) {
                console.log('⚠️ No dm-system-prompt.md found, using fallback prompt');
                this.dmSystemPrompt = null;
            }

            // Extract character information from story log
            this.extractCharacterProfiles();

            // Load conversation history if exists
            try {
                const historyData = await fs.readFile('./conversation-history.json', 'utf8');
                this.conversationHistory = JSON.parse(historyData);
            } catch (err) {
                console.log('No existing conversation history, starting fresh');
                this.conversationHistory = [];
            }

            this.isInitialized = true;
            console.log('✅ Context Manager initialized with full campaign data');
            console.log('📊 Character profiles extracted:', this.characterProfiles);

        } catch (error) {
            console.error('❌ Failed to initialize context:', error);
            throw error;
        }
    }

    extractCharacterProfiles() {
        // Extract character information from the full story log
        this.characterProfiles = {};
        this.storyContext = {
            npcs: {},
            factions: {},
            locations: {},
            keyEvents: [],
            currentObjectives: [],
            evidence: [],
            threats: []
        };

        if (!this.fullStoryLog) return;

        console.log('🔍 Extracting comprehensive story context from full campaign log...');

        const logLines = this.fullStoryLog.toLowerCase().split('\n');
        const originalLines = this.fullStoryLog.split('\n'); // Keep original case for proper names

        // Initialize counters for Chen and Yuen pronouns
        const characters = {
            chen: { she: 0, her: 0, he: 0, his: 0, him: 0 },
            yuen: { she: 0, her: 0, he: 0, his: 0, him: 0 }
        };

        // Extract NPCs and Key Characters
        originalLines.forEach((line, index) => {
            const lowerLine = line.toLowerCase();

            // Jonathan Park (UES Representative)
            if (lowerLine.includes('jonathan park') || lowerLine.includes('j.park') || lowerLine.includes('j. park')) {
                this.storyContext.npcs.jonathan_park = {
                    name: "Jonathan Park",
                    role: "United Earth Systems Representative",
                    status: "Nervous, on Titan Station",
                    importance: "Government liaison for quarantine situation",
                    lastMention: index
                };
            }

            // Director Holbrook
            if (lowerLine.includes('holbrook') || lowerLine.includes('director')) {
                this.storyContext.npcs.director_holbrook = {
                    name: "Director Holbrook",
                    role: "Titan Station Director",
                    status: "Allied, providing Protocol Seven protection",
                    importance: "Station authority, research contract offer",
                    lastMention: index
                };
            }

            // Commander Torres
            if (lowerLine.includes('torres') || lowerLine.includes('commander')) {
                this.storyContext.npcs.commander_torres = {
                    name: "Commander Torres",
                    role: "Station Security Chief",
                    status: "Allied, handling forensics and background checks",
                    importance: "Security coordination, evidence analysis",
                    lastMention: index
                };
            }

            // Kellerman (Weyland Rep)
            if (lowerLine.includes('kellerman')) {
                this.storyContext.npcs.kellerman = {
                    name: "Kellerman",
                    role: "Weyland Biosystems Representative",
                    status: "Hostile, escalating pressure",
                    importance: "Corporate threat, 73 blocked messages",
                    lastMention: index
                };
            }

            // Captain Morrison
            if (lowerLine.includes('morrison') || lowerLine.includes('captain')) {
                this.storyContext.npcs.captain_morrison = {
                    name: "Captain Morrison",
                    role: "Former Wanderer Captain",
                    status: "Deceased hero, maintained quarantine",
                    importance: "Sacrificed to prevent bioweapon spread",
                    lastMention: index
                };
            }

            // Extract Key Evidence
            if (lowerLine.includes('martinez') && lowerLine.includes('data')) {
                this.storyContext.evidence.push("Martinez's data log (hidden with Chen)");
            }
            if (lowerLine.includes('osprey') && lowerLine.includes('drone')) {
                this.storyContext.evidence.push("Osprey surveillance drone with quantum encryption");
            }
            if (lowerLine.includes('bioweapon') || lowerLine.includes('bio-weapon')) {
                this.storyContext.evidence.push("Bioweapon evidence from Wanderer incident");
            }

            // Extract Factions
            if (lowerLine.includes('weyland') || lowerLine.includes('biosystems')) {
                this.storyContext.factions.weyland = "Active corporate threat, treaty violations";
            }
            if (lowerLine.includes('osprey') || lowerLine.includes('security')) {
                this.storyContext.factions.osprey = "Hidden extraction specialist on station";
            }
            if (lowerLine.includes('united earth') || lowerLine.includes('u.e.s') || lowerLine.includes('ues')) {
                this.storyContext.factions.ues = "Government authority, monitoring situation";
            }

            // Extract Current Objectives
            if (lowerLine.includes('legal meeting') || lowerLine.includes('0600')) {
                this.storyContext.currentObjectives.push("Critical legal meeting at 0600");
            }
            if (lowerLine.includes('fourth crew member') || lowerLine.includes('background check')) {
                this.storyContext.currentObjectives.push("Vet potential fourth crew member");
            }
            if (lowerLine.includes('research contract') || lowerLine.includes('6-month')) {
                this.storyContext.currentObjectives.push("Secure 6-month research contract");
            }
        });

        // Count pronoun usage for each character
        logLines.forEach(line => {
            if (line.includes('chen')) {
                characters.chen.she += (line.match(/\bchen\b.*?\bshe\b|\bshe\b.*?\bchen\b/g) || []).length;
                characters.chen.her += (line.match(/\bchen\b.*?\bher\b|\bher\b.*?\bchen\b/g) || []).length;
                characters.chen.he += (line.match(/\bchen\b.*?\bhe\b(?!r)|\bhe\b(?!r).*?\bchen\b/g) || []).length;
                characters.chen.his += (line.match(/\bchen\b.*?\bhis\b|\bhis\b.*?\bchen\b/g) || []).length;
                characters.chen.him += (line.match(/\bchen\b.*?\bhim\b|\bhim\b.*?\bchen\b/g) || []).length;
            }

            if (line.includes('yuen')) {
                characters.yuen.she += (line.match(/\byuen\b.*?\bshe\b|\bshe\b.*?\byuen\b/g) || []).length;
                characters.yuen.her += (line.match(/\byuen\b.*?\bher\b|\bher\b.*?\byuen\b/g) || []).length;
                characters.yuen.he += (line.match(/\byuen\b.*?\bhe\b(?!r)|\bhe\b(?!r).*?\byuen\b/g) || []).length;
                characters.yuen.his += (line.match(/\byuen\b.*?\bhis\b|\bhis\b.*?\byuen\b/g) || []).length;
                characters.yuen.him += (line.match(/\byuen\b.*?\bhim\b|\bhim\b.*?\byuen\b/g) || []).length;
            }
        });

        // Use established character facts (pronoun counting is unreliable)
        this.characterProfiles = {
            dax: {
                gender: 'male',
                pronouns: 'he/him',
                species: 'Vexian',
                evidenceCount: 'campaign-established'
            },
            chen: {
                gender: 'female',
                pronouns: 'she/her',
                species: 'Human',
                evidenceCount: 'campaign-established'
            },
            yuen: {
                gender: 'female',
                pronouns: 'she/her',
                species: 'Human',
                evidenceCount: 'campaign-established'
            }
        };

        // Remove duplicate entries from arrays
        this.storyContext.evidence = [...new Set(this.storyContext.evidence)];
        this.storyContext.currentObjectives = [...new Set(this.storyContext.currentObjectives)];

        // Log extracted context for verification
        console.log('✅ Story context extraction complete:');
        console.log('📋 NPCs found:', Object.keys(this.storyContext.npcs));
        console.log('🏛️ Factions:', Object.keys(this.storyContext.factions));
        console.log('🔍 Evidence pieces:', this.storyContext.evidence.length);
        console.log('🎯 Current objectives:', this.storyContext.currentObjectives.length);

        if (this.storyContext.npcs.jonathan_park) {
            console.log('✅ JONATHAN PARK FOUND:', this.storyContext.npcs.jonathan_park);
        } else {
            console.log('❌ JONATHAN PARK NOT FOUND - checking logs...');
        }
    }

    async saveConversationHistory() {
        try {
            await fs.writeFile(
                './conversation-history.json',
                JSON.stringify(this.conversationHistory, null, 2)
            );
        } catch (error) {
            console.error('Failed to save conversation history:', error);
        }
    }

    async archiveOldConversations() {
        try {
            const archiveDate = new Date().toISOString().split('T')[0];
            const archiveFile = `./conversation-archive-${archiveDate}.json`;

            // Save first 9000 entries to archive
            const toArchive = this.conversationHistory.slice(0, 9000);
            await fs.writeFile(archiveFile, JSON.stringify(toArchive, null, 2));

            // Keep only recent 1000 entries
            this.conversationHistory = this.conversationHistory.slice(9000);

            console.log(`📚 Archived ${toArchive.length} conversation entries to ${archiveFile}`);
        } catch (error) {
            console.error('Failed to archive conversations:', error);
        }
    }

    async saveCompleteStoryLog(playerAction, dmResponse) {
        try {
            const timestamp = new Date().toISOString();
            const storyEntry = {
                timestamp,
                player: playerAction,
                dm: dmResponse,
                campaignState: this.campaignState
            };

            const logLine = `\n=== ${timestamp} ===\nPLAYER: ${playerAction}\nDM: ${dmResponse}\n`;
            await fs.appendFile('./complete-story-log.txt', logLine);

            // Also save as structured JSON
            let completeLog = [];
            try {
                const existingLog = await fs.readFile('./complete-story-log.json', 'utf8');
                completeLog = JSON.parse(existingLog);
            } catch (err) {
                // File doesn't exist yet, start fresh
            }

            completeLog.push(storyEntry);
            await fs.writeFile('./complete-story-log.json', JSON.stringify(completeLog, null, 2));

        } catch (error) {
            console.error('Failed to save complete story log:', error);
        }
    }

    async addToHistory(role, content) {
        this.conversationHistory.push({
            role,
            content,
            timestamp: new Date().toISOString()
        });
        
        // Archive old history instead of deleting it
        if (this.conversationHistory.length > this.maxHistoryEntries) {
            await this.archiveOldConversations();
        }
        
        this.saveConversationHistory();
    }

    buildSystemPrompt() {
        console.log('🔍 buildSystemPrompt called - storyContext exists:', !!this.storyContext);
        console.log('🔍 storyContext NPCs:', Object.keys(this.storyContext?.npcs || {}));

        // Use loaded DM system prompt if available
        if (this.dmSystemPrompt) {
            // Add campaign context to the DM prompt
            const campaignContext = this.buildCampaignContext();
            console.log('🔍 Campaign context length:', campaignContext.length);
            return `${this.dmSystemPrompt}\n\n${campaignContext}`;
        }

        // Fallback if no DM prompt loaded
        if (!this.campaignState) {
            return "You are a D&D Dungeon Master running a space opera campaign.";
        }

        return `# DUNGEON MASTER INSTRUCTIONS - TITAN STATION CRISIS

You are the Dungeon Master for an ongoing D&D campaign set in a space opera universe (Mass Effect meets The Expanse meets Dead Space).

## ABSOLUTE RULES - NEVER VIOLATE:
1. **Chen is FEMALE** - Always use she/her pronouns for Chen
2. **Dr. Yuen is FEMALE** - Always use she/her pronouns for Dr. Yuen
3. **Dax is MALE** - Always use he/him pronouns for Dax
4. Maintain perfect story continuity from previous chapters
5. Reference past events accurately when relevant

## CAMPAIGN STATUS:
**Current Time**: ${this.campaignState.current_time}
**Location**: ${this.campaignState.current_location}
**Scene**: ${this.campaignState.current_scene.status}
**Threat Level**: ${this.campaignState.current_scene.threat_level}

## PARTY MEMBERS:
${this.formatPartyInfo()}

## KEY NPCS:
${this.formatNPCInfo()}

## ACTIVE THREATS:
${this.formatThreats()}

## STORY CONTEXT:
${this.campaignState.continuation_context}

## MAJOR PLOT THREADS:
${this.formatPlotThreads()}

## DM STYLE GUIDELINES:
- Maintain tension and suspense appropriate to space horror/thriller
- Balance political intrigue with action sequences
- Use technical details to ground the sci-fi setting
- Remember Dax has FOUR ARMS (Vexian species trait)
- Track resource management (credits, ammo, evidence)
- Character death means switching to another survivor, not game over
- Make rolls meaningful - call for Perception, Tech, Persuasion, etc.

## ROLL REQUEST FORMAT:
When requesting dice rolls, use this EXACT format:
🎲 ROLL NEEDED: Roll [Skill] ([Ability]) (DC [number]) to [action description]

Examples:
- "🎲 ROLL NEEDED: Roll Stealth (Dexterity) (DC 12) to sneak past the sleeping guard"
- "🎲 ROLL NEEDED: Roll Technology/Hacking (Intelligence) (DC 15) to bypass security"
- "🎲 ROLL NEEDED: Roll Perception (Wisdom) (DC 13) to notice hidden details"

IMPORTANT: Stop narrative at roll point - do not continue past the roll request.

## RECENT EVENTS FOR CONTINUITY:
${this.getRecentHistory()}

Remember: You are continuing an established story. Reference past events, maintain character relationships, and progress the narrative consistently.`;
    }

    buildCampaignContext() {
        if (!this.campaignState && !this.storyContext) return "";

        console.log('🔍 Building campaign context - storyContext NPCs:', Object.keys(this.storyContext?.npcs || {}));

        // Build dense, time-relevant context from extracted story elements
        let context = `## COMPREHENSIVE CAMPAIGN CONTEXT:\n\n`;

        // Current Scene Status
        if (this.campaignState) {
            context += `**Current Time**: ${this.campaignState.current_time}\n`;
            context += `**Location**: ${this.campaignState.current_location}\n`;
            context += `**Scene**: ${this.campaignState.current_scene?.status || 'Active'}\n`;
            context += `**Threat Level**: ${this.campaignState.current_scene?.threat_level || 'High'}\n\n`;
        }

        // Enhanced NPC Information from Story Context
        if (this.storyContext?.npcs && Object.keys(this.storyContext.npcs).length > 0) {
            context += `## KEY NPCs (EXTRACTED FROM FULL CAMPAIGN):\n`;
            Object.entries(this.storyContext.npcs).forEach(([key, npc]) => {
                context += `**${npc.name}**: ${npc.role} - ${npc.status}\n`;
                context += `  └ ${npc.importance}\n`;
            });
            context += `\n`;
        } else {
            // Fallback: Use campaign state NPCs if story context NPCs not available
            if (this.campaignState?.key_npcs) {
                context += `## KEY NPCs (FROM CAMPAIGN STATE):\n`;
                Object.entries(this.campaignState.key_npcs).forEach(([key, npc]) => {
                    context += `**${npc.name}**: ${npc.role} - ${npc.status}\n`;
                    if (npc.importance) context += `  └ ${npc.importance}\n`;
                });
                context += `\n`;
            }
        }

        // Faction Relationships
        if (this.storyContext?.factions && Object.keys(this.storyContext.factions).length > 0) {
            context += `## FACTION STATUS:\n`;
            Object.entries(this.storyContext.factions).forEach(([faction, status]) => {
                context += `**${faction.toUpperCase()}**: ${status}\n`;
            });
            context += `\n`;
        }

        // Critical Evidence and Plot Elements
        if (this.storyContext?.evidence && this.storyContext.evidence.length > 0) {
            context += `## KEY EVIDENCE:\n`;
            this.storyContext.evidence.forEach(evidence => {
                context += `• ${evidence}\n`;
            });
            context += `\n`;
        }

        // Current Objectives
        if (this.storyContext?.currentObjectives && this.storyContext.currentObjectives.length > 0) {
            context += `## CURRENT OBJECTIVES:\n`;
            this.storyContext.currentObjectives.forEach(objective => {
                context += `• ${objective}\n`;
            });
            context += `\n`;
        }

        // Party Information with Character Gender Profiles
        context += `## PARTY MEMBERS:\n`;
        if (this.characterProfiles) {
            Object.entries(this.characterProfiles).forEach(([name, profile]) => {
                context += `**${name.charAt(0).toUpperCase() + name.slice(1)}**: ${profile.pronouns} (${profile.evidenceCount} pronoun references)\n`;
            });
        }
        context += `${this.formatPartyInfo()}\n`;

        // Story Continuity Context
        if (this.campaignState?.continuation_context) {
            context += `## STORY CONTEXT:\n${this.campaignState.continuation_context}\n\n`;
        }

        // Recent History for Immediate Continuity
        context += `## RECENT EVENTS FOR CONTINUITY:\n${this.getRecentHistory()}\n`;

        context += `\n**CRITICAL**: Jonathan Park (UES Representative) should be a known character if mentioned. All NPCs above have been extracted from the complete campaign history and should be referenced accurately.\n`;

        return context;
    }

    formatPartyInfo() {
        if (!this.campaignState?.party) return "Party information unavailable";

        let info = "";
        for (const [key, member] of Object.entries(this.campaignState.party)) {
            const profile = this.characterProfiles?.[key.toLowerCase()];
            const genderInfo = profile ? ` (${profile.gender}, ${profile.pronouns} - ${profile.evidenceCount} references)` : '';

            info += `
**${member.name}** (${member.species} ${member.class})${genderInfo}
- Credits: ${member.credits}
- HP: ${member.hp ? `${member.hp.current}/${member.hp.max}` : 'Unknown'}
- AC: ${member.ac || 'Unknown'}
- **Ability Scores**: STR ${member.abilities?.strength || '?'}, DEX ${member.abilities?.dexterity || '?'}, CON ${member.abilities?.constitution || '?'}, INT ${member.abilities?.intelligence || '?'}, WIS ${member.abilities?.wisdom || '?'}, CHA ${member.abilities?.charisma || '?'}
- Equipment: ${member.equipment ? member.equipment.join(', ') : 'None listed'}`;
        }
        return info;
    }

    formatNPCInfo() {
        if (!this.campaignState?.key_npcs) return "NPC information unavailable";
        
        let info = "";
        for (const [key, npc] of Object.entries(this.campaignState.key_npcs)) {
            if (npc.name) {
                info += `
**${npc.name}** - ${npc.role}
Status: ${npc.status}`;
            }
        }
        return info;
    }

    formatThreats() {
        if (!this.campaignState?.current_threats) return "No immediate threats";
        
        let threats = "**Immediate**: ";
        threats += this.campaignState.current_threats.immediate.join(", ");
        
        if (this.campaignState.current_threats.timeline) {
            threats += "\n**Timeline**: ";
            threats += this.campaignState.current_threats.timeline.join(", ");
        }
        
        return threats;
    }

    formatPlotThreads() {
        if (!this.campaignState?.major_plot_threads) return "";
        
        let threads = "";
        for (const [key, thread] of Object.entries(this.campaignState.major_plot_threads)) {
            threads += `\n**${key}**: ${thread.core || thread.discovery || Object.values(thread)[0]}`;
        }
        return threads;
    }

    getRecentHistory(count = 10) {
        if (this.conversationHistory.length === 0) {
            return "Starting new session - no recent history";
        }
        
        const recent = this.conversationHistory.slice(-count);
        return recent.map(entry => 
            `[${entry.role}]: ${entry.content.substring(0, 100)}...`
        ).join('\n');
    }

    buildClaudeMessages(playerAction) {
        const messages = [];

        // Add conversation history for context
        const recentHistory = this.conversationHistory.slice(-20);
        recentHistory.forEach(entry => {
            messages.push({
                role: entry.role === 'player' ? 'user' : 'assistant',
                content: entry.content
            });
        });

        // Add current player action
        messages.push({
            role: "user",
            content: `Player action (as ${this.campaignState?.party?.dax?.name || 'Dax'}): ${playerAction}`
        });

        return {
            system: this.buildSystemPrompt(),
            messages: messages
        };
    }

    async updateCampaignState(updates) {
        if (updates && typeof updates === 'object') {
            this.campaignState = { ...this.campaignState, ...updates };
            await fs.writeFile(
                './campaign-state.json',
                JSON.stringify(this.campaignState, null, 2)
            );
        }
    }
}

// Initialize context manager
const contextManager = new CampaignContextManager();

// ==================== API ROUTES ====================

// Main DM action endpoint with full context
app.post('/api/dnd/action', async (req, res) => {
    try {
        const { character, campaignState, action, sessionId, useRealClaude } = req.body;
        
        console.log(`[${sessionId}] Player action: ${action}`);
        
        // Add player action to history
        await contextManager.addToHistory('player', action);
        
        let dmResponse;
        
        if (useRealClaude !== false) {  // Default to true, only use fallback if explicitly false
            // Use AI provider manager for dynamic provider switching
            const currentProvider = aiProviderManager.getCurrentProvider();
            const claudeData = contextManager.buildClaudeMessages(action);

            try {
                // Debug: Log system prompt to see if Jonathan Park context is included
                console.log('🔍 SYSTEM PROMPT DEBUG - LENGTH:', claudeData.system.length);
                console.log('🔍 FIRST 500 chars:');
                console.log(claudeData.system.substring(0, 500));
                console.log('🔍 LAST 1000 chars (campaign context):');
                console.log(claudeData.system.substring(claudeData.system.length - 1000));

                const aiResponse = await aiProviderManager.generateResponse(
                    claudeData.system,
                    claudeData.messages
                );
                dmResponse = aiResponse.content;
                console.log(`✅ Response generated by: ${currentProvider.toUpperCase()}`);

            } catch (error) {
                console.error(`${currentProvider.toUpperCase()} API error:`, error);
                // Return error instead of fallback
                return res.status(500).json({
                    error: `AI Provider (${currentProvider.toUpperCase()}) failed: ${error.message}`,
                    provider: currentProvider,
                    suggestion: 'Try switching to a different AI provider in settings'
                });
            }
            
        } else {
            // Use context-aware fallback responses
            dmResponse = getFallbackResponse(action);
        }
        
        // Add DM response to history
        await contextManager.addToHistory('assistant', dmResponse);

        // Save complete story log for permanent record
        await contextManager.saveCompleteStoryLog(action, dmResponse);
        
        // Update campaign state if provided
        if (campaignState) {
            await contextManager.updateCampaignState(campaignState);
        }
        
        res.json({
            message: dmResponse,
            campaignState: contextManager.campaignState,
            contextActive: true
        });
        
    } catch (error) {
        console.error('Error processing action:', error);
        res.status(500).json({
            error: 'Failed to process action',
            message: error.message
        });
    }
});

// Get current campaign context
app.get('/api/dnd/context', async (req, res) => {
    res.json({
        initialized: contextManager.isInitialized,
        campaignState: contextManager.campaignState,
        historyLength: contextManager.conversationHistory.length,
        systemPrompt: contextManager.buildSystemPrompt()
    });
});

// Update campaign state
app.post('/api/dnd/state', async (req, res) => {
    try {
        const updates = req.body;
        await contextManager.updateCampaignState(updates);
        res.json({
            success: true,
            campaignState: contextManager.campaignState
        });
    } catch (error) {
        console.error('Error updating state:', error);
        res.status(500).json({ error: 'Failed to update campaign state' });
    }
});

// Clear conversation history (for new sessions)
app.post('/api/dnd/clear-history', async (req, res) => {
    contextManager.conversationHistory = [];
    await contextManager.saveConversationHistory();
    res.json({ success: true, message: 'Conversation history cleared' });
});

// ==================== FALLBACK RESPONSES ====================

function getFallbackResponse(action) {
    const state = contextManager.campaignState;
    const location = state?.current_location || "Titan Station";
    
    // Context-aware responses based on current situation
    if (action.toLowerCase().includes('osprey') || action.toLowerCase().includes('operative')) {
        return `The mention of Osprey makes Chen tense up immediately. "Those bastards are professionals," she says, her hand instinctively moving to where her shotgun would be - if station security hadn't confiscated it.\n\n"Two-person cells, always," she continues. "We found one drone, but there's definitely another operative out there. They've got 48 hours to complete extraction before their contract penalty kicks in."\n\nDr. Yuen nods gravely. "Director Holbrook has us in the secure wing now, but Osprey has unlimited resources. They'll find a way if we're not careful."\n\nThe secure quarters feel less secure suddenly. What's your next move?`;
    }
    
    if (action.toLowerCase().includes('legal') || action.toLowerCase().includes('meeting')) {
        return `"The legal meeting has been moved up to 0600," Dr. Yuen reminds you, checking her datapad. "That's in less than three hours now. We need to prepare our strategy."\n\nChen paces anxiously. "Weyland's trying to rush this through while we're rattled. They know about the biological warfare charges we're bringing."\n\n"We have Martinez's data log as evidence," Yuen adds, "but we need to decide how much to reveal and when. The wrong move could get us disappeared by Osprey before we can testify."\n\nHow do you want to prepare for this crucial meeting?`;
    }
    
    // Default contextual response
    return `You're in ${location}, where the tension is palpable. Station security is on high alert searching for the second Osprey operative, while you and your crew have less than 3 hours before the critical legal meeting that could determine your fate.\n\nChen and Dr. Yuen look to you for guidance. The weight of the conspiracy - Weyland's bioweapons, Captain Morrison's sacrifice, and the crew of the Wanderer - rests on your collective shoulders.\n\nWhat's your next move?`;
}

// ==================== SERVER SETUP ====================

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        contextInitialized: contextManager.isInitialized,
        historyLength: contextManager.conversationHistory.length,
        timestamp: new Date().toISOString()
    });
});

// Campaign state endpoint for sync
app.get('/api/dnd/state', (req, res) => {
    try {
        const campaignState = contextManager.campaignState;
        const lastUpdateTime = new Date().toISOString();

        // Build sync-friendly state object
        const syncState = {
            timestamp: lastUpdateTime,
            credits: {
                total: campaignState?.resources?.credits_total || 15800,
                dax: campaignState?.party?.dax?.credits || 3000,
                chen: campaignState?.party?.chen?.credits || 800,
                yuen: campaignState?.party?.yuen?.credits || 12000
            },
            characters: {
                dax: {
                    hp: campaignState?.party?.dax?.hp || { current: 9, max: 9 },
                    stats: campaignState?.party?.dax?.stats || { str: 8, dex: 18, con: 12, int: 16, wis: 13, cha: 10 },
                    equipment: [], // Will be populated from current campaign state
                    conditions: [] // Fatigue, injuries, etc.
                },
                chen: {
                    hp: { current: 12, max: 12 }, // Default for Chen
                    stats: { str: 14, dex: 16, con: 14, int: 15, wis: 12, cha: 11 }, // Default for Chen
                    equipment: [],
                    conditions: []
                },
                yuen: {
                    hp: { current: 10, max: 10 }, // Default for Dr. Yuen
                    stats: { str: 10, dex: 12, con: 12, int: 18, wis: 16, cha: 14 }, // Default for Dr. Yuen
                    equipment: [],
                    conditions: []
                }
            },
            quests: [
                { id: 'titan-station', title: '🔍 CHAPTER 2: TITAN STATION', completed: false },
                { id: 'weyland-conspiracy', title: '⚠️ The Weyland Conspiracy', completed: false },
                { id: 'memory-lock', title: '🧠 Memory Lock Revealed', completed: true },
                { id: 'wanderer-incident', title: '☠️ The Wanderer Incident', completed: true }
            ],
            currentTime: campaignState?.current_time || '0530 hours',
            currentLocation: campaignState?.current_location || 'Secure wing quarters, Titan Station core',
            threatLevel: campaignState?.current_scene?.threat_level || 'High'
        };

        console.log('🔄 Serving campaign state for sync:', {
            timestamp: lastUpdateTime,
            creditsTotal: syncState.credits.total
        });

        res.json(syncState);
    } catch (error) {
        console.error('Error serving campaign state:', error);
        res.status(500).json({ error: 'Failed to get campaign state' });
    }
});

// Rollback Management Endpoint
app.post('/api/dnd/rollback', async (req, res) => {
    try {
        const { index } = req.body;

        if (typeof index !== 'number' || index < 0) {
            return res.status(400).json({ error: 'Valid index required' });
        }

        // Load current conversation history
        const currentHistory = contextManager.conversationHistory;

        if (index >= currentHistory.length) {
            return res.status(400).json({ error: 'Index out of range' });
        }

        // Trim history to rollback point
        const rolledBackHistory = currentHistory.slice(0, index + 1);
        contextManager.conversationHistory = rolledBackHistory;

        // Save to file
        await contextManager.saveConversationHistory();

        console.log(`🔄 Rolled back conversation from ${currentHistory.length} to ${rolledBackHistory.length} entries`);

        res.json({
            success: true,
            originalLength: currentHistory.length,
            newLength: rolledBackHistory.length,
            message: `Rolled back to entry ${index}`
        });

    } catch (error) {
        console.error('Error during rollback:', error);
        res.status(500).json({ error: 'Failed to rollback' });
    }
});

// AI Provider Management Endpoints
app.get('/api/dnd/ai-provider', (req, res) => {
    try {
        const currentProvider = aiProviderManager.getCurrentProvider();
        const availableProviders = aiProviderManager.getAvailableProviders();

        res.json({
            current: currentProvider,
            available: availableProviders,
            capabilities: {
                claude: { name: 'Claude (Sonnet 4)', available: !!process.env.CLAUDE_API_KEY },
                deepseek: { name: 'DeepSeek (Chat)', available: !!process.env.DEEPSEEK_API_KEY },
                gpt4: { name: 'GPT-4 (Turbo)', available: !!process.env.OPENAI_API_KEY }
            }
        });
    } catch (error) {
        console.error('Error getting AI provider info:', error);
        res.status(500).json({ error: 'Failed to get provider info' });
    }
});

app.post('/api/dnd/ai-provider', (req, res) => {
    try {
        const { provider } = req.body;

        if (!provider) {
            return res.status(400).json({ error: 'Provider name required' });
        }

        const success = aiProviderManager.switchProvider(provider);

        if (success) {
            console.log(`🔄 AI Provider switched to: ${provider.toUpperCase()}`);
            res.json({
                success: true,
                provider: provider,
                message: `Switched to ${provider.toUpperCase()}`
            });
        } else {
            res.status(400).json({
                error: `Failed to switch to ${provider}`,
                current: aiProviderManager.getCurrentProvider()
            });
        }
    } catch (error) {
        console.error('Error switching AI provider:', error);
        res.status(500).json({ error: 'Failed to switch provider' });
    }
});

// Start server
async function startServer() {
    try {
        // Initialize context manager
        await contextManager.initialize();
        
        // Start listening
        app.listen(PORT, () => {
            console.log(`🎲 Enhanced D&D Campaign Server running on port ${PORT}`);
            console.log(`📚 Context Manager loaded with full campaign history`);
            console.log(`🌐 Available at: http://localhost:${PORT}/`);
            console.log(`⚡ Using ${process.env.CLAUDE_API_KEY ? 'Claude API' : 'Context-Aware Fallbacks'}`);
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;