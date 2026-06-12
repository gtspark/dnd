/**
 * API Service for D&D Campaign Manager
 * Connects to our backend which supports multiple AI providers (Claude, DeepSeek, GPT-4/5, Gemini)
 */

import { ThemeMode, Character, AIProvider, CombatState, Combatant, Message } from "../types";
import type { CharacterSkill, InventoryItem, Ship, Quest, MutationRecord } from "../types";

// In production (vodbase.net), nginx proxies /dnd-api/ to backend /api/
// In dev (localhost), Vite proxies /api/dnd to backend
const isProduction = typeof window !== 'undefined' && !window.location.hostname.includes('localhost');
const API_BASE = isProduction ? '/dnd-api/dnd' : '/api/dnd';

// Get campaign ID from URL or default
function getCampaignId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('campaign') || 'default';
}

// ============ Backend Response Types ============

interface BackendCondition {
  name: string;
  source?: string | null;
  appliedRound?: number | null;
  duration?: { type?: string; value?: number; remaining?: number } | null;
}

interface BackendCharacter {
  name: string;
  class?: string;
  race?: string;
  hp?: { current: number; max: number } | number;
  maxHp?: number;
  ac?: number;
  speed?: number;
  level?: number;
  experience?: {
    current: number;
    levelStart?: number;
    nextLevel?: number | null;
    toNextLevel?: number | null;
    progressPct?: number;
  };
  xp?: number;
  credits?: number;
  gold?: number;
  conditions?: Array<string | BackendCondition>;
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
  skills?: Record<string, CharacterSkill>;
  savingThrows?: Record<string, { proficient: boolean }>;
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
  isDefeated?: boolean;
  actionEconomy?: { action: boolean; bonusAction: boolean; movement: number };
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
  positions?: Record<string, { band: number; name: string }>;
}

interface BackendCampaignState {
  party?: Record<string, BackendCharacter>;
  characters?: Record<string, BackendCharacter>;
  combat?: BackendCombatState;
  resources?: { party_credits?: number; party_gold?: number };
  ship?: Ship;
  quests?: { active?: Quest[] };
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
  initiativeOrder?: BackendCombatant[];
  appliedMutations?: MutationRecord[];  // Ledger entries for audit cards
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
  campaignState?: BackendCampaignState;
  conversationHistory?: any[];
  genre?: 'fantasy' | 'scifi';  // Campaign genre/theme from backend
  characters?: Record<string, BackendCharacter>;
  combat?: BackendCombatState;
  ship?: Ship;
  quests?: { active?: Quest[] };
}

// ============ State Transformers ============

export function transformCharacters(
  backendChars: Record<string, BackendCharacter>,
  theme: ThemeMode,
  campaignId: string
): Character[] {
  const normalizeInventory = (items: any[] | undefined): InventoryItem[] => (items || []).map((item) => {
    if (typeof item === 'string') {
      return {
        name: item,
        equipped: false,
        category: 'misc',
        value: 0,
        condition: 'good',
        stackable: false,
        quantity: 1,
        treasure: false
      };
    }
    return item;
  });

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
      ac: char.ac,
      speed: char.speed,
      level: char.level ?? (char.experience?.current !== undefined ? undefined : 1),
      experience: char.experience || (char.xp !== undefined ? { current: char.xp } : undefined),
      resource: char.credits ?? char.gold ?? 0,
      resourceName: theme === 'scifi' ? 'Creds' : 'GP',
      // Backend conditions may be strings or {name, source, duration} objects
      conditions: (char.conditions || []).map(c => typeof c === 'string' ? c : c.name),
      conditionDetails: (char.conditions || [])
        .filter((c): c is BackendCondition => typeof c === 'object' && c !== null)
        .map(c => ({
          name: c.name,
          source: c.source ?? undefined,
          remainingRounds: c.duration?.remaining ?? c.duration?.value ?? undefined
        })),
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
      savingThrows: char.savingThrows || undefined,
      inventory: normalizeInventory(char.inventory),
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

  const currentIndex = backendCombat.currentTurn || 0;
  const currentCombatant = order[currentIndex];
  const currentName = currentCombatant?.name;
  const currentId = currentCombatant?.id;

  // Look up economy: first from combatant's own property, then by name, then by ID
  const backendInitOrder = backendCombat.initiativeOrder || [];
  const combatantEconomy = backendInitOrder[currentIndex]?.actionEconomy;
  const economy = combatantEconomy
    || backendCombat.actionEconomy?.[currentName || '']
    || backendCombat.actionEconomy?.[currentId || ''];

  return {
    isActive: isActive, // Only true when combat is fully active (not pending)
    isPending: isPending, // Waiting for initiative rolls
    round: backendCombat.round || (isPending ? 0 : 1),
    currentTurnIndex: currentIndex,
    order,
    economy: {
      actionSpent: economy ? !economy.action : false,
      bonusActionSpent: economy ? !economy.bonusAction : false,
      movementRemaining: economy?.movement ?? 30,
      maxMovement: 30
    },
    positions: backendCombat.positions || undefined
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

      // Ship state updates
      if (data.campaignState?.ship) {
        onFunctionCall({
          name: 'update_ship',
          args: {
            ship: data.campaignState.ship
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

      // Mutation ledger entries - render as audit cards with undo
      if (data.appliedMutations && data.appliedMutations.length > 0) {
        onFunctionCall({
          name: 'mutations_applied',
          args: {
            mutations: data.appliedMutations
          }
        });
      }

      // Roll-queue sync: when no new roll request arrived, align the pending-roll
      // banner with the server queue (clears banners for cancelled/completed rolls)
      if (!data.rollRequest && !data.rollQueueEntry) {
        const queue = (data.campaignState?.combat as any)?.rollQueue;
        if (Array.isArray(queue)) {
          const open = queue.filter((e: any) => e.status === 'pending' || e.status === 'partial');
          onFunctionCall({
            name: 'roll_queue_sync',
            args: { entry: open.length > 0 ? open[open.length - 1] : null }
          });
        }
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
 * Send a message to the DM in above-table / dm-question mode.
 * Uses the same endpoint but with mode='dm-question'.
 * Intentionally ignores combat, loot, character updates — only returns narrative + optional roll request.
 * Nothing is saved to conversation history or RAG.
 */
export async function sendSideChatMessage(
  question: string,
  character: string,
  campaignId?: string
): Promise<{ narrative: string; rollRequest?: string }> {
  const id = campaignId || currentCampaignId;

  const res = await fetch(`${API_BASE}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: id,
      action: question,
      character,
      mode: 'dm-question'
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Side chat error: ${res.status} - ${errorText}`);
  }

  const data: ActionResponse = await res.json();
  return {
    narrative: data.narrative || data.error || 'No response from DM',
    rollRequest: data.rollRequest
  };
}

/**
 * Update ship power allocation (player mechanic)
 */
export async function updateShipPower(
  allocations: Record<string, number>,
  campaignId?: string
): Promise<{ success: boolean; ship: any }> {
  const id = campaignId || currentCampaignId;
  const res = await fetch(`${API_BASE}/ship/power`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign: id, allocations })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Power allocation failed: ${err}`);
  }
  return res.json();
}

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

export async function resolveRollQueueEntry(
  queueId: string,
  payload: {
    participantId?: string;
    participantName?: string;
    total: number;
    natural: number;
    modifier: number;
    rolls?: number[];
    formula?: string;
    notation?: string;
    notes?: string;
    submittedBy?: string;
  },
  campaignId?: string
): Promise<{ success: boolean; entry: any; rollQueue: any[] }> {
  const id = campaignId || currentCampaignId;
  const res = await fetch(`${API_BASE}/roll-queue/${encodeURIComponent(queueId)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign: id, ...payload })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to resolve roll queue entry: ${err}`);
  }

  return res.json();
}

/**
 * Submit initiative roll (for pending combat)
 */
export async function submitInitiative(
  playerInitiatives: Array<{ id: string; name: string; initiative: number }>,
  campaignId?: string
): Promise<ActionResponse> {
  const id = campaignId || currentCampaignId;

  const res = await fetch(`${API_BASE}/combat/initiative`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: id,
      playerInitiatives // Array of { id, name, initiative } - totals already calculated
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
  if (onFunctionCall && data.campaignState?.ship) {
    onFunctionCall({
      name: 'update_ship',
      args: { ship: data.campaignState.ship }
    });
  }
  // Roll requests from continue responses (e.g. follow-up checks after a roll resolves)
  if (onFunctionCall && (data.rollRequest || data.rollQueueEntry)) {
    onFunctionCall({
      name: 'request_roll',
      args: { request: data.rollRequest, queueEntry: data.rollQueueEntry }
    });
  } else if (onFunctionCall) {
    // No new request — sync the banner against the server queue
    const queue = (data.campaignState?.combat as any)?.rollQueue;
    if (Array.isArray(queue)) {
      const open = queue.filter((e: any) => e.status === 'pending' || e.status === 'partial');
      onFunctionCall({ name: 'roll_queue_sync', args: { entry: open.length > 0 ? open[open.length - 1] : null } });
    }
  }
  // Ledger audit cards from continue responses
  if (onFunctionCall && Array.isArray(data.appliedMutations) && data.appliedMutations.length > 0) {
    onFunctionCall({ name: 'mutations_applied', args: { mutations: data.appliedMutations } });
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

// Player character edit (HP, credits)
export async function updateCharacter(
  characterId: string,
  updates: { hp_current?: number; credits?: number; experience?: number; level?: number },
  campaignId?: string
): Promise<{ success: boolean; character: { hp: { current: number; max: number }; credits: number; experience?: any; level?: number } }> {
  const campaign = campaignId || getCampaignId();
  const resp = await fetch(`${API_BASE}/character/${characterId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaign, ...updates })
  });
  if (!resp.ok) throw new Error(`Failed to update character: ${resp.status}`);
  return resp.json();
}

// "Previously on..." recap from the most recent finished session
export async function getSessionRecap(
  campaignId?: string
): Promise<{ recap: string | null; sessionId: string | null; endedAt: string | null }> {
  const campaign = campaignId || getCampaignId();
  const resp = await fetch(`${API_BASE}/session/recap?campaign=${campaign}`);
  if (!resp.ok) return { recap: null, sessionId: null, endedAt: null };
  return resp.json();
}

// Undo a ledgered mutation (audit-card undo button)
export async function undoMutation(
  mutationId: string,
  campaignId?: string
): Promise<{ success: boolean; entry: MutationRecord; characters: Record<string, BackendCharacter>; combat?: BackendCombatState }> {
  const campaign = campaignId || getCampaignId();
  const resp = await fetch(`${API_BASE}/mutation/${mutationId}/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId: campaign })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `Failed to undo mutation: ${resp.status}`);
  return data;
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
  preloadPartyItems,
  updateCharacter,
  undoMutation
};
