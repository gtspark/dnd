# Database + RAG Integration Patch for Silverpeak

This document contains the exact changes needed to integrate the database and RAG system into `/opt/vodbase/dnd-5e/complete-intelligent-server.js`.

**Target:** Silverpeak campaign only (`test-silverpeak`)
**Unaffected:** Dax campaign and all others

---

## Summary of Changes

1. **Line 8** - Add database and memory client imports
2. **Line 854-855** - Add database and memory client properties to class
3. **Line 874-888** - Initialize database and RAG for Silverpeak in `initialize()`
4. **Line 2302** - Replace JSON state save with database save
5. **Line 3000+** - Add equipment management API endpoints
6. **Line 1973** - Add RAG memory recording

---

## Change 1: Add Imports (after line 8)

```javascript
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');

// ADD THESE LINES:
const CampaignDatabase = require('./database/CampaignDatabase');
const MemoryClient = require('./MemoryClient');
```

---

## Change 2: Add Properties to IntelligentContextManager (after line 854)

Find this section in the constructor (around line 854):
```javascript
// Campaign state (for game mechanics)
this.campaignState = null;
this.characterSheets = {};
```

Add these properties:
```javascript
// Campaign state (for game mechanics)
this.campaignState = null;
this.characterSheets = {};

// ADD THESE LINES:
// Database for structured storage (Silverpeak only)
this.db = null;
// RAG memory service (Silverpeak only)
this.memoryClient = null;
```

---

## Change 3: Initialize Database and RAG (in initialize() method, after line 874)

Find the `initialize()` method (around line 874):
```javascript
async initialize() {
    console.log('🧠 Initializing Complete Intelligent Campaign System...');

    // Load EVERYTHING
    await this.loadSystemPrompt();
    await this.loadCompleteHistory();
    await this.loadCampaignState();
    await this.buildSearchIndices();
    await this.createRelevanceMap();

    this.isLoaded = true;
    console.log(`✅ Loaded ${this.totalMemorySize} bytes of campaign history`);
    console.log(`📊 Indexed ${this.indexedEvents.length} discrete events`);
    console.log(`🎲 Campaign state loaded with ${Object.keys(this.characterSheets).length} characters`);
}
```

Replace with:
```javascript
async initialize() {
    console.log('🧠 Initializing Complete Intelligent Campaign System...');

    // Load EVERYTHING
    await this.loadSystemPrompt();
    await this.loadCompleteHistory();
    await this.loadCampaignState();
    await this.buildSearchIndices();
    await this.createRelevanceMap();

    // ADD THESE LINES: Initialize database for Silverpeak
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
```

---

## Change 4: Update State Saving (in applyStateChanges, around line 2302)

Find this line (around line 2302):
```javascript
// Save updated state
await this.updateCampaignState(this.campaignState);
```

Replace with:
```javascript
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
```

---

## Change 5: Add Database State Update Method (add after applyStateChanges method, around line 2306)

Add this new method right after the `applyStateChanges` method:

```javascript
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
                    for (const item of charChanges.equipment.add) {
                        // Try to categorize equipment type
                        let itemType = 'gear';
                        const itemLower = item.toLowerCase();
                        if (itemLower.includes('sword') || itemLower.includes('hammer') ||
                            itemLower.includes('axe') || itemLower.includes('bow') ||
                            itemLower.includes('dagger')) {
                            itemType = 'weapon';
                        } else if (itemLower.includes('armor') || itemLower.includes('mail')) {
                            itemType = 'armor';
                        } else if (itemLower.includes('shield')) {
                            itemType = 'shield';
                        }

                        await this.db.addEquipment(character.id, item, itemType, {}, true, 'ai-extracted');
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
                    for (const item of charChanges.inventory.add) {
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
                    for (const spell of charChanges.spells.add) {
                        // Detect if it's an ability vs spell
                        const isAbility = spell.includes('Feature') || spell.includes('Expertise') || spell.includes('Action');

                        // Try to extract level from spell name
                        let spellLevel = null;
                        const levelMatch = spell.match(/\((\d+)(?:st|nd|rd|th) Level\)/i);
                        if (levelMatch) {
                            spellLevel = parseInt(levelMatch[1]);
                        } else if (spell.includes('Cantrip')) {
                            spellLevel = 0;
                        }

                        await this.db.addSpell(character.id, spell, spellLevel, null, isAbility, {});
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
```

---

## Change 6: Add RAG Memory Recording (in saveConversationHistory, after line 1990)

Find this section (around line 1985-1990):
```javascript
// Apply state changes if any were extracted
if (stateChanges && Object.keys(stateChanges).length > 0) {
    await this.applyStateChanges(stateChanges);
    console.log('🔄 State changes applied:', stateChanges);
}
```

Add after it:
```javascript
// Apply state changes if any were extracted
if (stateChanges && Object.keys(stateChanges).length > 0) {
    await this.applyStateChanges(stateChanges);
    console.log('🔄 State changes applied:', stateChanges);
}

// ADD THESE LINES: Record in RAG memory (Silverpeak only)
if (this.campaignId === 'test-silverpeak' && this.memoryClient) {
    try {
        await this.memoryClient.addAction('player', playerAction);
        await this.memoryClient.addAction('assistant', dmResponse);
        console.log('🧠 Actions recorded in RAG memory');
    } catch (error) {
        console.error('⚠️  Failed to record in RAG:', error);
    }
}
```

---

## Change 7: Enhance DM Response with RAG Context (in generateResponse, around line 1550)

Find the `generateResponse` method (search for "async generateResponse"). In the method where it builds the prompt for the AI, add RAG memory retrieval.

Find this section (typically builds a prompt with context):
```javascript
// Build comprehensive system prompt with context
let systemPrompt = this.CORE_FACTS + '\n\n';
```

Replace with:
```javascript
// Build comprehensive system prompt with context
let systemPrompt = this.CORE_FACTS + '\n\n';

// ADD THESE LINES: Retrieve RAG memories (Silverpeak only)
if (this.campaignId === 'test-silverpeak' && this.memoryClient) {
    try {
        const memories = await this.memoryClient.retrieveMemories(playerAction, 5);
        if (memories && memories.length > 0) {
            const memoryContext = this.memoryClient.formatMemoriesForContext(memories);
            systemPrompt += memoryContext + '\n\n';
            console.log(`🧠 Added ${memories.length} RAG memories to context`);
        }
    } catch (error) {
        console.error('⚠️  Failed to retrieve RAG memories:', error);
    }
}
```

---

## Change 8: Add Equipment Management API Endpoints (add at end of file, before server start, around line 3100)

Add these new endpoints before the health check endpoint:

```javascript
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
```

---

## Testing the Integration

After applying these changes:

### 1. Restart the server
```bash
pm2 restart dnd-5e
pm2 logs dnd-5e
```

Look for these log messages:
- `📊 Initializing database for Silverpeak...`
- `✅ Database initialized`
- `🧠 Initializing RAG memory service...`
- `✅ RAG memory service connected`

### 2. Test equipment API
```bash
# Get equipment for Kira
curl "http://localhost:3001/api/dnd/equipment/Kira?campaign=test-silverpeak"

# Add a weapon
curl -X POST http://localhost:3001/api/dnd/equipment/add \
  -H "Content-Type: application/json" \
  -d '{
    "campaign": "test-silverpeak",
    "character": "Thorne",
    "itemName": "Warhammer",
    "itemType": "weapon",
    "properties": {"damage": "1d8", "versatile": "1d10"}
  }'
```

### 3. Verify Dax unaffected
```bash
# Check Dax still uses JSON (should NOT see database messages)
pm2 logs dnd-dax
```

---

## Rollback Instructions

If anything breaks:

```bash
# Stop server
pm2 stop dnd-5e

# Restore backup
git checkout complete-intelligent-server.js

# Or manually revert changes using this patch in reverse

# Restart
pm2 restart dnd-5e
```

The database and RAG service can stay running - they won't affect anything unless explicitly called.

---

## Summary

**What this achieves:**
- ✅ Silverpeak uses database for all state changes
- ✅ Equipment added in any mode persists correctly
- ✅ RAG provides long-term memory (remembers events 50+ turns ago)
- ✅ JSON backwards compatible (saves to both)
- ✅ Dax campaign completely unaffected
- ✅ API endpoints for explicit equipment management

**Files modified:**
- `/opt/vodbase/dnd-5e/complete-intelligent-server.js` (8 targeted changes)

**Files untouched:**
- `/opt/vodbase/dnd-dax/*` (entire directory)
- All other campaigns

