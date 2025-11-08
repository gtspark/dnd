#!/usr/bin/env python3
"""
Test script for Silverpeak Memory Service
Run this after starting the service to verify it works
"""

import requests
import json
import time

BASE_URL = "http://localhost:5003"

def test_health():
    """Test health check endpoint"""
    print("\n1. Testing health check...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"   Status: {response.status_code}")
    print(f"   Response: {json.dumps(response.json(), indent=2)}")
    return response.status_code == 200

def test_store_memory():
    """Test storing a memory"""
    print("\n2. Testing memory storage...")
    test_actions = [
        {
            "role": "player",
            "content": "I approach the ancient temple entrance, cautiously looking for traps",
            "turn": 1
        },
        {
            "role": "assistant",
            "content": "The stone archway looms before you, covered in strange runes. You notice a pressure plate near the threshold.",
            "turn": 2
        },
        {
            "role": "player",
            "content": "I examine the runes more closely",
            "turn": 3
        },
        {
            "role": "assistant",
            "content": "The runes glow faintly as you study them. They appear to be a warning: 'Only the worthy may pass.' You also spot Elder Miriam's symbol etched into the cornerstone.",
            "turn": 4
        }
    ]

    payload = {
        "actions": test_actions,
        "campaign": "test-silverpeak",
        "session": 1
    }

    response = requests.post(
        f"{BASE_URL}/store-memory",
        json=payload,
        headers={"Content-Type": "application/json"}
    )

    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   Memory ID: {data['memory']['id']}")
        print(f"   Summary: {data['memory']['summary']}")
        print(f"   Entities: {data['memory']['entities']}")
        return True
    else:
        print(f"   Error: {response.text}")
        return False

def test_retrieve_memories():
    """Test retrieving memories"""
    print("\n3. Testing memory retrieval...")

    # Give ChromaDB a moment to index
    time.sleep(1)

    payload = {
        "query": "Tell me about the temple and the runes we saw",
        "campaign": "test-silverpeak",
        "n_results": 3
    }

    response = requests.post(
        f"{BASE_URL}/retrieve-memories",
        json=payload,
        headers={"Content-Type": "application/json"}
    )

    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   Retrieved {data['count']} memories:")
        for i, memory in enumerate(data['memories'], 1):
            print(f"\n   Memory {i} (ID: {memory['id']}):")
            print(f"      Text: {memory['text'][:100]}...")
            print(f"      Relevance Score: {1 - memory.get('distance', 0):.2f}")
            print(f"      Entities: {memory.get('entities', [])}")
        return True
    else:
        print(f"   Error: {response.text}")
        return False

def test_get_all_memories():
    """Test getting all memories"""
    print("\n4. Testing get all memories...")
    response = requests.get(f"{BASE_URL}/memories?campaign=test-silverpeak")

    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   Total memories in database: {data['count']}")
        return True
    else:
        print(f"   Error: {response.text}")
        return False

def main():
    """Run all tests"""
    print("=" * 60)
    print("Silverpeak Memory Service - Test Suite")
    print("=" * 60)

    try:
        # Run tests
        results = []
        results.append(("Health Check", test_health()))
        results.append(("Store Memory", test_store_memory()))
        results.append(("Retrieve Memories", test_retrieve_memories()))
        results.append(("Get All Memories", test_get_all_memories()))

        # Print summary
        print("\n" + "=" * 60)
        print("Test Results:")
        print("=" * 60)
        for test_name, passed in results:
            status = "✓ PASS" if passed else "✗ FAIL"
            print(f"{status:10} {test_name}")

        all_passed = all(result[1] for result in results)
        if all_passed:
            print("\n🎉 All tests passed! Memory service is working correctly.")
        else:
            print("\n❌ Some tests failed. Check the output above for details.")

        return all_passed

    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to memory service!")
        print("   Make sure the service is running:")
        print("   cd /opt/vodbase/dnd-5e/rag-service")
        print("   ./venv/bin/python memory_service.py")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
