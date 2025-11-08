# D&D Character Sheet API Integration for AI DM System

## Current Architecture Analysis

Your system has:
- **AI DM** (Claude/GPT/DeepSeek) generating narrative responses
- **Context Manager** building prompts from conversation history + campaign state
- **Campaign State** stored in JSON with basic character data (HP, inventory as strings, spells as string arrays)
- **State Extraction** parsing DM responses to update game state

## The Problem

**Current character data is too simple:**
```json
{
  "spells": ["Magic Missile", "Shield", "Detect Magic"],
  "inventory": ["plasma injector", "datapad"],
  "equipment": ["light armor", "sidearm"]
}
```

**Missing critical mechanical details:**
- Spell slot costs (is Magic Missile level 1? How many slots available?)
- Action economy (is Shield a reaction? Bonus action?)
- Damage formulas (Magic Missile = 1d4+1 per missile, scales with slot level)
- Components (V/S/M requirements)
- Equipment stats (AC value, weapon damage dice)

## Solution: Three-Layer Integration

### Layer 1: Reference Data API (dnd5eapi.co)
**Purpose**: Provide complete 5e SRD mechanical data to the DM AI

**What it provides:**
```json
{
  "name": "Magic Missile",
  "level": 1,
  "school": "Evocation",
  "casting_time": "1 action",
  "components": ["V", "S"],
  "duration": "Instantaneous",
  "damage": {
    "damage_at_slot_level": {
      "1": "1d4+1",
      "2": "2d4+2",
      "3": "3d4+3"
    }
  },
  "desc": ["You create three glowing darts..."]
}
```

### Layer 2: Enhanced Campaign State
**Purpose**: Store structured character data with mechanical details

**Before (current):**
```json
{
  "dax": {
    "name": "Dax Stargazer",
    "hp": {"current": 28, "max": 28},
    "spells": ["Magic Missile", "Shield"]
  }
}
```

**After (enhanced):**
```json
{
  "dax": {
    "name": "Dax Stargazer",
    "hp": {"current": 28, "max": 28},
    "class": "Tech Specialist",
    "level": 3,
    "spell_slots": {
      "1": {"max": 4, "used": 1},
      "2": {"max": 3, "used": 0}
    },
    "spells_prepared": [
      {
        "name": "Magic Missile",
        "level": 1,
        "school": "Evocation",
        "prepared": true,
        "api_data": {
          "casting_time": "1 action",
          "components": ["V", "S"],
          "damage": "1d4+1 per missile",
          "missiles": "3 base, +1 per slot level"
        }
      }
    ]
  }
}
```

### Layer 3: AI Tool Integration
**Purpose**: Allow AI DM to query spell/monster/item data on-demand

**How it works:**
1. Player announces action: "Dax casts Magic Missile"
2. AI DM calls tool: `get_spell_details("Magic Missile", cast_at_level=1)`
3. Tool returns complete mechanical data
4. AI DM generates accurate narrative response
5. State extraction updates spell slots automatically

## Integration with Your AI Provider Architecture

Your server already supports tool calling through the AI providers. Here's how character APIs fit:

```javascript
class ClaudeProvider extends BaseAIProvider {
    constructor() {
        super('claude', 'claude-sonnet-4-5-20250929');
        this.rulesService = new DnDRulesService();
    }

    async generateResponse(system, messages) {
        // Define tools for Claude
        const tools = [
            {
                "name": "get_spell_details",
                "description": "Get complete 5e SRD spell details",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "spell_name": {"type": "string"},
                        "cast_at_level": {"type": "integer", "minimum": 1, "maximum": 9}
                    },
                    "required": ["spell_name"]
                }
            }
        ];

        // Make API call with tools
        const response = await this.makeRequest(system, messages, tools);

        // Handle tool calls if present
        if (response.stop_reason === 'tool_use') {
            const toolResults = await this.handleToolCalls(response.content);
            // Continue conversation with tool results
        }
    }

    async handleToolCalls(content) {
        for (const block of content) {
            if (block.type === 'tool_use') {
                if (block.name === 'get_spell_details') {
                    return await this.rulesService.getSpellDetails(
                        block.input.spell_name,
                        block.input.cast_at_level
                    );
                }
            }
        }
    }
}
```

## Example Gameplay Flow

**Without API integration:**
```
Player: "Dax casts Magic Missile at the guard"

DM: "Dax casts Magic Missile. Three glowing darts strike the guard, 
dealing damage. The guard looks hurt."

[Problems: No spell slot tracking, vague damage, no mechanical accuracy]
```

**With API integration:**
```
Player: "Dax casts Magic Missile at the guard"

[AI calls: get_spell_details("Magic Missile", cast_at_level=1)]
[Returns: 1d4+1 per missile, 3 missiles, V/S components, 1 action]

DM: "Dax's fingers crackle with arcane energy. Three glowing darts 
materialize (V, S components) and streak toward the guard. 
[Rolls: 3, 5, 2] = 10 force damage total. 
The guard staggers back, armor scorched."

[State extraction auto-updates]:
- Dax spell slots: Level 1: 3/4 remaining
- Guard HP: 35 → 25
```

## Why This Works for AI DMs

Your **AI provider system** already:
1. ✅ Builds context from conversation history
2. ✅ Maintains campaign state
3. ✅ Generates narrative responses
4. ✅ Supports tool/function calling

Adding character sheet APIs means:
5. ✅ **Accurate game mechanics** without bloating prompts
6. ✅ **On-demand lookups** only when needed
7. ✅ **Automatic resource tracking** (spell slots, HP, conditions)

## Quick Start Implementation

I've created three artifacts for you:
1. **Integration Strategy** (this document) - How character APIs fit your AI DM architecture
2. **DnDRulesService.js** - Complete working code for spell/monster lookups
3. **Step-by-Step Guide** - Exact code changes to `complete-intelligent-server.js`

**Ready to implement?** The integration is surprisingly clean because your context manager architecture already handles the hard parts (conversation history, state management, AI orchestration). We're just adding a rules reference layer.
