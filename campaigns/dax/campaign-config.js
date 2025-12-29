// Titan Station Crisis Campaign Configuration
// Sci-Fi Campaign

window.addEventListener('DOMContentLoaded', function() {
    const config = {
        campaignId: 'dax',
        campaignName: 'Titan Station Crisis',
        genre: 'sci-fi',

        characters: [
            {
                id: 'dax',
                name: 'Dax Stargazer',
                race: 'Vexian',
                class: 'Tech Specialist',
                image: 'dax pfp.png',
                hp: { current: 9, max: 9 },
                credits: 3000,
                inventory: []
            },
            {
                id: 'chen',
                name: 'Chen',
                race: 'Human',
                class: 'Security Specialist',
                image: null,
                hp: { current: 24, max: 24 },
                credits: 800,
                inventory: []
            },
            {
                id: 'yuen',
                name: 'Dr. Yuen',
                race: 'Human',
                class: 'Medical Officer',
                image: null,
                hp: { current: 16, max: 16 },
                credits: 12000,
                inventory: []
            }
        ],

        defaultCharacter: 'dax',
        localStoragePrefix: 'dax',

        currencyName: 'Credits',
        currencyAbbrev: 'CR',
        startingCredits: 3000,

        mechanics: {
            abilityScores: false,
            spellcasting: false,
            techSkills: true,
            shipStatus: true
        },

        ui: {
            inventoryTabs: ['inventory'],
            showShipStatus: true,
            showSceneGenerator: true
        },

        theme: {
            primaryColor: '#1e40af',
            accentColor: '#fbbf24',
            backgroundColor: '#0a0e27'
        }
    };

    // Initialize campaign with shared core
    if (typeof CampaignBase !== 'undefined') {
        window.campaign = new CampaignBase(config);
        window.game = window.campaign; // Alias for compatibility
        window.campaignConfig = config; // Also expose config
        console.log('🚀 Titan Station Crisis initialized with shared core');
    } else {
        console.error('❌ CampaignBase not loaded! Make sure shared/campaign-base.js is included first.');
    }
});
