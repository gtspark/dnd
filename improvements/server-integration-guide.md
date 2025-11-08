# Server Integration Guide: Adding Character Sheet APIs

## Step 1: Install the DnDRulesService

**Create file:** `services/DnDRulesService.js`
(Use the code from DnDRulesService.js artifact)

**Install dependencies:**
```bash
npm install node-fetch
```

**Install in your server:**
```javascript
// At the top of complete-intelligent-server.js
const DnDRulesService = require('./services/DnDRulesService');

// Create global instance
const rulesService = new DnDRulesService();

// Preload common spells on server start
rulesService.preloadCommonSpells();
```

## Step 2: Add Tool Definitions to Claude Provider

**Modify the ClaudeProvider class in complete-intelligent-server.js:**

```javascript
class ClaudeProvider extends BaseAIProvider {
    constructor() {
        super('claude', 'claude-sonnet-4-5-20250929');
        this.rulesService = new DnDRulesService(); // Add this
    }

    async generateResponse(system, messages) {
        const apiKey = this.getApiKey();

        // Define tools for Claude
        const tools = [
            {
                "name": "get_spell_details",
                "description": "Get complete 5e SRD spell details including damage dice, components, casting time, duration, concentration, and scaling. Use this BEFORE describing spell effects in your narrative.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "spell_name": {
                            "type": "string",
                            "description": "The name of the spell (e.g., 'Magic Missile', 'Fireball')"
                        },
                        "cast_at_level": {
                            "type": "integer",
                            "description": "Optional: spell slot level used (for upcast effects)",
                            "minimum": 1,
                            "maximum": 9
                        }
                    },
                    "required": ["spell_name"]
                }
            },
            {
                "name": "get_monster_stats",
                "description": "Get complete monster stat block including HP, AC, abilities, attacks, and special traits. Use when introducing enemies to combat.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "monster_name": {
                            "type": "string",
                            "description": "The name of the monster (e.g., 'Goblin', 'Adult Red Dragon')"
                        }
                    },
                    "required": ["monster_name"]
                }
            },
            {
                "name": "get_item_details",
                "description": "Get equipment/item details including damage dice, armor class, weight, and properties.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "item_name": {
                            "type": "string",
                            "description": "The name of the item (e.g., 'Longsword', 'Plate Armor')"
                        }
                    },
                    "required": ["item_name"]
                }
            }
        ];

        // Make API request with tools
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: this.maxTokens,
                system: system,
                messages: messages,
                tools: tools  // Include tools
            })
        });

        const data = await response.json();

        // Handle tool use
        if (data.stop_reason === 'tool_use') {
            return await this.handleToolCalls(data, system, messages);
        }

        return data.content[0].text;
    }

    async handleToolCalls(initialResponse, system, messages) {
        // Extract tool calls from response
        const toolCalls = initialResponse.content.filter(block => block.type === 'tool_use');
        
        // Execute each tool call
        const toolResults = [];
        for (const toolCall of toolCalls) {
            let result;
            
            switch (toolCall.name) {
                case 'get_spell_details':
                    result = await this.rulesService.getSpellDetails(
                        toolCall.input.spell_name,
                        toolCall.input.cast_at_level
                    );
                    break;
                    
                case 'get_monster_stats':
                    result = await this.rulesService.getMonsterStats(
                        toolCall.input.monster_name
                    );
                    break;
                    
                case 'get_item_details':
                    result = await this.rulesService.getItemDetails(
                        toolCall.input.item_name
                    );
                    break;
                    
                default:
                    result = { error: 'Unknown tool' };
            }
            
            toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: JSON.stringify(result)
            });
        }

        // Continue conversation with tool results
        const apiKey = this.getApiKey();
        const followUpMessages = [
            ...messages,
            {
                role: 'assistant',
                content: initialResponse.content
            },
            {
                role: 'user',
                content: toolResults
            }
        ];

        const followUpResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: this.maxTokens,
                system: system,
                messages: followUpMessages
            })
        });

        const data = await followUpResponse.json();
        return data.content[0].text;
    }

    getSystemPromptWithTools() {
        return `${this.baseSystemPrompt}

## ACCURATE MECHANICS WITH TOOLS

**You have access to D&D 5e SRD data through tools. USE THEM.**

### When to Use Tools:
- **ALWAYS** for spells (damage, effects, components)
- **ALWAYS** for monsters (stats, abilities, CR)
- **ALWAYS** for equipment (damage dice, AC, properties)

### Spell Casting Flow:
1. Player announces spell
2. YOU call \`get_spell_details\` (invisibly to player)
3. You receive: level, damage dice, components, casting time, duration, concentration
4. You narrate using ACCURATE data from tool

### Example - Magic Missile:
\`\`\`
Player: "Dax casts Magic Missile at the guard"

[You call: get_spell_details("Magic Missile")]
[Tool returns: level 1, 1d4+1 per missile, 3 missiles, V/S components]

You narrate: "Dax's fingers crackle with arcane energy. Three glowing darts 
materialize and streak toward the guard - the first strikes his chest (4 force 
damage), the second his shoulder (3 damage), the third his leg (2 damage). 
Total: 9 force damage."
\`\`\`

**CRITICAL**: ALWAYS use tools for spells, monsters, and equipment. Never guess mechanics.`;
    }
}
```

## Step 3: Update DM System Prompt

**Add to your DM prompt file (e.g., dax-dm-prompt.md):**

```markdown
## ACCURATE MECHANICS WITH TOOLS

**You have access to D&D 5e SRD data through tools. USE THEM.**

### When to Use Tools:
- **ALWAYS** for spells (damage, effects, components)
- **ALWAYS** for monsters (stats, abilities, CR)
- **ALWAYS** for equipment (damage dice, AC, properties)
- When in doubt about any 5e mechanic

### What Tools Provide:
- **Spells**: Exact damage dice, scaling, components (V/S/M), casting time, duration, concentration, area of effect
- **Monsters**: HP, AC, attack bonuses, damage dice, special abilities, challenge rating
- **Items**: Weapon damage, armor AC, weight, cost, magical properties

### Integration with Narrative:
Tools give you raw data - you transform it into engaging story:

**BAD** (robotic): "Magic Missile deals 1d4+1 force damage per missile."

**GOOD** (dramatic): "Three azure darts streak toward the target, each striking with unerring accuracy. The first hits with a crack of energy (rolled 3 damage), the second follows instantly (rolled 5 damage), the third finishes the barrage (rolled 2 damage)."
```

## Step 4: Enhanced Campaign State Schema

**Update campaign-state.json structure:**

```json
{
  "current_time": "0545 hours",
  "current_location": "Titan Station - Medical Bay",
  
  "party": {
    "dax": {
      "name": "Dax Stargazer",
      "species": "Vexian",
      "class": "Tech Specialist",
      "level": 3,
      
      "hp": {
        "current": 28,
        "max": 28,
        "temporary": 0
      },
      
      "abilities": {
        "strength": 8,
        "dexterity": 18,
        "constitution": 12,
        "intelligence": 16,
        "wisdom": 13,
        "charisma": 10
      },
      
      "spell_slots": {
        "1": {"max": 4, "used": 1},
        "2": {"max": 3, "used": 0}
      },
      
      "spells_prepared": [
        {
          "name": "Magic Missile",
          "level": 1,
          "school": "Evocation",
          "prepared": true
        },
        {
          "name": "Shield",
          "level": 1,
          "school": "Abjuration",
          "prepared": true
        }
      ],
      
      "conditions": [],
      
      "action_economy": {
        "action": "available",
        "bonus_action": "available",
        "reaction": "available",
        "movement": 30
      }
    }
  }
}
```

## Step 5: Test Endpoints

**Add to complete-intelligent-server.js:**

```javascript
// Test spell lookup
app.get('/api/dnd/test-spell/:name', async (req, res) => {
    try {
        const spell = await rulesService.getSpellDetails(req.params.name);
        res.json(spell);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test monster lookup  
app.get('/api/dnd/test-monster/:name', async (req, res) => {
    try {
        const monster = await rulesService.getMonsterStats(req.params.name);
        res.json(monster);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cache stats
app.get('/api/dnd/rules-cache', (req, res) => {
    res.json(rulesService.getCacheStats());
});
```

## Step 6: Testing the Integration

### Test 1: Basic Spell Lookup
```bash
# Test the API directly
curl http://localhost:3000/api/dnd/test-spell/magic-missile

# Should return full spell data with damage, components, etc.
```

### Test 2: In-Game Usage
```
Player: "Dax casts Fireball at 3rd level"

Expected AI DM behavior:
1. Calls get_spell_details("Fireball", cast_at_level=3)
2. Receives: 8d6 fire damage, 20ft radius sphere, V/S/M components
3. Generates narrative with accurate mechanics
4. State extraction reduces spell slots
```

### Test 3: Monster Introduction
```
DM: "A goblin appears!"

Expected AI DM behavior:
1. Calls get_monster_stats("Goblin")
2. Receives: AC 15, 7 HP, scimitar +4 (1d6+2)
3. Describes encounter with accurate stats
```

## Troubleshooting

### Issue: Tools not being called
**Solution**: Check system prompt includes tool usage instructions

### Issue: Spell names not found
**Solution**: API uses kebab-case (magic-missile not Magic Missile). Service handles this automatically.

### Issue: Cache growing too large
**Solution**: Adjust `cacheExpiry` in DnDRulesService constructor or call `clearCache()` periodically

## Next Steps

1. Add spell slot tracking in state extraction
2. Display spell details in character sheet UI
3. Add concentration tracking
4. Implement automatic spell slot recovery on long rest
5. Add item/equipment effects to character stats

## Production Considerations

- **Rate Limiting**: dnd5eapi.co is free but consider caching aggressively
- **Fallback Behavior**: Service returns minimal data on API failures
- **Error Logging**: Monitor `console.error` outputs for API issues
- **Custom Content**: For homebrew spells/items, extend the service with custom data
