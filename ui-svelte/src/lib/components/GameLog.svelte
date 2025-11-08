<script>
  import { onMount, tick } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import TypewriterText from './TypewriterText.svelte';

  export let campaign = 'test-silverpeak';

  let messages = [];
  let isTyping = false;
  let currentTypingIndex = -1;
  let rollPrompt = null; // Stores the current roll prompt details
  let pendingRollPrompt = null; // Stores roll prompt until typewriter finishes

  onMount(() => {
    // Listen for new messages from the legacy game system
    window.addEventListener('newGameMessage', handleNewMessage);

    // Listen for remove thinking message event
    window.addEventListener('removeThinkingMessage', removeThinkingMessage);

    // Listen for roll prompt requests
    window.addEventListener('showRollPrompt', handleShowRollPrompt);

    // Load existing messages
    loadExistingMessages();

    return () => {
      window.removeEventListener('newGameMessage', handleNewMessage);
      window.removeEventListener('removeThinkingMessage', removeThinkingMessage);
      window.removeEventListener('showRollPrompt', handleShowRollPrompt);
    };
  });

  async function loadExistingMessages() {
    // Try to load from server conversation history
    try {
      const campaignPath = `/dnd/campaigns/${campaign}/conversation-history.json`;
      const response = await fetch(campaignPath);
      if (response.ok) {
        const conversationHistory = await response.json();
        messages = conversationHistory.map((entry, index) => ({
          id: Date.now() + index,
          role: entry.role === 'player' ? 'user' : 'assistant',
          content: entry.content,
          mode: entry.mode || 'ic',
          timestamp: entry.timestamp || new Date().toISOString(),
          isTyping: false // Don't animate existing messages
        }));
        console.log(`📝 Loaded ${messages.length} messages from conversation history`);
        await tick();
        // Wait for DOM to fully render before scrolling - use requestAnimationFrame for better timing
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToBottom();
            console.log('📜 Scrolled to bottom after initial load');
            // Double-check after animations complete
            setTimeout(scrollToBottom, 500);
          });
        });
      }
    } catch (error) {
      console.log('No existing conversation history found, starting fresh');
      // Show welcome message
      messages = [{
        id: Date.now(),
        role: 'assistant',
        content: '<p>Welcome, brave adventurer! Your story begins here...</p>',
        mode: 'ic',
        timestamp: new Date().toISOString(),
        isTyping: false
      }];
    }
  }

  async function handleNewMessage(event) {
    const { role, content, mode, timestamp, isThinking } = event.detail;

    const newMessage = {
      id: Date.now(),
      role,
      content,
      mode: mode || 'ic',
      timestamp: timestamp || new Date().toISOString(),
      isTyping: role === 'assistant', // Only typewriter effect for DM messages
      isThinking: isThinking || false  // Mark if this is a temporary thinking message
    };

    messages = [...messages, newMessage];

    if (newMessage.isTyping) {
      currentTypingIndex = messages.length - 1;
      await tick();
      // Scroll to bottom
      scrollToBottom();
    }
  }

  function removeThinkingMessage() {
    // Remove any messages marked as isThinking
    messages = messages.filter(msg => !msg.isThinking);
  }

  function handleShowRollPrompt(event) {
    const { rollDetails, rollRequest } = event.detail;
    console.log('📥 Roll prompt event received:', rollDetails);

    // Filter enemy names from Initiative descriptions
    let description = rollDetails.description;
    if (rollDetails.skill === 'Initiative') {
      // Remove common enemy types from the description
      const enemyPatterns = /,?\s*(?:and\s+)?(?:the\s+)?(?:Cult(?:ist)?\s+(?:Fanatic|Mage)|Bandit|Goblin|Orc|Skeleton|Zombie|Wolf|Bear|Dragon|Giant|Troll)[^,]*/gi;
      description = description.replace(enemyPatterns, '');
      // Clean up formatting
      description = description.replace(/^for\s+/, '').replace(/,\s*$/, '').replace(/,\s*and\s*$/, '').trim();
      if (description) {
        description = `for ${description}`;
      }
    }

    // Store as pending - will show after typewriter finishes
    pendingRollPrompt = {
      skill: rollDetails.skill,
      dc: rollDetails.dc,
      description: description,
      request: rollRequest
    };
  }

  function handleTypewriterComplete() {
    // Show pending roll prompt if there is one
    if (pendingRollPrompt) {
      rollPrompt = pendingRollPrompt;
      pendingRollPrompt = null;
      scrollToBottom();
    }
  }

  async function handleRoll() {
    if (!rollPrompt || !window.game) return;

    // Clear the prompt immediately to prevent double-clicks
    const currentPrompt = rollPrompt;
    rollPrompt = null;

    // For Initiative, roll for party members only (not enemies)
    if (currentPrompt.skill === 'Initiative') {
      console.log('🔍 DEBUG: Full currentPrompt:', currentPrompt);
      console.log('🔍 DEBUG: Description:', currentPrompt.description);

      // Use greedy match to get ALL participants until end of string or punctuation
      const participantsMatch = currentPrompt.description.match(/for (.+)(?:[.!?]|$)/);
      console.log('🔍 DEBUG: participantsMatch:', participantsMatch);

      if (participantsMatch) {
        const participantText = participantsMatch[1].trim();
        console.log('🔍 DEBUG: participantText:', participantText);

        const allParticipants = participantText.split(/,\s*(?:and\s+)?/).map(p => p.trim());
        console.log('🔍 DEBUG: allParticipants after split:', allParticipants);

        // Filter to only party members (Kira, Thorne, Riven)
        const partyMembers = ['Kira', 'Thorne', 'Riven'];
        const partyRolls = allParticipants.filter(name =>
          partyMembers.some(pm => name.toLowerCase().includes(pm.toLowerCase()))
        );

        console.log(`🎲 Rolling Initiative for party members:`, partyRolls);
        console.log(`🔍 DEBUG: partyRolls length: ${partyRolls.length}`);

        // Roll d20 for each party member and collect results
        const rolls = [];
        for (const participant of partyRolls) {
          const diceResult = window.game.calculateDiceRoll('d20');
          const modifier = window.game.getSkillModifier(`Roll Initiative for ${participant}`);
          const total = diceResult.total + modifier;

          rolls.push({
            name: participant,
            roll: diceResult.total,
            modifier: modifier,
            total: total
          });
        }

        // Format the roll message
        const rollMessages = rolls.map(r =>
          `**${r.name}**: ${r.total} (rolled ${r.roll}${r.modifier !== 0 ? ` + ${r.modifier}` : ''})`
        ).join('\n');

        const fullMessage = `🎲 **Initiative Rolls:**\n${rollMessages}\n\n(DM: Please roll initiative for enemies and establish turn order)`;

        // Add to game log
        window.dispatchEvent(new CustomEvent('newGameMessage', {
          detail: {
            role: 'user',
            content: fullMessage,
            mode: 'ic',
            timestamp: new Date().toISOString()
          }
        }));

        // Add to roll history
        rolls.forEach(r => {
          window.game.addToRollHistory({
            skill: 'Initiative',
            roll: r.roll,
            total: r.total,
            modifier: r.modifier,
            timestamp: new Date()
          });
        });

        // Send to DM to continue combat
        if (window.claudeAPI) {
          // Wait for player message to render before showing thinking indicator
          await tick();
          await new Promise(resolve => setTimeout(resolve, 100));

          // Show thinking indicator
          window.dispatchEvent(new CustomEvent('newGameMessage', {
            detail: {
              role: 'assistant',
              content: '<p class="dm-thinking">🤔 DM is thinking...</p>',
              mode: 'ic',
              timestamp: new Date().toISOString(),
              isThinking: true
            }
          }));

          // Send initiative rolls and wait for response
          const response = await window.claudeAPI.sendMessage(fullMessage, 'ic', false);
          console.log('📥 Initiative response received:', {
            hasCombatDetected: !!response?.combatDetected,
            hasEnemies: !!response?.enemies,
            enemiesLength: response?.enemies?.length,
            fullResponse: response
          });

          // Remove thinking indicator
          window.dispatchEvent(new CustomEvent('removeThinkingMessage'));

          // Display DM's response
          if (response && response.narrative) {
            window.dispatchEvent(new CustomEvent('newGameMessage', {
              detail: {
                role: 'assistant',
                content: response.narrative,
                mode: 'ic',
                timestamp: new Date().toISOString()
              }
            }));
          }

          if (response && response.handoffData) {
            window.dispatchEvent(new CustomEvent('combatHandoffReady', {
              detail: response.handoffData
            }));
          }

          // Check if combat was detected and trigger combat mode
          if (response && (response.combatDetected || response.enemies || response.handoffData)) {
            const handoff = response.handoffData || null;
            const enemies = handoff?.participants?.enemies || response.enemies || [];
            const initiativeOrder = handoff?.initiativeOrder || response.initiativeOrder || [];
            const playerInitiatives = {};
            const hasResolvedInitiative = Array.isArray(initiativeOrder) &&
              initiativeOrder.some(entry => Number.isFinite(Number(entry?.initiative)));

            initiativeOrder
              .filter(entry => entry?.isPlayer)
              .forEach(entry => {
                if (entry?.id) {
                  playerInitiatives[entry.id] = entry.initiative ?? null;
                } else if (entry?.name) {
                  playerInitiatives[entry.name] = entry.initiative ?? null;
                }
              });

            console.log('⚔️ Combat detected! Entering combat mode...', enemies);
            if (!hasResolvedInitiative) {
              console.log('⚠️ Combat handoff missing initiative results; deferring combat activation until rolls are ready.');
            } else if (window.game && window.game.enterCombatMode) {
              if (handoff) {
                window.game.enterCombatMode(handoff, {
                  playerInitiatives,
                  context: handoff.context || {}
                });
              } else {
                window.game.enterCombatMode(enemies || [], {
                  playerInitiatives
                });
              }
              console.log('✅ Combat mode activated with', enemies.length, 'enemies in initiative order.');
            } else {
              console.error('❌ window.game.enterCombatMode not available!');
            }
          } else {
            console.log('ℹ️ No combat detected in response');
          }
        }
      }
    } else {
      // Regular roll
      await window.game.rollForRequest('d20', currentPrompt.request);
    }
  }

  function scrollToBottom() {
    const logContainer = document.querySelector('.game-log');
    if (logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
      console.log(`📜 Scrolled game-log to ${logContainer.scrollHeight}px`);
    } else {
      console.warn('⚠️ .game-log container not found!');
    }
  }

  function getRoleLabel(role) {
    if (role === 'assistant') return '🎭 Dungeon Master';
    if (role === 'user') return '⚔️ You';
    return role;
  }

  function formatTime(timestamp) {
    if (!timestamp) return 'Just now';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatMessage(content) {
    // Convert basic markdown-style formatting
    // IMPORTANT: Preserve dice roll formatting by protecting it first
    const diceRollPattern = /🎲 Roll [^🎲]+/g;
    const diceRolls = content.match(diceRollPattern) || [];
    let protectedContent = content;

    // Replace dice rolls with placeholders
    diceRolls.forEach((roll, index) => {
      protectedContent = protectedContent.replace(roll, `DICE_ROLL_PLACEHOLDER_${index}`);
    });

    // Apply formatting to protected content
    let formatted = protectedContent
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '</p><p>');

    // Restore dice rolls
    diceRolls.forEach((roll, index) => {
      formatted = formatted.replace(`DICE_ROLL_PLACEHOLDER_${index}`, roll);
    });

    // Wrap in paragraphs if not already wrapped
    if (!formatted.startsWith('<p>')) {
      formatted = '<p>' + formatted + '</p>';
    }

    return formatted;
  }
</script>

{#each messages as message, i (message.id)}
  <div
    class="log-entry {message.role}-entry"
    class:dm-entry={message.role === 'assistant'}
    class:player-entry={message.role === 'user'}
    data-mode={message.mode}
    in:fly={{ y: 20, duration: 400, easing: quintOut }}
  >
    <div class="entry-header">
      <span class="entry-author" class:dm-author={message.role === 'assistant'}>
        {getRoleLabel(message.role)}
      </span>
      <span class="entry-time">{formatTime(message.timestamp)}</span>
    </div>
    <div class="entry-content">
      {#if message.isTyping && i === currentTypingIndex}
        <TypewriterText text={formatMessage(message.content)} on:complete={handleTypewriterComplete} />
      {:else}
        {@html formatMessage(message.content)}
      {/if}
    </div>
  </div>
{/each}

{#if rollPrompt}
  <div class="roll-prompt" in:scale={{ duration: 300, easing: quintOut }}>
    <div class="roll-prompt-header">
      🎲 <strong>Roll {rollPrompt.skill}{rollPrompt.dc ? ` (DC ${rollPrompt.dc})` : ''}</strong>
    </div>
    <div class="roll-prompt-description">
      {#if rollPrompt.skill === 'Initiative'}
        {rollPrompt.description}
      {:else}
        to {rollPrompt.description}
      {/if}
    </div>
    <div class="roll-prompt-buttons">
      <button class="btn-dice" on:click={handleRoll}>
        🎲 Roll d20
      </button>
    </div>
  </div>
{/if}

<style>
  .log-entry {
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .roll-prompt {
    background: linear-gradient(135deg, #4c1d95 0%, #6b21a8 100%);
    border: 2px solid #a855f7;
    border-radius: 12px;
    padding: 1rem 1.25rem;
    margin: 1rem auto;
    max-width: 500px;
    box-shadow: 0 4px 20px rgba(168, 85, 247, 0.4), 0 0 40px rgba(168, 85, 247, 0.15);
  }

  .roll-prompt-header {
    font-size: 1.05rem;
    color: #faf5ff;
    margin-bottom: 0.5rem;
    font-weight: 700;
    text-align: center;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  }

  .roll-prompt-description {
    color: #e9d5ff;
    margin-bottom: 1rem;
    font-style: italic;
    font-size: 0.95rem;
    text-align: center;
  }

  .roll-prompt-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .btn-dice {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    border: 2px solid #fbbf24;
    padding: 0.65rem 1.5rem;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  .btn-dice:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(251, 191, 36, 0.6);
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    border-color: #fcd34d;
  }

  .btn-dice:active {
    transform: translateY(0);
  }
</style>
