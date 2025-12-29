/**
 * API Service for D&D Campaign Manager
 * Replaces geminiService.ts - connects to our backend instead of Gemini directly
 */

import { ThemeMode, Character, AIProvider, CombatState, Combatant, Message } from "../types";

// In production (vodbase.net), nginx proxies /dnd-api/ to backend /api/
// In dev (localhost), Vite proxies /api/dnd to backend
const isProduction = typeof window !== 'undefined' && !window.location.hostname.includes('localhost');
const API_BASE = isProduction ? '/dnd-api/dnd' : '/api/dnd';

// Get campaign ID from URL or default
function getCampaignId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('campaign') || 'test-silverpeak';
}

// ============ Backend Response Types ============

interface BackendCharacter {
  name: string;
  class?: string;
  race?: string;
  hp?: { current: number; max: number } | number;
  maxHp?: number;
  credits?: number;
  gold?: number;
  conditions?: string[];
  controlledBy?: 'player' | 'dm';
  companion?: boolean;
  proficiencyBonus?: number;
  abilities?: {
    str?: number;
    dex?: number;
    con?: number;
    int?: number;
    wis?: number;
    cha?: number;
  };
  skills?: Record<string, { ability: string; proficient: boolean; notes?: string }>;
  inventory?: any[];  // Can be strings (legacy) or InventoryItem objects
  equipment?: string[];
  spells?: string[];
  portrait?: string;
}

interface BackendCombatant {
  id?: string;
  uid?: string;
  name: string;
  type?: 'player' | 'enemy';
  isPlayer?: boolean;
  initiative: number;
  hp?: { current: number; max: number };
  ac?: number;
  isDead?: boolean;
}

interface BackendCombatState {
  active: boolean | 'pending';
  pending?: boolean;
  round: number;
  currentTurn: number;
  initiativeOrder: BackendCombatant[];
  enemyInitiatives?: BackendCombatant[];
  playerCharacters?: BackendCombatant[];
  actionEconomy?: Record<string, { action: boolean; bonusAction: boolean; movement: number }>;
  surprise?: string;
  context?: string;
}

interface BackendCampaignState {
  party?: Record<string, BackendCharacter>;
  characters?: Record<string, BackendCharacter>;
  combat?: BackendCombatState;
  resources?: { party_credits?: number; party_gold?: number };
}

interface ActionResponse {
  narrative: string;
  campaignState?: BackendCampaignState;
  combatDetected?: boolean;
  combatPending?: boolean;
  combatEnded?: boolean;  // True when combat just ended this action
  pendingCombat?: {
    enemies: BackendCombatant[];
    playerCharacters: BackendCombatant[];
    surprise?: string;
  };
  rollRequest?: string;
  rollQueueEntry?: any;
  enemies?: any[];
  handoffData?: any;
  lootOffered?: LootOfferedData;  // Loot available for distribution
  error?: string;
}

interface LootOfferedData {
  lootId: string;
  coins?: {
    totalGP: number;
    breakdown?: Record<string, number>;
  };
  items: Array<{
    name: string;
    type: string;
    quantity?: number;
    sellValue?: number;
    rarity?: string;
    description?: string;
  }>;
}

interface LootAssignmentPayload {
  lootId: string;
  assignments: Array<{
    item: string;
    quantity: number;
    assignedTo: string;
  }>;
}

interface StateResponse {
  campaignState: BackendCampaignState;
  conversationHistory?: any[];
}

// ============ State Transformers ============

export function transformCharacters(
  backendChars: Record<string, BackendCharacter>,
  theme: ThemeMode,
  campaignId: string
): Character[] {
  return Object.entries(backendChars).map(([key, char]) => {
    const hp = typeof char.hp === 'object' ? char.hp : { current: char.hp || 10, max: char.maxHp || 10 };
    // Convert key to hyphenated format for portrait path (e.g., "kira moonwhisper" -> "kira-moonwhisper")
    const portraitKey = key.toLowerCase().replace(/\s+/g, '-');

    return {
      id: portraitKey,
      name: char.name || key,
      class: char.class || 'Adventurer',
      race: char.race,
      avatar: char.portrait || `/dnd/campaigns/${campaignId}/portraits/${portraitKey}.png`,
      hp: hp.current,
      maxHp: hp.max,
      resource: char.credits ?? char.gold ?? 0,
      resourceName: theme === 'scifi' ? 'Creds' : 'GP',
      conditions: char.conditions || [],
      controlledBy: char.controlledBy || 'player',
      companion: char.companion || false,
      proficiencyBonus: char.proficiencyBonus ?? 2,
      stats: {
        str: char.abilities?.str ?? 10,
        dex: char.abilities?.dex ?? 10,
        con: char.abilities?.con ?? 10,
        int: char.abilities?.int ?? 10,
        wis: char.abilities?.wis ?? 10,
        cha: char.abilities?.cha ?? 10
      },
      skills: char.skills || {},
      inventory: char.inventory || [],
      heldSpells: char.spells || []
    };
  });
}

export function transformCombatState(
  backendCombat: BackendCombatState,
  characters: Character[]
): CombatState {
  const isActive = backendCombat.active === true;
  const isPending = backendCombat.active === 'pending' || backendCombat.pending === true;

  // Build order from initiativeOrder or pending data
  let order: Combatant[] = [];

  if (backendCombat.initiativeOrder && backendCombat.initiativeOrder.length > 0) {
    order = backendCombat.initiativeOrder.map(c => ({
      id: c.id || c.uid || c.name.toLowerCase().replace(/\s+/g, '-'),
      name: c.name,
      type: (c.type === 'player' || c.isPlayer) ? 'player' : 'enemy',
      initiative: c.initiative,
      avatar: characters.find(p => p.name === c.name)?.avatar,
      isDead: c.isDead || c.isDefeated || (c.hp?.current !== undefined && c.hp.current <= 0)
    }));
  } else if (isPending && backendCombat.enemyInitiatives) {
    // Pending combat - show enemies with rolled initiative, players pending
    const enemies = backendCombat.enemyInitiatives.map(e => ({
      id: e.id || e.name.toLowerCase().replace(/\s+/g, '-'),
      name: e.name,
      type: 'enemy' as const,
      initiative: e.initiative,
      isDead: false
    }));

    const players = (backendCombat.playerCharacters || []).map(p => ({
      id: p.id || p.name.toLowerCase().replace(/\s+/g, '-'),
      name: p.name,
      type: 'player' as const,
      initiative: p.initiative ?? -1, // -1 indicates pending
      avatar: characters.find(c => c.name === p.name)?.avatar,
      isDead: false
    }));

    order = [...enemies, ...players].sort((a, b) => b.initiative - a.initiative);
  }

  const currentId = order[backendCombat.currentTurn]?.id;
  const economy = backendCombat.actionEconomy?.[currentId || ''];

  return {
    isActive: isActive, // Only true when combat is fully active (not pending)
    isPending: isPending, // Waiting for initiative rolls
    round: backendCombat.round || (isPending ? 0 : 1),
    currentTurnIndex: backendCombat.currentTurn || 0,
    order,
    economy: {
      actionSpent: economy ? !economy.action : false,
      bonusActionSpent: economy ? !economy.bonusAction : false,
      movementRemaining: economy?.movement ?? 30,
      maxMovement: 30
    }
  };
}

// ============ API Functions ============

let currentCampaignId = getCampaignId();
let currentTheme: ThemeMode = 'fantasy';
let currentCharacters: Character[] = [];

/**
 * Initialize the chat - loads campaign state from backend
 */
export const initChat = async (
  theme: ThemeMode,
  characters: Character[],
  provider: AIProvider
): Promise<boolean> => {
  currentTheme = theme;
  currentCharacters = characters;
  currentCampaignId = getCampaignId();

  console.log(`[apiService] initChat for campaign: ${currentCampaignId}, theme: ${theme}`);
  return true;
};

/**
 * Load campaign state from backend
 */
export async function loadCampaign(campaignId?: string): Promise<StateResponse> {
  const id = campaignId || currentCampaignId;
  const res = await fetch(`${API_BASE}/state?campaign=${id}`);
  if (!res.ok) {
    throw new Error(`Failed to load campaign: ${res.statusText}`);
  }
  return res.json();
}

/**
 * Send a message/action to the DM
 * Returns an async generator to match the streaming interface
 */
export const sendMessageToDM = async (
  message: string,
  onFunctionCall?: (fc: any) => void
): Promise<AsyncGenerator<string, void, unknown>> => {
  const campaignId = currentCampaignId;

  // Parse character from message if in "Character: message" format
  const charMatch = message.match(/^([^:]+):\s*(.+)$/s);
  const character = charMatch ? charMatch[1].trim() : 'Player';
  const action = charMatch ? charMatch[2].trim() : message;

  // Determine mode from message prefix
  let mode: 'ic' | 'ooc' = 'ic';
  let cleanAction = action;
  if (action.startsWith('[OOC]') || action.startsWith('[ooc]') || action.startsWith('(ooc)') || action.startsWith('(ooc:') || action.startsWith('(OOC)') || action.startsWith('(OOC:')) {
    mode = 'ooc';
    cleanAction = action.replace(/^[\[(]OOC[\]):]\s*/i, '');
  } else if (action.startsWith('[System]')) {
    // Roll results, etc.
    mode = 'ic';
    cleanAction = action.replace(/^\[System\]:\s*/i, '');
  }

  console.log(`[apiService] sendMessageToDM: campaign=${campaignId}, character=${character}, mode=${mode}`);

  try {
    const res = await fetch(`${API_BASE}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId,
        action: cleanAction,
        character,
        mode
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API error: ${res.status} - ${errorText}`);
    }

    const data: ActionResponse = await res.json();

    // Handle function calls / state changes
    if (onFunctionCall) {
      // Combat ended - check this FIRST before start_combat
      if (data.combatEnded) {
        console.log('[apiService] Combat ended - sending end_combat function call');
        onFunctionCall({
          name: 'end_combat',
          args: {}
        });
      }
      // Combat started (pending state - awaiting initiative)
      else if (data.combatPending || data.combatDetected) {
        onFunctionCall({
          name: 'start_combat',
          args: {
            pending: data.combatPending,
            combat: data.campaignState?.combat,
            pendingCombat: data.pendingCombat
          }
        });
      }
      // Combat state update - active combat with full initiative order
      // This handles the transition from pending to active after initiative rolls
      // AND turn advances during active combat
      else if (data.campaignState?.combat?.active === true) {
        console.log('[apiService] Combat active - sending combat_state_update', {
          round: data.campaignState.combat.round,
          currentTurn: data.campaignState.combat.currentTurn,
          orderLength: data.campaignState.combat.initiativeOrder?.length
        });
        onFunctionCall({
          name: 'combat_state_update',
          args: {
            combat: data.campaignState.combat
          }
        });
      }
      // Also send updates if combat exists but not fully active (turn changes, etc.)
      else if (data.campaignState?.combat && data.campaignState.combat.initiativeOrder?.length > 0) {
        console.log('[apiService] Combat state changed - sending combat_state_update');
        onFunctionCall({
          name: 'combat_state_update',
          args: {
            combat: data.campaignState.combat
          }
        });
      }

      // Character updates are in campaignState.characters (NOT party - that's shared resources)
      if (data.campaignState?.characters) {
        onFunctionCall({
          name: 'update_characters',
          args: {
            characters: data.campaignState.characters
          }
        });
      }

      // Roll request
      if (data.rollRequest) {
        onFunctionCall({
          name: 'request_roll',
          args: {
            request: data.rollRequest,
            queueEntry: data.rollQueueEntry
          }
        });
      }

      // Loot offered - combat ended with loot to distribute
      if (data.lootOffered) {
        onFunctionCall({
          name: 'offer_loot',
          args: {
            lootData: data.lootOffered
          }
        });
      }
    }

    // Return generator that yields the narrative
    async function* narrativeGenerator() {
      yield data.narrative || data.error || 'No response from DM';
    }

    return narrativeGenerator();

  } catch (error) {
    console.error('[apiService] Error sending message:', error);

    // Re-throw turn order errors so they can be handled gracefully in the UI
    if (error instanceof Error && (error.message.includes('Not Your Turn') || error.message.includes("'s turn"))) {
      throw error;
    }

    async function* errorGenerator() {
      yield `Error communicating with the server: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    return errorGenerator();
  }
};

/**
 * Submit a roll result
 */
export async function submitRoll(
  character: string,
  rollType: string,
  result: number,
  natural: number,
  campaignId?: string
): Promise<ActionResponse> {
  const id = campaignId || currentCampaignId;

  const res = await fetch(`${API_BASE}/roll-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: id,
      character,
      rollType,
      result,
      natural
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to submit roll: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Submit initiative roll (for pending combat)
 */
export async function submitInitiative(
  roll: number,
  campaignId?: string
): Promise<ActionResponse> {
  const id = campaignId || currentCampaignId;

  const res = await fetch(`${API_BASE}/combat/initiative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: id,
      roll
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to submit initiative: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Get current combat state
 */
export async function getCombatState(campaignId?: string): Promise<BackendCombatState | null> {
  const id = campaignId || currentCampaignId;

  try {
    const res = await fetch(`${API_BASE}/combat/state?campaign=${id}`);
    if (!res.ok) {
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Advance to next turn in combat
 */
export async function nextTurn(campaignId?: string): Promise<BackendCombatState> {
  const id = campaignId || currentCampaignId;

  const res = await fetch(`${API_BASE}/combat/next-turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId: id })
  });

  if (!res.ok) {
    throw new Error(`Failed to advance turn: ${res.statusText}`);
  }

  return res.json();
}

/**
 * End combat manually
 */
export async function endCombat(campaignId?: string): Promise<void> {
  const id = campaignId || currentCampaignId;

  await fetch(`${API_BASE}/combat/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId: id })
  });
}

/**
 * Continue story - triggers DM to continue without logging a player message
 * Used for narrative campaigns where player just wants to advance the story
 */
export async function continueStory(
  campaignId?: string,
  onFunctionCall?: (fc: any) => void
): Promise<string> {
  const id = campaignId || currentCampaignId;

  const res = await fetch(`${API_BASE}/continue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId: id })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Continue story failed: ${res.status} - ${errorText}`);
  }

  const data = await res.json();

  // Handle function calls for state updates
  if (onFunctionCall && data.campaignState?.characters) {
    onFunctionCall({
      name: 'update_characters',
      args: { characters: data.campaignState.characters }
    });
  }

  return data.narrative || 'The story continues...';
}

/**
 * Get conversation history
 */
export async function getHistory(campaignId?: string): Promise<Message[]> {
  const id = campaignId || currentCampaignId;

  try {
    const res = await fetch(`${API_BASE}/history?campaign=${id}`);
    if (!res.ok) {
      return [];
    }
    const data = await res.json();

    // Transform backend history to frontend Message format
    return (data.history || []).map((entry: any, index: number) => ({
      id: `hist-${index}`,
      type: entry.role === 'assistant' ? 'ai' : 'user',
      sender: entry.role === 'assistant' ? 'Dungeon Master' : 'Player',
      text: entry.content,
      timestamp: new Date(entry.timestamp || Date.now())
    }));
  } catch {
    return [];
  }
}

/**
 * Distribute loot to characters
 * Called when player confirms item assignments in the loot card
 */
export async function distributeLoot(
  lootId: string,
  assignments: Array<{ item: string; quantity: number; assignedTo: string }>,
  campaignId?: string
): Promise<{ success: boolean; message?: string; updatedCharacters?: Record<string, BackendCharacter> }> {
  const id = campaignId || currentCampaignId;

  const res = await fetch(`${API_BASE}/distribute-loot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: id,
      lootId,
      assignments
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to distribute loot: ${res.statusText} - ${errorText}`);
  }

  return res.json();
}

/**
 * Skip loot entirely (items are lost)
 */
export async function skipLoot(lootId: string, campaignId?: string): Promise<{ success: boolean }> {
  const id = campaignId || currentCampaignId;

  const res = await fetch(`${API_BASE}/distribute-loot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: id,
      lootId,
      assignments: [],
      skip: true
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to skip loot: ${res.statusText}`);
  }

  return res.json();
}

// ==================== RULES LOOKUP API ====================

import type { SpellDetails, ItemDetails } from '../types';

// Client-side caches for spell/item data
const spellCache = new Map<string, SpellDetails>();
const itemCache = new Map<string, ItemDetails>();

/**
 * Get spell details from D&D 5e API (cached)
 */
export async function getSpellDetails(spellName: string, level?: number): Promise<SpellDetails> {
  const cacheKey = `${spellName.toLowerCase()}:${level || 0}`;
  
  if (spellCache.has(cacheKey)) {
    return spellCache.get(cacheKey)!;
  }
  
  try {
    const url = `${API_BASE}/spell/${encodeURIComponent(spellName)}${level ? `?level=${level}` : ''}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      throw new Error('Spell not found');
    }
    
    const data = await res.json();
    
    // Derive stealth info from components
    const enhanced: SpellDetails = {
      ...data,
      isVisible: data.components?.includes('S'),
      isAudible: data.components?.includes('V')
    };
    
    spellCache.set(cacheKey, enhanced);
    return enhanced;
  } catch (error) {
    console.error(`[apiService] Spell lookup failed: ${spellName}`, error);
    
    const fallback: SpellDetails = {
      name: spellName,
      level: 0,
      school: 'Unknown',
      casting_time: 'Unknown',
      range: 'Unknown',
      components: [],
      duration: 'Unknown',
      concentration: false,
      ritual: false,
      description: '',
      classes: [],
      isVisible: true,
      isAudible: true,
      error: 'Details unavailable - ask the DM (OOC) for info!'
    };
    
    // Cache the fallback too so we don't keep retrying
    spellCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Get item details from D&D 5e API (cached)
 */
export async function getItemDetails(itemName: string): Promise<ItemDetails> {
  const cacheKey = itemName.toLowerCase();
  
  if (itemCache.has(cacheKey)) {
    return itemCache.get(cacheKey)!;
  }
  
  try {
    const url = `${API_BASE}/item/${encodeURIComponent(itemName)}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      throw new Error('Item not found');
    }
    
    const data = await res.json();
    itemCache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.error(`[apiService] Item lookup failed: ${itemName}`, error);
    
    const fallback: ItemDetails = {
      name: itemName,
      equipment_category: 'Unknown',
      properties: [],
      weight: 0,
      description: '',
      error: 'Details unavailable - ask the DM (OOC) for info!'
    };
    
    itemCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Preload spells into cache (call on app mount)
 */
export async function preloadPartySpells(spells: string[]): Promise<void> {
  const uniqueSpells = [...new Set(spells)];
  
  console.log(`[apiService] Preloading ${uniqueSpells.length} spells...`);
  
  // Fetch all in parallel
  await Promise.all(uniqueSpells.map(s => getSpellDetails(s)));
  
  console.log(`[apiService] Spell cache populated with ${spellCache.size} entries`);
}

/**
 * Preload items into cache
 */
export async function preloadPartyItems(items: string[]): Promise<void> {
  const uniqueItems = [...new Set(items)];
  
  console.log(`[apiService] Preloading ${uniqueItems.length} items...`);
  
  await Promise.all(uniqueItems.map(i => getItemDetails(i)));
  
  console.log(`[apiService] Item cache populated with ${itemCache.size} entries`);
}

// Export for backwards compatibility
export default {
  initChat,
  sendMessageToDM,
  loadCampaign,
  submitRoll,
  submitInitiative,
  getCombatState,
  nextTurn,
  endCombat,
  continueStory,
  getHistory,
  transformCharacters,
  transformCombatState,
  distributeLoot,
  skipLoot,
  getSpellDetails,
  getItemDetails,
  preloadPartySpells,
  preloadPartyItems
};
