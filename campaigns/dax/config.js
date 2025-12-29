/**
 * Dax Campaign Configuration
 * 
 * Used by the backend to configure campaign-specific behavior.
 */

module.exports = {
    id: 'dax',
    name: 'Titan Station Adventure',
    theme: 'scifi',
    
    // Features enabled for this campaign
    features: {
        usesRAG: true,              // Enable memory/retrieval system
        narrativeCombat: true,      // Combat is narrative-only, no tactical turns
        singlePlayerCompanions: true, // Single PC with DM-controlled companions
        tacticalCombat: false       // Disable turn-based tactical combat
    },
    
    // Tools disabled for this campaign
    disabledTools: [
        'start_combat'  // Disable tactical combat initiation
    ],
    
    // Character control settings
    characters: {
        playerControlled: ['dax'],
        dmControlled: ['chen', 'yuen']
    },
    
    // UI configuration hints
    ui: {
        showInitiativeTracker: false,
        showTurnOrder: false,
        showCompanionRoster: true
    }
};
