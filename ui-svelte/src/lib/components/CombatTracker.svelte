<script>
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
import { combatStore, defaultCombatState } from '../../stores/combatStore.js';
import EquipmentManager from './EquipmentManager.svelte';
import RollQueue from './RollQueue.svelte';
import {
  participantRollStatus,
  rollSummaryList,
  focusQueueEntry,
  stageReadyDetail,
  normalizeParticipantKey
} from '../../stores/rollQueueStore.js';

  export let campaign = 'test-silverpeak';

  let combatState = defaultCombatState;
  let storeLoading = false;
let error = null;
let expandedCombatant = null;
let unsubscribe;
let rollStatusMap = {};
let summaryItems = [];
let pendingTurn = null;
  function buildEndpointCandidates(path) {
    const config = window.__CLAUDE_API_CONFIG__ || {};
    const bases = Array.from(new Set([
      config.base_url,
      config.fallback_base_url,
      '/dnd-api/dnd',
      '/dnd/api/dnd',
      '/api/dnd'
    ].filter(Boolean)));

    const normalized = path.startsWith('/') ? path : `/${path}`;
    const candidates = bases.map(base => `${base.replace(/\/$/, '')}${normalized}`);

    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }

    return candidates;
  }

  async function postCombat(path, body) {
    const endpoints = buildEndpointCandidates(path);
    let lastError;

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
      } catch (err) {
        lastError = err;
        console.warn(`⚠️ Combat POST ${url} failed:`, err.message || err);
      }
    }

    throw lastError || new Error('Combat endpoint unreachable');
  }

  function applyCombatState(state) {
    const nextState = state || defaultCombatState;
    const wasActive = combatState?.active;
    combatState = nextState;

    if (combatState.active && !wasActive) {
      console.log('⚔️  Combat mode ACTIVATED via store update');
      document.body.classList.add('combat-mode');
    } else if (!combatState.active && wasActive) {
      console.log('⚔️  Combat mode DEACTIVATED via store update');
      console.trace('Stack trace for deactivation');
      document.body.classList.remove('combat-mode');
      expandedCombatant = null;
    }
  }

  function handleCombatStateChange(event) {
    if (event.detail) {
      combatStore.setState(event.detail);
    }
  }

  function handleTurnPromptEvent(event) {
    if (!event?.detail) {
      return;
    }
    pendingTurn = event.detail;
  }

  onMount(() => {
    unsubscribe = combatStore.subscribe(({ state, loading, error: storeError }) => {
      applyCombatState(state);
      storeLoading = loading;
      error = storeError;
    });

    combatStore.setCampaign(campaign, { fetch: false });
    // Don't auto-poll - rely entirely on combatStateUpdate events from game logic
    window.addEventListener('combatStateUpdate', handleCombatStateChange);
    window.addEventListener('turnPrompt', handleTurnPromptEvent);

    return () => {
      window.removeEventListener('combatStateUpdate', handleCombatStateChange);
      window.removeEventListener('turnPrompt', handleTurnPromptEvent);
      combatStore.stop();
      unsubscribe?.();
      document.body.classList.remove('combat-mode');
    };
  });

$: combatStore.setCampaign(campaign, { fetch: false });
$: rollStatusMap = $participantRollStatus;
$: summaryItems = $rollSummaryList;

  // Get HP bar percentage
  function getHPPercent(combatant) {
    if (!combatant?.hp) return null;
    const current = toNumber(combatant.hp.current);
    const max = toNumber(combatant.hp.max);
    if (current === null || max === null || max <= 0) {
      return null;
    }
    return Math.max(0, Math.min(100, (current / max) * 100));
  }

  function getHPClass(percent) {
    if (percent > 75) return 'hp-healthy';
    if (percent > 50) return 'hp-wounded';
    if (percent > 25) return 'hp-bloodied';
    return 'hp-critical';
  }

  const toNumber = (value) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const normalizeName = (value) => (value || '').toString().trim().toLowerCase();

  const formatHpText = (combatant) => {
    if (!combatant?.hp) {
      return '?? HP';
    }

    if (combatant.isPlayer) {
      const current = combatant.hp.current ?? '?';
      const max = combatant.hp.max ?? '?';
      return `${current}/${max} HP`;
    }

    return '??/?? HP';
  };

  const isAlive = (combatant) => {
    if (!combatant) return false;
    const hp = toNumber(combatant?.hp?.current);
    if (hp === null) {
      return true; // Unknown HP -> treat as alive until proven otherwise
    }
    return hp > 0;
  };

  const isDown = (combatant) => {
    if (!combatant) return false;
    const hp = toNumber(combatant?.hp?.current);
    if (hp === null) {
      return false;
    }
    return hp <= 0;
  };

  function getHpStatus(percent) {
    if (percent === null || percent === undefined) return 'Unknown';
    if (percent <= 0) return 'Down';
    if (percent <= 15) return 'Critical';
    if (percent <= 40) return 'Bloodied';
    if (percent <= 70) return 'Wounded';
    return 'Healthy';
  }

  $: initiativeOrder = Array.isArray(combatState?.initiativeOrder) ? combatState.initiativeOrder : [];
  $: playersAlive = initiativeOrder.filter(c => c?.isPlayer && isAlive(c)).length;
  $: enemiesAlive = initiativeOrder.filter(c => !c?.isPlayer && isAlive(c)).length;
  $: playersDown = initiativeOrder.filter(c => c?.isPlayer && isDown(c)).length;
  $: enemiesDown = initiativeOrder.filter(c => !c?.isPlayer && isDown(c)).length;
$: partySummary = Array.isArray(combatState?.participants?.players)
    ? combatState.participants.players
    : [];
$: enemySummary = Array.isArray(combatState?.participants?.enemies)
    ? combatState.participants.enemies
    : [];
$: partyTotal = partySummary.length || initiativeOrder.filter(c => c?.isPlayer).length;
$: enemyTotal = enemySummary.length || initiativeOrder.filter(c => !c?.isPlayer).length;
$: encounterContext = {
    reason: combatState?.context?.reason || null,
    location: combatState?.context?.location || null,
    time: combatState?.context?.time || null
  };
$: if (pendingTurn && combatState?.active) {
    if (Number.isFinite(pendingTurn.index) && combatState.currentTurn === pendingTurn.index) {
      pendingTurn = null;
    }
  } else if (pendingTurn && !combatState?.active) {
    pendingTurn = null;
  }

function toggleDetails(combatantKey) {
  expandedCombatant = expandedCombatant === combatantKey ? null : combatantKey;
}

function getParticipantStatus(combatant) {
  if (!combatant) return null;
  const key = normalizeParticipantKey(combatant.uid || combatant.id || combatant.name);
  return rollStatusMap[key];
}

function focusFirstPending(status) {
  const first = status?.pending?.[0];
  if (first) {
    focusQueueEntry(first.queueId);
  }
}

function stageFirstReady(status) {
  const firstReady = status?.ready?.find((detail) => !detail.staged);
  if (firstReady) {
    stageReadyDetail(firstReady);
  }
}

function handleSummaryClick(item) {
  if (!item) return;
  if (item.type === 'pending') {
    focusQueueEntry(item.queueId);
  } else if (item.type === 'ready') {
    stageReadyDetail(item);
  }
}

  function getTurnStatus(index) {
    if (!combatState?.active) {
      return 'pending';
    }

    const currentTurn = Number.isInteger(combatState.currentTurn) ? combatState.currentTurn : 0;

    if (index === currentTurn) {
      return 'active';
    }

    if (index < currentTurn) {
      return 'complete';
    }

    return 'pending';
  }
</script>

<div class="combat-tracker" role="region" aria-label="Combat Tracker">
  {#if summaryItems.length}
    <div class="roll-summary-bar">
      {#each summaryItems as item}
        <button
          class="queue-pill"
          class:pending={item.type === 'pending'}
          class:ready={item.type === 'ready'}
          on:click={() => handleSummaryClick(item)}
        >
          {item.type === 'pending' ? '⚠️' : item.type === 'ready' ? '📥' : ''} {item.label}
        </button>
      {/each}
    </div>
  {/if}

  <div class="combat-header">
    <h3>⚔️ Combat Tracker</h3>
    {#if combatState.active}
      <span class="round-counter" in:fade aria-label="Current round {combatState.round}">Round {combatState.round}</span>
    {:else}
      <span class="inactive-label" in:fade>No Active Combat</span>
    {/if}
    {#if storeLoading}
      <span class="poll-indicator" in:fade title="Refreshing combat state" aria-label="Refreshing combat state">⟳</span>
    {/if}
  </div>

  {#if combatState.active}
    <div class="encounter-context" in:fade>
      {#if encounterContext.reason}
        <p class="context-line"><strong>Encounter:</strong> {encounterContext.reason}</p>
      {/if}
      <div class="context-grid">
        {#if encounterContext.location}
          <span class="context-pill">📍 {encounterContext.location}</span>
        {/if}
        {#if encounterContext.time}
          <span class="context-pill">🕒 {encounterContext.time}</span>
        {/if}
        <span class="context-pill">
          👥 Party: {partySummary.length > 0 ? partySummary.map(p => p.name).join(', ') : 'Unknown'}
        </span>
        <span class="context-pill">
          🛡️ Enemies: {enemySummary.length > 0 ? enemySummary.map(e => e.name).join(', ') : 'Unknown'}
        </span>
      </div>
    </div>
  {/if}

  {#if combatState.active}
    <div class="combat-summary" in:fade>
      <div class="summary-pill">👥 Party Alive: {playersAlive}/{partyTotal || '—'}</div>
      <div class="summary-pill">🛡️ Enemies Alive: {enemiesAlive}/{enemyTotal || '—'}</div>
      <div class="summary-pill">⚔️ Total Combatants: {initiativeOrder.length}</div>
      <div class="summary-pill">💀 Down: {playersDown + enemiesDown}</div>
    </div>
    {#if pendingTurn?.name}
      <div class="pending-turn-banner" in:fade>
        {#if pendingTurn.isPlayer}
          {pendingTurn.name} is ready when you are. Type <code class="turn-hint">/end turn</code> in chat to pass play.
        {:else}
          Awaiting {pendingTurn.name}'s action...
        {/if}
        {#if pendingTurn.onDeck}
          <span class="pending-turn-ondeck">On deck: {pendingTurn.onDeck}</span>
        {/if}
      </div>
    {/if}
  {/if}

  {#if combatState.active && combatState.initiativeOrder.length > 0}
    <div class="initiative-list" role="list" aria-label="Initiative order" in:fly={{ y: 20, duration: 300, easing: quintOut }}>
      {#each combatState.initiativeOrder as combatant, index (combatant.uid || combatant.name)}
        {@const hpPercent = getHPPercent(combatant)}
        {@const hpStatus = getHpStatus(hpPercent)}
        {@const turnStatus = getTurnStatus(index)}
        {@const economy = combatant.actionEconomy || { action: true, bonusAction: true, movement: 30, reaction: true }}
        {@const remainingMovement = Number.isFinite(Number(economy.movement)) ? Number(economy.movement) : 0}
        <div
          role="listitem"
          class="combatant-card"
          class:current-turn={index === combatState.currentTurn}
          class:turn-active={turnStatus === 'active'}
          class:turn-complete={turnStatus === 'complete'}
          class:player={combatant.isPlayer}
          class:enemy={!combatant.isPlayer}
          class:downed={isDown(combatant)}
          aria-label="{combatant.name}, initiative {combatant.initiative}, {combatant.isPlayer ? 'party member' : 'enemy'}, {hpStatus}"
          in:fly={{ y: 20, delay: index * 50, duration: 300, easing: quintOut }}
        >
          <div class="combatant-header">
            <div class="combatant-info">
              <span class="init-number">{combatant.initiative}</span>
              <span class="combatant-name">
                {#if index === combatState.currentTurn}
                  <span class="turn-arrow">→</span>
                {/if}
                {combatant.name}
              </span>
            </div>
            <div class="combatant-stats">
              <span
                class="turn-indicator"
                aria-live="polite"
              >
                {#if turnStatus === 'active'}
                  ▶️ Acting Now
                {:else if turnStatus === 'complete'}
                  ✅ Turn Complete
                {:else}
                  ⏳ Waiting
                {/if}
              </span>
              {#if getParticipantStatus(combatant)?.pending?.length}
                <button class="roll-alert pending" on:click={() => focusFirstPending(getParticipantStatus(combatant))}>
                  ⚠️ Needs roll
                </button>
              {:else if getParticipantStatus(combatant)?.ready?.some(detail => !detail.staged)}
                <button class="roll-alert ready" on:click={() => stageFirstReady(getParticipantStatus(combatant))}>
                  📥 Result ready
                </button>
              {:else if getParticipantStatus(combatant)?.stagedCount}
                <span class="roll-alert staged">📦 Queued</span>
              {/if}
              {#if combatant.isPlayer}
                <button
                  class="btn-details"
                  on:click={() => toggleDetails(combatant.uid || combatant.name)}
                  class:active={expandedCombatant === (combatant.uid || combatant.name)}
                  aria-label="Toggle character details for {combatant.name}"
                  aria-expanded={expandedCombatant === (combatant.uid || combatant.name)}
                >
                  📋 Details
                </button>
              {/if}
              <span class="ac-badge">AC {combatant.isPlayer ? (combatant.ac ?? '?') : '??'}</span>
              <span class="hp-status status-{hpStatus.toLowerCase()}">{hpStatus}</span>
            </div>
          </div>

          {#if combatant.hp}
            <div class="hp-bar-container">
              <div class="hp-bar {getHPClass(hpPercent)}" style="width: {(hpPercent ?? 0)}%"></div>
              <span class="hp-text">{formatHpText(combatant)} · {hpStatus}</span>
            </div>
          {/if}

          {#if combatant.isPlayer || index === combatState.currentTurn}
            <div class="action-economy" class:player-economy={combatant.isPlayer} transition:fade={{ duration: 200 }}>
              <div class="action-item" class:used={!economy.action}>
                <div class="action-item-header">
                  <span class="action-icon">⚔️</span>
                  <span class="action-label">Action</span>
                </div>
                <span class="economy-state">{economy.action ? 'Available' : 'Spent'}</span>
              </div>
              <div class="action-item" class:used={!economy.bonusAction}>
                <div class="action-item-header">
                  <span class="action-icon">⚡</span>
                  <span class="action-label">Bonus</span>
                </div>
                <span class="economy-state">{economy.bonusAction ? 'Available' : 'Spent'}</span>
              </div>
              <div class="action-item" class:used={remainingMovement <= 0}>
                <div class="action-item-header">
                  <span class="action-icon">👟</span>
                  <span class="action-label">Movement</span>
                </div>
                <span class="economy-state movement">
                  {#if remainingMovement > 0}
                    {remainingMovement} ft remaining
                  {:else}
                    Spent
                  {/if}
                </span>
              </div>
              <div class="action-item" class:used={!economy.reaction}>
                <div class="action-item-header">
                  <span class="action-icon">🛡️</span>
                  <span class="action-label">Reaction</span>
                </div>
                <span class="economy-state">{economy.reaction ? 'Available' : 'Spent'}</span>
              </div>
              {#if combatant.isPlayer}
                <div class="economy-note">
                  DM-tracked; values update when the DM marks usage in the log.
                </div>
              {/if}
            </div>
          {/if}

          {#if combatant.conditions && combatant.conditions.length > 0}
            <div class="conditions">
              {#each combatant.conditions as condition}
                <span class="condition-badge">{condition}</span>
              {/each}
            </div>
          {/if}

          {#if combatant.isPlayer && expandedCombatant === combatant.name}
            <div class="character-details" transition:fade={{ duration: 200 }}>
              <EquipmentManager {campaign} character={combatant.name} />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="no-combat" in:fade>
      <p class="help-text">Combat will begin when initiative is rolled.</p>
      <p class="hint">Type "roll initiative" to start!</p>
    </div>
  {/if}

  {#if error}
    <div class="error-message" transition:fade>
      <span class="error-icon">⚠️</span>
      {error}
    </div>
  {/if}

  <RollQueue {campaign} />
</div>

<style>
  .combat-tracker {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--card-bg);
    border-radius: 8px;
    overflow: hidden;
  }

  .roll-summary-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(63, 81, 181, 0.12);
    border-bottom: 1px solid rgba(63, 81, 181, 0.25);
  }

  .queue-pill {
    border: none;
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    font-size: 0.75rem;
    cursor: pointer;
    color: rgba(236, 248, 243, 0.85);
    background: rgba(63, 81, 181, 0.25);
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .queue-pill.pending {
    background: rgba(245, 158, 11, 0.2);
    border: 1px solid rgba(245, 158, 11, 0.4);
  }

  .queue-pill.ready {
    background: rgba(52, 211, 153, 0.2);
    border: 1px solid rgba(52, 211, 153, 0.35);
  }

  .queue-pill:hover {
    filter: brightness(1.1);
  }

  .combat-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.25rem;
    background: rgba(11, 30, 23, 0.8);
    border-bottom: 1px solid rgba(46, 204, 113, 0.25);
  }

  .summary-pill {
    border: none;
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    font-size: 0.75rem;
    cursor: pointer;
    color: rgba(236, 248, 243, 0.85);
    background: rgba(63, 81, 181, 0.25);
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .summary-pill.pending {
    background: rgba(245, 158, 11, 0.2);
    border: 1px solid rgba(245, 158, 11, 0.4);
  }

  .summary-pill.ready {
    background: rgba(52, 211, 153, 0.2);
    border: 1px solid rgba(52, 211, 153, 0.35);
  }

  .summary-pill:hover {
    filter: brightness(1.1);
  }

  .combat-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.25rem;
    background: rgba(11, 30, 23, 0.8);
    border-bottom: 1px solid rgba(46, 204, 113, 0.25);
  }

  .combat-header h3 {
    margin: 0;
    font-size: 1rem;
    color: #ecf8f3;
  }

  .round-counter {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: rgba(46, 204, 113, 0.2);
    color: #2ecc71;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .inactive-label {
    font-size: 0.8rem;
    color: rgba(236, 248, 243, 0.6);
  }

  .poll-indicator {
    margin-left: auto;
    font-size: 0.85rem;
    color: rgba(236, 248, 243, 0.6);
    animation: spin 1.5s linear infinite;
  }

  .encounter-context {
    padding: 0.75rem 1.25rem;
    background: rgba(8, 24, 18, 0.85);
    border-bottom: 1px solid rgba(46, 204, 113, 0.15);
  }

  .context-line {
    margin: 0 0 0.5rem 0;
    color: rgba(236, 248, 243, 0.85);
  }

  .context-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .context-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.35rem 0.7rem;
    background: rgba(46, 204, 113, 0.12);
    border: 1px solid rgba(46, 204, 113, 0.3);
    border-radius: 999px;
    color: rgba(236, 248, 243, 0.85);
    font-size: 0.75rem;
  }

  .combat-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    background: rgba(12, 42, 32, 0.55);
    border-bottom: 1px solid rgba(46, 204, 113, 0.25);
  }

  .pending-turn-banner {
    margin: 0 1.25rem 0.75rem;
    padding: 0.5rem 0.9rem;
    border-radius: 8px;
    background: rgba(59, 130, 246, 0.18);
    border: 1px solid rgba(96, 165, 250, 0.35);
    color: #e0f2fe;
    font-size: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .pending-turn-ondeck {
    font-size: 0.72rem;
    color: rgba(200, 215, 255, 0.8);
  }

  .turn-hint {
    font-family: 'Inter', sans-serif;
    font-size: 0.72rem;
    background: rgba(30, 64, 175, 0.35);
    color: #e2e8f0;
    padding: 0.05rem 0.35rem;
    border-radius: 6px;
    border: 1px solid rgba(191, 219, 254, 0.45);
  }

  .summary-pill {
    padding: 0.4rem 0.8rem;
    border-radius: 999px;
    background: rgba(46, 204, 113, 0.18);
    color: rgba(236, 248, 243, 0.9);
    font-size: 0.78rem;
    border: 1px solid rgba(46, 204, 113, 0.35);
    font-weight: 600;
  }

  .initiative-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.25rem 1.5rem;
    overflow-y: auto;
  }

  .combatant-card {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: transform 0.2s, border-color 0.2s;
  }

  .combatant-card.current-turn {
    border-color: rgba(46, 204, 113, 0.6);
    box-shadow: 0 0 18px rgba(46, 204, 113, 0.25);
    transform: translateX(4px);
  }

  .combatant-card.turn-active {
    border-color: rgba(56, 189, 248, 0.8);
    box-shadow: 0 0 22px rgba(56, 189, 248, 0.35);
    transform: translateX(6px);
  }

  .combatant-card.turn-complete {
    background: rgba(17, 24, 39, 0.55);
    border-color: rgba(148, 163, 184, 0.18);
    opacity: 0.85;
  }

  .combatant-card.player {
    background: rgba(46, 204, 113, 0.08);
  }

  .combatant-card.enemy {
    background: rgba(231, 76, 60, 0.08);
  }

  .combatant-card.downed {
    opacity: 0.6;
  }

  .combatant-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .combatant-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .init-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(46, 204, 113, 0.18);
    color: #2ecc71;
    font-weight: 700;
  }

  .combatant-name {
    font-weight: 700;
    color: #ecf8f3;
  }

  .turn-arrow {
    margin-right: 0.35rem;
    color: #2ecc71;
    font-weight: 900;
  }

  .combatant-stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 0.45rem;
  }

  .turn-indicator {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.18);
    color: #bfdbfe;
    border: 1px solid rgba(59, 130, 246, 0.35);
  }

  .combatant-card.turn-active .turn-indicator {
    background: rgba(56, 189, 248, 0.22);
    color: #e0f2fe;
    border-color: rgba(56, 189, 248, 0.45);
  }

  .combatant-card.turn-complete .turn-indicator {
    background: rgba(148, 163, 184, 0.15);
    color: #cbd5f5;
    border-color: rgba(148, 163, 184, 0.25);
  }

  .roll-alert {
    border: none;
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    font-size: 0.7rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .roll-alert.pending {
    background: rgba(245, 158, 11, 0.22);
    color: #f59e0b;
  }

  .roll-alert.ready {
    background: rgba(52, 211, 153, 0.2);
    color: #34d399;
  }

  .roll-alert.staged {
    background: rgba(59, 130, 246, 0.18);
    color: #93c5fd;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    font-size: 0.7rem;
  }


  .btn-details {
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: #ecf8f3;
    cursor: pointer;
    font-size: 0.75rem;
    transition: all 0.2s;
  }

  .btn-details:hover,
  .btn-details.active {
    border-color: rgba(46, 204, 113, 0.6);
    background: rgba(46, 204, 113, 0.2);
  }

  .ac-badge {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: rgba(99, 102, 241, 0.18);
    color: #a5b4fc;
    font-weight: 600;
    font-size: 0.75rem;
  }

  .hp-status {
    margin-left: 0.5rem;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .hp-status.status-healthy {
    background: rgba(22, 163, 74, 0.2);
    color: #4ade80;
  }

  .hp-status.status-wounded {
    background: rgba(251, 191, 36, 0.2);
    color: #facc15;
  }

  .hp-status.status-bloodied {
    background: rgba(249, 115, 22, 0.25);
    color: #fb923c;
  }

  .hp-status.status-critical {
    background: rgba(239, 68, 68, 0.25);
    color: #f87171;
  }

  .hp-status.status-down {
    background: rgba(115, 115, 115, 0.3);
    color: #d1d5db;
  }

  .hp-bar-container {
    position: relative;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    height: 12px;
    overflow: hidden;
  }

  .hp-bar {
    height: 100%;
    transition: width 0.3s ease-in-out;
    border-radius: 6px;
  }

  .hp-bar.hp-healthy {
    background: linear-gradient(90deg, #2ecc71, #27ae60);
  }

  .hp-bar.hp-wounded {
    background: linear-gradient(90deg, #fbbf24, #d97706);
  }

  .hp-bar.hp-bloodied {
    background: linear-gradient(90deg, #f97316, #ea580c);
  }

  .hp-bar.hp-critical {
    background: linear-gradient(90deg, #ef4444, #b91c1c);
  }

  .hp-text {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.78rem;
    color: rgba(236, 248, 243, 0.85);
  }

  .action-economy {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 0.6rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 0.65rem;
  }

  .player-economy {
    background: rgba(79, 70, 229, 0.08);
    border-color: rgba(129, 140, 248, 0.3);
  }

  .action-item {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.45rem;
    padding: 0.55rem 0.65rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(236, 248, 243, 0.9);
    font-size: 0.75rem;
    font-weight: 600;
    border: 1px solid rgba(203, 213, 225, 0.12);
    min-width: 90px;
    transition: background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
  }

  .action-item.used {
    opacity: 0.7;
    background: rgba(17, 24, 39, 0.38);
    border-color: rgba(148, 163, 184, 0.32);
  }

  .action-item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
  }

  .action-icon {
    font-size: 1.1rem;
  }

  .economy-state {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    font-size: 0.76rem;
    color: rgba(226, 232, 240, 0.9);
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  .economy-state.movement {
    font-size: 0.72rem;
    color: rgba(203, 213, 225, 0.9);
  }

  .action-item.used .economy-state {
    color: rgba(148, 163, 184, 0.85);
  }

  .economy-note {
    grid-column: 1 / -1;
    font-size: 0.7rem;
    color: rgba(148, 163, 184, 0.85);
    text-align: left;
    margin-top: 0.35rem;
  }

  .conditions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .condition-badge {
    padding: 0.3rem 0.7rem;
    background: rgba(124, 58, 237, 0.15);
    border: 1px solid rgba(167, 139, 250, 0.45);
    border-radius: 999px;
    font-size: 0.75rem;
    color: rgba(221, 214, 254, 0.85);
  }

  .character-details {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.75rem;
  }

  .no-combat {
    padding: 2rem;
    text-align: center;
    color: rgba(236, 248, 243, 0.75);
  }

  .help-text {
    margin: 0 0 0.5rem 0;
    font-size: 0.95rem;
  }

  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(236, 248, 243, 0.6);
  }

  .error-message {
    margin: 0.75rem 1.25rem 1.25rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #fecaca;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.85rem;
  }

  .error-icon {
    font-size: 1.1rem;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
