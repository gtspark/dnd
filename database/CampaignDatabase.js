/**
 * Silverpeak Campaign Database Layer
 * Replaces JSON-based state management with structured SQLite storage
 * Prevents data loss and supports RAG integration
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class CampaignDatabase {
    constructor(campaignId) {
        this.campaignId = campaignId;
        this.dbPath = path.join(__dirname, `${campaignId}.db`);
        this.db = null;
    }

    /**
     * Initialize database connection and create schema
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, async (err) => {
                if (err) {
                    console.error('Failed to open database:', err);
                    reject(err);
                    return;
                }

                console.log(`📊 Database connected: ${this.campaignId}`);

                // Load and execute schema
                try {
                    const schemaPath = path.join(__dirname, 'schema.sql');
                    const schema = fs.readFileSync(schemaPath, 'utf8');

                    await this.exec(schema);
                    console.log('✅ Database schema initialized');
                    resolve();
                } catch (error) {
                    console.error('Failed to initialize schema:', error);
                    reject(error);
                }
            });
        });
    }

    /**
     * Execute SQL statement
     */
    exec(sql) {
        return new Promise((resolve, reject) => {
            this.db.exec(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Run SQL query that doesn't return results
     */
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    /**
     * Get single row
     */
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Get all rows
     */
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // ==================== CAMPAIGN OPERATIONS ====================

    async createCampaign(name, genre) {
        return await this.run(
            `INSERT INTO campaigns (id, name, genre) VALUES (?, ?, ?)`,
            [this.campaignId, name, genre]
        );
    }

    async getCampaign() {
        return await this.get(
            `SELECT * FROM campaigns WHERE id = ?`,
            [this.campaignId]
        );
    }

    async updateCampaignState(updates) {
        const { currentLocation, timeOfDay, weather, partyCredits } = updates;
        return await this.run(
            `UPDATE campaigns
             SET current_location = COALESCE(?, current_location),
                 time_of_day = COALESCE(?, time_of_day),
                 weather = COALESCE(?, weather),
                 party_credits = COALESCE(?, party_credits),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [currentLocation, timeOfDay, weather, partyCredits, this.campaignId]
        );
    }

    // ==================== CHARACTER OPERATIONS ====================

    async createCharacter(characterData) {
        const {
            name, race, charClass, level,
            str, dex, con, int, wis, cha,
            hpCurrent, hpMax, ac, credits
        } = characterData;

        return await this.run(
            `INSERT INTO characters
             (campaign_id, name, race, class, level, str, dex, con, int, wis, cha,
              hp_current, hp_max, ac, credits)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [this.campaignId, name, race, charClass, level, str, dex, con, int, wis, cha,
             hpCurrent, hpMax, ac, credits]
        );
    }

    async getCharacter(name) {
        // Try exact match first
        let char = await this.get(
            `SELECT * FROM characters WHERE campaign_id = ? AND name = ?`,
            [this.campaignId, name]
        );

        // If not found, try case-insensitive match on first word of full name
        if (!char) {
            char = await this.get(
                `SELECT * FROM characters WHERE campaign_id = ? AND LOWER(SUBSTR(name, 1, INSTR(name || ' ', ' ') - 1)) = LOWER(?)`,
                [this.campaignId, name]
            );
        }

        return char;
    }

    async getAllCharacters() {
        return await this.all(
            `SELECT * FROM characters WHERE campaign_id = ?`,
            [this.campaignId]
        );
    }

    async updateCharacterHP(characterId, hpCurrent, hpMax = null) {
        if (hpMax !== null) {
            return await this.run(
                `UPDATE characters SET hp_current = ?, hp_max = ? WHERE id = ?`,
                [hpCurrent, hpMax, characterId]
            );
        } else {
            return await this.run(
                `UPDATE characters SET hp_current = ? WHERE id = ?`,
                [hpCurrent, characterId]
            );
        }
    }

    async updateCharacterCredits(characterId, credits) {
        return await this.run(
            `UPDATE characters SET credits = ? WHERE id = ?`,
            [credits, characterId]
        );
    }

    // ==================== EQUIPMENT OPERATIONS ====================

    async addEquipment(characterId, itemName, itemType, properties = {}, equipped = true, addedBy = 'dm') {
        return await this.run(
            `INSERT INTO equipment (character_id, item_name, item_type, equipped, properties, added_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [characterId, itemName, itemType, equipped, JSON.stringify(properties), addedBy]
        );
    }

    async getEquipment(characterId, equippedOnly = false) {
        const sql = equippedOnly
            ? `SELECT * FROM equipment WHERE character_id = ? AND equipped = TRUE`
            : `SELECT * FROM equipment WHERE character_id = ?`;

        const rows = await this.all(sql, [characterId]);

        // Parse JSON properties
        return rows.map(row => ({
            ...row,
            properties: row.properties ? JSON.parse(row.properties) : {}
        }));
    }

    async removeEquipment(equipmentId) {
        return await this.run(
            `DELETE FROM equipment WHERE id = ?`,
            [equipmentId]
        );
    }

    async toggleEquipped(equipmentId, equipped) {
        return await this.run(
            `UPDATE equipment SET equipped = ? WHERE id = ?`,
            [equipped, equipmentId]
        );
    }

    // ==================== INVENTORY OPERATIONS ====================

    async addInventoryItem(characterId, itemName, itemType, quantity = 1, properties = {}, addedBy = 'dm') {
        return await this.run(
            `INSERT INTO inventory (character_id, item_name, item_type, quantity, properties, added_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [characterId, itemName, itemType, quantity, JSON.stringify(properties), addedBy]
        );
    }

    async getInventory(characterId) {
        const rows = await this.all(
            `SELECT * FROM inventory WHERE character_id = ?`,
            [characterId]
        );

        return rows.map(row => ({
            ...row,
            properties: row.properties ? JSON.parse(row.properties) : {}
        }));
    }

    async removeInventoryItem(itemId) {
        return await this.run(
            `DELETE FROM inventory WHERE id = ?`,
            [itemId]
        );
    }

    async updateItemQuantity(itemId, quantity) {
        if (quantity <= 0) {
            return await this.removeInventoryItem(itemId);
        }
        return await this.run(
            `UPDATE inventory SET quantity = ? WHERE id = ?`,
            [quantity, itemId]
        );
    }

    // ==================== SPELL OPERATIONS ====================

    async addSpell(characterId, spellName, spellLevel = null, spellSchool = null, isAbility = false, properties = {}) {
        return await this.run(
            `INSERT INTO spells (character_id, spell_name, spell_level, spell_school, is_ability, properties)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [characterId, spellName, spellLevel, spellSchool, isAbility, JSON.stringify(properties)]
        );
    }

    async getSpells(characterId, preparedOnly = false) {
        const sql = preparedOnly
            ? `SELECT * FROM spells WHERE character_id = ? AND prepared = TRUE`
            : `SELECT * FROM spells WHERE character_id = ?`;

        const rows = await this.all(sql, [characterId]);

        return rows.map(row => ({
            ...row,
            properties: row.properties ? JSON.parse(row.properties) : {}
        }));
    }

    async removeSpell(spellId) {
        return await this.run(
            `DELETE FROM spells WHERE id = ?`,
            [spellId]
        );
    }

    async toggleSpellPrepared(spellId, prepared) {
        return await this.run(
            `UPDATE spells SET prepared = ? WHERE id = ?`,
            [prepared, spellId]
        );
    }

    async incrementSpellCast(spellId) {
        return await this.run(
            `UPDATE spells SET cast_today = cast_today + 1 WHERE id = ?`,
            [spellId]
        );
    }

    async resetDailySpellCasts(characterId) {
        return await this.run(
            `UPDATE spells SET cast_today = 0 WHERE character_id = ?`,
            [characterId]
        );
    }

    // ==================== CONDITION OPERATIONS ====================

    async addCondition(characterId, conditionName, description = null, duration = null, expiresAt = null) {
        return await this.run(
            `INSERT INTO conditions (character_id, condition_name, description, duration, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
            [characterId, conditionName, description, duration, expiresAt]
        );
    }

    async getConditions(characterId) {
        return await this.all(
            `SELECT * FROM conditions WHERE character_id = ?
             AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
            [characterId]
        );
    }

    async removeCondition(conditionId) {
        return await this.run(
            `DELETE FROM conditions WHERE id = ?`,
            [conditionId]
        );
    }

    async removeExpiredConditions() {
        return await this.run(
            `DELETE FROM conditions WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`
        );
    }

    // ==================== QUEST OPERATIONS ====================

    async createQuest(questName, questGiver, description, rewardCredits = 0, rewardItems = []) {
        return await this.run(
            `INSERT INTO quests (campaign_id, quest_name, quest_giver, description, reward_credits, reward_items)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [this.campaignId, questName, questGiver, description, rewardCredits, JSON.stringify(rewardItems)]
        );
    }

    async getQuests(status = 'active') {
        const rows = await this.all(
            `SELECT * FROM quests WHERE campaign_id = ? AND status = ?`,
            [this.campaignId, status]
        );

        return rows.map(row => ({
            ...row,
            reward_items: row.reward_items ? JSON.parse(row.reward_items) : []
        }));
    }

    async completeQuest(questId) {
        return await this.run(
            `UPDATE quests SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [questId]
        );
    }

    // ==================== CAMPAIGN EVENT OPERATIONS (for RAG) ====================

    async recordEvent(eventType, summary, entities = {}, embeddingId = null, conversationTurn = null) {
        return await this.run(
            `INSERT INTO campaign_events (campaign_id, event_type, summary, entities, embedding_id, conversation_turn)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [this.campaignId, eventType, summary, JSON.stringify(entities), embeddingId, conversationTurn]
        );
    }

    async getRecentEvents(limit = 20) {
        const rows = await this.all(
            `SELECT * FROM campaign_events WHERE campaign_id = ?
             ORDER BY occurred_at DESC LIMIT ?`,
            [this.campaignId, limit]
        );

        return rows.map(row => ({
            ...row,
            entities: row.entities ? JSON.parse(row.entities) : {}
        }));
    }

    async getEventsByType(eventType, limit = 10) {
        const rows = await this.all(
            `SELECT * FROM campaign_events WHERE campaign_id = ? AND event_type = ?
             ORDER BY occurred_at DESC LIMIT ?`,
            [this.campaignId, eventType, limit]
        );

        return rows.map(row => ({
            ...row,
            entities: row.entities ? JSON.parse(row.entities) : {}
        }));
    }

    // ==================== FULL STATE EXPORT (for backwards compatibility) ====================

    /**
     * Export full campaign state in the same format as campaign-state.json
     * Allows gradual migration from JSON to database
     */
    async exportFullState() {
        const campaign = await this.getCampaign();
        const characters = await this.getAllCharacters();

        const state = {
            characters: {},
            party: {
                credits: campaign?.party_credits || 0,
                inventory: [],
                reputation: {}
            },
            quests: {
                active: await this.getQuests('active'),
                completed: await this.getQuests('completed')
            },
            world: {
                currentLocation: campaign?.current_location || '',
                timeOfDay: campaign?.time_of_day || '',
                weather: campaign?.weather || ''
            }
        };

        // Build character data
        for (const char of characters) {
            const equipment = await this.getEquipment(char.id);
            const inventory = await this.getInventory(char.id);
            const spells = await this.getSpells(char.id);
            const conditions = await this.getConditions(char.id);

            state.characters[char.name.toLowerCase()] = {
                name: char.name,
                race: char.race,
                class: char.class,
                level: char.level,
                abilities: {
                    str: char.str,
                    dex: char.dex,
                    con: char.con,
                    int: char.int,
                    wis: char.wis,
                    cha: char.cha
                },
                hp: {
                    current: char.hp_current,
                    max: char.hp_max
                },
                ac: char.ac,
                credits: char.credits,
                inventory: inventory.map(i => i.item_name),
                equipment: equipment.filter(e => e.equipped).map(e => e.item_name),
                spells: spells.filter(s => s.prepared).map(s => s.spell_name),
                conditions: conditions.map(c => c.condition_name)
            };
        }

        return state;
    }

    /**
     * Close database connection
     */
    close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) reject(err);
                    else {
                        console.log('📊 Database closed');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = CampaignDatabase;
