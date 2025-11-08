// BALANCED D&D SERVER - Simple but handles large campaigns
const express = require('express');
const fs = require('fs').promises;
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// The conversation history (can grow indefinitely)
let conversationHistory = [];

// Core facts that must NEVER be forgotten
const CORE_FACTS = `
# D&D CAMPAIGN - CRITICAL FACTS (ALWAYS TRUE):
- Dax Stargazer: MALE Vexian, FOUR ARMS, Tech-Scout, Level 3, 9 HP max
- Chen Martinez: FEMALE Human, Engineer, she/her pronouns
- Dr. Sarah Yuen: FEMALE Human, Xenobiologist, she/her pronouns  
- Jonathan Park: EXISTS, U.E.S. Representative, nervous
- Setting: Titan Station, after U.E.S. Wanderer incident
- Keth'var: Weaker than coffee (Dax's mild stimulant)
- Coffee: Keeps Dax awake 72 HOURS
`;

// Load conversation history on startup
async function loadHistory() {
    try {
        // Try loading from conversation-history.json first
        const data = await fs.readFile('./conversation-history.json', 'utf8');
        conversationHistory = JSON.parse(data);
        console.log(`📚 Loaded ${conversationHistory.length} conversation entries`);
        console.log(`📏 Total size: ${JSON.stringify(conversationHistory).length / 1024}KB`);
    } catch (err) {
        console.log('📝 No conversation-history.json found');
        
        // Try to import from the emergency export if it exists
        try {
            const exportData = await fs.readFile('./EMERGENCY-CAMPAIGN-EXPORT-2025-09-23.md', 'utf8');
            console.log(`📦 Found emergency export: ${(exportData.length / 1024).toFixed(0)}KB`);
            
            // Parse the export into conversation entries (basic parsing)
            const lines = exportData.split('\n');
            let currentEntry = null;
            
            for (const line of lines) {
                if (line.includes('**Player Action**') || line.includes('player:')) {
                    if (currentEntry) conversationHistory.push(currentEntry);
                    currentEntry = { role: 'player', content: line };
                } else if (line.includes('**DM Response**') || line.includes('assistant:')) {
                    if (currentEntry) conversationHistory.push(currentEntry);
                    currentEntry = { role: 'assistant', content: line };
                } else if (currentEntry) {
                    currentEntry.content += '\n' + line;
                }
            }
            if (currentEntry) conversationHistory.push(currentEntry);
            
            console.log(`📥 Imported ${conversationHistory.length} entries from emergency export`);
            await saveHistory();
            
        } catch (err2) {
            console.log('📝 Starting fresh campaign');
            conversationHistory = [];
        }
    }
}

// Save conversation history
async function saveHistory() {
    try {
        await fs.writeFile(
            './conversation-history.json',
            JSON.stringify(conversationHistory, null, 2)
        );
    } catch (err) {
        console.error('Failed to save history:', err);
    }
}

// Simple keyword search through history
function searchHistory(keywords, maxResults = 10) {
    const results = [];
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    
    // Search backwards through history (recent first)
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const entry = conversationHistory[i];
        const content = entry.content.toLowerCase();
        
        // Check if this entry contains any keywords
        if (lowerKeywords.some(keyword => content.includes(keyword))) {
            results.push(entry);
            
            // Include surrounding context (2 before, 2 after)
            for (let j = Math.max(0, i - 2); j <= Math.min(conversationHistory.length - 1, i + 2); j++) {
                if (j !== i && !results.includes(conversationHistory[j])) {
                    results.push(conversationHistory[j]);
                }
            }
            
            if (results.length >= maxResults) break;
        }
    }
    
    return results;
}

// Extract keywords from player action
function extractKeywords(action) {
    // Remove common words and extract meaningful terms
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
                         'of', 'with', 'by', 'from', 'about', 'as', 'is', 'was', 'are', 'were',
                         'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                         'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can'];
    
    const words = action.toLowerCase().split(/\s+/);
    return words.filter(word => 
        word.length > 3 && 
        !commonWords.includes(word) &&
        isNaN(word)
    );
}

// Process player action
app.post('/api/dnd/action', async (req, res) => {
    const { action } = req.body;
    
    // Build the prompt
    let systemPrompt = CORE_FACTS + '\n\n';
    systemPrompt += 'You are the Dungeon Master. Maintain continuity with the story.\n\n';
    
    // Include more history if we have token budget
    // Start with 200 recent, increase if campaign is small
    const tokenBudget = 80000; // Leave 20k for response
    let recentCount = 200;
    
    // If total history is small enough, just send it all
    const totalSize = JSON.stringify(conversationHistory).length;
    const totalTokens = Math.round(totalSize / 4);
    
    if (totalTokens < tokenBudget) {
        // Campaign fits! Send everything
        recentCount = conversationHistory.length;
        console.log(`📚 Sending ENTIRE history: ${recentCount} exchanges`);
    } else {
        // Send as much as we can fit
        recentCount = Math.min(400, conversationHistory.length);
        console.log(`📚 Sending last ${recentCount} exchanges`);
    }
    
    const recentHistory = conversationHistory.slice(-recentCount);
    systemPrompt += '## RECENT HISTORY (last ' + recentHistory.length + ' exchanges):\n';
    systemPrompt += recentHistory.map(entry => 
        `${entry.role.toUpperCase()}: ${entry.content.substring(0, 500)}${entry.content.length > 500 ? '...' : ''}`
    ).join('\n\n');
    systemPrompt += '\n\n';
    
    // If the action seems to reference something specific, search for it
    const actionLower = action.toLowerCase();
    if (actionLower.includes('remember') || 
        actionLower.includes('recall') || 
        actionLower.includes('earlier') || 
        actionLower.includes('before') ||
        actionLower.includes('that time') ||
        actionLower.includes('when we') ||
        actionLower.includes('last time')) {
        
        // Extract keywords and search
        const keywords = extractKeywords(action);
        console.log(`🔍 Searching for keywords: ${keywords.join(', ')}`);
        
        if (keywords.length > 0) {
            const relevantHistory = searchHistory(keywords, 20);
            if (relevantHistory.length > 0) {
                systemPrompt += '## RELEVANT PAST CONTEXT:\n';
                systemPrompt += relevantHistory.map(entry => 
                    `${entry.role.toUpperCase()}: ${entry.content.substring(0, 300)}${entry.content.length > 300 ? '...' : ''}`
                ).join('\n\n');
                systemPrompt += '\n\n';
                console.log(`📎 Added ${relevantHistory.length} relevant historical entries`);
            }
        }
    }
    
    // Check for NPC references and add their history
    const npcNames = ['jonathan park', 'holbrook', 'kellerman', 'torres', 'martinez', 'rostova'];
    for (const npc of npcNames) {
        if (actionLower.includes(npc)) {
            const npcHistory = searchHistory([npc], 10);
            if (npcHistory.length > 0) {
                systemPrompt += `## ${npc.toUpperCase()} CONTEXT:\n`;
                systemPrompt += npcHistory.map(entry => 
                    `${entry.role.toUpperCase()}: ${entry.content.substring(0, 200)}...`
                ).join('\n\n');
                systemPrompt += '\n\n';
                console.log(`👤 Added ${npc} history: ${npcHistory.length} entries`);
            }
        }
    }
    
    systemPrompt += `CURRENT PLAYER ACTION: ${action}\n\n`;
    systemPrompt += 'Respond as the DM. You have recent history and any relevant past context above.\n';
    systemPrompt += 'For dice rolls, use format: 🎲 Roll [Skill] (DC [number]) to [action]';
    
    // Log prompt size
    const promptSize = systemPrompt.length;
    const estimatedTokens = Math.round(promptSize / 4);
    console.log(`📏 Prompt size: ${(promptSize/1024).toFixed(1)}KB (~${estimatedTokens} tokens)`);
    
    // Warn if getting large
    if (estimatedTokens > 50000) {
        console.log('⚠️ Warning: Prompt is getting large. Consider summarizing older history.');
    }

    try {
        // Call Claude API
        const response = await callClaude(systemPrompt);
        
        // Save to history
        conversationHistory.push(
            { role: 'player', content: action, timestamp: new Date().toISOString() },
            { role: 'assistant', content: response, timestamp: new Date().toISOString() }
        );
        
        await saveHistory();
        
        res.json({ 
            message: response,
            stats: {
                historySize: conversationHistory.length,
                promptTokens: estimatedTokens
            }
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.json({ 
            message: "The station's emergency lights flicker. What do you do?",
            error: true
        });
    }
});

// Simple Claude API call
async function callClaude(prompt) {
    if (!process.env.CLAUDE_API_KEY) {
        // Return a mock response if no API key
        return "The corridor stretches ahead into darkness. The station hums with mechanical life. What do you do?";
    }
    
    try {
        const fetch = require('node-fetch');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 2000
            })
        });
        
        const data = await response.json();
        return data.content[0].text;
    } catch (error) {
        console.error('Claude API error:', error);
        return "The station shudders. You hear distant sounds. What do you do?";
    }
}

// Get conversation history
app.get('/api/dnd/conversation-history', async (req, res) => {
    res.json(conversationHistory);
});

// Get stats
app.get('/api/dnd/stats', async (req, res) => {
    const totalSize = JSON.stringify(conversationHistory).length;
    res.json({
        entries: conversationHistory.length,
        sizeKB: Math.round(totalSize / 1024),
        estimatedTokens: Math.round(totalSize / 4),
        sessionsApprox: Math.round(conversationHistory.length / 20),
        claudeLimit: 100000,
        percentUsed: Math.round((totalSize / 4) / 1000)
    });
});

// Simple dice roll
app.post('/api/dnd/roll', (req, res) => {
    const { dice } = req.body;
    const match = dice.match(/(\d+)d(\d+)([+-]\d+)?/);
    
    if (!match) {
        return res.json({ error: 'Invalid dice format' });
    }
    
    const [_, num, sides, mod] = match;
    const modifier = mod ? parseInt(mod) : 0;
    
    let total = modifier;
    const rolls = [];
    
    for (let i = 0; i < parseInt(num); i++) {
        const roll = Math.floor(Math.random() * parseInt(sides)) + 1;
        rolls.push(roll);
        total += roll;
    }
    
    res.json({ rolls, modifier, total, notation: dice });
});

// Start server
async function start() {
    await loadHistory();
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        const totalSize = JSON.stringify(conversationHistory).length;
        const estimatedTokens = Math.round(totalSize / 4);
        
        console.log('\n========================================');
        console.log('🎲 BALANCED D&D SERVER');
        console.log('========================================');
        console.log(`📍 http://localhost:${PORT}/`);
        console.log(`📚 History: ${conversationHistory.length} entries`);
        console.log(`📏 Size: ${Math.round(totalSize/1024)}KB (~${estimatedTokens} tokens)`);
        console.log(`⚡ Strategy: Recent 100 + keyword search`);
        console.log(`📊 Claude limit: ~100k tokens`);
        console.log(`📈 Room for ~${Math.round((100000 - estimatedTokens) / 200)} more exchanges`);
        console.log('========================================\n');
    });
}

start().catch(console.error);
