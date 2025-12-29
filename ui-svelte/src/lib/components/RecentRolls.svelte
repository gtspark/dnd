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
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=IM+Fell+English&family=Courier+Prime:wght@700&display=swap');

  .recent-rolls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: linear-gradient(135deg, rgba(30, 40, 35, 0.5), rgba(20, 30, 25, 0.7));
    border: 2px solid #3d5a4a;
    border-radius: 8px;
    padding: 1.25rem;
    height: 100%;
    box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.4);
    font-family: 'IM Fell English', serif;
  }

  h5 {
    margin: 0 0 0.75rem 0;
    color: #b8956a;
    font-size: 1rem;
    font-weight: 700;
    font-family: 'Cinzel', serif;
    text-transform: uppercase;
    letter-spacing: 1px;
    text-shadow: 0 0 15px rgba(184, 149, 106, 0.3);
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #3d5a4a;
  }

  .empty-rolls {
    text-align: center;
    padding: 2rem;
    color: #7a7870;
    font-size: 0.9rem;
    font-style: italic;
  }

  .rolls-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    flex: 1;
    overflow-y: auto;
  }

  .roll-item {
    background: rgba(100, 180, 120, 0.05);
    border: 1px solid #3d5a4a;
    border-left: 3px solid #3d5a4a;
    padding: 0.65rem 0.85rem;
    border-radius: 6px;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .roll-item:hover {
    background: rgba(100, 180, 120, 0.08);
    border-left-color: #64b478;
  }

  .roll-item.success {
    border-left-color: #64b478;
    background: rgba(100, 180, 120, 0.12);
    box-shadow: 0 0 10px rgba(100, 180, 120, 0.1);
  }

  .roll-item.failure {
    border-left-color: #d46464;
    background: rgba(212, 100, 100, 0.12);
    box-shadow: 0 0 10px rgba(212, 100, 100, 0.1);
  }

  .roll-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .roll-character {
    font-weight: 600;
    color: #e8e4d9;
    font-size: 0.85rem;
    font-family: 'Cinzel', serif;
  }

  .roll-time {
    font-size: 0.7rem;
    color: #7a7870;
  }

  .roll-details {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    margin-bottom: 0.35rem;
  }

  .roll-skill {
    color: #b8956a;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .roll-dc {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    background: rgba(100, 180, 120, 0.15);
    border: 1px solid rgba(100, 180, 120, 0.3);
    border-radius: 4px;
    color: #b8b4a9;
  }

  .roll-result {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
  }

  .roll-total {
    font-family: 'Cinzel', serif;
    font-size: 1.3rem;
    font-weight: 700;
    color: #e8e4d9;
    text-shadow: 0 0 10px rgba(232, 228, 217, 0.2);
  }

  .roll-breakdown {
    font-size: 0.75rem;
    color: #7a7870;
    font-family: 'Courier Prime', monospace;
  }

  .btn-clear {
    width: 100%;
    margin-top: 0.75rem;
    padding: 0.65rem;
    background: rgba(212, 100, 100, 0.15);
    border: 2px solid rgba(212, 100, 100, 0.3);
    border-radius: 6px;
    color: #d46464;
    cursor: pointer;
    font-size: 0.85rem;
    font-family: 'Cinzel', serif;
    font-weight: 600;
    transition: all 0.3s;
  }

  .btn-clear:hover {
    background: rgba(212, 100, 100, 0.25);
    border-color: rgba(212, 100, 100, 0.5);
    box-shadow: 0 0 15px rgba(212, 100, 100, 0.2);
    transform: translateY(-1px);
  }
</style>
