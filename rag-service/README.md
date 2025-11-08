# Silverpeak Campaign Memory Service

RAG-based long-term memory system for the Silverpeak D&D campaign, inspired by AI Dungeon's memory architecture.

## Architecture

```
Player Action → Silverpeak Backend → Memory Service → ChromaDB
                      ↓                    ↓
                  Retrieve              Store
                  Memories              Memories
                      ↓                    ↓
                  Context +           Summarize
                  Claude API          & Embed
```

## Features

- **Auto-Summarization**: Every 4 conversation turns are summarized into a memory
- **Semantic Search**: Retrieves relevant memories based on current context using vector embeddings
- **Entity Extraction**: Automatically identifies NPCs, locations, items from memories
- **Persistent Storage**: ChromaDB stores embeddings and metadata locally

## Setup

### 1. Install Dependencies

```bash
cd /opt/vodbase/dnd-5e/rag-service
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### 2. Configure API Keys

Edit `.env` file and add your OpenAI API key:

```bash
OPENAI_API_KEY=sk-...your-key-here...
MEMORY_SERVICE_PORT=5003
```

### 3. Run the Service

**Development:**
```bash
./venv/bin/python memory_service.py
```

**Production (PM2):**
```bash
pm2 start memory_service.py --name silverpeak-memory --interpreter ./venv/bin/python
pm2 save
```

## API Endpoints

### Health Check
```bash
GET /health
```

Response:
```json
{
  "status": "healthy",
  "service": "Silverpeak Memory Service",
  "version": "1.0.0"
}
```

### Store Memory
```bash
POST /store-memory
Content-Type: application/json

{
  "actions": [
    {"role": "player", "content": "I examine the ancient rune", "turn": 1},
    {"role": "assistant", "content": "The rune glows softly...", "turn": 2},
    {"role": "player", "content": "I try to read it", "turn": 3},
    {"role": "assistant", "content": "It says 'Beware the shadow'", "turn": 4}
  ],
  "campaign": "test-silverpeak",
  "session": 1
}
```

Response:
```json
{
  "success": true,
  "memory": {
    "id": "mem_0001",
    "summary": "The party examined an ancient rune that glowed and revealed a warning about shadows.",
    "entities": ["rune", "shadow"],
    "metadata": {...}
  }
}
```

### Retrieve Memories
```bash
POST /retrieve-memories
Content-Type: application/json

{
  "query": "Tell me about the rune we saw earlier",
  "campaign": "test-silverpeak",
  "n_results": 5
}
```

Response:
```json
{
  "success": true,
  "memories": [
    {
      "id": "mem_0001",
      "text": "The party examined an ancient rune...",
      "distance": 0.23,
      "metadata": {...},
      "entities": ["rune", "shadow"]
    }
  ],
  "count": 1
}
```

### Get All Memories
```bash
GET /memories?campaign=test-silverpeak
```

### Clear Memories (Use with caution!)
```bash
POST /clear-memories
Content-Type: application/json

{
  "campaign": "test-silverpeak"
}
```

## Integration with Silverpeak Backend

The Node.js backend should:

1. **After every 4 conversation turns**, call `/store-memory` to create a new memory
2. **Before generating DM response**, call `/retrieve-memories` with current player action
3. **Include retrieved memories** in the context sent to Claude API

Example integration code for `complete-intelligent-server.js`:

```javascript
const MEMORY_SERVICE_URL = 'http://localhost:5003';

async function storeMemory(actions) {
  try {
    const response = await fetch(`${MEMORY_SERVICE_URL}/store-memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actions: actions,
        campaign: 'test-silverpeak',
        session: 1
      })
    });
    return await response.json();
  } catch (error) {
    console.error('Error storing memory:', error);
  }
}

async function retrieveMemories(query) {
  try {
    const response = await fetch(`${MEMORY_SERVICE_URL}/retrieve-memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query,
        campaign: 'test-silverpeak',
        n_results: 5
      })
    });
    const data = await response.json();
    return data.memories || [];
  } catch (error) {
    console.error('Error retrieving memories:', error);
    return [];
  }
}
```

## Data Storage

Memories are stored in ChromaDB at:
```
/opt/vodbase/dnd-5e/rag-service/chroma_db/
```

Each memory contains:
- **Text**: AI-generated summary of 4 actions
- **Embedding**: 1536-dimensional vector from OpenAI text-embedding-3-small
- **Metadata**: Campaign ID, session, turn range, entities, timestamp

## Costs

- **OpenAI text-embedding-3-small**: $0.02 per 1M tokens (~$0.0001 per memory)
- **GPT-4o-mini summarization**: $0.15 per 1M input tokens (~$0.0002 per memory)
- **Total**: ~$0.0003 per memory (incredibly cheap!)

For a 100-turn campaign:
- 25 memories created (every 4 turns)
- Cost: ~$0.0075 (less than a penny)

## Monitoring

Check service logs:
```bash
pm2 logs silverpeak-memory
```

Check memory count:
```bash
curl http://localhost:5003/memories?campaign=test-silverpeak | jq '.count'
```

## Troubleshooting

**Service won't start:**
- Check `.env` file has valid OPENAI_API_KEY
- Ensure port 5003 is available: `lsof -i :5003`
- Check logs: `pm2 logs silverpeak-memory`

**No memories retrieved:**
- Check if memories were stored: `GET /memories`
- Ensure campaign ID matches
- Try increasing `n_results`

**Slow responses:**
- OpenAI embedding API can take 100-500ms
- Consider caching frequently queried memories
- Check network connectivity to OpenAI

## Future Enhancements

- [ ] Add NER (Named Entity Recognition) for better entity extraction
- [ ] Implement memory importance scoring
- [ ] Add memory deduplication
- [ ] Support multiple campaigns simultaneously
- [ ] Add memory visualization UI
- [ ] Implement memory editing/deletion via API
- [ ] Add analytics dashboard for memory usage
