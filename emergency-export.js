#!/usr/bin/env node

// Emergency script to export complete campaign data
// This replicates the export functionality from rollback-simple.html

const fs = require('fs').promises;
const path = require('path');

async function emergencyExport() {
    console.log('🚨 EMERGENCY CAMPAIGN EXPORT STARTING...\n');

    try {
        // Load historical logs
        console.log('📚 Loading historical campaign log...');
        const historicalText = await fs.readFile('./dax campaign full log.txt', 'utf8');
        console.log(`✅ Historical log loaded: ${Math.round(historicalText.length/1024)}KB`);

        // Load current conversation
        console.log('💬 Loading current conversation history...');
        let currentLog = [];
        try {
            const currentData = await fs.readFile('./conversation-history.json', 'utf8');
            currentLog = JSON.parse(currentData);
            console.log(`✅ Current log loaded: ${currentLog.length} entries`);
        } catch (error) {
            console.log('⚠️ No current conversation history found');
        }

        // Load campaign state files
        console.log('🎯 Loading campaign state files...');
        const stateFiles = [
            './campaign-state.json',
            './dax-campaign-database.json',
            './dax campaign character sheet.txt'
        ];

        let additionalData = '';
        for (const file of stateFiles) {
            try {
                const data = await fs.readFile(file, 'utf8');
                additionalData += `\n\n## ${path.basename(file).toUpperCase()}\n\`\`\`\n${data}\n\`\`\`\n`;
                console.log(`✅ Loaded: ${file}`);
            } catch (error) {
                console.log(`⚠️ Could not load: ${file}`);
            }
        }

        // Combine everything
        console.log('📝 Combining all data...');
        let fullExport = '';
        fullExport += '# EMERGENCY D&D CAMPAIGN EXPORT\n';
        fullExport += `# Generated: ${new Date().toISOString()}\n`;
        fullExport += `# Emergency export to recover missing story data\n`;
        fullExport += `# Historical entries: ~991+ | Current session entries: ${currentLog.length}\n\n`;

        fullExport += '## HISTORICAL CAMPAIGN LOG (Pre-Enhanced Server)\n';
        fullExport += '```\n';
        fullExport += historicalText;
        fullExport += '\n```\n\n';

        if (currentLog.length > 0) {
            fullExport += '## CURRENT SESSION (Enhanced Server)\n\n';
            currentLog.forEach((entry, i) => {
                const timestamp = entry.timestamp ? new Date(entry.timestamp).toISOString() : 'No timestamp';
                fullExport += `### Entry ${i + 1} - ${entry.role.toUpperCase()} [${timestamp}]\n`;
                fullExport += `${entry.content}\n\n`;
            });
        }

        fullExport += additionalData;

        // Save complete export
        const exportFilename = `EMERGENCY-CAMPAIGN-EXPORT-${new Date().toISOString().split('T')[0]}.md`;
        await fs.writeFile(exportFilename, fullExport);

        console.log(`\n✅ EMERGENCY EXPORT COMPLETE!`);
        console.log(`📁 File: ${exportFilename}`);
        console.log(`📊 Size: ${Math.round(fullExport.length/1024)}KB`);
        console.log(`📈 Total entries: Historical + ${currentLog.length} current`);

        // Also create a searchable version for fourth party member
        console.log('\n🔍 Creating searchable version for character recovery...');

        // Extract all character mentions
        const characterMentions = [];
        const namePattern = /[A-Z][a-z]+ [A-Z][a-z]+/g;
        let match;

        while ((match = namePattern.exec(fullExport)) !== null) {
            const name = match[0];
            if (!name.includes('Chen Martinez') &&
                !name.includes('Dr. Yuen') &&
                !name.includes('Dax Korren') &&
                !name.includes('Captain Morrison') &&
                !name.includes('Director Holbrook') &&
                !name.includes('Commander Torres') &&
                !name.includes('Mr. Kellerman')) {

                characterMentions.push({
                    name: name,
                    position: match.index,
                    context: fullExport.substring(Math.max(0, match.index - 200),
                                                 Math.min(fullExport.length, match.index + 200))
                });
            }
        }

        // Search for fighter/brawn references
        const fighterRefs = [];
        const fighterPatterns = [
            /fighter/gi,
            /brawn/gi,
            /background check/gi,
            /great.*fighter/gi,
            /looking.*job/gi,
            /fourth.*member/gi,
            /recruit/gi,
            /muscle/gi,
            /combat.*specialist/gi
        ];

        fighterPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(fullExport)) !== null) {
                fighterRefs.push({
                    term: match[0],
                    position: match.index,
                    context: fullExport.substring(Math.max(0, match.index - 300),
                                                 Math.min(fullExport.length, match.index + 300))
                });
            }
        });

        const searchResults = {
            characterMentions: characterMentions,
            fighterReferences: fighterRefs,
            exportSize: fullExport.length,
            exportFile: exportFilename,
            timestamp: new Date().toISOString()
        };

        await fs.writeFile(`CHARACTER-SEARCH-${new Date().toISOString().split('T')[0]}.json`,
                          JSON.stringify(searchResults, null, 2));

        console.log(`🔍 Character search results saved`);
        console.log(`📋 Found ${characterMentions.length} potential character names`);
        console.log(`🎯 Found ${fighterRefs.length} fighter/brawn references`);

        return {
            exportFile: exportFilename,
            searchFile: `CHARACTER-SEARCH-${new Date().toISOString().split('T')[0]}.json`,
            success: true
        };

    } catch (error) {
        console.error('❌ EMERGENCY EXPORT FAILED:', error);
        return { success: false, error: error.message };
    }
}

emergencyExport().then(result => {
    if (result.success) {
        console.log(`\n🎉 SUCCESS! Check files:`);
        console.log(`📁 ${result.exportFile}`);
        console.log(`🔍 ${result.searchFile}`);
    }
}).catch(console.error);