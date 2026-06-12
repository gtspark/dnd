/**
 * Campaign Feature Configuration
 *
 * Defines which features are available for each campaign.
 * Used to replace hardcoded 'test-silverpeak' checks throughout the codebase.
 *
 * Feature Flags:
 * - usesDatabase: Campaign uses SQLite for structured storage
 * - usesRAG: Campaign uses RAG memory service for context retrieval
 * - genre: 'fantasy' | 'scifi' - affects state extraction prompts
 * - structure: 'characters' | 'party' - state structure type
 * - hasCombat: Combat system enabled (default: true for all)
 * - hasRollQueue: Dice roll queue system enabled
 * - hasEquipmentAPI: Equipment management endpoints
 * - hasSpellsAPI: Spell management endpoints
 * - hasConditionsAPI: Condition management endpoints
 * - hasCreditsAPI: Currency/credits management endpoints
 * - hasHpAPI: HP management endpoints
 * - hasEventsAPI: Campaign events endpoints
 * - hasQuestsAPI: Quest management endpoints
 * - hasShipStatus: Ship/vehicle status system (sci-fi)
 * - hasSceneGenerator: AI scene image generation
 * - hasInventoryAPI: Inventory management endpoints
 */

const campaignFeatures = {
    'test-silverpeak': {
        usesDatabase: true,
        usesRAG: true,
        genre: 'fantasy',
        structure: 'characters',  // uses state.characters.{name}
        hasCombat: true,
        hasRollQueue: true,
        hasEquipmentAPI: true,
        hasSpellsAPI: true,
        hasConditionsAPI: true,
        hasCreditsAPI: true,
        hasHpAPI: true,
        hasEventsAPI: true,
        hasQuestsAPI: true,
        hasShipStatus: false,
        hasSceneGenerator: true,
        hasInventoryAPI: true
    },
    'dax': {
        usesDatabase: true,
        usesRAG: true,           // Enable RAG memory system
        genre: 'scifi',
        structure: 'characters', // Now uses state.characters.{name} after migration
        hasCombat: false,        // Narrative combat only, no tactical system
        hasRollQueue: true,
        hasEquipmentAPI: true,
        hasSpellsAPI: false,     // Sci-fi doesn't use D&D spells
        hasConditionsAPI: true,
        hasCreditsAPI: true,
        hasHpAPI: true,
        hasEventsAPI: true,
        hasQuestsAPI: true,
        hasShipStatus: true,
        hasSceneGenerator: true,
        hasInventoryAPI: true,
        // Dax-specific features
        narrativeCombat: true,   // Combat is narrative-only
        singlePlayerCompanions: true,  // Single PC with DM companions
        disabledTools: ['start_combat'],  // Tools to disable
        maxEpisodeAge: 100,      // Long campaign - all 47+ scenes reachable
        ragResultCount: 8        // More history = more context needed
    },
    // Sandbox clone of dax for prompt-consistency evals — no RAG/DB so trials
    // are cheap and self-contained; otherwise mirrors dax behavior
    'dax-eval': {
        usesDatabase: false,
        usesRAG: false,
        genre: 'scifi',
        structure: 'characters',
        hasCombat: false,
        hasRollQueue: true,
        hasEquipmentAPI: false,
        hasSpellsAPI: false,
        hasConditionsAPI: false,
        hasCreditsAPI: false,
        hasHpAPI: false,
        hasEventsAPI: false,
        hasQuestsAPI: false,
        hasShipStatus: true,
        hasSceneGenerator: false,
        hasInventoryAPI: false,
        narrativeCombat: true,
        singlePlayerCompanions: true,
        disabledTools: ['start_combat']
    },
    'default': {
        usesDatabase: false,
        usesRAG: false,
        genre: 'fantasy',
        structure: 'party',
        hasCombat: true,
        hasRollQueue: true,
        hasEquipmentAPI: false,
        hasSpellsAPI: false,
        hasConditionsAPI: false,
        hasCreditsAPI: false,
        hasHpAPI: false,
        hasEventsAPI: false,
        hasQuestsAPI: false,
        hasShipStatus: false,
        hasSceneGenerator: false,
        hasInventoryAPI: false
    }
};

/**
 * Get features for a campaign, with fallback to default
 */
function getCampaignFeatures(campaignId) {
    return campaignFeatures[campaignId] || campaignFeatures['default'];
}

/**
 * Check if a campaign has a specific feature
 */
function hasFeature(campaignId, featureName) {
    const features = getCampaignFeatures(campaignId);
    return !!features[featureName];
}

/**
 * Get all registered campaign IDs
 */
function getRegisteredCampaigns() {
    return Object.keys(campaignFeatures);
}

module.exports = {
    campaignFeatures,
    getCampaignFeatures,
    hasFeature,
    getRegisteredCampaigns
};
