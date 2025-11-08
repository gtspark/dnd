// Direct import of campaign history
async function directImport() {
    try {
        console.log('🔄 Loading campaign file...');
        const response = await fetch('./dax%20campaign%20full%20log.txt');
        const text = await response.text();

        console.log('📊 File loaded, parsing...');
        const lines = text.split('\n');
        const entries = [];
        let entryCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Player entries
            if (line.startsWith('player:')) {
                entries.push({
                    author: 'player',
                    content: line.substring(7).trim(), // Remove "player:"
                    timestamp: new Date('2025-09-21T06:00:00Z').toISOString()
                });
                entryCount++;
            }
            // DM entries
            else if (line.startsWith('claude:')) {
                entries.push({
                    author: 'dm',
                    content: line.substring(7).trim(), // Remove "claude:"
                    timestamp: new Date('2025-09-21T06:00:00Z').toISOString()
                });
                entryCount++;
            }
            // Longer narrative text (likely DM responses)
            else if (line.length > 50 &&
                     (line.includes('you') || line.includes('your') || line.includes('dax') ||
                      line.includes('chen') || line.includes('yuen') || line.includes('station'))) {
                entries.push({
                    author: 'dm',
                    content: line,
                    timestamp: new Date('2025-09-21T06:00:00Z').toISOString()
                });
                entryCount++;
            }
        }

        // Count Chen pronouns for verification
        let chenFemaleCount = 0;
        let chenMaleCount = 0;

        entries.forEach(entry => {
            const content = entry.content.toLowerCase();
            if (content.includes('chen')) {
                if (content.match(/chen.*?she|she.*?chen|chen.*?her|her.*?chen/)) {
                    chenFemaleCount++;
                }
                if (content.match(/chen.*?he(?!r)|he(?!r).*?chen|chen.*?his|his.*?chen/)) {
                    chenMaleCount++;
                }
            }
        });

        console.log(`✅ Parsed ${entries.length} entries`);
        console.log(`📊 Chen female pronouns: ${chenFemaleCount}, male: ${chenMaleCount}`);

        // Save to localStorage
        localStorage.setItem('dnd_game_log', JSON.stringify(entries));

        console.log(`💾 Imported ${entries.length} entries to localStorage`);
        console.log('🔄 Refresh the main page to see results');

        return entries.length;

    } catch (error) {
        console.error('❌ Import failed:', error);
        return 0;
    }
}

// Run the import
directImport();