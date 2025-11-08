<script>
  import { onMount } from 'svelte';

  export let campaign = 'test-silverpeak';

  let rolls = [];

  // Listen for roll events from the game
  onMount(() => {
    // Load existing rolls from localStorage
    loadRolls();

    // Listen for new rolls
    window.addEventListener('rollMade', handleNewRoll);

    return () => {
      window.removeEventListener('rollMade', handleNewRoll);
    };
  });

  function loadRolls() {
    const savedRolls = localStorage.getItem(`${campaign}_recentRolls`);
    if (savedRolls) {
      try {
        rolls = JSON.parse(savedRolls);
      } catch (e) {
        console.error('Error loading rolls:', e);
        rolls = [];
      }
    }
  }

  function handleNewRoll(event) {
    const rollData = event.detail;
    rolls = [rollData, ...rolls].slice(0, 10); // Keep last 10 rolls
    localStorage.setItem(`${campaign}_recentRolls`, JSON.stringify(rolls));
  }

  function clearRolls() {
    rolls = [];
    localStorage.removeItem(`${campaign}_recentRolls`);
  }

  function getRollColor(roll) {
    if (!roll.dc) return '';
    if (roll.total >= roll.dc) return 'success';
    return 'failure';
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="recent-rolls">
  <h5>Recent Rolls</h5>

  {#if rolls.length === 0}
    <div class="empty-rolls">No recent rolls</div>
  {:else}
    <div class="rolls-list">
      {#each rolls as roll}
        <div class="roll-item {getRollColor(roll)}">
          <div class="roll-header">
            <span class="roll-character">{roll.character || 'Unknown'}</span>
            <span class="roll-time">{formatTime(roll.timestamp)}</span>
          </div>
          <div class="roll-details">
            <span class="roll-skill">{roll.skill || 'Roll'}</span>
            {#if roll.dc}
              <span class="roll-dc">DC {roll.dc}</span>
            {/if}
          </div>
          <div class="roll-result">
            <span class="roll-total">{roll.total}</span>
            {#if roll.modifier}
              <span class="roll-breakdown">
                ({roll.dice || 'd20'}: {roll.diceRoll}{roll.modifier >= 0 ? '+' : ''}{roll.modifier})
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <button class="btn-clear" on:click={clearRolls}>Clear History</button>
</div>

<style>
  .recent-rolls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    padding: 1rem;
    height: 100%;
  }

  h5 {
    margin: 0 0 0.5rem 0;
    color: #fbbf24;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .empty-rolls {
    text-align: center;
    padding: 1.5rem;
    color: #666;
    font-size: 0.85rem;
    font-style: italic;
  }

  .rolls-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
    overflow-y: auto;
  }

  .roll-item {
    background: rgba(255, 255, 255, 0.05);
    border-left: 3px solid rgba(255, 255, 255, 0.2);
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .roll-item.success {
    border-left-color: #10b981;
    background: rgba(16, 185, 129, 0.1);
  }

  .roll-item.failure {
    border-left-color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .roll-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .roll-character {
    font-weight: 600;
    color: #eee;
    font-size: 0.8rem;
  }

  .roll-time {
    font-size: 0.7rem;
    color: #888;
  }

  .roll-details {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .roll-skill {
    color: #fbbf24;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .roll-dc {
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    color: #aaa;
  }

  .roll-result {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }

  .roll-total {
    font-size: 1.1rem;
    font-weight: 700;
    color: #fff;
  }

  .roll-breakdown {
    font-size: 0.7rem;
    color: #999;
  }

  .btn-clear {
    width: 100%;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 4px;
    color: #fca5a5;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
  }

  .btn-clear:hover {
    background: rgba(239, 68, 68, 0.3);
    border-color: rgba(239, 68, 68, 0.6);
  }
</style>
