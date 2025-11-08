-- Silverpeak Campaign Database Schema
-- Replaces implicit state extraction with explicit structured storage
-- Supports RAG integration and prevents data loss

-- ==================== CAMPAIGNS ====================

CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    genre TEXT NOT NULL, -- 'fantasy' or 'scifi'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    current_location TEXT,
    time_of_day TEXT,
    weather TEXT,
    party_credits INTEGER DEFAULT 0
);

-- ==================== CHARACTERS ====================

CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,
    name TEXT NOT NULL,
    race TEXT,
    class TEXT,
    level INTEGER DEFAULT 1,

    -- Core stats
    str INTEGER DEFAULT 10,
    dex INTEGER DEFAULT 10,
    con INTEGER DEFAULT 10,
    int INTEGER DEFAULT 10,
    wis INTEGER DEFAULT 10,
    cha INTEGER DEFAULT 10,

    -- Combat stats
    hp_current INTEGER NOT NULL,
    hp_max INTEGER NOT NULL,
    ac INTEGER DEFAULT 10,

    -- Resources
    credits INTEGER DEFAULT 0,

    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    UNIQUE(campaign_id, name)
);

-- ==================== EQUIPMENT ====================

CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,

    -- Item details
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL, -- 'weapon', 'armor', 'shield', 'tool', 'gear'

    -- Equipment state
    equipped BOOLEAN DEFAULT TRUE, -- TRUE if currently equipped/worn
    quantity INTEGER DEFAULT 1,

    -- Item properties (JSON for flexibility)
    properties TEXT, -- JSON: {"damage": "1d8", "type": "slashing", "range": "5ft"}

    -- Tracking
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    added_by TEXT DEFAULT 'dm', -- 'dm', 'player', 'loot', 'purchase'

    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- Index for fast equipment queries
CREATE INDEX IF NOT EXISTS idx_equipment_character ON equipment(character_id);
CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment(item_type);

-- ==================== INVENTORY ====================

CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,

    -- Item details
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL, -- 'consumable', 'quest', 'tool', 'misc', 'treasure'

    -- Inventory state
    quantity INTEGER DEFAULT 1,

    -- Item properties
    properties TEXT, -- JSON: {"healing": "2d4+2", "uses": 1}

    -- Tracking
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    added_by TEXT DEFAULT 'dm',

    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inventory_character ON inventory(character_id);

-- ==================== SPELLS & ABILITIES ====================

CREATE TABLE IF NOT EXISTS spells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,

    -- Spell details
    spell_name TEXT NOT NULL,
    spell_level INTEGER, -- NULL for cantrips and abilities
    spell_school TEXT, -- 'evocation', 'necromancy', etc. NULL for abilities
    is_ability BOOLEAN DEFAULT FALSE, -- TRUE for rogue features, etc.

    -- Spell state
    prepared BOOLEAN DEFAULT TRUE,
    cast_today INTEGER DEFAULT 0, -- Spell slot tracking

    -- Properties
    properties TEXT, -- JSON: {"range": "120ft", "damage": "1d10 fire", "dc": 14}

    -- Tracking
    learned_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spells_character ON spells(character_id);
CREATE INDEX IF NOT EXISTS idx_spells_prepared ON spells(character_id, prepared);

-- ==================== CONDITIONS ====================

CREATE TABLE IF NOT EXISTS conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,

    condition_name TEXT NOT NULL,
    description TEXT,
    duration TEXT, -- 'until end of turn', 'concentration', 'permanent', etc.

    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME, -- NULL for permanent conditions

    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conditions_character ON conditions(character_id);

-- ==================== QUESTS ====================

CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,

    quest_name TEXT NOT NULL,
    quest_giver TEXT,
    description TEXT,

    status TEXT DEFAULT 'active', -- 'active', 'completed', 'failed'

    -- Rewards
    reward_credits INTEGER DEFAULT 0,
    reward_items TEXT, -- JSON array of items

    -- Tracking
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,

    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- ==================== CAMPAIGN EVENTS (for RAG) ====================

CREATE TABLE IF NOT EXISTS campaign_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,

    -- Event classification
    event_type TEXT NOT NULL, -- 'combat', 'dialogue', 'exploration', 'loot', 'quest'
    summary TEXT NOT NULL, -- AI-generated summary

    -- Entity extraction
    entities TEXT, -- JSON: {"npcs": ["Elder Miriam"], "locations": ["Thornhaven"], "items": ["Warhammer"]}

    -- RAG integration
    embedding_id TEXT, -- References memory in ChromaDB

    -- Conversation link
    conversation_turn INTEGER, -- Link to conversation history entry

    -- Timestamp
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_campaign ON campaign_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON campaign_events(event_type);

-- ==================== CONVERSATION HISTORY ====================
-- Keep existing conversation history but link to structured events

CREATE TABLE IF NOT EXISTS conversation_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,

    role TEXT NOT NULL, -- 'player', 'assistant', 'dm'
    content TEXT NOT NULL,
    mode TEXT NOT NULL, -- 'ic', 'ooc', 'dm-question', 'roll'

    -- Link to structured data
    event_id INTEGER, -- Links to campaign_events if this turn created an event

    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES campaign_events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_campaign ON conversation_turns(campaign_id);

-- ==================== MIGRATION HELPERS ====================

-- View: Get full character state (replaces campaign-state.json)
CREATE VIEW IF NOT EXISTS character_full_state AS
SELECT
    c.id,
    c.campaign_id,
    c.name,
    c.race,
    c.class,
    c.level,
    c.str, c.dex, c.con, c.int, c.wis, c.cha,
    c.hp_current,
    c.hp_max,
    c.ac,
    c.credits,
    -- Aggregate equipment
    (SELECT json_group_array(item_name) FROM equipment WHERE character_id = c.id AND equipped = TRUE) as equipped_items,
    -- Aggregate inventory
    (SELECT json_group_array(item_name) FROM inventory WHERE character_id = c.id) as inventory_items,
    -- Aggregate spells
    (SELECT json_group_array(spell_name) FROM spells WHERE character_id = c.id AND prepared = TRUE) as prepared_spells,
    -- Active conditions
    (SELECT json_group_array(condition_name) FROM conditions WHERE character_id = c.id) as active_conditions
FROM characters c;

-- ==================== TRIGGERS ====================

-- Update character updated_at on any change
CREATE TRIGGER IF NOT EXISTS update_character_timestamp
AFTER UPDATE ON characters
FOR EACH ROW
BEGIN
    UPDATE characters SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update campaign updated_at when characters change
CREATE TRIGGER IF NOT EXISTS update_campaign_on_character_change
AFTER UPDATE ON characters
FOR EACH ROW
BEGIN
    UPDATE campaigns SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.campaign_id;
END;

-- Prevent negative HP
CREATE TRIGGER IF NOT EXISTS prevent_negative_hp
BEFORE UPDATE ON characters
FOR EACH ROW
WHEN NEW.hp_current < 0
BEGIN
    SELECT RAISE(FAIL, 'HP cannot be negative');
END;

-- ==================== SEED DATA ====================

-- This will be populated from existing campaign-state.json during migration
