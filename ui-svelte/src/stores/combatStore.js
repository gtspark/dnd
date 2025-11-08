import { writable } from 'svelte/store';

function buildEndpointCandidates(campaignId) {
  const encoded = encodeURIComponent(campaignId);
  const config = typeof window !== 'undefined' ? (window.__CLAUDE_API_CONFIG__ || (window.claudeAPI && window.claudeAPI.config) || {}) : {};
  const rawList = Array.isArray(config.combat_state_endpoints) ? config.combat_state_endpoints : [];

  const ensureUrl = (path) => {
    if (!path || typeof path !== 'string') return null;
    const trimmed = path.trim();
    if (!trimmed) return null;
    const sep = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${sep}campaign=${encoded}`;
  };

  const preferred = rawList.map(ensureUrl).filter(Boolean);
  const defaults = [
    '/dnd-api/dnd/combat-state',
    '/dnd/api/dnd/combat-state',
    '/api/dnd/combat-state',
    '/dnd-api/dnd/combat/state',
    '/dnd/api/dnd/combat/state',
    '/api/dnd/combat/state'
  ].map(ensureUrl).filter(Boolean);

  const deduped = [];
  for (const url of [...preferred, ...defaults]) {
    if (url && !deduped.includes(url)) {
      deduped.push(url);
    }
  }

  return deduped;
}

const defaultCombatState = {
  active: false,
  round: 0,
  currentTurn: 0,
  initiativeOrder: [],
  actionEconomy: {},
  conditions: {},
  conversationHistory: [],
  context: {},
  participants: {
    players: [],
    enemies: []
  }
};

function normalizeCombatState(state) {
  if (!state || typeof state !== 'object') {
    return { ...defaultCombatState };
  }

  const actionEconomy = state.actionEconomy && typeof state.actionEconomy === 'object'
    ? state.actionEconomy
    : {};

  const conditions = state.conditions && typeof state.conditions === 'object'
    ? state.conditions
    : {};

  const rawOrder = Array.isArray(state.initiativeOrder) ? state.initiativeOrder : [];
  const initiativeOrder = rawOrder.map(combatant => {
    const name = combatant?.name || '';
    const economy = actionEconomy[name];
    const combatantConditions = Array.isArray(combatant?.conditions)
      ? combatant.conditions
      : (Array.isArray(conditions[name]) ? conditions[name] : []);

    return {
      ...combatant,
      actionEconomy: economy ? { ...economy } : (combatant.actionEconomy || null),
      conditions: combatantConditions
    };
  });

  const participants = {
    players: Array.isArray(state.participants?.players) ? state.participants.players : [],
    enemies: Array.isArray(state.participants?.enemies) ? state.participants.enemies : []
  };

  if (participants.players.length === 0 && participants.enemies.length === 0 && initiativeOrder.length > 0) {
    participants.players = initiativeOrder.filter(c => c?.isPlayer);
    participants.enemies = initiativeOrder.filter(c => c && c.isPlayer === false);
  }

  return {
    active: !!state.active,
    round: Number.isFinite(state.round) ? state.round : 0,
    currentTurn: Number.isFinite(state.currentTurn) ? state.currentTurn : 0,
    initiativeOrder,
    actionEconomy,
    conditions,
    conversationHistory: Array.isArray(state.conversationHistory) ? state.conversationHistory : [],
    context: state.context || {},
    participants
  };
}

function createCombatStore() {
  const initialState = {
    state: { ...defaultCombatState },
    loading: false,
    error: null,
    lastUpdated: null
  };

  const { subscribe, update, set } = writable(initialState);

  let campaignId = null;
  let pollIntervalId = null;
  let pollDelay = 2000;
  let inFlight = false;
  let endpointUnavailable = false;
  let lastLogTimestamp = 0;

  async function fetchCombatState(force = false) {
    if (!campaignId || inFlight) {
      return null;
    }

    inFlight = true;

    if (force) {
      update((current) => ({ ...current, loading: true }));
    }

    try {
      const endpoints = buildEndpointCandidates(campaignId);

      let response;
      let lastError;

      for (const url of endpoints) {
        try {
          response = await fetch(url);
          if (response.ok) {
            break;
          }

          lastError = new Error(`Failed to fetch combat state (${response.status})`);
        } catch (err) {
          lastError = err;
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error('Failed to fetch combat state');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Combat state unavailable');
      }

      const combatState = normalizeCombatState(data.combatState);

      set({
        state: combatState,
        loading: false,
        error: null,
        lastUpdated: Date.now()
      });

      return combatState;
    } catch (error) {
      const is404 = typeof error?.message === 'string' && error.message.includes('404');
      if (is404) {
        endpointUnavailable = true;
        stop();
      }

      const now = Date.now();
      if (!endpointUnavailable || now - lastLogTimestamp > 30000) {
        console.error('combatStore fetch failed:', error);
        lastLogTimestamp = now;
      }

      update((current) => ({
        ...current,
        loading: false,
        error: error.message || 'Unknown error fetching combat state'
      }));
      return null;
    } finally {
      inFlight = false;
    }
  }

  function start(options = {}) {
    const { campaign, interval } = options;

    if (campaign) {
      campaignId = campaign;
    } else if (!campaignId) {
      campaignId = 'test-silverpeak';
    }

    endpointUnavailable = false;

    if (typeof interval === 'number' && interval > 0) {
      pollDelay = interval;
    }

    if (!campaignId) {
      return;
    }

    stop();
    fetchCombatState(true);
    pollIntervalId = setInterval(fetchCombatState, pollDelay);
  }

  function stop() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  }

  function refresh() {
    return fetchCombatState(true);
  }

  function setState(state) {
    const normalized = normalizeCombatState(state);
    set({
      state: normalized,
      loading: false,
      error: null,
      lastUpdated: Date.now()
    });
  }

  function setCampaign(campaign, options = {}) {
    const { fetch = true } = options;

    if (!campaign || campaign === campaignId) {
      return;
    }

    campaignId = campaign;
    if (fetch) {
      fetchCombatState(true);
    }
  }

  return {
    subscribe,
    start,
    stop,
    refresh,
    setState,
    setCampaign
  };
}

export const combatStore = createCombatStore();
export { defaultCombatState, normalizeCombatState };
