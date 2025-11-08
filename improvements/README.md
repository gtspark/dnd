# D&D Website Troubleshooting - Character Sheet API Integration

These files contain code and documentation for integrating D&D 5e character sheet APIs into an AI-powered Dungeon Master system.

## Files in this Directory

### 1. `DnDRulesService.js`
Complete Node.js service class that provides:
- **Spell lookups**: Get complete spell details (damage, components, casting time, etc.)
- **Monster stats**: Fetch monster stat blocks (HP, AC, abilities, actions)
- **Item details**: Equipment and item information (damage dice, AC, properties)
- **Caching**: 1-hour cache to avoid API rate limits
- **Preloading**: Preloads common spells on startup

**Dependencies**: `node-fetch`

**API**: Uses dnd5eapi.co (free, no auth required)

### 2. `integration-strategy.md`
High-level overview explaining:
- Current architecture analysis
- Why basic string arrays for spells aren't enough
- Three-layer integration approach (API + State + Tools)
- How it fits with existing AI provider architecture
- Example gameplay flow comparison (before/after)

### 3. `server-integration-guide.md`
Step-by-step implementation instructions:
- Installing DnDRulesService
- Adding tool definitions to Claude provider
- Updating system prompts
- Enhanced campaign state JSON schema
- Test endpoints for debugging
- Troubleshooting common issues
- Production considerations

## Background Context

This is for a D&D website at vodbase.net/dnd that uses AI providers (Claude/GPT/DeepSeek) as Dungeon Masters. The system currently has:
- Campaign state stored in JSON
- Context manager building prompts
- State extraction parsing DM responses
- Basic character data (HP, string arrays for spells/inventory)

## The Problem Being Solved

Current character data is too simple:
```json
{
  "spells": ["Magic Missile", "Shield", "Detect Magic"]
}
```

This lacks:
- Spell slot costs (what level? how many slots?)
- Action economy (is Shield a reaction?)
- Damage formulas (how much does Magic Missile do?)
- Components (V/S/M requirements)
- Duration, concentration, range, etc.

## The Solution

Add a rules service that:
1. Queries dnd5eapi.co on-demand when spells/monsters/items are used
2. Returns complete mechanical data to the AI DM
3. AI DM uses this data to generate accurate narrative
4. State extraction automatically tracks resources (spell slots, HP, conditions)

## Tool Calling Architecture

The AI DM can call tools like:
```javascript
get_spell_details("Magic Missile", cast_at_level=1)
// Returns: level 1, 1d4+1 per missile, 3 missiles, V/S components, instantaneous
```

The DM then narrates with accurate mechanics:
```
"Dax's fingers crackle with arcane energy. Three glowing darts materialize 
and streak toward the guard - the first strikes (4 damage), the second (3 damage), 
the third (2 damage). Total: 9 force damage."
```

## How Claude Code Can Help

Potential improvements to analyze:
1. **Server code review**: Check the tool calling implementation in `complete-intelligent-server.js`
2. **State management**: Review campaign state structure and state extraction logic
3. **Error handling**: Improve fallback behavior when API calls fail
4. **Performance**: Optimize caching strategy and preloading
5. **Testing**: Write unit tests for DnDRulesService
6. **Documentation**: Suggest improvements to integration guide
7. **Security**: Review for potential vulnerabilities (API rate limits, injection attacks)
8. **Scalability**: Consider multi-user scenarios and shared cache

## Next Steps for Implementation

1. Copy `DnDRulesService.js` into the server's `services/` directory
2. Install `node-fetch`: `npm install node-fetch`
3. Follow the step-by-step guide in `server-integration-guide.md`
4. Test with the provided endpoints
5. Update DM system prompts to use tools
6. Enhance campaign state schema
7. Monitor logs for API errors

## Questions for Claude Code

- Does the tool calling implementation look correct?
- Are there edge cases in the caching logic?
- Should we add rate limiting to the service itself?
- How can we handle homebrew/custom content?
- Should spell slot tracking be automatic or manual?
- What's the best way to test this integration?

---

**Original Conversation**: "D&D website troubleshooting" (October 9, 2025)

**Status**: Ready for implementation - code is complete and tested against dnd5eapi.co
