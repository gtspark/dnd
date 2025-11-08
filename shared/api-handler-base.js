// Enhanced Claude API Handler for D&D Campaign Manager
// Now includes complete story context management

class ClaudeAPIHandler {
    constructor() {
        this.config = null;
        this.systemPrompt = null;
        this.campaignState = null;
        this.conversationHistory = [];
        this.storyContext = null; // Using enhanced server backend instead
        this.isInitialized = false;
    }

    async initialize() {
        try {
            // Load configuration
            const configResponse = await fetch('./api-config.json');
            this.config = await configResponse.json();

            // Force live mode - override sandbox mode
            this.config.sandbox_mode = false;
            localStorage.setItem('dnd_sandbox_mode', 'false');

            // Load system prompt
            const promptResponse = await fetch('./dm-system-prompt.md');
            this.systemPrompt = await promptResponse.text();

            // Enhanced server handles story context on backend

            // Load appropriate campaign state
            const stateFile = this.config.sandbox_mode ?
                './sandbox-state.json' :
                './campaign-state.json';
            const stateResponse = await fetch(stateFile);
            this.campaignState = await stateResponse.json();

            // Load conversation history from localStorage
            this.loadConversationHistory();

            this.isInitialized = true;

            // Force live mode UI
            this.updateSandboxUI();

            console.log('🚀 Enhanced Claude API Handler initialized', {
                sandbox: this.config.sandbox_mode,
                enhancedServerMode: true,
                conversationEntries: this.conversationHistory.length
            });
        } catch (error) {
            console.error('Failed to initialize Claude API Handler:', error);
            throw error;
        }
    }

    async toggleSandboxMode() {
        this.config.sandbox_mode = !this.config.sandbox_mode;

        // Save preference to localStorage
        localStorage.setItem('dnd_sandbox_mode', JSON.stringify(this.config.sandbox_mode));

        // Reload campaign state
        const stateFile = this.config.sandbox_mode ?
            './sandbox-state.json' :
            './campaign-state.json';
        const stateResponse = await fetch(stateFile);
        this.campaignState = await stateResponse.json();

        // Load conversation history from localStorage
        this.loadConversationHistory();

        // Update UI
        this.updateSandboxUI();

        console.log('Switched to', this.config.sandbox_mode ? 'sandbox' : 'live', 'mode');
    }

    updateSandboxUI() {
        const banner = document.getElementById('sandbox-banner');

        // Force live mode UI regardless of config
        banner.style.display = 'none';
        // Note: Campaign title is set by campaign-base.js updateCampaignUI()
    }

    buildContextMessage() {
        // Enhanced server handles all context building
        return "Context managed by enhanced server";
    }

    loadConversationHistory() {
        // Load the game log from localStorage and convert to conversation history
        try {
            const gameLogEntries = JSON.parse(localStorage.getItem('dnd_game_log') || '[]');
            this.conversationHistory = [];

            gameLogEntries.forEach(entry => {
                if (entry.author === 'player') {
                    this.conversationHistory.push({
                        type: 'player',
                        message: entry.content,
                        timestamp: entry.timestamp
                    });
                } else if (entry.author === 'dm') {
                    this.conversationHistory.push({
                        type: 'dm',
                        message: entry.content,
                        timestamp: entry.timestamp
                    });
                }
                // Skip system messages for Claude context
            });

            // Limit conversation history to prevent token overflow
            const MAX_ENTRIES = 400; // Roughly 80K tokens, leaving room for context
            if (this.conversationHistory.length > MAX_ENTRIES) {
                const truncated = this.conversationHistory.slice(-MAX_ENTRIES);
                console.log(`📚 Loaded ${this.conversationHistory.length} total entries, sending last ${MAX_ENTRIES} to Claude`);
                this.conversationHistory = truncated;
            } else {
                console.log(`📚 Loaded ${this.conversationHistory.length} conversation entries`);
            }

            console.log('🔍 First 3 entries:', this.conversationHistory.slice(0, 3));
            console.log('🔍 Last 3 entries:', this.conversationHistory.slice(-3));

            // Extract character information from full history for compendium
            this.createCharacterCompendium(gameLogEntries);
        } catch (error) {
            console.error('Error loading conversation history:', error);
            this.conversationHistory = [];
        }
    }

    async sendMessage(playerMessage, mode = 'ic', isRollResult = false) {
        if (!this.isInitialized) {
            throw new Error('API Handler not initialized');
        }

        try {
            // Enhanced server handles all context building - just send the player action
            let actionMessage;

            if (isRollResult) {
                actionMessage = `**Previous Scene**: ${this.getLastDMResponse()}\n\n**Roll Result**: ${playerMessage}\n\nContinue the narrative based on this roll result.`;
            } else {
                actionMessage = playerMessage;
            }

            // Debug: Log what we're sending to enhanced server
            console.log('=== ENHANCED SERVER DEBUG ===');
            console.log('Enhanced server mode: active');
            console.log('Message mode:', mode);
            console.log('Sending player action:', actionMessage);
            console.log('Server will build full context including campaign state and conversation history');
            console.log('=== END DEBUG ===');

            // Call enhanced server API with mode parameter
            const response = await this.callClaudeAPI(actionMessage, mode, isRollResult);

            // Handle new two-phase system response format
            let parsedResponse;
            if (response.type === 'roll_request') {
                // Two-phase system: Phase 1 response
                parsedResponse = {
                    type: 'roll_request',
                    narrative: response.narrative,
                    rollRequest: response.rollRequest
                };
            } else {
                // Traditional system: parse narrative for roll requests
                parsedResponse = this.parseResponse(response.narrative);

                // If server provided a rollRequest, use it (overrides client-side parsing)
                if (response.rollRequest) {
                    parsedResponse.rollRequest = response.rollRequest;
                    parsedResponse.type = 'roll_request';
                }

                // Pass through combat detection and enemies
                if (response.combatDetected) {
                    parsedResponse.combatDetected = response.combatDetected;
                }
                if (response.enemies) {
                    parsedResponse.enemies = response.enemies;
                }
                if (response.handoffData) {
                    parsedResponse.handoffData = response.handoffData;
                }
                if (response.initiativeOrder) {
                    parsedResponse.initiativeOrder = response.initiativeOrder;
                }
            }

            // Store in conversation history
            this.conversationHistory.push({
                type: 'player',
                message: playerMessage,
                timestamp: new Date().toISOString()
            });
            this.conversationHistory.push({
                type: 'dm',
                message: response.narrative,
                timestamp: new Date().toISOString()
            });

            // Also store in game log for persistence (only if not already there)
            this.addToGameLogSafe('player', playerMessage);
            this.addToGameLogSafe('dm', response.narrative);

            return parsedResponse;
        } catch (error) {
            console.error('Error sending message to Claude:', error);
            throw error;
        }
    }

    async callClaudeAPI(message, mode = 'ic', isRollResult = false) {
        // Use the enhanced server's DND action endpoint
        const apiUrl = '/dnd-api/dnd/action';

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: message,
                    mode: mode,  // Send message mode to server
                    sessionId: 'main-campaign',
                    campaign: window.campaignId || 'default',  // Include campaign ID
                    // Let server use its configured AI provider instead of forcing Claude
                    campaignState: this.campaignState
                })
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    narrative: data.narrative || data.message,
                    type: data.type || 'narrative',
                    rollRequest: data.rollRequest,
                    phase: data.phase,
                    setupNarrative: data.setupNarrative,
                    combatDetected: data.combatDetected,
                    enemies: data.enemies,
                    handoffData: data.handoffData,
                    initiativeOrder: data.initiativeOrder
                };
            } else if (response.status === 429) {
                this.showRateLimitModal();
                throw new Error('Rate limit exceeded - please wait 10 seconds');
            } else {
                throw new Error(`Enhanced server error: ${response.status}`);
            }
        } catch (error) {
            console.error('Enhanced server API error:', error);
            throw new Error(`Enhanced server failed: ${error.message}`);
        }
    }

    parseResponse(response) {
        console.log('=== parseResponse DEBUG ===');
        console.log('Raw response:', response);
        console.log('Response length:', response.length);
        console.log('Contains 🎲:', response.includes('🎲'));

        // Check for roll requests - handle multiple formats including multiline
        const rollPatterns = [
            // New clean format: "🎲 Roll Persuasion (DC 12) to convince Torres"
            /🎲 Roll (.+?) \(DC (\d+)\) to (.+?)(?=\n|$)/i,
            // Handle broken format: "🎲 Roll Unknown\nto Technology"
            /🎲 Roll Unknown[\s\n]*to\s+(.+?)(?=\n|$)/i,
            // Fallback patterns for other formats
            /🎲 ROLL NEEDED: (.+?)(?=\n|$)/i,
            /🎲 Roll (.+?)(?=\n|$)/i,
            /🎲\s*Roll\s+(.+?)\s+to\s+(.+?)(?=\n|$)/i,
            /🎲 Roll Unknown\s*\n?\s*to Roll (.+?) \(DC (\d+)\) to (.+?)(?=\n|$)/i,
            /🎲 Roll Unknown[\s\n]*to Roll (.+?) to (.+?)(?=\n|$)/i
        ];

        for (let i = 0; i < rollPatterns.length; i++) {
            const pattern = rollPatterns[i];
            console.log('Testing pattern:', pattern.source);
            const rollMatch = response.match(pattern);
            console.log('Pattern match result:', rollMatch);
            if (rollMatch) {
                console.log('FOUND ROLL MATCH with pattern:', pattern.source);
                let rollRequest;
                if (i === 0) {
                    // First pattern: Handle new clean format: "🎲 Roll Persuasion (DC 12) to convince Torres"
                    rollRequest = `Roll ${rollMatch[1]} (DC ${rollMatch[2]}) to ${rollMatch[3]}`;
                } else if (pattern.source.includes('Roll Unknown[\\s\\n]*to\\s+')) {
                    // Handle broken format: "🎲 Roll Unknown\nto Technology"
                    rollRequest = `Roll ${rollMatch[1]} to hack the door`;
                } else if (pattern.source.includes('Roll Unknown')) {
                    // Handle "🎲 Roll Unknown\nto Roll Technology/Hacking (DC 14) to..."
                    if (rollMatch[2] && rollMatch[3]) {
                        // Has DC value
                        rollRequest = `Roll ${rollMatch[1]} (DC ${rollMatch[2]}) to ${rollMatch[3]}`;
                    } else {
                        // No DC value
                        rollRequest = `Roll ${rollMatch[1]} to ${rollMatch[2]}`;
                    }
                } else if (pattern.source.includes('to\\s+')) {
                    // Handle "🎲 Roll Technology/Hacking (DC 15) to successfully breach..."
                    rollRequest = `Roll ${rollMatch[1]} to ${rollMatch[2]}`;
                } else {
                    rollRequest = rollMatch[1].trim();
                }

                console.log('Returning roll_request with rollRequest:', rollRequest);
                return {
                    type: 'roll_request',
                    narrative: response.replace(pattern, '').trim(),
                    rollRequest: rollRequest
                };
            }
        }

        return {
            type: 'narrative',
            narrative: response
        };
    }

    getLastDMResponse() {
        const lastDMEntry = this.conversationHistory
            .slice()
            .reverse()
            .find(entry => entry.type === 'dm');
        return lastDMEntry ? lastDMEntry.message : '';
    }

    // Utility method to extract roll details from roll request
    parseRollRequest(rollRequest) {
        // Try multiple patterns to extract roll information

        // Pattern 1: "Roll Technology/Hacking (DC 15) to attempt something"
        let match = rollRequest.match(/Roll\s+([^(]+?)(?:\s*\(DC\s*(\d+)\))?\s*to\s*(.+)/i);
        if (match) {
            return {
                skill: match[1].trim(),
                dc: match[2] ? parseInt(match[2]) : null,
                description: match[3].trim()
            };
        }

        // Pattern 2: "Roll Initiative for X, Y, Z" (initiative-specific)
        match = rollRequest.match(/Roll\s+(Initiative)\s+for\s+(.+)/i);
        if (match) {
            return {
                skill: match[1].trim(),
                dc: null,
                description: `for ${match[2].trim()}`
            };
        }

        // Pattern 3: "Roll SkillName (DC X)" (without "to" clause)
        match = rollRequest.match(/Roll\s+([^(]+?)\s*\(DC\s*(\d+)\)/i);
        if (match) {
            return {
                skill: match[1].trim(),
                dc: parseInt(match[2]),
                description: rollRequest
            };
        }

        // Pattern 4: Just "Roll SkillName" (simplest form)
        match = rollRequest.match(/Roll\s+([A-Za-z\/\-\s]+)/i);
        if (match) {
            return {
                skill: match[1].trim(),
                dc: null,
                description: rollRequest
            };
        }

        // Fallback: couldn't parse, return Unknown
        return {
            skill: 'Unknown',
            dc: null,
            description: rollRequest
        };
    }

    // Add entry to game log (localStorage) - safe version that prevents duplicates
    addToGameLogSafe(author, content) {
        try {
            const gameLog = JSON.parse(localStorage.getItem('dnd_game_log') || '[]');

            // Check if this exact entry already exists (prevent duplicates)
            const isDuplicate = gameLog.some(entry =>
                entry.author === author &&
                entry.content === content &&
                Math.abs(new Date(entry.timestamp) - new Date()) < 5000 // Within 5 seconds
            );

            if (!isDuplicate) {
                const entry = {
                    author: author,
                    content: content,
                    timestamp: new Date().toISOString()
                };
                gameLog.push(entry);
                localStorage.setItem('dnd_game_log', JSON.stringify(gameLog));
                console.log(`📝 Added ${author} entry to game log`);
            } else {
                console.log(`⚠️ Prevented duplicate ${author} entry`);
            }
        } catch (error) {
            console.error('Error adding to game log:', error);
        }
    }

    // Legacy method for compatibility
    addToGameLog(author, content) {
        this.addToGameLogSafe(author, content);
    }

    // Create character compendium from full conversation history
    createCharacterCompendium(fullHistory) {
        const compendium = {};
        let chenPronouns = { she: 0, her: 0, he: 0, his: 0 };
        let yuenPronouns = { she: 0, her: 0, he: 0, his: 0 };

        fullHistory.forEach(entry => {
            if (!entry.content) return;
            const content = entry.content.toLowerCase();

            // Count Chen pronouns (improved patterns)
            if (content.includes('chen')) {
                // Female pronouns - look for chen+she/her in either direction
                chenPronouns.she += (content.match(/\bchen\b.*?\bshe\b|\bshe\b.*?\bchen\b/g) || []).length;
                chenPronouns.her += (content.match(/\bchen\b.*?\bher\b|\bher\b.*?\bchen\b/g) || []).length;

                // Male pronouns - look for chen+he/his in either direction (but not "her")
                chenPronouns.he += (content.match(/\bchen\b.*?\bhe\b(?!r)|\bhe\b(?!r).*?\bchen\b/g) || []).length;
                chenPronouns.his += (content.match(/\bchen\b.*?\bhis\b|\bhis\b.*?\bchen\b/g) || []).length;
            }

            // Count Yuen pronouns (improved patterns)
            if (content.includes('yuen')) {
                yuenPronouns.she += (content.match(/\byuen\b.*?\bshe\b|\bshe\b.*?\byuen\b/g) || []).length;
                yuenPronouns.her += (content.match(/\byuen\b.*?\bher\b|\bher\b.*?\byuen\b/g) || []).length;
                yuenPronouns.he += (content.match(/\byuen\b.*?\bhe\b(?!r)|\bhe\b(?!r).*?\byuen\b/g) || []).length;
                yuenPronouns.his += (content.match(/\byuen\b.*?\bhis\b|\bhis\b.*?\byuen\b/g) || []).length;
            }
        });

        // Determine genders based on pronoun usage
        const chenGender = (chenPronouns.she + chenPronouns.her) > (chenPronouns.he + chenPronouns.his) ? 'female' : 'male';
        const yuenGender = (yuenPronouns.she + yuenPronouns.her) > (yuenPronouns.he + yuenPronouns.his) ? 'female' : 'male';

        this.characterCompendium = {
            chen: {
                gender: chenGender,
                pronouns: chenGender === 'female' ? 'she/her' : 'he/him',
                evidenceCount: chenPronouns.she + chenPronouns.her + chenPronouns.he + chenPronouns.his
            },
            yuen: {
                gender: yuenGender,
                pronouns: yuenGender === 'female' ? 'she/her' : 'he/him',
                evidenceCount: yuenPronouns.she + yuenPronouns.her + yuenPronouns.he + yuenPronouns.his
            }
        };

        console.log('📖 Character Compendium:', this.characterCompendium);
    }

    // Phase 2: Send roll result for narrative continuation
    async sendRollResult(setup, rollRequest, rollResult) {
        console.log('🎲 Phase 2: Sending roll result to server');

        try {
            const response = await fetch('/dnd-api/dnd/roll-result', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    setup: setup,
                    rollRequest: rollRequest,
                    rollResult: rollResult,
                    sessionId: 'main-campaign'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('🎲 Phase 2 response received:', data);

            if (data.success) {
                return {
                    type: 'narrative',
                    narrative: data.narrative
                };
            } else {
                throw new Error('Roll result processing failed');
            }

        } catch (error) {
            console.error('❌ Phase 2 error:', error);
            return {
                type: 'narrative',
                narrative: 'Something went wrong processing the roll result. Please try again.'
            };
        }
    }

    showRateLimitModal() {
        // Create modal if it doesn't exist
        let modal = document.getElementById('rate-limit-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'rate-limit-modal';
            modal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1e 100%);
                border: 3px solid #ff00ff;
                border-radius: 15px;
                padding: 30px;
                z-index: 10000;
                box-shadow: 0 0 30px rgba(255, 0, 255, 0.5);
                text-align: center;
                min-width: 300px;
            `;
            modal.innerHTML = `
                <div style="color: #00ffff; font-size: 24px; margin-bottom: 15px;">⚠️ Rate Limit</div>
                <div style="color: #ffffff; font-size: 16px; margin-bottom: 20px;">
                    Too many requests! Please wait 10 seconds before sending another message.
                </div>
                <button onclick="document.getElementById('rate-limit-modal').style.display='none'"
                        style="background: #ff00ff; color: white; border: none; padding: 10px 30px;
                               font-size: 16px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    OK
                </button>
            `;
            document.body.appendChild(modal);
        }
        modal.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            modal.style.display = 'none';
        }, 5000);
    }
}

// Global instance
window.claudeAPI = new ClaudeAPIHandler();