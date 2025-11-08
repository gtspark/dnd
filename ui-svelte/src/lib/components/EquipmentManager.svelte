<script>
  import { onMount, onDestroy } from 'svelte';

  export let campaign = 'test-silverpeak';
  export let character = null; // Can be set from parent, or selected via event
  let equipment = [];
  let inventory = [];
  let spells = [];
  let loading = true;
  let error = null;
  let activeTab = 'equipment'; // equipment, inventory, spells

  async function loadData() {
    if (!character) return;

    try {
      loading = true;
      const encodedChar = encodeURIComponent(character);
      const response = await fetch(`/dnd-api/dnd/equipment/${encodedChar}?campaign=${campaign}`);

      if (!response.ok) {
        throw new Error('Failed to load character data');
      }

      const data = await response.json();
      equipment = data.equipment || [];
      inventory = data.inventory || [];
      spells = data.spells || [];
      error = null;
    } catch (e) {
      error = e.message;
      console.error('Error loading data:', e);
    } finally {
      loading = false;
    }
  }

  async function removeEquipment(equipmentId) {
    try {
      const response = await fetch(`/dnd-api/dnd/equipment/${equipmentId}?campaign=${campaign}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadData();
      }
    } catch (e) {
      console.error('Error removing equipment:', e);
    }
  }

  function handleCharacterSelected(event) {
    character = event.detail.character;
    loadData();
  }

  onMount(() => {
    window.addEventListener('characterSelected', handleCharacterSelected);
  });

  onDestroy(() => {
    window.removeEventListener('characterSelected', handleCharacterSelected);
  });

  $: if (character) {
    loadData();
  }
</script>

<div class="equipment-manager">
  {#if !character}
    <div class="placeholder">Select a character to view their equipment</div>
  {:else if loading}
    <div class="loading">Loading {character}'s items...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <!-- Tabs -->
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'equipment'}
        on:click={() => activeTab = 'equipment'}
      >
        ⚔️ Equipment ({equipment.length})
      </button>
      <button
        class="tab"
        class:active={activeTab === 'inventory'}
        on:click={() => activeTab = 'inventory'}
      >
        🎒 Inventory ({inventory.length})
      </button>
      <button
        class="tab"
        class:active={activeTab === 'spells'}
        on:click={() => activeTab = 'spells'}
      >
        ✨ Spells ({spells.length})
      </button>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      {#if activeTab === 'equipment'}
        <div class="items">
          {#each equipment as item}
            <div class="item equipment-item">
              <div class="item-main">
                <span class="item-name">{item.item_name}</span>
                <span class="item-type">{item.item_type}</span>
                <button on:click={() => removeEquipment(item.id)} class="btn-remove">×</button>
              </div>
              {#if item.properties && Object.keys(item.properties).length > 0}
                <div class="item-properties">
                  {#if item.properties.damage}
                    <span class="prop">⚔️ {item.properties.damage} {item.properties.damageType || ''}</span>
                  {/if}
                  {#if item.properties.ac}
                    <span class="prop">🛡️ AC {item.properties.ac}{item.properties.acModifier !== 'none' ? ' + ' + item.properties.acModifier : ''}</span>
                  {/if}
                  {#if item.properties.range}
                    <span class="prop">📏 {item.properties.range}</span>
                  {/if}
                  {#if item.properties.properties && item.properties.properties.length > 0}
                    <span class="prop-tags">{item.properties.properties.join(', ')}</span>
                  {/if}
                </div>
              {/if}
            </div>
          {:else}
            <p class="empty">No equipment</p>
          {/each}
        </div>
      {:else if activeTab === 'inventory'}
        <div class="items">
          {#each inventory as item}
            <div class="item">
              <div class="item-main">
                <span class="item-name">{item.item_name}</span>
                {#if item.quantity > 1}
                  <span class="item-quantity">x{item.quantity}</span>
                {/if}
              </div>
            </div>
          {:else}
            <p class="empty">No items</p>
          {/each}
        </div>
      {:else if activeTab === 'spells'}
        <div class="items">
          {#each spells as spell}
            <div class="item spell-item">
              <div class="item-main">
                <span class="item-name">{spell.spell_name}</span>
                {#if spell.spell_level !== null}
                  <span class="spell-level">Lvl {spell.spell_level}</span>
                {/if}
                {#if spell.prepared}
                  <span class="prepared">✓</span>
                {/if}
              </div>
              {#if spell.properties && Object.keys(spell.properties).length > 0}
                <div class="item-properties">
                  {#if spell.properties.damage}
                    <span class="prop">💥 {spell.properties.damage} {spell.properties.damageType || ''}</span>
                  {/if}
                  {#if spell.properties.healing}
                    <span class="prop">💚 {spell.properties.healing}</span>
                  {/if}
                  {#if spell.properties.effect}
                    <span class="prop">✨ {spell.properties.effect}</span>
                  {/if}
                  {#if spell.properties.range}
                    <span class="prop">📏 {spell.properties.range}</span>
                  {/if}
                  {#if spell.properties.savingThrow}
                    <span class="prop">🎲 DC {spell.properties.savingThrow}</span>
                  {/if}
                  {#if spell.properties.duration}
                    <span class="prop">⏱️ {spell.properties.duration}</span>
                  {/if}
                  {#if spell.properties.school}
                    <span class="prop-tags">{spell.properties.school}</span>
                  {/if}
                </div>
              {/if}
            </div>
          {:else}
            <p class="empty">No spells</p>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .equipment-manager {
    width: 100%;
    background: rgba(255, 255, 255, 0.02);
    color: #eee;
    border-radius: 8px;
    overflow: hidden;
  }

  .placeholder, .loading, .error {
    text-align: center;
    padding: 2rem;
    color: #888;
    font-style: italic;
  }

  .error {
    color: #f87171;
  }

  /* Tabs */
  .tabs {
    display: flex;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .tab {
    flex: 1;
    padding: 0.75rem;
    background: none;
    border: none;
    color: #aaa;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
    border-bottom: 2px solid transparent;
  }

  .tab:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #eee;
  }

  .tab.active {
    background: rgba(251, 191, 36, 0.1);
    color: #fbbf24;
    border-bottom-color: #fbbf24;
  }

  /* Tab Content */
  .tab-content {
    padding: 1rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .items {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .item-main {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .item-name {
    flex: 1;
    font-weight: 500;
  }

  .item-type, .item-quantity, .spell-level {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    color: #ddd;
  }

  .item-properties {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-left: 0.5rem;
    font-size: 0.8rem;
    color: #aaa;
  }

  .prop {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .prop-tags {
    font-size: 0.7rem;
    color: #fbbf24;
    font-style: italic;
  }

  .prepared {
    color: #10b981;
    font-weight: bold;
    font-size: 0.9rem;
  }

  .btn-remove {
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    transition: background 0.2s;
  }

  .btn-remove:hover {
    background: #dc2626;
  }

  .empty {
    text-align: center;
    color: #666;
    font-style: italic;
    padding: 2rem;
    font-size: 0.9rem;
  }
</style>
