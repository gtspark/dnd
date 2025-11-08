<script>
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  export let campaign = 'test-silverpeak';
  export let onClose = () => {};

  let providers = {
    claude: {
      name: 'Claude (Sonnet 4.5)',
      description: 'Excellent narrative, character consistency, creative storytelling',
      available: true
    },
    deepseek: {
      name: 'DeepSeek (Chat)',
      description: 'Excellent reasoning, logical problem-solving, cost-effective',
      available: false
    },
    gpt4: {
      name: 'GPT-4 (Turbo)',
      description: 'Balanced approach, consistent responses, steady pacing',
      available: false
    }
  };

  let currentProvider = 'claude';
  let loading = true;
  let saving = false;

  onMount(async () => {
    await loadProviderStatus();
  });

  async function loadProviderStatus() {
    loading = true;
    try {
      const response = await fetch(`/dnd-api/dnd/ai-provider?campaign=${campaign}`);
      const data = await response.json();

      currentProvider = data.current;

      // Update availability status
      if (data.capabilities) {
        Object.entries(data.capabilities).forEach(([provider, info]) => {
          if (providers[provider]) {
            providers[provider].available = info.available;
          }
        });
      }
    } catch (error) {
      console.error('Failed to load AI provider status:', error);
    } finally {
      loading = false;
    }
  }

  async function saveProvider() {
    saving = true;
    try {
      const response = await fetch('/dnd-api/dnd/ai-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: currentProvider,
          campaign: campaign
        })
      });

      const result = await response.json();

      if (result.success) {
        // Show success message
        window.dispatchEvent(new CustomEvent('newGameMessage', {
          detail: {
            role: 'assistant',
            content: `🔄 Switched AI DM to: ${result.provider.toUpperCase()}`,
            mode: 'ooc',
            timestamp: new Date().toISOString()
          }
        }));
        onClose();
      } else {
        console.error('Failed to switch provider:', result.error);
      }
    } catch (error) {
      console.error('Error switching AI provider:', error);
    } finally {
      saving = false;
    }
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleBackdropKeydown(event) {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      onClose();
    }
  }
</script>

<svelte:window on:keydown={handleBackdropKeydown} />


<div
  class="modal-backdrop"
  role="presentation"
  on:click={handleBackdropClick}
  transition:fade={{ duration: 200 }}
>
  <div
    class="modal-panel"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    transition:fly={{ y: -50, duration: 300, easing: quintOut }}
    on:click|stopPropagation
  >
    <div class="modal-header">
      <h3>⚙️ AI Dungeon Master Settings</h3>
      <button class="close-btn" on:click={onClose}>&times;</button>
    </div>

    <div class="modal-body">
      {#if loading}
        <div class="loading-state">
          <div class="spinner">🎲</div>
          <p>Loading provider status...</p>
        </div>
      {:else}
        <div class="provider-selection">
          <h4>Select AI Provider:</h4>

          {#each Object.entries(providers) as [key, provider]}
            <label class="provider-option" class:disabled={!provider.available}>
              <input
                type="radio"
                name="ai-provider"
                value={key}
                bind:group={currentProvider}
                disabled={!provider.available}
              />
              <div class="provider-card">
                <div class="provider-header">
                  <strong>{provider.name}</strong>
                  <span class="availability" class:available={provider.available}>
                    {provider.available ? '✅ Available' : '❌ No API Key'}
                  </span>
                </div>
                <p class="provider-description">{provider.description}</p>
              </div>
            </label>
          {/each}
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn-secondary" on:click={onClose} disabled={saving}>
        Cancel
      </button>
      <button class="btn-primary" on:click={saveProvider} disabled={saving || loading}>
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-panel {
    background: linear-gradient(135deg, #10201a 0%, #0a1612 100%);
    border: 2px solid var(--accent-primary, #2ecc71);
    border-radius: 16px;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8),
                0 0 40px rgba(46, 204, 113, 0.3);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 2px solid rgba(46, 204, 113, 0.3);
  }

  .modal-header h3 {
    margin: 0;
    color: var(--accent-primary, #2ecc71);
    font-size: 1.5rem;
    font-weight: 700;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-secondary, #a8c4bc);
    font-size: 2rem;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .modal-body {
    padding: 2rem;
    min-height: 200px;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    gap: 1rem;
  }

  .spinner {
    font-size: 3rem;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .provider-selection h4 {
    color: var(--text-primary, #e8f4f0);
    margin-bottom: 1.5rem;
    font-size: 1.1rem;
  }

  .provider-option {
    display: block;
    margin-bottom: 1rem;
    cursor: pointer;
  }

  .provider-option.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .provider-option input[type="radio"] {
    position: absolute;
    opacity: 0;
  }

  .provider-card {
    background: rgba(26, 77, 46, 0.3);
    border: 2px solid rgba(46, 204, 113, 0.3);
    border-radius: 12px;
    padding: 1.25rem;
    transition: all 0.3s;
  }

  .provider-option:not(.disabled):hover .provider-card {
    border-color: var(--accent-primary, #2ecc71);
    background: rgba(26, 77, 46, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(46, 204, 113, 0.2);
  }

  .provider-option input[type="radio"]:checked + .provider-card {
    border-color: var(--accent-primary, #2ecc71);
    background: rgba(46, 204, 113, 0.15);
    box-shadow: 0 0 20px rgba(46, 204, 113, 0.3);
  }

  .provider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .provider-header strong {
    color: var(--text-primary, #e8f4f0);
    font-size: 1.1rem;
  }

  .availability {
    font-size: 0.85rem;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-weight: 600;
  }

  .availability.available {
    color: var(--accent-primary, #2ecc71);
    background: rgba(46, 204, 113, 0.2);
  }

  .availability:not(.available) {
    color: #e74c3c;
    background: rgba(231, 76, 60, 0.2);
  }

  .provider-description {
    color: var(--text-secondary, #a8c4bc);
    font-size: 0.95rem;
    margin: 0;
    line-height: 1.4;
  }

  .modal-footer {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding: 1.5rem;
    border-top: 2px solid rgba(46, 204, 113, 0.3);
  }

  .btn-secondary,
  .btn-primary {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.3s;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary, #e8f4f0);
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--accent-primary, #2ecc71) 0%, #27ae60 100%);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: linear-gradient(135deg, #52d988 0%, var(--accent-primary, #2ecc71) 100%);
    box-shadow: 0 0 20px rgba(46, 204, 113, 0.5);
    transform: translateY(-2px);
  }

  .btn-secondary:disabled,
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Scrollbar styling */
  .modal-panel::-webkit-scrollbar {
    width: 8px;
  }

  .modal-panel::-webkit-scrollbar-track {
    background: rgba(10, 22, 18, 0.5);
  }

  .modal-panel::-webkit-scrollbar-thumb {
    background: var(--accent-primary, #2ecc71);
    border-radius: 4px;
  }

  .modal-panel::-webkit-scrollbar-thumb:hover {
    background: #52d988;
  }
</style>