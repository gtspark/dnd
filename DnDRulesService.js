// services/DnDRulesService.js
// Integrates dnd5eapi.co to provide spell/monster/item mechanics to AI DM

const fetch = require('node-fetch');

class DnDRulesService {
    constructor() {
        this.baseUrl = 'https://www.dnd5eapi.co/api';
        this.cache = new Map();
        this.cacheExpiry = 1000 * 60 * 60; // 1 hour cache
        this.requestTimeoutMs = 6000;
        this.maxRetries = 2;
    }

    buildSlugCandidates(rawName) {
        if (!rawName || typeof rawName !== 'string') {
            return [];
        }

        const base = rawName.trim();
        const normalized = base.normalize('NFKD');

        const candidates = new Set();

        const sanitize = (input) => input
            .toLowerCase()
            .replace(/['’]/g, '') // drop apostrophes
            .replace(/[^a-z0-9\s-]/g, '-') // replace other punctuation with dash
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        const pushCandidate = (value) => {
            if (value) {
                candidates.add(value);
            }
        };

        pushCandidate(sanitize(base));
        pushCandidate(sanitize(normalized));
        pushCandidate(sanitize(base.replace(/['’]/g, '')));
        pushCandidate(sanitize(base.replace(/\(.*?\)/g, '')));

        return Array.from(candidates).filter(Boolean);
    }

    async fetchJsonWithRetry(url, label = 'request') {
        let attempt = 0;
        let lastError = null;

        while (attempt <= this.maxRetries) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeout);

                if (response.ok) {
                    return await response.json();
                }

                if (response.status === 404) {
                    throw new Error('404 Not Found');
                }

                throw new Error(`HTTP ${response.status}`);
            } catch (error) {
                if (error.name === 'AbortError') {
                    lastError = new Error('Request timed out');
                } else {
                    lastError = error;
                }
                attempt += 1;
                const isLastAttempt = attempt > this.maxRetries;
                console.warn(`⚠️ ${label} attempt ${attempt} failed: ${lastError.message}`);
                if (isLastAttempt) {
                    break;
                }
                await new Promise(res => setTimeout(res, 200));
            }
        }

        throw lastError || new Error(`${label} failed`);
    }

    // ==================== SPELL LOOKUPS ====================

    async getSpellDetails(spellName, castAtLevel = null) {
        const cacheKey = `spell:${spellName.toLowerCase()}:${castAtLevel}`;
        
        // Check cache
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                console.log(`📚 Cache hit: ${spellName}`);
                return cached.data;
            }
        }

        try {
            // Normalize spell name for API
            const slugCandidates = this.buildSlugCandidates(spellName);
            let spell = null;
            let resolvedSlug = null;

            for (const slug of slugCandidates) {
                const url = `${this.baseUrl}/spells/${slug}`;
                try {
                    console.log(`🔍 Fetching spell: ${url}`);
                    spell = await this.fetchJsonWithRetry(url, `Spell lookup ${spellName}`);
                    resolvedSlug = slug;
                    break;
                } catch (error) {
                    if (error.message !== '404 Not Found') {
                        console.warn(`⚠️ Spell lookup retry for ${spellName} (${slug}): ${error.message}`);
                    }
                }
            }

            if (!spell) {
                throw new Error(`Spell not found: ${spellName}`);
            }

            // Enhance with computed data
            const enhanced = {
                name: spell.name,
                level: spell.level,
                school: spell.school?.name || 'Unknown',
                casting_time: spell.casting_time,
                range: spell.range,
                components: spell.components || [],
                material: spell.material || null,
                duration: spell.duration,
                concentration: spell.concentration || false,
                ritual: spell.ritual || false,
                
                // Damage information
                damage: this.extractDamage(spell, castAtLevel),
                
                // Save DC information
                dc: spell.dc ? {
                    type: spell.dc.dc_type?.name,
                    success: spell.dc.success_type
                } : null,
                
                // Area of effect
                area: spell.area_of_effect ? {
                    type: spell.area_of_effect.type,
                    size: spell.area_of_effect.size
                } : null,
                
                // Description
                description: spell.desc?.join('\n') || '',
                higher_level: spell.higher_level?.join('\n') || '',
                
                // Classes that can cast
                classes: spell.classes?.map(c => c.name) || [],
                
                // Metadata
                source: 'dnd5eapi.co',
                api_index: spell.index,
                api_slug: resolvedSlug
            };

            // Cache the result
            this.cache.set(cacheKey, {
                data: enhanced,
                timestamp: Date.now()
            });

            return enhanced;

        } catch (error) {
            console.error(`❌ Error fetching spell ${spellName}:`, error.message);
            
            // Return minimal fallback data
            return {
                name: spellName,
                error: 'Spell data unavailable',
                level: 0,
                casting_time: 'Unknown',
                description: `${spellName} (data not available - verify spell name)`
            };
        }
    }

    extractDamage(spell, castAtLevel) {
        if (!spell.damage) return null;

        // Get damage at specific cast level or base level
        const level = castAtLevel || spell.level || 1;
        
        let damageFormula = null;
        if (spell.damage.damage_at_slot_level) {
            damageFormula = spell.damage.damage_at_slot_level[level] || 
                           spell.damage.damage_at_slot_level[spell.level];
        } else if (spell.damage.damage_at_character_level) {
            // Cantrip scaling by character level (not implemented here)
            damageFormula = spell.damage.damage_at_character_level['1'];
        }

        return {
            type: spell.damage.damage_type?.name || 'Unknown',
            formula: damageFormula,
            at_level: level
        };
    }

    // ==================== MONSTER LOOKUPS ====================

    async getMonsterStats(monsterName) {
        const cacheKey = `monster:${monsterName.toLowerCase()}`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }
        }

        try {
            const slugCandidates = this.buildSlugCandidates(monsterName);
            let monster = null;
            let resolvedSlug = null;

            for (const slug of slugCandidates) {
                const url = `${this.baseUrl}/monsters/${slug}`;
                try {
                    console.log(`🐉 Fetching monster: ${url}`);
                    monster = await this.fetchJsonWithRetry(url, `Monster lookup ${monsterName}`);
                    resolvedSlug = slug;
                    break;
                } catch (error) {
                    if (error.message !== '404 Not Found') {
                        console.warn(`⚠️ Monster lookup retry for ${monsterName} (${slug}): ${error.message}`);
                    }
                }
            }

            if (!monster) {
                throw new Error(`Monster not found: ${monsterName}`);
            }

            const enhanced = {
                name: monster.name,
                size: monster.size,
                type: monster.type,
                alignment: monster.alignment,
                
                // Combat stats
                armor_class: monster.armor_class,
                hit_points: monster.hit_points,
                hit_dice: monster.hit_dice,
                
                // Ability scores
                abilities: {
                    str: monster.strength,
                    dex: monster.dexterity,
                    con: monster.constitution,
                    int: monster.intelligence,
                    wis: monster.wisdom,
                    cha: monster.charisma
                },
                
                // Movement
                speed: monster.speed,
                
                // Challenge
                challenge_rating: monster.challenge_rating,
                xp: monster.xp,
                
                // Actions
                actions: monster.actions || [],
                special_abilities: monster.special_abilities || [],
                legendary_actions: monster.legendary_actions || [],
                
                // Senses
                senses: monster.senses || {},
                languages: monster.languages || 'None',
                
                source: 'dnd5eapi.co',
                api_index: monster.index,
                api_slug: resolvedSlug
            };

            this.cache.set(cacheKey, {
                data: enhanced,
                timestamp: Date.now()
            });

            return enhanced;

        } catch (error) {
            console.error(`❌ Error fetching monster ${monsterName}:`, error.message);
            return {
                name: monsterName,
                error: 'Monster data unavailable',
                description: `${monsterName} (data not available - verify name)`
            };
        }
    }

    // ==================== ITEM LOOKUPS ====================

    async getItemDetails(itemName) {
        const cacheKey = `item:${itemName.toLowerCase()}`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }
        }

        try {
            const slugCandidates = this.buildSlugCandidates(itemName);
            let item = null;
            let resolvedSlug = null;

            for (const slug of slugCandidates) {
                const url = `${this.baseUrl}/equipment/${slug}`;
                try {
                    console.log(`⚔️ Fetching item: ${url}`);
                    item = await this.fetchJsonWithRetry(url, `Item lookup ${itemName}`);
                    resolvedSlug = slug;
                    break;
                } catch (error) {
                    if (error.message !== '404 Not Found') {
                        console.warn(`⚠️ Item lookup retry for ${itemName} (${slug}): ${error.message}`);
                    }
                }
            }

            if (!item) {
                throw new Error(`Item not found: ${itemName}`);
            }

            const enhanced = {
                name: item.name,
                equipment_category: item.equipment_category?.name,
                
                // Weapon properties
                damage: item.damage ? {
                    dice: item.damage.damage_dice,
                    type: item.damage.damage_type?.name
                } : null,
                range: item.range || null,
                properties: item.properties?.map(p => p.name) || [],
                
                // Armor properties  
                armor_class: item.armor_class || null,
                armor_category: item.armor_category,
                
                // General properties
                weight: item.weight || 0,
                cost: item.cost || null,
                
                // Magic item properties
                rarity: item.rarity?.name || null,
                requires_attunement: item.requires_attunement || false,
                
                // Description
                description: item.desc?.join('\n') || item.equipment_category?.name || '',
                
                source: 'dnd5eapi.co',
                api_index: item.index,
                api_slug: resolvedSlug
            };

            this.cache.set(cacheKey, {
                data: enhanced,
                timestamp: Date.now()
            });

            return enhanced;

        } catch (error) {
            console.error(`❌ Error fetching item ${itemName}:`, error.message);
            return {
                name: itemName,
                error: 'Item data unavailable',
                description: `${itemName} (data not available)`
            };
        }
    }

    // ==================== RULE LOOKUPS ====================

    async getRuleInfo(ruleName) {
        const cacheKey = `rule:${ruleName.toLowerCase()}`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }
        }

        try {
            const slugCandidates = this.buildSlugCandidates(ruleName);
            let rule = null;
            let resolvedSlug = null;

            for (const slug of slugCandidates) {
                const url = `${this.baseUrl}/rule-sections/${slug}`;
                try {
                    console.log(`📖 Fetching rule: ${url}`);
                    rule = await this.fetchJsonWithRetry(url, `Rule lookup ${ruleName}`);
                    resolvedSlug = slug;
                    break;
                } catch (error) {
                    if (error.message !== '404 Not Found') {
                        console.warn(`⚠️ Rule lookup retry for ${ruleName} (${slug}): ${error.message}`);
                    }
                }
            }

            if (!rule) {
                throw new Error(`Rule not found: ${ruleName}`);
            }

            const enhanced = {
                name: rule.name,
                description: rule.desc || '',
                source: 'dnd5eapi.co',
                api_index: rule.index,
                api_slug: resolvedSlug
            };

            this.cache.set(cacheKey, {
                data: enhanced,
                timestamp: Date.now()
            });

            return enhanced;

        } catch (error) {
            console.error(`❌ Error fetching rule ${ruleName}:`, error.message);
            return {
                name: ruleName,
                error: 'Rule data unavailable',
                description: 'Rule information not found'
            };
        }
    }

    // ==================== BULK OPERATIONS ====================

    async preloadCommonSpells() {
        const commonSpells = [
            'Magic Missile', 'Shield', 'Cure Wounds', 'Healing Word',
            'Fireball', 'Lightning Bolt', 'Counterspell', 'Dispel Magic',
            'Haste', 'Fly', 'Dimension Door', 'Greater Invisibility'
        ];

        console.log('📚 Preloading common spells...');
        const promises = commonSpells.map(spell => this.getSpellDetails(spell));
        await Promise.all(promises);
        console.log('✅ Common spells cached');
    }

    // ==================== CACHE MANAGEMENT ====================

    clearCache() {
        this.cache.clear();
        console.log('🧹 Rules cache cleared');
    }

    getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys())
        };
    }
}

module.exports = DnDRulesService;
