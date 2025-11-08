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

# Initialize ChromaDB
chroma_client = chromadb.Client(Settings(
    persist_directory="/opt/vodbase/dnd-5e/rag-service/chroma_db",
    anonymized_telemetry=False
))

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

    def store_memory(self, actions: List[Dict[str, Any]], campaign: str = "test-silverpeak", session: int = 1) -> Dict[str, Any]:
        """
        Store a new memory in the vector database

        Args:
            actions: List of 4 conversation turns to summarize
            campaign: Campaign ID
            session: Session number

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
                "action_count": len(actions)
            }

            # Store in ChromaDB
            self.collection.add(
                ids=[memory_id],
                embeddings=[embedding],
                documents=[summary],
                metadatas=[metadata]
            )

            logger.info(f"Stored memory {memory_id}: {summary[:50]}...")

            return {
                "id": memory_id,
                "summary": summary,
                "entities": entities,
                "metadata": metadata
            }

        except Exception as e:
            logger.error(f"Error storing memory: {e}")
            raise

    def retrieve_memories(self, query: str, campaign: str = "test-silverpeak", n_results: int = 5) -> List[Dict[str, Any]]:
        """
        Retrieve relevant memories based on current action

        Args:
            query: Current player action or context
            campaign: Campaign ID
            n_results: Number of memories to retrieve

        Returns:
            List of relevant memories with metadata
        """
        try:
            # Generate embedding for query
            query_embedding = self.get_embedding(query)

            # Query ChromaDB
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                where={"campaign": campaign}
            )

            # Format results
            memories = []
            if results['ids'] and results['ids'][0]:
                for i in range(len(results['ids'][0])):
                    memory = {
                        "id": results['ids'][0][i],
                        "text": results['documents'][0][i],
                        "distance": results['distances'][0][i] if 'distances' in results else None,
                        "metadata": results['metadatas'][0][i] if 'metadatas' in results else {},
                        "entities": json.loads(results['metadatas'][0][i].get('entities', '[]'))
                    }
                    memories.append(memory)

            logger.info(f"Retrieved {len(memories)} memories for query: {query[:50]}...")
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
        "session": 1
    }
    """
    try:
        data = request.json
        actions = data.get('actions', [])
        campaign = data.get('campaign', 'test-silverpeak')
        session = data.get('session', 1)

        if not actions:
            return jsonify({"error": "No actions provided"}), 400

        # Store memory
        result = memory_service.store_memory(actions, campaign, session)

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
        "n_results": 5
    }
    """
    try:
        data = request.json
        query = data.get('query', '')
        campaign = data.get('campaign', 'test-silverpeak')
        n_results = data.get('n_results', 5)

        if not query:
            return jsonify({"error": "No query provided"}), 400

        # Retrieve memories
        memories = memory_service.retrieve_memories(query, campaign, n_results)

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

if __name__ == '__main__':
    # Run Flask app
    port = int(os.getenv('MEMORY_SERVICE_PORT', 5003))
    logger.info(f"Starting Silverpeak Memory Service on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
