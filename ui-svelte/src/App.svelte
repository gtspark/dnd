<script>
  import CampaignManager from './lib/components/CampaignManager.svelte';
  import CombatTracker from './lib/components/CombatTracker.svelte';

  const campaign = 'test-silverpeak';
</script>

<main>
  <CampaignManager {campaign} />
  <CombatTracker {campaign} />
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: #0f0f1e;
    font-family: system-ui, -apple-system, sans-serif;
  }

  main {
    width: 100%;
    height: 100vh;
  }
</style>
