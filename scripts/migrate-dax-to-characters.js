#!/usr/bin/env node
/**
 * Dax Campaign Migration Script
 * 
 * Migrates from legacy 'party' structure to new 'characters' structure
 * with companion support.
 * 
 * Changes:
 * - party.dax -> characters.dax (controlledBy: 'player')
 * - party.chen -> characters.chen (controlledBy: 'dm', companion: true)
 * - party.yuen -> characters.yuen (controlledBy: 'dm', companion: true)
 * - Adds ability scores based on DM prompt modifiers
 * - Adds equipment based on story context
 * - Preserves all existing data (HP, credits, conditions)
 */

const fs = require('fs');
const path = require('path');

const CAMPAIGN_DIR = '/opt/dnd/campaigns/dax';
const STATE_FILE = path.join(CAMPAIGN_DIR, 'campaign-state.json');
const BACKUP_FILE = path.join(CAMPAIGN_DIR, 'campaign-state.pre-migration-backup.json');

// Character definitions based on DM prompt analysis
const CHARACTER_DEFINITIONS = {
    dax: {
        name: 'Dax Stargazer',
        class: 'Tech Specialist',
        race: 'Vexian',
        controlledBy: 'player',
        companion: false,
        // +7 expertise (INT 18 + prof 4 + expertise 3) in Tech/Hacking/Engineering
        // +5 proficiency in Stealth/Perception/Investigation (DEX 14 + prof 4 - 1)
        abilities: { str: 8, dex: 14, con: 10, int: 18, wis: 12, cha: 10 },
        equipment: [
            { name: 'Empty Sidearm', category: 'weapon', value: 500, condition: 'good', quantity: 1, custom: true, equipped: true, stackable: false, treasure: false, notes: 'Ammo confiscated by security' },
            { name: 'Portable Tech Kit', category: 'misc', value: 500, condition: 'good', quantity: 1, custom: true, equipped: false, stackable: false, treasure: false },
            { name: 'Datapad', category: 'misc', value: 200, condition: 'good', quantity: 1, custom: true, equipped: false, stackable: false, treasure: false }
        ]
    },
    chen: {
        name: 'Chen',
        class: 'Engineer',
        race: 'Human',
        controlledBy: 'dm',
        companion: true,
        // +6 expertise in Engineering/Tech/Repair (INT 16 + prof 4 + expertise 2)
        // +4 proficiency in Athletics/Intimidation (STR 14 + prof 4 - 2)
        abilities: { str: 14, dex: 12, con: 14, int: 16, wis: 10, cha: 12 },
        equipment: [
            { name: 'Confiscated Shotgun', category: 'weapon', value: 800, condition: 'good', quantity: 1, custom: true, equipped: false, stackable: false, treasure: false, notes: 'Seized by station security' },
            { name: 'Engineering Tools', category: 'misc', value: 300, condition: 'good', quantity: 1, custom: true, equipped: false, stackable: false, treasure: false },
            { name: 'Repair Kit', category: 'misc', value: 150, condition: 'good', quantity: 1, custom: true, equipped: false, stackable: false, treasure: false }
        ]
    },
    yuen: {
        name: 'Dr. Yuen',
        class: 'Xenobiologist',
        race: 'Human',
        controlledBy: 'dm',
        companion: true,
        // +5 expertise in Medicine/Biology/Xenobiology (INT 14 + prof 4 + expertise 1)
        // +3 proficiency in Investigation/Insight/Nature (WIS 12 + prof 4 - 3)
        abilities: { str: 8, dex: 10, con: 12, int: 14, wis: 12, cha: 10 },
        equipment: [
            { name: 'Medical Scanner', category: 'misc', value: 2000, condition: 'good', quantity: 1, custom: true, equipped: false, stackable: false, treasure: false, notes: 'Jury-rigged, fully charged' },
            { name: 'Xenobiology Field Kit', category: 'misc', value: 800, condition: 'good', quantity: 1, custom: true, equipped: false, stackable: false, treasure: false },
            { name: 'Sample Containers', category: 'misc', value: 50, condition: 'good', quantity: 5, custom: true, equipped: false, stackable: true, treasure: false }
        ]
    }
};

function migrate() {
    console.log('\n========================================');
    console.log('  DAX CAMPAIGN MIGRATION');
    console.log('  party -> characters structure');
    console.log('========================================\n');

    // Check if file exists
    if (!fs.existsSync(STATE_FILE)) {
        console.error(`ERROR: Campaign state not found at ${STATE_FILE}`);
        process.exit(1);
    }

    // Load current state
    const rawData = fs.readFileSync(STATE_FILE, 'utf8');
    const state = JSON.parse(rawData);

    // Check if already migrated
    if (state.characters && Object.keys(state.characters).length > 0) {
        console.log('Campaign already has "characters" structure.');
        console.log('Checking if migration is needed...');
        
        // Check if companions are marked
        const hasCompanionFlags = Object.values(state.characters).some(c => c.companion !== undefined);
        if (hasCompanionFlags) {
            console.log('Migration already complete. Exiting.');
            return;
        }
        console.log('Companion flags missing - updating existing structure...');
    }

    // Create backup
    fs.writeFileSync(BACKUP_FILE, rawData);
    console.log(`Backup created: ${BACKUP_FILE}`);

    // Build new characters structure
    const characters = {};
    const oldParty = state.party || {};

    for (const [id, definition] of Object.entries(CHARACTER_DEFINITIONS)) {
        const existing = oldParty[id] || state.characters?.[id] || {};
        
        characters[id] = {
            name: definition.name,
            class: definition.class,
            race: definition.race,
            controlledBy: definition.controlledBy,
            companion: definition.companion,
            hp: existing.hp || { current: 10, max: 10 },
            credits: existing.credits || 0,
            abilities: definition.abilities,
            inventory: existing.inventory?.length > 0 ? existing.inventory : definition.equipment,
            conditions: existing.conditions || [],
            buffs: existing.buffs || []
        };

        console.log(`Migrated: ${definition.name}`);
        console.log(`  - HP: ${characters[id].hp.current}/${characters[id].hp.max}`);
        console.log(`  - Credits: ${characters[id].credits}`);
        console.log(`  - Controlled by: ${definition.controlledBy}`);
        console.log(`  - Companion: ${definition.companion}`);
        console.log(`  - Items: ${characters[id].inventory.length}`);
    }

    // Build new state
    const newState = {
        characters,
        resources: state.resources || { party_credits: 15800 },
        quests: state.quests || { active: [], completed: [] },
        ship: state.ship || null,
        key_npcs: state.key_npcs || {},
        combat: state.combat || {
            active: false,
            round: 0,
            currentTurn: 0,
            initiativeOrder: []
        }
    };

    // Preserve party_credits if it exists
    if (state.resources?.party_credits) {
        newState.resources.party_credits = state.resources.party_credits;
    }

    // Remove old party key
    delete newState.party;

    // Save migrated state
    fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));

    console.log('\n========================================');
    console.log('  MIGRATION COMPLETE');
    console.log('========================================');
    console.log(`\nCharacters migrated: ${Object.keys(characters).length}`);
    console.log(`  - Player-controlled: ${Object.values(characters).filter(c => c.controlledBy === 'player').length}`);
    console.log(`  - DM-controlled companions: ${Object.values(characters).filter(c => c.companion).length}`);
    console.log(`\nParty credits pool: ${newState.resources.party_credits}`);
    console.log(`\nBackup saved to: ${BACKUP_FILE}`);
    console.log(`\nNew state saved to: ${STATE_FILE}`);
}

// Run migration
migrate();
