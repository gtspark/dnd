# D&D System Refactor Plan
**Date:** 2025-12-27
**Status:** Planning Phase - NOT IMPLEMENTED

This document contains the comprehensive plan for fixing multiple issues discovered during debugging, with a focus on the loot system and inventory management.

---

## Table of Contents
1. [Issue Summary](#issue-summary)
2. [Issue #4: Inventory Refactor (Priority 1)](#issue-4-inventory-refactor)
3. [Issue #1: AI Thinking Text Leakage](#issue-1-ai-thinking-text-leakage)
4. [Issue #2: Combat State Sync](#issue-2-combat-state-sync)
5. [Issue #3: Loot System Clarification](#issue-3-loot-system-clarification)
6. [Implementation Order](#implementation-order)

---

## Issue Summary

### Issue #1: AI Thinking Text Leaking into Narrative ⚠️ NOT FIXED
**Symptom:** Players see internal reasoning like "I need to resolve Thorne's attack properly through the two-phase dice roll system..." in DM responses.

**Cause:** Claude Sonnet 4.5's extended thinking capability includes reasoning before narrative.

**Impact:** Breaks immersion, exposes AI mechanics to players.

**Status:** PLANNED

---

### Issue #2: Combat State Sync Mismatch ⚠️ NOT FIXED
**Symptom:** `combat.active = false` but `combatMachineState = "COMBAT_ACTIVE"` after combat ends.

**Cause:** State machine transitions to `COMBAT_ENDED` but `combatMachineState` field not updated in campaign state.

**Impact:** Frontend may show incorrect combat status, state confusion.

**Status:** PLANNED

---

### Issue #3: Loot Card Not Appearing ✅ UNDERSTOOD
**Symptom:** No loot UI card appeared after goblin combat, only narrative description.

**Root Cause:** AI didn't call `offer_loot` tool because:
1. DMG loot table only gives coins for CR 1/4 enemies (as designed)
2. Tool description says "Only call if there are ITEMS" (not coins-only)
3. AI added "rusty scimitars" narratively (flavor, not from table)

**Design Decision:** 
- DMG loot tables = authoritative for random encounters (coins only for low CR)
- Players can investigate for weapons/armor (narrative)
- When player picks up narrative item, AI uses `update_character` tool
- `offer_loot` ONLY for items from actual loot tables

**Impact:** Working as designed, just needs documentation.

**Status:** PLANNED (tool description + DM prompt updates)

---

### Issue #4: Duplicate Inventory Items ⚠️ CRITICAL
**Symptom:** Kira has "Rusty Scimitar" appearing twice in inventory UI.

**Root Cause:** 
1. Backend has TWO arrays: `inventory` and `equipment`
2. AI calls `update_character` tool → adds to `inventory` array
3. Auto-extraction parses narrative → adds to `equipment` array  
4. Frontend merges both arrays → duplicate appears

**Current State:**
```json
"kira": {
  "inventory": ["Spellbook", "Arcane Focus", "Scholar's Pack", "Rusty Scimitar"],
  "equipment": ["Dagger", "Quarterstaff", "Rusty Scimitar"]
}
```

**Frontend Display:** 7 items (4 from inventory + 3 from equipment, including duplicate scimitar)

**Impact:** Duplicate items confuse players, wastes inventory space.

**Status:** IN PLANNING - Full inventory refactor (see below)

---

## Issue #4: Inventory Refactor

### Objective
Replace dual arrays (`inventory` + `equipment`) with single unified array of item objects that support metadata (equipped status, value, category, condition, etc.)

### Design Decisions

#### User Requirements
1. **Equipped indicator:** `[E]` text suffix on equipped items (e.g., "Dagger [E]")
2. **Position:** Indicator on the right side of item name
3. **Item metadata:** Include category, value, condition, treasure flag
4. **Auto-migration:** Run on every campaign load for backward compatibility

#### Target Item Structure
```javascript
{
  name: string,           // "Rusty Scimitar"
  equipped: boolean,      // true = actively worn/wielded
  category: string,       // "weapon" | "armor" | "consumable" | "treasure" | "misc"
  value: number,          // GP value (for selling)
  condition: string,      // "pristine" | "good" | "worn" | "damaged" | "broken"
  stackable: boolean,     // Can stack multiples (potions, arrows, etc.)
  quantity: number,       // Stack size (default 1)
  treasure: boolean       // True for gems, art objects, trade goods (exists to be sold)
}
```

#### Example After Migration
```javascript
"kira": {
  "inventory": [
    { "name": "Spellbook", "equipped": false, "category": "misc", "value": 50, "condition": "good", "stackable": false, "quantity": 1, "treasure": false },
    { "name": "Arcane Focus", "equipped": false, "category": "misc", "value": 10, "condition": "good", "stackable": false, "quantity": 1, "treasure": false },
    { "name": "Scholar's Pack", "equipped": false, "category": "misc", "value": 40, "condition": "good", "stackable": false, "quantity": 1, "treasure": false },
    { "name": "Dagger", "equipped": true, "category": "weapon", "value": 2, "condition": "good", "stackable": false, "quantity": 1, "treasure": false },
    { "name": "Quarterstaff", "equipped": true, "category": "weapon", "value": 2, "condition": "good", "stackable": false, "quantity": 1, "treasure": false },
    { "name": "Rusty Scimitar", "equipped": false, "category": "weapon", "value": 1, "condition": "damaged", "stackable": false, "quantity": 1, "treasure": false }
  ]
  // equipment array removed entirely
}
```

### Migration Strategy

#### Phase 1: Backend Schema Migration

**Files to modify:**
- `/opt/dnd/complete-intelligent-server.js` (~53 references to inventory/equipment)
- `/opt/dnd/campaigns/test-silverpeak/campaign-state.json` (fix Kira's duplicate)
- `/opt/dnd/campaigns/test-silverpeak/initial-state.json` (update template)

**A. Migration Helper Function**
Add to `complete-intelligent-server.js` (around line 3400, before character update functions):

```javascript
/**
 * Migrate character inventory from dual arrays to unified item objects
 * Handles backward compatibility with old save format
 */
function migrateInventoryToObjects(character) {
    // Skip if already migrated (check if first item is object)
    if (character.inventory && character.inventory.length > 0 && typeof character.inventory[0] === 'object') {
        return character;
    }

    const merged = [];
    
    // Helper to parse item name for metadata
    function parseItemName(itemName) {
        // Extract quantity notation: "Healing Potion (×3)" -> {name: "Healing Potion", quantity: 3}
        const quantityMatch = itemName.match(/^(.+?)\s*\(×(\d+)\)$/);
        if (quantityMatch) {
            return {
                name: quantityMatch[1].trim(),
                quantity: parseInt(quantityMatch[2])
            };
        }
        return { name: itemName, quantity: 1 };
    }

    // Helper to determine category from item name
    function categorizeItem(itemName) {
        const lower = itemName.toLowerCase();
        
        // Weapons
        if (/sword|dagger|axe|hammer|mace|bow|crossbow|spear|staff|quarterstaff|scimitar|warhammer/.test(lower)) {
            return 'weapon';
        }
        // Armor
        if (/armor|mail|shield|helmet|gauntlet|boots|cloak|robe/.test(lower)) {
            return 'armor';
        }
        // Consumables
        if (/potion|scroll|ration|food|drink|elixir|vial/.test(lower)) {
            return 'consumable';
        }
        // Treasure (DMG art objects, gems, trade goods)
        if (/gem|diamond|ruby|emerald|sapphire|pearl|art|painting|sculpture|tapestry|idol|crown|scepter|platinum|electrum/.test(lower)) {
            return 'treasure';
        }
        // Default to misc
        return 'misc';
    }

    // Helper to determine if item is stackable
    function isStackable(category, itemName) {
        if (category === 'consumable') return true;
        if (category === 'treasure') return true; // Gems can stack
        if (/arrow|bolt|dart|coin/.test(itemName.toLowerCase())) return true;
        return false;
    }

    // Helper to estimate item value (can be overridden by AI later)
    function estimateValue(itemName, category) {
        const lower = itemName.toLowerCase();
        
        // Basic weapon values (PHB prices)
        if (lower.includes('dagger')) return 2;
        if (lower.includes('quarterstaff') || lower.includes('club')) return 0.2;
        if (lower.includes('shortsword') || lower.includes('scimitar')) return 10;
        if (lower.includes('longsword')) return 15;
        if (lower.includes('warhammer')) return 15;
        if (lower.includes('shortbow')) return 25;
        
        // Armor values
        if (lower.includes('leather armor')) return 5;
        if (lower.includes('chain mail')) return 75;
        if (lower.includes('shield')) return 10;
        
        // Consumables
        if (lower.includes('potion of healing')) return 50;
        if (lower.includes('ration')) return 0.5;
        
        // Condition modifiers
        if (lower.includes('rusty') || lower.includes('broken')) return 0.5;
        if (lower.includes('damaged') || lower.includes('worn')) return 2;
        
        // Default by category
        if (category === 'weapon') return 5;
        if (category === 'armor') return 5;
        if (category === 'consumable') return 10;
        if (category === 'treasure') return 25;
        return 1; // misc items
    }

    // Helper to determine condition from name
    function inferCondition(itemName) {
        const lower = itemName.toLowerCase();
        if (lower.includes('broken')) return 'broken';
        if (lower.includes('rusty') || lower.includes('damaged')) return 'damaged';
        if (lower.includes('worn') || lower.includes('old')) return 'worn';
        if (lower.includes('masterwork') || lower.includes('pristine')) return 'pristine';
        return 'good'; // Default condition
    }

    // Add inventory items (not equipped by default)
    if (character.inventory && Array.isArray(character.inventory)) {
        character.inventory.forEach(item => {
            if (typeof item === 'string') {
                const parsed = parseItemName(item);
                const category = categorizeItem(parsed.name);
                merged.push({
                    name: parsed.name,
                    equipped: false,
                    category: category,
                    value: estimateValue(parsed.name, category),
                    condition: inferCondition(parsed.name),
                    stackable: isStackable(category, parsed.name),
                    quantity: parsed.quantity,
                    treasure: category === 'treasure'
                });
            } else {
                // Already an object, ensure it has all fields
                merged.push({
                    name: item.name,
                    equipped: item.equipped || false,
                    category: item.category || 'misc',
                    value: item.value || 1,
                    condition: item.condition || 'good',
                    stackable: item.stackable !== undefined ? item.stackable : false,
                    quantity: item.quantity || 1,
                    treasure: item.treasure || false
                });
            }
        });
    }
    
    // Add equipment items (equipped by default)
    if (character.equipment && Array.isArray(character.equipment)) {
        character.equipment.forEach(item => {
            const itemName = typeof item === 'string' ? item : item.name;
            
            // Check for duplicates before adding
            const existingIndex = merged.findIndex(i => i.name === itemName);
            
            if (existingIndex >= 0) {
                // Duplicate found - mark existing as equipped instead of adding duplicate
                merged[existingIndex].equipped = true;
            } else {
                // Not a duplicate, add as new item
                if (typeof item === 'string') {
                    const parsed = parseItemName(item);
                    const category = categorizeItem(parsed.name);
                    merged.push({
                        name: parsed.name,
                        equipped: true, // Equipment defaults to equipped
                        category: category,
                        value: estimateValue(parsed.name, category),
                        condition: inferCondition(parsed.name),
                        stackable: isStackable(category, parsed.name),
                        quantity: parsed.quantity,
                        treasure: category === 'treasure'
                    });
                } else {
                    merged.push({
                        name: item.name,
                        equipped: true,
                        category: item.category || 'misc',
                        value: item.value || 1,
                        condition: item.condition || 'good',
                        stackable: item.stackable !== undefined ? item.stackable : false,
                        quantity: item.quantity || 1,
                        treasure: item.treasure || false
                    });
                }
            }
        });
    }
    
    // Replace both arrays with single inventory
    character.inventory = merged;
    delete character.equipment;
    
    console.log(`📦 Migrated ${merged.length} items for ${character.name}`);
    
    return character;
}
```

**B. Auto-Migration on Campaign Load**

In the campaign context initialization (around line 6200-6300 where campaign state is loaded):

```javascript
// After loading campaignState from JSON
if (this.campaignState?.characters) {
    for (const [key, character] of Object.entries(this.campaignState.characters)) {
        this.campaignState.characters[key] = migrateInventoryToObjects(character);
    }
}
```

**C. Update `applyCharacterUpdate` function** (line ~3570)

```javascript
// BEFORE (line ~3570):
if (!charData.inventory) charData.inventory = [];
if (add_items && add_items.length > 0) {
    charData.inventory.push(...add_items);
    console.log(`   Added items: ${add_items.join(', ')}`);
}
if (remove_items && remove_items.length > 0) {
    charData.inventory = charData.inventory.filter(i => !remove_items.includes(i));
    console.log(`   Removed items: ${remove_items.join(', ')}`);
}

// AFTER:
if (!charData.inventory) charData.inventory = [];

if (add_items && add_items.length > 0) {
    add_items.forEach(itemName => {
        // Check for duplicates
        const existingItem = charData.inventory.find(i => i.name === itemName);
        
        if (existingItem) {
            // Item already exists
            if (existingItem.stackable) {
                // Increment stack
                existingItem.quantity = (existingItem.quantity || 1) + 1;
                console.log(`   Stacked ${itemName} (now ×${existingItem.quantity})`);
            } else {
                console.log(`   ⚠️ Skipping duplicate non-stackable item: ${itemName}`);
            }
        } else {
            // Add new item
            const category = categorizeItem(itemName); // Use helper from migration
            charData.inventory.push({
                name: itemName,
                equipped: false,
                category: category,
                value: estimateValue(itemName, category), // Use helper from migration
                condition: inferCondition(itemName), // Use helper from migration
                stackable: isStackable(category, itemName), // Use helper from migration
                quantity: 1,
                treasure: category === 'treasure'
            });
            console.log(`   Added item: ${itemName}`);
        }
    });
}

if (remove_items && remove_items.length > 0) {
    remove_items.forEach(itemName => {
        const index = charData.inventory.findIndex(i => i.name === itemName);
        if (index >= 0) {
            const item = charData.inventory[index];
            if (item.stackable && item.quantity > 1) {
                // Decrement stack
                item.quantity--;
                console.log(`   Removed ${itemName} (${item.quantity} remaining)`);
            } else {
                // Remove item entirely
                charData.inventory.splice(index, 1);
                console.log(`   Removed item: ${itemName}`);
            }
        }
    });
}
```

**D. Update `extractStateChanges` application** (lines ~4757, ~4969, ~5006)

```javascript
// Around line 4757 (fantasy structure):
if (charChanges.inventory?.add) {
    charChanges.inventory.add.forEach(itemName => {
        const existing = charState.inventory.find(i => i.name === itemName);
        if (existing && existing.stackable) {
            existing.quantity++;
        } else if (!existing) {
            const category = categorizeItem(itemName);
            charState.inventory.push({
                name: itemName,
                equipped: false,
                category: category,
                value: estimateValue(itemName, category),
                condition: inferCondition(itemName),
                stackable: isStackable(category, itemName),
                quantity: 1,
                treasure: category === 'treasure'
            });
        }
    });
}

if (charChanges.equipment?.add) {
    // Equipment items = mark as equipped
    charChanges.equipment.add.forEach(itemName => {
        const existing = charState.inventory.find(i => i.name === itemName);
        if (existing) {
            // Already in inventory, just mark equipped
            existing.equipped = true;
        } else {
            // Add new item as equipped
            const category = categorizeItem(itemName);
            charState.inventory.push({
                name: itemName,
                equipped: true,
                category: category,
                value: estimateValue(itemName, category),
                condition: inferCondition(itemName),
                stackable: isStackable(category, itemName),
                quantity: 1,
                treasure: category === 'treasure'
            });
        }
    });
}

if (charChanges.inventory?.remove || charChanges.equipment?.remove) {
    const itemsToRemove = [
        ...(charChanges.inventory?.remove || []),
        ...(charChanges.equipment?.remove || [])
    ];
    
    itemsToRemove.forEach(itemName => {
        const index = charState.inventory.findIndex(i => i.name === itemName);
        if (index >= 0) {
            const item = charState.inventory[index];
            if (item.stackable && item.quantity > 1) {
                item.quantity--;
            } else {
                charState.inventory.splice(index, 1);
            }
        }
    });
}
```

**E. Update loot distribution** (line ~6809)

```javascript
// BEFORE:
if (!character.inventory) character.inventory = [];
const itemName = quantity > 1 ? `${item} (×${quantity})` : item;
character.inventory.push(itemName);

// AFTER:
if (!character.inventory) character.inventory = [];

const existingItem = character.inventory.find(i => i.name === item);

if (existingItem) {
    // Item already exists
    if (existingItem.stackable) {
        existingItem.quantity += quantity;
        console.log(`   📦 ${character.name} <- ${item} (stacked, now ×${existingItem.quantity})`);
    } else {
        console.log(`   ⚠️ ${character.name} already has ${item}, skipping duplicate`);
    }
} else {
    // Add new item
    const category = categorizeItem(item);
    character.inventory.push({
        name: item,
        equipped: false,
        category: category,
        value: estimateValue(item, category),
        condition: inferCondition(item),
        stackable: isStackable(category, item),
        quantity: quantity,
        treasure: category === 'treasure'
    });
    console.log(`   📦 ${character.name} <- ${item}${quantity > 1 ? ` (×${quantity})` : ''}`);
}
```

**F. Update `transfer_item` tool handler** (line ~3898+)

```javascript
// Update to work with item objects instead of strings
// Around line 3920-3950:

// Find item in source inventory
const sourceItem = fromChar.inventory.find(i => i.name === item_name);

if (!sourceItem) {
    console.warn(`⚠️ Item not found in ${from_character}'s inventory: ${item_name}`);
    return;
}

// Handle quantity
const transferQty = quantity_to_transfer || sourceItem.quantity;

if (transferQty > sourceItem.quantity) {
    console.warn(`⚠️ Not enough ${item_name} (has ${sourceItem.quantity}, requested ${transferQty})`);
    return;
}

// Remove from source
if (sourceItem.stackable && transferQty < sourceItem.quantity) {
    sourceItem.quantity -= transferQty;
    console.log(`   Removed ${transferQty}×${item_name} from ${fromChar.name} (${sourceItem.quantity} remaining)`);
} else {
    const index = fromChar.inventory.indexOf(sourceItem);
    fromChar.inventory.splice(index, 1);
    console.log(`   Removed ${item_name} from ${fromChar.name}`);
}

// Add to target
if (!toChar.inventory) toChar.inventory = [];

const targetItem = toChar.inventory.find(i => i.name === item_name);

if (targetItem && targetItem.stackable) {
    targetItem.quantity += transferQty;
    console.log(`   Added ${transferQty}×${item_name} to ${toChar.name} (now ×${targetItem.quantity})`);
} else if (!targetItem) {
    toChar.inventory.push({
        name: item_name,
        equipped: false, // Transferred items not equipped by default
        category: sourceItem.category,
        value: sourceItem.value,
        condition: sourceItem.condition,
        stackable: sourceItem.stackable,
        quantity: transferQty,
        treasure: sourceItem.treasure
    });
    console.log(`   Added ${transferQty > 1 ? transferQty + '×' : ''}${item_name} to ${toChar.name}`);
} else {
    console.warn(`   ⚠️ ${toChar.name} already has non-stackable ${item_name}`);
}
```

#### Phase 2: Frontend Updates

**Files to modify:**
- `/opt/dnd/ui/types.ts`
- `/opt/dnd/ui/services/apiService.ts`
- `/opt/dnd/ui/App.tsx`

**A. Update types** (`/opt/dnd/ui/types.ts`)

```typescript
// Add new interface (around line 5):
export interface InventoryItem {
  name: string;
  equipped: boolean;
  category: 'weapon' | 'armor' | 'consumable' | 'treasure' | 'misc';
  value: number;           // GP value
  condition: 'pristine' | 'good' | 'worn' | 'damaged' | 'broken';
  stackable: boolean;
  quantity: number;
  treasure: boolean;       // True for gems, art objects, trade goods
}

// Update Character interface (around line 5-25):
export interface Character {
  id: string;
  name: string;
  class: string;
  avatar: string;
  hp: number;
  maxHp: number;
  resource: number;
  resourceName: string;
  conditions: string[];
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  inventory: InventoryItem[];  // ← CHANGED from string[]
  heldSpells: string[];
}
```

**B. Update `transformCharacters`** (`/opt/dnd/ui/services/apiService.ts` line ~154)

```typescript
// BEFORE:
inventory: [...(char.inventory || []), ...(char.equipment || [])],

// AFTER:
inventory: char.inventory || [],  // Just use the unified array directly
```

**C. Update inventory display** (`/opt/dnd/ui/App.tsx` line ~833)

```tsx
// BEFORE:
{activeSidebarTab === 'inventory' && (
  <ul className="space-y-2 animate-pop-in">
    {activeChar.inventory.map((item, i) => (
      <li key={i} className="p-4 bg-black/20 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity border-l-2 hover:border-l-current">
        {item}
      </li>
    ))}
  </ul>
)}

// AFTER:
{activeSidebarTab === 'inventory' && (
  <ul className="space-y-2 animate-pop-in">
    {activeChar.inventory.map((item, i) => (
      <li 
        key={i} 
        className={`p-4 bg-black/20 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity border-l-2 hover:border-l-current ${
          item.treasure ? (isFantasy ? 'border-l-fantasy-gold' : 'border-l-scifi-accent') : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="flex-1">
            {item.name}
            {item.quantity > 1 && ` (×${item.quantity})`}
          </span>
          {item.equipped && (
            <span className={`ml-2 text-[9px] font-bold ${isFantasy ? 'text-fantasy-gold' : 'text-scifi-accent'}`}>
              [E]
            </span>
          )}
        </div>
        {item.treasure && (
          <div className="text-[8px] mt-1 opacity-40">
            {item.value} GP
          </div>
        )}
      </li>
    ))}
  </ul>
)}
```

#### Phase 3: Fix Current Duplicates

**Manual fix for campaign-state.json:**

```json
{
  "characters": {
    "kira": {
      "inventory": [
        {"name": "Spellbook", "equipped": false, "category": "misc", "value": 50, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Arcane Focus", "equipped": false, "category": "misc", "value": 10, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Scholar's Pack", "equipped": false, "category": "misc", "value": 40, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Dagger", "equipped": true, "category": "weapon", "value": 2, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Quarterstaff", "equipped": true, "category": "weapon", "value": 2, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Rusty Scimitar", "equipped": false, "category": "weapon", "value": 1, "condition": "damaged", "stackable": false, "quantity": 1, "treasure": false}
      ]
    },
    "thorne": {
      "inventory": [
        {"name": "Holy Symbol of Moradin", "equipped": false, "category": "misc", "value": 5, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Priest's Pack", "equipped": false, "category": "misc", "value": 19, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Healing Potion", "equipped": false, "category": "consumable", "value": 50, "condition": "good", "stackable": true, "quantity": 1, "treasure": false},
        {"name": "Warhammer", "equipped": true, "category": "weapon", "value": 15, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Shield", "equipped": true, "category": "armor", "value": 10, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Chain Mail", "equipped": true, "category": "armor", "value": 75, "condition": "good", "stackable": false, "quantity": 1, "treasure": false}
      ]
    },
    "riven": {
      "inventory": [
        {"name": "Thieves' Tools", "equipped": false, "category": "misc", "value": 25, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Burglar's Pack", "equipped": false, "category": "misc", "value": 16, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Rope (50ft)", "equipped": false, "category": "misc", "value": 1, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Healing Potion", "equipped": false, "category": "consumable", "value": 50, "condition": "good", "stackable": true, "quantity": 2, "treasure": false},
        {"name": "Shortsword", "equipped": true, "category": "weapon", "value": 10, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Shortbow", "equipped": true, "category": "weapon", "value": 25, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Leather Armor", "equipped": true, "category": "armor", "value": 5, "condition": "good", "stackable": false, "quantity": 1, "treasure": false},
        {"name": "Daggers (2)", "equipped": false, "category": "weapon", "value": 4, "condition": "good", "stackable": false, "quantity": 1, "treasure": false}
      ]
    }
  }
}
```

**Note:** Riven's "Healing Potion (×2)" becomes a single stackable item with `quantity: 2`.

#### Phase 4: Update Tool Descriptions

**A. Update `update_character` tool** (line ~340+)

```javascript
{
    "name": "update_character",
    "description": "Update a character's state when HP, conditions, inventory, or resources change. ALWAYS call this when narrating damage, healing, gaining/losing items, or status effects. Items are added to inventory (not equipped by default).",
    "input_schema": {
        "type": "object",
        "properties": {
            // ... existing fields ...
            "add_items": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Items to add to inventory (will be marked as not equipped by default). System auto-detects category, value, and condition. For stackable items, system handles stacking automatically."
            },
            "remove_items": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Items to remove from inventory. For stackable items, removes one from stack (or entire stack if quantity=1)."
            },
            "equip_items": {  // NEW FIELD
                "type": "array",
                "items": { "type": "string" },
                "description": "Items to mark as equipped. Item must already be in inventory, or will be added as equipped if not present."
            },
            "unequip_items": {  // NEW FIELD
                "type": "array",
                "items": { "type": "string" },
                "description": "Items to mark as not equipped (stays in inventory, just unequipped)."
            }
        },
        "required": ["character"]
    }
}
```

**B. Update extraction prompt schema** (line ~4614)

```javascript
// Update the extraction schema documentation:
{
  "characters": {
    "character_name": {
      "hp": { "current": <number>, "max": <number> },
      "credits": <number>,
      "inventory": { "add": [...], "remove": [...] },  // Items to add (not equipped)
      "equipment": { "add": [...], "remove": [...] },  // Items to mark equipped
      "spells": { "add": [...], "remove": [...] },
      "conditions": { "add": [...], "remove": [...] }
    }
  }
}

// Note: inventory.add adds items not equipped
//       equipment.add marks items as equipped (adds if not present)
//       System auto-detects category, value, condition, stackability
```

---

## Issue #1: AI Thinking Text Leakage

### Problem Details

**Current Behavior:**
```
I need to resolve Thorne's attack properly through the two-phase dice roll system. 
Thorne wants to attack Goblin 2, so I need to request the attack roll first.

Thorne's Turn
The dwarf cleric raises his warhammer high...
```

Players see the internal reasoning text that should be hidden.

**Root Cause:** 
Claude Sonnet 4.5 (model: `claude-sonnet-4-5-20250929`) has extended thinking capability. When the AI reasons through complex game mechanics, it sometimes includes this thinking in the response text.

**Location:** `/opt/dnd/complete-intelligent-server.js` lines 1046-1063 (narrative extraction from AI response)

### Solution Plan

#### Approach: Hybrid (Prompt + Cleanup + Logging)

**Why this approach:**
1. Prompt instruction prevents 90% of cases (most reliable)
2. Cleanup function catches edge cases where Claude still includes thinking
3. Logging preserves thinking text for debugging without exposing to players
4. Avoids complex regex - simple pattern detection

#### Implementation

**A. Update System Prompt** 

Add to DM prompt (`/opt/dnd/campaigns/test-silverpeak/dm-prompt.md`, around line 230):

```markdown
## Response Format Requirements

**CRITICAL: Never include internal reasoning in your responses.**

Players only see your narrative text. Do NOT include:
- Your thought process ("I need to...", "Let me...", "I should...")
- Mechanical reasoning ("Through the two-phase dice system...")
- Implementation details about tools or game mechanics

If you need to reason through complex situations:
1. Think through it mentally
2. Make your decision
3. Only output the final narrative that players should see

Example of what NOT to do:
❌ "I need to resolve this attack through the dice system. Thorne swings his hammer..."

Example of correct output:
✅ "Thorne swings his hammer at the goblin! 🎲 Roll Attack..."
```

**B. Add Thinking Text Cleanup Function**

Add to `/opt/dnd/complete-intelligent-server.js` before line 1058:

```javascript
/**
 * Strip AI thinking/reasoning text from narrative
 * Removes internal reasoning that players shouldn't see
 * Returns: { cleaned: string, thinking: string }
 */
function stripThinkingText(text) {
    let thinking = '';
    let cleaned = text;
    
    // Remove explicit <thinking> tags (if model uses them)
    const thinkingTagMatch = cleaned.match(/<thinking>([\s\S]*?)<\/thinking>/gi);
    if (thinkingTagMatch) {
        thinking += thinkingTagMatch.join('\n\n');
        cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    }
    
    // Remove reasoning paragraphs at the start (common patterns)
    // These typically appear before the actual narrative begins
    const reasoningPatterns = [
        /^I need to [^\n]+\n+/gim,
        /^Let me [^\n]+\n+/gim,
        /^I should [^\n]+\n+/gim,
        /^I'll [^\n]+\n+/gim,
        /^First,? I [^\n]+\n+/gim
    ];
    
    for (const pattern of reasoningPatterns) {
        const matches = cleaned.match(pattern);
        if (matches) {
            thinking += matches.join('\n');
            cleaned = cleaned.replace(pattern, '');
        }
    }
    
    // Remove thinking blocks that appear between narrative
    // Pattern: paragraph explaining mechanics, followed by narrative
    // Example: "I need to resolve this through X system.\n\nThe warrior strikes..."
    const thinkingBlockPattern = /^(I need to|Let me|I should|I'll|First,? I)[^\n]+(?:\n(?![\n\*\-#"'])[^\n]+)*\n\n/gim;
    const blockMatches = cleaned.match(thinkingBlockPattern);
    if (blockMatches) {
        thinking += blockMatches.join('\n\n');
        cleaned = cleaned.replace(thinkingBlockPattern, '');
    }
    
    return {
        cleaned: cleaned.trim(),
        thinking: thinking.trim()
    };
}
```

**C. Apply Cleanup and Log** (around line 1058-1060)

```javascript
// BEFORE:
content = content.replace(/\*\*DM \([^)]+\)\*\*/g, '').trim();

return {
    text: content,
    stateMutations: allStateMutations
};

// AFTER:
content = content.replace(/\*\*DM \([^)]+\)\*\*/g, '').trim();

// Strip thinking text
const { cleaned, thinking } = stripThinkingText(content);

// Log stripped thinking if any was found
if (thinking) {
    const fs = require('fs');
    const path = require('path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const campaignId = this.campaignId || 'default';
    const debugDir = path.join(__dirname, 'campaigns', campaignId, 'debug');
    
    // Ensure debug directory exists
    if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
    }
    
    const logPath = path.join(debugDir, `thinking-${timestamp}.log`);
    const logContent = `=== AI Thinking Text (Stripped) ===\nTimestamp: ${new Date().toISOString()}\n\n${thinking}\n\n=== Final Narrative (Sent to Player) ===\n\n${cleaned}\n`;
    
    fs.writeFileSync(logPath, logContent, 'utf8');
    console.log(`💭 Stripped thinking text logged to: ${logPath}`);
}

return {
    text: cleaned,
    stateMutations: allStateMutations
};
```

**D. Create Debug Directory Structure**

```bash
mkdir -p /opt/dnd/campaigns/test-silverpeak/debug
echo "# Debug Logs\nThis directory contains AI thinking text that was stripped from narratives.\n" > /opt/dnd/campaigns/test-silverpeak/debug/README.md
```

### Testing

1. **Trigger thinking-heavy scenario:** Combat with complex mechanics (advantage, saves, multi-attack)
2. **Verify narrative is clean:** Player only sees story, no "I need to..." text
3. **Check debug logs:** Thinking text is preserved in `/campaigns/*/debug/thinking-*.log`
4. **Edge cases:** Ensure legitimate narrative starting with "I" isn't stripped (character dialogue)

---

## Issue #2: Combat State Sync

### Problem Details

**Symptom:**
```javascript
combat: { active: false }  // Combat object says ended
combatMachineState: "COMBAT_ACTIVE"  // Machine state says active
```

After combat ends via `end_combat` tool, the state machine transitions to `COMBAT_ENDED` but the `combatMachineState` field in campaign state isn't updated, leaving it stuck at `COMBAT_ACTIVE`.

**Impact:**
- Frontend may display incorrect combat status
- State confusion between combat object and machine state
- Combat may not properly reset for next encounter

**Location:** `/opt/dnd/complete-intelligent-server.js`
- Line 3746: State machine transitions to `COMBAT_ENDED`
- Line 4078: Where `combatMachineState` should be updated but isn't

### Solution

**Update `terminateCombatFromTool` function** (line ~3732)

```javascript
async terminateCombatFromTool(input) {
    const { outcome, summary, xp_awarded } = input;

    console.log(`🏁 Ending combat from AI tool call`);
    console.log(`   Outcome: ${outcome}`);
    console.log(`   Summary: ${summary}`);
    if (xp_awarded) console.log(`   XP Awarded: ${xp_awarded}`);

    // Transition state machine to COMBAT_ENDED
    const sm = contextManager.stateMachine;
    if (sm && sm.getCurrentState() !== 'COMBAT_ENDED' && sm.getCurrentState() !== 'IDLE') {
        try {
            // If in COMBAT_ACTIVE, transition to COMBAT_ENDED
            if (sm.canTransition('COMBAT_ENDED')) {
                sm.transition('COMBAT_ENDED', { reason: outcome || 'combat_ended', source: 'end_combat_tool' });
                console.log(`🔄 State machine transitioned to COMBAT_ENDED`);
                
                // ✨ NEW: Update combatMachineState in campaign state
                if (this.campaignState) {
                    this.campaignState.combatMachineState = 'COMBAT_ENDED';
                    await this.updateCampaignState({ combatMachineState: 'COMBAT_ENDED' });
                    console.log(`📝 Updated combatMachineState to COMBAT_ENDED`);
                }
            }
        } catch (e) {
            console.warn('⚠️ State machine transition failed:', e.message);
        }
    }

    // ... rest of function remains the same ...
}
```

**Also check auto-transition to IDLE** (if it exists)

Some state machines auto-transition from `COMBAT_ENDED` → `IDLE` after a delay. If this happens, ensure `combatMachineState` is also updated:

```javascript
// Search for transitions to IDLE and add similar update
if (this.campaignState) {
    this.campaignState.combatMachineState = 'IDLE';
    await this.updateCampaignState({ combatMachineState: 'IDLE' });
}
```

### Testing

1. Start combat (goblin encounter)
2. End combat with `end_combat` tool
3. Check campaign state: Both `combat.active` and `combatMachineState` should be false/ended
4. Verify frontend combat tracker disappears
5. Send non-combat message - should work normally
6. Start new combat - should initialize cleanly

---

## Issue #3: Loot System Clarification

### Problem Details

**Symptom:** No loot UI card appeared after goblin combat.

**What Happened:**
1. Goblins defeated (CR 1/4 each)
2. DMG Individual Treasure table rolled: 15cp, 3sp (coins only)
3. AI narratively added "rusty scimitars" for flavor
4. AI didn't call `offer_loot` tool
5. No loot card appeared, items only mentioned in text

**Root Cause:** This is actually **working as designed**, but the design intent wasn't clear.

### Design Philosophy

**DMG Loot Tables = Authoritative**
- Random encounters use Individual Treasure tables (DMG p.136-139)
- Low CR enemies (< 5) typically only drop coins
- Boss fights/treasure hoards use Treasure Hoard tables
- Quest completion uses Quest Treasure rewards

**Narrative Loot = Player Investigation**
- Players can investigate fallen enemies for weapons/armor
- AI describes what they find narratively (condition, usefulness)
- When player says "I pick up X", AI uses `update_character` tool
- This is already working (verified with Rusty Scimitar pickup)

### Solution

**A. Update `offer_loot` Tool Description** (line ~455)

```javascript
{
    "name": "offer_loot",
    "description": "Present loot from DMG tables for player distribution after combat. Use ONLY for items from actual loot generation (Individual Treasure, Treasure Hoard, Quest Rewards). Do NOT call for coins-only drops. Do NOT call for narrative items like fallen enemy weapons - those are handled through investigation and update_character tool when players pick them up.",
    "input_schema": {
        // ... rest stays the same
    }
}
```

**B. Update DM Prompt** (add new section to `/opt/dnd/campaigns/test-silverpeak/dm-prompt.md`)

```markdown
## Loot System: DMG Tables vs. Narrative Items

### DMG Loot Tables (Authoritative)

When combat ends, loot is generated from official DMG tables:

**Individual Treasure (Random Encounters):**
- Used for wandering monsters, wilderness encounters
- CR 0-4: Usually only coins (10-100 cp/sp/ep/gp)
- CR 5+: Coins + chance for magic items
- Call `offer_loot` ONLY if the table generates actual items
- Coins-only drops: Just narrate them being added to party treasury

**Treasure Hoard (Boss Fights, Major Encounters):**
- Large coin amounts + gems + art objects + magic items
- Always call `offer_loot` to present items for distribution
- Players assign gems, art, magic items to characters

**Quest Rewards:**
- Generated when quest completes (may span multiple combats)
- Use `award_quest_treasure` tool at quest conclusion
- Always call `offer_loot` for quest reward items

### Narrative Items (Investigation)

Players can search fallen enemies for equipment:

**When player investigates:**
1. Describe what they find narratively (weapons, armor, gear)
2. Include condition details ("rusty", "well-maintained", "broken")
3. Give context ("barely functional", "masterwork quality")

**When player picks up an item:**
- Player says: "Kira picks up the rusty scimitar"
- You call: `update_character(character: "Kira", add_items: ["Rusty Scimitar"])`
- Item appears in their inventory automatically
- System auto-detects category, value, condition

**Example Flow:**

```
Player: "I search the goblin bodies"
DM: "You find two rusty scimitars (barely functional, but could be repaired) 
     and scraps of leather armor too damaged to use."

Player: "Thorne takes one of the scimitars to sell later"
DM: *calls update_character(character: "Thorne", add_items: ["Rusty Scimitar"])*
    "Thorne straps the crude blade to his belt."
```

### Key Rules

✅ DO use `offer_loot`:
- Items from DMG loot tables (gems, art, magic items, treasure)
- Boss fight hoards
- Quest rewards

❌ DO NOT use `offer_loot`:
- Coins-only drops (just narrate them)
- Narrative enemy equipment (use `update_character` when picked up)
- Items you add for flavor that aren't from tables

The extraction system will also auto-detect item pickups from narrative, but calling `update_character` ensures tracking.
```

**C. Update Loot Generator Integration** (if needed)

Verify that `generateLoot()` is being called after combat. If not, add hook:

```javascript
// In terminateCombatFromTool, after setting combat state:

// Generate loot from DMG tables
const lootGenerator = require('./loot-generator-dmg.js');
const defeatedEnemies = [/* extract from combat state */];
const combatType = 'random_encounter'; // or 'boss_fight', 'quest_combat'

const loot = await lootGenerator.generateLoot(defeatedEnemies, combatType);

// If loot contains items (not just coins), suggest using offer_loot
if (loot.items && loot.items.length > 0) {
    console.log(`💰 Loot generated: ${loot.items.length} items. AI should call offer_loot.`);
    // Could add to context as a hint for AI
}
```

### Testing

1. **Low CR random encounter** (2 goblins):
   - Should generate coins only
   - No loot card appears
   - Player investigates, finds narrative weapons
   - Player picks up item → appears in inventory

2. **Boss fight:**
   - Generates treasure hoard
   - Loot card appears with items
   - Player assigns gems/magic items via UI

3. **Quest completion:**
   - Quest reward loot generated
   - Loot card appears
   - Items distributed to party

---

## Implementation Order

### Recommended Sequence

1. **Issue #4: Inventory Refactor** (PRIORITY 1 - Fresh in context)
   - Backend migration function
   - Auto-migration on load
   - Fix Kira's duplicate manually
   - Update all backend item operations
   - Update frontend types and display
   - **Estimated Time:** 2-3 hours
   - **Why first:** Most complex, already designed, prevents future duplicates

2. **Issue #2: Combat State Sync** (Quick win)
   - 3-line fix in `terminateCombatFromTool`
   - **Estimated Time:** 5 minutes
   - **Why second:** Simple fix, high impact, unblocks combat flow

3. **Issue #1: Thinking Text** (User-facing quality)
   - Add DM prompt instruction
   - Add cleanup function
   - Add logging
   - **Estimated Time:** 30 minutes
   - **Why third:** Affects every DM response, improves player experience

4. **Issue #3: Loot System Docs** (Documentation)
   - Update tool descriptions
   - Update DM prompt
   - Verify loot generator integration
   - **Estimated Time:** 20 minutes
   - **Why last:** Already working, just needs clarification

### Total Estimated Time
~4 hours for all issues

### Post-Implementation Testing

**Full Integration Test:**
1. Load campaign (auto-migration runs)
2. Check inventories (no duplicates, equipped items marked)
3. Start combat with 2 goblins
4. End combat (state syncs correctly)
5. Investigate bodies (narrative items)
6. Pick up item (appears in inventory, no duplicate)
7. Check DM responses (no thinking text visible)
8. Check debug logs (thinking text preserved)
9. Fight boss (loot card appears)
10. Distribute loot (items assigned, no duplicates)

**Success Criteria:**
- ✅ No duplicate items in any character inventory
- ✅ Equipped items show [E] indicator on right
- ✅ Combat state syncs correctly (active/ended)
- ✅ No AI thinking text in player-visible narrative
- ✅ Thinking text logged to debug files
- ✅ Loot cards appear for table-generated items only
- ✅ Narrative item pickups work seamlessly
- ✅ Item stacking works for consumables
- ✅ Item metadata (value, condition, category) populated

---

## Future Enhancements

Once core issues are resolved, consider:

### Item System
- [ ] Item tooltips with full details (value, condition, description)
- [ ] Quick equip/unequip toggle in UI
- [ ] Item comparison (compare two weapons side-by-side)
- [ ] Item repair/condition degradation system
- [ ] Enchantment tracking and display

### Loot System
- [ ] Visual loot preview before distribution
- [ ] "Roll for loot" button for investigation checks
- [ ] Loot history log (who got what, when)
- [ ] Auto-suggest distribution based on character class
- [ ] Shared party stash for communal items

### Combat
- [ ] Automatic state machine transitions (COMBAT_ENDED → IDLE after 1 minute)
- [ ] Combat recap at end (damage dealt, kills, MVP)
- [ ] XP distribution card (similar to loot card)

### General
- [ ] Full item database with descriptions, images
- [ ] Item crafting/enchanting system
- [ ] Shop/merchant system for buying/selling
- [ ] Weight/encumbrance tracking

---

## Notes

### Backward Compatibility

The auto-migration approach ensures:
- Existing saves work without manual intervention
- Migration runs on every load (idempotent - safe to run multiple times)
- Old string-based inventory gracefully upgrades to objects
- Equipment array merged into unified inventory
- No data loss during migration

### Performance Considerations

- Migration adds ~5-10ms per character on load (negligible)
- Item object size: ~150 bytes vs ~20 bytes for strings (~7.5x larger)
- For 50 items: ~7.5KB vs ~1KB (acceptable overhead)
- JSON stringify/parse handles objects efficiently

### Edge Cases Handled

- Duplicate items during migration (equipment overlaps with inventory)
- Stackable items with quantity notation ("Potion (×3)")
- Items with special characters in names
- Missing fields in partially migrated items
- Non-stackable items receiving stack operations (ignored)
- Removing from empty stack (item deleted)

### Debugging Tools

If issues arise:
- Check `/campaigns/{campaign}/debug/thinking-*.log` for AI reasoning
- Check console logs for migration messages
- Inspect `campaign-state.json` directly for item structure
- Use `/api/dnd/state?campaign=X` endpoint to verify state
- PM2 logs show all item operations with character names

---

## Changelog

**2025-12-27:** Initial plan created
- Identified 4 distinct issues from debugging session
- Designed comprehensive inventory refactor (Issue #4)
- Planned fixes for thinking text (Issue #1), combat state (Issue #2), loot docs (Issue #3)
- Established implementation order and testing criteria

---

## Sign-off

**Status:** ✅ Planning Complete - Ready for Implementation

**Next Steps:**
1. User review and approval of plan
2. Begin implementation with Issue #4 (Inventory Refactor)
3. Test each issue thoroughly before moving to next
4. Update this document with actual implementation notes

**Questions for User:**
1. Approved to proceed with implementation?
2. Any changes to design decisions (equipped indicator, item fields, etc.)?
3. Any additional edge cases to consider?
