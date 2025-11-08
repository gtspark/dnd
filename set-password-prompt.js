const readline = require('readline');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Enter password for Titan Station campaign: ', async (password) => {
    if (!password) {
        console.log('❌ Password cannot be empty');
        rl.close();
        process.exit(1);
    }

    try {
        // Hash password
        const hash = await bcrypt.hash(password, 10);
        console.log(`✅ Password hashed successfully`);

        // Load campaigns index
        const indexPath = path.join(__dirname, 'campaigns', 'campaigns-index.json');
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

        // Update default campaign
        const campaign = data.campaigns.find(c => c.id === 'default');
        campaign.passwordHash = hash;

        // Save back
        fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
        console.log(`✅ Password set for campaign: ${campaign.name}`);
        console.log(`🔒 Campaign is now password protected`);
    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    rl.close();
});
