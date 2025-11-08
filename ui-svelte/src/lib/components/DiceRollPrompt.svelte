<script>
  import { scale, fly } from 'svelte/transition';
  import { elasticOut, backOut } from 'svelte/easing';
  import { onMount } from 'svelte';

  export let rollDetails = {};
  export let onRoll = () => {};

  let isRolling = false;
  let diceResult = null;
  let showResult = false;

  function handleRoll() {
    if (isRolling) return;

    isRolling = true;

    // Simulate dice roll animation
    const rollDuration = 1000;
    const interval = 50;
    const iterations = rollDuration / interval;
    let count = 0;

    const rollInterval = setInterval(() => {
      diceResult = Math.floor(Math.random() * 20) + 1;
      count++;

      if (count >= iterations) {
        clearInterval(rollInterval);
        // Get the actual roll result
        const finalRoll = Math.floor(Math.random() * 20) + 1;
        diceResult = finalRoll;
        showResult = true;

        // Call the callback with result
        setTimeout(() => {
          onRoll(finalRoll);
        }, 1500);
      }
    }, interval);
  }

  function getSuccessClass() {
    if (!rollDetails.dc || !diceResult) return '';
    const total = diceResult + (rollDetails.modifier || 0);
    return total >= rollDetails.dc ? 'success' : 'failure';
  }

  function getTotal() {
    return diceResult + (rollDetails.modifier || 0);
  }
</script>

<div class="dice-prompt-overlay" in:fly={{ y: -50, duration: 400 }}>
  <div class="dice-prompt" in:scale={{ duration: 400, easing: backOut }}>
    <div class="prompt-header">
      <span class="dice-icon">🎲</span>
      <h3>Roll Required!</h3>
    </div>

    <div class="roll-info">
      {#if rollDetails.skill}
        <div class="skill-name">{rollDetails.skill}</div>
      {/if}
      {#if rollDetails.dc}
        <div class="dc-display">DC {rollDetails.dc}</div>
      {/if}
      {#if rollDetails.description}
        <div class="description">{rollDetails.description}</div>
      {/if}
    </div>

    <div class="dice-display" class:rolling={isRolling} class:result-shown={showResult}>
      {#if diceResult !== null}
        <div
          class="dice-result {getSuccessClass()}"
          in:scale={{ duration: 300, easing: elasticOut }}
        >
          <div class="d20-face">{diceResult}</div>
          {#if showResult && rollDetails.modifier}
            <div class="modifier" in:fly={{ x: -20, duration: 300, delay: 200 }}>
              {rollDetails.modifier >= 0 ? '+' : ''}{rollDetails.modifier}
            </div>
          {/if}
        </div>
        {#if showResult}
          <div class="total-result {getSuccessClass()}" in:scale={{ duration: 400, delay: 400, easing: backOut }}>
            <span class="total-label">Total:</span>
            <span class="total-value">{getTotal()}</span>
            {#if rollDetails.dc}
              <span class="result-text">
                {getTotal() >= rollDetails.dc ? '✓ Success!' : '✗ Failed'}
              </span>
            {/if}
          </div>
        {/if}
      {/if}
    </div>

    {#if !isRolling}
      <button class="roll-button" on:click={handleRoll}>
        <span class="button-icon">🎲</span>
        <span>Roll the Dice!</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .dice-prompt-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dice-prompt {
    background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1e 100%);
    border: 3px solid #fbbf24;
    border-radius: 16px;
    padding: 2rem;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(251, 191, 36, 0.3);
  }

  .prompt-header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .dice-icon {
    font-size: 2rem;
    animation: wobble 2s ease-in-out infinite;
  }

  @keyframes wobble {
    0%, 100% { transform: rotate(-5deg); }
    50% { transform: rotate(5deg); }
  }

  h3 {
    margin: 0;
    color: #fbbf24;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .roll-info {
    text-align: center;
    margin-bottom: 2rem;
  }

  .skill-name {
    font-size: 1.2rem;
    font-weight: 600;
    color: #eee;
    margin-bottom: 0.5rem;
  }

  .dc-display {
    display: inline-block;
    padding: 0.5rem 1rem;
    background: rgba(251, 191, 36, 0.2);
    border: 2px solid #fbbf24;
    border-radius: 8px;
    color: #fbbf24;
    font-weight: 700;
    font-size: 1.1rem;
    margin-bottom: 0.75rem;
  }

  .description {
    color: #aaa;
    font-size: 0.95rem;
    font-style: italic;
  }

  .dice-display {
    min-height: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .dice-result {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .dice-result.rolling {
    animation: shake 0.1s infinite;
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0) rotate(0deg); }
    25% { transform: translateX(-5px) rotate(-2deg); }
    75% { transform: translateX(5px) rotate(2deg); }
  }

  .d20-face {
    width: 120px;
    height: 120px;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
    font-weight: 900;
    color: #000;
    box-shadow: 0 10px 30px rgba(251, 191, 36, 0.5);
    transform-style: preserve-3d;
  }

  .dice-result.rolling .d20-face {
    animation: spin3d 0.1s linear infinite;
  }

  @keyframes spin3d {
    from {
      transform: rotateX(0deg) rotateY(0deg);
    }
    to {
      transform: rotateX(360deg) rotateY(360deg);
    }
  }

  .dice-result.success .d20-face {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    box-shadow: 0 10px 30px rgba(16, 185, 129, 0.6), 0 0 60px rgba(16, 185, 129, 0.4);
  }

  .dice-result.failure .d20-face {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    box-shadow: 0 10px 30px rgba(239, 68, 68, 0.6), 0 0 60px rgba(239, 68, 68, 0.4);
  }

  .modifier {
    font-size: 2rem;
    font-weight: 700;
    color: #fbbf24;
  }

  .total-result {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    border: 2px solid rgba(255, 255, 255, 0.1);
  }

  .total-result.success {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.1);
  }

  .total-result.failure {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .total-label {
    color: #aaa;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .total-value {
    font-size: 2.5rem;
    font-weight: 900;
    color: #fff;
  }

  .result-text {
    font-size: 1.2rem;
    font-weight: 700;
  }

  .total-result.success .result-text {
    color: #10b981;
  }

  .total-result.failure .result-text {
    color: #ef4444;
  }

  .roll-button {
    width: 100%;
    padding: 1rem 2rem;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    border: none;
    border-radius: 12px;
    color: #000;
    font-size: 1.2rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    transition: all 0.3s;
    box-shadow: 0 6px 20px rgba(251, 191, 36, 0.4);
  }

  .roll-button:hover {
    transform: translateY(-3px) scale(1.02);
    box-shadow: 0 10px 30px rgba(251, 191, 36, 0.6);
  }

  .roll-button:active {
    transform: translateY(-1px) scale(0.98);
  }

  .button-icon {
    font-size: 1.5rem;
    animation: bounce 1s ease-in-out infinite;
  }

  @keyframes bounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-5px);
    }
  }
</style>
