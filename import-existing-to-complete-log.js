#!/usr/bin/env node

// Import all existing conversation data into the complete story log
// This ensures we don't lose any more data and have a complete backup

const fs = require('fs').promises;
const path = require('path');

async function importExistingData() {
    console.log('🔄 IMPORTING ALL EXISTING DATA TO COMPLETE STORY LOG...\n');

    try {
        // Check if complete logs already exist
        let existingCompleteLog = [];
        try {
            const existingData = await fs.readFile('./complete-story-log.json', 'utf8');
            existingCompleteLog = JSON.parse(existingData);
            console.log(`📋 Found existing complete log with ${existingCompleteLog.length} entries`);
        } catch (err) {
            console.log('📋 No existing complete log found, starting fresh');
        }

        // Load current conversation history
        let conversationHistory = [];
        try {
            const historyData = await fs.readFile('./conversation-history.json', 'utf8');
            conversationHistory = JSON.parse(historyData);
            console.log(`📝 Loaded current conversation history: ${conversationHistory.length} entries`);
        } catch (err) {
            console.log('⚠️ No current conversation history found');
        }

        // Load historical campaign log
        let historicalEntries = [];
        try {
            const historicalText = await fs.readFile('./dax campaign full log.txt', 'utf8');
            console.log(`📚 Loaded historical log: ${Math.round(historicalText.length/1024)}KB`);

            // Parse historical log into entries (simplified parsing)
            const sections = historicalText.split(/player:|claude:/i);
            for (let i = 1; i < sections.length; i += 2) {
                if (i + 1 < sections.length) {
                    const playerAction = sections[i].trim();
                    const dmResponse = sections[i + 1].trim();

                    if (playerAction && dmResponse) {
                        historicalEntries.push({
                            timestamp: '2025-09-21T00:00:00.000Z', // Approximate historical date
                            player: playerAction.substring(0, 1000), // Limit length
                            dm: dmResponse.substring(0, 2000),
                            source: 'historical-import'
                        });
                    }
                }
            }
            console.log(`📊 Parsed ${historicalEntries.length} historical entries`);
        } catch (err) {
            console.log('⚠️ Could not load historical log');
        }

        // Convert current conversation history to complete log format
        const currentEntries = [];
        for (let i = 0; i < conversationHistory.length; i += 2) {
            const playerEntry = conversationHistory[i];
            const dmEntry = conversationHistory[i + 1];

            if (playerEntry && dmEntry && playerEntry.role === 'player' && dmEntry.role === 'assistant') {
                currentEntries.push({
                    timestamp: playerEntry.timestamp || new Date().toISOString(),
                    player: playerEntry.content,
                    dm: dmEntry.content,
                    source: 'current-session'
                });
            }
        }
        console.log(`🔄 Converted ${currentEntries.length} current session entries`);

        // Combine all data (avoid duplicates)
        const allEntries = [...existingCompleteLog];

        // Add historical entries (if not already imported)
        const hasHistorical = existingCompleteLog.some(entry => entry.source === 'historical-import');
        if (!hasHistorical && historicalEntries.length > 0) {
            allEntries.push(...historicalEntries);
            console.log(`➕ Added ${historicalEntries.length} historical entries`);
        } else {
            console.log('📋 Historical entries already imported');
        }

        // Add current entries (check for duplicates by timestamp)
        let addedCurrent = 0;
        for (const entry of currentEntries) {
            const isDuplicate = allEntries.some(existing =>
                existing.timestamp === entry.timestamp &&
                existing.player === entry.player
            );

            if (!isDuplicate) {
                allEntries.push(entry);
                addedCurrent++;
            }
        }
        console.log(`➕ Added ${addedCurrent} new current entries`);

        // Sort by timestamp
        allEntries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Save complete JSON log
        await fs.writeFile('./complete-story-log.json', JSON.stringify(allEntries, null, 2));

        // Create human-readable text log
        let textLog = '# COMPLETE D&D CAMPAIGN STORY LOG\n';
        textLog += `# Generated: ${new Date().toISOString()}\n`;
        textLog += `# Total entries: ${allEntries.length}\n\n`;

        for (const entry of allEntries) {
            textLog += `\n=== ${entry.timestamp} ===\n`;
            textLog += `PLAYER: ${entry.player}\n`;
            textLog += `DM: ${entry.dm}\n`;
        }

        await fs.writeFile('./complete-story-log.txt', textLog);

        console.log(`\n✅ IMPORT COMPLETE!`);
        console.log(`📁 complete-story-log.json: ${allEntries.length} entries`);
        console.log(`📁 complete-story-log.txt: ${Math.round(textLog.length/1024)}KB`);
        console.log(`📊 Breakdown:`);
        console.log(`   - Historical: ${historicalEntries.length} entries`);
        console.log(`   - Current session: ${addedCurrent} entries`);
        console.log(`   - Previously imported: ${existingCompleteLog.length} entries`);

        return {
            success: true,
            totalEntries: allEntries.length,
            historicalEntries: historicalEntries.length,
            currentEntries: addedCurrent,
            existingEntries: existingCompleteLog.length
        };

    } catch (error) {
        console.error('❌ IMPORT FAILED:', error);
        return { success: false, error: error.message };
    }
}

importExistingData().then(result => {
    if (result.success) {
        console.log('\n🎉 All existing data has been imported to complete story log!');
        console.log('📋 Future conversations will be automatically added to this log.');
    }
}).catch(console.error);