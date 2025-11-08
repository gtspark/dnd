#!/usr/bin/env node

// Rebuild conversation-history.json from emergency export
const fs = require('fs').promises;

async function rebuildConversationHistory() {
    console.log('🔄 Rebuilding conversation history from emergency export...');

    try {
        // Read the emergency export
        const emergencyExport = await fs.readFile('./EMERGENCY-CAMPAIGN-EXPORT-2025-09-23.md', 'utf8');
        console.log(`📚 Loaded emergency export: ${Math.round(emergencyExport.length/1024)}KB`);

        // Parse entries from the export
        const entries = [];
        const lines = emergencyExport.split('\n');

        let currentEntry = null;
        let collectingContent = false;

        for (const line of lines) {
            // Match entry headers like "### Entry 123 - PLAYER [timestamp]"
            const entryMatch = line.match(/^### Entry (\d+) - (PLAYER|ASSISTANT) \[([^\]]+)\]$/);

            if (entryMatch) {
                // Save previous entry if exists
                if (currentEntry && currentEntry.content.trim()) {
                    entries.push(currentEntry);
                }

                // Start new entry
                const [, entryNum, role, timestamp] = entryMatch;
                currentEntry = {
                    role: role.toLowerCase() === 'player' ? 'player' : 'assistant',
                    content: '',
                    timestamp: timestamp
                };
                collectingContent = true;
                continue;
            }

            // Stop collecting at next major header or DM markers
            if (line.startsWith('## ') || line.startsWith('**DM (') || line.startsWith('📝 SCENE')) {
                collectingContent = false;
                continue;
            }

            // Collect content for current entry
            if (collectingContent && currentEntry) {
                if (currentEntry.content) {
                    currentEntry.content += '\n' + line;
                } else {
                    currentEntry.content = line;
                }
            }
        }

        // Add final entry
        if (currentEntry && currentEntry.content.trim()) {
            entries.push(currentEntry);
        }

        console.log(`📊 Parsed ${entries.length} conversation entries`);

        // Save to conversation-history.json
        await fs.writeFile('./conversation-history.json', JSON.stringify(entries, null, 2));

        console.log(`✅ Rebuilt conversation-history.json with ${entries.length} entries`);

        return {
            success: true,
            entryCount: entries.length
        };

    } catch (error) {
        console.error('❌ Rebuild failed:', error);
        return { success: false, error: error.message };
    }
}

rebuildConversationHistory().then(result => {
    if (result.success) {
        console.log(`🎉 Successfully rebuilt conversation history with ${result.entryCount} entries!`);
    } else {
        console.log(`💥 Failed to rebuild: ${result.error}`);
    }
}).catch(console.error);