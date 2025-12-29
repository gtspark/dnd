/**
 * One-time migration: Sync campaign-state.json to database
 * Removes duplicates and populates equipment/inventory/spells with properties
 */

const fs = require('fs').promises;
const path = require('path');
const CampaignDatabase = require('./database/CampaignDatabase');
const { getEquipmentProperties } = require('./5e-equipment-data');
const { getSpellProperties } = require('./5e-spell-data');

async function migrate() {
    const campaignId = 'test-silverpeak';
    const stateFile = path.join(__dirname, 'campaigns', campaignId, 'campaign-state.json');

    console.log('📊 Starting migration from JSON to database...\n');

    // Load JSON state
    const stateData = await fs.readFile(stateFile, 'utf8');
    const state = JSON.parse(stateData);

    // Initialize database
    const db = new CampaignDatabase(campaignId);
    await db.initialize();

    console.log('✅ Database initialized\n');

    // Process each character
    for (const [shortName, charData] of Object.entries(state.characters)) {
        console.log(`\n📝 Processing ${charData.name}...`);

        // Get character from DB
        const char = await db.getCharacter(charData.name);
        if (!char) {
            console.log(`  ⚠️  Character not found in database: ${charData.name}`);
            continue;
        }

        // Process equipment (remove duplicates)
        if (charData.equipment && Array.isArray(charData.equipment)) {
            const uniqueEquipment = [...new Set(charData.equipment)]; // Remove duplicates
            console.log(`  🔧 Equipment: ${charData.equipment.length} items → ${uniqueEquipment.length} unique`);

            for (const item of uniqueEquipment) {
                // Determine item type
                let itemType = 'gear';
                const itemLower = item.toLowerCase();
                if (itemLower.includes('sword') || itemLower.includes('hammer') ||
                    itemLower.includes('axe') || itemLower.includes('bow') ||
                    itemLower.includes('dagger') || itemLower.includes('spear') ||
                    itemLower.includes('mace') || itemLower.includes('crossbow')) {
                    itemType = 'weapon';
                } else if (itemLower.includes('armor') || itemLower.includes('mail') ||
                           itemLower.includes('plate') || itemLower.includes('leather') ||
                           itemLower.includes('breastplate')) {
                    itemType = 'armor';
                } else if (itemLower.includes('shield')) {
                    itemType = 'shield';
                }

                // Get properties
                const properties = getEquipmentProperties(item, itemType);

                // Add to database
                try {
                    await db.addEquipment(char.id, item, itemType, properties, true, 'migration');
                    console.log(`    ✓ ${item} (${itemType})`);
                } catch (error) {
                    console.log(`    ✗ ${item}: ${error.message}`);
                }
            }

            // Update JSON to remove duplicates
            charData.equipment = uniqueEquipment;
        }

        // Process inventory (remove duplicates)
        if (charData.inventory && Array.isArray(charData.inventory)) {
            const uniqueInventory = [...new Set(charData.inventory)];
            console.log(`  🎒 Inventory: ${charData.inventory.length} items → ${uniqueInventory.length} unique`);

            for (const item of uniqueInventory) {
                try {
                    await db.addInventoryItem(char.id, item, 'misc', 1, {}, 'migration');
                    console.log(`    ✓ ${item}`);
                } catch (error) {
                    console.log(`    ✗ ${item}: ${error.message}`);
                }
            }

            // Update JSON to remove duplicates
            charData.inventory = uniqueInventory;
        }

        // Process spells (remove duplicates, add properties)
        if (charData.spells && Array.isArray(charData.spells)) {
            const uniqueSpells = [...new Set(charData.spells)];
            console.log(`  ✨ Spells: ${charData.spells.length} spells → ${uniqueSpells.length} unique`);

            for (const spell of uniqueSpells) {
                const isAbility = spell.includes('Feature') || spell.includes('Expertise') || spell.includes('Action');
                const spellProps = getSpellProperties(spell);

                let spellLevel = spellProps?.level || null;
                let spellSchool = spellProps?.school || null;

                if (!spellLevel) {
                    const levelMatch = spell.match(/\((\d+)(?:st|nd|rd|th) Level\)/i);
                    if (levelMatch) {
                        spellLevel = parseInt(levelMatch[1]);
                    } else if (spell.includes('Cantrip')) {
                        spellLevel = 0;
                    }
                }

                try {
                    await db.addSpell(char.id, spell, spellLevel, spellSchool, isAbility, spellProps || {});
                    if (spellProps) {
                        console.log(`    ✓ ${spell} (with properties)`);
                    } else {
                        console.log(`    ✓ ${spell} (no properties found)`);
                    }
                } catch (error) {
                    console.log(`    ✗ ${spell}: ${error.message}`);
                }
            }

            // Update JSON to remove duplicates
            charData.spells = uniqueSpells;
        }
    }

    // Save cleaned JSON state
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
    console.log('\n✅ Cleaned JSON state saved\n');

    await db.close();
    console.log('✅ Migration complete!\n');
}

migrate().catch(console.error);
