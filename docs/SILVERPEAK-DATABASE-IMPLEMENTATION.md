# Silverpeak Database + RAG Implementation Plan

## Overview

This document outlines the architectural improvements for the Silverpeak D&D campaign to fix data consistency issues and integrate RAG-based long-term memory.

**Status:** Migration complete, integration in progress
**Affects:** Silverpeak (`test-silverpeak`) campaign ONLY
**Does NOT affect:** Dax campaign (`dnd-dax`)

---

## Problem Statement

### Current Issues

1. **Equipment Data Loss**: Items added in OOC mode don't persist (conversation history shows equipment list but `stateChanges: null`)
2. **Implicit State Management**: Relies on AI to extract state changes from narrative
3. **No Validation**: System doesn't warn when critical data won't be saved
4. **Conversation History as Database**: State buried in 26KB JSON, prone to truncation
5. **No Long-term Memory**: DM forgets events beyond conversation window

###Root Cause Analysis

**Example from conversation-history.json:**
```json
{
  "role": "player",
  "content": "the team needs weapons, can you equip them...",
  "mode": "ooc",  // ← Problem: OOC mode
  "stateChanges": null  // ← Result: Nothing persisted
}
```

Only `ic` and `dm-question` modes trigger state extraction. OOC bypasses it entirely.

---

## Solution Architecture

### 1. Structured Data Layer (SQLite)

**Location:** `/opt/vodbase/dnd-5e/database/`

**Components:**
- `schema.sql` - Database schema (characters, equipment, inventory, spells, conditions, quests, events)
- `CampaignDatabase.js` - Node.js wrapper for database operations
- `test-silverpeak.db` - Silverpeak campaign database (migrated)
- `migrate-silverpeak.js` - Migration script (already run successfully)

**Benefits:**
- ✅ Explicit CRUD operations (no AI parsing needed)
- ✅ Data validation at database level (triggers prevent negative HP, etc.)
- ✅ Referential integrity (foreign keys)
- ✅ Backwards compatible (`exportFullState()` maintains JSON format)
- ✅ Campaign isolation (each campaign = separate .db file)

### 2. RAG Memory Service (Already Built)

**Location:** `/opt/vodbase/dnd-5e/rag-service/`

**Status:** ✅ Built, tested, running on PM2

**Integration Points:**
- Before DM generates response: Retrieve relevant memories
- After each turn: Record event in both database and RAG
- Every 4 turns: Auto-summarize and create memory

**Files:**
- `memory_service.py` - Flask API (port 5003)
- `MemoryClient.js` - Node.js client (ready to integrate)
- `chroma_db/` - ChromaDB storage

### 3. Svelte UI Improvements

**Status:** Planned (not yet implemented)

**Components to Build:**
- `EquipmentManager.svelte` - Explicit item management
- `CharacterSheet.svelte` - Visual equipment slots
- `MemoryBrowser.svelte` - View campaign memories
- State validation warnings in UI

---

## Implementation Steps

### Phase 1: Database Integration (Current)

**Goal:** Replace JSON state management with database queries

**Changes to `/opt/vodbase/dnd-5e/complete-intelligent-server.js`:**

#### A. Initialize Database Connection

```javascript
const CampaignDatabase = require('./database/CampaignDatabase');

class CampaignManager {
    constructor(campaignId) {
        this.campaignId = campaignId;
        this.db = null;

        // Initialize database for Silverpeak only
        if (campaignId === 'test-silverpeak') {
            this.db = new CampaignDatabase(campaignId);
            this.db.initialize().catch(err => {
                console.error('Failed to initialize database:', err);
            });
        }

        // Existing code for other campaigns...
    }
}
```

#### B. Add Dual-Mode State Management

```javascript
async getCampaignState() {
    // For Silverpeak: use database
    if (this.campaignId === 'test-silverpeak' && this.db) {
        return await this.db.exportFullState();
    }

    // For other campaigns: use JSON
    return await this.loadStateFromJSON();
}

async updateCampaignState(updates) {
    // For Silverpeak: update database
    if (this.campaignId === 'test-silverpeak' && this.db) {
        await this.applyStateToDB(updates);
    }

    // For other campaigns: update JSON
    await this.saveStateToJSON(updates);
}
```

#### C. Implement Database State Updates

```javascript
async applyStateToDB(updates) {
    // Character HP changes
    if (updates.characters) {
        for (const [charName, charUpdates] of Object.entries(updates.characters)) {
            const character = await this.db.getCharacter(charName);

            if (charUpdates.hp) {
                await this.db.updateCharacterHP(
                    character.id,
                    charUpdates.hp.current,
                    charUpdates.hp.max
                );
            }

            // Equipment additions
            if (charUpdates.equipment?.add) {
                for (const item of charUpdates.equipment.add) {
                    await this.db.addEquipment(character.id, item, 'weapon', {});
                }
            }

            // Inventory additions
            if (charUpdates.inventory?.add) {
                for (const item of charUpdates.inventory.add) {
                    await this.db.addInventoryItem(character.id, item, 'misc');
                }
            }

            // Spell additions
            if (charUpdates.spells?.add) {
                for (const spell of charUpdates.spells.add) {
                    await this.db.addSpell(character.id, spell);
                }
            }
        }
    }

    // World state
    if (updates.world) {
        await this.db.updateCampaignState(updates.world);
    }
}
```

### Phase 2: RAG Integration

**Goal:** Add long-term memory to prevent data loss

#### A. Initialize Memory Client

```javascript
const MemoryClient = require('./MemoryClient');

class CampaignManager {
    constructor(campaignId) {
        // ... existing code ...

        // Initialize memory for Silverpeak only
        if (campaignId === 'test-silverpeak') {
            this.memoryClient = new MemoryClient('http://localhost:5003', campaignId);
            this.memoryClient.checkHealth();
        }
    }
}
```

#### B. Record Actions

```javascript
async processPlayerAction(action) {
    // ... existing DM response generation ...

    // For Silverpeak: add to memory buffer
    if (this.campaignId === 'test-silverpeak' && this.memoryClient) {
        await this.memoryClient.addAction('player', action);
        await this.memoryClient.addAction('assistant', dmResponse);
    }

    return dmResponse;
}
```

#### C. Retrieve Memories Before Response

```javascript
async generateDMResponse(playerAction, conversationHistory) {
    // For Silverpeak: retrieve relevant memories
    let memoryContext = '';
    if (this.campaignId === 'test-silverpeak' && this.memoryClient) {
        const memories = await this.memoryClient.retrieveMemories(playerAction, 5);
        memoryContext = this.memoryClient.formatMemoriesForContext(memories);
    }

    // Enhance system prompt with memories
    const enhancedSystemPrompt = systemPrompt + memoryContext;

    // Call AI with enhanced context
    const dmResponse = await aiProvider.generateResponse(enhancedSystemPrompt, conversationHistory);

    return dmResponse;
}
```

#### D. Link Database and RAG

```javascript
async recordCampaignEvent(eventType, summary, entities) {
    // Store in RAG
    const memory = await this.memoryClient.store({
        actions: this.actionBuffer,
        campaign: this.campaignId,
        session: this.currentSession
    });

    // Link in database
    await this.db.recordEvent(
        eventType,
        summary,
        entities,
        memory.id,  // Link to ChromaDB memory
        this.conversationTurnNumber
    );
}
```

### Phase 3: API Endpoints for Equipment Management

**Goal:** Explicit equipment CRUD for Svelte UI

#### Add Equipment Management Endpoints

```javascript
// Explicit equipment addition (bypass AI parsing)
app.post('/dnd-api/dnd/equipment/add', async (req, res) => {
    const { campaign, character, itemName, itemType, properties } = req.body;

    // Only for Silverpeak
    if (campaign !== 'test-silverpeak') {
        return res.status(400).json({ error: 'Database not enabled for this campaign' });
    }

    try {
        const char = await db.getCharacter(character);
        const result = await db.addEquipment(char.id, itemName, itemType, properties, true, 'player');

        res.json({
            success: true,
            equipmentId: result.lastID,
            message: `Added ${itemName} to ${character}`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all equipment for character
app.get('/dnd-api/dnd/equipment/:character', async (req, res) => {
    const { character } = req.params;
    const { campaign } = req.query;

    if (campaign !== 'test-silverpeak') {
        return res.status(400).json({ error: 'Database not enabled for this campaign' });
    }

    try {
        const char = await db.getCharacter(character);
        const equipment = await db.getEquipment(char.id);

        res.json({ success: true, equipment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remove equipment
app.delete('/dnd-api/dnd/equipment/:equipmentId', async (req, res) => {
    // ... implementation ...
});
```

### Phase 4: Svelte UI (Future)

**Components to Build:**

1. **EquipmentManager.svelte**
   - Search D&D 5e API for items
   - Add to character with one click
   - Visual confirmation
   - No AI parsing required

2. **CharacterSheet.svelte**
   - Drag-and-drop equipment slots
   - Real-time stat calculations (AC, damage, etc.)
   - Visual indicators for equipped vs inventory

3. **MemoryBrowser.svelte**
   - Timeline of campaign events
   - Semantic search across memories
   - See which memories Claude retrieved for each turn

---

## Testing Plan

### Phase 1 Tests

1. **Database Read/Write**
   - ✅ Add equipment via database
   - ✅ Verify it appears in UI
   - ✅ Confirm JSON backwards compatibility

2. **Campaign Isolation**
   - ✅ Test Silverpeak uses database
   - ✅ Test Dax still uses JSON
   - ✅ Verify no cross-contamination

3. **State Extraction**
   - Test IC mode still extracts state
   - Test dm-question mode still works
   - Verify OOC mode properly ignored

### Phase 2 Tests

1. **Memory Storage**
   - Add 8 turns of gameplay
   - Verify 2 memories created (every 4 turns)
   - Check ChromaDB contains memories

2. **Memory Retrieval**
   - Ask about event from 20 turns ago
   - Verify DM remembers correctly
   - Check which memories were retrieved

3. **Database-RAG Link**
   - Verify campaign_events table populated
   - Check embedding_id links to ChromaDB
   - Confirm entities extracted correctly

### Phase 3 Tests

1. **Equipment API**
   - POST add equipment
   - GET retrieve equipment
   - DELETE remove equipment
   - Verify state syncs to UI

2. **Error Handling**
   - Try adding equipment to non-existent character
   - Try database operations on Dax campaign (should fail gracefully)
   - Test concurrent modifications

---

## Rollback Plan

If anything breaks:

1. **Stop Silverpeak Server**
   ```bash
   pm2 stop dnd-5e
   ```

2. **Restore JSON Backup**
   ```bash
   cp /opt/vodbase/dnd-5e/campaigns/test-silverpeak/json-backup/* \
      /opt/vodbase/dnd-5e/campaigns/test-silverpeak/
   ```

3. **Revert Server Code**
   ```bash
   git checkout complete-intelligent-server.js
   ```

4. **Restart**
   ```bash
   pm2 restart dnd-5e
   ```

Database and RAG service can stay - they don't affect anything unless explicitly called.

---

## Files Modified

### Silverpeak Only:
- ✅ `/opt/vodbase/dnd-5e/database/schema.sql` (NEW)
- ✅ `/opt/vodbase/dnd-5e/database/CampaignDatabase.js` (NEW)
- ✅ `/opt/vodbase/dnd-5e/database/migrate-silverpeak.js` (NEW)
- ✅ `/opt/vodbase/dnd-5e/database/test-silverpeak.db` (NEW)
- ⏳ `/opt/vodbase/dnd-5e/complete-intelligent-server.js` (TO MODIFY)
- ⏳ `/opt/vodbase/dnd-5e/MemoryClient.js` (TO INTEGRATE)

### Untouched:
- ✅ `/opt/vodbase/dnd-dax/` (entire directory - UNTOUCHED)
- ✅ `/opt/vodbase/dnd-5e/campaigns/dnd-dax/` (if exists - UNTOUCHED)

---

## Next Steps

1. Integrate `CampaignDatabase` into `complete-intelligent-server.js`
2. Add dual-mode state management (database for Silverpeak, JSON for others)
3. Integrate `MemoryClient` for RAG
4. Add equipment management API endpoints
5. Test thoroughly
6. Build Svelte UI components (future)

---

## Success Criteria

✅ Silverpeak uses database for state management
✅ Equipment added in any mode persists correctly
✅ DM remembers events from 50+ turns ago via RAG
✅ Dax campaign completely unaffected
✅ No data loss during gameplay
✅ Backwards compatible with existing JSON format

---

**Last Updated:** 2025-10-16
**Status:** Phase 1 in progress
