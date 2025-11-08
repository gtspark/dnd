/**
 * Clean up duplicate spells/equipment in the database
 * Keep entries with properties, remove those without
 */

const CampaignDatabase = require('./database/CampaignDatabase');

async function cleanup() {
    console.log('🧹 Cleaning up duplicate spells...\n');

    const db = new CampaignDatabase('test-silverpeak');
    await db.initialize();

    // Get all spells
    const allSpells = await db.all(`
        SELECT * FROM spells ORDER BY spell_name, id
    `);

    // Group by character_id + spell_name (case-insensitive)
    const spellGroups = {};
    for (const spell of allSpells) {
        const key = `${spell.character_id}-${spell.spell_name.toLowerCase()}`;
        if (!spellGroups[key]) {
            spellGroups[key] = [];
        }
        spellGroups[key].push(spell);
    }

    // For each group, keep the one with properties, delete others
    let deletedCount = 0;
    for (const [key, spells] of Object.entries(spellGroups)) {
        if (spells.length > 1) {
            console.log(`📝 Found ${spells.length} duplicates of: ${spells[0].spell_name}`);

            // Sort by properties - ones with properties first
            spells.sort((a, b) => {
                const aHasProps = a.properties && a.properties !== '{}';
                const bHasProps = b.properties && b.properties !== '{}';
                if (aHasProps && !bHasProps) return -1;
                if (!aHasProps && bHasProps) return 1;
                return 0;
            });

            // Keep the first one (with properties if available), delete the rest
            const toKeep = spells[0];
            const toDelete = spells.slice(1);

            console.log(`  ✓ Keeping: ${toKeep.spell_name} (id: ${toKeep.id}, props: ${toKeep.properties !== '{}'})`);

            for (const spell of toDelete) {
                console.log(`  ✗ Deleting: ${spell.spell_name} (id: ${spell.id}, props: ${spell.properties !== '{}'})`);
                await db.run('DELETE FROM spells WHERE id = ?', [spell.id]);
                deletedCount++;
            }
        }
    }

    console.log(`\n✅ Deleted ${deletedCount} duplicate spells\n`);

    // Now check equipment duplicates
    const allEquipment = await db.all(`
        SELECT * FROM equipment ORDER BY item_name, id
    `);

    const equipGroups = {};
    for (const equip of allEquipment) {
        const key = `${equip.character_id}-${equip.item_name.toLowerCase()}`;
        if (!equipGroups[key]) {
            equipGroups[key] = [];
        }
        equipGroups[key].push(equip);
    }

    let equipDeletedCount = 0;
    for (const [key, items] of Object.entries(equipGroups)) {
        if (items.length > 1) {
            console.log(`📝 Found ${items.length} duplicates of: ${items[0].item_name}`);

            // Sort by properties - ones with properties first
            items.sort((a, b) => {
                const aHasProps = a.properties && a.properties !== '{}';
                const bHasProps = b.properties && b.properties !== '{}';
                if (aHasProps && !bHasProps) return -1;
                if (!aHasProps && bHasProps) return 1;
                return 0;
            });

            // Keep the first one, delete the rest
            const toKeep = items[0];
            const toDelete = items.slice(1);

            console.log(`  ✓ Keeping: ${toKeep.item_name} (id: ${toKeep.id}, props: ${toKeep.properties !== '{}'})`);

            for (const item of toDelete) {
                console.log(`  ✗ Deleting: ${item.item_name} (id: ${item.id}, props: ${item.properties !== '{}'})`);
                await db.run('DELETE FROM equipment WHERE id = ?', [item.id]);
                equipDeletedCount++;
            }
        }
    }

    console.log(`\n✅ Deleted ${equipDeletedCount} duplicate equipment items\n`);

    // Now check inventory duplicates
    console.log('🧹 Cleaning up duplicate inventory items...\n');

    const allInventory = await db.all(`
        SELECT * FROM inventory ORDER BY item_name, id
    `);

    const invGroups = {};
    for (const inv of allInventory) {
        const key = `${inv.character_id}-${inv.item_name.toLowerCase()}`;
        if (!invGroups[key]) {
            invGroups[key] = [];
        }
        invGroups[key].push(inv);
    }

    let invDeletedCount = 0;
    for (const [key, items] of Object.entries(invGroups)) {
        if (items.length > 1) {
            console.log(`📝 Found ${items.length} duplicates of: ${items[0].item_name}`);

            // Keep first one, delete the rest
            const toKeep = items[0];
            const toDelete = items.slice(1);

            console.log(`  ✓ Keeping: ${toKeep.item_name} (id: ${toKeep.id}, qty: ${toKeep.quantity})`);

            for (const item of toDelete) {
                console.log(`  ✗ Deleting: ${item.item_name} (id: ${item.id}, qty: ${item.quantity})`);
                await db.run('DELETE FROM inventory WHERE id = ?', [item.id]);
                invDeletedCount++;
            }
        }
    }

    console.log(`\n✅ Deleted ${invDeletedCount} duplicate inventory items\n`);

    // Show final counts
    const finalEquipCount = await db.get('SELECT COUNT(*) as count FROM equipment');
    const finalSpellCount = await db.get('SELECT COUNT(*) as count FROM spells');
    const finalInvCount = await db.get('SELECT COUNT(*) as count FROM inventory');

    console.log(`📊 Final database state:`);
    console.log(`   Equipment: ${finalEquipCount.count} items`);
    console.log(`   Inventory: ${finalInvCount.count} items`);
    console.log(`   Spells: ${finalSpellCount.count} spells`);

    await db.close();
    console.log('\n✅ Cleanup complete!');
}

cleanup().catch(console.error);
