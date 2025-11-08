# Runtime Wiring Notes

Last updated: 2025-10-20  
Scope: Silverpeak production bundle (`/dnd/campaigns/test-silverpeak/index.html`) integrating Svelte UI (`ui-svelte/src/lib/components`) with the legacy `CampaignBase` scaffold (`shared/campaign-base.js`).

This reference captures how the Svelte bundle, legacy helpers, and backend APIs currently communicate so that future refactors can unwind the shared state safely.

## Global Surfaces

### `window.game` (`CampaignBase` instance)
- Bootstrapped by the legacy HTML before Svelte mounts.
- Provides the authoritative campaign state (`campaignState`, `isCombatActive`, `pendingCombatHandoff`) and utility methods Svelte still calls:
  - Rolling & modifiers: `calculateDiceRoll`, `rollForRequest`, `getSkillModifier`, `getEquipmentBonus`, `getStatusEffectPenalty`.
  - Combat integration: `enterCombatMode`, `startCombatSession`, `normalizeCombatState`.
  - Persistence: `syncWithDM`, `addToRollHistory`, `addLogEntry` (monkey-patched by `GameArea`).
- Listens for Svelte-dispatched events:
  - `combatModeChange` to flip `isCombatActive`.
  - `combatHandoffReady` to cache structured payloads for the `/api/dnd/combat/start` request.

### `window.claudeAPI`
- Created by `api-handler.js` and left intact in production HTML.
- Svelte components defer all narrative/combat messaging to it:
  - `sendMessage(message, mode, isRollResult)`
  - `parseRollRequest`
  - `toggleSandboxMode`, `initialize`, etc.
- The Silverpeak HTML overrides `window.claudeAPI.sendMessage` to inject `combatHandoffReady` data and to filter out JSON from narratives before Svelte renders them.

### Campaign HTML glue (`/dnd/campaigns/test-silverpeak/index.html`)
- Overrides `window.game.handleRollRequest` to emit a `showRollPrompt` event for the Svelte `GameLog` instead of writing inline HTML.
- Wraps `window.claudeAPI.sendMessage` so the hand-off payload and cleaned narrative are exposed to the Svelte layer.
- Ensures `window.game.constructor.prototype.handleRollRequest` mirrors the override for any late-bound instances.

## Event Bus

| Event name | Emitted by | Consumed by | Payload shape | Purpose |
|------------|------------|-------------|---------------|---------|
| `playerAction` | `GameInput` | `GameArea` | `{ message, mode }` | Replace legacy send button & mode toggles. |
| `newGameMessage` | `GameArea`, `GameLog`, `AIProviderSettings`, legacy DOM | `GameLog` (renders), any listeners needing transcripts | `{ role, content, mode, timestamp, isThinking? }` | Central log feed for all chat updates. |
| `removeThinkingMessage` | `GameArea`, `GameLog` | `GameLog` | none | Removes temporary “DM is thinking…” entries. |
| `requestDiceRoll` | Legacy inline roll UI (not currently used since override) | `GameArea` | `{ skill, dc, description, modifier }` | Legacy hook retained; Svelte prompt currently disabled. |
| `showRollPrompt` | Overridden `window.game.handleRollRequest` | `GameLog` | `{ rollDetails, rollRequest }` | Displays queued roll prompt after typewriter completes. |
| `diceRollComplete` | `GameArea` (after Svelte dice modal) | Legacy listeners | `{ diceRoll, modifier, total, skill, dc }` | Returns results to the legacy combat/log pipeline when the Svelte modal is used. |
| `rollMade` | `window.game.addToRollHistory` | `RecentRolls` | `{ character, skill, total, modifier, dice, diceRoll, dc, timestamp }` | Keeps local roll history in sync. |
| `combatHandoffReady` | `GameArea`, `GameLog` (upon AI response) | `CampaignBase` (`pendingCombatHandoff`), backend auto-start logic | Structured payload: `{ context, participants: { players[], enemies[] }, memories? }` | Caches narrative hand-off data for `/api/dnd/combat/start`. |
| `combatModeChange` | `GameArea` (manual trigger), `CampaignBase.startCombatSession`, `CombatTracker.endCombat` | `CampaignBase` (status), any UI toggles | `{ active: boolean, trigger?, combatState? }` | Keeps both systems aware of combat state changes. |
| `combatStateUpdate` | `CampaignBase.startCombatSession`, backend pollers | `CombatTracker` | `combatState` object from server | Reactively updates the tracker without re-fetching. |
| `characterSelected` | `CampaignManager` | `EquipmentManager` | `{ character }` | Synchronizes left panel selections with nested equipment view. |

## Messaging Flow

1. `GameInput` fires `playerAction` when the user submits text.  
2. `GameArea` receives the event, logs the player message via `newGameMessage`, sets thinking state, and forwards the payload to `window.claudeAPI.sendMessage(mode-aware)`.  
3. The wrapped Claude handler resolves with narrative data (and optional `handoffData` / `roll_request`).  
4. `GameArea`:
   - Dispatches `removeThinkingMessage`.  
   - Emits `combatHandoffReady` if a hand-off payload exists.  
   - For roll requests, cleans the narrative, sends it to the log, and calls the legacy `window.game.handleRollRequest`, which now emits `showRollPrompt`.  
   - For standard narratives, strips JSON blocks and dispatches `newGameMessage` for the DM text.

## Initiative & Combat Auto-Start Flow

1. When the DM asks for initiative, the overridden `handleRollRequest` emits `showRollPrompt`.  
2. `GameLog` waits for the current DM typewriter animation to complete, then renders a call-to-action.  
3. Clicking “Roll d20” leverages legacy helpers (`window.game.calculateDiceRoll`, `getSkillModifier`) to assemble per-character results.  
4. A summary message is dispatched via `newGameMessage`, and `window.claudeAPI.sendMessage` is called with the rolled totals to keep AI context aligned.  
5. The DM response often includes `handoffData`. `GameLog` emits both `newGameMessage` and `combatHandoffReady`.  
6. Legacy `CampaignBase` detects pending hand-off data, calls `/api/dnd/combat/start`, and emits `combatModeChange`/`combatStateUpdate`.  
7. `CombatTracker` listens for the update, refreshes the UI, and polls `/api/dnd/combat-state` every 2 s for authoritative data.

## Loading & Sync Indicators

- `GameArea` manages a local `isThinking` flag and mirrors it into the log via temporary `isThinking` messages; `GameLog` strips them out when `removeThinkingMessage` fires.  
- Legacy `CampaignBase` still runs `syncWithDM` on a 30 s interval; the result touches local storage and can update `campaignState`, which Svelte currently reads indirectly through server fetches rather than shared stores.

## Outstanding Coupling Hotspots

- `GameInput` exports a constant `campaign` instead of a prop, so swapping campaigns requires rebuilding or editing the component.  
- `GameLog` still depends on multiple `window.game` helpers and the Claude API wrapper; migrating these into shared modules or stores will reduce tight coupling.  
- `requestDiceRoll` events are no longer emitted after the HTML override, but legacy code paths still exist—cleaning them up will simplify the event surface.  
- `CombatTracker` maintains its own polling loop; evaluating a shared store fed by the backend could prevent duplicate fetches once other panels need the same state.

Use this map to guide future Phase 1/2 refactors (e.g., moving utilities into `/shared`, adopting Svelte stores, or eliminating redundant global events).
