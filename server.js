// D&D Campaign Manager - Standalone Node.js Server
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;
const ENHANCED_SERVER_URL = process.env.ENHANCED_SERVER_URL || 'http://localhost:3003';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Proxy enhanced server routes so production clients hit the live campaign brain
async function proxyEnhancedRequest(req, res, next, options = {}) {
  const {
    transformPath,
    allowFallback = false
  } = options;

  try {
    const transformedUrl = transformPath ? transformPath(req.originalUrl) : req.originalUrl;
    const targetUrl = `${ENHANCED_SERVER_URL}${transformedUrl}`;
    const method = req.method || 'GET';

    const headers = { ...req.headers };
    delete headers.host;

    let body;
    if (!['GET', 'HEAD'].includes(method)) {
      if (req.body && Object.keys(req.body).length > 0) {
        body = JSON.stringify(req.body);
        headers['content-type'] = 'application/json';
      } else if (req._readableState && !req._readableState.ended) {
        req.pause();
        body = await new Promise((resolve, reject) => {
          const chunks = [];
          req.on('data', chunk => chunks.push(chunk));
          req.on('end', () => resolve(Buffer.concat(chunks)));
          req.on('error', reject);
          req.resume();
        });
      }
    }

    console.log(`🔁 Proxying ${method} ${req.originalUrl} → ${targetUrl}`);
    const response = await fetch(targetUrl, { method, headers, body });

    if (!response.ok) {
      throw new Error(`Upstream responded ${response.status}`);
    }

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-length') {
        return;
      }
      res.setHeader(key, value);
    });

    const buffer = await response.buffer();
    res.send(buffer);
  } catch (error) {
    console.error(`❌ Enhanced server proxy error for ${req.originalUrl}:`, error.message);
    const shouldFallback = typeof allowFallback === 'function' ? allowFallback(req) : allowFallback;
    if (shouldFallback) {
      return next();
    }

    res.status(502).json({
      error: 'Enhanced server unavailable',
      details: error.message
    });
  }
}

app.use('/dnd-api/dnd', (req, res, next) =>
  proxyEnhancedRequest(req, res, next, {
    transformPath: (url) => url.replace(/^\/dnd-api\/dnd/, '/api/dnd')
  })
);

app.use('/api/dnd', (req, res, next) =>
  proxyEnhancedRequest(req, res, next, {
    allowFallback: (incoming) => incoming.method === 'POST' && incoming.path === '/action'
  })
);

// In-memory storage for campaign sessions
const campaignSessions = new Map();

// Claude DM demo responses
const demoResponses = [
  {
    pattern: /enter|step|go|walk|move/i,
    response: "As you step into the Whispering Woods, the ancient trees seem to part before you. Shafts of golden sunlight filter through the canopy, creating dancing patterns on the forest floor. You hear the soft rustling of leaves and the distant call of a mysterious bird. A winding path stretches ahead, marked by glowing mushrooms that pulse with a faint blue light.\n\nTo your left, you notice tracks in the soft earth - something large passed this way recently. To your right, a babbling brook winds between moss-covered stones.\n\nWhat would you like to do?"
  },
  {
    pattern: /attack|fight|sword|weapon/i,
    response: "You draw your weapon with a satisfying ring of steel! The blade gleams in the dappled forest light. However, you don't see any immediate threats in your vicinity. The forest around you is peaceful, though you sense you should remain alert.\n\nPerhaps you should explore further to find what needs confronting, or investigate those tracks you noticed earlier?\n\nWhat's your next move?"
  },
  {
    pattern: /investigate|look|search|examine/i,
    response: "You carefully examine your surroundings. The tracks you noticed appear to be from a large wolf - or perhaps something even bigger. The prints are fresh, maybe an hour old. Following them with your eyes, you see they lead deeper into the forest toward a cluster of particularly ancient-looking trees.\n\nAs you investigate further, you notice something glinting in the hollow of a nearby oak tree. It appears to be a small crystal pendant, pulsing with the same blue light as the mushrooms.\n\nDo you want to retrieve the pendant, follow the tracks, or do something else?"
  },
  {
    pattern: /cast|spell|magic/i,
    response: "You feel the magical energies around you respond to your will. The Whispering Woods are thick with ancient magic, and your spell seems amplified here.\n\nA gentle breeze swirls around you, carrying whispers in a language you don't quite understand, but somehow comprehend. The voices seem to be saying: 'Beware the guardian of the deep grove... the crystal calls to those pure of heart...'\n\nThe magical insight reveals that powerful enchantments protect this forest, both benevolent and dangerous.\n\nHow do you wish to proceed with this new knowledge?"
  },
  {
    pattern: /take|get|grab|retrieve|pick/i,
    response: "You reach out and carefully take the object. As your fingers close around it, you feel a warm tingling sensation run up your arm. The item seems to pulse with a gentle, magical energy.\n\nSuddenly, the forest around you seems more alive than before. You can hear the whispered conversations of the trees, sense the small creatures scurrying through the underbrush, and feel the ancient magic that flows through this place like a hidden river.\n\nWith this new awareness, you notice something you missed before...\n\nWhat do you do next?"
  },
  {
    pattern: /meditate|focus|calm|center|inner|within|settle|nerves|concentrate/i,
    response: "You close your eyes and turn your attention inward, focusing on your breathing and centering your mind. The sounds of the forest fade to a gentle background hum as you find your inner peace.\n\nAs you meditate, you feel a profound connection to the natural world around you. The ancient magic of the Whispering Woods seems to resonate with your calm spirit. In this state of heightened awareness, you sense that the forest itself approves of your thoughtful approach.\n\nWhen you open your eyes, you feel more focused and confident. The path ahead seems clearer, and you notice details you missed before - the way the light dances through the leaves, the subtle patterns in the moss, and a barely visible trail leading deeper into the woods.\n\nYour meditation has prepared you well for whatever challenges lie ahead. What do you choose to do next?"
  }
];

function getDemoResponse(playerAction) {
  // Find matching response
  for (const demo of demoResponses) {
    if (demo.pattern.test(playerAction)) {
      return demo.response;
    }
  }

  // Default response
  return "The ancient forest responds to your action. The trees seem to whisper among themselves, as if discussing what you've just done. A sense of anticipation fills the air - your adventure is just beginning, and the Whispering Woods have much to show you.\n\nThe path ahead splits into three directions: one leading toward darker, denser woods; another toward a clearing where you can see strange stone circles; and a third that seems to wind upward toward a hill crowned with a single, massive tree.\n\nWhich path calls to your adventurous spirit?";
}

// API Routes
app.post('/api/dnd/action', async (req, res) => {
  try {
    const { character, campaignState, action, sessionId } = req.body;

    console.log(`[${sessionId}] Player action: ${action}`);

    // Get or create session
    let session = campaignSessions.get(sessionId) || {
      messages: [],
      character: character,
      campaignState: campaignState || {},
      startTime: new Date().toISOString()
    };

    // Add player's action to conversation history
    session.messages.push({
      role: 'user',
      content: action
    });

    // Get DM response
    const dmResponse = getDemoResponse(action);

    // Add DM response to conversation history
    session.messages.push({
      role: 'assistant',
      content: dmResponse
    });

    // Update session
    session.character = character;
    session.campaignState = { ...session.campaignState, ...campaignState };
    session.lastActivity = new Date().toISOString();

    // Store session
    campaignSessions.set(sessionId, session);

    console.log(`[${sessionId}] DM response: ${dmResponse.substring(0, 100)}...`);

    res.json({
      message: dmResponse,
      updates: null,
      campaignState: session.campaignState
    });

  } catch (error) {
    console.error('Error processing action:', error);
    res.status(500).json({
      error: 'Failed to process action',
      message: 'The DM seems to be distracted by something. Please try again!'
    });
  }
});

// Claude API proxy endpoint (works for both /api/claude and /dnd-api/claude via Apache proxy)
app.post('/api/claude', async (req, res) => {
  try {
    const fetch = require('node-fetch');

    console.log('Proxying request to Claude API proxy server...');

    // Forward request to Claude proxy server
    const response = await fetch('http://localhost:3004/api/claude', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Claude proxy error');
    }

    res.json(data);

  } catch (error) {
    console.error('Error proxying to Claude:', error);
    res.status(500).json({
      error: 'Failed to connect to Claude API',
      details: error.message
    });
  }
});

// DM sync endpoint
app.post('/api/dnd/sync', async (req, res) => {
  try {
    const { sessionId, character } = req.body;

    console.log(`[${sessionId}] Sync request from ${character.name}`);

    // Get session
    let session = campaignSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'No active session found. Please start a new adventure!'
      });
    }

    // Update character in session
    session.character = character;
    session.lastActivity = new Date().toISOString();

    // Simulate DM updates (in a real implementation, this would come from actual DM input)
    const updates = {
      message: 'Session data synchronized successfully',
      updates: null,
      newQuests: [],
      inventoryUpdates: {}
    };

    // Occasionally add demo updates
    const random = Math.random();
    if (random < 0.3) {
      updates.newQuests.push({
        title: 'Emergency Communication',
        description: 'The communication array is down. Find a way to restore contact with Titan Station.'
      });
    }

    if (random < 0.2) {
      updates.inventoryUpdates = {
        dax: {
          items: ['Emergency Beacon']
        }
      };
    }

    // Store updated session
    campaignSessions.set(sessionId, session);

    console.log(`[${sessionId}] Sync completed for ${character.name}`);

    res.json(updates);

  } catch (error) {
    console.error('Error processing sync:', error);
    res.status(500).json({
      error: 'Sync failed',
      message: 'Unable to synchronize with the DM. The connection seems unstable.'
    });
  }
});

// Get campaign session info
app.get('/api/dnd/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = campaignSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    sessionId,
    character: session.character,
    campaignState: session.campaignState,
    messageCount: session.messages.length,
    startTime: session.startTime,
    lastActivity: session.lastActivity
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dnd', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    sessions: campaignSessions.size,
    uptime: process.uptime()
  });
});

// Session cleanup (remove old sessions)
setInterval(() => {
  const now = new Date();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  for (const [sessionId, session] of campaignSessions.entries()) {
    const lastActivity = new Date(session.lastActivity || session.startTime);
    if (now - lastActivity > maxAge) {
      campaignSessions.delete(sessionId);
      console.log(`Cleaned up old session: ${sessionId}`);
    }
  }
}, 60 * 60 * 1000); // Run every hour

// Start server
app.listen(PORT, () => {
  console.log(`🎲 Claude DM Server running on port ${PORT}`);
  console.log(`🌐 D&D Campaign Manager available at: http://localhost:${PORT}/`);
  console.log('⚠️  Note: Using demo responses. Set CLAUDE_API_KEY environment variable for full Claude integration.');
});

module.exports = app;
