<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import GameLog from './GameLog.svelte';
  import GameInput from './GameInput.svelte';
  import DiceRollPrompt from './DiceRollPrompt.svelte';
  import { stagedResultsStore, getStagedResults, buildStagedInsert, clearStagedResults } from '../../stores/rollQueueStore.js';
  import { combatStore } from '../../stores/combatStore.js';

  export let campaign = 'test-silverpeak';

  let showDicePrompt = false;
  let currentRollDetails = {};
  let gameLogComponent;
  let isThinking = false;  // Loading state for "DM is thinking"
  let combatState = null;
  let combatUnsubscribe;

  // Filter out JSON code blocks from DM narrative
  function filterJsonCodeBlocks(text) {
    if (!text) return text;

    // Remove JSON code blocks (```json ... ```)
    let filtered = text.replace(/```json[\s\S]*?```/g, '');

    // Also remove any standalone code blocks that might contain JSON
    filtered = filtered.replace(/```[\s\S]*?\{[\s\S]*?"combat"[\s\S]*?\}[\s\S]*?```/g, '');

    // Clean up extra whitespace
    filtered = filtered.replace(/\n{3,}/g, '\n\n').trim();

    return filtered;
  }

  function monitorNewGameMessage(event) {
    const detail = event.detail;
    if (!detail || detail.role !== 'assistant' || !detail.content) {
      return;
    }
    processTurnAnnouncements(detail.content);
  }

  const normalizeName = (value) => (value || '').toString().trim().toLowerCase();

  function findCombatantByName(name) {
    if (!combatState?.initiativeOrder) {
      return null;
    }

    const normalized = normalizeName(name);
    for (let index = 0; index < combatState.initiativeOrder.length; index += 1) {
      const combatant = combatState.initiativeOrder[index];
      if (normalizeName(combatant?.name) === normalized) {
        return { combatant, index };
      }
    }

    return null;
  }

  function processTurnAnnouncements(message) {
    if (!combatState?.active || !message) {
      return;
    }

    const upMatch = message.match(/([A-Za-z][A-Za-z0-9' \-]+),?\s*(?:you're up|you are up|is up)/i);
    const passMatch = message.match(/turn\s+passes\s+to\s+([A-Za-z][A-Za-z0-9' \-]+)/i);
    const targetName = (upMatch && upMatch[1]) || (passMatch && passMatch[1]);

    if (!targetName) {
      return;
    }

    const lookup = findCombatantByName(targetName.trim());
    if (!lookup) {
      return;
    }

    const detail = {
      name: lookup.combatant.name,
      index: lookup.index,
      isPlayer: !!lookup.combatant.isPlayer
    };

    const onDeckMatch = message.match(/([A-Za-z][A-Za-z0-9' \-]+)\s+is\s+on\s+deck/i);
    if (onDeckMatch) {
      detail.onDeck = onDeckMatch[1].trim();
    }

    window.dispatchEvent(new CustomEvent('turnPrompt', { detail }));
  }

  onMount(() => {
    // Listen for dice roll requests from legacy system
    window.addEventListener('requestDiceRoll', handleDiceRollRequest);

    // Listen for player actions from GameInput component
    window.addEventListener('playerAction', handlePlayerAction);

    // Listen for legacy game messages to pass to GameLog
    window.addEventListener('legacyGameMessage', handleLegacyMessage);

    window.addEventListener('newGameMessage', monitorNewGameMessage);

    combatUnsubscribe = combatStore.subscribe(({ state }) => {
      combatState = state;
    });

    // Intercept the legacy system's addLogEntry if it exists
    interceptLegacySystem();

    return () => {
      window.removeEventListener('requestDiceRoll', handleDiceRollRequest);
      window.removeEventListener('playerAction', handlePlayerAction);
      window.removeEventListener('legacyGameMessage', handleLegacyMessage);
      window.removeEventListener('newGameMessage', monitorNewGameMessage);
      combatUnsubscribe?.();
    };
  });

  function interceptLegacySystem() {
    // Wait for the legacy game object to be available
    const checkInterval = setInterval(() => {
      if (window.game && window.game.addLogEntry) {
        clearInterval(checkInterval);

        // Store original addLogEntry
        const originalAddLogEntry = window.game.addLogEntry;

        // Override it to also dispatch to our Svelte component
        window.game.addLogEntry = function(role, content, mode) {
          // Call original
          const result = originalAddLogEntry.call(this, role, content, mode);

          // Dispatch to Svelte
          window.dispatchEvent(new CustomEvent('newGameMessage', {
            detail: {
              role: role === 'dm' ? 'assistant' : 'user',
              content,
              mode: mode || 'ic',
              timestamp: new Date().toISOString()
            }
          }));

          return result;
        };

        // DISABLED: Intercept showRollPrompt to use Svelte component
        // Keeping the original inline roll prompt behavior instead of modal
        // const originalShowRollPrompt = window.game.showRollPrompt;
        // window.game.showRollPrompt = function(rollDetails, fullRequest) {
        //   // Dispatch event to show Svelte dice prompt instead of HTML
        //   window.dispatchEvent(new CustomEvent('requestDiceRoll', {
        //     detail: {
        //       skill: rollDetails.skill || 'Unknown',
        //       dc: rollDetails.dc || null,
        //       description: rollDetails.description || fullRequest,
        //       modifier: 0 // TODO: Calculate from character stats
        //     }
        //   }));
        // };

        // DISABLED: Don't intercept loading states - let legacy system handle them
        // The loading state messages are important user feedback
        // window.game.showLoadingState = function() {
        //   // Svelte handles its own loading state in GameInput
        // };
        // window.game.hideLoadingState = function() {
        //   // Svelte handles its own loading state in GameInput
        // };

        console.log('✅ Intercepted legacy game system for Svelte integration');
      }
    }, 100);

    // Clear after 5 seconds if not found
    setTimeout(() => clearInterval(checkInterval), 5000);
  }

  function handleDiceRollRequest(event) {
    currentRollDetails = event.detail;
    showDicePrompt = true;
  }

  function handleDiceRoll(result) {
    showDicePrompt = false;

    // Send roll result back to legacy system
    if (window.claudeAPI) {
      const rollResult = {
        diceRoll: result,
        modifier: currentRollDetails.modifier || 0,
        total: result + (currentRollDetails.modifier || 0),
        skill: currentRollDetails.skill,
        dc: currentRollDetails.dc
      };

      // Dispatch roll completion event
      window.dispatchEvent(new CustomEvent('diceRollComplete', {
        detail: rollResult
      }));
    }
  }

  async function handlePlayerAction(event) {
    const detail = event.detail || {};
    const rawMessage = detail.message || '';
    const mode = detail.mode || 'ic';
    const includeStagedOnly = !!detail.includeStagedOnly;

    // Send to API
    if (window.claudeAPI) {
      // Set the mode in game object
      if (window.game) {
        window.game.currentMode = mode;
      }

      try {
        const stagedResults = getStagedResults();
        const stagedBlock = stagedResults.length ? buildStagedInsert(stagedResults) : '';
        if (includeStagedOnly && !stagedBlock) {
          console.warn('⚠️ No staged roll results available to send.');
          return;
        }

        const outboundMessage = includeStagedOnly
          ? stagedBlock
          : stagedBlock
            ? `${rawMessage}${rawMessage.trim().length ? '\n\n' : ''}${stagedBlock}`
            : rawMessage;
        const playerLogContent = includeStagedOnly ? stagedBlock : rawMessage;

        if (!playerLogContent || !playerLogContent.trim()) {
          console.warn('⚠️ No player message content to send.');
          return;
        }

        // Add player message to log
        window.dispatchEvent(new CustomEvent('newGameMessage', {
          detail: {
            role: 'user',
            content: playerLogContent,
            mode: mode,
            timestamp: new Date().toISOString()
          }
        }));

        // Small delay to ensure player message renders before thinking message
        await new Promise(resolve => setTimeout(resolve, 50));

        // Show "DM is thinking" placeholder
        isThinking = true;
        window.dispatchEvent(new CustomEvent('newGameMessage', {
          detail: {
            role: 'assistant',
            content: '🎭 DM is thinking...',
            mode: mode,
            timestamp: new Date().toISOString(),
            isThinking: true  // Mark as temporary thinking message
          }
        }));

        // Send the message with correct parameters
        const response = await window.claudeAPI.sendMessage(outboundMessage, mode, false);

        // Remove "DM is thinking" placeholder
        isThinking = false;
        window.dispatchEvent(new CustomEvent('removeThinkingMessage'));

        if (stagedBlock && !includeStagedOnly) {
          window.dispatchEvent(new CustomEvent('newGameMessage', {
            detail: {
              role: 'system',
              content: stagedBlock,
              mode: mode,
              timestamp: new Date().toISOString()
            }
          }));
        }

        clearStagedResults();


        // Handle response
        let queueHandled = false;
        if (response.handoffData) {
          window.dispatchEvent(new CustomEvent('combatHandoffReady', {
            detail: response.handoffData
          }));
        }

        if (response.type === 'roll_request') {
          console.log('✅ ROLL REQUEST DETECTED:', response);

          // Show narrative first (with JSON filtered out)
          if (response.narrative) {
            const cleanedNarrative = filterJsonCodeBlocks(response.narrative);
            console.log('📝 Displaying cleaned narrative:', cleanedNarrative.substring(0, 100) + '...');
            window.dispatchEvent(new CustomEvent('newGameMessage', {
              detail: {
                role: 'assistant',
                content: cleanedNarrative,
                mode: mode,
                timestamp: new Date().toISOString()
              }
            }));
          }

          // Call legacy system to handle the roll prompt inline
          // IMPORTANT: Don't pass narrative again since we already displayed it above
          if (!response.rollQueueEntry && window.game && window.game.handleRollRequest && response.rollRequest) {
            console.log('🎲 Dispatching roll request to legacy system:', response.rollRequest);
            console.log('🎲 window.game exists:', !!window.game);
            console.log('🎲 handleRollRequest exists:', !!window.game.handleRollRequest);
            window.game.handleRollRequest(response.rollRequest, '');
          } else {
            if (response.rollQueueEntry) {
              queueHandled = true;
              window.game?.refreshRollQueue?.(true);
              document.querySelectorAll('.roll-prompt')?.forEach((el) => el.remove());
            } else {
              console.warn('⚠️ Cannot dispatch roll request - window.game not ready');
            }
          }
        } else if (response.narrative) {
          // Regular narrative response (with JSON filtered out)
          const cleanedNarrative = filterJsonCodeBlocks(response.narrative);
          window.dispatchEvent(new CustomEvent('newGameMessage', {
            detail: {
              role: 'assistant',
              content: cleanedNarrative,
              mode: mode,
              timestamp: new Date().toISOString()
            }
          }));
        }

        if (response.rollQueueEntry && !queueHandled) {
          window.game?.refreshRollQueue?.(true);
        }
      } catch (error) {
        // Remove "DM is thinking" on error
        isThinking = false;
        window.dispatchEvent(new CustomEvent('removeThinkingMessage'));

        console.error('Failed to send message:', error);
        window.dispatchEvent(new CustomEvent('newGameMessage', {
          detail: {
            role: 'assistant',
            content: 'The mystical forces seem to be disrupted... Please try again in a moment.',
            mode: mode,
            timestamp: new Date().toISOString()
          }
        }));
      }
    }
  }

  function handleLegacyMessage(event) {
    // Pass through any messages from legacy system
    window.dispatchEvent(new CustomEvent('newGameMessage', {
      detail: event.detail
    }));
  }

  function sendStagedResultsNow() {
    if (isThinking) {
      return;
    }
    const stagedResults = getStagedResults();
    if (!stagedResults.length) {
      return;
    }

    window.dispatchEvent(new CustomEvent('playerAction', {
      detail: {
        message: '',
        mode: 'ic',
        includeStagedOnly: true
      }
    }));
  }
</script>

<div class="game-log">
  {#if $stagedResultsStore.length}
    <div class="staged-indicator">
      <button
        type="button"
        class="staged-button"
        on:click={sendStagedResultsNow}
        disabled={isThinking}
      >
        📥 {$stagedResultsStore.length === 1 ? 'Roll result ready' : `${$stagedResultsStore.length} roll results ready`}
      </button>
      <span class="staged-subtext">Click to send immediately or compose a new action.</span>
    </div>
  {/if}
  <GameLog {campaign} bind:this={gameLogComponent} />
</div>
<GameInput {campaign} />

{#if showDicePrompt}
  <DiceRollPrompt
    rollDetails={currentRollDetails}
    onRoll={handleDiceRoll}
  />
{/if}

<style>
  .game-log {
    position: relative;
  }

  .staged-indicator {
    position: absolute;
    top: 1rem;
    right: 1rem;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.4rem;
    z-index: 5;
  }

  .staged-button {
    background: rgba(59, 130, 246, 0.18);
    border: 1px solid rgba(96, 165, 250, 0.4);
    color: #e0f2fe;
    border-radius: 999px;
    padding: 0.4rem 0.9rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(6px);
  }

  .staged-button:hover:not(:disabled) {
    border-color: rgba(147, 197, 253, 0.7);
    box-shadow: 0 0 12px rgba(96, 165, 250, 0.35);
    transform: translateY(-1px);
  }

  .staged-button:disabled {
    opacity: 0.55;
    cursor: wait;
  }

  .staged-subtext {
    font-size: 0.7rem;
    color: rgba(200, 215, 255, 0.75);
    text-align: right;
    max-width: 260px;
  }

  @media (max-width: 768px) {
    .staged-indicator {
      position: static;
      align-items: stretch;
      margin: 0 1rem 1rem;
    }

    .staged-subtext {
      text-align: left;
    }
  }
</style>
