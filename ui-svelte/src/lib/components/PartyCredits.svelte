<script>
  import { onMount } from 'svelte';

  export let campaign = 'test-silverpeak';

  let characters = [];
  let totalCredits = 0;
  let synced = true;
  let loading = true;

  onMount(async () => {
    await loadCredits();

    // Poll for updates every 5 seconds
    const interval = setInterval(loadCredits, 5000);

    return () => clearInterval(interval);
  });

  async function loadCredits() {
    try {
      const response = await fetch(`/dnd-api/dnd/state?campaign=${campaign}`);
      if (!response.ok) throw new Error('Failed to load credits');

      const data = await response.json();

      characters = Object.entries(data.characters || {}).map(([id, char]) => ({
        id,
        name: char.name,
        credits: char.credits || 0
      }));

      totalCredits = characters.reduce((sum, char) => sum + char.credits, 0);
      synced = true;
      loading = false;
    } catch (e) {
      console.error('Error loading credits:', e);
      synced = false;
      loading = false;
    }
  }

  function formatCredits(amount) {
    return amount.toLocaleString();
  }
</script>

<div class="party-credits">
  <h5>Gold Pieces</h5>

  {#if loading}
    <div class="loading">Loading...</div>
  {:else}
    <div class="credits-display">
      <div class="total-credits">
        <span class="credits-label">Total Fund:</span>
        <span class="credits-amount">{formatCredits(totalCredits)} GP</span>
      </div>

      <div class="individual-credits">
        {#each characters as char}
          <div class="character-credits">
            <span class="char-name">{char.name}:</span>
            <span class="credits-amount">{formatCredits(char.credits)} GP</span>
          </div>
        {/each}
      </div>

      <div class="sync-status {synced ? 'synced' : 'unsynced'}">
        <span class="sync-indicator">●</span>
        <span class="sync-text">{synced ? 'Synced' : 'Syncing...'}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .party-credits {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    padding: 1rem;
  }

  h5 {
    margin: 0 0 0.5rem 0;
    color: #fbbf24;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .loading {
    text-align: center;
    padding: 1.5rem;
    color: #888;
    font-size: 0.85rem;
    font-style: italic;
  }

  .credits-display {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .total-credits {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: rgba(251, 191, 36, 0.1);
    border: 1px solid rgba(251, 191, 36, 0.3);
    border-radius: 6px;
  }

  .credits-label {
    font-size: 0.85rem;
    color: #fbbf24;
    font-weight: 600;
  }

  .credits-amount {
    font-size: 1rem;
    font-weight: 700;
    color: #fbbf24;
  }

  .individual-credits {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .character-credits {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .char-name {
    color: #eee;
    font-weight: 500;
  }

  .character-credits .credits-amount {
    color: #d4af37;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .sync-status {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.75rem;
  }

  .sync-indicator {
    font-size: 0.6rem;
  }

  .synced .sync-indicator {
    color: #10b981;
  }

  .unsynced .sync-indicator {
    color: #f59e0b;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .sync-text {
    color: #999;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
</style>
