<script>
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  export let campaign = 'test-silverpeak';

  let loading = false;
  let imageUrl = null;
  let sceneDescription = '';
  let error = null;
  let hasLatestImage = false;

  onMount(async () => {
    // Check if there's a latest scene image
    await checkForLatestImage();
  });

  async function checkForLatestImage() {
    try {
      const testUrl = `/dnd/campaigns/${campaign}/generated-scenes/latest.png?t=${Date.now()}`;
      const response = await fetch(testUrl, { method: 'HEAD' });
      if (response.ok) {
        imageUrl = testUrl;
        hasLatestImage = true;
      }
    } catch (err) {
      // No latest image exists, that's fine
      console.log('No previous scene image found');
    }
  }

  async function generateScene() {
    loading = true;
    error = null;
    sceneDescription = '';

    try {
      console.log('🎨 Requesting scene generation from server...');

      const response = await fetch('/dnd-api/dnd/generate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign })
      });

      const result = await response.json();

      if (result.success) {
        imageUrl = result.imageUrl;
        sceneDescription = result.sceneDescription;
        hasLatestImage = true;
        console.log('✅ Scene generated successfully');
      } else {
        error = result.error || 'Failed to generate scene';
        sceneDescription = result.sceneDescription || '';
        console.error('❌ Scene generation failed:', result);
      }
    } catch (err) {
      error = 'Network error while generating scene';
      console.error('❌ Scene generation error:', err);
    } finally {
      loading = false;
    }
  }
</script>

<div class="scene-generator">
  <h5>Scene Visualizer</h5>

  <div class="scene-display">
    {#if loading}
      <div class="scene-loading" in:fade={{ duration: 200 }}>
        <div class="spinner">🎲</div>
        <p>Extracting scene description...</p>
        <p class="loading-subtext">This may take 10-30 seconds</p>
      </div>
    {:else if error}
      <div class="scene-error" in:fade={{ duration: 200 }}>
        <span class="error-icon">⚠️</span>
        <p class="error-message">{error}</p>
        {#if sceneDescription}
          <p class="scene-desc">{sceneDescription}</p>
        {/if}
      </div>
    {:else if imageUrl}
      <img
        src={imageUrl}
        alt="Generated scene"
        class="scene-image"
        in:fade={{ duration: 400 }}
      />
    {:else}
      <div class="scene-placeholder" in:fade={{ duration: 200 }}>
        <span class="scene-icon">🎨</span>
        <p>Generate a scene image from recent adventure</p>
      </div>
    {/if}
  </div>

  <button
    class="btn-primary generate-btn"
    on:click={generateScene}
    disabled={loading}
  >
    {#if loading}
      ⏳ Generating...
    {:else}
      📸 Generate Scene Image
    {/if}
  </button>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=IM+Fell+English&display=swap');

  .scene-generator {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-family: 'IM Fell English', serif;
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
  }

  .scene-display {
    background: linear-gradient(135deg, rgba(30, 40, 35, 0.5), rgba(20, 30, 25, 0.7));
    border: 2px solid #3d5a4a;
    border-radius: 8px;
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.4);
  }

  .scene-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
  }

  .scene-icon {
    font-size: 3rem;
    opacity: 0.5;
  }

  .scene-placeholder p {
    margin: 0;
    color: #7a7870;
    font-size: 0.95rem;
  }

  .scene-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
  }

  .spinner {
    font-size: 3rem;
    animation: spin 1s linear infinite;
    filter: drop-shadow(0 0 15px rgba(100, 180, 120, 0.4));
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .scene-loading p {
    margin: 0;
    color: #e8e4d9;
    font-weight: 600;
  }

  .loading-subtext {
    font-size: 0.85rem;
    opacity: 0.7;
    font-weight: 400 !important;
    color: #b8b4a9;
  }

  .scene-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
    text-align: center;
  }

  .error-icon {
    font-size: 2.5rem;
  }

  .error-message {
    margin: 0;
    color: #d46464;
    font-weight: 600;
  }

  .scene-desc {
    margin: 0.5rem 0 0 0;
    color: #b8b4a9;
    font-size: 0.9rem;
    font-style: italic;
  }

  .scene-image {
    width: 100%;
    height: auto;
    display: block;
    border-radius: 6px;
  }

  .generate-btn {
    width: 100%;
    padding: 0.75rem 1.5rem;
    border: 2px solid #3d5a4a;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.95rem;
    font-family: 'Cinzel', serif;
    cursor: pointer;
    transition: all 0.3s;
    background: linear-gradient(135deg, rgba(100, 180, 120, 0.2), rgba(60, 140, 90, 0.3));
    color: #e8e4d9;
    text-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  }

  .generate-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(100, 180, 120, 0.3), rgba(60, 140, 90, 0.4));
    border-color: #64b478;
    box-shadow: 0 0 20px rgba(100, 180, 120, 0.3);
    transform: translateY(-2px);
  }

  .generate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
</style>
