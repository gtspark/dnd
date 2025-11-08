# Component Directory Reference

Last updated: 2025-10-20  
Scope: `/opt/vodbase/dnd-5e/ui-svelte/src/lib/components`

Each section summarizes a Svelte component's role, public inputs, cross-component wiring, and backend touchpoints so future refactors can lean on the existing contract.

## AIProviderSettings.svelte
- **Responsibilities**: Modal that loads current AI provider, surfaces availability, and persists selection.
- **Props**: `campaign` (string, default `'test-silverpeak'`), `onClose` (function callback).
- **External calls**: `GET /dnd-api/dnd/ai-provider?campaign=...`, `POST /dnd-api/dnd/ai-provider`.
- **Events & side effects**: Emits `newGameMessage` (window event) to log provider switches; invokes `onClose` on success, backdrop click, Escape/Enter/Space.
- **Dependencies**: Consumed by `HeaderControls`; relies on `window.dispatchEvent`.

## CampaignManager.svelte
- **Responsibilities**: Left panel party roster, compact ability display, vitals, and tabbed equipment/inventory/spell summary for the selected character.
- **Props**: `campaign` (string).
- **External calls**: `GET /dnd-api/dnd/state`, `GET /dnd-api/dnd/equipment/:character`.
- **Events & side effects**: Dispatches `characterSelected` (window) whenever selection changes; triggers `PartyCredits` render in footer.
- **Notable state**: Tracks `characters`, `selectedCharacter`, `characterData`, `activeTab`, `loading/error`.

## CampaignNotes.svelte
- **Responsibilities**: Local notes textarea with auto-save and “last saved” indicator.
- **Props**: `campaign` (string).
- **Storage**: Reads/writes `localStorage["${campaign}_notes"]`.
- **Timers & cleanup**: Debounced save (500 ms) and 5 s interval to refresh the relative timestamp.
- **Accessibility**: Status text updates inline; no external events.

## CombatTracker.svelte
- **Responsibilities**: Polls combat state, renders initiative order, party/enemy summaries, and exposes “Next Turn” / “End Combat”.
- **Props**: `campaign` (string).
- **External calls**: `GET /api/dnd/combat-state`, `POST /api/dnd/combat/next-turn`, `POST /api/dnd/combat/end`.
- **Events & side effects**: Listens to `combatStateUpdate`; dispatches `combatModeChange` on combat end; toggles `document.body` class `combat-mode`.
- **Nested components**: Lazily mounts `EquipmentManager` for expanded player entries.
- **Derived values**: Calculates HP percent, health badges, party/enemy counters via reactive statements.

## DiceRollPrompt.svelte
- **Responsibilities**: Full-screen overlay for manual d20 rolls with animated reveal.
- **Props**: `rollDetails` (object containing `skill`, `dc`, `modifier`, `description`), `onRoll` callback.
- **Behavior**: Generates animation locally then calls `onRoll(finalRoll)`; no network usage.
- **Usage**: Mounted by `GameArea` when inline legacy prompt is replaced.

## EquipmentManager.svelte
- **Responsibilities**: Character equipment/inventory/spell browser with tabbed navigation.
- **Props**: `campaign` (string), `character` (string|null).
- **External calls**: `GET /dnd-api/dnd/equipment/:character`, `DELETE /dnd-api/dnd/equipment/:id`.
- **Events & side effects**: Subscribes to global `characterSelected` to stay in sync with `CampaignManager`.
- **State**: Tracks lists per tab, `loading/error`, `activeTab`.

## GameArea.svelte
- **Responsibilities**: Parent shell that wires `GameLog`, `GameInput`, dice prompts, and bridges legacy `window.game` handlers with Svelte events.
- **Props**: `campaign` (string).
- **Events listened**: `requestDiceRoll`, `playerAction`, `legacyGameMessage`.
- **Events dispatched**: `newGameMessage`, `diceRollComplete`, `combatModeChange`, `combatHandoffReady`, `removeThinkingMessage`.
- **External calls**: Delegates messaging to `window.claudeAPI.sendMessage`, filters JSON blocks before logging, forwards roll requests to legacy `window.game.handleRollRequest`.
- **Other side effects**: Monkey patches `window.game.addLogEntry` to mirror into Svelte log; detects combat trigger phrases client-side.

## GameInput.svelte
- **Responsibilities**: Message composer with mode selector and keyboard shortcut handling.
- **Props**: (Intended) `campaign`, but currently hard-coded via `export const campaign = 'test-silverpeak'`.
- **Events dispatched**: `playerAction` containing `{ message, mode }`; clears UI after send.
- **UX**: Ctrl/Cmd+Enter submits; disables send while request in flight.

## GameLog.svelte
- **Responsibilities**: Displays narrative/chat history with typewriter effect, handles roll prompts, and orchestrates initiative follow-ups.
- **Props**: `campaign` (string).
- **Initial load**: Fetches `/dnd/campaigns/${campaign}/conversation-history.json`; falls back to welcome message.
- **Events listened**: `newGameMessage`, `removeThinkingMessage`, `showRollPrompt`.
- **Events dispatched**: `combatHandoffReady`, `newGameMessage` (secondary messages), `removeThinkingMessage`.
- **Legacy interactions**: Calls `window.game` helpers (e.g., `calculateDiceRoll`, `getSkillModifier`, `rollForRequest`, `addToRollHistory`, `enterCombatMode`) and `window.claudeAPI.sendMessage` for initiative continuations.
- **UI notes**: Uses `TypewriterText` for assistant responses; maintains `pendingRollPrompt` queue to avoid interrupting animations.

## HeaderControls.svelte
- **Responsibilities**: Top-right icon buttons for AI settings, help modal, and exit navigation.
- **Props**: `campaign` (string) passed into `AIProviderSettings`.
- **Events & side effects**: Navigates via `window.location.href = '/dnd'`; toggles modal booleans.
- **Dependencies**: Mounts `AIProviderSettings` and `HelpModal` conditionally.

## HelpModal.svelte
- **Responsibilities**: Static onboarding modal describing features, modes, and shortcuts.
- **Props**: `onClose` callback.
- **Accessibility**: Backdrop click closes, Escape key closes, close button labeled; `aria-modal` and focusable panel.
- **Dependencies**: Triggered by `HeaderControls`.

## PartyCredits.svelte
- **Responsibilities**: Displays per-character gold and total fund with sync indicator.
- **Props**: `campaign` (string).
- **External calls**: `GET /dnd-api/dnd/state` every 5 s while mounted.
- **State**: `characters`, `totalCredits`, `synced`, `loading`.
- **Cleanup**: Clears polling interval on destroy.

## RecentRolls.svelte
- **Responsibilities**: Sidebar history of latest dice rolls with pass/fail styling.
- **Props**: `campaign` (string).
- **Storage**: Persists up to 10 entries in `localStorage["${campaign}_recentRolls"]`.
- **Events listened**: `rollMade` (window) to append new roll data.
- **UI**: Provides “Clear History” button that also clears storage.

## SceneGenerator.svelte
- **Responsibilities**: Requests AI-generated scene imagery and renders the latest result.
- **Props**: `campaign` (string).
- **External calls**: `HEAD /dnd/campaigns/${campaign}/generated-scenes/latest.png` (on mount), `POST /dnd-api/dnd/generate-scene`.
- **State**: `loading`, `imageUrl`, `sceneDescription`, `error`, `hasLatestImage`.
- **UX**: Shows progress indicator, error messaging, and disables button during requests.

## TypewriterText.svelte
- **Responsibilities**: Incrementally reveals supplied HTML string with the option to skip.
- **Props**: `text` (string), `speed` (ms per character, default `10`).
- **Events dispatched**: `complete` when animation finishes or is skipped.
- **Accessibility**: Acts as button (`role="button"`, keyboard shortcuts) to skip animation.

