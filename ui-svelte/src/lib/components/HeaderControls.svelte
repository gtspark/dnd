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
    gap: 0.75rem;
    margin-left: auto;
    padding-right: 0;
  }

  .btn-icon {
    background: linear-gradient(135deg, rgba(30, 40, 35, 0.6), rgba(20, 30, 25, 0.8));
    border: 2px solid #3d5a4a;
    border-radius: 6px;
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }

  .btn-icon::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(100, 180, 120, 0.1), transparent);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .btn-icon:hover {
    background: linear-gradient(135deg, rgba(40, 50, 45, 0.7), rgba(30, 40, 35, 0.9));
    border-color: #64b478;
    transform: translateY(-2px);
    box-shadow: 0 0 25px rgba(100, 180, 120, 0.3);
  }

  .btn-icon:hover::before {
    opacity: 1;
  }

  .btn-icon:active {
    transform: translateY(0);
  }
</style>
