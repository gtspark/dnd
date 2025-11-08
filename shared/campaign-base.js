// D&D Campaign Manager - Shared Core Campaign Base
// VodBase-pattern shared core - supports multiple campaigns with unique themes/prompts
console.log('🎲 Campaign Base: Loading shared core...');

// Clear any old cached data on version update
const version = '1761032406';
const storedVersion = localStorage.getItem('app_version');
if (storedVersion !== version) {
    localStorage.clear();
    localStorage.setItem('app_version', version);
    console.log('🧹 Cleared cache for new version');
}

class CampaignBase {
    constructor(config = {}) {
        // Store campaign-specific configuration
        this.config = {
            campaignId: config.campaignId || 'default',
            campaignName: config.campaignName || 'Campaign',
            genre: config.genre || 'fantasy',
            characters: config.characters || [],
            defaultCharacter: config.defaultCharacter || (config.characters[0]?.id || 'player'),
            localStoragePrefix: config.localStoragePrefix || 'dnd',
            ...config
        };

        console.log(`🎮 Initializing ${this.config.campaignName} (${this.config.genre})`);

        this.character = this.loadCharacter();
        this.campaignState = this.loadCampaignState();
        this.sessionId = this.generateSessionId();
        this.currentMode = 'ic'; // Default to in-character mode
        this.partyData = {}; // Store synced data for all party members
        this.rollQueue = []; // Track pending roll requests
        this.isCombatActive = false;
        this.pendingCombatHandoff = null;
        this.init();

        if (typeof window !== 'undefined') {
            window.game = this;
            if (!window.campaign) {
                window.campaign = this;
            }
            window.game.enterCombatMode = this.enterCombatMode.bind(this);
            window.game.refreshRollQueue = this.refreshRollQueue.bind(this);
            window.game.submitRollResult = this.submitRollResult.bind(this);
            window.game.overrideRollQueue = this.overrideRollQueue.bind(this);
            window.game.updateActionEconomy = this.updateActionEconomy.bind(this);
            window.game.advanceCombatTurn = this.advanceCombatTurn.bind(this);
            window.game.createCombatRollQueueEntry = this.createCombatRollQueueEntry.bind(this);
        }
    }

    updateCampaignUI() {
        // Update campaign title in header
        const campaignTitle = document.getElementById('campaign-title');
        if (campaignTitle) {
            campaignTitle.textContent = this.config.campaignName;
        }

        // Update character selector with campaign-specific characters
        const characterPreset = document.getElementById('character-preset');
        if (characterPreset && this.config.characters && this.config.characters.length > 0) {
            // Clear existing options except "Custom Character"
            characterPreset.innerHTML = '<option value="">Custom Character</option>';

            // Add campaign-specific character options
            this.config.characters.forEach(char => {
                const option = document.createElement('option');
                option.value = char.id;
                option.textContent = `${char.name} (${char.class})`;
                characterPreset.appendChild(option);
            });
        }

        console.log(`🎭 Campaign UI updated for: ${this.config.campaignName}`);
    }

    broadcastCombatState(state = null) {
        if (typeof window === 'undefined') {
            return;
        }

        const source = state || this.campaignState?.combat || {};
        const detail = {
            active: !!source.active,
            round: Number.isFinite(source.round) ? source.round : 0,
            currentTurn: Number.isFinite(source.currentTurn) ? source.currentTurn : 0,
            initiativeOrder: Array.isArray(source.initiativeOrder) ? source.initiativeOrder : [],
            participants: source.participants || {
                players: [],
                enemies: []
            },
            context: source.context || {},
            actionEconomy: source.actionEconomy || {},
            conditions: source.conditions || {},
            rollQueue: Array.isArray(source.rollQueue) ? source.rollQueue : []
        };

        window.dispatchEvent(new CustomEvent('combatStateUpdate', { detail }));
    }

    async init() {
        this.updateCampaignUI(); // Update campaign-specific UI elements
        this.bindEvents();
        this.loadFromURL();
        this.updateCharacterDisplay();
        this.setupModals();
        this.switchInventoryTab(this.config.defaultCharacter); // Initialize with default character's inventory
        // Restore adventure log from enhanced server with error handling
        try {
            await this.loadGameLog();
            console.log('✅ Game log loaded successfully');
        } catch (error) {
            console.error('❌ Error loading game log:', error);
            // Clear corrupted log data
            const logKey = `${this.config.localStoragePrefix}_game_log`;
            localStorage.removeItem(logKey);
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
                await this.refreshRollQueue(true);
            } catch (error) {
                console.error('❌ Auto-sync failed:', error);
            }
        }, 30000); // 30 seconds

        console.log('🔄 Auto-sync started (30 second intervals)');
    }

    bindEvents() {
        // Send action button
        // DISABLED: Svelte GameInput component now handles all player input
        // These elements are hidden in DOM (index.html lines 73-78) but kept for legacy compatibility
        // const sendBtn = document.getElementById('send-btn');
        // const playerInput = document.getElementById('player-input');

        // if (sendBtn) {
        //     sendBtn.addEventListener('click', () => this.sendPlayerAction());
        // }
        // if (playerInput) {
        //     playerInput.addEventListener('keydown', (e) => {
        //         if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        //             this.sendPlayerAction();
        //         }
        //     });
        // }

        // DISABLED: Svelte GameInput component now handles mode selection
        // Mode buttons are hidden in DOM (index.html lines 75-77)
        // document.querySelectorAll('.mode-btn').forEach(btn => {
        //     btn.addEventListener('click', (e) => {
        //         const mode = e.currentTarget.dataset.mode;
        //         if (mode) {
        //             this.setMode(mode);
        //         }
        //     });
        // });

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

        // Exit button - return to campaign splash
        const exitBtn = document.getElementById('exit-btn');
        if (exitBtn) {
            exitBtn.addEventListener('click', async () => {
                console.log('🚪 Exiting campaign...');

                // Force save character state
                this.saveCharacter();
                this.saveCampaignState();

                // Force sync with server
                await this.syncWithDM(true);

                console.log('✅ State saved, returning to splash');

                // Return to campaign selection
                window.location.href = '/dnd/';
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
                    const notesKey = `${this.config.localStoragePrefix}_campaign_notes`;
                    localStorage.setItem(notesKey, notesTextarea.value);
                    console.log('📝 Campaign notes auto-saved');
                }, 500); // Save 500ms after user stops typing
            });

            // Load saved notes
            const notesKey = `${this.config.localStoragePrefix}_campaign_notes`;
            const savedNotes = localStorage.getItem(notesKey);
            if (savedNotes) {
                notesTextarea.value = savedNotes;
            }
        }

        window.addEventListener('combatModeChange', (event) => {
            const isActive = !!(event && event.detail && event.detail.active);
            this.isCombatActive = isActive;
            if (!isActive) {
                this.pendingCombatHandoff = null;
            }
        });

        window.addEventListener('combatHandoffReady', (event) => {
            const handoff = event?.detail;
            if (handoff) {
                this.pendingCombatHandoff = handoff;
                console.log('📦 Combat handoff cached from narrative response', handoff);
            }
        });

        // DISABLED: Svelte GameArea.svelte now handles playerAction events directly
        // The legacy listener was causing duplicate message sending
        // window.addEventListener('playerAction', (event) => {
        //     const { message, mode } = event.detail;
        //     this.currentMode = mode || 'ic';
        //     this.sendPlayerAction(message);
        // });
    }

    setMode(mode) {
        if (!mode) {
            console.warn('⚠️ setMode called with undefined mode');
            return;
        }

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

    async handleLocalCommand(action) {
        const trimmed = action.trim();
        if (!trimmed) {
            return false;
        }

        const tokens = trimmed.split(/\s+/);
        if (tokens.length === 0) {
            return false;
        }

        let commandToken = tokens.shift() || '';
        const originalCommandToken = commandToken;
        commandToken = commandToken.startsWith('/') ? commandToken.slice(1) : commandToken;
        commandToken = commandToken.toLowerCase();

        const combatState = this.campaignState?.combat;

        const ensureCombatAvailable = () => {
            if (!combatState || !Array.isArray(combatState.initiativeOrder) || combatState.initiativeOrder.length === 0) {
                this.addLogEntry('system', '⚠️ No active combat to update yet.', false, this.currentMode);
                return false;
            }
            return true;
        };

        const resolveTarget = (workingTokens) => {
            if (!ensureCombatAvailable()) {
                return null;
            }
            return this.resolveCombatCommandTarget(workingTokens);
        };

        const spendEconomy = async (target, updates, note) => {
            if (!target) return true;
            try {
                await this.updateActionEconomy(target.name, updates);
                if (note) {
                    this.addLogEntry('system', note, false, this.currentMode);
                }
            } catch (error) {
                console.error('⚠️ Action economy command failed:', error);
                this.addLogEntry('system', '⚠️ Unable to update action usage right now.', false, this.currentMode);
            }
            return true;
        };

        const commandAliases = {
            end: 'end',
            endturn: 'end',
            'end-turn': 'end',
            use: 'use',
            spend: 'use',
            consume: 'use',
            move: 'move',
            movement: 'move',
            set: 'set',
            reset: 'restore',
            restore: 'restore',
            refresh: 'restore'
        };

        const normalizedCommand = commandAliases[commandToken] || commandToken;

        if (normalizedCommand === 'end') {
            const turnCommands = new Set(['/end', '/end turn', 'end', 'end turn', originalCommandToken]);
            if (turnCommands.has(originalCommandToken.toLowerCase()) || turnCommands.has(`/${originalCommandToken.toLowerCase()}`)) {
                this.addLogEntry('player', trimmed, false, this.currentMode);
            }
            try {
                await this.advanceCombatTurn();
                this.addLogEntry('system', '⏭️ Turn advanced to the next combatant.', false, this.currentMode);
            } catch (error) {
                console.error('⚠️ Turn advance command failed:', error);
                this.addLogEntry('system', '⚠️ Unable to advance turn right now. Please try again in a moment.', false, this.currentMode);
            }
            return true;
        }

        if (normalizedCommand === 'use') {
            if (!ensureCombatAvailable()) {
                return true;
            }
            const workingTokens = [...tokens];
            const typeTokenRaw = workingTokens.shift();
            if (!typeTokenRaw) {
                this.addLogEntry('system', '⚠️ Usage command missing target (action, bonus, reaction, or movement).', false, this.currentMode);
                return true;
            }
            const typeToken = typeTokenRaw.toLowerCase();
            const target = resolveTarget(workingTokens);
            if (!target) {
                return true;
            }

            const economyKeyMap = {
                action: 'action',
                bonus: 'bonusAction',
                bonusaction: 'bonusAction',
                'bonus-action': 'bonusAction',
                reaction: 'reaction',
                move: 'movement',
                movement: 'movement'
            };

            const economyKey = economyKeyMap[typeToken];

            if (!economyKey) {
                this.addLogEntry('system', `⚠️ Unknown usage target "${typeTokenRaw}". Use action, bonus, reaction, or movement.`, false, this.currentMode);
                return true;
            }

            if (economyKey === 'movement') {
                const amount = this.extractNumericToken(workingTokens);
                const currentMovement = this.getCombatantMovement(target.name);
                const spendAmount = Number.isFinite(amount) ? Math.abs(amount) : currentMovement;
                const next = Math.max(0, currentMovement - spendAmount);
                const message = `🛤️ ${target.name}: marked ${Math.min(spendAmount, currentMovement)} ft of movement as spent ( ${next} ft remaining ).`;
                return spendEconomy(target, { movement: next }, message);
            }

            const labelMap = {
                action: 'Action',
                bonusAction: 'Bonus Action',
                reaction: 'Reaction'
            };

            return spendEconomy(target, { [economyKey]: false }, `✅ ${target.name}: ${labelMap[economyKey]} marked as used.`);
        }

        if (normalizedCommand === 'restore') {
            if (!ensureCombatAvailable()) {
                return true;
            }
            const workingTokens = [...tokens];
            const typeTokenRaw = workingTokens.shift();
            if (!typeTokenRaw) {
                this.addLogEntry('system', '⚠️ Restore command missing target (action, bonus, reaction, or movement).', false, this.currentMode);
                return true;
            }
            const typeToken = typeTokenRaw.toLowerCase();
            const target = resolveTarget(workingTokens);
            if (!target) {
                return true;
            }

            const economyKeyMap = {
                action: 'action',
                bonus: 'bonusAction',
                bonusaction: 'bonusAction',
                'bonus-action': 'bonusAction',
                reaction: 'reaction',
                move: 'movement',
                movement: 'movement'
            };

            const economyKey = economyKeyMap[typeToken];
            if (!economyKey) {
                this.addLogEntry('system', `⚠️ Unknown restore target "${typeTokenRaw}". Use action, bonus, reaction, or movement.`, false, this.currentMode);
                return true;
            }

            if (economyKey === 'movement') {
                const defaultMovement = this.getDefaultMovementForCombatant(target);
                return spendEconomy(target, { movement: defaultMovement }, `🛤️ ${target.name}: movement restored to ${defaultMovement} ft.`);
            }

            const labelMap = {
                action: 'Action',
                bonusAction: 'Bonus Action',
                reaction: 'Reaction'
            };
            return spendEconomy(target, { [economyKey]: true }, `♻️ ${target.name}: ${labelMap[economyKey]} restored.`);
        }

        if (normalizedCommand === 'move') {
            if (!ensureCombatAvailable()) {
                return true;
            }
            const workingTokens = [...tokens];
            const target = resolveTarget(workingTokens);
            if (!target) {
                return true;
            }
            const amount = this.extractNumericToken(workingTokens);
            if (!Number.isFinite(amount)) {
                this.addLogEntry('system', '⚠️ Movement command requires a distance (e.g., "/move 20").', false, this.currentMode);
                return true;
            }
            const currentMovement = this.getCombatantMovement(target.name);
            const spendAmount = Math.min(Math.abs(amount), currentMovement);
            const next = Math.max(0, currentMovement - spendAmount);
            return spendEconomy(target, { movement: next }, `🛤️ ${target.name}: marked ${spendAmount} ft of movement as spent (${next} ft remaining).`);
        }

        if (normalizedCommand === 'set') {
            if (!ensureCombatAvailable()) {
                return true;
            }
            const workingTokens = [...tokens];
            const typeTokenRaw = workingTokens.shift();
            if (!typeTokenRaw) {
                this.addLogEntry('system', '⚠️ Set command requires a target (e.g., "/set movement 30").', false, this.currentMode);
                return true;
            }
            const typeToken = typeTokenRaw.toLowerCase();
            if (typeToken !== 'movement' && typeToken !== 'move') {
                this.addLogEntry('system', `⚠️ Unsupported set target "${typeTokenRaw}". Only movement can be set directly.`, false, this.currentMode);
                return true;
            }
            const target = resolveTarget(workingTokens);
            if (!target) {
                return true;
            }
            const amount = this.extractNumericToken(workingTokens);
            if (!Number.isFinite(amount)) {
                this.addLogEntry('system', '⚠️ Set movement command requires a distance (e.g., "/set movement 25").', false, this.currentMode);
                return true;
            }
            const value = Math.max(0, Math.abs(amount));
            return spendEconomy(target, { movement: value }, `🛤️ ${target.name}: movement set to ${value} ft.`);
        }

        return false;
    }

    extractNumericToken(tokens = []) {
        if (!Array.isArray(tokens)) {
            return null;
        }
        for (let i = 0; i < tokens.length; i += 1) {
            const value = Number(tokens[i]);
            if (!Number.isNaN(value)) {
                tokens.splice(i, 1);
                return value;
            }
        }
        return null;
    }

    getActiveCombatant() {
        const combatState = this.campaignState?.combat;
        if (!combatState || !Array.isArray(combatState.initiativeOrder)) {
            return null;
        }
        const index = Number.isFinite(combatState.currentTurn) ? combatState.currentTurn : 0;
        return combatState.initiativeOrder[index] || null;
    }

    findCombatantByName(identifier) {
        if (!identifier) {
            return null;
        }
        const normalized = identifier.toString().trim().toLowerCase();
        if (!normalized) {
            return null;
        }
        const combatState = this.campaignState?.combat;
        if (!combatState || !Array.isArray(combatState.initiativeOrder)) {
            return null;
        }
        return combatState.initiativeOrder.find(entry => {
            if (!entry || !entry.name) {
                return false;
            }
            const nameLower = entry.name.toLowerCase();
            if (nameLower === normalized) {
                return true;
            }
            if (entry.id && entry.id.toLowerCase() === normalized) {
                return true;
            }
            return nameLower.startsWith(normalized);
        }) || null;
    }

    resolveCombatCommandTarget(tokens = []) {
        const combatState = this.campaignState?.combat;
        if (!combatState || !Array.isArray(combatState.initiativeOrder) || combatState.initiativeOrder.length === 0) {
            return null;
        }
        if (!Array.isArray(tokens)) {
            return this.getActiveCombatant();
        }

        const cleanedTokens = tokens.filter(token => token.toLowerCase() !== 'for');

        for (let i = 0; i < cleanedTokens.length; i += 1) {
            const candidate = this.findCombatantByName(cleanedTokens[i]);
            if (candidate) {
                const indexInOriginal = tokens.indexOf(cleanedTokens[i]);
                if (indexInOriginal !== -1) {
                    tokens.splice(indexInOriginal, 1);
                }
                return candidate;
            }
        }

        return this.getActiveCombatant();
    }

    getCombatantMovement(name) {
        const economy = this.campaignState?.combat?.actionEconomy?.[name];
        const raw = economy?.movement;
        if (Number.isFinite(Number(raw))) {
            return Number(raw);
        }
        return this.getDefaultMovementForName(name);
    }

    getDefaultMovementForCombatant(combatant) {
        if (!combatant) {
            return 30;
        }
        const base = this.getDefaultMovementForName(combatant.name);
        if (Number.isFinite(base)) {
            return base;
        }
        return 30;
    }

    getDefaultMovementForName(name) {
        const combatant = this.findCombatantByName(name);
        if (combatant && Number.isFinite(Number(combatant?.actionEconomy?.movement))) {
            return Number(combatant.actionEconomy.movement);
        }
        return 30;
    }

    async sendPlayerAction(message = null) {
        // Accept message parameter from Svelte, or fall back to DOM input
        const input = document.getElementById('player-input');
        const rawAction = message ?? (input ? input.value : '');
        const action = (rawAction || '').trim();

        if (!action) {
            if (!message && input) {
                input.value = '';
            }
            return;
        }

        if (await this.handleLocalCommand(action)) {
            if (!message && input) {
                input.value = '';
            }
            return;
        }

        // Check if API is initialized
        if (!window.claudeAPI.isInitialized) {
            this.addLogEntry('system', '⚠️ Claude API is still initializing... Please wait a moment and try again.');
            return;
        }

        // Add player's action to log with current mode
        this.addLogEntry('player', action, false, this.currentMode);

        // Only clear DOM input if we didn't receive message from Svelte
        if (!message && input) {
            input.value = '';
        }

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
            await this.handleRollRequest(response.rollRequest, response.narrative, mode);
            return { message: '' }; // Empty message since handleRollRequest already displayed it
        } else {
            // Regular narrative response
            return { message: response.narrative };
        }
    }

    async handleRollRequest(rollRequest, narrative, mode = 'ic') {
        // Display the narrative first with mode (fallback if missing)
        const trimmedNarrative = (narrative || '').trim();
        if (trimmedNarrative) {
            this.addLogEntry('dm', trimmedNarrative, false, mode);
        } else {
            const fallbackMessage = `🎲 ${rollRequest}`;
            this.addLogEntry('dm', fallbackMessage, false, mode);
        }

        // Parse the roll request
        const rollDetails = window.claudeAPI.parseRollRequest(rollRequest);

        if (this.isCombatActive) {
            const entry = await this.createCombatRollQueueEntry(rollRequest, rollDetails);
            if (entry) {
                document.querySelectorAll('.roll-prompt')?.forEach(el => el.remove());
                return entry;
            }
        }

        // Fallback to inline prompt when not in combat or queue creation failed
        this.showRollPrompt(rollDetails, rollRequest);
        return null;
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
        const normalizedRequest = (rollRequest || '').toLowerCase();

        // Check for advantage/disadvantage
        const hasAdvantage = normalizedRequest.includes('with advantage');
        const hasDisadvantage = normalizedRequest.includes('with disadvantage');

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

        // Detect explicit to-hit bonuses: "(+5 to hit, vs AC 13)"
        const explicitHitMatch = rollRequest.match(/\(\s*([+-]?\d+)\s*to hit/i);
        let explicitHitBonus = null;
        if (explicitHitMatch) {
            explicitHitBonus = parseInt(explicitHitMatch[1], 10);
            if (!Number.isFinite(explicitHitBonus)) {
                explicitHitBonus = null;
            }
        }

        // Compute modifiers
        const rawBaseModifier = Number.isFinite(explicitHitBonus)
            ? explicitHitBonus
            : this.getSkillModifier(rollRequest);
        const baseModifier = Number.isFinite(rawBaseModifier) ? rawBaseModifier : 0;
        const equipmentBonus = Number.isFinite(explicitHitBonus)
            ? 0
            : this.getEquipmentBonus(rollRequest);
        const statusEffectPenalty = this.getStatusEffectPenalty(rollRequest);

        let totalModifier = baseModifier + equipmentBonus - statusEffectPenalty;

        const modifierParts = [];
        if (explicitHitBonus !== null) {
            modifierParts.push(`${explicitHitBonus >= 0 ? '+' : ''}${explicitHitBonus} to hit`);
        } else if (baseModifier !== 0) {
            modifierParts.push(`${baseModifier >= 0 ? '+' : ''}${baseModifier}`);
        }

        if (equipmentBonus > 0 && explicitHitBonus === null) {
            modifierParts.push(`+${equipmentBonus} equipment`);
        }

        if (statusEffectPenalty > 0) {
            modifierParts.push(`-${statusEffectPenalty} status`);
        }

        const total = rollResult + totalModifier;

        // Format roll result message
        const breakdownComponents = [rollResult.toString()];
        if (modifierParts.length) {
            breakdownComponents.push(...modifierParts);
        }
        const breakdownText = breakdownComponents.join(' ');
        const rollMessage = `${rollRequest}: ${total} (rolled ${breakdownText}${rollDetails})`;

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

        // Remove any legacy roll prompts now that the queue has handled the result
        document.querySelectorAll('.roll-prompt')?.forEach((el) => el.remove());

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

                // Check if this was an initiative roll - if so, start combat
                if (rollRequest && rollRequest.toLowerCase().includes('initiative')) {
                    console.log('🎲 Initiative roll detected, checking if combat should start...');
                    await this.checkAndStartCombat(response.narrative, rollMessage);
                }
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

    buildCombatInitiative(enemies = [], initiativeOverrides = {}) {
        const order = [];
        const characters = Array.isArray(this.config.characters) && this.config.characters.length > 0
            ? this.config.characters
            : [];
        const characterState = this.campaignState?.characters || this.campaignState?.party || {};
        const partyData = this.partyData || {};

        const parseInitiative = (value) => {
            if (value === undefined || value === null || value === '') {
                return null;
            }
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
        };

        const toHpBlock = (source = {}, fallback = {}) => {
            const rawCurrent = source?.hp?.current ?? source?.hp ?? source?.current ?? fallback.current ?? fallback.max;
            const current = Number.isFinite(Number(rawCurrent)) ? Number(rawCurrent) : 10;

            const rawMax = source?.hp?.max ?? source?.maxHp ?? fallback.max ?? current;
            const max = Number.isFinite(Number(rawMax)) ? Number(rawMax) : current;

            return { current, max };
        };

        const ensureActionEconomy = () => ({
            action: true,
            bonusAction: true,
            movement: 30,
            reaction: true
        });

        const candidatePlayers = characters.length > 0 ? characters : [{
            id: this.character?.id || (this.character?.name ? this.character.name.toLowerCase() : 'player'),
            name: this.character?.name || 'Player Character',
            ac: this.character?.armorClass || this.character?.ac || 10,
            hp: { current: this.character?.currentHP || this.character?.hitPoints || 10, max: this.character?.hitPoints || 10 }
        }];

        candidatePlayers.forEach((char, index) => {
            const stateKey = char.id || (char.name ? char.name.toLowerCase() : null);
            const syncedState = (stateKey && characterState[stateKey]) || partyData[stateKey] || null;
            const hpSource = syncedState || char;
            order.push({
                name: char.name || char.id || `Adventurer ${index + 1}`,
                id: char.id,
                isPlayer: true,
                initiative: parseInitiative(initiativeOverrides?.[char.id] ?? initiativeOverrides?.[char.name] ?? syncedState?.initiative),
                ac: syncedState?.ac ?? char.ac ?? char.armorClass ?? 10,
                hp: toHpBlock(syncedState, hpSource?.hp || hpSource),
                actionEconomy: ensureActionEconomy()
            });
        });

        (Array.isArray(enemies) ? enemies : []).forEach((enemy, enemyIndex) => {
            if (!enemy) return;
            const count = Number.isInteger(enemy.count) && enemy.count > 1 ? enemy.count : 1;
            for (let i = 0; i < count; i += 1) {
                const baseName = enemy.name || `Enemy ${enemyIndex + 1}`;
                const suffix = count > 1 ? ` ${i + 1}` : '';
                const rawCurrentHp = enemy.hp?.current ?? enemy.hp ?? enemy.currentHp ?? enemy.maxHp ?? 1;
                const rawMaxHp = enemy.hp?.max ?? enemy.maxHp ?? rawCurrentHp ?? 1;
                const currentHp = Number.isFinite(Number(rawCurrentHp)) ? Number(rawCurrentHp) : Number(rawMaxHp) || 1;
                const maxHp = Number.isFinite(Number(rawMaxHp)) ? Number(rawMaxHp) : currentHp;

                order.push({
                    name: `${baseName}${suffix}`.trim(),
                    isPlayer: false,
                    initiative: parseInitiative(enemy.initiative ?? enemy.init),
                    ac: Number.isFinite(Number(enemy.ac)) ? Number(enemy.ac) : (enemy.armorClass ?? 12),
                    hp: { current: currentHp, max: maxHp },
                    actionEconomy: ensureActionEconomy()
                });
            }
        });

        const hasInitiative = order.some(entry => typeof entry.initiative === 'number' && !Number.isNaN(entry.initiative) && entry.initiative !== null);
        if (hasInitiative) {
            order.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
        }

        return order;
    }

    getCombatApiCandidates(relativePath) {
        const config = window.__CLAUDE_API_CONFIG__ || this.config || {};
        const baseCandidates = Array.from(new Set([
            config.base_url,
            config.fallback_base_url,
            '/dnd-api/dnd',
            '/dnd/api/dnd',
            '/api/dnd'
        ].filter(Boolean)));

        const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
        const candidates = baseCandidates.map(base => `${base.replace(/\/$/, '')}${normalizedPath}`);

        if (!candidates.includes(normalizedPath)) {
            candidates.push(normalizedPath);
        }

        return candidates;
    }

    async startCombatSession(initiativeOrder = [], metadata = {}) {
        const campaign = window.campaignId || this.config.campaignId || 'default';
        const cleanOrder = Array.isArray(initiativeOrder) ? initiativeOrder : [];
        const enemyList = cleanOrder.filter(entry => entry && entry.isPlayer === false);
        const payload = {
            campaign,
            initiativeOrder: cleanOrder,
            enemies: enemyList
        };

        if (this.pendingCombatHandoff) {
            payload.handoffData = this.pendingCombatHandoff;
        }

        const explicitHandoff = metadata?.handoffData;
        if (explicitHandoff) {
            this.pendingCombatHandoff = explicitHandoff;
            payload.handoffData = explicitHandoff;
        }

        if (metadata?.context) {
            payload.context = metadata.context;
        }

        const hasResolvedInitiative = cleanOrder.some(entry => Number.isFinite(Number(entry?.initiative)));
        const handoffHasInitiative = Array.isArray(payload.handoffData?.initiativeOrder)
            && payload.handoffData.initiativeOrder.some(entry => Number.isFinite(Number(entry?.initiative)));

        if (!hasResolvedInitiative && !handoffHasInitiative) {
            if (payload.handoffData && !this.pendingCombatHandoff) {
                this.pendingCombatHandoff = payload.handoffData;
            }
            console.log('⏸️  Combat handoff received without initiative order. Waiting for roll results before activating combat mode.');
            return null;
        }

        const endpoints = this.getCombatApiCandidates('/combat/start');
        let lastError = null;

        try {
            let combatState = null;

            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        throw new Error(`Combat start failed: ${response.status}`);
                    }

                    const data = await response.json();
                    if (data && data.success === false) {
                        throw new Error(data.error || 'Combat start rejected by server');
                    }

                    combatState = this.normalizeCombatState(data?.combatState || { active: true });
                    break;
                } catch (endpointError) {
                    lastError = endpointError;
                    console.warn(`⚠️ Combat start via ${endpoint} failed:`, endpointError.message || endpointError);
                }
            }

            const ensureCombatStateHasOrder = (state) => {
                if (!Array.isArray(state?.initiativeOrder) || state.initiativeOrder.length === 0) {
                    console.warn('⚠️ Combat state missing initiative order, hydrating from local snapshot');

                    const defaultEconomy = {
                        action: true,
                        bonusAction: true,
                        movement: 30,
                        reaction: true
                    };

                    const ensureCombatant = (entry) => {
                        if (!entry) return null;
                        const initiative = Number(entry.initiative);
                        return {
                            name: entry.name,
                            id: entry.id,
                            isPlayer: entry.isPlayer === true,
                            initiative: Number.isFinite(initiative) ? initiative : null,
                            ac: entry.ac ?? null,
                            hp: {
                                current: entry.hp?.current ?? null,
                                max: entry.hp?.max ?? null
                            },
                            actionEconomy: entry.actionEconomy ? { ...entry.actionEconomy } : { ...defaultEconomy },
                            conditions: Array.isArray(entry.conditions) ? [...entry.conditions] : []
                        };
                    };

                    const localOrder = initiativeOrder
                        .map(ensureCombatant)
                        .filter(Boolean);

                    const actionEconomy = {};
                    const conditions = {};

                    localOrder.forEach(combatant => {
                        actionEconomy[combatant.name] = { ...defaultEconomy, ...(combatant.actionEconomy || {}) };
                        conditions[combatant.name] = Array.isArray(combatant.conditions) ? [...combatant.conditions] : [];
                    });

                    const participants = {
                        players: localOrder.filter(c => c.isPlayer),
                        enemies: localOrder.filter(c => !c.isPlayer)
                    };

                    return {
                        active: true,
                        round: state?.round ?? 1,
                        currentTurn: state?.currentTurn ?? 0,
                        initiativeOrder: localOrder,
                        participants,
                        actionEconomy: Object.keys(state?.actionEconomy || {}).length ? state.actionEconomy : actionEconomy,
                        conditions: Object.keys(state?.conditions || {}).length ? state.conditions : conditions,
                        context: metadata?.context ? { ...metadata.context, ...(state?.context || {}) } : (state?.context || {}),
                        conversationHistory: Array.isArray(state?.conversationHistory) ? state.conversationHistory : []
                    };
                }

                return state;
            };

            if (!combatState) {
                console.warn('⚠️ Combat start endpoint not available, proceeding with local state snapshot');
                combatState = ensureCombatStateHasOrder(null);
            } else {
                combatState = ensureCombatStateHasOrder(combatState);
            }

            this.isCombatActive = true;
            if (metadata?.context) {
                combatState.context = {
                    ...combatState.context,
                    ...metadata.context
                };
            }
            window.dispatchEvent(new CustomEvent('combatModeChange', { detail: { active: true, combatState } }));
            window.dispatchEvent(new CustomEvent('combatStateUpdate', { detail: combatState }));

            if (metadata?.enemies && metadata.enemies.length) {
                console.log(`⚔️ Auto combat start with ${metadata.enemies.length} detected enemies.`);
            }

            this.pendingCombatHandoff = null;

            const existingQueueSize = Array.isArray(this.rollQueue) ? this.rollQueue.length : 0;
            if (existingQueueSize === 0) {
                setTimeout(() => {
                    this.refreshRollQueue(true).catch(error => {
                        console.warn('⚠️ Delayed combat roll queue refresh failed:', error);
                    });
                }, 750);
            }

            return combatState;
        } catch (error) {
            console.error('❌ Failed to start combat automatically:', error);
            this.addLogEntry('system', '⚠️ Automatic combat start failed. Use manual controls to begin combat.');
            return null;
        }
    }

    normalizeCombatState(state) {
        if (!state || typeof state !== 'object') {
            return state;
        }

        const normalized = { ...state };

        if (!normalized.context && this.pendingCombatHandoff?.context) {
            normalized.context = this.pendingCombatHandoff.context;
        }

        if (!normalized.participants) {
            normalized.participants = this.pendingCombatHandoff?.participants
                ? { ...this.pendingCombatHandoff.participants }
                : { players: [], enemies: [] };
        } else {
            const players = Array.isArray(normalized.participants.players) ? normalized.participants.players : [];
            const enemies = Array.isArray(normalized.participants.enemies) ? normalized.participants.enemies : [];
            normalized.participants = { players, enemies };
        }

        const order = Array.isArray(normalized.initiativeOrder) ? normalized.initiativeOrder : [];
        const seen = new Map();
        const cleanOrder = [];

        order.forEach(entry => {
            if (!entry || !entry.name) {
                return;
            }

            const key = entry.name.toLowerCase();
            const existing = seen.get(key) || {
                name: entry.name,
                id: entry.id,
                isPlayer: entry.isPlayer === true,
                initiative: null,
                ac: entry.ac ?? null,
                hp: {
                    current: null,
                    max: null
                },
                actionEconomy: entry.actionEconomy ? { ...entry.actionEconomy } : undefined
            };

            const numericInit = Number(entry.initiative);
            if (Number.isFinite(numericInit)) {
                existing.initiative = numericInit;
            }

            if (entry.ac !== undefined && entry.ac !== null) {
                existing.ac = entry.ac;
            }

            const hpCurrent = entry.hp?.current;
            const hpMax = entry.hp?.max;
            if (hpCurrent !== undefined && hpCurrent !== null && hpCurrent !== '') {
                const value = Number(hpCurrent);
                existing.hp.current = Number.isFinite(value) ? value : hpCurrent;
            }
            if (hpMax !== undefined && hpMax !== null && hpMax !== '') {
                const value = Number(hpMax);
                existing.hp.max = Number.isFinite(value) ? value : hpMax;
            }

            existing.isPlayer = existing.isPlayer || entry.isPlayer === true;

            if (!seen.has(key)) {
                seen.set(key, existing);
                cleanOrder.push(existing);
            } else {
                seen.set(key, existing);
            }
        });

        cleanOrder.sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity));

        normalized.initiativeOrder = cleanOrder;
        normalized.enemies = cleanOrder
            .filter(entry => entry && entry.isPlayer === false)
            .map(entry => ({
                name: entry.name,
                isPlayer: false,
                initiative: entry.initiative,
                ac: entry.ac ?? null,
                hp: {
                    current: entry.hp?.current ?? null,
                    max: entry.hp?.max ?? null
                }
            }));

        return normalized;
    }

    applyCombatState(combatState) {
        if (!combatState) {
            return null;
        }

        const normalized = this.normalizeCombatState(combatState);
        this.campaignState = this.campaignState || {};
        this.campaignState.combat = normalized;
        this.isCombatActive = !!normalized.active;
        this.broadcastCombatState(normalized);
        return normalized;
    }

    async enterCombatMode(combatData = [], options = {}) {
        if (this.isCombatActive) {
            console.log('⚔️ Combat already active, skipping additional start request');
            return null;
        }

        const isHandoff = combatData && typeof combatData === 'object' && !Array.isArray(combatData);
        const handoff = isHandoff ? combatData : (options?.handoffData || null);
        const enemies = isHandoff
            ? (handoff?.participants?.enemies || [])
            : (Array.isArray(combatData) ? combatData : []);
        const initiativeOverride = handoff?.initiativeOrder || options?.initiativeOrder || null;
        const playerInitiatives = options?.playerInitiatives || {};
        console.log('🔍 DEBUG enterCombatMode:', {
            isHandoff,
            hasInitiativeOverride: !!initiativeOverride,
            initiativeOverrideLength: initiativeOverride?.length,
            playerInitiatives
        });
        const contextInfo = handoff?.context || options?.context || {};

        if (handoff) {
            this.pendingCombatHandoff = handoff;
        }

        const normalizeCombatant = (entry) => {
            if (!entry) return null;
            const base = {
                name: entry.name,
                id: entry.id,
                isPlayer: entry.isPlayer === true,
                initiative: Number.isFinite(Number(entry.initiative)) ? Number(entry.initiative) : null,
                ac: entry.ac ?? null,
                hp: {
                    current: entry.hp?.current ?? null,
                    max: entry.hp?.max ?? null
                },
                actionEconomy: entry.actionEconomy ? { ...entry.actionEconomy } : {
                    action: true,
                    bonusAction: true,
                    movement: 30,
                    reaction: true
                },
                conditions: Array.isArray(entry.conditions) ? [...entry.conditions] : []
            };

            if (!base.hp.current || !base.hp.max) {
                const id = base.id || (base.name ? base.name.toLowerCase() : null);
                const charState = id ? (this.campaignState?.characters?.[id] || null) : null;
                if (charState?.hp) {
                    base.hp = {
                        current: charState.hp.current ?? base.hp.current,
                        max: charState.hp.max ?? base.hp.max
                    };
                }
                if (!base.ac && charState?.ac !== undefined) {
                    base.ac = charState.ac;
                }
            }

            return base;
        };

        let initiativeOrder = [];
        if (Array.isArray(initiativeOverride) && initiativeOverride.length > 0) {
            console.log('🔍 DEBUG: Using initiativeOverride with', initiativeOverride.length, 'entries');
            initiativeOverride.forEach(e => console.log(`  - ${e.name}: init=${e.initiative}, isPlayer=${e.isPlayer}`));
            initiativeOrder = initiativeOverride
                .map(normalizeCombatant)
                .filter(Boolean);
            console.log('🔍 DEBUG: After normalization:', initiativeOrder.map(e => `${e.name}:${e.initiative}`).join(', '));
        } else {
            console.log('🔍 DEBUG: initiativeOverride not available, building from scratch');
            const overrides = { ...playerInitiatives };
            initiativeOrder = this.buildCombatInitiative(enemies, overrides);
        }

        const metadata = {
            enemies,
            context: contextInfo,
            handoffData: handoff
        };

        return await this.startCombatSession(initiativeOrder, metadata);
    }

    async checkAndStartCombat(narrative, rollMessage) {
        // Parse initiative values from the DM's response and player's roll
        // Expected format in narrative: mentions of initiative values like "Kira (15)", "Thorne (12)", etc.
        // Expected format in rollMessage: "Roll Initiative for...: X (rolled Y...)"

        const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        try {
            // Extract initiative value from player's roll message
            const playerInitMatch = rollMessage.match(/:\s*(\d+)\s*\(/);
            if (!playerInitMatch) {
                console.log('⚠️ Could not parse player initiative value from:', rollMessage);
                return;
            }
            const configuredCharacters = Array.isArray(this.config.characters) ? this.config.characters : [];
            const playerEntries = [];
            const playerLookup = {};

            if (configuredCharacters.length > 0) {
                configuredCharacters.forEach(char => {
                    const entry = {
                        name: char.name,
                        id: char.id,
                        isPlayer: true,
                        initiative: null,
                        ac: char.ac ?? char.armorClass ?? 10,
                        hp: {
                            current: char.hp?.current ?? char.hitPoints ?? 10,
                            max: char.hp?.max ?? char.hitPoints ?? 10
                        },
                        actionEconomy: {
                            action: true,
                            bonusAction: true,
                            movement: 30,
                            reaction: true
                        }
                    };
                    playerEntries.push(entry);
                    const keyVariants = [char.name, char.id, char.name.split(/\s+/)[0]];
                    keyVariants.filter(Boolean).forEach(key => {
                        playerLookup[key.toLowerCase()] = entry;
                    });
                });
            } else {
                const fallbackName = this.character?.name || 'Player Character';
                const entry = {
                    name: fallbackName,
                    id: this.character?.id,
                    isPlayer: true,
                    initiative: null,
                    ac: this.character?.armorClass || this.character?.ac || 10,
                    hp: {
                        current: this.character?.currentHP || this.character?.hitPoints || 10,
                        max: this.character?.hitPoints || 10
                    },
                    actionEconomy: {
                        action: true,
                        bonusAction: true,
                        movement: 30,
                        reaction: true
                    }
                };
                playerEntries.push(entry);
                [fallbackName, entry.id, fallbackName.split(/\s+/)[0]].filter(Boolean).forEach(key => {
                    playerLookup[key.toLowerCase()] = entry;
                });
            }

            const cleanRollMessage = (rollMessage || '').replace(/[*_`]/g, '');
            const cleanNarrative = (narrative || '').replace(/[*_`]/g, '');

            // Pull initiatives for players from roll message first
            const rollPattern = /([A-Za-z][A-Za-z0-9'\s]+?)\s*[:\-]\s*(\d+)/g;
            let rollMatch;
            while ((rollMatch = rollPattern.exec(cleanRollMessage)) !== null) {
                const name = rollMatch[1].trim();
                const initiative = parseInt(rollMatch[2], 10);
                if (Number.isNaN(initiative)) {
                    continue;
                }
                const lookup = playerLookup[name.toLowerCase()] || playerLookup[name.split(/\s+/)[0].toLowerCase()];
                if (lookup) {
                    lookup.initiative = initiative;
                }
            }

            playerEntries.forEach(entry => {
                if (typeof entry.initiative === 'number' && !Number.isNaN(entry.initiative)) {
                    return;
                }
                const alias = entry.name.split(/\s+/)[0];
                const pattern = new RegExp(`${escapeRegex(alias)}[^\\d]*(\\d+)`, 'i');
                const match = cleanNarrative.match(pattern);
                if (match) {
                    entry.initiative = parseInt(match[1], 10);
                }
            });

            const enemies = [];
            const genericPattern = /(?:^|[\n\r\-•])\s*([A-Za-z][A-Za-z0-9'\s]+?)\s*\((\d+)\)/g;
            let genericMatch;
            while ((genericMatch = genericPattern.exec(cleanNarrative)) !== null) {
                const name = genericMatch[1].trim();
                const initiative = parseInt(genericMatch[2], 10);
                const lookup = playerLookup[name.toLowerCase()] || playerLookup[name.split(/\s+/)[0].toLowerCase()];
                if (lookup) {
                    lookup.initiative = initiative;
                } else {
                    enemies.push({
                        name,
                        initiative,
                        isPlayer: false,
                        ac: 12,
                        hp: { current: 30, max: 30 },
                        actionEconomy: {
                            action: true,
                            bonusAction: true,
                            movement: 30,
                            reaction: true
                        }
                    });
                }
            }

            const finalOrder = [];
            const finalLookup = {};
            const pushUnique = (entry) => {
                const key = entry.name.toLowerCase();
                if (finalLookup[key]) {
                    finalLookup[key] = {
                        ...finalLookup[key],
                        ...entry,
                        initiative: entry.initiative ?? finalLookup[key].initiative
                    };
                } else {
                    finalLookup[key] = { ...entry };
                    finalOrder.push(finalLookup[key]);
                }
            };

            playerEntries.forEach(entry => {
                if (typeof entry.initiative === 'number' && !Number.isNaN(entry.initiative)) {
                    pushUnique(entry);
                }
            });

            enemies.forEach(pushUnique);

            const hasInitiative = finalOrder.some(entry => typeof entry.initiative === 'number' && !Number.isNaN(entry.initiative));
            if (!hasInitiative) {
                console.log('⚠️ No initiative values found in narrative, waiting for initiative roll results before starting combat mode');
                return;
            }

            finalOrder.sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
            console.log('⚔️ Starting combat with initiative order:', finalOrder);
            await this.startCombatSession(finalOrder);
        } catch (error) {
            console.error('❌ Error starting combat:', error);
        }
    }

    getCharacterAC(characterName) {
        // Get AC from character sheet
        const char = this.campaignState?.party?.[characterName.toLowerCase()];
        return char?.ac || 10;
    }

    getCharacterHP(characterName) {
        // Get HP from character sheet
        const char = this.campaignState?.party?.[characterName.toLowerCase()];
        if (char && char.hp) {
            return {
                current: char.hp.current || char.hp.max || 10,
                max: char.hp.max || 10
            };
        }
        return { current: 10, max: 10 };
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
        const rollKey = `${this.config.localStoragePrefix}_roll_history`;
        localStorage.setItem(rollKey, JSON.stringify(this.rollHistory));

        // Update UI
        this.updateRollHistoryDisplay();
    }

    getRecentRolls(count = 5) {
        if (!this.rollHistory) {
            const rollKey = `${this.config.localStoragePrefix}_roll_history`;
            this.rollHistory = JSON.parse(localStorage.getItem(rollKey) || '[]');
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
        const rollKey = `${this.config.localStoragePrefix}_roll_history`;
        localStorage.removeItem(rollKey);
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
        const logKey = `${this.config.localStoragePrefix}_game_log`;
        let gameLogEntries = JSON.parse(localStorage.getItem(logKey) || '[]');

        // Add new entry
        gameLogEntries.push(logEntry);

        // Keep only last 100 entries to prevent localStorage bloat
        if (gameLogEntries.length > 100) {
            gameLogEntries = gameLogEntries.slice(-100);
        }

        // Save back to localStorage
        localStorage.setItem(logKey, JSON.stringify(gameLogEntries));
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
            const campaignPath = window.campaignId ? `/dnd/campaigns/${window.campaignId}/conversation-history.json` : './conversation-history.json';
            const response = await fetch(campaignPath);
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
                const logKey = `${this.config.localStoragePrefix}_game_log`;
                const stored = localStorage.getItem(logKey);
                logEntries = stored ? JSON.parse(stored) : [];
                console.log(`📝 Found ${logEntries.length} localStorage entries`);
            } catch (storageError) {
                console.error('❌ Error parsing stored log entries:', storageError);
                const logKey = `${this.config.localStoragePrefix}_game_log`;
                localStorage.removeItem(logKey);
                return;
            }
        }

        // Clear existing log
        gameLog.innerHTML = '';

        // Add starter content FIRST if log is empty or only has system messages
        const nonSystemEntries = logEntries.filter(entry => entry.author !== 'system');
        if (nonSystemEntries.length === 0) {
            // Check sandbox mode - use saved preference first, then fallbacks
            const sandboxKey = `${this.config.localStoragePrefix}_sandbox_mode`;
            const savedMode = localStorage.getItem(sandboxKey);
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
        const logKey = `${this.config.localStoragePrefix}_game_log`;
        localStorage.removeItem(logKey);
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
            const response = await fetch(`/dnd-api/dnd/ai-provider?campaign=${this.config.campaignId}`);
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
            const response = await fetch('/dnd-api/dnd/ai-provider', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    provider: selectedProvider.value,
                    campaign: this.config.campaignId
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
        const key = `${this.config.localStoragePrefix}_character`;
        localStorage.setItem(key, JSON.stringify(this.character));
    }

    loadCharacter() {
        const key = `${this.config.localStoragePrefix}_character`;
        const saved = localStorage.getItem(key);
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
        const character = urlParams.get('character') || this.config.defaultCharacter || 'dax';
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
        // Use cached preset if available
        if (!this.characterPresets) {
            this.characterPresets = {};
        }

        if (this.characterPresets[name]) {
            return this.characterPresets[name];
        }

        // First, check if character exists in campaign config
        if (this.config.characters && this.config.characters.length > 0) {
            const configChar = this.config.characters.find(char => char.id === name);
            if (configChar) {
                // Convert config format to character sheet format
                // Handle both uppercase and lowercase ability keys
                const abilities = configChar.abilities || {};
                const normalizedAbilities = {
                    STR: abilities.STR || abilities.str || 10,
                    DEX: abilities.DEX || abilities.dex || 10,
                    CON: abilities.CON || abilities.con || 10,
                    INT: abilities.INT || abilities.int || 10,
                    WIS: abilities.WIS || abilities.wis || 10,
                    CHA: abilities.CHA || abilities.cha || 10
                };

                const preset = {
                    name: configChar.name,
                    level: configChar.level || 1,
                    race: configChar.race || 'Unknown',
                    class: configChar.class || 'Adventurer',
                    image: configChar.image || null,
                    abilities: normalizedAbilities,
                    hitPoints: configChar.hp?.max || 10,
                    currentHP: configChar.hp?.current || 10,
                    armorClass: configChar.ac || 10,
                    proficiencyBonus: configChar.proficiencyBonus || 2,
                    background: configChar.background || configChar.class || 'Adventurer',
                    inventory: configChar.inventory || [],
                    equipment: configChar.equipment || [],
                    spells: configChar.spells || []
                };

                // Cache it
                this.characterPresets[name] = preset;
                return preset;
            }
        }

        // Fall back to hardcoded presets for backward compatibility (Dax campaign)
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
                ],
                equipment: [],
                spells: []
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
                ],
                equipment: [],
                spells: []
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
                ],
                equipment: [],
                spells: []
            }
        };

        const preset = presets[name];
        if (preset) {
            // Cache it
            this.characterPresets[name] = preset;
            return preset;
        }

        return null;
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
            const backupKey = `${this.config.localStoragePrefix}_sync_backup`;
            localStorage.setItem(backupKey, JSON.stringify(currentState));

            // Fetch latest campaign state from enhanced server
            const campaignParam = window.campaignId ? `?campaign=${window.campaignId}` : '';
            const response = await fetch(`/dnd-api/dnd/state${campaignParam}`);
            if (!response.ok) {
                throw new Error(`Sync failed: ${response.status}`);
            }

            const serverState = await response.json();
            console.log('🔄 Received server state:', serverState);

            // Extract credits from server state (support both structures)
            const creditsData = this.extractCreditsFromState(serverState);
            this.updateCreditsFromSync(creditsData);

            // Update character stats and conditions
            const charactersData = serverState.characters || serverState.party || {};
            this.updateCharactersFromSync(charactersData);

            // Update inventory from server
            this.updateInventoryFromSync(charactersData);

            // Update quest log
            const questsData = serverState.scene?.activeQuests || serverState.party?.activeQuests || serverState.quests?.active || [];
            this.updateQuestsFromSync(questsData);

            // Update ship status (only if ship exists in state)
            if (serverState.ship) {
                this.updateShipFromSync(serverState.ship);
            }

            // Store sync timestamp
            const syncKey = `${this.config.localStoragePrefix}_last_sync`;
            localStorage.setItem(syncKey, serverState.timestamp);

             this.broadcastCombatState(serverState.combat);

            await this.refreshRollQueue(true);

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

    async refreshRollQueue(silent = false) {
        try {
            const campaignParam = window.campaignId ? `?campaign=${window.campaignId}` : '';
            const response = await fetch(`/dnd-api/dnd/roll-queue${campaignParam}`);
            if (!response.ok) {
                throw new Error(`Roll queue fetch failed: ${response.status}`);
            }

            const data = await response.json();
            this.rollQueue = Array.isArray(data.rollQueue) ? data.rollQueue : [];

            window.dispatchEvent(new CustomEvent('rollQueueUpdate', {
                detail: {
                    rollQueue: this.rollQueue,
                    updatedAt: data.combatStateUpdatedAt || new Date().toISOString()
                }
            }));

            if (!silent) {
                console.log('🎲 Roll queue updated', this.rollQueue);
            }

            return this.rollQueue;
        } catch (error) {
            console.error('❌ Failed to refresh roll queue:', error);
            if (!silent) {
                this.addLogEntry('system', '⚠️ Unable to refresh roll queue. Please try again later.');
            }
            throw error;
        }
    }

    async submitRollResult(queueId, participantId, result = {}) {
        try {
            const payload = {
                campaignId: this.config.campaignId,
                participantId,
                ...result
            };

            const response = await fetch(`/dnd-api/dnd/roll-queue/${queueId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Roll submission failed: ${response.status}`);
            }

            const data = await response.json();
            this.rollQueue = Array.isArray(data.rollQueue) ? data.rollQueue : [];

            if (Array.isArray(this.rollQueue)) {
                this.rollQueue.forEach(entry => this.annotateCombatActionOutcome(entry));
            }
            if (data.entry) {
                this.annotateCombatActionOutcome(data.entry);
            }

            window.dispatchEvent(new CustomEvent('rollQueueUpdate', {
                detail: {
                    rollQueue: this.rollQueue,
                    entry: data.entry,
                    updatedAt: new Date().toISOString()
                }
            }));

            return data.entry;
        } catch (error) {
            console.error('❌ Roll submission error:', error);
            this.addLogEntry('system', '⚠️ Roll submission failed. Please retry or notify the DM.');
            throw error;
        }
    }

    annotateCombatActionOutcome(entry) {
        const combatAction = entry?.metadata?.combatAction;
        if (!entry || !combatAction || combatAction.kind !== 'attack') {
            return;
        }

        if (combatAction.outcome && (Number.isFinite(combatAction.outcome.total) || combatAction.outcome.hit !== undefined)) {
            return;
        }

        const participants = Array.isArray(entry.participants) ? entry.participants : [];
        const attacker = participants.find(p => p.entityType === 'player') || participants[0];
        const result = attacker?.result;
        if (!result || !Number.isFinite(result.total)) {
            return;
        }

        const targetAC = combatAction.targetAC;
        const outcome = {
            total: result.total,
            natural: result.natural ?? null,
            modifier: result.modifier ?? null,
            targetAC: Number.isFinite(targetAC) ? targetAC : null,
            hit: Number.isFinite(targetAC) ? result.total >= targetAC : null,
            crit: result.natural === 20,
            fumble: result.natural === 1
        };

        entry.metadata.combatAction.outcome = outcome;
    }

    async overrideRollQueue(queueId, override = {}) {
        try {
            const payload = {
                campaignId: this.config.campaignId,
                ...override
            };

            const response = await fetch(`/dnd-api/dnd/roll-queue/${queueId}/override`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Roll queue override failed: ${response.status}`);
            }

            const data = await response.json();
            this.rollQueue = Array.isArray(data.rollQueue) ? data.rollQueue : [];

            window.dispatchEvent(new CustomEvent('rollQueueUpdate', {
                detail: {
                    rollQueue: this.rollQueue,
                    entry: data.entry,
                    updatedAt: new Date().toISOString()
                }
            }));

            return data.entry;
        } catch (error) {
            console.error('❌ Roll queue override error:', error);
            this.addLogEntry('system', '⚠️ Unable to override roll queue entry.');
            throw error;
        }
    }

    async cancelRollQueue(queueId, reason = 'Cancelled by DM') {
        return this.overrideRollQueue(queueId, {
            status: 'cancelled',
            reason
        });
    }

    async deleteRollQueueEntry(queueId) {
        try {
            const response = await fetch(`/dnd-api/dnd/roll-queue/${queueId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignId: this.config.campaignId })
            });

            if (!response.ok) {
                throw new Error(`Roll queue delete failed: ${response.status}`);
            }

            const data = await response.json();
            this.rollQueue = Array.isArray(data.rollQueue) ? data.rollQueue : [];

            window.dispatchEvent(new CustomEvent('rollQueueUpdate', {
                detail: {
                    rollQueue: this.rollQueue,
                    removed: data.removed,
                    updatedAt: new Date().toISOString()
                }
            }));

            return data.removed;
        } catch (error) {
            console.error('❌ Roll queue delete error:', error);
            this.addLogEntry('system', '⚠️ Unable to remove roll queue entry.');
            throw error;
        }
    }

    async updateActionEconomy(combatantName, updates = {}) {
        if (!combatantName || !updates || typeof updates !== 'object') {
            return null;
        }

        try {
            const payload = {
                campaignId: this.config.campaignId,
                combatantName,
                updates
            };

            const response = await fetch('/dnd-api/dnd/combat/action-economy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Action economy update failed: ${response.status}`);
            }

            const data = await response.json();
            if (data && data.success === false) {
                throw new Error(data.error || 'Action economy update rejected by server');
            }

            if (data?.combatState) {
                return this.applyCombatState(data.combatState);
            }

            return null;
        } catch (error) {
            console.error('❌ Action economy update error:', error);
            this.addLogEntry('system', '⚠️ Unable to update action economy. Try again or adjust manually.');
            throw error;
        }
    }

    async advanceCombatTurn(options = {}) {
        try {
            const payload = {
                campaignId: this.config.campaignId,
                ...options
            };

            const response = await fetch('/dnd-api/dnd/combat/next-turn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Combat next turn failed: ${response.status}`);
            }

            const data = await response.json();
            if (data && data.success === false) {
                throw new Error(data.error || 'Failed to advance turn');
            }

            if (data?.combatState) {
                return this.applyCombatState(data.combatState);
            }

            if (data?.systemPrompt && this.campaignState?.combat) {
                this.broadcastCombatState(this.campaignState.combat);
            }

            return null;
        } catch (error) {
            console.error('❌ Combat next turn error:', error);
            this.addLogEntry('system', '⚠️ Unable to advance initiative. Try again in a moment.');
            throw error;
        }
    }

    async createCombatRollQueueEntry(rollRequest, rollDetails = {}) {
        if (!this.isCombatActive) {
            return null;
        }

        const combatState = this.campaignState?.combat;
        if (!combatState || !Array.isArray(combatState.initiativeOrder)) {
            return null;
        }

        const activeIndex = Number.isFinite(combatState.currentTurn) ? combatState.currentTurn : 0;
        const activeCombatant = combatState.initiativeOrder[activeIndex];
        if (!activeCombatant || !activeCombatant.name) {
            return null;
        }

        try {
            const flavorRegex = /\s*\((?:[^)]*?(?:waiting|pending|determine|narrative|context|flavor|dm is thinking|preparing|holding|hangs|ready|awaits|conclusion|decision))[^)]*\)\s*$/i;
            let sanitizedRequest = (rollRequest || '').split('\n')[0].trim().replace(/\s+/g, ' ');
            while (flavorRegex.test(sanitizedRequest)) {
                sanitizedRequest = sanitizedRequest.replace(flavorRegex, '').trim();
            }

            const combatAction = this.buildCombatActionMetadata(sanitizedRequest, rollDetails, activeCombatant, combatState);

            const participant = {
                participantId: activeCombatant.id || null,
                id: activeCombatant.id || null,
                name: activeCombatant.name,
                entityType: activeCombatant.isPlayer ? 'player' : 'enemy',
                ability: rollDetails?.skill || null,
                dc: rollDetails?.dc ?? null,
                advantage: rollDetails?.advantage || 'normal'
            };

            const payload = {
                campaignId: this.config.campaignId,
                reason: sanitizedRequest || rollDetails?.description || 'Combat roll',
                ability: rollDetails?.skill || null,
                dc: rollDetails?.dc ?? null,
                advantage: rollDetails?.advantage || 'normal',
                source: 'combat-auto',
                participants: [participant],
                combatAction,
                metadata: {
                    description: rollDetails?.description || sanitizedRequest || rollRequest,
                    autoCreated: true,
                    fromCombat: true,
                    combatAction
                }
            };

            const response = await fetch('/dnd-api/dnd/roll-queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Roll queue create failed: ${response.status}`);
            }

            const data = await response.json();
            if (data && data.success === false) {
                throw new Error(data.error || 'Roll queue entry rejected');
            }

            if (Array.isArray(data?.rollQueue)) {
                this.rollQueue = data.rollQueue;
                window.dispatchEvent(new CustomEvent('rollQueueUpdate', {
                    detail: {
                        rollQueue: this.rollQueue,
                        entry: data.entry,
                        updatedAt: new Date().toISOString()
                    }
                }));
            } else {
                await this.refreshRollQueue(true);
            }

            return data?.entry || null;
        } catch (error) {
            console.warn('⚠️  Unable to create combat roll queue entry:', error.message || error);
            return null;
        }
    }

    buildCombatActionMetadata(rollRequest, rollDetails, activeCombatant, combatState) {
        if (!rollRequest || !activeCombatant) {
            return null;
        }

        const normalized = rollRequest.replace(/\s+/g, ' ').trim();
        const attackMatch = normalized.match(/Roll\s+((?:Spell|Weapon)?\s*Attack)\s*\(\s*([+\-]?\d+)\s*to hit(?:,\s*vs\s*AC\s*(\d+))?\)\s*(?:with\s+([^:(]+))/i);

        const attackerInfo = {
            id: activeCombatant.id || null,
            name: activeCombatant.name || null,
            type: activeCombatant.isPlayer ? 'player' : 'enemy'
        };

        const buildSlug = (value = '') => value
            .toLowerCase()
            .trim()
            .replace(/['’]/g, '')
            .replace(/[^a-z0-9\s-]/g, '-')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        if (attackMatch) {
            const [, attackKindRaw, bonusRaw, acRaw, attackNameRaw] = attackMatch;
            const attackType = (attackKindRaw || '').toLowerCase().includes('spell') ? 'spell' : 'weapon';
            const attackBonusValue = Number.parseInt(bonusRaw, 10);
            const attackName = attackNameRaw
                ? attackNameRaw.replace(/\b(your|the|their)\b/gi, '').trim()
                : null;

            return {
                kind: 'attack',
                source: 'client',
                attacker: attackerInfo,
                attackType,
                attackName: attackName || null,
                attackSlug: attackName ? buildSlug(attackName) : null,
                attackBonus: Number.isFinite(attackBonusValue) ? attackBonusValue : null,
                targetAC: acRaw ? Number.parseInt(acRaw, 10) : null,
                pendingSteps: attackType ? ['attack', 'damage'] : ['attack'],
                advantage: rollDetails?.advantage || 'normal',
                movement: null,
                resourceUse: null,
                lookup: attackName ? {
                    type: attackType,
                    name: attackName,
                    slug: buildSlug(attackName)
                } : null,
                state: {
                    round: combatState?.round ?? null,
                    currentTurn: combatState?.currentTurn ?? null
                },
                steps: [{ type: 'attack', status: 'pending' }],
                currentStepIndex: 0,
                awaitingDamage: false
            };
        }

        const saveMatch = normalized.match(/Roll\s+([A-Za-z\s]+)\s+Saving Throw\s*\(DC\s*(\d+)\)\s+to\s+(.+)/i);
        if (saveMatch) {
            const [, abilityRaw, dcRaw, description] = saveMatch;
            return {
                kind: 'saving-throw',
                source: 'client',
                attacker: attackerInfo,
                ability: abilityRaw.trim().toLowerCase(),
                dc: Number.parseInt(dcRaw, 10),
                description: description.trim(),
                pendingSteps: ['save']
            };
        }

        return null;
    }

    extractCreditsFromState(serverState) {
        // Support multiple state structures
        const currencyAbbrev = this.config.currencyAbbrev || 'UC';

        // Try new structure (Silverpeak: party.credits)
        if (serverState.party?.credits !== undefined) {
            const totalCredits = serverState.party.credits;
            const perCharacter = this.config.characters ? Math.floor(totalCredits / this.config.characters.length) : 0;

            const creditsData = { total: totalCredits };
            if (this.config.characters) {
                this.config.characters.forEach(char => {
                    creditsData[char.id] = serverState.characters?.[char.id]?.credits || perCharacter;
                });
            }
            return creditsData;
        }

        // Try old structure (Dax: resources.party_credits + individual party.character.credits)
        if (serverState.resources?.party_credits !== undefined) {
            return {
                total: serverState.resources.party_credits,
                dax: serverState.party?.dax?.credits || 0,
                chen: serverState.party?.chen?.credits || 0,
                yuen: serverState.party?.yuen?.credits || 0
            };
        }

        // Fallback: use config defaults
        const defaultTotal = this.config.startingCredits ? this.config.startingCredits * (this.config.characters?.length || 1) : 0;
        return { total: defaultTotal };
    }

    updateCreditsFromSync(credits) {
        const currencyAbbrev = this.config.currencyAbbrev || 'UC';

        // Update total credits
        const totalElement = document.getElementById('total-credits');
        if (totalElement && credits.total !== undefined) {
            totalElement.textContent = `${credits.total.toLocaleString()} ${currencyAbbrev}`;
        }

        // Update individual character credits dynamically
        if (this.config.characters) {
            this.config.characters.forEach(char => {
                const charElement = document.getElementById(`${char.id}-credits`);
                if (charElement && credits[char.id] !== undefined) {
                    charElement.textContent = `${credits[char.id].toLocaleString()} ${currencyAbbrev}`;
                }
            });
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

        // Only show ship status for campaigns that have ships
        const isSciFi = this.config.genre === 'sci-fi' || this.config.genre === 'science-fiction';

        if (!shipData || !shipData.name) {
            // No ship - show genre-appropriate message
            const emptyMessage = isSciFi ? 'No active ship assigned' : 'No party equipment assigned';
            shipContent.innerHTML = `<p class="ship-status-empty">${emptyMessage}</p>`;
        } else if (isSciFi) {
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
        // Update inventory/equipment/spells for each character from server data
        Object.keys(characters).forEach(charKey => {
            const char = characters[charKey];
            const preset = this.getCharacterPreset(charKey);
            if (!preset) return;

            // Handle both structures: sci-fi (inventory) and fantasy (equipment/spells)
            if (char.inventory) {
                preset.inventory = char.inventory;
            }
            if (char.equipment) {
                preset.equipment = char.equipment;
            }
            if (char.spells) {
                preset.spells = char.spells;
            }
        });

        // Refresh all displays
        this.refreshAllInventoryDisplays();

        console.log('🎒 Inventory/Equipment/Spells updated from sync');
    }

    refreshAllInventoryDisplays() {
        // Get current active character from any visible section
        const activeTabs = document.querySelectorAll('.inv-tab.active');
        const activeChar = activeTabs[0]?.dataset.character || this.config.defaultCharacter;

        // Refresh inventory section
        this.refreshSectionDisplay('inventory', activeChar);

        // Refresh equipment section
        this.refreshSectionDisplay('equipment', activeChar);

        // Refresh spells section
        this.refreshSectionDisplay('spells', activeChar);
    }

    refreshSectionDisplay(section, character) {
        const preset = this.getCharacterPreset(character);
        const container = document.getElementById(`${section}-items`);
        if (!container || !preset) return;

        container.innerHTML = '';

        const items = preset[section] || [];

        if (items.length === 0) {
            container.innerHTML = `<div class="inventory-empty">No ${section} items</div>`;
            return;
        }

        items.forEach(itemName => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'inventory-item';
            itemDiv.innerHTML = `
                <span class="item-name">${itemName}</span>
            `;
            container.appendChild(itemDiv);
        });
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
        // Update ALL character tabs across all sections
        document.querySelectorAll('.inv-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.character === character) {
                tab.classList.add('active');
            }
        });

        // Refresh all section displays for this character
        this.refreshSectionDisplay('inventory', character);
        this.refreshSectionDisplay('equipment', character);
        this.refreshSectionDisplay('spells', character);
    }

    useItem(itemName, action) {
        this.addLogEntry('action', `🎒 Used ${itemName}`);
    }

    saveCampaignState() {
        const key = `${this.config.localStoragePrefix}_campaign_state`;
        const clone = { ...this.campaignState };
        if (clone && typeof clone === 'object') {
            delete clone.combat;
        }
        localStorage.setItem(key, JSON.stringify(clone));
    }

    loadCampaignState() {
        const key = `${this.config.localStoragePrefix}_campaign_state`;
        const saved = localStorage.getItem(key);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object' && parsed.combat) {
                delete parsed.combat;
            }
            return parsed;
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

    async loadLatestSceneImage() {
        const sceneDisplay = document.getElementById('scene-display');
        if (!sceneDisplay) return;

        try {
            // Check if latest.png exists for this campaign
            const imageUrl = `/dnd/campaigns/${this.config.campaignId}/generated-scenes/latest.png?t=${Date.now()}`;

            // Try to load the image
            const response = await fetch(imageUrl, { method: 'HEAD' });

            if (response.ok) {
                console.log('📸 Loading latest scene image...');
                sceneDisplay.innerHTML = `
                    <img src="${imageUrl}"
                         alt="Latest scene"
                         title="Click to view full size"
                         style="width: 100%; height: auto; display: block; border-radius: 8px; cursor: pointer;"
                         onclick="window.game.showSceneModal('${imageUrl}', 'Latest generated scene')">
                `;
            } else {
                console.log('📸 No previous scene image found');
            }
        } catch (error) {
            console.log('📸 No previous scene image found');
            // Silently fail - it's ok if there's no image yet
        }
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

// Campaign initialization is now handled by campaign-specific config files
// Set up global utilities and button listeners after campaign is loaded

// Make rollForRequest globally accessible for onclick handlers
window.rollForRequest = (diceType, rollRequest) => {
    const gameInstance = window.game || window.campaign;
    if (gameInstance) {
        gameInstance.rollForRequest(diceType, rollRequest);
    }
};

// Wait for campaign to be initialized, then set up button listeners
document.addEventListener('DOMContentLoaded', () => {
    // Wait a tick for campaign-config.js to initialize the campaign
    setTimeout(() => {
        const gameInstance = window.game || window.campaign;

        if (!gameInstance) {
            console.error('❌ No campaign instance found. Make sure campaign-config.js loaded properly.');
            return;
        }

        // Initialize roll history display
        if (gameInstance.updateRollHistoryDisplay) {
            gameInstance.updateRollHistoryDisplay();
        }

        // Add clear roll history button listener
        const clearHistoryBtn = document.getElementById('clear-roll-history');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                if (confirm('Clear all roll history?')) {
                    gameInstance.clearRollHistory();
                }
            });
        }

        // Add clear adventure log button listener
        const clearLogBtn = document.getElementById('clear-adventure-log');
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', () => {
                if (confirm('Clear entire adventure log? This cannot be undone!')) {
                    gameInstance.clearGameLog();
                }
            });
        }

        // Add scene generator button listener
        const generateSceneBtn = document.getElementById('generate-scene-btn');
        if (generateSceneBtn) {
            generateSceneBtn.addEventListener('click', async () => {
                await gameInstance.generateSceneImage();
            });
        }

        // Load latest scene image if it exists
        if (gameInstance.loadLatestSceneImage) {
            gameInstance.loadLatestSceneImage();
        }
    }, 100); // Small delay to let campaign-config.js run first
});
