// Context Test Script for D&D Campaign Server
// Run this to verify character genders and story continuity

const testActions = [
    {
        action: "What does Chen think about the situation?",
        expected: "Should refer to Chen as 'she/her'"
    },
    {
        action: "Ask Dr. Yuen about the memory lock",
        expected: "Should refer to Yuen as 'she/her' and know about memory lock"
    },
    {
        action: "How many arms does Dax have?",
        expected: "Should mention 4 arms (Vexian)"
    },
    {
        action: "What happened to Captain Morrison?",
        expected: "Should know Morrison died maintaining quarantine"
    },
    {
        action: "Who is hunting us?",
        expected: "Should mention Osprey operatives"
    },
    {
        action: "What evidence do we have against Weyland?",
        expected: "Should mention Martinez's data log and/or Kellerman's slip"
    }
];

async function runTests() {
    console.log("🧪 D&D Campaign Context Test Suite");
    console.log("=" + "=".repeat(59));
    
    for (let i = 0; i < testActions.length; i++) {
        const test = testActions[i];
        console.log(`\nTest ${i + 1}: ${test.action}`);
        console.log(`Expected: ${test.expected}`);
        
        try {
            const response = await fetch('http://localhost:3000/api/dnd/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: test.action,
                    sessionId: 'test-session',
                    useRealClaude: false  // Use fallback to test context system
                })
            });
            
            const data = await response.json();
            console.log(`Response: ${data.narrative.substring(0, 200)}...`);
            
            // Basic checks
            if (test.action.includes("Chen")) {
                const hasFemale = /\bshe\b|\bher\b/i.test(data.narrative);
                console.log(hasFemale ? "✅ Correct gender" : "❌ Wrong gender!");
            }
            if (test.action.includes("Yuen")) {
                const hasFemale = /\bshe\b|\bher\b/i.test(data.narrative);
                console.log(hasFemale ? "✅ Correct gender" : "❌ Wrong gender!");
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            console.log("Is the server running? Start with: node enhanced-server.js");
        }
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("Test complete! Check results above.");
}

// Check if server is running first
fetch('http://localhost:3000/api/dnd/context')
    .then(() => {
        console.log("✅ Server is running!");
        runTests();
    })
    .catch(() => {
        console.log("❌ Server is not running!");
        console.log("Start it with: node enhanced-server.js");
        console.log("Or double-click START_ENHANCED_DND_SERVER.bat");
    });