<script>
  import { onMount } from 'svelte';

  export let campaign = 'test-silverpeak';

  let notes = '';
  let saveTimeout = null;
  let lastSaved = null;
  let saving = false;

  onMount(() => {
    loadNotes();
  });

  function loadNotes() {
    const saved = localStorage.getItem(`${campaign}_notes`);
    if (saved) {
      notes = saved;
    }
  }

  function handleInput() {
    saving = true;

    // Clear existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    // Save after 500ms of no typing
    saveTimeout = setTimeout(() => {
      saveNotes();
    }, 500);
  }

  function saveNotes() {
    localStorage.setItem(`${campaign}_notes`, notes);
    lastSaved = new Date();
    saving = false;
  }

  function formatSaveTime() {
    if (!lastSaved) return '';
    const now = new Date();
    const diff = now - lastSaved;

    if (diff < 3000) return 'Saved just now';
    if (diff < 60000) return `Saved ${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `Saved ${Math.floor(diff / 60000)}m ago`;
    return `Saved at ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  // Update the save time display every few seconds
  let saveTimeInterval;
  onMount(() => {
    saveTimeInterval = setInterval(() => {
      // Force re-render by reassigning lastSaved to itself
      if (lastSaved) {
        lastSaved = lastSaved;
      }
    }, 5000);

    return () => {
      clearInterval(saveTimeInterval);
      if (saveTimeout) clearTimeout(saveTimeout);
    };
  });
</script>

<div class="campaign-notes">
  <div class="notes-header">
    <h5>Campaign Notes</h5>
    <span class="save-status" class:saving>
      {#if saving}
        Saving...
      {:else if lastSaved}
        {formatSaveTime()}
      {/if}
    </span>
  </div>

  <textarea
    bind:value={notes}
    on:input={handleInput}
    placeholder="Keep track of important details, NPCs, locations, theories..."
  ></textarea>
</div>

<style>
  .campaign-notes {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    padding: 1rem;
    height: 100%;
  }

  .notes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  h5 {
    margin: 0;
    color: #fbbf24;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .save-status {
    font-size: 0.7rem;
    color: #10b981;
    font-style: italic;
  }

  .save-status.saving {
    color: #fbbf24;
  }

  textarea {
    width: 100%;
    flex: 1;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #eee;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 0.85rem;
    line-height: 1.5;
    resize: none;
    transition: border-color 0.2s;
  }

  textarea:focus {
    outline: none;
    border-color: rgba(251, 191, 36, 0.4);
  }

  textarea::placeholder {
    color: #666;
    font-style: italic;
  }
</style>
