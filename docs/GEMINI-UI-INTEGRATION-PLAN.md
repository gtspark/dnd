# Gemini UI Integration Plan (Revised)

## Overview
Replace current game.html/script.js/styles.css with Gemini's React UI, AND adopt Gemini's function-calling pattern in the backend to fix our broken state extraction.

## Backup Location
- UI: `/opt/dnd/_backup_ui_20241222/`
- Backend: `/opt/dnd/complete-intelligent-server.js.bak` (in scripts/old-data)

---

## Phase 1: Foundation

### 1.1 Project Setup ✅ DONE
- Copy Gemini's files to `/opt/dnd/ui/`
- Configure vite for production build to `/opt/dnd/dist/`
- Configure dev proxy to backend port 3001

### 1.2 Backend: Add Tool/Function Calling to AI Providers
**THE KEY FIX** - Replace post-hoc state extraction with inline function calls.

#### 1.2.1 Define Tools for Claude
Add to ClaudeProvider:
```javascript
const DM_TOOLS = [
  {
    name: "update_character",
    description: "Update character state when HP, conditions, or resources change in the narrative",
    input_schema: {
      type: "object",
      properties: {
        character: { type: "string", description: "Character name" },
        hp_change: { type: "integer", description: "HP delta (negative for damage, positive for healing)" },
        add_conditions: { type: "array", items: { type: "string" } },
        remove_conditions: { type: "array", items: { type: "string" } },
        gold_change: { type: "integer", description: "Gold/credits delta" },
        add_items: { type: "array", items: { type: "string" } },
        remove_items: { type: "array", items: { type: "string" } }
      },
      required: ["character"]
    }
  },
  {
    name: "start_combat",
    description: "Initialize combat with enemies. Call when combat begins.",
    input_schema: {
      type: "object",
      properties: {
        enemies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              hp: { type: "integer" },
              ac: { type: "integer" },
              initiative_bonus: { type: "integer" }
            },
            required: ["name"]
          }
        },
        surprise: { type: "string", enum: ["none", "players", "enemies"] }
      },
      required: ["enemies"]
    }
  },
  {
    name: "end_combat",
    description: "End the current combat encounter",
    input_schema: {
      type: "object",
      properties: {
        outcome: { type: "string", enum: ["victory", "defeat", "fled", "negotiated"] },
        summary: { type: "string" }
      },
      required: ["outcome"]
    }
  },
  {
    name: "request_roll",
    description: "Request a dice roll from a player",
    input_schema: {
      type: "object",
      properties: {
        character: { type: "string" },
        roll_type: { type: "string", description: "e.g., 'Athletics', 'Perception', 'Attack', 'Saving Throw'" },
        dc: { type: "integer", description: "Difficulty class (if applicable)" },
        dice: { type: "string", description: "Dice notation, e.g., '1d20', '2d6'" }
      },
      required: ["character", "roll_type"]
    }
  }
];
```

#### 1.2.2 Process Tool Calls in Response Handler
```javascript
// In handleActionRequest, after getting AI response:
if (response.tool_calls) {
  for (const toolCall of response.tool_calls) {
    switch (toolCall.name) {
      case 'update_character':
        await applyCharacterUpdate(toolCall.input);
        break;
      case 'start_combat':
        await initiateCombat(toolCall.input);
        break;
      case 'end_combat':
        await terminateCombat(toolCall.input);
        break;
      case 'request_roll':
        pendingRolls.push(toolCall.input);
        break;
    }
  }
}
```

#### 1.2.3 Update System Prompt
Add to DM system prompt:
```
TOOL USAGE RULES:
- When a character takes damage or heals, ALWAYS call update_character with hp_change
- When combat starts, ALWAYS call start_combat with the enemy list
- When combat ends (victory, defeat, flee), ALWAYS call end_combat
- When you need a player to roll dice, call request_roll
- These tools update game state automatically - you don't need to track numbers manually
```

### 1.3 Backend: Refactor Combat State Management

#### 1.3.1 Combat Initiation (from start_combat tool)
```javascript
async function initiateCombat(toolInput) {
  const { enemies, surprise } = toolInput;

  // Roll initiative for all players
  const playerInits = Object.entries(campaignState.characters).map(([key, char]) => ({
    id: key,
    name: char.name,
    type: 'player',
    initiative: rollD20() + Math.floor((char.abilities.dex - 10) / 2),
    hp: char.hp,
    ac: char.ac
  }));

  // Roll initiative for enemies
  const enemyInits = enemies.map((enemy, i) => ({
    id: `enemy-${i}`,
    name: enemy.name,
    type: 'enemy',
    initiative: rollD20() + (enemy.initiative_bonus || 0),
    hp: { current: enemy.hp || 20, max: enemy.hp || 20 },
    ac: enemy.ac || 12
  }));

  // Combine and sort
  const initiativeOrder = [...playerInits, ...enemyInits]
    .sort((a, b) => b.initiative - a.initiative);

  combatState = {
    active: true,
    round: 1,
    currentTurn: 0,
    initiativeOrder,
    actionEconomy: {}, // Will be populated per combatant
    surprise
  };

  await saveCombatState();
  return combatState;
}
```

#### 1.3.2 Combat Termination (from end_combat tool)
```javascript
async function terminateCombat(toolInput) {
  const { outcome, summary } = toolInput;

  combatState.active = false;
  combatState.outcome = outcome;
  combatState.summary = summary;
  combatState.endTime = new Date().toISOString();

  await saveCombatState();

  // Clear active combat
  activeCombats.delete(campaignId);

  return { active: false, outcome, summary };
}
```

### 1.4 Backend: Response Format Standardization

Every `/api/dnd/action` response must include:
```javascript
{
  narrative: "The DM's response text...",
  toolCalls: [...],  // Raw tool calls for debugging
  stateChanges: {    // Applied changes (for frontend animation/notification)
    characters: { ... },
    combat: { ... }
  },
  campaignState: {   // Full current state
    characters: { ... },
    combat: { active, round, currentTurn, initiativeOrder, ... },
    world: { ... }
  },
  pendingRolls: [    // Rolls requested by DM
    { character: "Kira", roll_type: "Perception", dc: 15 }
  ]
}
```

---

## Phase 2: API Service Layer

### 2.1 Create `/opt/dnd/ui/services/apiService.ts`
Replace geminiService.ts with backend calls.

```typescript
const API_BASE = '/api/dnd';

interface ActionResponse {
  narrative: string;
  stateChanges: StateChanges;
  campaignState: CampaignState;
  pendingRolls: RollRequest[];
}

export async function loadCampaign(campaignId: string): Promise<CampaignState> {
  const res = await fetch(`${API_BASE}/state?campaign=${campaignId}`);
  return res.json();
}

export async function sendAction(
  campaignId: string,
  action: string,
  character: string,
  mode: 'ic' | 'ooc' | 'dm-question' = 'ic'
): Promise<ActionResponse> {
  const res = await fetch(`${API_BASE}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign: campaignId, action, character, mode })
  });
  return res.json();
}

export async function submitRoll(
  campaignId: string,
  character: string,
  rollType: string,
  result: number,
  natural: number
): Promise<ActionResponse> {
  const res = await fetch(`${API_BASE}/roll-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign: campaignId, character, rollType, result, natural })
  });
  return res.json();
}

export async function getCombatState(campaignId: string): Promise<CombatState> {
  const res = await fetch(`${API_BASE}/combat/state?campaign=${campaignId}`);
  return res.json();
}

export async function nextTurn(campaignId: string): Promise<CombatState> {
  const res = await fetch(`${API_BASE}/combat/next-turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign: campaignId })
  });
  return res.json();
}

export async function endCombat(campaignId: string): Promise<void> {
  await fetch(`${API_BASE}/combat/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign: campaignId })
  });
}

export async function getAIProviders(campaignId: string) {
  const res = await fetch(`${API_BASE}/ai-provider?campaign=${campaignId}`);
  return res.json();
}

export async function setAIProvider(campaignId: string, provider: string) {
  const res = await fetch(`${API_BASE}/ai-provider`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign: campaignId, provider })
  });
  return res.json();
}
```

---

## Phase 3: Frontend Integration

### 3.1 Update App.tsx State Management

Replace Gemini function call handlers with backend state sync:
```typescript
// Remove: handleFunctionCall, all local state mutation from AI
// Add: sync state from every action response

const handleSendMessage = async () => {
  const response = await sendAction(campaignId, inputValue, activeChar.name);

  // Update narrative
  setMessages(prev => [...prev, {
    id: Date.now().toString(),
    type: 'ai',
    sender: 'Dungeon Master',
    text: response.narrative,
    timestamp: new Date()
  }]);

  // Sync all state from backend
  setCharacters(transformCharacters(response.campaignState.characters));

  // Combat state
  if (response.campaignState.combat?.active && !combat.isActive) {
    // Combat just started
    setCombat(transformCombat(response.campaignState.combat));
  } else if (!response.campaignState.combat?.active && combat.isActive) {
    // Combat just ended
    setCombat({ isActive: false, ... });
  } else if (response.campaignState.combat?.active) {
    // Combat ongoing - sync state
    setCombat(transformCombat(response.campaignState.combat));
  }

  // Handle pending rolls
  if (response.pendingRolls?.length > 0) {
    setPendingRoll(response.pendingRolls[0]);
  }
};
```

### 3.2 Remove Local Combat Management
- Remove `startCombat()` function that rolls local initiative
- Remove client-side initiative rolling
- Combat HUD reads entirely from `combat` state synced from backend

### 3.3 Wire Combat Buttons
```typescript
// "Initiative" button - just tells backend to check for combat
// (Combat actually starts when AI calls start_combat tool)

// "End Turn" button
const handleEndTurn = async () => {
  const newState = await nextTurn(campaignId);
  setCombat(transformCombat(newState));
};

// "Abandon Combat" button
const handleAbandonCombat = async () => {
  await endCombat(campaignId);
  setCombat({ isActive: false, ... });
};
```

---

## Phase 4: Character & State Transformers

### 4.1 Backend → Frontend Character Transform
```typescript
function transformCharacters(backendChars: Record<string, BackendChar>): Character[] {
  return Object.entries(backendChars).map(([key, char]) => ({
    id: key.toLowerCase().replace(/\s+/g, '-'),
    name: char.name,
    class: char.class,
    avatar: char.portrait || `/dnd/campaigns/${campaignId}/portraits/${key}.png`,
    hp: char.hp?.current ?? char.hp ?? 0,
    maxHp: char.hp?.max ?? char.maxHp ?? 20,
    resource: char.credits ?? char.gold ?? 0,
    resourceName: campaignType === 'scifi' ? 'Creds' : 'GP',
    conditions: char.conditions || [],
    stats: {
      str: char.abilities?.str ?? 10,
      dex: char.abilities?.dex ?? 10,
      con: char.abilities?.con ?? 10,
      int: char.abilities?.int ?? 10,
      wis: char.abilities?.wis ?? 10,
      cha: char.abilities?.cha ?? 10
    },
    inventory: [...(char.inventory || []), ...(char.equipment || [])],
    heldSpells: (char.spells || []).filter(s =>
      s.toLowerCase().includes('concentration') ||
      char.concentrating === s
    )
  }));
}
```

### 4.2 Backend → Frontend Combat Transform
```typescript
function transformCombat(backendCombat: BackendCombatState): CombatState {
  return {
    isActive: backendCombat.active,
    round: backendCombat.round,
    currentTurnIndex: backendCombat.currentTurn,
    order: backendCombat.initiativeOrder.map(c => ({
      id: c.id || c.uid,
      name: c.name,
      type: c.isPlayer ? 'player' : 'enemy',
      initiative: c.initiative,
      avatar: c.isPlayer ? characters.find(p => p.name === c.name)?.avatar : undefined
    })),
    economy: {
      actionSpent: !backendCombat.actionEconomy?.[currentCombatant]?.action,
      bonusActionSpent: !backendCombat.actionEconomy?.[currentCombatant]?.bonusAction,
      movementRemaining: backendCombat.actionEconomy?.[currentCombatant]?.movement ?? 30,
      maxMovement: 30
    }
  };
}
```

---

## Phase 5: Build & Deploy

1. `cd /opt/dnd/ui && npm run build`
2. Output to `/opt/dnd/dist/`
3. Update nginx to serve `/dnd/` from `/opt/dnd/dist/`
4. Keep `/dnd/game.html` route for legacy/fallback

---

## Testing Checklist

### Combat Flow (THE CRITICAL PATH)
- [ ] AI describes combat scenario → calls `start_combat` tool → combat HUD appears
- [ ] Initiative order shows all players + enemies sorted correctly
- [ ] Current turn highlighted, advances with "End Turn"
- [ ] AI describes damage → calls `update_character` → HP updates in sidebar
- [ ] AI declares victory → calls `end_combat` → combat HUD disappears
- [ ] Manual "Abandon Combat" ends combat on backend
- [ ] Page refresh during combat → combat HUD restored from backend state
- [ ] Action economy resets each turn

### State Sync
- [ ] Characters load from backend on page load
- [ ] HP changes from AI tool calls reflect immediately
- [ ] Conditions from AI tool calls appear in sidebar
- [ ] Gold/credits changes persist
- [ ] Inventory changes from AI persist

### AI Provider
- [ ] Shows current provider on load
- [ ] Switch providers works
- [ ] Each provider correctly uses tool calling

---

## File Changes Summary

### Backend (complete-intelligent-server.js)
1. Add `DM_TOOLS` definition to ClaudeProvider
2. Add tool processing in response handler
3. Add `initiateCombat()` and `terminateCombat()` functions
4. Update system prompt with tool usage rules
5. Standardize action response format
6. **DELETE** `extractStateChanges()` - replaced by tool calls

### Frontend (ui/)
1. Replace `services/geminiService.ts` → `services/apiService.ts`
2. Update `App.tsx` to sync state from backend responses
3. Remove local combat state management
4. Add state transformer functions

---

## Rollback Plan
```bash
# Restore UI
cp /opt/dnd/_backup_ui_20241222/* /opt/dnd/

# Restore backend (if needed)
cp /opt/dnd/scripts/old-data/complete-intelligent-server.js.bak /opt/dnd/complete-intelligent-server.js

pm2 restart dnd-enhanced
```

---

## Why This Approach Is Better

| Old (Post-hoc Extraction) | New (Tool Calling) |
|---------------------------|-------------------|
| 2 AI calls per action | 1 AI call per action |
| AI writes prose → 2nd AI parses → errors | AI calls tool → deterministic |
| Combat detection via regex | AI explicitly calls start_combat |
| "Did HP change?" - parsing | "HP changed by -5" - structured |
| State drift between AI and backend | Single source of truth |
| Combat end detection unreliable | AI calls end_combat explicitly |
