# Silverpeak Memory Service - Setup Guide

## What This Does

The Memory Service adds **long-term memory** to the Silverpeak campaign using a RAG (Retrieval Augmented Generation) system. It prevents data loss like the "missing fourth party member" issue from Dax's campaign.

### Benefits:
- ✅ **Never Forget**: NPCs, quests, and plot points stored permanently
- ✅ **Semantic Search**: AI retrieves relevant memories automatically
- ✅ **Cheap**: ~$0.0003 per memory (pennies for entire campaign)
- ✅ **Separate from Dax**: Only affects Silverpeak, Dax untouched

## Prerequisites

- ✅ Python 3 installed (already have it)
- ✅ Virtual environment created (already done)
- ✅ Dependencies installed (already done)
- ❌ **OpenAI API key required** (you need to add this)

## Step 1: Add Your OpenAI API Key

Edit the `.env` file:

```bash
nano /opt/vodbase/dnd-5e/rag-service/.env
```

Add your OpenAI API key:

```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
MEMORY_SERVICE_PORT=5003
```

**Where to get an API key:**
1. Go to https://platform.openai.com/api-keys
2. Create a new key
3. Copy and paste it into the `.env` file

**Cost estimate:**
- Text embeddings: $0.02 per 1M tokens
- GPT-4o-mini summaries: $0.15 per 1M tokens
- **Total per memory**: ~$0.0003
- **100-turn campaign**: ~$0.0075 (less than a penny!)

## Step 2: Start the Memory Service

### Option A: Manual Start (for testing)

```bash
cd /opt/vodbase/dnd-5e/rag-service
./venv/bin/python memory_service.py
```

Leave this terminal open. The service will run on port 5003.

### Option B: PM2 Start (recommended for production)

```bash
cd /opt/vodbase/dnd-5e/rag-service
pm2 start ecosystem.config.js
pm2 save
```

Check status:
```bash
pm2 list
pm2 logs silverpeak-memory
```

## Step 3: Test the Service

Run the test script:

```bash
cd /opt/vodbase/dnd-5e/rag-service
./venv/bin/python test_service.py
```

You should see:
```
✓ PASS     Health Check
✓ PASS     Store Memory
✓ PASS     Retrieve Memories
✓ PASS     Get All Memories

🎉 All tests passed! Memory service is working correctly.
```

If tests fail:
- Check `.env` has valid OpenAI API key
- Ensure port 5003 is available: `lsof -i :5003`
- Check logs: `pm2 logs silverpeak-memory`

## Step 4: Integrate with Silverpeak Backend

Edit `/opt/vodbase/dnd-5e/complete-intelligent-server.js`:

### Add Memory Client at Top:

```javascript
const MemoryClient = require('./MemoryClient');
```

### In the Campaign Manager Class Constructor:

```javascript
class CampaignManager {
    constructor(campaignId) {
        this.campaignId = campaignId;
        // ... existing code ...

        // Initialize memory client
        this.memoryClient = new MemoryClient('http://localhost:5003', campaignId);
        this.memoryClient.checkHealth();  // Check on startup
    }
```

### After DM Generates Response:

```javascript
// After getting DM response from Claude
const dmResponse = await aiProvider.generateResponse(systemPrompt, messages);

// Store action in memory (will auto-save every 4 turns)
await this.memoryClient.addAction('player', playerAction);
await this.memoryClient.addAction('assistant', dmResponse);
```

### Before Generating Response:

```javascript
// Retrieve relevant memories
const memories = await this.memoryClient.retrieveMemories(playerAction, 5);
const memoryContext = this.memoryClient.formatMemoriesForContext(memories);

// Add to system prompt
const enhancedSystemPrompt = systemPrompt + memoryContext;

// Now call Claude with enhanced context
const dmResponse = await aiProvider.generateResponse(enhancedSystemPrompt, messages);
```

## Step 5: Restart Silverpeak Backend

```bash
pm2 restart dnd-5e
```

## How It Works

### Memory Storage (Every 4 Turns):

1. Player: "I examine the ancient rune"
2. DM: "The rune glows softly..."
3. Player: "I try to read it"
4. DM: "It says 'Beware the shadow'"

   → **Auto-stored as**: "The party examined an ancient rune that glowed and revealed a warning about shadows."

### Memory Retrieval (Before Each Response):

- Player says: "Tell me about the rune we saw earlier"
- Service searches memories using semantic similarity
- Top 5 relevant memories added to Claude's context
- Claude generates response with full knowledge of past events

## Monitoring

### Check Service Status:
```bash
pm2 status silverpeak-memory
```

### View Logs:
```bash
pm2 logs silverpeak-memory
```

### Check Memory Count:
```bash
curl http://localhost:5003/memories?campaign=test-silverpeak | jq '.count'
```

### View All Memories:
```bash
curl http://localhost:5003/memories?campaign=test-silverpeak | jq '.memories[] | {id, text}'
```

## Troubleshooting

### Service won't start:
```bash
# Check port availability
lsof -i :5003

# Check logs
pm2 logs silverpeak-memory --lines 50

# Try manual start to see errors
cd /opt/vodbase/dnd-5e/rag-service
./venv/bin/python memory_service.py
```

### OpenAI API errors:
- Check API key is valid
- Check account has credits: https://platform.openai.com/account/usage
- Try manual test: `./venv/bin/python test_service.py`

### No memories retrieved:
- Check if any memories stored: `curl http://localhost:5003/memories?campaign=test-silverpeak`
- Ensure you've played at least 4 turns (first memory created after 4 turns)
- Check campaign ID matches in both Node backend and memory service

### Memory service slow:
- OpenAI embedding API typically takes 100-500ms
- This is normal and happens in background
- Doesn't block the main game response

## Maintenance

### Backup Memories:
```bash
# Export all memories
curl http://localhost:5003/memories?campaign=test-silverpeak > silverpeak-memories-backup-$(date +%Y%m%d).json
```

### Clear Memories (if needed):
```bash
curl -X POST http://localhost:5003/clear-memories \
  -H "Content-Type: application/json" \
  -d '{"campaign":"test-silverpeak"}'
```

### Update Service:
```bash
cd /opt/vodbase/dnd-5e/rag-service
git pull  # if using version control
pm2 restart silverpeak-memory
```

## Data Storage Location

Memories stored in:
```
/opt/vodbase/dnd-5e/rag-service/chroma_db/
```

This directory contains ChromaDB's persistent storage. **Do NOT delete** unless you want to lose all memories!

## Differences from Dax Campaign

- ✅ **Dax campaign**: Completely untouched, no changes
- ✅ **Silverpeak campaign**: Memory service active, prevents data loss
- ✅ **Independent**: Each campaign has separate memory storage
- ✅ **Opt-in**: Memory service can be disabled without affecting Silverpeak

## Next Steps

1. **Add API key** to `.env` file
2. **Start service** with PM2
3. **Run tests** to verify
4. **Integrate** with Node backend
5. **Restart** dnd-5e server
6. **Play** and watch memories being created!

Check logs regularly for the first few sessions to ensure everything works smoothly:
```bash
pm2 logs silverpeak-memory --lines 100
```

## Future Enhancements

Once this is working, possible improvements:
- [ ] Memory importance scoring (prioritize critical events)
- [ ] NPC relationship tracking
- [ ] Quest completion tracking
- [ ] Location memory mapping
- [ ] Memory visualization UI
- [ ] Svelte frontend for memory browser

---

**Questions?** Check the README.md in the `rag-service` directory for API documentation and troubleshooting.
