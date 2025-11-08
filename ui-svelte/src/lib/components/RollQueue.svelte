<script>
  import { onMount, onDestroy } from 'svelte';
  import { derived, writable } from 'svelte/store';
  import {
    rollQueueStore,
    stagedResultsStore,
    setRollQueue,
    stageResultForInjection,
    stagedMapStore
  } from '../../stores/rollQueueStore.js';

  export let campaign = 'test-silverpeak';

  const lastUpdatedStore = writable(null);

  let submittingMap = {};
  let errorMessage = null;
  let focusedQueueId = null;
  let __outcome = null;

  const pendingEntries = derived(rollQueueStore, ($queue) =>
    $queue.filter((entry) => entry.status === 'pending' || entry.status === 'partial')
  );

  const resolvedEntries = derived(rollQueueStore, ($queue) =>
    $queue.filter((entry) => entry.status === 'complete' || entry.status === 'cancelled')
  );

  const showDamageReminder = derived([pendingEntries, resolvedEntries], ([$pending, $resolved]) => {
    const entries = [...$pending, ...$resolved];
    return entries.some((entry) => {
      const reason = (entry?.reason || '').toLowerCase();
      const metadataDescription = (entry?.metadata?.description || '').toLowerCase();
      const action = entry?.metadata?.combatAction;
      const awaitingDamage = action?.kind === 'attack' && action?.awaitingDamage;
      return awaitingDamage || /damage|hp|wound/.test(reason) || /damage|hp|wound/.test(metadataDescription);
    });
  });

  function handleRollQueueUpdate(event) {
    const { rollQueue = [], updatedAt } = event.detail || {};
    setRollQueue(rollQueue);
    lastUpdatedStore.set(updatedAt || new Date().toISOString());
  }

  function setSubmitting(key, value) {
    submittingMap = { ...submittingMap, [key]: value };
  }

  function getAbilityModifier(participant, entry) {
    const abilityKey = (participant?.ability || entry?.ability || '').toLowerCase();
    if (!abilityKey) return 0;

    const game = window.game;
    const characters = game?.config?.characters || [];

    const matches = [];
    const participantId = participant?.participantId || participant?.id;
    const normalizedName = participant?.name?.toLowerCase();

    if (participantId) {
      const found = characters.find((char) => char.id === participantId);
      if (found) matches.push(found);
    }

    if (!matches.length && normalizedName) {
      const exact = characters.find((char) => char.name?.toLowerCase() === normalizedName);
      if (exact) matches.push(exact);
    }

    if (!matches.length && normalizedName) {
      const firstToken = normalizedName.split(/\s+/)[0];
      const partial = characters.find((char) => char.name?.toLowerCase().startsWith(firstToken));
      if (partial) matches.push(partial);
    }

    const candidate = matches[0];
    const score = candidate?.abilities?.[abilityKey];
    if (!Number.isFinite(score)) return 0;
    return Math.floor((score - 10) / 2);
  }

  function formatModifier(mod) {
    if (!Number.isFinite(mod)) return '+0';
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }

  function getCombatAction(entry) {
    return entry?.metadata?.combatAction || null;
  }

  function getCurrentStep(entry) {
    const action = getCombatAction(entry);
    if (!action || !Array.isArray(action.steps)) {
      return null;
    }
    const index = Number.isInteger(action.currentStepIndex) ? action.currentStepIndex : 0;
    return action.steps[index] || null;
  }

  function isDamageStep(step) {
    return step && step.type === 'damage';
  }

  function getDamageFormula(step, action) {
    if (!step) return null;
    if (action?.outcome?.crit && step.critFormula) {
      return step.critFormula;
    }
    return step.formula || action?.damage?.formula || null;
  }

  function getAutoRollLabel(entry) {
    const step = getCurrentStep(entry);
    if (isDamageStep(step)) {
      return 'Roll Damage';
    }
    return 'Auto Roll (d20)';
  }

  function getManualRollLabel(entry) {
    const step = getCurrentStep(entry);
    if (isDamageStep(step)) {
      return 'Log Damage Result';
    }
    return 'Log Manual Result';
  }

  function rollDiceFromFormula(formula) {
    if (!formula || typeof formula !== 'string') {
      return null;
    }
    const cleaned = formula.replace(/\s+/g, '');
    const dicePattern = /(\d+)d(\d+)/gi;
    let total = 0;
    const rolls = [];
    let match;
    let hasDice = false;
    while ((match = dicePattern.exec(cleaned)) !== null) {
      hasDice = true;
      const count = Number.parseInt(match[1], 10);
      const sides = Number.parseInt(match[2], 10);
      if (!Number.isFinite(count) || !Number.isFinite(sides) || count <= 0 || sides <= 0) {
        continue;
      }
      for (let i = 0; i < count; i += 1) {
        const value = Math.floor(Math.random() * sides) + 1;
        rolls.push(value);
        total += value;
      }
    }
    const remainder = cleaned.replace(dicePattern, '');
    const modifierPattern = /([+\-]\d+)/g;
    let modifier = 0;
    let modMatch;
    while ((modMatch = modifierPattern.exec(remainder)) !== null) {
      const value = Number.parseInt(modMatch[1], 10);
      if (Number.isFinite(value)) {
        modifier += value;
      }
    }
    total += modifier;
    if (!hasDice && modifier !== 0) {
      rolls.push(modifier);
    }
    if (!hasDice && rolls.length === 0) {
      return null;
    }
    return {
      total,
      rolls,
      modifier,
      notation: cleaned
    };
  }

  async function autoRoll(entry, participant) {
    if (participant?.entityType !== 'player') {
      console.warn('Auto roll is only available for player-controlled participants.');
      return;
    }
    const key = `${entry.queueId}:${participant.participantId || participant.id || participant.name}`;
    if (submittingMap[key]) return;

    try {
      setSubmitting(key, true);
      errorMessage = null;

      const currentStep = getCurrentStep(entry);
      const combatAction = getCombatAction(entry);

      if (isDamageStep(currentStep)) {
        const formula = getDamageFormula(currentStep, combatAction) || '1d6';
        const rollDetails = rollDiceFromFormula(formula);
        if (!rollDetails) {
          throw new Error('Unable to parse damage formula.');
        }

        const payload = {
          total: rollDetails.total,
          natural: rollDetails.total,
          modifier: rollDetails.modifier,
          notation: rollDetails.notation || formula,
          rolls: rollDetails.rolls,
          auto: true,
          submittedBy: 'auto-roll',
          advantage: 'normal',
          notes: `Auto damage roll (${formula})`,
          metadata: {
            ability: participant.ability || entry.ability || null,
            formula,
            source: 'ui-auto-roll',
            step: 'damage'
          }
        };

        await window.game.submitRollResult(entry.queueId, participant.participantId || participant.id || participant.name, payload);
        return;
      }

      const abilityMod = getAbilityModifier(participant, entry);
      const advantageState = participant.advantage || entry.advantage || 'normal';

      const rolls = [];
      rolls.push(Math.floor(Math.random() * 20) + 1);
      if (advantageState === 'advantage' || advantageState === 'disadvantage') {
        rolls.push(Math.floor(Math.random() * 20) + 1);
      }

      let natural = rolls[0];
      if (advantageState === 'advantage') {
        natural = Math.max(...rolls);
      } else if (advantageState === 'disadvantage') {
        natural = Math.min(...rolls);
      }
      const total = natural + abilityMod;

      const payload = {
        total,
        natural,
        modifier: abilityMod,
        notation: `1d20${formatModifier(abilityMod)}`,
        rolls,
        auto: true,
        submittedBy: 'auto-roll',
        advantage: advantageState,
        notes: `Auto-roll via UI (${advantageState})`,
        metadata: {
          ability: participant.ability || entry.ability || null,
          advantage: advantageState,
          source: 'ui-auto-roll',
          step: 'attack'
        }
      };

      await window.game.submitRollResult(entry.queueId, participant.participantId || participant.id || participant.name, payload);
    } catch (error) {
      console.error('Auto roll failed:', error);
      errorMessage = 'Auto roll failed. Please try again or enter the result manually.';
    } finally {
      setSubmitting(key, false);
    }
  }

  async function recordManualResult(entry, participant) {
    const currentStep = getCurrentStep(entry);
    const combatAction = getCombatAction(entry);
    const promptLabel = isDamageStep(currentStep)
      ? `Enter total damage for ${participant.name}`
      : `Enter total roll result for ${participant.name}`;
    const input = window.prompt(promptLabel, '');
    if (input === null) {
      return;
    }
    const total = Number(input);
    if (!Number.isFinite(total)) {
      window.alert('Please enter a numeric result.');
      return;
    }

    const payload = {
      total,
      natural: total,
      modifier: 0,
      notation: isDamageStep(currentStep) ? getDamageFormula(currentStep, combatAction) || 'manual' : 'manual',
      auto: false,
      submittedBy: 'manual-entry',
      notes: isDamageStep(currentStep) ? 'Manual damage entry via UI' : 'Manual result entry via UI',
      metadata: {
        ability: participant.ability || entry.ability || null,
        source: 'ui-manual-entry',
        step: isDamageStep(currentStep) ? 'damage' : 'attack',
        formula: isDamageStep(currentStep) ? getDamageFormula(currentStep, combatAction) || null : null
      }
    };

    try {
      const key = `${entry.queueId}:${participant.participantId || participant.id || participant.name}`;
      setSubmitting(key, true);
      await window.game.submitRollResult(entry.queueId, participant.participantId || participant.id || participant.name, payload);
      errorMessage = null;
    } catch (error) {
      console.error('Manual roll submission failed:', error);
      errorMessage = 'Failed to submit manual result.';
    } finally {
      const key = `${entry.queueId}:${participant.participantId || participant.id || participant.name}`;
      setSubmitting(key, false);
    }
  }

  function statusIcon(participant) {
    switch (participant.status) {
      case 'rolled':
        return '✅';
      case 'auto':
        return '🤖';
      case 'override':
        return '✳️';
      case 'cancelled':
        return '⛔';
      default:
        return '⏳';
    }
  }

  function participantKey(entry, participant) {
    return `${entry.queueId}:${participant.participantId || participant.id || participant.name}`;
  }

  function queueForInjection(entry, participant) {
    const response = stageResultForInjection(entry, participant);
    if (!response.staged && response.reason) {
      errorMessage = response.reason;
    } else {
      errorMessage = null;
    }
  }

  function focusEntry(queueId) {
    focusedQueueId = queueId;
    setTimeout(() => {
      if (focusedQueueId === queueId) {
        focusedQueueId = null;
      }
    }, 4000);
  }

  function getAttackOutcome(entry) {
    const action = entry?.metadata?.combatAction;
    if (!action || action.kind !== 'attack') {
      return null;
    }
    return action.outcome || null;
  }

  let focusHandler;

  onMount(() => {
    window.addEventListener('rollQueueUpdate', handleRollQueueUpdate);
    focusHandler = (event) => {
      focusEntry(event.detail?.queueId);
    };
    window.addEventListener('rollQueueFocus', focusHandler);

    if (window.game?.rollQueue) {
      setRollQueue(window.game.rollQueue);
      lastUpdatedStore.set(new Date().toISOString());
    } else {
      window.game?.refreshRollQueue?.(true);
    }
  });

  onDestroy(() => {
    window.removeEventListener('rollQueueUpdate', handleRollQueueUpdate);
    if (focusHandler) {
      window.removeEventListener('rollQueueFocus', focusHandler);
    }
  });
</script>

<div class="roll-queue-panel" role="region" aria-label="Roll Queue">
  <div class="panel-header">
    <h3>🎲 Pending Rolls</h3>
    {#if $lastUpdatedStore}
      <span class="timestamp">Updated {$lastUpdatedStore}</span>
    {/if}
  </div>

  {#if errorMessage}
    <div class="error-banner">{errorMessage}</div>
  {/if}

  {#if $showDamageReminder}
    <div class="info-banner">
      📘 Damage rolls still require manual HP updates in chat—adjust the tracker once the DM confirms the outcome.
    </div>
  {/if}

  {#if $stagedResultsStore.length}
    <div class="staged-banner">
      <span>📥 Queued results ready to append:</span>
      <ul>
        {#each $stagedResultsStore as staged}
          <li>{staged.text}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if $pendingEntries.length === 0}
    <p class="empty-state">No pending roll requests. Enjoy the calm!</p>
  {:else}
    <div class="queue-list">
      {#each $pendingEntries as entry (entry.queueId)}
        <article class="queue-entry" class:focused={focusedQueueId === entry.queueId}>
          <header>
            <div class="entry-title">
              <span class="entry-icon">🌀</span>
              <div>
                <h4>{entry.reason}</h4>
                <div class="meta">
                  {#if entry.ability}
                    <span class="meta-pill">Ability: {entry.ability.toUpperCase()}</span>
                  {/if}
                  {#if entry.dc}
                    <span class="meta-pill">DC {entry.dc}</span>
                  {/if}
                  <span class="meta-pill status">{entry.status}</span>
                </div>
              </div>
            </div>
            <button
              class="refresh-button"
              title="Refresh roll queue"
              on:click={() => window.game?.refreshRollQueue?.(true)}
            >
              ⟳
            </button>
          </header>

          {#if entry.metadata?.combatAction}
            <div class="combat-action">
              {#if entry.metadata.combatAction.kind === 'attack'}
                <div class="combat-row">
                  <span class="label">Attacker</span>
                  <span>{entry.metadata.combatAction.attacker?.name ?? 'Unknown'}</span>
                </div>
                <div class="combat-row">
                  <span class="label">Attack</span>
                  <span>{entry.metadata.combatAction.attackName ?? 'Attack'} ({entry.metadata.combatAction.attackType})</span>
                </div>
                <div class="combat-row">
                  <span class="label">Attack Bonus</span>
                  <span>{Number.isFinite(entry.metadata.combatAction.attackBonus) ? `+${entry.metadata.combatAction.attackBonus}` : '—'}</span>
                </div>
                <div class="combat-row">
                  <span class="label">Target AC</span>
                  <span>{Number.isFinite(entry.metadata.combatAction.targetAC) ? entry.metadata.combatAction.targetAC : 'Unknown'}</span>
                </div>
                {#if entry.metadata.combatAction.damage?.formula}
                  <div class="combat-row">
                    <span class="label">Damage</span>
                    <span>{entry.metadata.combatAction.damage.formula}{entry.metadata.combatAction.damage.type ? ` (${entry.metadata.combatAction.damage.type})` : ''}</span>
                  </div>
                {/if}
              {:else if entry.metadata.combatAction.kind === 'saving-throw'}
                <div class="combat-row">
                  <span class="label">Save</span>
                  <span>{entry.metadata.combatAction.ability?.toUpperCase() ?? 'Save'}</span>
                </div>
                <div class="combat-row">
                  <span class="label">DC</span>
                  <span>{Number.isFinite(entry.metadata.combatAction.dc) ? entry.metadata.combatAction.dc : 'Unknown'}</span>
                </div>
              {/if}
              {#if entry.metadata.combatAction.steps}
                <div class="combat-steps">
                  {#each entry.metadata.combatAction.steps as step, idx}
                    <span
                      class:active={idx === (entry.metadata.combatAction.currentStepIndex ?? 0)}
                      class:complete={step.status === 'complete'}
                      class:skipped={step.status === 'skipped'}>
                      {step.type === 'attack' ? 'Attack' : step.type === 'damage' ? 'Damage' : step.type}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <ul class="participant-list">
            {#each entry.participants as participant (participant.participantId)}
              <li class:completed={participant.status !== 'pending' && participant.status !== 'partial'}>
                <div class="participant-info">
                  <span class="participant-icon">{statusIcon(participant)}</span>
                  <div>
                    <div class="participant-name">{participant.name}</div>
                    <div class="participant-meta">
                      {participant.entityType === 'enemy' ? 'DM-controlled' : 'Player'}
                      {#if participant.advantage && participant.advantage !== 'normal'}
                        · {participant.advantage}
                      {/if}
                      {#if getCurrentStep(entry)?.type === 'damage' && getCurrentStep(entry)?.status !== 'complete'}
                        · Damage
                      {/if}
                      {#if participant.result}
                        · Total {participant.result.total}
                      {/if}
                    </div>
                  </div>
                </div>

                {#if participant.status === 'pending'}
                  {#if participant.entityType === 'player'}
                    <div class="participant-actions">
                      <button
                        class="action-button primary"
                        disabled={submittingMap[participantKey(entry, participant)]}
                        on:click={() => autoRoll(entry, participant)}
                      >
                        {submittingMap[participantKey(entry, participant)] ? 'Rolling…' : getAutoRollLabel(entry)}
                      </button>
                      <button
                        class="action-button"
                        disabled={submittingMap[participantKey(entry, participant)]}
                        on:click={() => recordManualResult(entry, participant)}
                      >
                        {getManualRollLabel(entry)}
                      </button>
                    </div>
                  {:else}
                    <div class="participant-note">
                      Awaiting DM-controlled roll.
                    </div>
                  {/if}
                {:else if participant.result}
                  <div class="result-action">
                    <div class="result-summary">
                      <span>Total: {participant.result.total}</span>
                      {#if Number.isFinite(participant.result.modifier) && participant.result.modifier !== 0}
                        <span>({formatModifier(participant.result.modifier)})</span>
                      {/if}
                      {#if participant.result.auto}
                        <span class="result-badge">Auto</span>
                      {/if}
                      {#if (__outcome = getAttackOutcome(entry))}
                        <span class={`result-tag ${__outcome.crit ? 'crit' : __outcome.fumble ? 'fumble' : __outcome.hit === true ? 'hit' : __outcome.hit === false ? 'miss' : ''}`}>
                          {#if __outcome.crit}
                            Crit
                          {:else if __outcome.fumble}
                            Fumble
                          {:else if __outcome.hit === true}
                            Hit
                          {:else if __outcome.hit === false}
                            Miss
                          {:else}
                            Resolved
                          {/if}
                        </span>
                      {/if}
                    </div>
                    {#if !$stagedMapStore[participantKey(entry, participant)]}
                      <button class="action-button secondary" on:click={() => queueForInjection(entry, participant)}>
                        Queue for next prompt
                      </button>
                    {:else}
                      <span class="queued-pill">📥 Queued</span>
                    {/if}
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        </article>
      {/each}
    </div>
  {/if}

  {#if $resolvedEntries.length > 0}
    <details class="resolved-section">
      <summary>Resolved Entries ({$resolvedEntries.length})</summary>
      <ul>
        {#each $resolvedEntries as entry (entry.queueId)}
          <li>
            <span>{entry.reason}</span>
            <span class="resolved-status">{entry.status}</span>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</div>

<style>
  .roll-queue-panel {
    margin-top: 1.5rem;
    background: rgba(15, 15, 30, 0.85);
    border: 1px solid rgba(251, 191, 36, 0.25);
    border-radius: 12px;
    padding: 1rem 1.25rem;
    color: #eaeaea;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #fbbf24;
  }

  .timestamp {
    font-size: 0.75rem;
    color: rgba(234, 234, 234, 0.65);
  }

  
  .staged-banner {
    background: rgba(52, 211, 153, 0.15);
    border: 1px solid rgba(52, 211, 153, 0.35);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
  }

  .staged-banner ul {
    margin: 0.35rem 0 0;
    padding-left: 1.1rem;
  }

  .staged-banner li {
    font-size: 0.8rem;
    color: rgba(234, 234, 234, 0.85);
  }

.error-banner {
    background: rgba(220, 38, 38, 0.2);
    border: 1px solid rgba(248, 113, 113, 0.6);
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    font-size: 0.85rem;
    margin-bottom: 0.75rem;
  }

  .info-banner {
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.35);
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    font-size: 0.85rem;
    margin-bottom: 0.75rem;
    color: #bfdbfe;
  }

  .empty-state {
    margin: 0.5rem 0 0;
    font-size: 0.9rem;
    color: rgba(234, 234, 234, 0.7);
  }

  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

.queue-entry {
    background: rgba(251, 191, 36, 0.05);
    border: 1px solid rgba(251, 191, 36, 0.2);
    border-radius: 10px;
    padding: 0.75rem;
  }

  
  .queue-entry.focused {
    border-color: rgba(63, 81, 181, 0.6);
    box-shadow: 0 0 18px rgba(63, 81, 181, 0.25);
  }

  .combat-action {
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
    display: grid;
    gap: 0.35rem;
  }

  .combat-row {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .combat-row .label {
    font-weight: 600;
    color: rgba(191, 219, 254, 0.85);
  }

  .combat-steps {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.35rem;
  }

  .combat-steps span {
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    font-size: 0.7rem;
    text-transform: uppercase;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.35);
    color: rgba(191, 219, 254, 0.9);
  }

  .combat-steps span.active {
    background: rgba(251, 191, 36, 0.25);
    border-color: rgba(251, 191, 36, 0.45);
    color: #fde68a;
  }

  .combat-steps span.complete {
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.4);
    color: #bbf7d0;
  }

  .combat-steps span.skipped {
    opacity: 0.5;
  }

.queue-entry header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .entry-title {
    display: flex;
    gap: 0.75rem;
  }

  .entry-title h4 {
    margin: 0 0 0.2rem 0;
    font-size: 1rem;
    color: #fcd34d;
  }

  .entry-icon {
    font-size: 1.5rem;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .meta-pill {
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.25);
    border-radius: 999px;
    padding: 0.15rem 0.5rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .meta-pill.status {
    background: rgba(34, 197, 94, 0.12);
    border-color: rgba(34, 197, 94, 0.35);
  }

  .refresh-button {
    border: none;
    background: rgba(251, 191, 36, 0.12);
    color: #fbbf24;
    border-radius: 6px;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .refresh-button:hover {
    background: rgba(251, 191, 36, 0.2);
  }

  .participant-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  
  .result-action {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .queued-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.6rem;
    background: rgba(63, 81, 181, 0.25);
    border-radius: 999px;
    font-size: 0.75rem;
    color: #c7d2fe;
  }

.participant-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.6rem;
    border-radius: 8px;
    background: rgba(15, 15, 30, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.25);
  }

  .participant-list li.completed {
    background: rgba(15, 30, 15, 0.75);
    border-color: rgba(74, 222, 128, 0.3);
  }

  .participant-info {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .participant-icon {
    font-size: 1.25rem;
  }

  .participant-name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .participant-meta {
    font-size: 0.75rem;
    color: rgba(234, 234, 234, 0.65);
  }

  .participant-actions {
    display: flex;
    gap: 0.5rem;
  }

  .participant-note {
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.9);
  }

  .action-button {
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(255, 255, 255, 0.05);
    color: #f3f4f6;
    padding: 0.35rem 0.65rem;
    border-radius: 6px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .action-button.primary {
    border-color: rgba(251, 191, 36, 0.45);
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }

  .action-button:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .result-summary {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    font-size: 0.8rem;
    color: rgba(234, 234, 234, 0.75);
    flex-wrap: wrap;
  }

  .result-badge {
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.35);
    border-radius: 999px;
    padding: 0.1rem 0.4rem;
    font-size: 0.7rem;
    text-transform: uppercase;
  }

  .result-tag {
    background: rgba(59, 130, 246, 0.18);
    border: 1px solid rgba(59, 130, 246, 0.4);
    border-radius: 999px;
    padding: 0.1rem 0.45rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .result-tag.hit {
    background: rgba(34, 197, 94, 0.18);
    border-color: rgba(34, 197, 94, 0.45);
    color: #bbf7d0;
  }

  .result-tag.miss {
    background: rgba(239, 68, 68, 0.18);
    border-color: rgba(239, 68, 68, 0.4);
    color: #fecaca;
  }

  .result-tag.crit {
    background: rgba(234, 179, 8, 0.2);
    border-color: rgba(234, 179, 8, 0.45);
    color: #facc15;
  }

  .result-tag.fumble {
    background: rgba(148, 163, 184, 0.2);
    border-color: rgba(148, 163, 184, 0.45);
    color: #cbd5f5;
  }

  .resolved-section {
    margin-top: 1rem;
  }

  .resolved-section summary {
    cursor: pointer;
    color: rgba(234, 234, 234, 0.85);
  }

  .resolved-section ul {
    list-style: none;
    padding: 0.5rem 0 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .resolved-section li {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: rgba(234, 234, 234, 0.7);
  }

  .resolved-status {
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
  }
</style>
