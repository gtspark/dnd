#!/usr/bin/env node
/**
 * Cleanup Conversation History - Remove blank/empty entries
 * Usage: node cleanup-conversation-history.js [campaign-id]
 */

const fs = require('fs').promises;
const path = require('path');

async function cleanupConversationHistory(campaignId = 'test-silverpeak') {
    console.log(`🧹 Cleaning conversation history for campaign: ${campaignId}`);

    const campaignDir = path.join(__dirname, 'campaigns', campaignId);
    const historyFile = path.join(campaignDir, 'conversation-history.json');
    const backupFile = path.join(campaignDir, `conversation-history.backup-cleanup-${Date.now()}.json`);

    try {
        // Read current history
        const historyRaw = await fs.readFile(historyFile, 'utf8');
        const history = JSON.parse(historyRaw);

        console.log(`📊 Current history: ${history.length} entries`);

        // Create backup before cleaning
        await fs.writeFile(backupFile, historyRaw);
        console.log(`💾 Backup created: ${path.basename(backupFile)}`);

        // Filter out empty/blank entries
        const cleanedHistory = history.filter(entry => {
            // Check for missing or empty content
            if (!entry.content || !entry.content.trim()) {
                console.log(`  ❌ Removing empty entry: ${JSON.stringify(entry)}`);
                return false;
            }

            // Check for missing role/author
            if (!entry.role && !entry.author) {
                console.log(`  ⚠️  Entry missing role/author but has content - keeping: "${entry.content.substring(0, 50)}..."`);
            }

            return true;
        });

        const removedCount = history.length - cleanedHistory.length;

        if (removedCount === 0) {
            console.log('✅ No blank entries found - history is clean!');
            return;
        }

        // Write cleaned history
        await fs.writeFile(historyFile, JSON.stringify(cleanedHistory, null, 2));

        console.log(`\n✅ Cleanup complete!`);
        console.log(`   Entries before: ${history.length}`);
        console.log(`   Entries after:  ${cleanedHistory.length}`);
        console.log(`   Removed:        ${removedCount}`);
        console.log(`\n💡 Backup saved at: ${backupFile}`);
        console.log(`   To restore: cp "${backupFile}" "${historyFile}"`);

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`❌ History file not found: ${historyFile}`);
        } else {
            console.error('❌ Cleanup failed:', error.message);
        }
        process.exit(1);
    }
}

const campaignId = process.argv[2] || 'test-silverpeak';
cleanupConversationHistory(campaignId).catch(error => {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
});
