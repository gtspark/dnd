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
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveNotes(), 500);
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

  let saveTimeInterval;
  onMount(() => {
    saveTimeInterval = setInterval(() => { if (lastSaved) lastSaved = lastSaved; }, 5000);
    return () => {
      clearInterval(saveTimeInterval);
      if (saveTimeout) clearTimeout(saveTimeout);
    };
  });
</script>

<div class="grimoire-notes">
  <div class="notes-header">
    <h5><span class="icon">📜</span> Chronicle</h5>
    <span class="save-rune" class:saving>
      {#if saving}✍️ Inscribing...{:else if lastSaved}✓ {formatSaveTime()}{/if}
    </span>
  </div>
  <textarea
    bind:value={notes}
    on:input={handleInput}
    placeholder="Record your tales of adventure, encounters with mysterious figures, discoveries of ancient lore..."
  ></textarea>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=IM+Fell+English&display=swap');

  .grimoire-notes {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: linear-gradient(135deg, rgba(30, 40, 35, 0.5), rgba(20, 30, 25, 0.7));
    border: 2px solid #3d5a4a;
    border-radius: 8px;
    padding: 1.25rem;
    height: 100%;
    box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.4);
  }

  .notes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #3d5a4a;
  }

  h5 {
    margin: 0;
    color: #b8956a;
    font-size: 1rem;
    font-weight: 700;
    font-family: 'Cinzel', serif;
    text-transform: uppercase;
    letter-spacing: 1px;
    text-shadow: 0 0 15px rgba(184, 149, 106, 0.3);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .icon {
    font-size: 1rem;
    filter: drop-shadow(0 0 10px rgba(184, 149, 106, 0.3));
  }

  .save-rune {
    font-size: 0.75rem;
    color: #64b478;
    font-style: italic;
    font-family: 'IM Fell English', serif;
  }

  .save-rune.saving {
    color: #b8956a;
  }

  textarea {
    width: 100%;
    flex: 1;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid #3d5a4a;
    border-radius: 6px;
    color: #e8e4d9;
    font-family: 'IM Fell English', serif;
    font-size: 0.95rem;
    line-height: 1.7;
    resize: none;
    transition: all 0.3s;
  }

  textarea:focus {
    outline: none;
    border-color: #64b478;
    box-shadow: 0 0 20px rgba(100, 180, 120, 0.15);
    background: rgba(0, 0, 0, 0.4);
  }

  textarea::placeholder {
    color: #7a7870;
    font-style: italic;
  }
</style>
