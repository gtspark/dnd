// Campaign Rollback Utility
// Usage: node rollback.js "search text to find rollback point"

const fs = require('fs');
const path = require('path');

function rollbackCampaign(searchText) {
    try {
        console.log(`🔄 Searching for rollback point: "${searchText}"`);

        // Load current game log
        const logPath = path.join(__dirname, 'game-log-backup.json');
        let gameLog = [];

        if (fs.existsSync(logPath)) {
            gameLog = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        } else {
            console.log('❌ No backup log found. Cannot rollback.');
            return;
        }

        // Find the entry containing the search text
        let rollbackIndex = -1;
        for (let i = gameLog.length - 1; i >= 0; i--) {
            if (gameLog[i].content && gameLog[i].content.includes(searchText)) {
                rollbackIndex = i;
                break;
            }
        }

        if (rollbackIndex === -1) {
            console.log(`❌ Could not find "${searchText}" in game log`);
            console.log('Available entries:');
            gameLog.forEach((entry, i) => {
                console.log(`${i}: ${entry.author} - ${entry.content.substring(0, 100)}...`);
            });
            return;
        }

        // Rollback to that point (keep entries up to and including the found entry)
        const rolledBackLog = gameLog.slice(0, rollbackIndex + 1);

        console.log(`✅ Found rollback point at entry ${rollbackIndex}`);
        console.log(`📋 Rolling back from ${gameLog.length} entries to ${rolledBackLog.length} entries`);

        // Save the rolled back log
        const outputPath = path.join(__dirname, 'game-log-rolled-back.json');
        fs.writeFileSync(outputPath, JSON.stringify(rolledBackLog, null, 2));

        console.log(`💾 Rolled back log saved to: ${outputPath}`);
        console.log(`\n🎯 Last entry after rollback:`);
        console.log(`Author: ${rolledBackLog[rolledBackLog.length - 1].author}`);
        console.log(`Content: ${rolledBackLog[rolledBackLog.length - 1].content}`);

        console.log(`\n📋 To apply this rollback:`);
        console.log(`1. Copy the rolled back log to replace current localStorage`);
        console.log(`2. Or manually load the rolled back entries`);

    } catch (error) {
        console.error('❌ Error during rollback:', error);
    }
}

// Get search text from command line
const searchText = process.argv[2];
if (!searchText) {
    console.log('Usage: node rollback.js "search text to find rollback point"');
    console.log('Example: node rollback.js "0600 meeting is in three hours"');
    process.exit(1);
}

rollbackCampaign(searchText);