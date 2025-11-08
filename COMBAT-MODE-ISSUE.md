# Combat Mode Activation Issue

## Problem
Combat mode activates for a split second, then immediately deactivates. Player initiative values display correctly in logs but the combat tracker UI doesn't appear.

## What Works
- ✅ Backend parses initiative correctly from DM response
- ✅ Backend sends `handoffData` with full `initiativeOrder` (all 6 combatants with correct initiative values)
- ✅ Frontend receives `handoffData` correctly (no longer null)
- ✅ `api-handler-base.js` passes through `handoffData` and `initiativeOrder` fields
- ✅ `enterCombatMode()` is called with correct data
- ✅ `initiativeOverride` is used with all 6 entries
- ✅ Combat state is normalized correctly
- ✅ `combatModeChange` event fires with `{active: true}`
- ✅ `combatStateUpdate` event fires with full combat state

## What Doesn't Work
- ❌ Combat tracker UI activates then immediately deactivates
- ❌ Console shows: "⚔️ Combat mode ACTIVATED" followed immediately by "⚔️ Combat mode DEACTIVATED"

## Root Cause
The `combatStore` fetches combat state from disk (`combat-state.json`) which has `{active: false}`, overwriting the `active: true` state that was just set via the `combatStateUpdate` event.

## Current Architecture
1. Player rolls initiative → DM responds with initiative order
2. Backend parses response, creates `handoffData` with `initiativeOrder`
3. Frontend receives response, calls `enterCombatMode(handoffData)`
4. `enterCombatMode()` dispatches `combatModeChange` and `combatStateUpdate` events
5. `CombatTracker` component listens for these events
6. `combatStateUpdate` event calls `combatStore.setState(event.detail)` ✅
7. **PROBLEM**: Something immediately overwrites the state back to `{active: false}` ❌

## Latest Attempt
Removed auto-polling entirely from `CombatTracker.svelte` - now it only relies on `combatStateUpdate` events from game logic, never fetches from disk. This should prevent the race condition.

## Files Modified
- `/opt/vodbase/dnd-5e/shared/api-handler-base.js` - Added `handoffData` and `initiativeOrder` to response whitelist
- `/opt/vodbase/dnd-5e/shared/campaign-base.js` - Fixed syntax error in `combatStateUpdate` event dispatch
- `/opt/vodbase/dnd-5e/ui-svelte/src/lib/components/CombatTracker.svelte` - Removed auto-polling, added stack trace logging for deactivation
- `/opt/vodbase/dnd-5e/ui-svelte/src/stores/combatStore.js` - (no changes needed)

## Update (2025-10-20)
- Introduced an optional `fetch` flag to `combatStore.setCampaign()`; the combat tracker now calls this with `{ fetch: false }` so it no longer reloads the stale file-based state after receiving live hand-off data.
- The tracker still listens for `combatStateUpdate` events and will remain in combat mode until an explicit end-combat signal is dispatched.
- Auto-polling remains available via `combatStore.start()` if we need it for diagnostics, but the default UI path is now event-driven only.
- Added a client-side fallback: if the server response is missing `initiativeOrder`, `CampaignBase.startCombatSession` now hydrates the combat state from the hand-off payload (initiative order, participants, action economy) so the tracker always has data even when `/combat/start` is unavailable.
