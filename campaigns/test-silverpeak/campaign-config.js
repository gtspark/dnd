// Silverpeak Chronicles Campaign Configuration
// High Fantasy Campaign - Test for Shared Core Architecture

window.addEventListener('DOMContentLoaded', function() {
    const config = {
        // Campaign Identity
        campaignId: 'test-silverpeak',
        campaignName: 'Silverpeak Chronicles',
        genre: 'high-fantasy',

        // Characters (made-up original characters)
        characters: [
            {
                id: 'kira',
                name: 'Kira Moonwhisper',
                race: 'Moon Elf',
                class: 'Arcane Scholar',
                level: 3,
                image: null, // Will use placeholder
                abilities: { str: 10, dex: 14, con: 12, int: 18, wis: 13, cha: 15 },
                hp: { current: 18, max: 18 },
                ac: 13
            },
            {
                id: 'thorne',
                name: 'Thorne Ironheart',
                race: 'Mountain Dwarf',
                class: 'Battle Cleric',
                level: 3,
                image: null,
                abilities: { str: 16, dex: 10, con: 16, int: 10, wis: 17, cha: 12 },
                hp: { current: 24, max: 24 },
                ac: 16
            },
            {
                id: 'riven',
                name: 'Riven Shadowstep',
                race: 'Half-Elf',
                class: 'Shadow Rogue',
                level: 3,
                image: null,
                abilities: { str: 12, dex: 18, con: 13, int: 14, wis: 12, cha: 14 },
                hp: { current: 20, max: 20 },
                ac: 15
            }
        ],

        // Default character selection
        defaultCharacter: 'kira',

        // Local storage prefix (to avoid conflicts with other campaigns)
        localStoragePrefix: 'silverpeak',

        // Starting resources
        startingCredits: 500, // Gold pieces in fantasy
        currencyName: 'Gold Pieces',
        currencyAbbrev: 'GP',

        // Theme configuration (purple/gold fantasy aesthetic)
        theme: {
            primaryColor: '#9b59b6',      // Purple
            accentColor: '#f1c40f',       // Gold
            backgroundColor: '#2c1810',   // Dark brown (parchment-like)
            textColor: '#f4e8d8',         // Cream
            fontFamily: 'Crimson Text, serif'
        },

        // Mechanics
        mechanics: {
            abilityScores: true,
            proficiencyBonus: true,  // Unlike Dax campaign, use standard D&D proficiency
            deathSaves: true,
            spellcasting: true,      // Fantasy has magic
            techSkills: false        // No tech in fantasy
        },

        // UI customization
        ui: {
            showSceneGenerator: true,
            showPartyInventory: true,
            showQuestLog: true,
            toolsPanelLayout: 'standard'  // vs 'compact'
        }
    };

    // Initialize campaign with shared core
    if (typeof CampaignBase !== 'undefined') {
        window.campaign = new CampaignBase(config);
        window.game = window.campaign; // Alias for compatibility
        console.log('✨ Silverpeak Chronicles initialized with shared core');
    } else {
        console.error('❌ CampaignBase not loaded! Make sure shared/campaign-base.js is included first.');
    }
});
