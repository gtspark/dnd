#!/usr/bin/env node
// Quick script to set campaign password

const fs = require('fs');
const bcrypt = require('bcrypt');
const path = require('path');

const campaignId = process.argv[2];
const password = process.argv[3];

if (!campaignId || !password) {
    console.error('Usage: node set-campaign-password.js <campaign-id> <password>');
    process.exit(1);
}

async function setPassword() {
    try {
        // Hash password
        const hash = await bcrypt.hash(password, 10);
        console.log(`✅ Password hashed: ${hash.substring(0, 20)}...`);

        // Load campaigns index
        const indexPath = path.join(__dirname, 'campaigns', 'campaigns-index.json');
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

        // Find and update campaign
        const campaign = data.campaigns.find(c => c.id === campaignId);
        if (!campaign) {
            console.error(`❌ Campaign '${campaignId}' not found`);
            process.exit(1);
        }

        campaign.passwordHash = hash;

        // Save back
        fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
        console.log(`✅ Password set for campaign: ${campaign.name}`);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

setPassword();
