#!/usr/bin/env node
/**
 * Backfill RAG Memories Script (v2)
 *
 * Two-phase backfill:
 *   Phase 1: Episode memories with proper scene_ids
 *   Phase 2: Curated world facts for permanent cross-chapter recall
 *
 * Usage: node backfill-rag-memories.js [campaign-id] [--clear]
 * Example: node backfill-rag-memories.js dax --clear
 */

const fs = require('fs').promises;
const path = require('path');

const MEMORY_SERVICE_URL = 'http://localhost:5003';
const CHUNK_SIZE = 4;

// ─── Dax Campaign Scene Mapping ───────────────────────────────────────
// Chapter 1 (The Wanderer): entries 0-89 → scenes 1-20
// Chapter 2 (Titan Station): entries 90-394 → scenes 21-47
const CHAPTER_BOUNDARIES = {
    dax: {
        chapters: [
            { name: 'Chapter 1: The Wanderer', startEntry: 0, endEntry: 89, startScene: 1, endScene: 20 },
            { name: 'Chapter 2: Titan Station', startEntry: 90, endEntry: Infinity, startScene: 21, endScene: 47 }
        ]
    }
};

function getSceneId(campaignId, entryIndex, totalEntries) {
    const boundaries = CHAPTER_BOUNDARIES[campaignId];
    if (!boundaries) {
        // Generic: linear interpolation across 1-50
        return Math.max(1, Math.ceil((entryIndex / totalEntries) * 50));
    }

    for (const ch of boundaries.chapters) {
        if (entryIndex >= ch.startEntry && entryIndex <= ch.endEntry) {
            const chapterEntries = Math.min(ch.endEntry, totalEntries - 1) - ch.startEntry;
            const progress = chapterEntries > 0 ? (entryIndex - ch.startEntry) / chapterEntries : 0;
            const sceneRange = ch.endScene - ch.startScene;
            return ch.startScene + Math.floor(progress * sceneRange);
        }
    }
    return 1;
}

// ─── World Facts for Dax Campaign ─────────────────────────────────────
const DAX_WORLD_FACTS = [
    // NPCs
    {
        fact_type: 'npc_bio',
        subject: 'Captain Morrison',
        content: 'Captain of U.E.S. Wanderer. Died of internal injuries after containing the Skitterer infestation. Sacrificed himself so the crew could escape. Last words to Dax: "Get our people home, Stargazer." His death deeply affected Dax and drives his mission.',
        tags: ['wanderer', 'chapter1', 'death', 'crew']
    },
    {
        fact_type: 'npc_bio',
        subject: 'Officer Rostova',
        content: 'Security officer on the Wanderer. Found dead in Central Hub during the Skitterer attack. Her body had the armory access code 7355. Dax recharged the medical scanner at her console. Her death was one of many losses on the Wanderer.',
        tags: ['wanderer', 'chapter1', 'death', 'security', 'armory']
    },
    {
        fact_type: 'npc_bio',
        subject: 'Chen',
        content: 'Human Security Specialist and DM-controlled companion. Shoulder was dislocated during Wanderer escape — Dax reset it. Shotgun was confiscated by Titan Station security on arrival. Engineering/Tech +6, Athletics/Intimidation +4. Loyal, practical, direct personality.',
        tags: ['companion', 'party', 'engineer', 'security']
    },
    {
        fact_type: 'npc_bio',
        subject: 'Dr. Yuen',
        content: 'Human Medical Officer and xenobiologist. DM-controlled companion. Suffered broken ribs and a laceration on the Wanderer — rescued by Dax. Carries a medical scanner (recharged during Wanderer escape). Medicine/Xenobiology +5, Investigation/Insight +3. Calm, analytical, cautious.',
        tags: ['companion', 'party', 'medical', 'xenobiology']
    },
    {
        fact_type: 'npc_bio',
        subject: 'Director Holbrook',
        content: 'Director of Titan Station. Coordinated the negotiation with Osprey forces. Now actively investigating Weyland Biosystems based on evidence from the Osprey withdrawal. Political operator who balances corporate and government interests.',
        tags: ['titan-station', 'authority', 'chapter2', 'weyland']
    },
    {
        fact_type: 'npc_bio',
        subject: 'Commander Torres',
        content: 'Head of Titan Station security. Coordinated the station lockdown during the Osprey crisis. Commands armed security teams with pulse rifles. Professional, military bearing. Works closely with Holbrook.',
        tags: ['titan-station', 'security', 'chapter2', 'military']
    },
    {
        fact_type: 'npc_bio',
        subject: 'Raven',
        content: 'Osprey Corporation team leader. Professional PMC operative. Led the tactical team that breached Titan Station under Weyland contract. Accepted a negotiated withdrawal to Dock 7 after Dax and station leadership applied diplomatic pressure. Left Weyland surveillance equipment behind as evidence.',
        tags: ['osprey', 'antagonist', 'chapter2', 'pmc']
    },
    // Locations
    {
        fact_type: 'location',
        subject: 'U.E.S. Wanderer',
        content: 'United Expeditionary Ship operated by United Expeditionary Syndicate (U.E.S.). Cargo/survey vessel that was infested by Skitterers — alien creatures that killed most of the crew. Dax, Chen, and Dr. Yuen escaped via escape pods with Captain Morrison\'s sacrifice. The ship is destroyed/abandoned. The entire Chapter 1 takes place aboard the Wanderer.',
        tags: ['ship', 'chapter1', 'skitterers', 'destroyed']
    },
    {
        fact_type: 'location',
        subject: 'Titan Station',
        content: 'Cylindrical trade hub orbiting Saturn. Mix of corporate and government interests. Current base of operations for Dax and crew after escaping the Wanderer. Has multiple sectors including docking bays, security centers, medical facilities, and corporate offices (including Weyland). All of Chapter 2+ takes place here.',
        tags: ['station', 'chapter2', 'current', 'hub']
    },
    {
        fact_type: 'location',
        subject: 'Security Command Center',
        content: 'Key fortified location on Titan Station. Contains weapons locker, comms array, blast door controls. Became the team\'s operational base during the Osprey crisis. Current location as of scene 47. Director Holbrook and Commander Torres are present.',
        tags: ['titan-station', 'chapter2', 'current-location', 'tactical']
    },
    {
        fact_type: 'location',
        subject: 'Dock 7',
        content: 'Docking bay on Titan Station used for Osprey\'s ship "Razor\'s Edge." Osprey forces withdrew here after negotiations. They left behind surveillance equipment and data extraction gear — physical evidence of Weyland\'s corporate espionage.',
        tags: ['titan-station', 'chapter2', 'osprey', 'evidence']
    },
    // Factions
    {
        fact_type: 'faction',
        subject: 'Weyland Biosystems',
        content: 'Corporate antagonist. Has intelligence on the Wanderer incident and the Skitterer infestation. Hired Osprey Corporation (PMC) to extract xenobiological data from Titan Station. Has offices on Titan Station. Dax\'s primary antagonist — his mission is to expose their involvement and protect the crew.',
        tags: ['corporation', 'antagonist', 'conspiracy', 'xenobiology']
    },
    {
        fact_type: 'faction',
        subject: 'Osprey Corporation',
        content: 'Professional private military contractor hired by Weyland Biosystems. Led by operative "Raven." Deployed a tactical team to Titan Station to extract data. After Dax\'s negotiation and station security pressure, they agreed to a professional withdrawal to Dock 7. Left behind Weyland-funded surveillance and data extraction equipment as evidence.',
        tags: ['pmc', 'military', 'weyland', 'chapter2']
    },
    {
        fact_type: 'faction',
        subject: 'United Expeditionary Syndicate (U.E.S.)',
        content: 'Mid-tier shipping and exploration company that operated the U.E.S. Wanderer. Handles cargo runs and survey missions. Not a villain — they\'re the employer. The Wanderer disaster happened under their operations.',
        tags: ['corporation', 'employer', 'wanderer', 'shipping']
    },
    // Lore & Plot Events
    {
        fact_type: 'lore',
        subject: 'Skitterers',
        content: 'Alien creatures that infested the U.E.S. Wanderer. Chitinous exoskeletons, clicking sounds, bladed arms. Resist normal gunfire — weapons pass through them "like smoke" according to survivor testimony. Likely connected to Weyland Biosystems\' xenobiological research — possibly a bioweapon. The infestation killed most of the Wanderer crew.',
        tags: ['alien', 'creature', 'wanderer', 'bioweapon', 'weyland']
    },
    {
        fact_type: 'lore',
        subject: 'Wanderer Incident',
        content: 'The triggering event of the campaign. Alien Skitterer infestation aboard U.E.S. Wanderer killed most crew. Dax Stargazer, Chen, and Dr. Yuen survived and escaped via escape pods. Captain Morrison died containing the threat so others could escape. The incident exposed a possible Weyland Biosystems bioweapon program.',
        tags: ['chapter1', 'plot', 'origin', 'skitterers', 'escape']
    },
    {
        fact_type: 'lore',
        subject: 'Weyland Conspiracy',
        content: 'Central plot thread: Weyland Biosystems has intel on the Wanderer and sent Osprey PMC to steal xenobiological data from Titan Station. Evidence suggests Weyland may have been involved in creating or deploying the Skitterers. Dax\'s ongoing mission is to expose Weyland\'s role and protect his crew from further corporate interference.',
        tags: ['plot', 'conspiracy', 'weyland', 'chapter2', 'ongoing']
    },
    {
        fact_type: 'lore',
        subject: 'Osprey Withdrawal Evidence',
        content: 'When Osprey forces withdrew from Titan Station to Dock 7, they left behind Weyland-funded surveillance equipment, a data extraction module, and a Faraday-shielded core. This physical evidence proves Weyland hired Osprey for corporate espionage. Torres ordered it marked for drone pickup analysis.',
        tags: ['evidence', 'osprey', 'weyland', 'dock7', 'chapter2']
    },
    {
        fact_type: 'lore',
        subject: 'Armory Code 7355',
        content: 'Security code found with Officer Rostova\'s body on the Wanderer. Grants access to the ship\'s armory. Dax memorized it during the escape. May be relevant if similar security systems are encountered.',
        tags: ['code', 'security', 'wanderer', 'chapter1', 'rostova']
    },
    // Character facts
    {
        fact_type: 'character',
        subject: 'Dax Stargazer - Background',
        content: 'Vexian Tech Specialist. Has four arms and four legs, compound eyes. Primary skills: Technology/Hacking/Engineering (INT +7), Stealth/Perception/Investigation (+5). NOT a xenoarchaeologist — purely a tech specialist. Empty sidearm (ammo confiscated at Titan Station). Carries portable tech kit and datapad. Knows armory code 7355.',
        tags: ['dax', 'player', 'vexian', 'tech']
    },
    {
        fact_type: 'character',
        subject: 'Dax Stargazer - Character Development',
        content: 'Started as a tech specialist crew member on the Wanderer. The Skitterer disaster and Captain Morrison\'s sacrifice transformed him into an unlikely leader. He reset Chen\'s dislocated shoulder, rescued Dr. Yuen, and led the escape. On Titan Station, he\'s become a diplomatic force — negotiating with Osprey, working with station leadership, and pursuing Weyland. Drives: protect his crew, expose Weyland, honor Morrison\'s sacrifice.',
        tags: ['dax', 'development', 'growth', 'leadership']
    },
    {
        fact_type: 'character',
        subject: 'Team Dynamic',
        content: 'Dax leads and makes decisions (player-controlled). Chen provides muscle, engineering expertise, and security knowledge (DM-controlled). Dr. Yuen provides medical care, xenobiology expertise, and analytical thinking (DM-controlled). The trio bonded through the Wanderer disaster. Chen and Yuen trust Dax\'s leadership after he saved them.',
        tags: ['party', 'dynamic', 'companions', 'relationships']
    },
    // Keth'var detail
    {
        fact_type: 'lore',
        subject: 'Keth\'var - Vexian Stimulant',
        content: 'Keth\'var is a Vexian stimulant that uses different chemical compounds than human caffeine. Doesn\'t affect humans much, but human coffee keeps Vexians wired for days due to species-specific differences in stimulant processing. A small cultural detail about Dax\'s species.',
        tags: ['vexian', 'culture', 'worldbuilding', 'dax']
    },
    // Martinez warning
    {
        fact_type: 'lore',
        subject: 'Martinez - Deceased Crew',
        content: 'Martinez was a crew member on the Wanderer who DIED during the Skitterer infestation. This name must NOT be reused for living NPCs. Important continuity note.',
        tags: ['wanderer', 'death', 'continuity', 'chapter1']
    }
];

// ─── API Helpers ──────────────────────────────────────────────────────

async function checkHealth() {
    const response = await fetch(`${MEMORY_SERVICE_URL}/health`);
    if (!response.ok) throw new Error('Memory service not healthy');
    const data = await response.json();
    console.log('✅ Memory service:', data.status);
    return true;
}

async function storeMemory(campaign, actions, sceneId, session = 1) {
    const response = await fetch(`${MEMORY_SERVICE_URL}/store-memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            campaign,
            actions,
            session,
            scene_id: sceneId,
            memory_type: 'episode'
        })
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`store-memory failed: ${response.status} - ${err}`);
    }
    return await response.json();
}

async function storeWorldFact(campaign, factType, subject, content, tags = []) {
    const response = await fetch(`${MEMORY_SERVICE_URL}/store-world-fact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fact_type: factType,
            subject,
            content,
            campaign,
            tags
        })
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`store-world-fact failed: ${response.status} - ${err}`);
    }
    return await response.json();
}

async function getMemoryCount(campaign) {
    const response = await fetch(`${MEMORY_SERVICE_URL}/memories?campaign=${campaign}`);
    if (response.ok) {
        const data = await response.json();
        return data.count || 0;
    }
    return 0;
}

async function getWorldFactCount(campaign) {
    const response = await fetch(`${MEMORY_SERVICE_URL}/world-facts?campaign=${campaign}`);
    if (response.ok) {
        const data = await response.json();
        return (data.facts || []).length;
    }
    return 0;
}

async function clearMemories(campaign) {
    const response = await fetch(`${MEMORY_SERVICE_URL}/clear-memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign })
    });
    if (response.ok) console.log('🗑️  Cleared existing memories for:', campaign);
}

// ─── Phase 1: Episode Memories ────────────────────────────────────────

async function backfillEpisodes(campaignId, history) {
    console.log('\n📚 PHASE 1: Episode Memories');
    console.log('─'.repeat(50));

    // Filter to IC entries with meaningful content
    const icEntries = history
        .map((entry, idx) => ({ ...entry, originalIndex: idx }))
        .filter(e => {
            if (!e.content || e.content.trim().length < 30) return false;
            if (e.mode === 'ooc') return false;
            return true;
        });

    console.log(`  IC entries with content: ${icEntries.length} / ${history.length}`);

    // Chunk into groups of CHUNK_SIZE
    const chunks = [];
    for (let i = 0; i < icEntries.length; i += CHUNK_SIZE) {
        const chunk = icEntries.slice(i, i + CHUNK_SIZE);
        if (chunk.length >= 2) {
            // Use the middle entry's index for scene assignment
            const midIndex = chunk[Math.floor(chunk.length / 2)].originalIndex;
            const sceneId = getSceneId(campaignId, midIndex, history.length);
            chunks.push({ actions: chunk, sceneId });
        }
    }

    console.log(`  Memory chunks to store: ${chunks.length}`);

    let stored = 0, failed = 0;
    for (let i = 0; i < chunks.length; i++) {
        const { actions, sceneId } = chunks[i];
        const formatted = actions.map(a => ({
            role: a.role === 'player' ? 'player' : 'assistant',
            content: a.content.substring(0, 1000), // Cap for summarization
            turn: a.originalIndex
        }));

        try {
            const result = await storeMemory(campaignId, formatted, sceneId);
            stored++;
            if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
                const pct = Math.round(((i + 1) / chunks.length) * 100);
                console.log(`  Progress: ${i + 1}/${chunks.length} (${pct}%) — scene ${sceneId} — ${result.memory?.summary?.substring(0, 60) || ''}...`);
            }
        } catch (e) {
            failed++;
            console.error(`  ❌ Chunk ${i + 1} (scene ${sceneId}):`, e.message);
        }

        // Rate limit: gpt-4o-mini summarization
        await new Promise(r => setTimeout(r, 150));
    }

    console.log(`\n  ✅ Episodes stored: ${stored}, failed: ${failed}`);
    return stored;
}

// ─── Phase 2: World Facts ─────────────────────────────────────────────

async function backfillWorldFacts(campaignId) {
    console.log('\n🌍 PHASE 2: World Facts');
    console.log('─'.repeat(50));

    const facts = DAX_WORLD_FACTS;
    if (campaignId !== 'dax') {
        console.log('  ⚠️  No curated world facts for campaign:', campaignId);
        console.log('  Skipping Phase 2 (only episode backfill was performed)');
        return 0;
    }

    console.log(`  World facts to store: ${facts.length}`);

    let stored = 0, failed = 0;
    for (let i = 0; i < facts.length; i++) {
        const fact = facts[i];
        try {
            await storeWorldFact(campaignId, fact.fact_type, fact.subject, fact.content, fact.tags);
            stored++;
            console.log(`  [${i + 1}/${facts.length}] ${fact.fact_type}: ${fact.subject}`);
        } catch (e) {
            failed++;
            console.error(`  ❌ ${fact.subject}:`, e.message);
        }
        await new Promise(r => setTimeout(r, 150));
    }

    console.log(`\n  ✅ World facts stored: ${stored}, failed: ${failed}`);
    return stored;
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
    const campaignId = process.argv[2] || 'dax';
    const shouldClear = process.argv.includes('--clear');

    console.log(`\n🎲 RAG Memory Backfill Script v2`);
    console.log(`Campaign: ${campaignId}`);
    console.log(`Clear existing: ${shouldClear}`);
    console.log('═'.repeat(50));

    await checkHealth();

    const existingCount = await getMemoryCount(campaignId);
    const existingFacts = await getWorldFactCount(campaignId);
    console.log(`📊 Existing: ${existingCount} memories, ${existingFacts} world facts`);

    if (shouldClear && (existingCount > 0 || existingFacts > 0)) {
        await clearMemories(campaignId);
        // Brief pause for ChromaDB to process deletion
        await new Promise(r => setTimeout(r, 500));
    }

    // Load conversation history
    const historyPath = path.join(__dirname, '..', 'campaigns', campaignId, 'conversation-history.json');
    let history;
    try {
        const data = await fs.readFile(historyPath, 'utf8');
        history = JSON.parse(data);
        console.log(`📖 Loaded ${history.length} conversation entries`);
    } catch (e) {
        console.error('❌ Failed to read conversation history:', e.message);
        process.exit(1);
    }

    // Phase 1: Episodes
    const episodesStored = await backfillEpisodes(campaignId, history);

    // Phase 2: World Facts
    const factsStored = await backfillWorldFacts(campaignId);

    // Verify
    console.log('\n═'.repeat(50));
    console.log('📊 VERIFICATION');
    const finalMemories = await getMemoryCount(campaignId);
    const finalFacts = await getWorldFactCount(campaignId);
    console.log(`  Total memories: ${finalMemories}`);
    console.log(`  Total world facts: ${finalFacts}`);
    console.log(`  Episodes stored this run: ${episodesStored}`);
    console.log(`  World facts stored this run: ${factsStored}`);
    console.log('\n✅ Backfill complete!');
}

main().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
