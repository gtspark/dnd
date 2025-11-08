/**
 * Memory Service Client
 * Client for interacting with the Silverpeak Memory Service (RAG system)
 */

const fetch = require('node-fetch');

class MemoryClient {
    constructor(serviceUrl = 'http://localhost:5003', campaign = 'test-silverpeak') {
        this.serviceUrl = serviceUrl;
        this.campaign = campaign;
        this.enabled = true;  // Can be disabled if service is down
        this.actionBuffer = [];  // Buffer to collect actions before storing
        this.actionBufferSize = 4;  // Store memory every 4 actions
        this.turnCounter = 0;
    }

    /**
     * Check if memory service is available
     */
    async checkHealth() {
        try {
            const response = await fetch(`${this.serviceUrl}/health`, {
                timeout: 2000
            });
            if (response.ok) {
                console.log('✓ Memory service is healthy');
                this.enabled = true;
                return true;
            }
        } catch (error) {
            console.warn('⚠️  Memory service unavailable:', error.message);
            this.enabled = false;
        }
        return false;
    }

    /**
     * Add an action to the buffer and store if buffer is full
     *
     * @param {string} role - 'player' or 'assistant'
     * @param {string} content - The action/response content
     */
    async addAction(role, content) {
        if (!this.enabled) {
            return;
        }

        this.turnCounter++;
        this.actionBuffer.push({
            role: role,
            content: content,
            turn: this.turnCounter
        });

        console.log(`📝 Action added to memory buffer (${this.actionBuffer.length}/${this.actionBufferSize})`);

        // If buffer is full, store memory
        if (this.actionBuffer.length >= this.actionBufferSize) {
            await this.flushBuffer();
        }
    }

    /**
     * Store accumulated actions as a memory
     */
    async flushBuffer() {
        if (!this.enabled || this.actionBuffer.length === 0) {
            return;
        }

        try {
            const response = await fetch(`${this.serviceUrl}/store-memory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actions: this.actionBuffer,
                    campaign: this.campaign,
                    session: 1  // TODO: Track session number
                }),
                timeout: 10000
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`💾 Memory stored: ${data.memory.id} - "${data.memory.summary.substring(0, 60)}..."`);
                console.log(`   Entities: ${data.memory.entities.join(', ')}`);

                // Clear buffer
                this.actionBuffer = [];
            } else {
                const errorText = await response.text();
                console.error('❌ Failed to store memory:', response.status, errorText);
            }
        } catch (error) {
            console.error('❌ Error storing memory:', error.message);
            // Keep actions in buffer for retry
        }
    }

    /**
     * Retrieve relevant memories for current context
     *
     * @param {string} query - Current player action or context
     * @param {number} nResults - Number of memories to retrieve (default: 5)
     * @returns {Promise<Array>} Array of relevant memories
     */
    async retrieveMemories(query, nResults = 5) {
        if (!this.enabled) {
            return [];
        }

        try {
            const response = await fetch(`${this.serviceUrl}/retrieve-memories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    campaign: this.campaign,
                    n_results: nResults
                }),
                timeout: 10000
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`🔍 Retrieved ${data.count} relevant memories`);
                return data.memories || [];
            } else {
                console.error('❌ Failed to retrieve memories:', response.status);
                return [];
            }
        } catch (error) {
            console.error('❌ Error retrieving memories:', error.message);
            return [];
        }
    }

    /**
     * Format memories for inclusion in Claude context
     *
     * @param {Array} memories - Array of memory objects
     * @returns {string} Formatted memory text for context
     */
    formatMemoriesForContext(memories) {
        if (!memories || memories.length === 0) {
            return '';
        }

        const memoryTexts = memories.map((mem, idx) => {
            const relevance = (1 - (mem.distance || 0)).toFixed(2);
            return `[Memory ${idx + 1} - Relevance: ${relevance}]\n${mem.text}`;
        });

        return `\n\n=== CAMPAIGN MEMORIES (Long-term context) ===\n${memoryTexts.join('\n\n')}\n=== END MEMORIES ===\n\n`;
    }

    /**
     * Get all memories for debugging
     *
     * @returns {Promise<Array>} All stored memories
     */
    async getAllMemories() {
        if (!this.enabled) {
            return [];
        }

        try {
            const response = await fetch(`${this.serviceUrl}/memories?campaign=${this.campaign}`, {
                timeout: 5000
            });

            if (response.ok) {
                const data = await response.json();
                return data.memories || [];
            }
        } catch (error) {
            console.error('❌ Error getting all memories:', error.message);
        }
        return [];
    }

    /**
     * Clear all memories (use with caution!)
     */
    async clearMemories() {
        if (!this.enabled) {
            return false;
        }

        try {
            const response = await fetch(`${this.serviceUrl}/clear-memories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaign: this.campaign
                }),
                timeout: 5000
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`🗑️  Cleared ${data.deleted_count} memories`);
                return true;
            }
        } catch (error) {
            console.error('❌ Error clearing memories:', error.message);
        }
        return false;
    }

    /**
     * Store monster stats from 5e API in campaign RAG for quick access
     *
     * @param {string} monsterName - Name of the monster
     * @param {object} monsterData - Full monster data from 5e API
     * @returns {Promise<boolean>} Success status
     */
    async storeMonsterStats(monsterName, monsterData) {
        if (!this.enabled) {
            return false;
        }

        try {
            // Format monster data as a searchable memory entry
            const memoryText = `Monster: ${monsterName}
HP: ${monsterData.hit_points || 'Unknown'}
AC: ${monsterData.armor_class ?
    (Array.isArray(monsterData.armor_class) ? monsterData.armor_class[0].value : monsterData.armor_class)
    : 'Unknown'}
CR: ${monsterData.challenge_rating || 'Unknown'}
Size: ${monsterData.size || 'Unknown'}
Type: ${monsterData.type || 'Unknown'}
Actions: ${monsterData.actions ? monsterData.actions.map(a => a.name).join(', ') : 'None'}`;

            const response = await fetch(`${this.serviceUrl}/store-memory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actions: [{
                        role: 'system',
                        content: memoryText,
                        turn: -1  // System memory, not tied to turn
                    }],
                    campaign: this.campaign,
                    session: 0,  // System data
                    metadata: {
                        type: 'monster_stats',
                        monster_name: monsterName,
                        source: '5e_api'
                    }
                }),
                timeout: 10000
            });

            if (response.ok) {
                return true;
            } else {
                console.warn(`⚠️  Failed to store monster stats: ${response.status}`);
                return false;
            }
        } catch (error) {
            console.error('❌ Error storing monster stats:', error.message);
            return false;
        }
    }
}

module.exports = MemoryClient;
