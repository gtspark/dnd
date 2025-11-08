<script>
  import { onMount } from 'svelte';
  import PartyCredits from './PartyCredits.svelte';

  export let campaign = 'test-silverpeak';

  let characters = [];
  let selectedCharacter = null;
  let activeTab = 'equipment'; // equipment, inventory, spells

  let characterData = {
    stats: {},
    equipment: [],
    inventory: [],
    spells: [],
    notes: ''
  };

  let loading = true;
  let error = null;

  async function loadCharacters() {
    try {
      const response = await fetch(`/dnd-api/dnd/state?campaign=${campaign}`);
      if (!response.ok) throw new Error('Failed to load campaign');

      const data = await response.json();
      characters = Object.entries(data.characters || {}).map(([id, char]) => ({
        id,
        name: char.name,
        hp: char.hp,
        ac: char.ac,
        level: char.level,
        class: char.class
      }));

      if (characters.length > 0 && !selectedCharacter) {
        selectedCharacter = characters[0].name;
      }
    } catch (e) {
      error = e.message;
      console.error('Error loading characters:', e);
    }
  }

  async function loadCharacterData() {
    if (!selectedCharacter) return;

    try {
      loading = true;
      const encodedChar = encodeURIComponent(selectedCharacter);

      // Load equipment/inventory/spells
      const equipResponse = await fetch(`/dnd-api/dnd/equipment/${encodedChar}?campaign=${campaign}`);
      if (equipResponse.ok) {
        const equipData = await equipResponse.json();
        characterData.equipment = equipData.equipment || [];
        characterData.inventory = equipData.inventory || [];
        characterData.spells = equipData.spells || [];
      }

      // Load full character stats
      const stateResponse = await fetch(`/dnd-api/dnd/state?campaign=${campaign}`);
      if (stateResponse.ok) {
        const state = await stateResponse.json();
        const charKey = Object.keys(state.characters).find(
          k => state.characters[k].name === selectedCharacter
        );
        if (charKey) {
          characterData.stats = state.characters[charKey];
        }
      }

      error = null;
    } catch (e) {
      error = e.message;
      console.error('Error loading character data:', e);
    } finally {
      loading = false;
    }
  }

  async function removeEquipment(equipmentId) {
    try {
      const response = await fetch(`/dnd-api/dnd/equipment/${equipmentId}?campaign=${campaign}`, {
        method: 'DELETE'
      });
      if (response.ok) await loadCharacterData();
    } catch (e) {
      console.error('Error removing equipment:', e);
    }
  }

  onMount(async () => {
    await loadCharacters();
    await loadCharacterData();
  });

  $: if (selectedCharacter) {
    loadCharacterData();
    // Dispatch custom event when character changes
    window.dispatchEvent(new CustomEvent('characterSelected', {
      detail: { character: selectedCharacter }
    }));
  }
</script>

<div class="character-panel-content">
  <h3>Party</h3>
  {#each characters as char}
    <button
      class="party-card"
      class:selected={char.name === selectedCharacter}
      on:click={() => selectedCharacter = char.name}
    >
      <div class="party-card-name">{char.name}</div>
      <div class="party-card-class">{char.class} {char.level}</div>
      <div class="party-card-vitals">
        <span class="hp">❤️ {char.hp.current}/{char.hp.max}</span>
        <span class="ac">🛡️ {char.ac}</span>
      </div>
    </button>
  {/each}

  {#if selectedCharacter && characterData.stats}
    <div class="character-details">
      <h4>{selectedCharacter}</h4>

      <!-- Abilities: Compact 2-line display -->
      <div class="abilities-compact">
        {#each ['str', 'dex', 'con', 'int', 'wis', 'cha'] as ability}
          {@const score = characterData.stats.abilities?.[ability] || 10}
          {@const mod = Math.floor((score - 10) / 2)}
          <div class="ability-compact">
            <span class="ability-name">{ability.toUpperCase()}</span>
            <span class="ability-value">{score}</span>
            <span class="ability-modifier" class:positive={mod >= 0} class:negative={mod < 0}>
              {mod >= 0 ? '+' : ''}{mod}
            </span>
          </div>
        {/each}
      </div>

      <!-- HP and AC side by side -->
      <div class="vitals-row">
        <div class="vital-stat hp-stat">
          <span class="vital-label">HP:</span>
          <span class="vital-value">{characterData.stats.hp?.current || 0}/{characterData.stats.hp?.max || 0}</span>
        </div>
        <div class="vital-stat ac-stat">
          <span class="vital-label">AC:</span>
          <span class="vital-value">{characterData.stats.ac || 10}</span>
        </div>
      </div>

      <!-- Conditions -->
      {#if characterData.stats.conditions && characterData.stats.conditions.length > 0}
        <div class="conditions">
          <div class="conditions-label">Conditions:</div>
          {#each characterData.stats.conditions as condition}
            <span class="condition-badge">{condition}</span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Party Credits at bottom of left panel -->
  <PartyCredits {campaign} />
</div>

<style>
  .character-panel-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
    color: #eee;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .character-panel-content h3 {
    margin: 0 0 0.5rem 0;
    color: #fbbf24;
    font-size: 1.1rem;
  }

  .character-panel-content h4 {
    margin: 1rem 0 0.5rem 0;
    color: #fbbf24;
    font-size: 1rem;
  }

  .party-card {
    width: 100%;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    color: inherit;
    transition: all 0.2s;
  }

  .party-card:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .party-card.selected {
    background: rgba(251, 191, 36, 0.15);
    border-color: #fbbf24;
  }

  .party-card-name {
    font-weight: 600;
    font-size: 1rem;
    margin-bottom: 0.25rem;
    color: #eee;
  }

  .party-card-class {
    font-size: 0.85rem;
    color: #aaa;
    margin-bottom: 0.5rem;
  }

  .party-card-vitals {
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
  }

  .party-card-vitals .hp {
    color: #f87171;
  }

  .party-card-vitals .ac {
    color: #60a5fa;
  }

  /* Compact Abilities Display */
  .abilities-compact {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem 0.5rem;
    margin: 0.5rem 0;
    font-size: 0.85rem;
  }

  .ability-compact {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .ability-name {
    font-weight: 600;
    color: #aaa;
    min-width: 2.2rem;
  }

  .ability-value {
    font-weight: 600;
    color: #eee;
  }

  .ability-modifier {
    font-weight: 500;
    font-size: 0.8rem;
  }

  .ability-modifier.positive {
    color: #10b981;
  }

  .ability-modifier.negative {
    color: #f87171;
  }

  /* Vitals Row: HP and AC side by side */
  .vitals-row {
    display: flex;
    gap: 0.75rem;
    margin: 0.75rem 0;
  }

  .vital-stat {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hp-stat {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .ac-stat {
    background: rgba(96, 165, 250, 0.15);
    border: 1px solid rgba(96, 165, 250, 0.3);
  }

  .vital-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #aaa;
  }

  .vital-value {
    font-size: 1rem;
    font-weight: 700;
    color: #eee;
  }

  /* RIGHT PANEL: Character Details */

  /* svelte-ignore css-unused-selector */
  .details-panel {
    display: flex;
    flex-direction: column;
  }

  /* svelte-ignore css-unused-selector */
  .character-header {
    margin-bottom: 1rem;
  }

  /* svelte-ignore css-unused-selector */
  .character-header h2 {
    margin: 0 0 0.25rem 0;
    color: #fbbf24;
  }

  /* svelte-ignore css-unused-selector */
  .character-subtitle {
    color: #aaa;
    font-size: 0.9rem;
  }

  /* svelte-ignore css-unused-selector */
  .panel-tabs {
    display: flex;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  /* svelte-ignore css-unused-selector */
  .panel-tabs button {
    flex: 1;
    padding: 0.75rem;
    background: none;
    border: none;
    color: #aaa;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  /* svelte-ignore css-unused-selector */
  .panel-tabs button:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #eee;
  }

  /* svelte-ignore css-unused-selector */
  .panel-tabs button.active {
    background: rgba(251, 191, 36, 0.1);
    color: #fbbf24;
    border-bottom: 2px solid #fbbf24;
  }

  /* svelte-ignore css-unused-selector */
  .panel-content, .tab-content {
    flex: 1;
    padding: 1rem;
    overflow-y: auto;
  }

  /* svelte-ignore css-unused-selector */
  .character-header {
    padding: 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  /* svelte-ignore css-unused-selector */
  .character-header h2 {
    margin: 0;
    color: #fbbf24;
  }

  /* svelte-ignore css-unused-selector */
  .dm-tab {
    padding: 1rem;
  }

  /* svelte-ignore css-unused-selector */
  .dm-tab h3 {
    margin: 0 0 1.5rem 0;
  }

  /* svelte-ignore css-unused-selector */
  .ability-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  /* svelte-ignore css-unused-selector */
  .ability-box {
    background: rgba(255, 255, 255, 0.05);
    padding: 0.75rem 0.5rem;
    border-radius: 6px;
    text-align: center;
  }

  /* svelte-ignore css-unused-selector */
  .ability-box label {
    display: block;
    font-size: 0.7rem;
    color: #aaa;
    margin-bottom: 0.25rem;
  }

  /* svelte-ignore css-unused-selector */
  .ability-box .score {
    font-size: 1.25rem;
    font-weight: 600;
  }

  /* svelte-ignore css-unused-selector */
  .ability-box .modifier {
    font-size: 0.85rem;
    color: #fbbf24;
  }

  /* svelte-ignore css-unused-selector */
  .conditions-section {
    margin-top: 1.5rem;
  }

  /* svelte-ignore css-unused-selector */
  .conditions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* svelte-ignore css-unused-selector */
  .item-name {
    flex: 1;
    font-weight: 500;
  }

  /* svelte-ignore css-unused-selector */
  .item-type, .spell-level, .quantity {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  /* svelte-ignore css-unused-selector */
  .item-properties {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #aaa;
  }

  /* svelte-ignore css-unused-selector */
  .prop-tags {
    font-size: 0.7rem;
    color: #fbbf24;
    font-style: italic;
  }

  /* svelte-ignore css-unused-selector */
  .prepared {
    color: #10b981;
    font-weight: bold;
  }

  /* svelte-ignore css-unused-selector */
  .control-buttons input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.2);
    color: #eee;
    border-radius: 6px;
  }

  /* svelte-ignore css-unused-selector */
  .btn-primary, .btn-danger, .btn-success {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
  }

  /* svelte-ignore css-unused-selector */
  .btn-primary {
    background: #fbbf24;
    color: #000;
  }

  /* svelte-ignore css-unused-selector */
  .btn-primary:hover {
    background: #f59e0b;
  }

  /* svelte-ignore css-unused-selector */
  .btn-danger {
    background: #ef4444;
    color: white;
  }

  /* svelte-ignore css-unused-selector */
  .btn-danger:hover {
    background: #dc2626;
  }

  /* svelte-ignore css-unused-selector */
  .btn-success {
    background: #10b981;
    color: white;
  }

  /* svelte-ignore css-unused-selector */
  .btn-success:hover {
    background: #059669;
  }

  /* svelte-ignore css-unused-selector */
  .activity-feed {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* svelte-ignore css-unused-selector */
  .activity-item {
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
  }

  /* svelte-ignore css-unused-selector */
  .event-type {
    font-size: 0.65rem;
    text-transform: uppercase;
    color: #fbbf24;
  }

  /* svelte-ignore css-unused-selector */
  .event-summary {
    font-size: 0.8rem;
    color: #eee;
  }

  /* svelte-ignore css-unused-selector */
  .event-time {
    font-size: 0.7rem;
    color: #888;
  }

  /* svelte-ignore css-unused-selector */
  .empty-small {
    text-align: center;
    padding: 1rem;
    color: #bbb;
  }


  /* Activity Feed */


  .control-buttons input {
    flex: 1;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: #eee;
    font-size: 0.9rem;
  }

  .btn-primary, .btn-danger, .btn-success {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: all 0.2s;
  }

  .btn-primary {
    background: #fbbf24;
    color: #000;
  }

  .btn-primary:hover {
    background: #f59e0b;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }

  .btn-danger:hover {
    background: #dc2626;
  }

  .btn-success {
    background: #10b981;
    color: white;
  }

  .btn-success:hover {
    background: #059669;
  }

  .activity-feed {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .activity-item {
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .event-type {
    font-size: 0.65rem;
    text-transform: uppercase;
    color: #fbbf24;
    font-weight: 600;
  }

  .event-summary {
    font-size: 0.8rem;
    color: #eee;
  }

  .event-time {
    font-size: 0.7rem;
    color: #888;
  }

  .empty-small {
    text-align: center;
    padding: 1rem;
    color: #666;
    font-size: 0.85rem;
    font-style: italic;
  }

  .condition-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    border-radius: 12px;
    font-size: 0.85rem;
    color: #fca5a5;
    margin-right: 0.5rem;
  }
</style>
