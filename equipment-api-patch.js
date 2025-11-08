
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
        if (!contextManager.campaignState.characters[character.toLowerCase()].equipment) {
            contextManager.campaignState.characters[character.toLowerCase()].equipment = [];
        }
        contextManager.campaignState.characters[character.toLowerCase()].equipment.push(itemName);
        await contextManager.updateCampaignState(contextManager.campaignState);

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

        await contextManager.db.removeEquipment(equipmentId);

        res.json({
            success: true,
            message: 'Equipment removed'
        });
    } catch (error) {
        console.error('Remove equipment error:', error);
        res.status(500).json({ error: error.message });
    }
});

