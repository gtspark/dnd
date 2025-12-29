#!/usr/bin/env node
/**
 * Backfill RAG Memories Script
 * 
 * This script reads the conversation history for a campaign and stores
 * it in ChromaDB in chunks for RAG retrieval.
 * 
 * Usage: node backfill-rag-memories.js [campaign-id]
 * Example: node backfill-rag-memories.js dax
 */

const fs = require('fs').promises;
const path = require('path');

const MEMORY_SERVICE_URL = 'http://localhost:5003';
const CHUNK_SIZE = 4; // Number of exchanges per memory chunk

async function checkMemoryService() {
    try {
        const response = await fetch(`${MEMORY_SERVICE_URL}/health`);
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Memory service healthy:', data);
            return true;
        }
    } catch (e) {
        console.error('❌ Memory service not reachable:', e.message);
        return false;
    }
    return false;
}

async function storeMemory(campaign, actions, session = 1) {
    const response = await fetch(`${MEMORY_SERVICE_URL}/store-memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            campaign: campaign,
            actions: actions,
            session: session
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to store memory: ${response.status} - ${errorText}`);
    }
    return await response.json();
}

async function getExistingMemoryCount(campaign) {
    try {
        const response = await fetch(`${MEMORY_SERVICE_URL}/memories?campaign=${campaign}`);
        if (response.ok) {
            const data = await response.json();
            return data.count || 0;
        }
    } catch (e) {
        console.warn('Could not get memory count:', e.message);
    }
    return 0;
}

async function clearExistingMemories(campaign) {
    try {
        const response = await fetch(`${MEMORY_SERVICE_URL}/clear-memories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign: campaign })
        });
        if (response.ok) {
            console.log('🗑️  Cleared existing memories for campaign:', campaign);
            return true;
        }
    } catch (e) {
        console.warn('Could not clear memories:', e.message);
    }
    return false;
}

function formatExchange(entry, turn) {
    const content = entry.content?.trim();
    // Skip very short or empty entries
    if (!content || content.length < 20) return null;
    return {
        role: entry.role === 'player' ? 'player' : 'assistant',
        content: content,
        turn: turn
    };
}

async function main() {
    const campaignId = process.argv[2] || 'dax';
    const shouldClear = process.argv.includes('--clear');
    
    console.log(`\n🎲 RAG Memory Backfill Script`);
    console.log(`Campaign: ${campaignId}`);
    console.log(`Clear existing: ${shouldClear}`);
    console.log('─'.repeat(50));
    
    // Check memory service
    if (!await checkMemoryService()) {
        console.error('❌ Cannot proceed without memory service');
        process.exit(1);
    }
    
    // Get existing count
    const existingCount = await getExistingMemoryCount(campaignId);
    console.log(`📊 Existing memories: ${existingCount}`);
    
    if (shouldClear && existingCount > 0) {
        await clearExistingMemories(campaignId);
    }
    
    // Read conversation history
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
    
    // Filter and format entries with turn numbers
    let turnCounter = 1;
    const formattedEntries = history
        .map(entry => formatExchange(entry, turnCounter++))
        .filter(e => e !== null);
    
    console.log(`📝 Valid entries to process: ${formattedEntries.length}`);
    
    // Create chunks (as arrays of action objects for the API)
    const chunks = [];
    for (let i = 0; i < formattedEntries.length; i += CHUNK_SIZE) {
        const chunk = formattedEntries.slice(i, i + CHUNK_SIZE);
        if (chunk.length >= 2) { // Only store chunks with at least 2 exchanges
            chunks.push(chunk);
        }
    }
    
    console.log(`📦 Created ${chunks.length} memory chunks (${CHUNK_SIZE} exchanges each)`);
    console.log('─'.repeat(50));
    
    // Store chunks with progress
    let stored = 0;
    let failed = 0;
    
    // Calculate session numbers based on chunks
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const session = Math.floor(i / 10) + 1; // Group ~10 chunks per "session"
        try {
            await storeMemory(campaignId, chunk, session);
            stored++;
            
            // Progress indicator
            if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
                const pct = Math.round(((i + 1) / chunks.length) * 100);
                console.log(`  Progress: ${i + 1}/${chunks.length} (${pct}%)`);
            }
        } catch (e) {
            failed++;
            console.error(`  ❌ Failed to store chunk ${i + 1}:`, e.message);
        }
        
        // Small delay to avoid overwhelming the service
        await new Promise(r => setTimeout(r, 100));
    }
    
    console.log('─'.repeat(50));
    console.log(`✅ Backfill complete!`);
    console.log(`   Stored: ${stored} chunks`);
    console.log(`   Failed: ${failed} chunks`);
    
    // Verify
    const finalCount = await getExistingMemoryCount(campaignId);
    console.log(`   Total memories now: ${finalCount}`);
}

main().catch(console.error);
