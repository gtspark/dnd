<script>
  import { fade, fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  export let onClose = () => {};

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

</script>

<svelte:window on:keydown={handleKeydown} />

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
      <h2>About Claude DM</h2>
      <button class="close-btn" on:click={onClose} aria-label="Close">&times;</button>
    </div>

    <div class="modal-body">
      <p class="intro">
        <strong>Claude DM</strong> is an AI-powered D&D Campaign Manager that brings your adventures to life with intelligent narrative generation, real-time character management, and automated game state tracking.
      </p>

      <section>
        <h3>Features</h3>
        <ul>
          <li>🎲 Interactive dice rolling with automatic modifiers</li>
          <li>🤖 Multi-AI DM support (Claude, DeepSeek, GPT-4)</li>
          <li>👥 Three party members: Kira, Thorne, and Riven</li>
          <li>📊 Automatic state tracking (HP, inventory, credits)</li>
          <li>🎨 AI-generated scene images</li>
          <li>💾 Persistent campaign history with rollback support</li>
        </ul>
      </section>

      <section>
        <h3>Message Modes</h3>
        <ul>
          <li><strong>⚔️ In-Character</strong> - Canon actions that advance the story and update game state</li>
          <li><strong>❓ DM Question</strong> - Ask questions without advancing the story</li>
          <li><strong>🔧 OOC</strong> - Non-canon testing and experimentation</li>
        </ul>
      </section>

      <section>
        <h3>Keyboard Shortcuts</h3>
        <ul>
          <li><kbd>Ctrl/Cmd + Enter</kbd> - Send action</li>
          <li><kbd>Esc</kbd> - Close modals</li>
        </ul>
      </section>

      <p class="footer-text">
        Powered by Claude Sonnet 4.5, DeepSeek, and GPT-4 APIs
      </p>
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

  .modal-header h2 {
    margin: 0;
    color: var(--accent-primary, #2ecc71);
    font-size: 1.75rem;
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
  }

  .intro {
    margin-bottom: 1.5rem;
    color: var(--text-primary, #e8f4f0);
    line-height: 1.6;
  }

  section {
    margin-bottom: 1.5rem;
  }

  h3 {
    color: var(--accent-gold, #c0d6df);
    margin: 0 0 0.75rem 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  ul {
    margin: 0;
    padding-left: 1.5rem;
    color: var(--text-primary, #e8f4f0);
    line-height: 1.8;
  }

  li {
    margin-bottom: 0.5rem;
  }

  strong {
    color: var(--accent-primary, #2ecc71);
  }

  kbd {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-family: monospace;
    font-size: 0.9em;
    color: var(--accent-gold, #c0d6df);
  }

  .footer-text {
    margin-top: 1.5rem;
    margin-bottom: 0;
    font-size: 0.9rem;
    color: var(--text-secondary, #a8c4bc);
    text-align: center;
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
