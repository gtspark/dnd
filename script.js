// D&D Campaign Manager - Frontend JavaScript v1758434942
console.log('🎲 Claude DM: Initializing adventure with Claude API... v1758434942');

// Clear any old cached data on version update
const version = '1761032406';
const storedVersion = localStorage.getItem('app_version');
if (storedVersion !== version) {
    localStorage.clear();
    localStorage.setItem('app_version', version);
    console.log('🧹 Cleared cache for new version');
}

class DNDCampaign {
    constructor() {
        this.character = this.loadCharacter();
        this.campaignState = this.loadCampaignState();
        this.sessionId = this.generateSessionId();
        this.currentMode = 'ic'; // Default to in-character mode
        this.partyData = {}; // Store synced data for all party members
        this.init();
    }

    async init() {
        this.bindEvents();
        this.loadFromURL();
        this.updateCharacterDisplay();
        this.setupModals();
        this.switchInventoryTab('dax'); // Initialize with Dax's inventory
        // Restore adventure log from enhanced server with error handling
        try {
            await this.loadGameLog();
            console.log('✅ Game log loaded successfully');
        } catch (error) {
            console.error('❌ Error loading game log:', error);
            // Clear corrupted log data
            localStorage.removeItem('dnd_game_log');
        }

        // Initialize Claude API
        try {
            await window.claudeAPI.initialize();
            console.log('⚔️ Claude DM: Ready for adventure with Claude API!');
        } catch (error) {
            console.error('Failed to initialize Claude API:', error);
            this.addLogEntry('dm', '⚠️ Error: Could not connect to Claude API. Please check your internet connection.');
        }

        // Initial sync with DM (silent)
        try {
            await this.syncWithDM(true);
            console.log('🔄 Initial DM sync completed');
        } catch (error) {
            console.error('❌ Initial sync failed:', error);
        }

        // Start auto-sync polling every 30 seconds
        this.startAutoSync();

        // Hide loading screen
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
            }, 500);
        }
    }

    startAutoSync() {
        // Clear any existing sync interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        // Set up 30-second polling
        this.syncInterval = setInterval(async () => {
            try {
                await this.syncWithDM(true); // Silent sync
            } catch (error) {
                console.error('❌ Auto-sync failed:', error);
            }
        }, 30000); // 30 seconds

        console.log('🔄 Auto-sync started (30 second intervals)');
    }

    bindEvents() {
        // Send action button
        const sendBtn = document.getElementById('send-btn');
        const playerInput = document.getElementById('player-input');

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendPlayerAction());
        }
        if (playerInput) {
            playerInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    this.sendPlayerAction();
                }
            });
        }

        // Mode selector buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.setMode(mode);
            });
        });

        // Character creation
        const editCharacterBtn = document.getElementById('edit-character-btn');
        if (editCharacterBtn) {
            editCharacterBtn.addEventListener('click', () => this.showCharacterModal());
        }

        // Quick actions
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.useQuickAction(action);
            });
        });

        // Inventory slots
        document.querySelectorAll('.inventory-slot').forEach(slot => {
            slot.addEventListener('click', (e) => {
                const item = e.currentTarget.dataset.item;
                this.useItem(item);
            });
        });

        // Sandbox toggle
        const sandboxToggle = document.getElementById('sandbox-toggle');
        if (sandboxToggle) {
            sandboxToggle.addEventListener('click', async () => {
                try {
                    await window.claudeAPI.toggleSandboxMode();
                    this.addLogEntry('system', window.claudeAPI.config.sandbox_mode ?
                        '🧪 Switched to SANDBOX mode - safe for testing!' :
                        '🎯 Switched to LIVE mode - real campaign progress!');
                } catch (error) {
                    console.error('Error toggling sandbox mode:', error);
                    this.addLogEntry('system', '❌ Error switching modes. Please refresh the page.');
                }
            });
        }

        // Character preset selector
        const characterSelector = document.getElementById('character-preset');
        if (characterSelector) {
            characterSelector.addEventListener('change', (e) => {
                const preset = e.target.value;
                if (preset) {
                    this.loadCharacterPreset(preset);
                }
            });
        }

        // Sync button
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => this.syncWithDM());
        }

        // Back to splash button
        const backBtn = document.getElementById('back-to-splash');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.location.href = '/dnd/';
            });
        }

        // Settings button
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.showAIProviderModal());
        }

        // Help/About button
        const helpBtn = document.getElementById('help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                const aboutModal = document.getElementById('about-modal');
                if (aboutModal) {
                    aboutModal.classList.remove('hidden');
                    aboutModal.classList.add('active');
                    console.log('📖 About modal opened');
                } else {
                    console.error('❌ About modal not found');
                }
            });
        }

        // Party member tabs
        document.querySelectorAll('.party-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const character = e.target.dataset.character;
                if (character) {
                    this.switchPartyMember(character);
                }
            });
        });

        // Skill check and combat buttons with event delegation
        const self = this;
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('skill-btn')) {
                const skill = e.target.dataset.skill;
                if (skill) {
                    self.rollSkillCheck(skill);
                }
            } else if (e.target.classList.contains('combat-btn')) {
                const action = e.target.dataset.action;
                if (action) {
                    self.performCombatAction(action);
                }
            }
        });


        // Section tabs (Party Inventory / Ship Status)
        document.querySelectorAll('.section-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Update tab active state
                document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                // Show corresponding content
                const section = e.target.dataset.section;
                document.querySelectorAll('.section-content').forEach(content => {
                    content.style.display = 'none';
                    content.classList.remove('active');
                });

                const targetSection = document.getElementById(`${section}-section`);
                if (targetSection) {
                    targetSection.style.display = 'block';
                    targetSection.classList.add('active');
                }
            });
        });

        // Inventory management
        document.querySelectorAll('.inv-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchInventoryTab(e.target.dataset.character);
            });
        });

        const addItemBtn = document.getElementById('add-item-btn');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => this.addItem());
        }

        // Campaign notes auto-save with debounce
        const notesTextarea = document.getElementById('notes');
        if (notesTextarea) {
            let saveTimeout;
            notesTextarea.addEventListener('input', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    localStorage.setItem('dnd_campaign_notes', notesTextarea.value);
                    console.log('📝 Campaign notes auto-saved');
                }, 500); // Save 500ms after user stops typing
            });

            // Load saved notes
            const savedNotes = localStorage.getItem('dnd_campaign_notes');
            if (savedNotes) {
                notesTextarea.value = savedNotes;
            }
        }
    }

    setMode(mode) {
        // Update current mode
        this.currentMode = mode;

        // Update active button styling
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        console.log(`🎭 Message mode switched to: ${mode.toUpperCase()}`);
    }

    async sendPlayerAction() {
        const input = document.getElementById('player-input');
        const action = input.value.trim();

        if (!action) return;

        // Check if API is initialized
        if (!window.claudeAPI.isInitialized) {
            this.addLogEntry('system', '⚠️ Claude API is still initializing... Please wait a moment and try again.');
            return;
        }

        // Add player's action to log with current mode
        this.addLogEntry('player', action, false, this.currentMode);
        input.value = '';

        // Show loading state
        this.showLoadingState();

        try {
            // Send to Claude DM backend with current mode
            const response = await this.sendToClaude(action, this.currentMode);

            // Add DM response to log (only if not empty) with current mode
            if (response.message && response.message.trim()) {
                this.addLogEntry('dm', response.message, false, this.currentMode);
            }

            // Handle any game state updates
            if (response.updates) {
                this.handleGameUpdates(response.updates);
            }

            // Sync with DM after message to get any state changes
            setTimeout(async () => {
                try {
                    await this.syncWithDM(true); // Silent sync after action
                } catch (error) {
                    console.error('❌ Post-action sync failed:', error);
                }
            }, 1000); // Small delay to let server process

        } catch (error) {
            console.error('Failed to get DM response:', error);
            this.addLogEntry('dm', 'The mystical forces seem to be disrupted... Please try again in a moment.');
        } finally {
            this.hideLoadingState();
        }
    }

    async sendToClaude(action, mode = 'ic') {
        // Use Claude API instead of backend, passing mode parameter
        const response = await window.claudeAPI.sendMessage(action, mode);

        if (response.type === 'roll_request') {
            // Handle roll request - handleRollRequest already displays the narrative
            this.handleRollRequest(response.rollRequest, response.narrative, mode);
            return { message: '' }; // Empty message since handleRollRequest already displayed it
        } else {
            // Regular narrative response
            return { message: response.narrative };
        }
    }

    handleRollRequest(rollRequest, narrative, mode = 'ic') {
        // Display the narrative first with mode
        this.addLogEntry('dm', narrative, false, mode);

        // Parse the roll request
        const rollDetails = window.claudeAPI.parseRollRequest(rollRequest);

        // Show roll UI
        this.showRollPrompt(rollDetails, rollRequest);
    }

    showRollPrompt(rollDetails, fullRequest) {
        // Create roll prompt in the game log
        const escapedRequest = fullRequest.replace(/'/g, "\\'").replace(/"/g, '\\"');
        const rollHtml = `
            <div class="roll-prompt" data-roll-request="${escapedRequest}">
                <div class="roll-request-text">
                    🎲 <strong>Roll ${rollDetails.skill}${rollDetails.dc ? ` (DC ${rollDetails.dc})` : ''}</strong>
                    <br>to ${rollDetails.description}
                </div>
                <div class="roll-buttons">
                    <button class="btn-dice roll-d20" onclick="game.rollForRequest('d20', '${escapedRequest}')">🎲 Roll d20</button>
                    <button class="btn-secondary roll-with-modifier" onclick="game.rollWithModifier('${escapedRequest}')">Roll with Modifier</button>
                </div>
            </div>
        `;

        const gameLog = document.getElementById('game-log');
        gameLog.insertAdjacentHTML('beforeend', rollHtml);
        gameLog.scrollTop = gameLog.scrollHeight;
    }

    async rollForRequest(diceType, rollRequest) {
        // Check for advantage/disadvantage
        const hasAdvantage = rollRequest.toLowerCase().includes('with advantage');
        const hasDisadvantage = rollRequest.toLowerCase().includes('with disadvantage');

        let rollResult;
        let rollDetails = '';

        if (hasAdvantage || hasDisadvantage) {
            // Roll 2d20, take higher for advantage or lower for disadvantage
            const roll1 = this.calculateDiceRoll(diceType);
            const roll2 = this.calculateDiceRoll(diceType);

            if (hasAdvantage) {
                rollResult = Math.max(roll1.total, roll2.total);
                rollDetails = ` (Advantage: ${roll1.total}, ${roll2.total})`;
            } else {
                rollResult = Math.min(roll1.total, roll2.total);
                rollDetails = ` (Disadvantage: ${roll1.total}, ${roll2.total})`;
            }
        } else {
            // Normal single roll
            const diceResult = this.calculateDiceRoll(diceType);
            rollResult = diceResult.total;
        }

        const modifier = this.getSkillModifier(rollRequest);
        const equipmentBonus = this.getEquipmentBonus(rollRequest);
        const statusEffectPenalty = this.getStatusEffectPenalty(rollRequest);

        const totalModifier = modifier + equipmentBonus - statusEffectPenalty;
        const total = rollResult + totalModifier;

        // Build modifier breakdown
        let modifierBreakdown = '';
        if (modifier !== 0) modifierBreakdown += `${modifier >= 0 ? '+' : ''}${modifier}`;
        if (equipmentBonus > 0) modifierBreakdown += `+${equipmentBonus} (equipment)`;
        if (statusEffectPenalty > 0) modifierBreakdown += `-${statusEffectPenalty} (status)`;

        // Format roll result message
        const rollMessage = `${rollRequest}: ${total} (rolled ${rollResult}${rollDetails}${modifierBreakdown ? ' ' + modifierBreakdown : ''})`;

        // Add to roll history
        this.addToRollHistory({
            skill: this.extractSkillFromRequest(rollRequest),
            roll: rollResult,
            total: total,
            modifier: totalModifier,
            advantage: hasAdvantage,
            disadvantage: hasDisadvantage,
            timestamp: new Date()
        });

        // Remove the roll prompt
        document.querySelector('.roll-prompt')?.remove();

        // Add roll result to log
        this.addLogEntry('player', `🎲 ${rollMessage}`);

        // Send roll result back to Claude
        try {
            this.showLoadingState();
            console.log('🎲 Sending roll result to Claude:', rollMessage);
            const response = await window.claudeAPI.sendMessage(rollMessage, true);
            console.log('🎲 Claude response received:', response);

            if (response && response.narrative) {
                this.addLogEntry('dm', response.narrative);
                console.log('🎲 Added DM response to log');
            } else {
                console.error('🎲 No narrative in response:', response);
                this.addLogEntry('dm', 'DM response received but could not display. Check console for details.');
            }
        } catch (error) {
            console.error('Error sending roll result:', error);
            this.addLogEntry('dm', 'The mystical forces seem disrupted... Please try your roll again.');
        } finally {
            this.hideLoadingState();
        }
    }

    getSkillModifier(rollRequest) {
        // Extract ability score and skill from roll request format: "Roll Skill (Ability) (DC X) to..."
        const abilityMatch = rollRequest.match(/\(([^)]+)\)\s*\(DC/i);
        const skillMatch = rollRequest.match(/Roll\s+(.+?)\s+\(/i);

        let abilityModifier = 0;
        let proficiencyBonus = 0;

        // Get base ability modifier
        if (abilityMatch) {
            const ability = abilityMatch[1].toLowerCase();
            if (ability.includes('intelligence') || ability.includes('int')) abilityModifier = 3;
            else if (ability.includes('dexterity') || ability.includes('dex')) abilityModifier = 4;
            else if (ability.includes('wisdom') || ability.includes('wis')) abilityModifier = 1;
            else if (ability.includes('constitution') || ability.includes('con')) abilityModifier = 0;
            else if (ability.includes('strength') || ability.includes('str')) abilityModifier = -1;
            else if (ability.includes('charisma') || ability.includes('cha')) abilityModifier = 0;
        }

        // Determine proficiency based on character background and skill
        const skill = (skillMatch ? skillMatch[1] : rollRequest).toLowerCase();
        const characterName = this.character.name || '';

        // Dax (Tech Specialist) expertise
        if (characterName.includes('Dax')) {
            if (skill.includes('technology') || skill.includes('hacking') || skill.includes('engineering') ||
                skill.includes('electronics') || skill.includes('computer') || skill.includes('tech')) {
                proficiencyBonus = 4; // Expertise (double proficiency)
            } else if (skill.includes('stealth') || skill.includes('perception') || skill.includes('investigation')) {
                proficiencyBonus = 2; // Proficient
            }
        }
        // Chen (Engineer) expertise
        else if (characterName.includes('Chen')) {
            if (skill.includes('engineering') || skill.includes('technology') || skill.includes('repair') ||
                skill.includes('mechanical') || skill.includes('tech')) {
                proficiencyBonus = 4; // Expertise
            } else if (skill.includes('athletics') || skill.includes('intimidation')) {
                proficiencyBonus = 2; // Proficient
            }
        }
        // Dr. Yuen (Medical) expertise
        else if (characterName.includes('Yuen')) {
            if (skill.includes('medicine') || skill.includes('medical') || skill.includes('biology') ||
                skill.includes('xenobiology') || skill.includes('biochemistry')) {
                proficiencyBonus = 4; // Expertise
            } else if (skill.includes('investigation') || skill.includes('insight') || skill.includes('nature')) {
                proficiencyBonus = 2; // Proficient
            }
        }

        // Only use fallback if new format parsing failed
        if (!abilityMatch) {
            // Legacy skill-based detection for older roll formats
            if (skill.includes('technology') || skill.includes('hacking') || skill.includes('tech')) abilityModifier = 3;
            else if (skill.includes('athletics') || skill.includes('climb') || skill.includes('jump')) abilityModifier = -1;
            else if (skill.includes('acrobatics') || skill.includes('stealth') || skill.includes('sleight')) abilityModifier = 4;
            else if (skill.includes('medicine') || skill.includes('medical') || skill.includes('perception')) abilityModifier = 1;
            else if (skill.includes('persuasion') || skill.includes('deception') || skill.includes('intimidation')) abilityModifier = 0;
            else if (skill.includes('intelligence') || skill.includes('int')) abilityModifier = 3;
            else if (skill.includes('dexterity') || skill.includes('dex')) abilityModifier = 4;
            else if (skill.includes('wisdom') || skill.includes('wis')) abilityModifier = 1;
            else if (skill.includes('constitution') || skill.includes('con')) abilityModifier = 0;
            else if (skill.includes('strength') || skill.includes('str')) abilityModifier = -1;
            else if (skill.includes('charisma') || skill.includes('cha')) abilityModifier = 0;
        }

        return abilityModifier + proficiencyBonus;
    }

    getEquipmentBonus(rollRequest) {
        // Check character inventory for relevant equipment bonuses
        const skill = rollRequest.toLowerCase();
        const inventory = this.character.inventory || [];
        let bonus = 0;

        // Check for equipment that provides bonuses (specific to skill type)
        inventory.forEach(item => {
            const itemLower = item.toLowerCase();

            // Technology/Hacking equipment (only tech-specific items)
            if (skill.includes('technology') || skill.includes('hacking') || skill.includes('tech')) {
                if (itemLower.includes('multi-tool') || itemLower.includes('computer') || itemLower.includes('hacking kit')) {
                    bonus += 2;
                }
                // Medical scanner can help with tech checks but only if it's specifically a tech-enhanced scanner
                else if (itemLower.includes('scanner') && itemLower.includes('medical') && itemLower.includes('enhanced')) {
                    bonus += 1; // Reduced bonus for medical scanner on tech checks
                }
            }

            // Medical equipment (only medical-specific items)
            else if (skill.includes('medicine') || skill.includes('medical')) {
                if (itemLower.includes('medical') || itemLower.includes('supplies') || itemLower.includes('kit')) {
                    bonus += 2;
                }
                // Medical scanners are full bonus for medical checks
                else if (itemLower.includes('scanner') && itemLower.includes('medical')) {
                    bonus += 2;
                }
            }

            // Engineering/Repair equipment (only engineering-specific items)
            else if (skill.includes('engineering') || skill.includes('repair')) {
                if (itemLower.includes('tool') || itemLower.includes('wrench') || itemLower.includes('torch')) {
                    bonus += 2;
                }
            }
        });

        return Math.min(bonus, 4); // Cap at +4 equipment bonus
    }

    getStatusEffectPenalty(rollRequest) {
        // Check for status effects that impose penalties
        const statusEffects = this.character.statusEffects || [];
        let penalty = 0;

        statusEffects.forEach(effect => {
            switch(effect.type) {
                case 'injured':
                    penalty += 2; // General injury penalty
                    break;
                case 'exhausted':
                    penalty += 1; // Fatigue penalty
                    break;
                case 'poisoned':
                    penalty += 3; // Poison penalty
                    break;
                case 'distracted':
                    penalty += 1; // Concentration penalty
                    break;
            }
        });

        return penalty;
    }

    extractSkillFromRequest(rollRequest) {
        // Extract skill name from "Roll SkillName (Ability) (DC X)" format
        const match = rollRequest.match(/Roll\s+(.+?)\s+\(/i);
        return match ? match[1].trim() : 'Unknown';
    }

    addToRollHistory(rollData) {
        // Initialize roll history if it doesn't exist
        if (!this.rollHistory) {
            this.rollHistory = [];
        }

        // Add the roll
        this.rollHistory.push(rollData);

        // Keep only last 20 rolls
        if (this.rollHistory.length > 20) {
            this.rollHistory = this.rollHistory.slice(-20);
        }

        // Save to localStorage
        localStorage.setItem('dnd_roll_history', JSON.stringify(this.rollHistory));

        // Update UI
        this.updateRollHistoryDisplay();
    }

    getRecentRolls(count = 5) {
        if (!this.rollHistory) {
            this.rollHistory = JSON.parse(localStorage.getItem('dnd_roll_history') || '[]');
        }
        return this.rollHistory.slice(-count);
    }

    addStatusEffect(type, description, duration = null) {
        if (!this.character.statusEffects) {
            this.character.statusEffects = [];
        }

        this.character.statusEffects.push({
            type: type,
            description: description,
            duration: duration,
            timestamp: new Date()
        });

        this.saveCharacter();
        this.updateCharacterDisplay();
        this.addLogEntry('system', `⚠️ Status Effect: ${description}`);
    }

    removeStatusEffect(type) {
        if (!this.character.statusEffects) return;

        this.character.statusEffects = this.character.statusEffects.filter(effect => effect.type !== type);
        this.saveCharacter();
        this.updateCharacterDisplay();
        this.addLogEntry('system', `✅ Status Effect Removed: ${type}`);
    }

    getActiveStatusEffects() {
        return this.character.statusEffects || [];
    }

    updateRollHistoryDisplay() {
        const historyList = document.getElementById('roll-history-list');
        if (!historyList) return;

        const recentRolls = this.getRecentRolls(5);

        if (recentRolls.length === 0) {
            historyList.innerHTML = '<div class="roll-history-empty">No recent rolls</div>';
            return;
        }

        historyList.innerHTML = recentRolls.reverse().map(roll => {
            const time = new Date(roll.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const advantageIcon = roll.advantage ? '📈' : roll.disadvantage ? '📉' : '';
            const dcResult = roll.total >= 15 ? '✅' : roll.total >= 10 ? '⚠️' : '❌'; // Rough success indicator

            return `
                <div class="roll-history-item">
                    <div class="roll-summary">
                        <span class="roll-skill">${roll.skill}</span>
                        <span class="roll-result">${dcResult} ${roll.total}</span>
                        ${advantageIcon}
                    </div>
                    <div class="roll-details">
                        ${time} - d20: ${roll.roll}, mod: ${roll.modifier >= 0 ? '+' : ''}${roll.modifier}
                    </div>
                </div>
            `;
        }).join('');
    }

    clearRollHistory() {
        this.rollHistory = [];
        localStorage.removeItem('dnd_roll_history');
        this.updateRollHistoryDisplay();
        this.addLogEntry('system', '🗑️ Roll history cleared');
    }

    saveLogEntry(author, content, mode = null) {
        const logEntry = {
            author: author,
            content: content,
            timestamp: new Date().toISOString(),
            characterName: this.character.name || 'Player',
            mode: mode  // Store the message mode
        };

        // Get existing log or initialize
        let gameLogEntries = JSON.parse(localStorage.getItem('dnd_game_log') || '[]');

        // Add new entry
        gameLogEntries.push(logEntry);

        // Keep only last 100 entries to prevent localStorage bloat
        if (gameLogEntries.length > 100) {
            gameLogEntries = gameLogEntries.slice(-100);
        }

        // Save back to localStorage
        localStorage.setItem('dnd_game_log', JSON.stringify(gameLogEntries));
    }

    async loadGameLog() {
        console.log('🔄 Loading game log...');
        const gameLog = document.getElementById('game-log');
        if (!gameLog) {
            console.error('❌ Game log element not found');
            return;
        }

        let logEntries = [];
        try {
            // First try to load from enhanced server
            const response = await fetch('./conversation-history.json');
            if (response.ok) {
                const serverConversation = await response.json();
                // Convert enhanced server format to game log format
                logEntries = serverConversation.map(entry => ({
                    author: entry.role === 'player' ? 'player' : 'dm',
                    content: entry.content,
                    timestamp: entry.timestamp
                }));
                console.log(`📝 Loaded ${logEntries.length} entries from enhanced server`);
            } else {
                throw new Error('Enhanced server conversation not available');
            }
        } catch (error) {
            console.log('📝 Falling back to localStorage:', error);
            try {
                const stored = localStorage.getItem('dnd_game_log');
                logEntries = stored ? JSON.parse(stored) : [];
                console.log(`📝 Found ${logEntries.length} localStorage entries`);
            } catch (storageError) {
                console.error('❌ Error parsing stored log entries:', storageError);
                localStorage.removeItem('dnd_game_log');
                return;
            }
        }

        // Clear existing log
        gameLog.innerHTML = '';

        // Add starter content FIRST if log is empty or only has system messages
        const nonSystemEntries = logEntries.filter(entry => entry.author !== 'system');
        if (nonSystemEntries.length === 0) {
            // Check sandbox mode - use saved preference first, then fallbacks
            const savedMode = localStorage.getItem('dnd_sandbox_mode');
            const claudeAPIMode = window.claudeAPI?.config?.sandbox_mode;
            const titleSandbox = document.title.includes('SANDBOX');

            console.log('🔍 Mode detection:', {
                savedMode,
                claudeAPIMode,
                titleSandbox,
                totalEntries: logEntries.length,
                nonSystemEntries: nonSystemEntries.length
            });

            // Use saved preference if available, otherwise default to sandbox
            let isSandbox;
            if (savedMode !== null) {
                isSandbox = JSON.parse(savedMode);
                console.log(`📱 Using saved preference: ${isSandbox ? 'SANDBOX' : 'LIVE'}`);
            } else {
                isSandbox = claudeAPIMode !== false; // Default to sandbox if unclear
                console.log(`🔧 Using fallback: ${isSandbox ? 'SANDBOX' : 'LIVE'}`);
            }

            if (isSandbox) {
                // Add sandbox starter content immediately to maintain layout
                this.addLogEntry('system', '🧪 **SANDBOX MODE** - Testing campaign features and improvements', true);
                this.addLogEntry('dm', 'Welcome to the Titan Station campaign testing environment! This is where we test new features before continuing the main storyline. Try sending an action to test the improved roll system with expertise bonuses, advantage/disadvantage, and equipment bonuses.', true);
            } else {
                // Add live campaign starter content
                this.addLogEntry('system', '🚀 **LIVE CAMPAIGN** - Titan Station Crisis continues', true);
                this.addLogEntry('dm', `Intelligence check: 22 (Critical Success!)

The name Osprey triggers a cascade of memories - spacer rumors, hushed conversations in stations bars, and one very specific incident.

"Osprey Security Solutions," you say slowly. "They were behind the Ceres Mining whistleblower disappearance three years ago. The pattern's identical - surveillance first, escalating pressure, then the witness vanished during a 'transport malfunction.' They also worked the Proxima bioweapons coverup."

Your lower arms gesture as you recall more details. "They have a signature method - they prefer to make problems disappear legally first. Discredit witnesses, find leverage, force compliance. But if that fails within 48 hours, they shift to direct action."

"48 hours?" Yuen asks.

"Corporate attention span," you explain. "After two days, board members start asking questions about expenses. Osprey promises resolution within that window, one way or another."

Torres nods grimly. "That matches our intelligence. You know their founder?"

"Marcus 'Talon' Reeves. Ex-special forces, dishonorably discharged for excessive force during the Europa uprising. Started Osprey with other discharged military." You pause, remembering another detail. "They have a saying: 'Every problem has a price point.' Meaning they'll do anything if paid enough."

Chen pales. "And Weyland has very deep pockets."

"There's something else," you continue, the memory crystallizing. "Osprey always runs two-person cells for witness intimidation. One visible operative making threats, one invisible backup ready for extraction. If they sent that message, there's another operative we haven't seen yet."

Torres immediately activates her comm. "All units, assume two-person Osprey cell on station. Begin sweep for second operative."

"The drone wasn't just surveillance," you realize. "It was marking our location for the extraction team. They know exactly where we were, our sleep patterns, when we're most vulnerable."

Holbrook's image flickers on the screen again. "Mr. Stargazer's intelligence is invaluable. I'm declaring a station-wide security alert. All dock departures frozen for 24 hours."

"That'll trap their extraction team here," Torres observes.

"Or they're already planning to leave another way," you counter. "Osprey sometimes uses maintenance shuttles, emergency pods. Anything not monitored by standard dock control."

The weight of what you're facing settles over the room. This isn't just corporate intimidation anymore - it's professional killers with military training and unlimited resources.

"0600 meeting is in three hours," Yuen says quietly. "Should we try to sleep?"

**What does Dax do?**`, true);
            }
        } else {
            // Restore existing entries
            logEntries.forEach((entry, index) => {
                try {
                    this.restoreLogEntry(entry);
                } catch (error) {
                    console.error(`❌ Error restoring log entry ${index}:`, error);
                }
            });
        }

        gameLog.scrollTop = gameLog.scrollHeight;
        console.log('✅ Game log restoration complete');
    }

    restoreLogEntry(logEntry) {
        // Use addLogEntry with skipSave=true to avoid re-saving restored entries
        if (!logEntry || !logEntry.author || !logEntry.content) {
            console.warn('⚠️ Invalid log entry:', logEntry);
            return;
        }

        try {
            this.addLogEntry(logEntry.author, logEntry.content, true, logEntry.mode);
        } catch (error) {
            console.error('❌ Error in restoreLogEntry:', error);
            throw error;
        }
    }

    clearGameLog() {
        localStorage.removeItem('dnd_game_log');
        const gameLog = document.getElementById('game-log');
        gameLog.innerHTML = '';
        this.addLogEntry('system', '🗑️ Adventure log cleared');
    }

    addLogEntry(author, content, skipSave = false, mode = null) {
        const gameLog = document.getElementById('game-log');
        const entry = document.createElement('div');
        entry.className = `log-entry ${author}-entry`;

        // Apply mode-specific styling if mode is provided
        if (mode) {
            entry.setAttribute('data-mode', mode);
        }

        let authorName, authorClass;
        if (author === 'dm') {
            authorName = '🎭 Dungeon Master';
            authorClass = 'dm-author';
        } else if (author === 'system') {
            authorName = '⚙️ System';
            authorClass = 'system-author';
        } else {
            authorName = `👤 ${this.character.name || 'Player'}`;
            authorClass = 'player-author';
        }

        // Check for roll requests in DM messages
        let entryContent;
        if (author === 'dm' && content.includes('🎲')) {
            console.log('=== DICE ROLL DEBUG IN SCRIPT.JS ===');
            console.log('Raw content received:', content);
            console.log('Content length:', content.length);
            console.log('Contains newlines:', content.includes('\n'));

            // Try new clean format first: "🎲 Roll Persuasion (DC 12) to convince Torres"
            let rollMatch = content.match(/🎲 Roll (.+?) \(DC (\d+)\) to (.+?)(?=\n|$)/i);
            console.log('Clean format match:', rollMatch);
            let rollRequest, narrative;

            if (rollMatch) {
                rollRequest = `Roll ${rollMatch[1]} (DC ${rollMatch[2]}) to ${rollMatch[3]}`;
                narrative = content.replace(/🎲 Roll .+? \(DC \d+\) to .+?(?=\n|$)/i, '').trim();
            } else {
                // Try broken format: "🎲 Roll Unknown\nto Technology"
                rollMatch = content.match(/🎲 Roll Unknown[\s\n]*to\s+(.+?)(?=\n|$)/i);
                if (rollMatch) {
                    rollRequest = `Roll ${rollMatch[1]} to hack the door`;
                    narrative = content.replace(/🎲 Roll Unknown[\s\n]*to\s+.+?(?=\n|$)/i, '').trim();
                } else {
                    // Fallback to old format: "🎲 ROLL NEEDED:"
                    rollMatch = content.match(/🎲 ROLL NEEDED:\s*(.+?)(?=\n|$)/);
                    if (rollMatch) {
                        rollRequest = rollMatch[1].trim();
                        narrative = content.replace(/🎲 ROLL NEEDED:\s*.+?(?=\n|$)/, '').trim();
                    }
                }
            }

            if (rollMatch) {

                console.log('🎲 Detected roll request in addLogEntry:', rollRequest);

                // Parse roll details
                const rollDetails = window.claudeAPI ? window.claudeAPI.parseRollRequest(rollRequest) : {
                    skill: 'Unknown',
                    dc: null,
                    description: rollRequest
                };

                const escapedRequest = rollRequest.replace(/'/g, "\\'");

                entryContent = `
                    <p>${this.formatMessage(narrative)}</p>
                    <div class="roll-prompt">
                        <div class="roll-info">
                            🎲 <strong>Roll ${rollDetails.skill}${rollDetails.dc ? ` (DC ${rollDetails.dc})` : ''}</strong>${rollDetails.description ? ` ${rollDetails.description}` : ''}
                        </div>
                        <div class="roll-actions">
                            <button class="btn-dice roll-d20" onclick="game.rollForRequest('d20', '${escapedRequest}')">🎲 Roll d20</button>
                        </div>
                    </div>
                `;
            } else {
                entryContent = `<p>${this.formatMessage(content)}</p>`;
            }
        } else {
            entryContent = `<p>${this.formatMessage(content)}</p>`;
        }

        entry.innerHTML = `
            <div class="entry-header">
                <span class="entry-author ${authorClass}">${authorName}</span>
                <span class="entry-time">${this.formatTime(new Date())}</span>
            </div>
            <div class="entry-content">
                ${entryContent}
            </div>
        `;

        gameLog.appendChild(entry);
        gameLog.scrollTop = gameLog.scrollHeight;

        // Save log entry to localStorage (unless restoring from storage)
        if (!skipSave) {
            try {
                this.saveLogEntry(author, content, mode);
            } catch (error) {
                console.error('❌ Error saving log entry:', error);
            }
        }
    }

    formatMessage(content) {
        // Convert basic markdown-style formatting
        // IMPORTANT: Preserve dice roll formatting by protecting it first
        const diceRollPattern = /🎲 Roll [^🎲]+/g;
        const diceRolls = content.match(diceRollPattern) || [];
        let protectedContent = content;

        // Replace dice rolls with placeholders
        diceRolls.forEach((roll, index) => {
            protectedContent = protectedContent.replace(roll, `DICE_ROLL_PLACEHOLDER_${index}`);
        });

        // Apply formatting to protected content
        let formatted = protectedContent
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '</p><p>');

        // Restore dice rolls
        diceRolls.forEach((roll, index) => {
            formatted = formatted.replace(`DICE_ROLL_PLACEHOLDER_${index}`, roll);
        });

        return formatted;
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    showLoadingState() {
        const sendBtn = document.getElementById('send-btn');
        sendBtn.disabled = true;
        sendBtn.textContent = 'Consulting the DM...';

        // Add a temporary loading entry
        const gameLog = document.getElementById('game-log');
        const loadingEntry = document.createElement('div');
        loadingEntry.className = 'log-entry dm-entry loading-entry';
        loadingEntry.innerHTML = `
            <div class="entry-header">
                <span class="entry-author dm-author">🎭 Dungeon Master</span>
                <span class="entry-time">${this.formatTime(new Date())}</span>
            </div>
            <div class="entry-content">
                <p><em>The DM considers your action...</em></p>
            </div>
        `;
        gameLog.appendChild(loadingEntry);
        gameLog.scrollTop = gameLog.scrollHeight;
    }

    hideLoadingState() {
        const sendBtn = document.getElementById('send-btn');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Action';

        // Remove loading entry
        const loadingEntry = document.querySelector('.loading-entry');
        if (loadingEntry) {
            loadingEntry.remove();
        }
    }

    useQuickAction(action) {
        const input = document.getElementById('player-input');
        const actionTemplates = {
            'attack': 'I attack with my weapon!',
            'investigate': 'I carefully investigate the area around me.',
            'persuade': 'I attempt to persuade them with my words.',
            'sneak': 'I try to move stealthily and avoid detection.',
            'cast-spell': 'I cast a spell (specify which spell).',
            'help': 'I try to help my party member.'
        };

        input.value = actionTemplates[action] || `I attempt to ${action}.`;
        input.focus();
    }

    useItem(item) {
        const input = document.getElementById('player-input');
        const itemActions = {
            'longsword': 'I draw my longsword and prepare to fight.',
            'shield': 'I raise my shield defensively.',
            'healing-potion': 'I drink a healing potion to restore my health.'
        };

        input.value = itemActions[item] || `I use my ${item}.`;
        input.focus();
    }

    // Dice Rolling System
    calculateDiceRoll(expression) {
        // Parse dice expressions like "2d6+3", "d20", "1d8-1"
        const match = expression.toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);

        if (!match) {
            // Try to parse as simple number
            const num = parseInt(expression);
            if (!isNaN(num)) {
                return { total: num, rolls: [num] };
            }
            return { total: 1, rolls: [1] }; // Default fallback
        }

        const numDice = parseInt(match[1]) || 1;
        const diceSize = parseInt(match[2]);
        const modifier = match[3] ? parseInt(match[3]) : 0;

        const rolls = [];
        for (let i = 0; i < numDice; i++) {
            rolls.push(Math.floor(Math.random() * diceSize) + 1);
        }

        const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier;

        return { total, rolls };
    }

    // Character Management
    showCharacterModal() {
        const modal = document.getElementById('character-modal');
        modal.classList.remove('hidden');

        // Populate form with current character data
        if (this.character.name) {
            document.getElementById('char-name').value = this.character.name;
            document.getElementById('char-level').value = this.character.level;
            document.getElementById('char-race').value = this.character.race;
            document.getElementById('char-class').value = this.character.class;

            // Populate ability scores
            Object.keys(this.character.abilities || {}).forEach(ability => {
                const input = document.getElementById(`${ability.toLowerCase()}-input`);
                if (input) {
                    input.value = this.character.abilities[ability];
                }
            });
        }
    }

    // AI Provider Management
    async showAIProviderModal() {
        const modal = document.getElementById('ai-provider-modal');
        modal.classList.remove('hidden');

        // Load current provider status
        await this.loadAIProviderStatus();
    }

    async loadAIProviderStatus() {
        try {
            const response = await fetch('/dnd/api/dnd/ai-provider');
            const data = await response.json();

            // Update radio button selection
            const currentProvider = data.current;
            const radioButton = document.querySelector(`input[name="ai-provider"][value="${currentProvider}"]`);
            if (radioButton) {
                radioButton.checked = true;
            }

            // Update availability status for each provider
            Object.entries(data.capabilities).forEach(([provider, info]) => {
                const statusElement = document.getElementById(`${provider}-status`);
                if (statusElement) {
                    statusElement.textContent = info.available ? '✅ Available' : '❌ No API Key';
                    statusElement.className = `provider-availability ${info.available ? 'available' : 'unavailable'}`;
                }
            });

        } catch (error) {
            console.error('Error loading AI provider status:', error);
            this.addLogEntry('system', '❌ Failed to load AI provider status');
        }
    }

    async saveAIProvider() {
        const selectedProvider = document.querySelector('input[name="ai-provider"]:checked');
        if (!selectedProvider) return;

        try {
            const response = await fetch('/dnd/api/dnd/ai-provider', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    provider: selectedProvider.value
                })
            });

            const result = await response.json();

            if (result.success) {
                this.addLogEntry('system', `🔄 Switched AI DM to: ${result.provider.toUpperCase()}`);
                // Close modal
                document.getElementById('ai-provider-modal').classList.add('hidden');
            } else {
                this.addLogEntry('system', `❌ Failed to switch AI provider: ${result.error}`);
            }

        } catch (error) {
            console.error('Error switching AI provider:', error);
            this.addLogEntry('system', '❌ Error switching AI provider');
        }
    }

    setupModals() {
        // Close modal buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                modal.classList.add('hidden');
                modal.classList.remove('active');
            });
        });

        // Close modal on background click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                    modal.classList.remove('active');
                }
            });
        });

        // Character form submission
        document.getElementById('character-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveCharacterFromForm();
        });

        // Roll stats button
        document.getElementById('roll-stats').addEventListener('click', () => {
            this.rollAbilityScores();
        });

        // AI Provider save button
        const saveAIProviderBtn = document.getElementById('save-ai-provider');
        if (saveAIProviderBtn) {
            saveAIProviderBtn.addEventListener('click', () => {
                this.saveAIProvider();
            });
        }
    }

    saveCharacterFromForm() {
        const formData = new FormData(document.getElementById('character-form'));

        this.character = {
            name: document.getElementById('char-name').value,
            level: parseInt(document.getElementById('char-level').value),
            race: document.getElementById('char-race').value,
            class: document.getElementById('char-class').value,
            abilities: {
                STR: parseInt(document.getElementById('str-input').value),
                DEX: parseInt(document.getElementById('dex-input').value),
                CON: parseInt(document.getElementById('con-input').value),
                INT: parseInt(document.getElementById('int-input').value),
                WIS: parseInt(document.getElementById('wis-input').value),
                CHA: parseInt(document.getElementById('cha-input').value)
            }
        };

        this.character.hitPoints = this.calculateHitPoints();
        this.character.armorClass = this.calculateArmorClass();
        this.character.proficiencyBonus = this.calculateProficiencyBonus();

        this.saveCharacter();
        this.updateCharacterDisplay();

        // Close modal
        document.getElementById('character-modal').classList.add('hidden');

        this.addLogEntry('dm', `Welcome, ${this.character.name} the ${this.character.race} ${this.character.class}! Your adventure begins now.`);
    }

    rollAbilityScores() {
        const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

        abilities.forEach(ability => {
            // Roll 4d6, drop lowest
            const rolls = [];
            for (let i = 0; i < 4; i++) {
                rolls.push(Math.floor(Math.random() * 6) + 1);
            }
            rolls.sort((a, b) => b - a); // Sort descending
            const total = rolls.slice(0, 3).reduce((sum, roll) => sum + roll, 0); // Take top 3

            const input = document.getElementById(`${ability}-input`);
            input.value = total;
        });
    }

    updateCharacterDisplay() {
        if (!this.character.name) return;

        // Update character info
        document.getElementById('character-name').textContent = this.character.name;
        document.getElementById('character-race-class').textContent = `${this.character.race} ${this.character.class}`;
        document.getElementById('character-level').textContent = `Level ${this.character.level}`;
        document.getElementById('character-initials').textContent = this.character.name.substring(0, 2).toUpperCase();

        // Update character portrait image
        const characterImage = document.getElementById('character-image');
        const characterInitials = document.getElementById('character-initials');
        if (this.character.image) {
            characterImage.src = this.character.image;
            characterImage.style.display = 'block';
            characterInitials.style.display = 'none';
        } else {
            characterImage.style.display = 'none';
            characterInitials.style.display = 'flex';
        }

        // Update ability scores
        Object.keys(this.character.abilities || {}).forEach(ability => {
            const score = this.character.abilities[ability];
            const modifier = Math.floor((score - 10) / 2);

            const scoreElement = document.getElementById(`${ability.toLowerCase()}-score`);
            const modElement = document.getElementById(`${ability.toLowerCase()}-mod`);

            if (scoreElement) scoreElement.textContent = score;
            if (modElement) modElement.textContent = modifier >= 0 ? `+${modifier}` : `${modifier}`;
        });

        // Update vitals
        const hpElement = document.getElementById('hp-value');
        const hpBarElement = document.getElementById('hp-bar');
        const acElement = document.getElementById('ac-value');

        if (hpElement) {
            const currentHP = this.character.currentHP || this.character.hitPoints;
            const maxHP = this.character.hitPoints;
            hpElement.textContent = `${currentHP}/${maxHP}`;

            // Update HP bar width
            if (hpBarElement && maxHP > 0) {
                const hpPercentage = (currentHP / maxHP) * 100;
                hpBarElement.style.width = `${hpPercentage}%`;
            }
        }
        if (acElement) acElement.textContent = this.character.armorClass;

        // Update status effects
        const statusEffectsElement = document.getElementById('status-effects');
        if (statusEffectsElement) {
            const effects = this.character.statusEffects || [];

            // Remove all status-type classes
            statusEffectsElement.classList.remove('status-type-positive', 'status-type-negative', 'status-type-poison', 'status-type-neutral', 'has-negative');

            if (effects.length === 0) {
                // Show "Normal" status when no effects
                statusEffectsElement.innerHTML = '<span class="status-badge status-normal">Normal</span>';
                statusEffectsElement.classList.add('status-type-positive');
            } else {
                // Determine dominant status type for container styling
                const hasPoison = effects.some(e => e.type === 'poison');
                const hasNegative = effects.some(e => e.type === 'negative');
                const hasPositive = effects.some(e => e.type === 'positive');

                // Apply appropriate container class based on effects
                if (hasPoison) {
                    statusEffectsElement.classList.add('status-type-poison');
                } else if (hasNegative) {
                    statusEffectsElement.classList.add('status-type-negative', 'has-negative');
                } else if (hasPositive) {
                    statusEffectsElement.classList.add('status-type-positive');
                } else {
                    statusEffectsElement.classList.add('status-type-neutral');
                }

                statusEffectsElement.innerHTML = effects.map(effect => {
                    let className = 'status-normal';
                    if (effect.type === 'negative') className = 'status-negative';
                    else if (effect.type === 'positive') className = 'status-positive';
                    else if (effect.type === 'poison') className = 'status-poison';

                    return `<span class="status-badge ${className}">${effect.name}</span>`;
                }).join('');
            }
        }
    }

    calculateHitPoints() {
        const conModifier = Math.floor(((this.character.abilities?.CON || 10) - 10) / 2);
        const baseHP = this.character.class === 'wizard' ? 6 :
                      this.character.class === 'sorcerer' ? 6 :
                      this.character.class === 'rogue' ? 8 : 10;
        return baseHP + conModifier;
    }

    calculateArmorClass() {
        const dexModifier = Math.floor(((this.character.abilities?.DEX || 10) - 10) / 2);
        // Basic calculation - can be enhanced based on equipment
        return 10 + dexModifier + 2; // Assuming some basic armor
    }

    calculateProficiencyBonus() {
        return Math.ceil(this.character.level / 4) + 1;
    }

    handleGameUpdates(updates) {
        // Handle character HP changes, status effects, etc.
        if (updates.character) {
            this.character = { ...this.character, ...updates.character };
            this.saveCharacter();
            this.updateCharacterDisplay();
        }

        // Handle environment changes
        if (updates.environment) {
            this.campaignState.environment = updates.environment;
        }
    }

    // Persistence
    saveCharacter() {
        localStorage.setItem('dnd_character', JSON.stringify(this.character));
    }

    loadCharacter() {
        const saved = localStorage.getItem('dnd_character');
        if (saved) {
            return JSON.parse(saved);
        }

        // Default character
        return {
            name: '',
            level: 1,
            race: 'human',
            class: 'fighter',
            abilities: {
                STR: 16, DEX: 14, CON: 15,
                INT: 12, WIS: 13, CHA: 10
            },
            hitPoints: 12,
            currentHP: 12,
            armorClass: 16,
            proficiencyBonus: 2
        };
    }

    loadFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const character = urlParams.get('character') || 'dax'; // Default to Dax
        this.loadCharacterPreset(character);
    }

    loadCharacterPreset(presetName) {
        const preset = this.getCharacterPreset(presetName);
        if (preset) {
            this.character = preset;
            this.saveCharacter();
            this.updateCharacterDisplay();
            this.updateCharacterSelector();
        }
    }

    switchPartyMember(characterKey) {
        // Update active tab
        document.querySelectorAll('.party-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.character === characterKey) {
                tab.classList.add('active');
            }
        });

        // Load the character
        this.loadCharacterPreset(characterKey);

        // Apply synced data if available
        if (this.partyData[characterKey]) {
            const syncedData = this.partyData[characterKey];

            // Apply HP from synced data
            if (syncedData.hp && syncedData.hp.current !== undefined) {
                this.character.currentHP = syncedData.hp.current;
                this.character.hitPoints = syncedData.hp.max;
            }

            // Apply status effects from synced data
            if (syncedData.conditions) {
                this.character.statusEffects = syncedData.conditions.map(condition => ({
                    name: condition.name || condition,
                    type: condition.type || 'negative'
                }));
            }

            // Update display with synced data
            this.updateCharacterDisplay();
        }

        // Trigger a sync to get latest data for this character
        this.syncWithDM(true);
    }

    getCharacterPreset(name) {
        const presets = {
            dax: {
                name: 'Dax Stargazer',
                level: 3,
                race: 'Vexian',
                class: 'Tech Specialist',
                image: 'dax pfp.png',
                abilities: {
                    STR: 8, DEX: 18, CON: 12,
                    INT: 16, WIS: 13, CHA: 10
                },
                hitPoints: 9,
                currentHP: 9,
                armorClass: 12,
                proficiencyBonus: 2,
                background: 'Tech Specialist',
                inventory: [
                    'Sidearm (0/10 rounds - EMPTY)',
                    'Multi-Tool (plasma torch, sonic wrench, wire bypass)',
                    'Medical Scanner (charged)'
                ]
            },
            chen: {
                name: 'Chen',
                level: 3,
                race: 'Earth-Born',
                class: 'Security Specialist',
                image: 'chen pfp.png',
                abilities: {
                    STR: 16, DEX: 15, CON: 16,
                    INT: 12, WIS: 14, CHA: 10
                },
                hitPoints: 24,
                currentHP: 24,
                armorClass: 16,
                proficiencyBonus: 2,
                background: 'Security',
                inventory: [
                    'Riot Shotgun (2/8 shells remaining)'
                ]
            },
            yuen: {
                name: 'Dr. Yuen',
                level: 3,
                race: 'Enhanced Human',
                class: 'Medical Officer',
                image: 'yuen pfp.png',
                abilities: {
                    STR: 10, DEX: 14, CON: 13,
                    INT: 17, WIS: 16, CHA: 15
                },
                hitPoints: 16,
                currentHP: 16,
                armorClass: 12,
                proficiencyBonus: 2,
                background: 'Medical',
                inventory: [
                    'Medical supplies (unknown)'
                ]
            }
        };
        return presets[name] || null;
    }

    updateCharacterSelector() {
        const selector = document.getElementById('character-preset');
        if (selector) {
            const presets = ['dax', 'chen', 'yuen'];
            const currentPreset = presets.find(preset => {
                const presetChar = this.getCharacterPreset(preset);
                return presetChar && presetChar.name === this.character.name;
            });
            selector.value = currentPreset || '';
        }
    }

    async syncWithDM(silent = false) {
        try {
            if (!silent) {
                console.log('🔄 Starting DM sync...');
            }

            // Backup current state
            const currentState = {
                credits: {
                    total: document.getElementById('total-credits')?.textContent || '',
                    dax: document.getElementById('dax-credits')?.textContent || '',
                    chen: document.getElementById('chen-credits')?.textContent || '',
                    yuen: document.getElementById('yuen-credits')?.textContent || ''
                },
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('dnd_sync_backup', JSON.stringify(currentState));

            // Fetch latest campaign state from enhanced server
            const campaignParam = window.campaignId ? `?campaign=${window.campaignId}` : '';
            const response = await fetch(`/dnd-api/dnd/state${campaignParam}`);
            if (!response.ok) {
                throw new Error(`Sync failed: ${response.status}`);
            }

            const serverState = await response.json();
            console.log('🔄 Received server state:', serverState);

            // Update credits (silently) - map server format to expected format
            const creditsData = {
                total: serverState.resources?.party_credits || 15800,
                dax: serverState.party?.dax?.credits || 2000,
                chen: serverState.party?.chen?.credits || 1000,
                yuen: serverState.party?.yuen?.credits || 12800
            };
            this.updateCreditsFromSync(creditsData);

            // Update character stats and conditions - map server format
            this.updateCharactersFromSync(serverState.party || {});

            // Update inventory from server
            this.updateInventoryFromSync(serverState.party || {});

            // Update quest log - map server format to expected format
            const questsData = serverState.quests?.active || [];
            this.updateQuestsFromSync(questsData);

            // Update ship status
            this.updateShipFromSync(serverState.ship || null);

            // Store sync timestamp
            localStorage.setItem('dnd_last_sync', serverState.timestamp);

            if (!silent) {
                console.log('✅ DM sync completed successfully');
            }

            return true;
        } catch (error) {
            console.error('❌ DM sync failed:', error);
            if (!silent) {
                this.addLogEntry('system', '⚠️ Sync failed - using cached data');
            }
            return false;
        }
    }

    updateCreditsFromSync(credits) {
        // Update total credits
        const totalElement = document.getElementById('total-credits');
        if (totalElement) {
            totalElement.textContent = `${credits.total.toLocaleString()} UC`;
        }

        // Update individual credits
        const daxElement = document.getElementById('dax-credits');
        if (daxElement) {
            daxElement.textContent = `${credits.dax.toLocaleString()} UC`;
        }

        const chenElement = document.getElementById('chen-credits');
        if (chenElement) {
            chenElement.textContent = `${credits.chen.toLocaleString()} UC`;
        }

        const yuenElement = document.getElementById('yuen-credits');
        if (yuenElement) {
            yuenElement.textContent = `${credits.yuen.toLocaleString()} UC`;
        }

        console.log('💰 Credits updated from sync');
    }

    getCharacterKey(characterName) {
        // Map character names to server keys
        const nameMap = {
            'dax stargazer': 'dax',
            'chen': 'chen',
            'dr. yuen': 'yuen'
        };
        return nameMap[characterName?.toLowerCase()] || null;
    }

    updateCharactersFromSync(characters) {
        // Store synced data for all party members
        Object.keys(characters).forEach(charName => {
            const char = characters[charName];

            // Store the synced data
            this.partyData[charName] = {
                hp: char.hp || {},
                conditions: char.conditions || [],
                inventory: char.inventory || []
            };
        });

        // Update currently active character if their data changed
        const currentCharKey = this.getCharacterKey(this.character.name);
        if (currentCharKey && this.partyData[currentCharKey]) {
            const syncedData = this.partyData[currentCharKey];

            // Update HP
            if (syncedData.hp) {
                this.character.currentHP = syncedData.hp.current;
                this.character.hitPoints = syncedData.hp.max;
            }

            // Update status effects
            if (syncedData.conditions) {
                this.character.statusEffects = syncedData.conditions.map(condition => ({
                    name: condition.name || condition,
                    type: condition.type || 'negative'
                }));
            } else {
                this.character.statusEffects = [];
            }

            // Update display with synced data
            this.updateCharacterDisplay();
        }

        console.log('👤 All party member data updated from sync');
    }

    updateShipFromSync(shipData) {
        const shipContent = document.querySelector('.ship-status-content');
        if (!shipContent) return;

        if (!shipData || !shipData.name) {
            // No ship - show empty state
            shipContent.innerHTML = '<p class="ship-status-empty">No active ship assigned</p>';
        } else {
            // Ship exists - build UI
            const weaponsStatus = shipData.weapons?.active < shipData.weapons?.total ? 'status-damaged' : 'status-good';
            const weaponsText = shipData.weapons ? `${shipData.weapons.active}/${shipData.weapons.total} Operational` : 'Unknown';

            shipContent.innerHTML = `
                <div class="ship-info">
                    <div class="ship-header">
                        <h6 class="ship-name">${shipData.name}</h6>
                        <span class="ship-class">${shipData.class || 'Unknown Class'}</span>
                    </div>
                    <div class="ship-stats">
                        <div class="ship-stat">
                            <span class="stat-label">Hull Integrity:</span>
                            <span class="stat-value">${shipData.hull || 0}%</span>
                        </div>
                        <div class="ship-stat">
                            <span class="stat-label">Fuel:</span>
                            <span class="stat-value">${shipData.fuel || 0}%</span>
                        </div>
                        <div class="ship-stat">
                            <span class="stat-label">Weapons:</span>
                            <span class="stat-value ${weaponsStatus}">${weaponsText}</span>
                        </div>
                        <div class="ship-stat">
                            <span class="stat-label">Life Support:</span>
                            <span class="stat-value status-good">${shipData.lifeSupport || 'Unknown'}</span>
                        </div>
                    </div>
                    ${shipData.notes && shipData.notes.length > 0 ? `
                        <div class="ship-notes">
                            ${shipData.notes.map(note => `<p class="ship-note">${note}</p>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        console.log('🚀 Ship status updated from sync');
    }

    updateInventoryFromSync(characters) {
        // Update inventory for each character from server data
        Object.keys(characters).forEach(charKey => {
            const char = characters[charKey];
            if (char.inventory) {
                // Update the preset's inventory
                const preset = this.getCharacterPreset(charKey);
                if (preset) {
                    preset.inventory = char.inventory;
                }
            }
        });

        // Refresh the current inventory display
        const activeTab = document.querySelector('.inv-tab.active');
        if (activeTab) {
            this.switchInventoryTab(activeTab.dataset.character);
        }

        console.log('🎒 Inventory updated from sync');
    }

    updateQuestsFromSync(quests) {
        const questList = document.getElementById('quest-list');
        if (!questList || !quests) return;

        // Clear current quests and rebuild from server data
        questList.innerHTML = '';

        quests.forEach(quest => {
            const questItem = document.createElement('div');
            questItem.className = 'quest-item';
            questItem.innerHTML = `
                <span class="quest-title">${quest.title}</span>
                <button class="quest-complete-btn" ${quest.completed ? 'disabled' : ''}>
                    ${quest.completed ? 'Complete' : 'Complete'}
                </button>
            `;

            if (quest.completed) {
                questItem.classList.add('completed');
            }

            questList.appendChild(questItem);
        });

        console.log('📋 Quest log updated from sync');
    }

    rollSkillCheck(skill) {
        const roll = Math.floor(Math.random() * 20) + 1;
        let modifier = 0;
        let abilityName = '';

        // Map skills to abilities and define proficiencies based on character class/background
        const skillMappings = {
            perception: { ability: 'WIS', name: 'Wisdom' },
            investigation: { ability: 'INT', name: 'Intelligence' },
            stealth: { ability: 'DEX', name: 'Dexterity' },
            persuasion: { ability: 'CHA', name: 'Charisma' }
        };

        // Character proficiencies (none currently set)
        const proficientSkills = []; // No proficiencies set for now

        if (skillMappings[skill]) {
            const ability = skillMappings[skill].ability;
            abilityName = skillMappings[skill].name;
            const abilityScore = this.character.abilities[ability];
            const abilityModifier = Math.floor((abilityScore - 10) / 2);
            const proficiencyBonus = proficientSkills.includes(skill) ? (this.character.proficiencyBonus || 2) : 0;

            modifier = abilityModifier + proficiencyBonus;
        }

        const total = roll + modifier;
        const skillName = skill.charAt(0).toUpperCase() + skill.slice(1);

        this.addLogEntry('dice', `🎲 ${skillName} Check: ${roll} + ${modifier} = ${total}`);
    }

    performCombatAction(action) {
        const roll = Math.floor(Math.random() * 20) + 1;
        let modifier = 0;
        let damage = 0;

        switch (action) {
            case 'attack':
                modifier = Math.floor((this.character.abilities.STR - 10) / 2) + (this.character.proficiencyBonus || 2);
                const attackTotal = roll + modifier;
                damage = Math.floor(Math.random() * 8) + 1 + Math.floor((this.character.abilities.STR - 10) / 2);
                this.addLogEntry('dice', `⚔️ Attack Roll: ${roll} + ${modifier} = ${attackTotal}, Damage: ${damage}`);
                break;
            case 'cast-spell':
                this.addLogEntry('action', `✨ ${this.character.name} casts a spell!`);
                break;
            case 'dodge':
                this.addLogEntry('action', `🛡️ ${this.character.name} dodges, gaining +2 AC until next turn!`);
                break;
            case 'help':
                this.addLogEntry('action', `🤝 ${this.character.name} helps an ally, granting advantage on their next roll!`);
                break;
        }
    }

    addQuest() {
        const input = document.getElementById('new-quest-title');
        const title = input.value.trim();
        if (!title) return;

        const questList = document.getElementById('quest-list');
        const questItem = document.createElement('div');
        questItem.className = 'quest-item';
        questItem.innerHTML = `
            <span class="quest-title">${title}</span>
            <button class="quest-complete-btn" onclick="this.parentElement.remove()">Complete</button>
        `;
        questList.appendChild(questItem);
        input.value = '';

        this.addLogEntry('system', `📝 New quest added: ${title}`);
    }

    switchInventoryTab(character) {
        document.querySelectorAll('.inv-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelector(`[data-character="${character}"]`).classList.add('active');

        // Initialize inventories if they don't exist
        if (!this.characterInventories) {
            this.characterInventories = {
                dax: ['Engineering Kit'],
                chen: [],
                yuen: []
            };
        }

        // Update inventory display based on character's actual inventory
        const inventoryItems = document.getElementById('inventory-items');
        inventoryItems.innerHTML = '';

        const items = this.characterInventories[character] || [];
        items.forEach(itemName => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'inventory-item';
            itemDiv.innerHTML = `
                <span class="item-name">${itemName}</span>
                <button class="item-use-btn" onclick="window.dndCampaign.useItem('${itemName}', 'use')">Use</button>
            `;
            inventoryItems.appendChild(itemDiv);
        });
    }

    addItem() {
        const input = document.getElementById('new-item-name');
        const name = input.value.trim();
        if (!name) return;

        // Find current active character
        const activeTab = document.querySelector('.inv-tab.active');
        const currentCharacter = activeTab ? activeTab.dataset.character : 'dax';

        // Initialize inventories if they don't exist
        if (!this.characterInventories) {
            this.characterInventories = {
                dax: ['Engineering Kit'],
                chen: [],
                yuen: []
            };
        }

        // Add item to current character's inventory
        this.characterInventories[currentCharacter].push(name);

        // Refresh the display
        this.switchInventoryTab(currentCharacter);

        input.value = '';
        this.addLogEntry('system', `🎒 Added ${name} to ${currentCharacter}'s inventory`);
    }

    switchInventoryTab(character) {
        // Update tab active state
        document.querySelectorAll('.inv-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.character === character) {
                tab.classList.add('active');
            }
        });

        // Get character preset to access inventory
        const preset = this.getCharacterPreset(character);
        const inventoryItems = document.getElementById('inventory-items');

        if (preset && preset.inventory && inventoryItems) {
            // Clear current items
            inventoryItems.innerHTML = '';

            // Add character's items
            preset.inventory.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'inventory-item';
                itemDiv.innerHTML = `
                    <span class="item-name">${item}</span>
                    <button class="item-use-btn">Use</button>
                `;
                inventoryItems.appendChild(itemDiv);
            });
        }
    }

    useItem(itemName, action) {
        this.addLogEntry('action', `🎒 Used ${itemName}`);
    }

    saveCampaignState() {
        localStorage.setItem('dnd_campaign_state', JSON.stringify(this.campaignState));
    }

    loadCampaignState() {
        const saved = localStorage.getItem('dnd_campaign_state');
        if (saved) {
            return JSON.parse(saved);
        }

        return {
            location: 'Whispering Woods Entrance',
            environment: 'forest',
            timeOfDay: 'morning',
            history: [],
            questProgress: {}
        };
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    async generateSceneImage() {
        const sceneDisplay = document.getElementById('scene-display');
        const generateBtn = document.getElementById('generate-scene-btn');

        if (!sceneDisplay || !generateBtn) return;

        try {
            // Show loading state
            sceneDisplay.innerHTML = `
                <div class="scene-loading">
                    <div class="spinner"></div>
                    <p>Extracting scene description...</p>
                    <p style="font-size: 0.9rem; opacity: 0.7;">This may take 10-30 seconds</p>
                </div>
            `;
            generateBtn.disabled = true;
            generateBtn.textContent = '⏳ Generating...';

            console.log('🎨 Requesting scene generation from server...');

            // Call backend API
            const response = await fetch('/dnd-api/dnd/generate-scene', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    campaign: window.campaignId || 'default'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate scene');
            }

            const data = await response.json();

            console.log('✅ Scene generated:', data);

            // Handle Stable Diffusion API queue status
            if (data.status === 'processing') {
                sceneDisplay.innerHTML = `
                    <div class="scene-loading">
                        <div class="spinner"></div>
                        <p>Image generation in progress...</p>
                        <p style="font-size: 0.9rem; opacity: 0.7;">ETA: ~${data.eta} seconds</p>
                    </div>
                `;

                // Poll for result
                await this.pollForSceneImage(data.eta);
                return;
            }

            // Display the generated image or error
            if (data.success && data.imageUrl) {
                sceneDisplay.innerHTML = `
                    <img src="${data.imageUrl}"
                         alt="${data.sceneDescription}"
                         title="Click to view full size"
                         style="width: 100%; height: auto; display: block; border-radius: 8px; cursor: pointer;"
                         onclick="window.game.showSceneModal('${data.imageUrl}', '${data.sceneDescription.replace(/'/g, "\\'")}')">
                `;
            } else if (data.success === false) {
                // Show error message from backend
                sceneDisplay.innerHTML = `
                    <div class="scene-placeholder" style="color: var(--accent-red);">
                        <span class="scene-icon">⚠️</span>
                        <p style="font-weight: 600;">${data.error}</p>
                        <p style="font-size: 0.85rem; margin-top: 0.5rem; opacity: 0.8;">${data.details || ''}</p>
                    </div>
                `;
            } else {
                throw new Error('No image URL returned from API');
            }

        } catch (error) {
            console.error('❌ Scene generation error:', error);
            sceneDisplay.innerHTML = `
                <div class="scene-placeholder" style="color: var(--accent-red);">
                    <span class="scene-icon">⚠️</span>
                    <p>Failed to generate scene</p>
                    <p style="font-size: 0.85rem; margin-top: 0.5rem; opacity: 0.8;">${error.message}</p>
                </div>
            `;
        } finally {
            // Re-enable button
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = '📸 Generate Scene Image';
            }
        }
    }

    async pollForSceneImage(estimatedTime) {
        // Wait for estimated time, then check result
        await new Promise(resolve => setTimeout(resolve, estimatedTime * 1000));

        // For now, just show a message - full polling would require the API to return a fetch URL
        const sceneDisplay = document.getElementById('scene-display');
        sceneDisplay.innerHTML = `
            <div class="scene-placeholder">
                <span class="scene-icon">⏳</span>
                <p>Scene generation queued. Please try again in a moment.</p>
            </div>
        `;
    }

    showSceneModal(imageUrl, description) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('scene-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'scene-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 90vw; max-height: 90vh; padding: 0;">
                    <div class="modal-header">
                        <h2>Scene Visualization</h2>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 0; text-align: center;">
                        <img id="scene-modal-image" src="" alt="" style="max-width: 100%; max-height: 80vh; display: block; margin: 0 auto;">
                        <p id="scene-modal-description" style="padding: 1rem; font-size: 0.9rem; opacity: 0.8; font-style: italic;"></p>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Add close handlers
            modal.querySelector('.modal-close').addEventListener('click', () => {
                modal.classList.add('hidden');
                modal.classList.remove('active');
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                    modal.classList.remove('active');
                }
            });
        }

        // Update content and show
        modal.querySelector('#scene-modal-image').src = imageUrl;
        modal.querySelector('#scene-modal-image').alt = description;
        modal.querySelector('#scene-modal-description').textContent = description;
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }
}

// Cache busting removed - no longer needed

// Initialize the campaign when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.game = new DNDCampaign();

    // Make rollForRequest globally accessible for onclick handlers
    window.rollForRequest = (diceType, rollRequest) => {
        window.game.rollForRequest(diceType, rollRequest);
    };

    // Initialize roll history display
    window.game.updateRollHistoryDisplay();

    // Add clear roll history button listener
    const clearHistoryBtn = document.getElementById('clear-roll-history');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('Clear all roll history?')) {
                window.game.clearRollHistory();
            }
        });
    }

    // Add clear adventure log button listener
    const clearLogBtn = document.getElementById('clear-adventure-log');
    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', () => {
            if (confirm('Clear entire adventure log? This cannot be undone!')) {
                window.game.clearGameLog();
            }
        });
    }

    // Add scene generator button listener
    const generateSceneBtn = document.getElementById('generate-scene-btn');
    if (generateSceneBtn) {
        generateSceneBtn.addEventListener('click', async () => {
            await window.game.generateSceneImage();
        });
    }
});
