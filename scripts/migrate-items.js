#!/usr/bin/env node
/**
 * Item Migration Script
 * 
 * Fixes campaign items to use the transmog system:
 * 1. Normalizes string items to proper objects
 * 2. Parses quantities from names (e.g., "Daggers (2)" -> quantity: 2)
 * 3. Maps items to baseItem (SRD equipment slug)
 * 4. Preserves flavor names while enabling stat lookups
 */

const fs = require('fs');
const path = require('path');

// Load SRD equipment list
const srdEquipmentPath = path.join(__dirname, '../data/srd-equipment.json');
const srdEquipment = JSON.parse(fs.readFileSync(srdEquipmentPath, 'utf8'));

// Build reverse lookup: lowercase name -> slug
const nameToSlug = {};
for (const [slug, name] of Object.entries(srdEquipment)) {
    nameToSlug[name.toLowerCase()] = slug;
    // Also add the slug itself as a key (for already-slugified names)
    nameToSlug[slug.toLowerCase().replace(/-/g, ' ')] = slug;
}

// Common adjectives that indicate flavor (not part of base item)
const FLAVOR_ADJECTIVES = [
    'rusty', 'old', 'ancient', 'worn', 'battered', 'fine', 'ornate', 
    'masterwork', 'silver', 'golden', 'iron', 'steel', 'wooden',
    'enchanted', 'magical', 'cursed', 'blessed', 'holy', 'unholy',
    'dark', 'light', 'bloodstained', 'pristine', 'damaged', 'broken'
];

// Common item aliases (flavor name -> base item)
const ITEM_ALIASES = {
    'healing potion': 'potion-of-healing',
    'health potion': 'potion-of-healing',
    'rope': 'rope-hempen-50-feet',
    'rope (50ft)': 'rope-hempen-50-feet',
    'hempen rope': 'rope-hempen-50-feet',
    'silk rope': 'rope-silk-50-feet',
    'thieves\' tools': 'thieves-tools',
    'thief tools': 'thieves-tools',
    'burglar\'s pack': 'burglars-pack',
    'scholar\'s pack': 'scholars-pack',
    'priest\'s pack': 'priests-pack',
    'explorer\'s pack': 'explorers-pack',
    'dungeoneer\'s pack': 'dungeoneers-pack',
    'chain mail': 'chain-mail',
    'chainmail': 'chain-mail',
    'leather armor': 'leather-armor',
    'studded leather': 'studded-leather-armor',
    'scale mail': 'scale-mail',
    'half plate': 'half-plate-armor',
    'plate armor': 'plate-armor',
    'plate mail': 'plate-armor',
    'holy symbol': 'amulet',
    'holy symbol of moradin': 'amulet',
    'holy symbol of pelor': 'amulet',
    'unholy symbol': 'amulet',
    'arcane focus': 'crystal', // Generic fallback for arcane focus
    'spellbook': 'book', // Closest SRD item
    'journal': 'book',
    'scroll': 'paper-one-sheet',
    'robes': 'robes',
    'robe': 'robes',
    'map': 'paper-one-sheet',
    'candle': 'candle',
    'candles': 'candle',
    'chalk': 'chalk-1-piece',
    'symbol': 'amulet',
};

// Items that are intentionally custom (quest items, lore items, etc.)
// These get marked as custom: true and don't need baseItem
const CUSTOM_ITEM_PATTERNS = [
    /cultist/i,
    /ritual/i,
    /unholy/i,
    /abyssal/i,
    /demonic/i,
    /cursed/i,
    /quest/i,
    /key to/i,
    /letter from/i,
    /note from/i,
    /map of/i,  // Specific maps are custom
    /journal of/i,
    /diary of/i,
];

/**
 * Parse quantity from item name
 * "Daggers (2)" -> { name: "Dagger", quantity: 2 }
 * "2 daggers" -> { name: "Dagger", quantity: 2 }
 */
function parseQuantityFromName(name) {
    // Pattern: "Name (N)" or "Name (xN)"
    let match = name.match(/^(.+?)\s*\((?:x)?(\d+)\)$/i);
    if (match) {
        return { name: match[1].trim(), quantity: parseInt(match[2], 10) };
    }
    
    // Pattern: "N Name" or "N x Name"
    match = name.match(/^(\d+)\s*(?:x\s*)?(.+)$/i);
    if (match) {
        return { name: match[2].trim(), quantity: parseInt(match[1], 10) };
    }
    
    return { name: name.trim(), quantity: 1 };
}

/**
 * Strip flavor adjectives to find base item name
 * "Rusty Scimitar" -> "Scimitar"
 */
function stripFlavorAdjectives(name) {
    let result = name.toLowerCase();
    for (const adj of FLAVOR_ADJECTIVES) {
        result = result.replace(new RegExp(`\\b${adj}\\b`, 'gi'), '').trim();
    }
    // Clean up extra spaces
    return result.replace(/\s+/g, ' ').trim();
}

/**
 * Singularize common plurals
 * "Daggers" -> "Dagger"
 */
function singularize(name) {
    const lower = name.toLowerCase();
    
    // Common irregular plurals
    const irregulars = {
        'thieves': 'thief',
        'caltrops': 'caltrops', // Actually singular in D&D
    };
    if (irregulars[lower]) return irregulars[lower];
    
    // Standard -s plural
    if (lower.endsWith('s') && !lower.endsWith('ss')) {
        return name.slice(0, -1);
    }
    
    return name;
}

/**
 * Find the best matching SRD base item
 */
function findBaseItem(itemName) {
    const lowerName = itemName.toLowerCase().trim();
    
    // 1. Check direct aliases first
    if (ITEM_ALIASES[lowerName]) {
        return ITEM_ALIASES[lowerName];
    }
    
    // 2. Check exact match in SRD
    if (nameToSlug[lowerName]) {
        return nameToSlug[lowerName];
    }
    
    // 3. Strip flavor adjectives and try again
    const stripped = stripFlavorAdjectives(lowerName);
    if (nameToSlug[stripped]) {
        return nameToSlug[stripped];
    }
    
    // 4. Try singularized form
    const singular = singularize(stripped);
    if (nameToSlug[singular]) {
        return nameToSlug[singular];
    }
    
    // 5. Try slug format (replace spaces with dashes)
    const slugFormat = stripped.replace(/\s+/g, '-');
    if (srdEquipment[slugFormat]) {
        return slugFormat;
    }
    
    const singularSlug = singular.replace(/\s+/g, '-');
    if (srdEquipment[singularSlug]) {
        return singularSlug;
    }
    
    // 6. Fuzzy match - find items containing the key words
    const words = singular.split(' ').filter(w => w.length > 2);
    for (const [slug, name] of Object.entries(srdEquipment)) {
        const slugLower = slug.toLowerCase();
        const nameLower = name.toLowerCase();
        if (words.every(word => slugLower.includes(word) || nameLower.includes(word))) {
            return slug;
        }
    }
    
    return null; // No match found
}

/**
 * Check if an item should be marked as custom (quest/lore item)
 */
function isCustomItem(itemName) {
    return CUSTOM_ITEM_PATTERNS.some(pattern => pattern.test(itemName));
}

/**
 * Migrate a single item to the new format
 */
function migrateItem(item) {
    // If it's a string, convert to object first
    if (typeof item === 'string') {
        const { name, quantity } = parseQuantityFromName(item);
        item = {
            name: name,
            quantity: quantity,
            category: 'misc',
            condition: 'good',
            equipped: false,
            value: 0,
            stackable: false,
            treasure: false
        };
    }
    
    // Parse quantity from name if still embedded
    const { name: parsedName, quantity: parsedQty } = parseQuantityFromName(item.name);
    if (parsedQty > 1 || parsedName !== item.name) {
        item.name = parsedName;
        item.quantity = parsedQty;
    }
    
    // Ensure quantity exists
    if (!item.quantity) item.quantity = 1;
    
    // Check if this is a custom/quest item first
    if (isCustomItem(item.name)) {
        item.custom = true;
        // Don't try to map to SRD
    } else {
        // Find base item mapping
        const baseItem = findBaseItem(item.name);
        if (baseItem) {
            item.baseItem = baseItem;
        }
    }
    
    // Singularize name if it was plural with quantity
    if (parsedQty > 1) {
        item.name = singularize(item.name);
        // Capitalize first letter
        item.name = item.name.charAt(0).toUpperCase() + item.name.slice(1);
    }
    
    return item;
}

/**
 * Main migration function
 */
function migrateCampaign(campaignPath) {
    const statePath = path.join(campaignPath, 'campaign-state.json');
    
    if (!fs.existsSync(statePath)) {
        console.error(`Campaign state not found: ${statePath}`);
        return false;
    }
    
    // Backup first
    const backupPath = statePath.replace('.json', `.backup-${Date.now()}.json`);
    fs.copyFileSync(statePath, backupPath);
    console.log(`✅ Backed up to: ${backupPath}`);
    
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    
    let totalItems = 0;
    let migratedItems = 0;
    let customItems = 0;
    let unmappedItems = [];
    
    // Migrate each character's inventory
    for (const [charId, char] of Object.entries(state.characters || {})) {
        if (!char.inventory || !Array.isArray(char.inventory)) continue;
        
        console.log(`\n📦 Migrating ${char.name || charId}'s inventory:`);
        
        char.inventory = char.inventory.map(item => {
            totalItems++;
            const migrated = migrateItem(item);
            
            if (migrated.baseItem) {
                console.log(`  ✅ ${migrated.name} -> ${migrated.baseItem}${migrated.quantity > 1 ? ` (x${migrated.quantity})` : ''}`);
                migratedItems++;
            } else if (migrated.custom) {
                console.log(`  📜 ${migrated.name} -> CUSTOM (quest/lore item)`);
                customItems++;
            } else {
                console.log(`  ⚠️  ${migrated.name} -> NO BASE ITEM FOUND`);
                unmappedItems.push({ character: char.name || charId, item: migrated.name });
            }
            
            return migrated;
        });
    }
    
    // Save migrated state
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Migration complete!`);
    console.log(`  Total items: ${totalItems}`);
    console.log(`  Mapped to SRD: ${migratedItems}`);
    console.log(`  Custom items: ${customItems}`);
    console.log(`  Unmapped: ${unmappedItems.length}`);
    
    if (unmappedItems.length > 0) {
        console.log(`\n⚠️  Unmapped items (need manual baseItem assignment):`);
        for (const { character, item } of unmappedItems) {
            console.log(`  - ${character}: "${item}"`);
        }
    }
    
    return true;
}

// Run migration
const campaignDir = process.argv[2] || '/opt/dnd/campaigns/test-silverpeak';
console.log(`\n🔄 Migrating campaign: ${campaignDir}\n`);
migrateCampaign(campaignDir);
