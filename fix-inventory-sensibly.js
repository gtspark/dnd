/**
 * Fix inventory to make sense - keep one of each thing a character actually needs
 */

const CampaignDatabase = require('./database/CampaignDatabase');

async function fixInventory() {
    const db = new CampaignDatabase('test-silverpeak');
    await db.initialize();

    // Define what each character should actually have
    const shouldHave = {
        'Kira Moonwhisper': {
            equipment: ['Quarterstaff', 'Dagger', 'Leather Armor', 'Component Pouch', 'Spellbook'],
            inventory: ['Advance payment pouch (250 GP from Elder Miriam)']
        },
        'Thorne Ironheart': {
            equipment: ['Warhammer', 'Shield', 'Scale mail', 'Holy symbol (wooden amulet)'],
            inventory: ['Healing Potion', 'Rations (1 day\'s worth)', 'Healer\'s kit (10 uses)']
        },
        'Riven Shadowstep': {
            equipment: ['Shortsword', 'Dagger', 'Shortbow', 'Leather Armor', 'Thieves\' tools'],
            inventory: ['Quiver with 20 Arrows']
        }
    };

    for (const [charName, items] of Object.entries(shouldHave)) {
        const char = await db.getCharacter(charName);
        if (!char) continue;

        console.log(`\n🧹 Cleaning up ${charName}...`);

        // Clear all equipment
        await db.run('DELETE FROM equipment WHERE character_id = ?', [char.id]);
        console.log('  Cleared equipment');

        // Clear all inventory
        await db.run('DELETE FROM inventory WHERE character_id = ?', [char.id]);
        console.log('  Cleared inventory');

        // Add back the correct equipment
        const { getEquipmentProperties } = require('./5e-equipment-data');
        for (const item of items.equipment) {
            let itemType = 'gear';
            const itemLower = item.toLowerCase();

            if (itemLower.includes('sword') || itemLower.includes('hammer') ||
                itemLower.includes('bow') || itemLower.includes('dagger') ||
                itemLower.includes('staff')) {
                itemType = 'weapon';
            } else if (itemLower.includes('armor') || itemLower.includes('mail')) {
                itemType = 'armor';
            } else if (itemLower.includes('shield')) {
                itemType = 'shield';
            }

            const properties = getEquipmentProperties(item, itemType);
            await db.addEquipment(char.id, item, itemType, properties, true, 'cleanup');
            console.log(`  ✓ Added ${item} (${itemType})`);
        }

        // Add back the correct inventory
        for (const item of items.inventory) {
            await db.addInventoryItem(char.id, item, 'misc', 1, {}, 'cleanup');
            console.log(`  ✓ Added ${item}`);
        }
    }

    const finalEquip = await db.get('SELECT COUNT(*) as count FROM equipment');
    const finalInv = await db.get('SELECT COUNT(*) as count FROM inventory');
    const finalSpells = await db.get('SELECT COUNT(*) as count FROM spells');

    console.log(`\n📊 Final state:`);
    console.log(`   Equipment: ${finalEquip.count} items`);
    console.log(`   Inventory: ${finalInv.count} items`);
    console.log(`   Spells: ${finalSpells.count} spells`);

    await db.close();
    console.log('\n✅ Done!');
}

fixInventory().catch(console.error);
