# Svelte Migration Plan

## Current Problem
Both legacy JavaScript (`campaign-base.js`) and Svelte components are running simultaneously, causing:
- Duplicate event handling
- Conflicting state management
- Race conditions
- Harder debugging

## Goal
Complete migration to Svelte with legacy code only providing utility functions.

---

## Components Already in Svelte ✅

1. **GameInput** - Player input textarea, mode selector, send button
2. **GameLog** - Message display with role formatting
3. **GameArea** - Container for GameLog + GameInput
4. **CharacterSheet** - Left panel character display
5. **EquipmentManager** - Inventory, spells management
6. **CombatTracker** - Initiative order, action economy
7. **SceneGenerator** - AI scene image generation
8. **RecentRolls** - Dice roll history
9. **CampaignNotes** - Player notes
10. **HeaderControls** - Top-right header buttons

---

## Legacy Code Still Active

### Event Listeners (campaign-base.js)
- **Lines 129-141**: Send button + player input (CONFLICTING - elements hidden but listeners still register)
- **Lines 144-151**: Mode buttons (CONFLICTING - Svelte handles this)
- **Lines 154-157**: Edit character button
- **Lines 176-191**: Sandbox toggle
- **Lines 192-201**: Character selector dropdown
- **Lines 203-206**: Sync button
- **Lines 209-212**: Settings button
- **Lines 215-225**: Help button
- **Lines 230-249**: Exit button
- **Lines 251-300**: Various tab systems
- **Lines 305-309**: Add item button
- **Lines 311-329**: Notes textarea

### Utility Functions (KEEP THESE)
- `rollForRequest()` - Roll dice with modifiers
- `getSkillModifier()` - Calculate skill bonuses
- `getEquipmentBonus()` - Equipment effects
- `checkAndStartCombat()` - Parse initiative and start combat
- `getCharacterAC()` / `getCharacterHP()` - Character stat helpers
- `parseRollRequest()` - Parse roll requests from DM

### State Management (NEEDS MIGRATION)
- `addLogEntry()` - Currently intercepted by Svelte, but messy
- `showLoadingState()` / `hideLoadingState()` - Loading indicators
- `updateCharacterDisplay()` - Character sheet updates
- Campaign state (`this.campaignState`)

---

## Migration Steps

### Phase 1: Disable Conflicting Listeners (URGENT)
**Status**: COMPLETED ✅
- [x] Disabled legacy `playerAction` listener (line 332-337)
- [x] Disabled send button listener (lines 129-143)
- [x] Disabled player input listener (lines 129-143)
- [x] Disabled mode button listeners (lines 145-154)
- [ ] Verify no more duplicate sends (NEEDS TESTING)

### Phase 2: Move Utility Functions to Shared Module
**Status**: Not started
- [ ] Create `/shared/game-utils.js` for:
  - Dice rolling functions
  - Skill modifier calculations
  - Equipment bonus calculations
  - Combat helpers
- [ ] Import in both Svelte and legacy for transition period
- [ ] Update all Svelte components to use shared utils

### Phase 3: Svelte Store for State Management
**Status**: Not started
- [ ] Create `/ui-svelte/src/stores/campaignStore.js`
  - Character sheets
  - Campaign state
  - Combat state
  - Current mode
- [ ] Create `/ui-svelte/src/stores/gameLogStore.js`
  - Message history
  - Loading state
- [ ] Migrate all state reads/writes to stores

### Phase 4: Remove Legacy DOM Manipulation
**Status**: Not started
- [ ] Remove all `getElementById` calls
- [ ] Remove all `querySelector` calls
- [ ] Remove all `addEventListener` for UI elements (keep for legacy integration only)

### Phase 5: API Service Layer
**Status**: Partially done (API calls in GameArea.svelte)
- [ ] Create `/ui-svelte/src/services/apiService.js`
  - `sendMessage()`
  - `startCombat()`
  - `getCombatState()`
  - `rollDice()`
- [ ] Centralize all API calls through service

### Phase 6: Complete Legacy Removal
**Status**: Not started
- [ ] Keep only utility functions in `campaign-base.js`
- [ ] Move to `/shared/legacy-utils.js` (clearly marked as transitional)
- [ ] Remove all event listeners
- [ ] Remove all DOM manipulation
- [ ] Eventually deprecate entirely

---

## Migration Priority Order

1. **HIGH - Stop duplicate sends** (Phase 1)
   - Disable legacy input handlers immediately

2. **HIGH - Shared utils** (Phase 2)
   - Both systems need dice rolling, combat helpers
   - Extract to shared module

3. **MEDIUM - State stores** (Phase 3)
   - Proper state management
   - Single source of truth

4. **MEDIUM - Clean up** (Phase 4)
   - Remove dead code
   - Clear separation

5. **LOW - Polish** (Phases 5-6)
   - API service abstraction
   - Complete legacy removal

---

## Testing Checklist

After each phase:
- [ ] Messages send once (not duplicated)
- [ ] "DM is thinking" shows correctly
- [ ] Roll prompts appear inline with correct skill names
- [ ] Mode buttons highlight properly
- [ ] Combat mode engages after initiative
- [ ] Character sheet updates correctly
- [ ] Equipment/spells sync properly
- [ ] No console errors
- [ ] No race conditions

---

## Current Immediate Fixes Applied (2025-10-17)

### Initial Session Fixes
1. ✅ Disabled legacy `playerAction` listener (campaign-base.js:331-337)
2. ✅ Fixed `sendPlayerAction()` to accept Svelte parameter (line 360-379)
3. ✅ Enhanced `parseRollRequest()` for Initiative (api-handler-base.js:313-362)
4. ✅ Disabled Svelte modal dice prompt (GameArea.svelte:164-185)
5. ✅ Added `checkAndStartCombat()` for automatic combat mode (campaign-base.js:548-672)
6. ✅ Fixed mode button event handling (campaign-base.js:146)
7. ✅ Updated index.html asset references (line 17, 408)

### Continuation Session Fixes (2025-10-17 23:54)
8. ✅ **Phase 1 COMPLETE** - Disabled all remaining legacy input/mode listeners (campaign-base.js:129-154)
9. ✅ Added JSON filter to GameArea.svelte to strip JSON code blocks from DM responses (lines 14-28)
10. ✅ Added "DM is thinking" loading indicator to GameArea.svelte (lines 177-194, 230-232)
11. ✅ Updated GameLog.svelte to handle removeThinkingMessage event (lines 18, 25, 93-96)
12. ✅ Applied JSON filtering to all DM narrative outputs (GameArea.svelte:201, 219)
13. ✅ Rebuilt Svelte components (bundle: index-C5oqQMpJ.js)
14. ✅ Updated index.html to reference new Svelte bundle (line 408)

**Status**: Phase 1 migration COMPLETE. System now ready for testing.
