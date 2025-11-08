/**
 * Migration Script: JSON → SQLite for Silverpeak Campaign ONLY
 *
 * ⚠️ DOES NOT AFFECT DAX'S CAMPAIGN ⚠️
 *
 * This script:
 * 1. Reads test-silverpeak campaign-state.json
 * 2. Creates test-silverpeak.db with structured data
 * 3. Keeps JSON files as backup
 * 4. Only modifies Silverpeak backend to use database
 * 5. Dax campaign continues using JSON (untouched)
 */

const CampaignDatabase = require('./CampaignDatabase');
const fs = require('fs').promises;
const path = require('path');

const CAMPAIGN_ID = 'test-silverpeak';
const CAMPAIGN_DIR = path.join(__dirname, '..', 'campaigns', CAMPAIGN_ID);

async function migrateSilverpeak() {
    console.log('🔄 Starting Silverpeak migration to database...');
    console.log('⚠️  Dax campaign will NOT be affected\n');

    try {
        // Step 1: Read existing JSON state
        console.log('📖 Reading campaign-state.json...');
        const statePath = path.join(CAMPAIGN_DIR, 'campaign-state.json');
        const stateData = await fs.readFile(statePath, 'utf8');
        const state = JSON.parse(stateData);

        // Step 2: Initialize database
        console.log('📊 Initializing database...');
        const db = new CampaignDatabase(CAMPAIGN_ID);
        await db.initialize();

        // Step 3: Create campaign entry
        console.log('🏰 Creating campaign entry...');
        await db.createCampaign('Silverpeak', 'fantasy');

        // Update campaign world state
        await db.updateCampaignState({
            currentLocation: state.world?.currentLocation || 'Silverpeak',
            timeOfDay: state.world?.timeOfDay || 'Morning',
            weather: state.world?.weather || 'Clear',
            partyCredits: state.party?.credits || 0
        });

        // Step 4: Migrate characters
        console.log('\n👥 Migrating characters...');
        for (const [charKey, charData] of Object.entries(state.characters || {})) {
            console.log(`  ↳ ${charData.name}...`);

            // Create character
            const result = await db.createCharacter({
                name: charData.name,
                race: charData.race,
                charClass: charData.class,
                level: charData.level || 1,
                str: charData.abilities?.str || 10,
                dex: charData.abilities?.dex || 10,
                con: charData.abilities?.con || 10,
                int: charData.abilities?.int || 10,
                wis: charData.abilities?.wis || 10,
                cha: charData.abilities?.cha || 10,
                hpCurrent: charData.hp?.current || 10,
                hpMax: charData.hp?.max || 10,
                ac: charData.ac || 10,
                credits: charData.credits || 0
            });

            const characterId = result.lastID;

            // Migrate inventory items
            if (charData.inventory && charData.inventory.length > 0) {
                console.log(`    • Adding ${charData.inventory.length} inventory items`);
                for (const item of charData.inventory) {
                    await db.addInventoryItem(characterId, item, 'misc', 1, {}, 'migration');
                }
            }

            // Migrate equipment
            if (charData.equipment && charData.equipment.length > 0) {
                console.log(`    • Adding ${charData.equipment.length} equipment items`);
                for (const item of charData.equipment) {
                    // Try to categorize equipment type
                    let itemType = 'gear';
                    if (item.toLowerCase().includes('sword') || item.toLowerCase().includes('hammer') ||
                        item.toLowerCase().includes('axe') || item.toLowerCase().includes('bow')) {
                        itemType = 'weapon';
                    } else if (item.toLowerCase().includes('armor') || item.toLowerCase().includes('mail')) {
                        itemType = 'armor';
                    } else if (item.toLowerCase().includes('shield')) {
                        itemType = 'shield';
                    }

                    await db.addEquipment(characterId, item, itemType, {}, true, 'migration');
                }
            }

            // Migrate spells
            if (charData.spells && charData.spells.length > 0) {
                console.log(`    • Adding ${charData.spells.length} spells/abilities`);
                for (const spell of charData.spells) {
                    // Detect if it's an ability vs spell
                    const isAbility = spell.includes('Feature') || spell.includes('Expertise') || spell.includes('Action');

                    // Try to extract level from spell name
                    let spellLevel = null;
                    const levelMatch = spell.match(/\((\d+)(?:st|nd|rd|th) Level\)/i);
                    if (levelMatch) {
                        spellLevel = parseInt(levelMatch[1]);
                    } else if (spell.includes('Cantrip')) {
                        spellLevel = 0;
                    }

                    await db.addSpell(characterId, spell, spellLevel, null, isAbility, {});
                }
            }

            // Migrate conditions
            if (charData.conditions && charData.conditions.length > 0) {
                console.log(`    • Adding ${charData.conditions.length} conditions`);
                for (const condition of charData.conditions) {
                    await db.addCondition(characterId, condition);
                }
            }
        }

        // Step 5: Migrate quests
        console.log('\n📜 Migrating quests...');
        if (state.quests?.active) {
            for (const quest of state.quests.active) {
                if (typeof quest === 'string') {
                    await db.createQuest(quest, null, null);
                } else {
                    await db.createQuest(
                        quest.quest_name || quest.name,
                        quest.quest_giver,
                        quest.description,
                        quest.reward_credits || 0,
                        quest.reward_items || []
                    );
                }
            }
        }

        // Step 6: Create backup of JSON files
        console.log('\n💾 Creating backup of JSON files...');
        const backupDir = path.join(CAMPAIGN_DIR, 'json-backup');
        await fs.mkdir(backupDir, { recursive: true });

        const filesToBackup = ['campaign-state.json', 'conversation-history.json', 'initial-state.json'];
        for (const file of filesToBackup) {
            try {
                const srcPath = path.join(CAMPAIGN_DIR, file);
                const destPath = path.join(backupDir, `${file}.backup-${Date.now()}`);
                await fs.copyFile(srcPath, destPath);
                console.log(`  ✓ Backed up ${file}`);
            } catch (err) {
                // File might not exist, that's ok
            }
        }

        // Step 7: Verify migration
        console.log('\n✅ Verifying migration...');
        const exportedState = await db.exportFullState();
        console.log(`  • Characters: ${Object.keys(exportedState.characters).length}`);
        console.log(`  • Party Credits: ${exportedState.party.credits}`);
        console.log(`  • Active Quests: ${exportedState.quests.active.length}`);

        await db.close();

        console.log('\n🎉 Migration complete!');
        console.log('\n📍 Next steps:');
        console.log('  1. Update complete-intelligent-server.js to use CampaignDatabase');
        console.log('  2. Test Silverpeak campaign');
        console.log('  3. Verify Dax campaign still works (should be untouched)');
        console.log('\n💾 Database location:', path.join(__dirname, `${CAMPAIGN_ID}.db`));
        console.log('💾 JSON backups:', backupDir);

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        throw error;
    }
}

// Run migration if called directly
if (require.main === module) {
    migrateSilverpeak()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { migrateSilverpeak };
