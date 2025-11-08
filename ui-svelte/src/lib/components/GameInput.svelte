<script>
  import { scale, fly } from 'svelte/transition';
  import { quintOut, elasticOut } from 'svelte/easing';

  export const campaign = "test-silverpeak";

  let playerInput = '';
  let activeMode = 'ic';
  let isSending = false;

  const modes = [
    { id: 'ic', icon: '⚔️', label: 'In-Character', color: '#2ecc71' },
    { id: 'dm-question', icon: '❓', label: 'DM Question', color: '#3498db' },
    { id: 'ooc', icon: '🔧', label: 'OOC', color: '#7a8a8f' }
  ];

  function setMode(modeId) {
    activeMode = modeId;
  }

  async function sendAction() {
    if (!playerInput.trim() || isSending) return;

    isSending = true;

    // Dispatch event for legacy system to handle
    window.dispatchEvent(new CustomEvent('playerAction', {
      detail: {
        message: playerInput,
        mode: activeMode
      }
    }));

    // Clear input after brief delay for visual feedback
    setTimeout(() => {
      playerInput = '';
      isSending = false;
    }, 300);
  }

  function handleKeyPress(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      sendAction();
    }
  }
</script>

<div class="game-input">
  <div class="input-area">
    <textarea
      bind:value={playerInput}
      on:keydown={handleKeyPress}
      placeholder="Describe your action... (e.g., 'I cautiously step into the forest, sword drawn')"
      rows="3"
      class:sending={isSending}
    ></textarea>

    <div class="input-controls">
      <div class="mode-selector">
        {#each modes as mode}
          <button
            class="mode-btn"
            class:active={activeMode === mode.id}
            style="--mode-color: {mode.color}"
            on:click={() => setMode(mode.id)}
            in:scale={{ duration: 200, easing: quintOut }}
          >
            <span class="mode-icon">{mode.icon}</span>
            <span class="mode-label">{mode.label}</span>
          </button>
        {/each}
      </div>

      <button
        class="send-btn"
        class:sending={isSending}
        on:click={sendAction}
        disabled={!playerInput.trim() || isSending}
      >
        {#if isSending}
          <span class="spinner">⟳</span>
        {:else}
          <span class="send-icon">➤</span>
        {/if}
        <span>Send Action</span>
      </button>
    </div>
  </div>
</div>

<style>
  .game-input {
    padding: 1.5rem;
    background: rgba(0, 0, 0, 0.3);
    border-top: 2px solid rgba(251, 191, 36, 0.2);
  }

  .input-area {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  textarea {
    width: 100%;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.4);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #eee;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.95rem;
    line-height: 1.5;
    resize: vertical;
    transition: all 0.3s;
  }

  textarea:focus {
    outline: none;
    border-color: #fbbf24;
    box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.2);
    background: rgba(0, 0, 0, 0.5);
  }

  textarea.sending {
    opacity: 0.6;
    pointer-events: none;
  }

  textarea::placeholder {
    color: #666;
    font-style: italic;
  }

  .input-controls {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .mode-selector {
    display: flex;
    gap: 0.5rem;
    flex: 1;
  }

  .mode-btn {
    flex: 1;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: all 0.3s;
    position: relative;
    overflow: hidden;
  }

  .mode-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--mode-color);
    opacity: 0;
    transition: opacity 0.3s;
  }

  .mode-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
  }

  .mode-btn.active {
    border-color: var(--mode-color);
    color: #fff;
    font-weight: 600;
    box-shadow: 0 0 20px rgba(var(--mode-color), 0.3);
  }

  .mode-btn.active::before {
    opacity: 0.15;
  }

  .mode-icon {
    font-size: 1.2rem;
  }

  .mode-label {
    white-space: nowrap;
  }

  .send-btn {
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    border: none;
    border-radius: 8px;
    color: #000;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.3s;
    box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3);
  }

  .send-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(251, 191, 36, 0.5);
    background: linear-gradient(135deg, #fcd34d 0%, #fbbf24 100%);
  }

  .send-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }

  .send-btn.sending {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  }

  .send-icon {
    font-size: 1.2rem;
    transition: transform 0.3s;
  }

  .send-btn:hover:not(:disabled) .send-icon {
    transform: translateX(3px);
  }

  .spinner {
    font-size: 1.2rem;
    display: inline-block;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .mode-label {
      display: none;
    }

    .mode-btn {
      padding: 0.75rem;
    }

    .send-btn {
      padding: 0.75rem 1.5rem;
    }
  }
</style>
