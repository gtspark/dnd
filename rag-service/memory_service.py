"""
Silverpeak Campaign Memory Service
RAG-based memory system inspired by AI Dungeon's architecture
"""

import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from flask import Flask, request, jsonify
import chromadb
from chromadb.config import Settings
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Initialize OpenAI client
openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# Initialize ChromaDB with persistent storage
# ChromaDB 0.4.x uses PersistentClient for disk-backed storage
chroma_client = chromadb.PersistentClient(
    path="/opt/dnd/rag-service/chroma_db",
    settings=Settings(anonymized_telemetry=False)
)

# Get or create collection for Silverpeak campaign
collection = chroma_client.get_or_create_collection(
    name="silverpeak_memories",
    metadata={"description": "Memory bank for Silverpeak D&D campaign"}
)

class MemoryService:
    """Handles memory storage and retrieval for campaign"""

    def __init__(self):
        self.collection = collection
        self.openai_client = openai_client
        self.memory_counter = self._get_next_memory_id()

    def _get_next_memory_id(self) -> int:
        """Get next available memory ID"""
        try:
            # Get all existing memories and find highest ID
            results = self.collection.get()
            if not results['ids']:
                return 1

            # Extract numeric IDs
            ids = [int(id.split('_')[-1]) for id in results['ids'] if id.startswith('mem_')]
            return max(ids) + 1 if ids else 1
        except Exception as e:
            logger.error(f"Error getting next memory ID: {e}")
            return 1

    def summarize_actions(self, actions: List[Dict[str, Any]]) -> str:
        """
        Summarize a set of actions into a memory using OpenAI

        Args:
            actions: List of conversation turns with 'role' and 'content'

        Returns:
            Summarized memory text
        """
        try:
            # Build context from actions
            action_text = "\n\n".join([
                f"{'Player' if a['role'] == 'player' else 'DM'}: {a['content']}"
                for a in actions
            ])

            # Call OpenAI to summarize
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": """You are a D&D campaign historian. Summarize the following game actions into a concise memory (2-3 sentences max) that captures:
- Key events and decisions
- Important NPCs mentioned
- Locations visited
- Items gained/lost
- Quest progress

Focus on information that would be important to remember later. Be specific about names and details."""
                    },
                    {
                        "role": "user",
                        "content": f"Summarize these D&D campaign actions:\n\n{action_text}"
                    }
                ],
                temperature=0.3,
                max_tokens=150
            )

            summary = response.choices[0].message.content.strip()
            logger.info(f"Generated summary: {summary}")
            return summary

        except Exception as e:
            logger.error(f"Error summarizing actions: {e}")
            # Fallback to simple concatenation
            return f"Actions {actions[0].get('turn', '?')} - {actions[-1].get('turn', '?')}: " + " ".join([a['content'][:50] for a in actions])

    def extract_entities(self, text: str) -> List[str]:
        """
        Extract entity names from text (proper nouns only)

        Args:
            text: Text to extract entities from

        Returns:
            List of entity names (character names, locations, items)
        """
        import re

        # Common stopwords to exclude (sentence starters and common words)
        stopwords = {
            'The', 'A', 'An', 'In', 'On', 'At', 'To', 'For', 'Of', 'With', 'By',
            'Upon', 'After', 'Before', 'During', 'While', 'When', 'Where', 'Who',
            'What', 'Which', 'How', 'Why', 'As', 'From', 'Into', 'Through', 'Over',
            'Under', 'Between', 'Among', 'Only', 'All', 'Each', 'Every', 'Both',
            'Several', 'Many', 'Few', 'Some', 'Any', 'No', 'None', 'Most', 'More',
            'Less', 'Other', 'Another', 'Such', 'Same', 'Different', 'Similar',
            'Notably', 'However', 'Therefore', 'Thus', 'Hence', 'Meanwhile',
            'Furthermore', 'Moreover', 'Nevertheless', 'Otherwise', 'Caution',
            'Warning', 'Danger', 'Safety', 'Certainly'
        }

        # Find capitalized words/phrases (potential proper nouns)
        entities = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text)

        # Filter out stopwords and keep only meaningful entities
        filtered_entities = [e for e in entities if e not in stopwords]

        # Remove duplicates and limit to 10 most relevant
        return list(dict.fromkeys(filtered_entities))[:10]

    def get_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for text using OpenAI

        Args:
            text: Text to embed

        Returns:
            Embedding vector
        """
        try:
            response = self.openai_client.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise

    def store_memory(self, actions: List[Dict[str, Any]], campaign: str = "test-silverpeak", session: int = 1, scene_id: int = None, memory_type: str = "episode") -> Dict[str, Any]:
        """
        Store a new memory in the vector database

        Args:
            actions: List of 4 conversation turns to summarize
            campaign: Campaign ID
            session: Session number
            scene_id: Current scene ID for temporal filtering (anti-timewarp)
            memory_type: "episode" (time-bound events) or "world" (timeless facts)

        Returns:
            Created memory metadata
        """
        try:
            # Summarize the actions
            summary = self.summarize_actions(actions)

            # Extract entities
            entities = self.extract_entities(summary)

            # Generate embedding
            embedding = self.get_embedding(summary)

            # Create memory ID
            memory_id = f"mem_{self.memory_counter:04d}"
            self.memory_counter += 1

            # Prepare metadata
            metadata = {
                "campaign": campaign,
                "session": session,
                "turn_range": f"{actions[0].get('turn', 0)}-{actions[-1].get('turn', 0)}",
                "entities": json.dumps(entities),
                "timestamp": datetime.utcnow().isoformat(),
                "action_count": len(actions),
                "scene_id": scene_id if scene_id is not None else -1,
                "memory_type": memory_type  # "episode" or "world"
            }

            # Store in ChromaDB
            self.collection.add(
                ids=[memory_id],
                embeddings=[embedding],
                documents=[summary],
                metadatas=[metadata]
            )

            logger.info(f"Stored memory {memory_id} (scene={scene_id}, type={memory_type}): {summary[:50]}...")

            return {
                "id": memory_id,
                "summary": summary,
                "entities": entities,
                "metadata": metadata
            }

        except Exception as e:
            logger.error(f"Error storing memory: {e}")
            raise

    def retrieve_memories(self, query: str, campaign: str = "test-silverpeak", n_results: int = 5, current_scene_id: int = None, exclude_recent_scenes: int = 5, max_episode_age: int = 20) -> List[Dict[str, Any]]:
        """
        Retrieve relevant memories based on current action

        Args:
            query: Current player action or context
            campaign: Campaign ID
            n_results: Number of memories to retrieve
            current_scene_id: Current scene ID to filter old episode memories
            exclude_recent_scenes: Don't retrieve episode memories from last N scenes (they're in context)
            max_episode_age: Maximum scene age for episode memories (older requires explicit callback intent)

        Returns:
            List of relevant memories with metadata
        """
        try:
            # Generate embedding for query
            query_embedding = self.get_embedding(query)

            # Build where clause - always filter by campaign
            where_clause = {"campaign": campaign}
            
            # Query ChromaDB - get more results than needed so we can filter and re-rank
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results * 5,  # Get extra for filtering + re-ranking
                where=where_clause
            )

            # Format, filter, and prepare for re-ranking
            candidates = []
            if results['ids'] and results['ids'][0]:
                for i in range(len(results['ids'][0])):
                    metadata = results['metadatas'][0][i] if 'metadatas' in results else {}
                    memory_scene_id = metadata.get('scene_id', -1)
                    memory_type = metadata.get('memory_type', 'episode')
                    semantic_distance = results['distances'][0][i] if 'distances' in results else 0.5
                    
                    # ANTI-TIMEWARP FILTERING:
                    # - Always include "world" type memories (timeless facts)
                    # - For "episode" memories, apply bounded window filtering
                    if current_scene_id is not None and memory_type == 'episode' and memory_scene_id >= 0:
                        scene_distance = current_scene_id - memory_scene_id
                        
                        # Skip too-recent (already in context window)
                        if scene_distance < exclude_recent_scenes:
                            logger.debug(f"Skipping recent episode memory from scene {memory_scene_id} (current={current_scene_id})")
                            continue
                        
                        # Skip too-old episode memories (beyond bounded window)
                        # These would require explicit "flashback/recall" intent to retrieve
                        if scene_distance > max_episode_age:
                            logger.debug(f"Skipping old episode memory from scene {memory_scene_id} (age={scene_distance} > max={max_episode_age})")
                            continue
                    
                    # Calculate re-ranked score:
                    # - Lower distance = better semantic match
                    # - Add recency bonus for episode memories
                    base_score = 1.0 - semantic_distance  # Convert distance to similarity
                    recency_bonus = 0.0
                    
                    if memory_type == 'episode' and current_scene_id is not None and memory_scene_id >= 0:
                        scene_distance = current_scene_id - memory_scene_id
                        # Recency bonus: 0.2 for adjacent scenes, tapering to 0 at max_episode_age
                        recency_bonus = max(0, 0.2 * (1 - scene_distance / max_episode_age))
                    
                    final_score = base_score + recency_bonus
                    
                    candidates.append({
                        "id": results['ids'][0][i],
                        "text": results['documents'][0][i],
                        "distance": semantic_distance,
                        "score": final_score,
                        "metadata": metadata,
                        "entities": json.loads(metadata.get('entities', '[]')),
                        "scene_id": memory_scene_id,
                        "memory_type": memory_type
                    })
            
            # Re-rank by combined score and take top n_results
            candidates.sort(key=lambda x: x['score'], reverse=True)
            memories = candidates[:n_results]

            logger.info(f"Retrieved {len(memories)} memories for query (scene={current_scene_id}, filtered from {len(candidates)} candidates): {query[:50]}...")
            return memories

        except Exception as e:
            logger.error(f"Error retrieving memories: {e}")
            raise

    def get_all_memories(self, campaign: str = "test-silverpeak") -> List[Dict[str, Any]]:
        """Get all memories for a campaign"""
        try:
            results = self.collection.get(
                where={"campaign": campaign}
            )

            memories = []
            if results['ids']:
                for i in range(len(results['ids'])):
                    memory = {
                        "id": results['ids'][i],
                        "text": results['documents'][i],
                        "metadata": results['metadatas'][i],
                        "entities": json.loads(results['metadatas'][i].get('entities', '[]'))
                    }
                    memories.append(memory)

            return memories
        except Exception as e:
            logger.error(f"Error getting all memories: {e}")
            raise

# Initialize service
memory_service = MemoryService()

# ===== API ENDPOINTS =====

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "Silverpeak Memory Service",
        "version": "1.0.0"
    })

@app.route('/store-memory', methods=['POST'])
def store_memory():
    """
    Store a new memory from recent actions

    Expected JSON body:
    {
        "actions": [
            {"role": "player", "content": "...", "turn": 1},
            {"role": "assistant", "content": "...", "turn": 2},
            ...
        ],
        "campaign": "test-silverpeak",
        "session": 1,
        "scene_id": 47,  // Current scene for anti-timewarp filtering
        "memory_type": "episode"  // "episode" (time-bound) or "world" (timeless facts)
    }
    """
    try:
        data = request.json
        actions = data.get('actions', [])
        campaign = data.get('campaign', 'test-silverpeak')
        session = data.get('session', 1)
        scene_id = data.get('scene_id', None)
        memory_type = data.get('memory_type', 'episode')

        if not actions:
            return jsonify({"error": "No actions provided"}), 400

        # Store memory
        result = memory_service.store_memory(actions, campaign, session, scene_id, memory_type)

        return jsonify({
            "success": True,
            "memory": result
        })

    except Exception as e:
        logger.error(f"Error in store_memory endpoint: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/retrieve-memories', methods=['POST'])
def retrieve_memories():
    """
    Retrieve relevant memories for current context

    Expected JSON body:
    {
        "query": "current player action or context",
        "campaign": "test-silverpeak",
        "n_results": 5,
        "current_scene_id": 47,  // Filter out recent episode memories
        "exclude_recent_scenes": 5  // How many recent scenes to exclude
    }
    """
    try:
        data = request.json
        query = data.get('query', '')
        campaign = data.get('campaign', 'test-silverpeak')
        n_results = data.get('n_results', 5)
        current_scene_id = data.get('current_scene_id', None)
        exclude_recent_scenes = data.get('exclude_recent_scenes', 5)

        if not query:
            return jsonify({"error": "No query provided"}), 400

        # Retrieve memories with scene filtering
        memories = memory_service.retrieve_memories(query, campaign, n_results, current_scene_id, exclude_recent_scenes)

        return jsonify({
            "success": True,
            "memories": memories,
            "count": len(memories)
        })

    except Exception as e:
        logger.error(f"Error in retrieve_memories endpoint: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/memories', methods=['GET'])
def get_memories():
    """Get all memories for a campaign"""
    try:
        campaign = request.args.get('campaign', 'test-silverpeak')
        memories = memory_service.get_all_memories(campaign)

        return jsonify({
            "success": True,
            "memories": memories,
            "count": len(memories)
        })

    except Exception as e:
        logger.error(f"Error in get_memories endpoint: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/clear-memories', methods=['POST'])
def clear_memories():
    """Clear all memories for a campaign (use with caution!)"""
    try:
        data = request.json
        campaign = data.get('campaign', 'test-silverpeak')

        # Get all memory IDs for campaign
        results = collection.get(where={"campaign": campaign})
        if results['ids']:
            collection.delete(ids=results['ids'])
            logger.warning(f"Cleared {len(results['ids'])} memories for campaign {campaign}")

        return jsonify({
            "success": True,
            "deleted_count": len(results['ids']) if results['ids'] else 0
        })

    except Exception as e:
        logger.error(f"Error in clear_memories endpoint: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/store-world-fact', methods=['POST'])
def store_world_fact():
    """
    Store a timeless world fact (NPC bio, faction info, location details, etc.)
    These are NOT filtered by scene_id and are always retrieved.

    Expected JSON body:
    {
        "fact_type": "npc_bio" | "faction" | "location" | "item" | "lore",
        "subject": "Name/identifier of the subject",
        "content": "The actual fact content",
        "campaign": "campaign-id",
        "tags": ["optional", "tags", "for", "filtering"]
    }
    """
    try:
        data = request.json
        fact_type = data.get('fact_type', 'lore')
        subject = data.get('subject', 'Unknown')
        content = data.get('content', '')
        campaign = data.get('campaign', 'test-silverpeak')
        tags = data.get('tags', [])

        if not content:
            return jsonify({"error": "No content provided"}), 400

        # Format the fact for storage
        formatted_content = f"[{fact_type.upper()}] {subject}: {content}"
        
        # Generate embedding
        embedding = memory_service.get_embedding(formatted_content)
        
        # Create memory ID with 'fact_' prefix for world facts
        memory_id = f"fact_{memory_service.memory_counter:04d}"
        memory_service.memory_counter += 1

        # Prepare metadata - world facts have scene_id=-1 to bypass temporal filtering
        metadata = {
            "campaign": campaign,
            "session": 0,  # System/world data
            "turn_range": "permanent",
            "entities": json.dumps([subject] + tags),
            "timestamp": datetime.utcnow().isoformat(),
            "action_count": 1,
            "scene_id": -1,  # -1 = timeless, never filtered out
            "memory_type": "world",  # "world" type bypasses bounded window filtering
            "fact_type": fact_type,
            "subject": subject
        }

        # Store in ChromaDB
        collection.add(
            ids=[memory_id],
            embeddings=[embedding],
            documents=[formatted_content],
            metadatas=[metadata]
        )

        logger.info(f"Stored world fact {memory_id} ({fact_type}): {subject}")

        return jsonify({
            "success": True,
            "fact": {
                "id": memory_id,
                "type": fact_type,
                "subject": subject,
                "content": formatted_content,
                "metadata": metadata
            }
        })

    except Exception as e:
        logger.error(f"Error in store_world_fact endpoint: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/world-facts', methods=['GET'])
def get_world_facts():
    """Get all world facts for a campaign"""
    try:
        campaign = request.args.get('campaign', 'test-silverpeak')
        fact_type = request.args.get('type', None)  # Optional filter by fact_type
        
        # Build where clause
        where_clause = {
            "$and": [
                {"campaign": campaign},
                {"memory_type": "world"}
            ]
        }
        
        if fact_type:
            where_clause["$and"].append({"fact_type": fact_type})
        
        results = collection.get(where=where_clause)

        facts = []
        if results['ids']:
            for i in range(len(results['ids'])):
                fact = {
                    "id": results['ids'][i],
                    "content": results['documents'][i],
                    "metadata": results['metadatas'][i],
                    "type": results['metadatas'][i].get('fact_type', 'lore'),
                    "subject": results['metadatas'][i].get('subject', 'Unknown')
                }
                facts.append(fact)

        return jsonify({
            "success": True,
            "facts": facts,
            "count": len(facts)
        })

    except Exception as e:
        logger.error(f"Error in get_world_facts endpoint: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run Flask app
    port = int(os.getenv('MEMORY_SERVICE_PORT', 5003))
    logger.info(f"Starting Silverpeak Memory Service on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
