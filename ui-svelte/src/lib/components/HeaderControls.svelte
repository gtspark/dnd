<script>
  import { onMount } from 'svelte';
  import AIProviderSettings from './AIProviderSettings.svelte';
  import HelpModal from './HelpModal.svelte';

  export let campaign = 'test-silverpeak';

  let showAISettings = false;
  let showHelp = false;

  function handleSettings() {
    showAISettings = true;
  }

  function handleHelp() {
    showHelp = true;
  }

  function handleExit() {
    // Navigate back to campaign selection
    window.location.href = '/dnd';
  }
</script>

<div class="header-controls">
  <button
    class="btn-icon"
    title="AI Settings"
    on:click={handleSettings}
  >
    ⚙️
  </button>

  <button
    class="btn-icon"
    title="Help"
    on:click={handleHelp}
  >
    ❓
  </button>

  <button
    class="btn-icon"
    title="Exit to Campaign Selection"
    on:click={handleExit}
  >
    🚪
  </button>
</div>

{#if showAISettings}
  <AIProviderSettings
    {campaign}
    onClose={() => showAISettings = false}
  />
{/if}

{#if showHelp}
  <HelpModal
    onClose={() => showHelp = false}
  />
{/if}

<style>
  .header-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
    padding-right: 0;
  }

  .btn-icon {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    cursor: pointer;
    transition: all 0.3s;
  }

  .btn-icon:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: var(--accent-primary, #2ecc71);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(46, 204, 113, 0.3);
  }

  .btn-icon:active {
    transform: translateY(0);
  }
</style>
