#!/usr/bin/env node
/**
 * Search RAG memories for a campaign
 * 
 * Usage: node search-rag.js <query> [campaign] [n_results]
 * Example: node search-rag.js "holbrook ship" dax 5
 */

const MEMORY_SERVICE_URL = 'http://localhost:5003';

async function search(query, campaign = 'dax', nResults = 5) {
    console.log(`\n🔍 Searching "${query}" in ${campaign} (top ${nResults})\n`);
    console.log('─'.repeat(60));
    
    try {
        const response = await fetch(`${MEMORY_SERVICE_URL}/retrieve-memories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: query,
                campaign: campaign,
                n_results: parseInt(nResults)
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        const data = await response.json();
        
        if (!data.memories || data.memories.length === 0) {
            console.log('No memories found.');
            return;
        }
        
        data.memories.forEach((mem, i) => {
            const relevance = (1 - (mem.distance || 0)).toFixed(3);
            console.log(`\n[${i + 1}] Relevance: ${relevance}`);
            console.log('─'.repeat(40));
            console.log(mem.text);
            console.log('');
        });
        
        console.log('─'.repeat(60));
        console.log(`Found ${data.memories.length} memories`);
        
    } catch (e) {
        console.error('❌ Error:', e.message);
    }
}

const query = process.argv[2];
const campaign = process.argv[3] || 'dax';
const nResults = process.argv[4] || 5;

if (!query) {
    console.log('Usage: node search-rag.js <query> [campaign] [n_results]');
    console.log('Example: node search-rag.js "holbrook ship" dax 5');
    process.exit(1);
}

search(query, campaign, nResults);
