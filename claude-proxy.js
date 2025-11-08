// Claude API Proxy Server for D&D Campaign
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3004;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Load API configuration
async function loadConfig() {
    try {
        const configPath = path.join(__dirname, 'api-config.json');
        const configData = await fs.readFile(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.error('Failed to load API config:', error);
        throw error;
    }
}

// Load system prompt
async function loadSystemPrompt() {
    try {
        const promptPath = path.join(__dirname, 'dm-system-prompt.md');
        return await fs.readFile(promptPath, 'utf8');
    } catch (error) {
        console.error('Failed to load system prompt:', error);
        throw error;
    }
}

// Load campaign state
async function loadCampaignState(sandbox = true) {
    try {
        const stateFile = sandbox ? 'sandbox-state.json' : 'dax-campaign-database.json';
        const statePath = path.join(__dirname, stateFile);
        const stateData = await fs.readFile(statePath, 'utf8');
        return JSON.parse(stateData);
    } catch (error) {
        console.error('Failed to load campaign state:', error);
        throw error;
    }
}

// Build context message for Claude
function buildContextMessage(campaignState, sandbox) {
    let context = `# Current Campaign State\\n\\n`;

    if (sandbox) {
        context += `**SANDBOX MODE**: This is a test environment.\\n\\n`;
    }

    if (campaignState.campaign_title) {
        context += `**Campaign**: ${campaignState.campaign_title}\\n`;
    }
    if (campaignState.current_time) {
        context += `**Time**: ${campaignState.current_time}\\n`;
    }
    if (campaignState.current_location) {
        context += `**Location**: ${campaignState.current_location}\\n`;
    }
    if (campaignState.current_scene) {
        context += `**Scene**: ${campaignState.current_scene.status}\\n`;
        context += `**Context**: ${campaignState.current_scene.immediate_context}\\n\\n`;
    }

    // Add character information
    if (campaignState.party) {
        context += `**Party Members**:\\n`;
        for (const [key, char] of Object.entries(campaignState.party)) {
            context += `- ${char.name}: ${char.background || char.race_class || 'Unknown'}\\n`;
        }
    }

    // Add continuation context
    if (campaignState.continuation_context) {
        context += `\\n**Current Situation**: ${campaignState.continuation_context}\\n`;
    }

    return context;
}

// Claude API endpoint
app.post('/api/claude', async (req, res) => {
    try {
        console.log('Received request:', {
            message: req.body.message?.substring(0, 100) + '...',
            isRollResult: req.body.isRollResult,
            sandbox: req.body.sandbox
        });

        const config = await loadConfig();
        const systemPrompt = await loadSystemPrompt();
        const campaignState = await loadCampaignState(req.body.sandbox);

        // Build context
        const contextMessage = buildContextMessage(campaignState, req.body.sandbox);

        let fullMessage;
        if (req.body.isRollResult) {
            fullMessage = `${contextMessage}\\n\\n**Previous Scene**: ${req.body.previousResponse || ''}\\n\\n**Roll Result**: ${req.body.message}\\n\\nContinue the narrative based on this roll result.`;
        } else {
            fullMessage = `${contextMessage}\\n\\n**Player Action**: ${req.body.message}`;
        }

        console.log('Calling Claude API...');

        // Call Claude API
        const response = await fetch(config.api_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.api_key,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: config.model,
                max_tokens: config.max_tokens,
                temperature: config.temperature,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: fullMessage
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Claude API error:', response.status, errorData);
            throw new Error(`Claude API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        const claudeResponse = data.content[0].text;

        console.log('Claude response received:', claudeResponse.substring(0, 100) + '...');
        console.log('Full response for debugging:', claudeResponse);

        // Check for roll requests by looking for the dice emoji and parsing the following lines
        const lines = claudeResponse.split('\\n');
        let rollRequestFound = false;
        let rollRequest = '';
        let cleanedResponse = claudeResponse;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Look for dice emoji
            if (line.includes('🎲')) {
                // Check for different roll patterns
                if (line.includes('ROLL NEEDED')) {
                    const match = line.match(/🎲 \*?\*?ROLL NEEDED\*?\*?: (.+)/i);
                    if (match) {
                        rollRequest = match[1];
                        rollRequestFound = true;
                        // Remove just the roll line, keeping the rest
                        const lines = claudeResponse.split('\n');
                        cleanedResponse = lines.filter(l => !l.includes('🎲') || !l.includes('ROLL NEEDED')).join('\n').trim();
                        break;
                    }
                } else if (line.includes('Roll Unknown') && i + 1 < lines.length) {
                    // Look at the next line for "to Roll..."
                    const nextLine = lines[i + 1].trim();
                    if (nextLine.startsWith('to Roll')) {
                        const match = nextLine.match(/to Roll (.+?) \\(DC (\\d+)\\) to (.+)/i);
                        if (match) {
                            rollRequest = `Roll ${match[1]} (DC ${match[2]}) to ${match[3]}`;
                        } else {
                            const simpleMatch = nextLine.match(/to Roll (.+) to (.+)/i);
                            if (simpleMatch) {
                                rollRequest = `Roll ${simpleMatch[1]} to ${simpleMatch[2]}`;
                            }
                        }
                        rollRequestFound = true;
                        // Remove only the roll lines, keep the narrative
                        const rollLines = line + '\\n' + nextLine;
                        cleanedResponse = claudeResponse
                            .replace(rollLines, '')
                            .replace(/\\n\\n+/g, '\\n\\n')
                            .trim();
                        break;
                    }
                } else {
                    // Simple roll pattern
                    const match = line.match(/🎲 Roll (.+)/i);
                    if (match) {
                        rollRequest = match[1];
                        rollRequestFound = true;
                        cleanedResponse = claudeResponse.replace(line, '').trim();
                        break;
                    }
                }
            }
        }

        if (rollRequestFound) {
            console.log('Roll request detected:', rollRequest);
            console.log('Cleaned narrative:', cleanedResponse);
            res.json({
                type: 'roll_request',
                narrative: cleanedResponse,
                rollRequest: rollRequest
            });
        } else {
            console.log('No roll request found, sending as narrative');
            res.json({
                type: 'narrative',
                narrative: claudeResponse
            });
        }

    } catch (error) {
        console.error('Error in Claude proxy:', error);
        res.status(500).json({
            error: 'Failed to get response from Claude',
            details: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🤖 Claude API Proxy running on port ${PORT}`);
    console.log(`🔗 Proxy endpoint: http://localhost:${PORT}/api/claude`);
});

module.exports = app;