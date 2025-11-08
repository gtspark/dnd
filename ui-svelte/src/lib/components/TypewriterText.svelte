<script>
  import { onMount, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let text = '';
  export let speed = 10; // milliseconds per character (2x faster than original 20ms)

  let displayedText = '';
  let currentIndex = 0;
  let isComplete = false;

  onMount(() => {
    if (!text) {
      isComplete = true;
      dispatch('complete');
      return;
    }

    const interval = setInterval(() => {
      if (currentIndex < text.length) {
        displayedText = text.substring(0, currentIndex + 1);
        currentIndex++;
      } else {
        isComplete = true;
        clearInterval(interval);
        dispatch('complete');
      }
    }, speed);

    return () => clearInterval(interval);
  });

  function skipAnimation() {
    displayedText = text;
    currentIndex = text.length;
    isComplete = true;
    dispatch('complete');
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      skipAnimation();
    }
  }
</script>

<div class="typewriter" on:click={skipAnimation} on:keydown={handleKeydown} role="button" tabindex="0">
  {#if displayedText}
    {@html displayedText}
  {/if}
  {#if !isComplete}
    <span class="cursor">▊</span>
  {/if}
</div>

<style>
  .typewriter {
    cursor: pointer;
    user-select: none;
  }

  .cursor {
    display: inline-block;
    animation: blink 1s infinite;
    color: #fbbf24;
    margin-left: 2px;
  }

  @keyframes blink {
    0%, 50% {
      opacity: 1;
    }
    51%, 100% {
      opacity: 0;
    }
  }
</style>
