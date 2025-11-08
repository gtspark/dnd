#!/usr/bin/env node

// Script to recover the missing fourth party member details
// This searches through all available logs and files for references

const fs = require('fs');
const path = require('path');

console.log('🔍 SEARCHING FOR MISSING FOURTH PARTY MEMBER...\n');

// Files to search through
const searchFiles = [
    './conversation-history.json',
    './dax campaign full log.txt',
    './dax-campaign-database.json',
    './complete-story-log.json',
    './complete-story-log.txt'
];

// Keywords related to the missing character
const keywords = [
    'fourth party member',
    'fourth member',
    'background check',
    'great fighter',
    'looking for.*job',
    'recruit',
    'fighter.*job',
    'brawn',
    'muscle',
    'combat specialist',
    'security specialist',
    'torres.*background',
    'torres.*check',
    'team.*brawn',
    'brains.*brawn'
];

async function searchFile(filePath, keywords) {
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  File not found: ${filePath}`);
            return [];
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const results = [];

        keywords.forEach(keyword => {
            const regex = new RegExp(keyword, 'gi');
            let match;
            while ((match = regex.exec(content)) !== null) {
                // Get context around the match
                const start = Math.max(0, match.index - 200);
                const end = Math.min(content.length, match.index + match[0].length + 200);
                const context = content.substring(start, end);

                results.push({
                    keyword,
                    match: match[0],
                    context: context.replace(/\s+/g, ' ').trim(),
                    position: match.index
                });
            }
        });

        return results;
    } catch (error) {
        console.log(`❌ Error reading ${filePath}: ${error.message}`);
        return [];
    }
}

async function recoverCharacter() {
    console.log('📋 SEARCH RESULTS:\n');

    for (const file of searchFiles) {
        console.log(`🔍 Searching: ${file}`);
        const results = await searchFile(file, keywords);

        if (results.length > 0) {
            console.log(`✅ Found ${results.length} potential references:\n`);

            results.forEach((result, index) => {
                console.log(`  [${index + 1}] Keyword: "${result.keyword}"`);
                console.log(`      Match: "${result.match}"`);
                console.log(`      Context: ...${result.context}...`);
                console.log(`      Position: ${result.position}\n`);
            });
        } else {
            console.log(`❌ No matches found\n`);
        }
    }

    // Additional search for character names that might be the fighter
    console.log('🔍 SEARCHING FOR POTENTIAL CHARACTER NAMES...\n');

    const namePatterns = [
        '[A-Z][a-z]+ [A-Z][a-z]+', // First Last
        'Commander [A-Z][a-z]+',
        'Captain [A-Z][a-z]+',
        'Sergeant [A-Z][a-z]+',
        'Lieutenant [A-Z][a-z]+'
    ];

    for (const file of searchFiles) {
        if (fs.existsSync(file)) {
            const content = fs.readFileSync(file, 'utf8');

            namePatterns.forEach(pattern => {
                const regex = new RegExp(pattern, 'g');
                let match;
                const foundNames = new Set();

                while ((match = regex.exec(content)) !== null) {
                    const name = match[0];
                    if (!foundNames.has(name) &&
                        !name.includes('Chen') &&
                        !name.includes('Yuen') &&
                        !name.includes('Dax') &&
                        !name.includes('Morrison') &&
                        !name.includes('Holbrook') &&
                        !name.includes('Torres') &&
                        !name.includes('Kellerman')) {

                        foundNames.add(name);
                        console.log(`📝 Potential character name in ${file}: "${name}"`);
                    }
                }
            });
        }
    }
}

recoverCharacter().catch(console.error);