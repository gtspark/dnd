import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './components/Icons';
import { DiceRoller } from './components/DiceRoller';
import { LootDistributionCard } from './components/LootDistributionCard';
import { SpellCard } from './components/SpellCard';
import { ItemCard } from './components/ItemCard';
import { CompanionRoster } from './components/CompanionRoster';
import CharacterSheetModal from './components/CharacterSheetModal';
import { SideChat } from './components/SideChat';
import { initChat, sendMessageToDM, loadCampaign, getHistory, transformCharacters, transformCombatState, distributeLoot, skipLoot, submitInitiative } from './services/geminiService';
import { preloadPartySpells, preloadPartyItems, continueStory, updateCharacter, resolveRollQueueEntry, undoMutation, getSessionRecap } from './services/apiService';
import { ShipSystemsModal } from './components/ShipSystemsModal';
import { MutationCard } from './components/MutationCard';
import { ZoneLane } from './components/ZoneLane';
import { Character, Message, ThemeMode, AIProvider, CombatState, Combatant, CombatEconomy, LootDistribution, LootDistributionMessage, AnyMessage, Ship, Quest, MutationRecord, MutationAuditMessage } from './types';

// Get campaign ID from URL
const getCampaignId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('campaign') || 'default';
};

const mockItem = (name: string) => ({
  name,
  equipped: false,
  category: 'misc' as const,
  value: 0,
  condition: 'good' as const,
  stackable: false,
  quantity: 1,
  treasure: false
});

const MOCK_CHARACTERS_FANTASY: Character[] = [
  {
    id: 'c1', name: 'Kaelen', class: 'High Paladin',
    avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=400&h=400&fit=crop',
    hp: 42, maxHp: 55, resource: 125, resourceName: 'GP',
    conditions: ['Blessed'],
    stats: { str: 18, dex: 10, con: 16, int: 10, wis: 14, cha: 16 },
    inventory: ['Sunblade', 'Potion of Healing', 'Rope (50ft)'].map(mockItem),
    heldSpells: ['Shield of Faith']
  },
  {
    id: 'c2', name: 'Lyra', class: 'Shadow Rogue',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
    hp: 28, maxHp: 35, resource: 450, resourceName: 'GP',
    conditions: [],
    stats: { str: 10, dex: 18, con: 12, int: 14, wis: 12, cha: 10 },
    inventory: ['Daggers (x4)', 'Thieves Tools', 'Cloak of Shadows'].map(mockItem),
    heldSpells: []
  },
  {
    id: 'c3', name: 'Eldrin', class: 'Archmage',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop',
    hp: 22, maxHp: 22, resource: 80, resourceName: 'GP',
    conditions: ['Concentrating'],
    stats: { str: 8, dex: 12, con: 10, int: 20, wis: 16, cha: 12 },
    inventory: ['Spellbook', 'Arcane Focus', 'Scroll of Fly'].map(mockItem),
    heldSpells: ['Haste']
  }
];

const MOCK_CHARACTERS_SCIFI: Character[] = [
  {
    id: 's1', name: 'Jax-7', class: 'Cyborg Merc',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop',
    hp: 65, maxHp: 80, resource: 2400, resourceName: 'Creds',
    conditions: ['Overclocked'],
    stats: { str: 16, dex: 14, con: 18, int: 12, wis: 10, cha: 8 },
    inventory: ['Plasma Rifle', 'Stimpack', 'Data Spike'].map(mockItem),
    heldSpells: []
  },
  {
    id: 's2', name: 'Nova', class: 'Technomancer',
    avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=400&fit=crop',
    hp: 35, maxHp: 40, resource: 5000, resourceName: 'Creds',
    conditions: [],
    stats: { str: 8, dex: 12, con: 10, int: 18, wis: 14, cha: 16 },
    inventory: ['Holo-Deck', 'EMP Grenade', 'Drone Remote'].map(mockItem),
    heldSpells: ['Neural Breach']
  }
];

const INITIAL_ECONOMY: CombatEconomy = {
  actionSpent: false,
  bonusActionSpent: false,
  movementRemaining: 30,
  maxMovement: 30
};

export default function App() {
  const [campaignId] = useState<string>(getCampaignId());
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>('fantasy');
  const [characters, setCharacters] = useState<Character[]>(MOCK_CHARACTERS_FANTASY);
  const [activeCharId, setActiveCharId] = useState<string>(MOCK_CHARACTERS_FANTASY[0].id);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'stats' | 'inventory' | 'conditions' | 'spells'>('stats');
  const [brightness, setBrightness] = useState(1.15);
  const [messages, setMessages] = useState<Message[]>([
    { id: 'init', type: 'ai', sender: 'Dungeon Master', text: "Loading campaign...", timestamp: new Date() }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [provider, setProvider] = useState<AIProvider>('claude');
  const [showSettings, setShowSettings] = useState(false);
  const [showCharSheet, setShowCharSheet] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSideChat, setShowSideChat] = useState(false);
  const [ship, setShip] = useState<Ship | null>(null);
  const [activeQuests, setActiveQuests] = useState<Quest[]>([]);
  const [pendingRollQueueEntry, setPendingRollQueueEntry] = useState<any | null>(null);
  const [showShipSheet, setShowShipSheet] = useState(false);
  const [showExitCombatConfirm, setShowExitCombatConfirm] = useState(false);
  // Loot distribution state - maps lootId to loot data
  const [pendingLoot, setPendingLoot] = useState<Map<string, LootDistribution>>(new Map());
  // Track which loot cards have been distributed (for greying out)
  const [distributedLoot, setDistributedLoot] = useState<Map<string, string>>(new Map()); // lootId -> distribution message
  const [undoneMutations, setUndoneMutations] = useState<Set<string>>(new Set()); // mutation ids undone this session
  const [undoingMutationId, setUndoingMutationId] = useState<string | null>(null);
  const [sessionRecap, setSessionRecap] = useState<string | null>(null); // "previously on" banner

  const [combat, setCombat] = useState<CombatState>({
    isActive: false,
    round: 0,
    currentTurnIndex: 0,
    order: [],
    economy: INITIAL_ECONOMY
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // Refs to hold current values for callbacks (avoids stale closures)
  const charactersRef = useRef<Character[]>(characters);
  const combatRef = useRef<CombatState>(combat);
  const themeRef = useRef<ThemeMode>(theme);
  const pendingLootRef = useRef<Map<string, LootDistribution>>(pendingLoot);

  // Keep refs in sync with state
  useEffect(() => { charactersRef.current = characters; }, [characters]);
  useEffect(() => { combatRef.current = combat; }, [combat]);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { pendingLootRef.current = pendingLoot; }, [pendingLoot]);

  // activeChar should always be a player-controlled character, not a companion
  const playerChars = characters.filter(c => c.controlledBy !== 'dm');
  const activeChar = characters.find(c => c.id === activeCharId) || playerChars[0] || characters[0];
  const isFantasy = theme === 'fantasy';

  // Load campaign data from backend on mount
  useEffect(() => {
    const loadCampaignData = async () => {
      try {
        console.log(`[App] Loading campaign: ${campaignId}`);

        // Load campaign state from backend
        const stateResponse = await loadCampaign(campaignId);
        console.log('[App] Campaign state loaded:', stateResponse);

        // Get theme/genre from backend response, fallback to 'fantasy' if not provided
        const detectedTheme: ThemeMode = stateResponse.genre || 'fantasy';
        console.log(`[App] Using theme from backend: ${detectedTheme}`);
        setTheme(detectedTheme);

        // State response IS the campaign state directly (not wrapped)
        const campaignState: any = stateResponse.campaignState || stateResponse;

        if (campaignState) {
          // Characters are in .characters, party resources in .party
          const backendChars = campaignState.characters;
          let loadedCharacters = characters;
          if (backendChars && Object.keys(backendChars).length > 0) {
            loadedCharacters = transformCharacters(backendChars, detectedTheme, campaignId);
            console.log('[App] Transformed characters:', loadedCharacters);
            setCharacters(loadedCharacters);
            // Set active character to first player-controlled character (not companion)
            const playerChars = loadedCharacters.filter(c => c.controlledBy !== 'dm');
            setActiveCharId(playerChars[0]?.id || loadedCharacters[0]?.id || 'c1');
          }

          // Load ship state if present
          if (campaignState.ship && campaignState.ship.hull) {
            setShip(campaignState.ship as Ship);
            console.log('[App] Ship state loaded:', campaignState.ship.name);
          }

          if (Array.isArray(campaignState.quests?.active)) {
            setActiveQuests(campaignState.quests.active as Quest[]);
          }

          // "Previously on..." recap banner from the last finished session
          getSessionRecap(campaignId).then(r => {
            if (r.recap) setSessionRecap(r.recap);
          }).catch(() => { /* recap is best-effort */ });

          // Load combat state if active or pending - use loadedCharacters instead of stale state
          if (campaignState.combat?.active === true || campaignState.combat?.active === 'pending') {
            const combatState = transformCombatState(campaignState.combat, loadedCharacters);
            console.log('[App] Loaded combat state:', { backendActive: campaignState.combat.active, isPending: combatState.isPending, isActive: combatState.isActive });
            setCombat(combatState);
          }
          const pendingRoll = campaignState.combat?.rollQueue?.find((entry: any) =>
            entry?.status === 'pending' || entry?.status === 'partial'
          );
          setPendingRollQueueEntry(pendingRoll || null);
        }

        // Load conversation history
        const history = await getHistory(campaignId);
        if (history && history.length > 0) {
          console.log(`[App] Loaded ${history.length} messages from history`);
          setMessages(history);
        } else {
          // No history - show campaign intro
          const introText = detectedTheme === 'scifi'
            ? 'The neon lights of the orbital station flicker as your crew gathers in the docking bay. Your ship awaits, engines humming with potential. The galaxy stretches before you, full of danger and opportunity. What would you like to do?'
            : `The village of Thornhaven sits nestled in a valley beneath the towering peaks of the Silverpeak Mountains, their snow-capped summits glinting like dragon scales in the afternoon sun. The autumn air carries the scent of woodsmoke and freshly baked bread from the village bakery.

You stand in the common room of the Laughing Griffin tavern, where three adventurers have answered the urgent summons of Elder Miriam. The common folk whisper nervously at their tables - something has disturbed the ancient woods to the north.

**Kira Moonwhisper**, the moon elf scholar with silver hair and knowing violet eyes, studies a weathered map spread across the oak table.

**Thorne Ironheart**, the grizzled dwarven cleric whose warhammer has seen countless battles, stands with arms crossed, his expression grave.

**Riven Shadowstep**, the half-elf rogue whose reputation precedes them, idly spins a dagger while watching the tavern door.

Elder Miriam approaches your table, her face lined with worry. "Thank you for coming," she says quietly. "Three nights ago, the merchant caravan from Westmarch vanished in the Whispering Woods. We found one survivor - delirious, speaking of 'moving shadows' and 'eyes in the trees.' The town guard refuses to investigate. They say the woods have... changed."

She places a worn leather pouch on the table. The coins inside clink softly. "This is all we can offer - 500 gold pieces total. But if you don't help us, I fear Thornhaven will be cut off from the world. Please. Will you investigate the Whispering Woods and discover what happened to our people?"

The tavern falls silent, waiting for your answer.

What do you do?`;
          
          setMessages([{
            id: 'init',
            type: 'ai',
            sender: 'Dungeon Master',
            text: introText,
            timestamp: new Date()
          }]);
        }

      } catch (error) {
        console.error('[App] Failed to load campaign:', error);
        setMessages([{
          id: 'error',
          type: 'system',
          sender: 'System',
          text: `Failed to load campaign "${campaignId}". Using offline mode.`,
          timestamp: new Date()
        }]);
      } finally {
        setIsLoading(false);
      }
    };

    loadCampaignData();
  }, [campaignId]);

  useEffect(() => {
    initChat(theme, characters, provider);
  }, [theme, provider]);

  // Diagnostic: log aside state to browser console
  useEffect(() => {
    const run = () => {
      const aside = document.getElementById('codex-aside');
      if (!aside) { console.log('DIAG: codex-aside NOT IN DOM'); return; }
      const r = aside.getBoundingClientRect();
      const cs = getComputedStyle(aside);
      const parent = aside.parentElement;
      console.log('DIAG aside:', {
        w: Math.round(r.width), h: Math.round(r.height),
        left: Math.round(r.left), top: Math.round(r.top),
        display: cs.display, order: cs.order, position: cs.position,
        transform: cs.transform
      });
      if (parent) {
        const siblings = [];
        for (const child of parent.children) {
          const cr = child.getBoundingClientRect();
          const ccs = getComputedStyle(child);
          siblings.push({
            tag: child.tagName, id: child.id || '',
            cls: (child.getAttribute('class') || '').substring(0, 60),
            w: Math.round(cr.width), h: Math.round(cr.height),
            L: Math.round(cr.left),
            disp: ccs.display, ord: ccs.order, pos: ccs.position,
            vis: ccs.visibility, opa: ccs.opacity
          });
        }
        console.log('DIAG ALL siblings:', siblings);
        console.log('DIAG parent:', {
          display: getComputedStyle(parent).display,
          flexDirection: getComputedStyle(parent).flexDirection,
          overflow: getComputedStyle(parent).overflow,
          width: Math.round(parent.getBoundingClientRect().width),
          paddingLeft: getComputedStyle(parent).paddingLeft,
          marginLeft: getComputedStyle(parent).marginLeft
        });
      }
    };
    const t = setTimeout(run, 2000);
    return () => clearTimeout(t);
  }, [isLoading, characters]);

  // Preload spell and item data for all party members
  useEffect(() => {
    if (characters.length > 0 && !isLoading) {
      const allSpells = characters.flatMap(c => c.heldSpells);
      // Only preload items that have baseItem mapping (SRD equipment)
      const baseItems = characters.flatMap(c => 
        c.inventory
          .filter(item => (item.category === 'weapon' || item.category === 'armor') && item.baseItem && !item.custom)
          .map(item => item.baseItem!)
      );
      
      if (allSpells.length > 0) {
        preloadPartySpells([...new Set(allSpells)]);
      }
      if (baseItems.length > 0) {
        preloadPartyItems([...new Set(baseItems)]);
      }
    }
  }, [characters, isLoading]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isThinking]);

  const handleFunctionCall = useCallback((fc: any) => {
    console.log('[App] handleFunctionCall:', fc);

    // Handle backend's start_combat response
    if (fc.name === 'start_combat') {
      const { combat: backendCombat, pending, pendingCombat } = fc.args;
      if (backendCombat || pendingCombat) {
        const combatData = backendCombat || {
          active: pending ? 'pending' : true,
          round: 1,
          currentTurn: 0,
          initiativeOrder: [],
          enemyInitiatives: pendingCombat?.enemies || [],
          playerCharacters: pendingCombat?.playerCharacters || []
        };
        // Use ref to get current characters (avoids stale closure)
        const transformed = transformCombatState(combatData, charactersRef.current);
        console.log('[App] start_combat received:', { backendActive: combatData.active, transformedIsActive: transformed.isActive, transformedIsPending: transformed.isPending });
        
        // IMPORTANT: Don't downgrade from active to pending - this prevents race condition
        // where backend's stale 'pending' state overwrites frontend's 'active' state
        setCombat(prev => {
          if (prev.isActive && !transformed.isActive && transformed.isPending) {
            console.log('[App] Ignoring downgrade from active to pending');
            return prev; // Keep current active state
          }
          return transformed;
        });
      }
    }

    // Handle backend's update_characters response
    else if (fc.name === 'update_characters') {
      const { characters: backendChars } = fc.args;
      if (backendChars && Object.keys(backendChars).length > 0) {
        // Use ref to get current theme (avoids stale closure)
        const transformed = transformCharacters(backendChars, themeRef.current, campaignId);
        setCharacters(transformed);
      }
    }

    // Handle ship state updates
    else if (fc.name === 'update_ship') {
      const { ship: shipData } = fc.args;
      if (shipData && shipData.hull) {
        setShip(shipData as Ship);
        console.log('[App] Ship state updated:', shipData.name);
      }
    }

    // Handle roll request from backend
    else if (fc.name === 'request_roll') {
      const { request, queueEntry } = fc.args;
      console.log('[App] Roll requested:', request);
      if (queueEntry?.queueId) {
        setPendingRollQueueEntry(queueEntry);
      }
    }

    // Handle combat ended from backend
    else if (fc.name === 'end_combat') {
      console.log('[App] Combat ended via backend signal');
      setCombat(prev => ({
        ...prev,
        isActive: false,
        isPending: false,
        lastOrder: prev.order  // Preserve order for potential "Restore Combat"
      }));
    }

    // Handle combat state update (e.g., after initiative rolls complete)
    else if (fc.name === 'combat_state_update') {
      const { combat: backendCombat } = fc.args;
      if (backendCombat) {
        console.log('[App] combat_state_update received:', { 
          backendActive: backendCombat.active, 
          initiativeOrderLength: backendCombat.initiativeOrder?.length,
          round: backendCombat.round 
        });
        const transformed = transformCombatState(backendCombat, charactersRef.current);
        console.log('[App] combat_state_update transformed:', { 
          isActive: transformed.isActive, 
          isPending: transformed.isPending, 
          orderLength: transformed.order?.length,
          order: transformed.order?.map(c => `${c.name}(${c.initiative})`).join(' → ')
        });
        setCombat(transformed);
      }
    }

    // Handle loot offered from backend (after combat ends with loot)
    else if (fc.name === 'offer_loot') {
      const { lootData } = fc.args;
      console.log('[App] Loot offered:', lootData);

      if (lootData && lootData.lootId) {
        // Skip if this loot offer is already displayed (backend re-sends until distributed)
        if (pendingLootRef.current.has(lootData.lootId)) {
          return;
        }
        // Store in pending loot
        setPendingLoot(prev => new Map(prev).set(lootData.lootId, lootData));
        
        // Add a loot distribution message to the chat
        const lootMsg: LootDistributionMessage = {
          id: `loot-${lootData.lootId}`,
          type: 'loot_distribution',
          sender: 'System',
          timestamp: new Date(),
          lootData: lootData
        };
        setMessages(prev => [...prev, lootMsg as any]);
      }
    }

    // Roll-queue sync: align the pending-roll banner with server state
    else if (fc.name === 'roll_queue_sync') {
      const { entry } = fc.args;
      setPendingRollQueueEntry(entry || null);
    }

    // Mutation ledger entries - render as audit cards in the chat stream
    else if (fc.name === 'mutations_applied') {
      const { mutations } = fc.args as { mutations: MutationRecord[] };
      if (mutations && mutations.length > 0) {
        const auditMsg: MutationAuditMessage = {
          id: `mutations-${mutations[0].id}`,
          type: 'mutation_audit',
          sender: 'System',
          timestamp: new Date(),
          mutations
        };
        setMessages(prev => [...prev, auditMsg as any]);
      }
    }

    // Legacy function call handlers (for backwards compatibility)
    else if (fc.name === 'update_character_status') {
      const { characterId, hpChange, addCondition, removeCondition, addSpell, removeSpell, resourceChange } = fc.args;
      setCharacters(prev => prev.map(char => {
        if (char.id !== characterId) return char;
        let newChar = { ...char };
        if (hpChange) newChar.hp = Math.min(newChar.maxHp, Math.max(0, newChar.hp + hpChange));
        if (addCondition && !newChar.conditions.includes(addCondition)) newChar.conditions = [...newChar.conditions, addCondition];
        if (removeCondition) newChar.conditions = newChar.conditions.filter(c => c !== removeCondition);
        if (addSpell && !newChar.heldSpells.includes(addSpell)) newChar.heldSpells = [...newChar.heldSpells, addSpell];
        if (removeSpell) newChar.heldSpells = newChar.heldSpells.filter(s => s !== removeSpell);
        if (resourceChange) newChar.resource += resourceChange;
        return newChar;
      }));
    } else if (fc.name === 'setup_combat') {
      const { combatants } = fc.args;
      const enrichedCombatants = combatants.map((c: any) => {
        const playerChar = characters.find(pc => pc.id === c.id);
        return {
          ...c,
          avatar: playerChar ? playerChar.avatar : undefined
        };
      });
      setCombat({
        isActive: true,
        round: 1,
        currentTurnIndex: 0,
        order: enrichedCombatants,
        lastOrder: enrichedCombatants,
        economy: INITIAL_ECONOMY
      });
    } else if (fc.name === 'spend_combat_resource') {
      const { actionSpent, bonusActionSpent, movementUsed } = fc.args;
      setCombat(prev => ({
        ...prev,
        economy: {
          ...prev.economy,
          actionSpent: actionSpent ?? prev.economy.actionSpent,
          bonusActionSpent: bonusActionSpent ?? prev.economy.bonusActionSpent,
          movementRemaining: Math.max(0, prev.economy.movementRemaining - (movementUsed ?? 0))
        }
      }));
    }
  }, [campaignId]);

  const handleThemeToggle = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    const newChars = newTheme === 'fantasy' ? MOCK_CHARACTERS_FANTASY : MOCK_CHARACTERS_SCIFI;
    setCharacters(newChars);
    setActiveCharId(newChars[0].id);
    setCombat(prev => ({ ...prev, isActive: false, round: 0, currentTurnIndex: 0, order: [] }));
    setMessages([{ id: Date.now().toString(), type: 'ai', sender: 'Dungeon Master', text: `Shifting reality to ${newTheme}...`, timestamp: new Date() }]);
    initChat(newTheme, newChars, provider);
  };

  const startCombat = async () => {
    setIsThinking(true);
    // Use ref to get current characters (avoids stale closure)
    const currentChars = charactersRef.current;
    const playerRolls = currentChars.map(char => {
      const roll = Math.floor(Math.random() * 20) + 1;
      const dexMod = Math.floor((char.stats.dex - 10) / 2);
      return { id: char.id, name: char.name, type: 'player' as const, initiative: roll + dexMod, avatar: char.avatar };
    });

    const rollStrings = playerRolls.map(r => `${r.name}: ${r.initiative}`).join(', ');
    setMessages(prev => [...prev, { id: Date.now().toString(), type: 'combat', sender: 'System', text: `COMBAT START! Party Initiatives: ${rollStrings}`, timestamp: new Date() }]);

    try {
      const prompt = `[SYSTEM]: COMBAT START. Party Initiatives: ${rollStrings}. Roll initiatives for all enemies individually and describe the start of the encounter. USE THE 'setup_combat' tool with ALL participants.`;
      const stream = await sendMessageToDM(prompt, handleFunctionCall);
      if (stream) {
        const aiMsgId = Date.now().toString() + 'combat-init';
        setMessages(prev => [...prev, { id: aiMsgId, type: 'ai', sender: 'Dungeon Master', text: '', timestamp: new Date(), isThinking: true }]);
        let fullText = '';
        for await (const chunk of stream) {
            fullText += chunk;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText, isThinking: false } : m));
        }
      }
      // Combat state is set by handleFunctionCall via AI tool calls (setup_combat/combat_state_update)
      // Only apply fallback if combat is still not active after AI response
      if (!combatRef.current.isActive) {
        setCombat(prev => ({ ...prev, isPending: false, isActive: true, round: 1, order: playerRolls }));
      }
    } catch (e) { console.error(e); } finally { setIsThinking(false); }
  };

  const reEnterCombat = () => {
    if (combat.lastOrder) {
      setCombat(prev => ({ ...prev, isActive: true, order: prev.lastOrder || [], economy: INITIAL_ECONOMY }));
    }
  };

  // Roll initiative for all party members when combat is pending
  const rollAllInitiative = async () => {
    setIsThinking(true);
    // Use ref to get current characters (avoids stale closure)
    const currentChars = charactersRef.current;
    const playerRolls = currentChars.map(char => {
      const roll = Math.floor(Math.random() * 20) + 1;
      const dexMod = Math.floor((char.stats.dex - 10) / 2);
      return { id: char.id, name: char.name, roll, dexMod, total: roll + dexMod };
    });

    const rollStrings = playerRolls.map(r => `${r.name}: ${r.total} (${r.roll}+${r.dexMod})`).join(', ');
    // Use initiative type for custom group display
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      type: 'initiative',
      sender: 'Party',
      text: `Initiative Rolls`,
      timestamp: new Date(),
      initiativeRolls: playerRolls
    }]);

    try {
      // Submit individual player initiatives to backend (totals already include dexMod)
      const playerInits = playerRolls.map(r => ({ id: r.id, name: r.name, initiative: r.total }));
      const initResponse: any = await submitInitiative(playerInits, campaignId);
      console.log('[App] Initiative submitted to backend:', initResponse);

      // Get the full initiative order from backend response (includes enemies)
      let fullInitiativeOrder: Combatant[] = [];
      if (initResponse.initiativeOrder && initResponse.initiativeOrder.length > 0) {
        fullInitiativeOrder = initResponse.initiativeOrder.map((c: any) => ({
          id: c.id || c.name.toLowerCase().replace(/\s+/g, '-'),
          name: c.name,
          type: c.isPlayer ? 'player' as const : 'enemy' as const,
          initiative: c.initiative,
          avatar: currentChars.find(char => char.name === c.name)?.avatar
        }));
      }

      const prompt = `[SYSTEM]: Initiative rolled! ${rollStrings}. Now establish the full turn order including enemies and begin Round 1.`;
      const stream = await sendMessageToDM(prompt, handleFunctionCall);
      if (stream) {
        const aiMsgId = Date.now().toString() + 'init-result';
        setMessages(prev => [...prev, { id: aiMsgId, type: 'ai', sender: 'Dungeon Master', text: '', timestamp: new Date(), isThinking: true }]);
        let fullText = '';
        for await (const chunk of stream) {
          fullText += chunk;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText, isThinking: false } : m));
        }
      }
      // Combat state is set by handleFunctionCall via AI tool calls (setup_combat/combat_state_update)
      // Only apply fallback if combat is still not active after AI response
      if (!combatRef.current.isActive) {
        const initialOrder: Combatant[] = fullInitiativeOrder.length > 0 
          ? fullInitiativeOrder
          : playerRolls
            .map(r => ({
              id: r.id,
              name: r.name,
              type: 'player' as const,
              initiative: r.total,
              avatar: currentChars.find(c => c.id === r.id)?.avatar
            }))
            .sort((a, b) => b.initiative - a.initiative);
        console.log('[App] Setting combat order (fallback):', initialOrder.map(c => `${c.name}(${c.initiative})`).join(' → '));
        setCombat(prev => ({ ...prev, isPending: false, isActive: true, round: 1, order: initialOrder }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsThinking(false);
    }
  };

  const nextTurn = () => {
    setCombat(prev => {
      let nextIndex = prev.currentTurnIndex + 1;
      let nextRound = prev.round;
      const orderLen = prev.order.length;

      // Wrap to next round if at end
      if (nextIndex >= orderLen) {
        nextIndex = 0;
        nextRound += 1;
      }

      // Skip dead combatants (loop at most once through the order)
      let attempts = 0;
      while (prev.order[nextIndex]?.isDead && attempts < orderLen) {
        nextIndex += 1;
        if (nextIndex >= orderLen) {
          nextIndex = 0;
          nextRound += 1;
        }
        attempts += 1;
      }

      return {
        ...prev,
        currentTurnIndex: nextIndex,
        round: nextRound,
        economy: INITIAL_ECONOMY
      };
    });
  };

  // Continue story button for narrative campaigns (Dax) - uses dedicated endpoint
  // No player message is logged, just the DM's continuation
  const handleContinueStory = async () => {
    if (isThinking) return;
    setIsThinking(true);
    
    try {
      // Use dedicated continue endpoint - no player message logged
      const narrative = await continueStory(campaignId, handleFunctionCall);
      // Add the DM response directly (no intermediate "thinking" message needed - global indicator handles that)
      const aiMsgId = Date.now().toString() + 'continue';
      setMessages(prev => [...prev, { id: aiMsgId, type: 'ai', sender: 'Dungeon Master', text: narrative, timestamp: new Date() }]);
    } catch (e) {
      console.error('Continue story error:', e);
    } finally {
      setIsThinking(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isThinking || !activeChar) return;
    const userMsg: Message = { id: Date.now().toString(), type: 'user', sender: activeChar.name, text: inputValue, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsThinking(true);
    try {
      const stream = await sendMessageToDM(`${activeChar.name}: ${inputValue}`, handleFunctionCall);
      if (stream) {
        const aiMsgId = Date.now().toString() + 'ai';
        setMessages(prev => [...prev, { id: aiMsgId, type: 'ai', sender: 'Dungeon Master', text: '', timestamp: new Date(), isThinking: true }]);
        let fullText = '';
        for await (const chunk of stream) {
            fullText += chunk;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText, isThinking: false } : m));
        }
      }
    } catch (e: any) { 
      console.error(e);
      // Show turn order errors gracefully
      if (e?.message?.includes('Not Your Turn') || e?.message?.includes("'s turn")) {
        const match = e.message.match(/It's ([^']+)'s turn/);
        const currentTurnName = match ? match[1] : 'another character';
        const errorMsg: Message = { 
          id: Date.now().toString() + 'error', 
          type: 'system', 
          sender: 'System', 
          text: `⚠️ It's **${currentTurnName}**'s turn in combat. Select them from the party panel to act.`, 
          timestamp: new Date() 
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally { setIsThinking(false); }
  };

  // Parse modifier from the last DM message requesting a roll
  const parseModifierFromContext = (faces: number): number => {
    const lastDmMsg = [...messages].reverse().find(m => m.type === 'ai' && m.text);
    if (!lastDmMsg || !activeChar) return 0;

    const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const findSkill = (skillName: string) => {
      const normalizedSkill = normalizeKey(skillName);
      return Object.entries(activeChar.skills || {}).find(([name]) => normalizeKey(name) === normalizedSkill)?.[1];
    };
    
    if (faces === 20) {
      // Ability name to stat key mapping
      const abilityMap: Record<string, keyof typeof activeChar.stats> = {
        'strength': 'str', 'str': 'str',
        'dexterity': 'dex', 'dex': 'dex',
        'constitution': 'con', 'con': 'con',
        'intelligence': 'int', 'int': 'int',
        'wisdom': 'wis', 'wis': 'wis',
        'charisma': 'cha', 'cha': 'cha'
      };
      
      // First, try to extract skill name and ability from patterns like:
      // "Roll Technology (Intelligence)", "Perception (Wisdom) DC 14", etc.
      const skillMatch = lastDmMsg.text.match(/roll\s+([a-z][a-z\s-]*?)\s*\((strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)\)/i)
        || lastDmMsg.text.match(/\b([a-z][a-z\s-]*?)\s*\((strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)\)\s*(?:\(?(?:DC|dc)\b|\s+to\b)/i);
      
      if (skillMatch) {
        const skillName = (skillMatch[1] || '').trim().toLowerCase();
        const abilityName = (skillMatch[2] || '').toLowerCase();
        const statKey = abilityMap[abilityName];
        
        if (statKey && activeChar.stats[statKey] !== undefined) {
          // Calculate ability modifier: (score - 10) / 2, rounded down
          const abilityMod = Math.floor((activeChar.stats[statKey] - 10) / 2);
          
          // Check if character has this skill and is proficient
          let profBonus = 0;
          const skill = findSkill(skillName);
          if (skill) {
            if (skill.proficient) {
              profBonus = activeChar.proficiencyBonus || 2;
            }
          }
          
          console.log(`[Roll] Skill: ${skillName}, Ability: ${abilityName} (${statKey}), AbilityMod: ${abilityMod}, ProfBonus: ${profBonus}`);
          return abilityMod + profBonus;
        }
      }
      
      // Fallback: just ability check like "Roll Intelligence", "Wisdom check"
      const abilityOnlyMatch = lastDmMsg.text.match(/roll\s+(\w+)(?:\s+check)?|(\w+)\s+(?:check|saving throw)/i);
      if (abilityOnlyMatch) {
        const abilityName = (abilityOnlyMatch[1] || abilityOnlyMatch[2] || '').toLowerCase();
        const statKey = abilityMap[abilityName];
        if (statKey && activeChar.stats[statKey] !== undefined) {
          const abilityMod = Math.floor((activeChar.stats[statKey] - 10) / 2);
          console.log(`[Roll] Ability only: ${abilityName} (${statKey}), Mod: ${abilityMod}`);
          return abilityMod;
        }
      }
      
      // Fallback: Attack rolls - match "+5 to hit", "-1 modifier", etc.
      const modMatch = lastDmMsg.text.match(/([+-]\d+)\s*(?:to hit|modifier|bonus)/i);
      return modMatch ? parseInt(modMatch[1], 10) : 0;
    } else {
      // Damage rolls: match "1d8+3", "2d6-1 damage", etc.
      const damageMatch = lastDmMsg.text.match(new RegExp(`\\d*d${faces}\\s*([+-]\\s*\\d+)`, 'i'));
      return damageMatch ? parseInt(damageMatch[1], 10) : 0;
    }
  };

  const formatModifier = (modifier: number) => `${modifier >= 0 ? '+' : ''}${modifier}`;

  // Parse suggested dice from last DM message (e.g., "1d4+4 piercing, PLUS 2d6 Sneak Attack")
  const parseSuggestedDice = (): { qty: number; faces: number }[] | null => {
    const lastDmMsg = [...messages].reverse().find(m => m.type === 'ai' && m.text);
    if (!lastDmMsg) return null;
    
    // Look for roll request patterns
    if (!/roll|🎲/i.test(lastDmMsg.text)) return null;
    
    // Match all dice patterns: 1d4, 2d6, 1d8+3, etc. (ignore the modifier, backend handles it)
    const dicePattern = /(\d+)d(\d+)/gi;
    const matches = [...lastDmMsg.text.matchAll(dicePattern)];
    
    if (matches.length === 0) return null;
    
    // Filter out d20s (attack rolls should use the d20 button)
    const dice = matches
      .map(m => ({ qty: parseInt(m[1], 10), faces: parseInt(m[2], 10) }))
      .filter(d => d.faces !== 20);
    
    return dice.length > 0 ? dice : null;
  };

  const suggestedDice = parseSuggestedDice();
  const suggestedDiceLabel = suggestedDice 
    ? suggestedDice.map(d => `${d.qty}d${d.faces}`).join(' + ')
    : null;
  const pendingRollParticipant = pendingRollQueueEntry?.participants?.find((participant: any) => {
    if (!activeChar) return false;
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const activeKeys = [activeChar.id, activeChar.name].map(normalize);
    const candidates = [
      participant.participantId,
      participant.id,
      participant.name,
      ...(Array.isArray(participant.aliases) ? participant.aliases : [])
    ].filter(Boolean).map(normalize);
    return activeKeys.some(key => candidates.includes(key));
  }) || pendingRollQueueEntry?.participants?.[0];
  const pendingRollDc = pendingRollParticipant?.dc ?? pendingRollQueueEntry?.dc;
  const pendingRollAbility = pendingRollParticipant?.ability ?? pendingRollQueueEntry?.ability;
  const pendingRollAdvantage = pendingRollParticipant?.advantage ?? pendingRollQueueEntry?.advantage;

  const resolvePendingRollQueue = async (
    natural: number,
    total: number,
    modifier: number,
    rolls: number[],
    notation: string
  ): Promise<boolean> => {
    if (!pendingRollQueueEntry?.queueId || !activeChar) return false;

    const activeParticipant = pendingRollQueueEntry.participants?.find((participant: any) => {
      const candidates = [
        participant.participantId,
        participant.id,
        participant.name,
        ...(Array.isArray(participant.aliases) ? participant.aliases : [])
      ].filter(Boolean).map((value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
      const activeKeys = [activeChar.id, activeChar.name].map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
      return activeKeys.some(key => candidates.includes(key));
    }) || pendingRollQueueEntry.participants?.[0];

    if (!activeParticipant) return false;

    const resolved = await resolveRollQueueEntry(
      pendingRollQueueEntry.queueId,
      {
        participantId: activeParticipant.participantId || activeParticipant.id || activeChar.id,
        participantName: activeParticipant.name || activeChar.name,
        total,
        natural,
        modifier,
        rolls,
        notation,
        formula: notation,
        submittedBy: activeChar.name
      },
      campaignId
    );

    setPendingRollQueueEntry(resolved.entry?.status === 'complete' ? null : resolved.entry);
    const narrative = await continueStory(campaignId, handleFunctionCall);
    const aiMsgId = Date.now().toString() + 'queue-roll';
    setMessages(prev => [...prev, { id: aiMsgId, type: 'ai', sender: 'Dungeon Master', text: narrative, timestamp: new Date() }]);
    return true;
  };

  // Modifier from the pending roll-queue entry (authoritative: ability + skill
  // proficiency from the request itself). Falls back to message-text parsing,
  // which misses two-phase requests whose 🎲 line never reaches the chat.
  const modifierFromQueueEntry = (faces: number): number | null => {
    if (faces !== 20 || !pendingRollQueueEntry || !activeChar) return null;
    const abilityKey = (pendingRollParticipant?.ability || pendingRollQueueEntry.ability || '').toLowerCase();
    if (!abilityKey || !(abilityKey in activeChar.stats)) return null;
    let mod = Math.floor(((activeChar.stats as any)[abilityKey] - 10) / 2);
    // Find a proficient skill named in the request. Match against the character's
    // own skill list (not a regex capture — wording like "with advantage" before
    // the parens broke captures and silently dropped proficiency).
    const reasonText = (pendingRollQueueEntry.reason || pendingRollQueueEntry.metadata?.rawRequest || '').toLowerCase();
    const skillEntry = Object.entries(activeChar.skills || {}).find(([n, s]) =>
      reasonText.includes(n.toLowerCase()) && (!s.ability || s.ability.toLowerCase() === abilityKey)
    );
    if (skillEntry?.[1]?.proficient) mod += activeChar.proficiencyBonus || 2;
    return mod;
  };

  const handleDiceRoll = async (faces: number) => {
    if (!activeChar) return;
    // Honor server-computed advantage/disadvantage on queued d20 rolls
    const advMode = faces === 20 && pendingRollQueueEntry && pendingRollAdvantage && pendingRollAdvantage !== 'normal'
      ? pendingRollAdvantage as 'advantage' | 'disadvantage'
      : null;
    const r1 = Math.floor(Math.random() * faces) + 1;
    const r2 = Math.floor(Math.random() * faces) + 1;
    const roll = advMode === 'advantage' ? Math.max(r1, r2) : advMode === 'disadvantage' ? Math.min(r1, r2) : r1;
    const modifier = modifierFromQueueEntry(faces) ?? parseModifierFromContext(faces);
    const total = roll + modifier;
    const rollMsg: Message = {
      id: Date.now().toString(), type: 'roll', sender: activeChar.name, text: `rolled a D${faces}`, timestamp: new Date(),
      diceResult: advMode
        ? { faces, rolls: [r1, r2], total, modifier, advantageMode: advMode, chosenRoll: roll, discardedRoll: advMode === 'advantage' ? Math.min(r1, r2) : Math.max(r1, r2) }
        : { faces, rolls: [roll], total, modifier }
    };
    setMessages(prev => [...prev, rollMsg]);
    setIsThinking(true);
    try {
        if (faces === 20 && await resolvePendingRollQueue(roll, total, modifier, advMode ? [r1, r2] : [roll], advMode ? `2d20${advMode === 'advantage' ? 'kh1' : 'kl1'}` : `1d${faces}`)) {
          return;
        }
        // Send roll with natural, modifier, and total for AI context
        const stream = await sendMessageToDM(`${activeChar.name}: rolled D${faces} with a natural ${roll}, modifier ${formatModifier(modifier)}, for a total of ${total}.`, handleFunctionCall);
        if (stream) {
            const aiMsgId = Date.now().toString() + 'ai-roll';
            setMessages(prev => [...prev, { id: aiMsgId, type: 'ai', sender: 'Dungeon Master', text: '', timestamp: new Date(), isThinking: true }]);
            let fullText = '';
            for await (const chunk of stream) {
                fullText += chunk;
                setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText, isThinking: false } : m));
            }
        }
    } catch (e: any) { 
      console.error(e);
      if (e?.message?.includes('Not Your Turn') || e?.message?.includes("'s turn")) {
        const match = e.message.match(/It's ([^']+)'s turn/);
        const currentTurnName = match ? match[1] : 'another character';
        const errorMsg: Message = { 
          id: Date.now().toString() + 'error', 
          type: 'system', 
          sender: 'System', 
          text: `⚠️ It's **${currentTurnName}**'s turn in combat. Select them from the party panel to act.`, 
          timestamp: new Date() 
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally { setIsThinking(false); }
  };

  const handleCustomDiceRoll = async (dice: { qty: number; faces: number; rolls?: number[]; chosen?: number; mode?: 'advantage' | 'disadvantage' }[]) => {
    if (!activeChar) return;
    
    // Check for advantage/disadvantage roll (special format from DiceRoller)
    const advDisDice = dice[0] as any;
    if (advDisDice?.mode && advDisDice?.rolls && advDisDice?.chosen !== undefined) {
      // This is an advantage/disadvantage roll
      const { rolls, chosen, mode } = advDisDice;
      const modifier = parseModifierFromContext(20);
      const total = chosen + modifier;
      const discarded = rolls.find((r: number) => r !== chosen) ?? rolls[0];
      
      const rollMsg: Message = { 
        id: Date.now().toString(), 
        type: 'roll', 
        sender: activeChar.name, 
        text: `rolled D20 with ${mode}`, 
        timestamp: new Date(), 
        diceResult: { 
          faces: 20,
          rolls: rolls, 
          total, 
          modifier,
          advantageMode: mode,
          chosenRoll: chosen,
          discardedRoll: discarded
        } 
      };
      setMessages(prev => [...prev, rollMsg]);
      setIsThinking(true);
      
      try {
        if (await resolvePendingRollQueue(chosen, total, modifier, rolls, '1d20')) {
          return;
        }
        const stream = await sendMessageToDM(
          `${activeChar.name}: rolled D20 with ${mode} - rolled ${rolls[0]} and ${rolls[1]}, ${mode === 'advantage' ? 'taking the higher' : 'taking the lower'} (${chosen}), modifier ${formatModifier(modifier)}, for a total of ${total}.`, 
          handleFunctionCall
        );
        if (stream) {
          const aiMsgId = Date.now().toString() + 'ai-roll';
          setMessages(prev => [...prev, { id: aiMsgId, type: 'ai', sender: 'Dungeon Master', text: '', timestamp: new Date(), isThinking: true }]);
          let fullText = '';
          for await (const chunk of stream) {
            fullText += chunk;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText, isThinking: false } : m));
          }
        }
      } catch (e: any) { 
        console.error(e);
        if (e?.message?.includes('Not Your Turn') || e?.message?.includes("'s turn")) {
          const match = e.message.match(/It's ([^']+)'s turn/);
          const currentTurnName = match ? match[1] : 'another character';
          const errorMsg: Message = { 
            id: Date.now().toString() + 'error', 
            type: 'system', 
            sender: 'System', 
            text: `It's **${currentTurnName}**'s turn in combat. Select them from the party panel to act.`, 
            timestamp: new Date() 
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      } finally { setIsThinking(false); }
      return;
    }
    
    // Standard custom dice roll (no advantage/disadvantage)
    const allRolls: number[] = [];
    const diceBreakdown: string[] = [];
    
    dice.forEach(({ qty, faces }) => {
      const rolls: number[] = [];
      for (let i = 0; i < qty; i++) {
        rolls.push(Math.floor(Math.random() * faces) + 1);
      }
      allRolls.push(...rolls);
      diceBreakdown.push(`${qty}d${faces}: ${rolls.join('+')}`);
    });
    
    const total = allRolls.reduce((sum, r) => sum + r, 0);
    const diceNotation = dice.map(d => `${d.qty}d${d.faces}`).join('+');
    
    const rollMsg: Message = { 
      id: Date.now().toString(), 
      type: 'roll', 
      sender: activeChar.name, 
      text: `rolled custom dice (${diceNotation})`, 
      timestamp: new Date(), 
      diceResult: { 
        faces: 0, // Custom multi-dice
        rolls: allRolls, 
        total, 
        modifier: 0,
        customNotation: diceNotation
      } 
    };
    setMessages(prev => [...prev, rollMsg]);
    setIsThinking(true);
    
    try {
      const breakdown = diceBreakdown.join(', ');
      const stream = await sendMessageToDM(
        `${activeChar.name}: rolled ${diceNotation} with natural results: ${breakdown} = ${total} total.`, 
        handleFunctionCall
      );
      if (stream) {
        const aiMsgId = Date.now().toString() + 'ai-roll';
        setMessages(prev => [...prev, { id: aiMsgId, type: 'ai', sender: 'Dungeon Master', text: '', timestamp: new Date(), isThinking: true }]);
        let fullText = '';
        for await (const chunk of stream) {
          fullText += chunk;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText, isThinking: false } : m));
        }
      }
    } catch (e: any) { 
      console.error(e);
      if (e?.message?.includes('Not Your Turn') || e?.message?.includes("'s turn")) {
        const match = e.message.match(/It's ([^']+)'s turn/);
        const currentTurnName = match ? match[1] : 'another character';
        const errorMsg: Message = { 
          id: Date.now().toString() + 'error', 
          type: 'system', 
          sender: 'System', 
          text: `⚠️ It's **${currentTurnName}**'s turn in combat. Select them from the party panel to act.`, 
          timestamp: new Date() 
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally { setIsThinking(false); }
  };

  // Handle loot distribution confirmation
  const handleLootDistribution = async (lootId: string, assignments: Record<string, string>) => {
    const lootData = pendingLoot.get(lootId);
    if (!lootData) return;

    try {
      // Transform assignments to the format the API expects
      const assignmentList = Object.entries(assignments).map(([itemName, characterId]) => {
        const item = lootData.items?.find(i => i.name === itemName);
        return {
          item: itemName,
          quantity: item?.quantity || 1,
          assignedTo: characterId
        };
      });

      const result = await distributeLoot(lootId, assignmentList, campaignId);
      
      if (result.success) {
        // Build distribution message
        const charAssignments: Record<string, string[]> = {};
        assignmentList.forEach(a => {
          const charName = characters.find(c => c.id === a.assignedTo)?.name || a.assignedTo;
          if (!charAssignments[charName]) charAssignments[charName] = [];
          const item = lootData.items?.find(i => i.name === a.item);
          const itemText = a.quantity > 1 ? `${a.item} (x${a.quantity})` : a.item;
          charAssignments[charName].push(itemText);
        });
        
        const distMsg = Object.entries(charAssignments)
          .map(([name, items]) => `${name} received: ${items.join(', ')}`)
          .join('. ');

        // Mark as distributed
        setDistributedLoot(prev => new Map(prev).set(lootId, distMsg));
        
        // Update characters if updated characters were returned
        if (result.updatedCharacters) {
          const transformed = transformCharacters(result.updatedCharacters, theme, campaignId);
          setCharacters(transformed);
        }
      }
    } catch (error) {
      console.error('[App] Failed to distribute loot:', error);
    }
  };

  // Handle skip loot
  const handleSkipLoot = async (lootId: string) => {
    try {
      await skipLoot(lootId, campaignId);
      setDistributedLoot(prev => new Map(prev).set(lootId, 'Loot was skipped.'));
    } catch (error) {
      console.error('[App] Failed to skip loot:', error);
    }
  };

  // Undo a ledgered mutation (audit-card undo button)
  const handleUndoMutation = async (mutationId: string) => {
    setUndoingMutationId(mutationId);
    try {
      const result = await undoMutation(mutationId, campaignId);
      if (result.success) {
        setUndoneMutations(prev => new Set(prev).add(mutationId));
        if (result.characters && Object.keys(result.characters).length > 0) {
          setCharacters(transformCharacters(result.characters, themeRef.current, campaignId));
        }
        if (result.combat && (result.combat.active === true || result.combat.initiativeOrder?.length)) {
          setCombat(transformCombatState(result.combat, charactersRef.current));
        }
      }
    } catch (error) {
      console.error('[App] Failed to undo mutation:', error);
    } finally {
      setUndoingMutationId(null);
    }
  };

  if (!activeChar) return null;

  const themeColors = {
    bg: isFantasy ? 'bg-fantasy-bg' : 'bg-scifi-bg',
    panel: isFantasy ? 'bg-fantasy-panel' : 'bg-scifi-panel',
    text: isFantasy ? 'text-fantasy-text' : 'text-scifi-text',
    accent: isFantasy ? 'text-fantasy-accent' : 'text-scifi-accent',
    border: isFantasy ? 'border-stone-800' : 'border-slate-800',
    input: isFantasy ? 'bg-stone-900 focus:ring-amber-900 border-stone-700' : 'bg-slate-900 focus:ring-cyan-900 border-slate-700',
    fontHead: isFantasy ? 'font-fantasyHeader' : 'font-scifiHeader',
    fontBody: isFantasy ? 'font-fantasyBody' : 'font-scifiBody',
    glass: isFantasy ? 'glass-fantasy' : 'glass-scifi',
    combatGlow: isFantasy ? 'shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'shadow-[0_0_20px_rgba(34,211,238,0.4)]'
  };

  const activeCombatant = combat.isActive ? combat.order[combat.currentTurnIndex] : null;
  
  // Narrative combat campaigns (like Dax) don't use tactical combat system
  const isNarrativeCombat = campaignId.includes('dax');

  return (
    <div className={`${themeColors.bg} ${themeColors.text} ${themeColors.fontBody} transition-all duration-700`} style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', filter: `brightness(${brightness})` }}>
      {/* Diagnostic removed - using console.log instead */}

      {/* --- DECORATIVE OVERLAYS (portaled to body so they don't affect flex layout) --- */}
      {createPortal(
        <>
          <div className="vignette" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40 }} />
          {isFantasy
            ? <div className="fantasy-texture" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} />
            : <><div className="scifi-scanlines" style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }} /><div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: 4, pointerEvents: 'none', zIndex: 50 }} className="bg-cyan-500/20 animate-scanline" /></>
          }
        </>,
        document.body
      )}

      {/* --- SIDEBAR (icon rail - hidden for narrative/single-PC campaigns like Dax) --- */}
      <aside className={`flex-col w-24 items-center py-8 gap-6 border-r ${isSidebarOpen ? 'flex fixed inset-y-0 left-0 z-50 shadow-2xl' : 'hidden'} ${isNarrativeCombat ? 'hidden' : 'hidden md:flex'} z-30 flex-shrink-0 relative ${themeColors.panel} ${themeColors.border}`}>
        <div className="mb-6 relative group cursor-pointer">{isFantasy ? <Icons.Ghost className="w-10 h-10 text-fantasy-gold" /> : <Icons.Cpu className="w-10 h-10 text-scifi-accent" />}</div>
        {/* Only show player-controlled characters in sidebar (not companions) */}
        {characters.filter(c => c.controlledBy !== 'dm').map(char => (
          <button key={char.id} onClick={() => { setActiveCharId(char.id); setIsSidebarOpen(false); }} title={`${char.name} - ${char.class}`} className={`relative w-16 h-16 rounded-full border-2 transition-all duration-500 shrink-0 ${activeCharId === char.id ? (isFantasy ? 'border-fantasy-gold scale-110 shadow-lg shadow-fantasy-gold/30' : 'border-scifi-accent scale-110 shadow-lg shadow-scifi-accent/30') : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/30'}`}>
            <img src={char.avatar} className="w-full h-full rounded-full object-cover" />
            {combat.isActive && activeCombatant?.id === char.id && <div className={`absolute inset-0 animate-pulse border-4 rounded-full ${isFantasy ? 'border-red-500' : 'border-cyan-400'}`} />}
          </button>
        ))}
        <button onClick={() => setShowSettings(true)} className="mt-auto p-3 opacity-40 hover:opacity-100 transition-opacity"><Icons.Settings className="w-6 h-6" /></button>
      </aside>

      {/* --- SETTINGS --- */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-xl animate-fade-in">
          <div className={`w-full max-w-2xl p-8 rounded-3xl border-2 ${themeColors.panel} ${isFantasy ? 'border-fantasy-gold/30' : 'border-scifi-accent/30'} relative shadow-2xl`}>
             <h2 className={`text-4xl font-black mb-8 ${themeColors.fontHead}`}>Configuration</h2>
             <div className="grid grid-cols-2 gap-8">
                <div>
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3 block">Theme Reality</label>
                   <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => handleThemeToggle('fantasy')} className={`p-4 border rounded-xl transition-all ${isFantasy ? 'bg-fantasy-gold/20 border-fantasy-gold text-fantasy-gold' : 'border-white/5 opacity-40'}`}>Fantasy</button>
                      <button onClick={() => handleThemeToggle('scifi')} className={`p-4 border rounded-xl transition-all ${!isFantasy ? 'bg-scifi-accent/20 border-scifi-accent text-scifi-accent' : 'border-white/5 opacity-40'}`}>Sci-Fi</button>
                   </div>
                </div>
                <div>
                   <label className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3 block">Luminescence (Brightness)</label>
                   <input type="range" min="0.5" max="2.0" step="0.05" value={brightness} onChange={(e) => setBrightness(parseFloat(e.target.value))} className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${isFantasy ? 'accent-fantasy-gold bg-stone-800' : 'accent-scifi-accent bg-slate-800'}`} />
                </div>
             </div>
             <button onClick={() => setShowSettings(false)} className={`mt-10 w-full py-4 border rounded-xl font-black uppercase tracking-widest text-xs transition-colors ${isFantasy ? 'border-fantasy-gold/30 hover:bg-fantasy-gold/10 text-fantasy-gold' : 'border-scifi-accent/30 hover:bg-scifi-accent/10 text-scifi-accent'}`}>Confirm Settings</button>
          </div>
        </div>
      )}

      {/* --- MAIN --- */}
      <main
        className={`flex-1 flex flex-col relative overflow-hidden z-20`}
        style={{ minWidth: 0, marginLeft: isNarrativeCombat ? '320px' : 0, marginRight: showSideChat ? '384px' : (isNarrativeCombat ? 0 : '320px') }}
      >
        {/* Pending Combat Banner - waiting for initiative rolls (not shown for narrative combat campaigns) */}
        {!isNarrativeCombat && combat.isPending && !combat.isActive && (
          <div className={`mx-6 mt-6 p-4 rounded-2xl border-2 flex items-center justify-between gap-6 animate-pop-in z-50 ${themeColors.glass} ${isFantasy ? 'border-amber-900/50 bg-amber-950/20' : 'border-yellow-900/50 bg-yellow-950/20'}`}>
            <div className="flex items-center gap-4">
              <Icons.Swords className={`w-8 h-8 ${isFantasy ? 'text-amber-500' : 'text-yellow-500'} animate-pulse`} />
              <div>
                <div className="text-sm font-black uppercase tracking-widest">Combat Initiated!</div>
                <div className="text-xs opacity-60">Roll initiative for all party members to begin</div>
              </div>
            </div>
            <button
              onClick={rollAllInitiative}
              disabled={isThinking}
              className={`px-6 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all hover:scale-105 active:scale-95 ${isThinking ? 'opacity-50 cursor-not-allowed' : ''} ${isFantasy ? 'bg-amber-600 hover:bg-amber-500 text-black' : 'bg-yellow-500 hover:bg-yellow-400 text-black'}`}
            >
              {isThinking ? 'Rolling...' : '🎲 Roll All Initiative'}
            </button>
          </div>
        )}

        {/* Active Combat Tracker - full turn order established (not shown for narrative combat campaigns) */}
        {!isNarrativeCombat && combat.isActive && (
          <div className={`mx-6 mt-6 p-4 rounded-2xl border-2 flex items-center gap-6 animate-pop-in z-50 ${themeColors.glass} ${isFantasy ? 'border-red-900/50' : 'border-cyan-900/50'} ${themeColors.combatGlow}`}>
             <div className="flex flex-col border-r pr-6 border-white/10"><span className="text-xs opacity-50 uppercase tracking-widest font-bold">Round</span><span className="text-3xl font-black">{combat.round}</span></div>
             <div className="flex-1 flex gap-3 overflow-x-auto no-scrollbar py-1 pl-2">
                {combat.order.map((c, i) => {
                  const isDead = c.isDead;
                  const isCurrent = i === combat.currentTurnIndex;
                  return (
                    <div key={c.id + i} className={`min-w-[100px] px-4 py-2 rounded-xl border transition-all shrink-0 relative ${
                      isDead 
                        ? 'opacity-30 bg-black/20 border-transparent line-through' 
                        : isCurrent 
                          ? (isFantasy ? 'bg-red-950/40 border-red-500 scale-105 shadow-lg' : 'bg-cyan-950/40 border-cyan-400 scale-105 shadow-lg') 
                          : 'opacity-50 border-transparent bg-white/5'
                    }`}>
                      {isDead && <div className="absolute inset-0 flex items-center justify-center text-2xl">💀</div>}
                      <div className={`text-xs font-black uppercase tracking-wide truncate ${isDead ? 'opacity-50' : ''}`} title={c.name}>{c.name}</div>
                      <div className={`text-[10px] font-mono mt-0.5 ${isDead ? 'opacity-30' : 'opacity-70'}`}>{isDead ? 'DEAD' : `INIT: ${c.initiative >= 0 ? c.initiative : '?'}`}</div>
                    </div>
                  );
                })}
             </div>

             {/* COMBAT ECONOMY HUD */}
             <div className="flex items-center gap-5 px-6 border-x border-white/10">
                <div className="flex flex-col items-center" title="Standard Action">
                   <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${combat.economy.actionSpent ? 'bg-white/5 opacity-20' : (isFantasy ? 'bg-red-600' : 'bg-cyan-500 text-slate-900')}`}>
                      <Icons.Sword className="w-5 h-5" />
                   </div>
                   <span className="text-[10px] mt-1.5 font-bold opacity-60">ACTION</span>
                </div>
                <div className="flex flex-col items-center" title="Bonus Action">
                   <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${combat.economy.bonusActionSpent ? 'bg-white/5 opacity-20' : (isFantasy ? 'bg-purple-600' : 'bg-indigo-500')}`}>
                      <Icons.Zap className="w-5 h-5" />
                   </div>
                   <span className="text-[10px] mt-1.5 font-bold opacity-60">BONUS</span>
                </div>
                <div className="flex flex-col items-center" title="Movement (feet)">
                   <div className={`relative w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 overflow-hidden border border-white/10`}>
                      <div className={`absolute bottom-0 w-full transition-all duration-500 ${isFantasy ? 'bg-stone-600' : 'bg-slate-600'}`} style={{ height: `${(combat.economy.movementRemaining / combat.economy.maxMovement) * 100}%` }} />
                      <span className="text-xs font-black z-10">{combat.economy.movementRemaining}ft</span>
                   </div>
                   <span className="text-[10px] mt-1.5 font-bold opacity-60">MOVE</span>
                </div>
             </div>

             <div className="flex gap-2 pl-6">
                <button onClick={nextTurn} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-transform active:scale-95 ${isFantasy ? 'bg-red-600 hover:bg-red-500' : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'}`}>End Turn</button>
                <button onClick={() => setShowExitCombatConfirm(true)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"><Icons.Zap className="w-4 h-4 text-red-500" /></button>
             </div>
          </div>
        )}

        {/* Zone lane - range band positions from the server's zone tracker */}
        {!isNarrativeCombat && combat.isActive && combat.positions && Object.keys(combat.positions).length > 0 && (
          <ZoneLane
            positions={combat.positions}
            order={combat.order}
            currentTurnIndex={combat.currentTurnIndex}
            theme={theme}
          />
        )}

        {showExitCombatConfirm && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
             <div className={`p-8 rounded-2xl border-2 ${themeColors.panel} border-red-500/50 text-center max-w-xs shadow-2xl`}>
                <Icons.Zap className="w-10 h-10 text-red-500 mx-auto mb-4" />
                <h3 className="text-xl font-black mb-4">Abandon Combat?</h3>
                <p className="text-sm opacity-60 mb-6 font-medium">Turn state will be wiped, though the DM will remember the encounter.</p>
                <div className="flex gap-3">
                   <button onClick={() => setShowExitCombatConfirm(false)} className="flex-1 py-3 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/5 transition-colors">Cancel</button>
                   <button onClick={() => { setCombat(prev => ({ ...prev, isActive: false })); setShowExitCombatConfirm(false); }} className="flex-1 py-3 bg-red-600 hover:bg-red-500 rounded-xl text-xs font-black transition-colors">Abandon</button>
                </div>
             </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-10 no-scrollbar" ref={chatContainerRef}>
          {sessionRecap && (
            <div className={`relative p-5 rounded-2xl border ${themeColors.panel} ${isFantasy ? 'border-fantasy-gold/30' : 'border-scifi-accent/30'} animate-pop-in`}>
              <button
                onClick={() => setSessionRecap(null)}
                className="absolute top-3 right-3 text-xs opacity-40 hover:opacity-80 font-black uppercase"
                title="Dismiss recap"
              >
                ✕
              </button>
              <div className={`text-[10px] mb-2 font-black uppercase tracking-[0.3em] ${isFantasy ? 'text-fantasy-gold' : 'text-scifi-accent'}`}>
                Previously on your campaign…
              </div>
              <div className="text-sm leading-relaxed opacity-80 italic">{sessionRecap}</div>
            </div>
          )}
          {messages.map((msg, idx) => {
            // Handle loot distribution messages specially
            if (msg.type === 'loot_distribution') {
            const lootMsg = msg as unknown as LootDistributionMessage;
              const lootId = lootMsg.lootData?.lootId;
              const isDistributed = lootId ? distributedLoot.has(lootId) : false;
              const distMessage = lootId ? distributedLoot.get(lootId) : undefined;

              // Only animate recent messages (last 2) to prevent re-animation on state updates
              const isRecent = idx >= messages.length - 2;
              return (
                <div key={msg.id} className={`flex w-full justify-start ${isRecent ? 'animate-pop-in' : ''}`}>
                  <div className="max-w-[90%] w-full">
                    <LootDistributionCard
                      lootData={lootMsg.lootData}
                      characters={characters}
                      theme={theme}
                      onConfirm={(assignments) => lootId && handleLootDistribution(lootId, assignments)}
                      onSkip={() => lootId && handleSkipLoot(lootId)}
                      distributed={isDistributed}
                      distributionMessage={distMessage}
                    />
                  </div>
                </div>
              );
            }

            // Handle mutation audit cards (DM state changes with undo)
            if (msg.type === 'mutation_audit') {
              const auditMsg = msg as unknown as MutationAuditMessage;
              const isRecentAudit = idx >= messages.length - 2;
              return (
                <div key={msg.id} className={`flex w-full justify-start ${isRecentAudit ? 'animate-pop-in' : ''}`}>
                  <div className="max-w-[min(80%,72rem)] w-full">
                    <MutationCard
                      mutations={auditMsg.mutations}
                      theme={theme}
                      undoneIds={undoneMutations}
                      undoingId={undoingMutationId}
                      onUndo={handleUndoMutation}
                    />
                  </div>
                </div>
              );
            }

            // Regular message rendering
            // Only animate recent messages (last 2) to prevent re-animation on state updates
            const isRecent = idx >= messages.length - 2;
            return (
              <div key={msg.id} className={`flex w-full ${msg.type === 'user' ? 'justify-end' : 'justify-start'} ${isRecent ? 'animate-pop-in' : ''}`}>
                <div className={`${msg.type === 'combat' ? 'w-full' : 'max-w-[min(80%,72rem)]'} p-6 rounded-2xl border shadow-xl ${msg.type === 'user' ? `${themeColors.panel} border-white/10 rounded-tr-none` : msg.type === 'combat' ? 'text-center border-red-900/20 bg-red-950/5 font-black uppercase text-[10px] tracking-[0.4em] opacity-60 py-2' : `${themeColors.panel} ${themeColors.border} border-l-4 ${isFantasy ? 'border-fantasy-gold' : 'border-scifi-accent'}`}`}>
                  {msg.type !== 'combat' && <div className={`text-[10px] mb-2 opacity-40 uppercase font-black tracking-widest ${msg.type === 'user' ? 'text-right' : 'text-left'}`}>{msg.sender}</div>}
                  <div className={msg.type === 'roll' || msg.type === 'initiative' ? 'flex flex-col items-center' : ''}>
                     {msg.type === 'roll' ? (
                       <div className="flex flex-col items-center p-6 bg-white/5 rounded-2xl border border-white/10 shadow-inner">
                          <Icons.Dices className={`w-12 h-12 mb-3 ${isFantasy ? 'text-fantasy-gold' : 'text-scifi-accent'}`} />
                          <div className="text-6xl font-black mb-2 animate-bounce">{msg.diceResult?.total}</div>
                          {msg.diceResult?.advantageMode ? (
                            // Advantage/Disadvantage roll display
                            <div className="flex flex-col items-center gap-2">
                              <div className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full ${msg.diceResult.advantageMode === 'advantage' ? 'bg-green-600/30 text-green-400 border border-green-500/50' : 'bg-red-600/30 text-red-400 border border-red-500/50'}`}>
                                {msg.diceResult.advantageMode}
                              </div>
                              <div className="flex gap-3 text-xl font-bold mt-1">
                                <span className={msg.diceResult.chosenRoll === msg.diceResult.rolls[0] ? (isFantasy ? 'text-fantasy-gold' : 'text-scifi-accent') : 'opacity-30 line-through'}>
                                  {msg.diceResult.rolls[0]}
                                </span>
                                <span className="opacity-30">/</span>
                                <span className={msg.diceResult.chosenRoll === msg.diceResult.rolls[1] ? (isFantasy ? 'text-fantasy-gold' : 'text-scifi-accent') : 'opacity-30 line-through'}>
                                  {msg.diceResult.rolls[1]}
                                </span>
                              </div>
                              <div className="text-[10px] opacity-40 font-mono uppercase tracking-widest">
                                D20 | KEPT: {msg.diceResult.chosenRoll} | MOD: +{msg.diceResult.modifier}
                              </div>
                            </div>
                          ) : msg.diceResult?.customNotation ? (
                            <div className="text-[10px] opacity-40 font-mono uppercase tracking-widest">
                              {msg.diceResult.customNotation} | NAT: {msg.diceResult.rolls.join('+')} | TOTAL: {msg.diceResult.total}
                            </div>
                          ) : (
                            <div className="text-[10px] opacity-40 font-mono uppercase tracking-widest">
                              D{msg.diceResult?.faces} | NAT: {msg.diceResult?.rolls[0]} | MOD: {msg.diceResult?.modifier}
                            </div>
                          )}
                       </div>
                     ) : msg.type === 'initiative' ? (
                       <div className="flex flex-col items-center p-5 bg-white/5 rounded-2xl border border-white/10 shadow-inner w-full">
                          <div className="flex items-center gap-3 mb-5">
                            <Icons.Swords className={`w-7 h-7 ${isFantasy ? 'text-fantasy-gold' : 'text-scifi-accent'}`} />
                            <span className="text-sm font-black uppercase tracking-widest opacity-70">Initiative Rolls</span>
                          </div>
                          <div className="grid gap-3 w-full">
                            {msg.initiativeRolls?.sort((a, b) => b.total - a.total).map((r, i) => (
                              <div key={r.id} className={`flex items-center justify-between p-4 rounded-xl border ${isFantasy ? 'bg-stone-900/50 border-stone-700' : 'bg-slate-900/50 border-slate-700'}`}>
                                <div className="flex items-center gap-4">
                                  <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-black ${isFantasy ? 'bg-fantasy-gold/30 text-fantasy-gold border border-fantasy-gold/50' : 'bg-scifi-accent/30 text-scifi-accent border border-scifi-accent/50'}`}>{i + 1}</span>
                                  <span className="font-bold text-base">{r.name}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-sm opacity-60 font-mono bg-black/20 px-2 py-1 rounded">{r.roll}+{r.dexMod}</span>
                                  <span className={`text-2xl font-black min-w-[2.5rem] text-right ${isFantasy ? 'text-fantasy-gold' : 'text-scifi-accent'}`}>{r.total}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                       </div>
                     ) : (
                        <div className={`leading-relaxed whitespace-pre-line ${isFantasy ? 'italic text-lg font-fantasyBody text-stone-300' : 'font-mono text-sm opacity-90 text-slate-200'}`}>
                           {msg.text.split(/(\*\*.*?\*\*|\*(?!\*).*?\*(?!\*))/g).map((part, i) =>
                             part.startsWith('**') ? <strong key={i} className={isFantasy ? "text-fantasy-gold" : "text-scifi-accent"}>{part.slice(2, -2)}</strong>
                             : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <em key={i} className={isFantasy ? "text-fantasy-gold/80" : "text-scifi-accent/80"}>{part.slice(1, -1)}</em>
                             : part)}
                           {msg.isThinking && <span className="inline-block w-2 h-5 ml-2 bg-current opacity-20 animate-pulse" />}
                        </div>
                     )}
                  </div>
                </div>
              </div>
            );
          })}
          {/* Thinking indicator - shown when waiting for DM response */}
          {isThinking && (
            <div className="flex justify-start animate-pop-in">
              <div className={`p-6 rounded-2xl border shadow-xl ${themeColors.panel} ${themeColors.border} border-l-4 ${isFantasy ? 'border-fantasy-gold' : 'border-scifi-accent'}`}>
                <div className="text-[10px] mb-2 opacity-40 uppercase font-black tracking-widest">Dungeon Master</div>
                <div className="flex items-center gap-3">
                  <Icons.Loader2 className={`w-5 h-5 animate-spin ${isFantasy ? 'text-fantasy-gold' : 'text-scifi-accent'}`} />
                  <span className={`${isFantasy ? 'italic font-fantasyBody text-stone-400' : 'font-mono text-sm text-slate-400'}`}>
                    {isFantasy ? 'The fates are being woven...' : 'Processing...'}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-12" />
        </div>

        {/* --- INPUT --- */}
        <div className="px-6 py-3 z-30">
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
              {pendingRollQueueEntry && (
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-lg text-xs ${isFantasy ? 'border-amber-600/40 bg-amber-950/30 text-amber-100' : 'border-cyan-500/40 bg-cyan-950/30 text-cyan-100'}`}
                  title={pendingRollQueueEntry.reason || pendingRollQueueEntry.metadata?.rawRequest || 'Roll requested'}
                >
                  <Icons.Dices className={`w-4 h-4 shrink-0 ${isFantasy ? 'text-amber-400' : 'text-cyan-300'}`} />
                  <span className="font-bold truncate flex-1 min-w-0 text-white/85">
                    {pendingRollQueueEntry.reason || pendingRollQueueEntry.metadata?.rawRequest || 'Roll requested'}
                  </span>
                  <span className="hidden sm:flex items-center gap-2 shrink-0 text-[10px] font-mono uppercase tracking-wider text-white/55">
                    {pendingRollParticipant?.name && <span>{pendingRollParticipant.name}</span>}
                    {pendingRollDc && <span>DC {pendingRollDc}</span>}
                  </span>
                  {pendingRollAdvantage && pendingRollAdvantage !== 'normal' && (
                    <span
                      title={Array.isArray(pendingRollParticipant?.advantageReasons) ? pendingRollParticipant.advantageReasons.join(', ') : undefined}
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${pendingRollAdvantage === 'advantage' ? 'bg-green-600/30 text-green-300 border border-green-500/40' : 'bg-red-600/30 text-red-300 border border-red-500/40'}`}
                    >
                      {pendingRollAdvantage}
                    </span>
                  )}
                  <button
                    onClick={() => handleDiceRoll(20)}
                    disabled={isThinking}
                    className={`shrink-0 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 ${isThinking ? 'opacity-40 cursor-not-allowed' : (isFantasy ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300')}`}
                  >
                    Roll D20
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2 min-w-0">
                 <DiceRoller theme={theme} onRoll={handleDiceRoll} onCustomRoll={handleCustomDiceRoll} popover />
                 {suggestedDice && (
                   <button
                     onClick={() => handleCustomDiceRoll(suggestedDice)}
                     disabled={isThinking}
                     className={`shrink-0 h-11 px-3 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 transition-all hover:scale-105 active:scale-95 animate-pulse ${isFantasy ? 'border-amber-600 bg-amber-950/40 text-amber-400 hover:bg-amber-900/50' : 'border-cyan-600 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50'}`}
                   >
                     🎲 {suggestedDiceLabel}
                   </button>
                 )}
                 {/* For narrative campaigns: Continue button. For tactical: Initiative button */}
                 {isNarrativeCombat ? (
                   <button
                     onClick={handleContinueStory}
                     disabled={isThinking}
                     title="Let the DM continue the story"
                     className={`shrink-0 h-11 px-3 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] border-2 transition-all hover:scale-105 active:scale-95 ${isThinking ? 'opacity-50 cursor-not-allowed' : ''} ${isFantasy ? 'border-amber-600 bg-amber-950/20 text-amber-500 hover:bg-amber-900/30' : 'border-cyan-600 bg-cyan-950/20 text-cyan-400 hover:bg-cyan-900/30'}`}
                   >
                     {isThinking ? '...' : '▶ Continue'}
                   </button>
                 ) : (
                   !combat.isActive && (
                     <button onClick={combat.lastOrder ? reEnterCombat : startCombat} className={`shrink-0 h-11 px-3 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] border-2 transition-all hover:scale-105 active:scale-95 ${isFantasy ? 'border-red-950 bg-red-950/20 text-red-500 hover:bg-red-900/30' : 'border-cyan-950 bg-cyan-950/20 text-cyan-400 hover:bg-cyan-900/30'}`}>
                       {combat.lastOrder ? 'Restore Combat' : 'Initiative'}
                     </button>
                   )
                 )}
                 <div className="relative flex-1 min-w-0">
                    <textarea
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                      placeholder={combat.isActive ? `Round ${combat.round}: Narrate your action...` : `Narrate ${activeChar.name}'s action...`}
                      className={`block w-full px-4 py-3 pr-12 h-11 rounded-xl border-2 resize-none transition-all duration-300 focus:h-28 focus:outline-none focus:ring-4 focus:ring-opacity-10 shadow-2xl ${themeColors.input} ${isFantasy ? 'focus:ring-fantasy-gold' : 'focus:ring-scifi-accent'} text-sm leading-tight no-scrollbar`}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={isThinking || !inputValue.trim()}
                      className={`absolute right-1.5 bottom-1.5 p-2 rounded-lg transition-all ${inputValue.trim() ? (isFantasy ? 'bg-fantasy-gold hover:bg-amber-600 shadow-lg' : 'bg-scifi-accent hover:bg-cyan-400 text-slate-950 shadow-lg') : 'opacity-20 cursor-not-allowed grayscale'}`}
                    >
                      <Icons.Send className="w-4 h-4" />
                    </button>
                 </div>
             </div>
          </div>
        </div>
      </main>

      {/* --- ABOVE TABLE SIDE CHAT --- */}
      {activeChar && (
        <SideChat
          theme={theme}
          activeChar={activeChar}
          allCharacters={characters}
          isOpen={showSideChat}
          onToggle={() => setShowSideChat(prev => !prev)}
          reserveRightPanel={!isNarrativeCombat}
        />
      )}

      {/* --- CODEX --- */}
      <aside
        id="codex-aside"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '320px',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0f172a',
          borderRight: isNarrativeCombat ? '1px solid #1e293b' : 'none',
          borderLeft: isNarrativeCombat ? 'none' : '1px solid #1e293b',
          overflow: 'hidden',
          zIndex: 30
        }}
      >
         {/* Visible test strip - pure inline, no Tailwind dependency */}
         <div style={{ width: '100%', padding: '4px 8px', background: '#22d3ee', color: '#000', fontWeight: 900, fontSize: '10px', fontFamily: 'monospace', textAlign: 'center', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
           Dax Panel Live
         </div>
         <div className="p-8 space-y-6 flex-shrink-0 text-center cursor-pointer group" onClick={() => setShowCharSheet(true)} title="Open character sheet">
            <div className={`w-32 h-32 rounded-3xl border-2 mx-auto overflow-hidden transition-transform duration-700 hover:rotate-0 shadow-2xl group-hover:shadow-[0_0_20px_rgba(34,211,238,0.3)] ${isFantasy ? 'border-fantasy-gold rotate-3' : 'border-scifi-accent rotate-2'}`}><img src={activeChar.avatar} className="w-full h-full object-cover" /></div>
            <div>
              <h2 className={`text-xl font-black uppercase tracking-tight ${themeColors.fontHead} group-hover:opacity-80 transition-opacity`}>{activeChar.name}</h2>
              <div className={`text-xs font-bold uppercase tracking-widest mt-2 ${isFantasy ? 'text-fantasy-gold/90' : 'text-scifi-accent/90'}`}>Level {activeChar.level ?? 1} · {activeChar.class}</div>
              {activeChar.experience && (
                <div className="mt-2">
                  <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isFantasy ? 'bg-fantasy-gold' : 'bg-scifi-accent'}`}
                      style={{ width: `${activeChar.experience.progressPct ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[9px] uppercase tracking-widest opacity-35">
                    {activeChar.experience.current.toLocaleString()} XP
                  </div>
                </div>
              )}
              <div className={`text-[9px] uppercase tracking-widest mt-1 opacity-0 group-hover:opacity-40 transition-opacity`}>click for full sheet</div>
            </div>
            <div className="space-y-3">
               <div className="h-4 w-full bg-black/40 rounded-full overflow-hidden p-[2px] border border-white/5"><div className={`h-full rounded-full transition-all duration-1000 ${isFantasy ? 'bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]' : 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]'}`} style={{ width: `${((activeChar.hp as number) / (activeChar.maxHp as number)) * 100}%` }} /></div>
               <div className="flex justify-between text-xs font-bold opacity-50 uppercase tracking-widest"><span>Vitality</span><span>{activeChar.hp} / {activeChar.maxHp}</span></div>
            </div>
         </div>

         <div className="flex border-y bg-black/20">
            {['stats', 'items', 'buffs', 'spells'].map(tab => (
              <button key={tab} onClick={() => setActiveSidebarTab(tab === 'items' ? 'inventory' : tab === 'buffs' ? 'conditions' : tab as any)} className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider transition-all ${ (activeSidebarTab === (tab === 'items' ? 'inventory' : tab === 'buffs' ? 'conditions' : tab)) ? (isFantasy ? 'text-fantasy-gold border-b-2 border-fantasy-gold bg-fantasy-gold/5' : 'text-scifi-accent border-b-2 border-scifi-accent bg-scifi-accent/5') : 'opacity-40 hover:opacity-70'}`}>{tab}</button>
            ))}
         </div>

         <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
            {activeSidebarTab === 'stats' && (
              <div className="grid grid-cols-2 gap-4 animate-pop-in">
                {(Object.entries(activeChar.stats) as [string, number][]).map(([stat, val]) => {
                  const mod = Math.floor((val - 10) / 2);
                  return (
                  <div key={stat} className="p-4 rounded-xl bg-black/20 border border-white/5 flex flex-col items-center hover:bg-white/5 transition-colors">
                    <span className="text-xs font-bold uppercase opacity-50 mb-1 tracking-widest">{stat}</span>
                    <span className="text-2xl font-black">{val}</span>
                    <span className={`text-sm font-mono font-bold mt-1 ${mod > 0 ? (isFantasy ? 'text-green-400' : 'text-emerald-400') : mod < 0 ? 'text-red-400' : 'opacity-50'}`}>
                      {mod >= 0 ? '+' : ''}{mod}
                    </span>
                  </div>
                )})}
              </div>
            )}
            {activeSidebarTab === 'inventory' && (
              <div className="space-y-2 animate-pop-in">
                {activeChar.inventory.map((item, i) => (
                  <ItemCard key={i} item={item} theme={theme} />
                ))}
              </div>
            )}
            {activeSidebarTab === 'conditions' && <div className="space-y-2 animate-pop-in">{activeChar.conditions.map(c => {
              const detail = activeChar.conditionDetails?.find(d => d.name.toLowerCase() === c.toLowerCase());
              return <div key={c} className={`p-4 rounded-xl border-2 font-black uppercase text-[10px] tracking-[0.2em] animate-pulse flex items-center justify-between ${isFantasy ? 'border-fantasy-gold/20 text-fantasy-gold bg-fantasy-gold/5' : 'border-scifi-accent/20 text-scifi-accent bg-scifi-accent/5'}`} title={detail?.source ? `Source: ${detail.source}` : undefined}>
                <span>{c}</span>
                {detail?.remainingRounds !== undefined && <span className={`px-2 py-0.5 rounded-full text-[9px] ${isFantasy ? 'bg-fantasy-gold/20' : 'bg-scifi-accent/20'}`}>{detail.remainingRounds} rounds</span>}
              </div>;
            })}</div>}
            {activeSidebarTab === 'spells' && (
              <div className="space-y-2 animate-pop-in">
                {activeChar.heldSpells.map(s => (
                  <SpellCard key={s} spellName={s} theme={theme} />
                ))}
              </div>
            )}
            {(activeSidebarTab === 'conditions' && activeChar.conditions.length === 0) && <div className="text-center py-20 opacity-20 text-[10px] uppercase font-black tracking-widest">No active conditions</div>}
            {(activeSidebarTab === 'spells' && activeChar.heldSpells.length === 0) && <div className="text-center py-20 opacity-20 text-[10px] uppercase font-black tracking-widest">No active enchantments</div>}

            {activeQuests.length > 0 && (
              <div className={`mt-5 mx-3 p-4 rounded-xl border ${isFantasy ? 'border-amber-500/20 bg-amber-500/5' : 'border-cyan-500/20 bg-cyan-500/5'}`}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className={`flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] opacity-70 ${isFantasy ? 'text-amber-400' : 'text-cyan-400'}`}>
                    <Icons.Scroll className="w-3.5 h-3.5" />
                    Objectives
                  </div>
                  <span className="text-[9px] font-mono opacity-40">{activeQuests.length}</span>
                </div>
                <div className="space-y-3">
                  {activeQuests.slice(0, 4).map((quest) => (
                    <div key={quest.id} className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
                      <div className="flex items-start gap-2">
                        <Icons.CheckCircle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${quest.status === 'selected' ? (isFantasy ? 'text-amber-300' : 'text-cyan-300') : 'opacity-35'}`} />
                        <div className="min-w-0">
                          <div className="text-[11px] font-black uppercase tracking-wide leading-snug text-white/90">
                            {quest.title}
                          </div>
                          {quest.location && (
                            <div className={`mt-0.5 text-[9px] font-mono uppercase tracking-wider ${isFantasy ? 'text-amber-400/60' : 'text-cyan-400/60'}`}>
                              {quest.location}
                            </div>
                          )}
                          {quest.next_steps?.[0] && (
                            <div className="mt-1 text-[10px] leading-snug text-white/45">
                              {quest.next_steps[0]}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Companion Roster - shows DM-controlled party members */}
            <CompanionRoster
              companions={characters.filter(c => c.companion === true)}
              theme={theme}
              partyCredits={undefined} // TODO: Get from campaign state if available
            />

            {/* Ship Panel — click to open ship systems modal */}
            {ship && (
              <div
                className={`mt-4 mx-3 p-4 rounded-xl border cursor-pointer transition-colors group ${
                  isFantasy
                    ? 'border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10'
                    : 'border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10'
                }`}
                onClick={() => setShowShipSheet(true)}
                title="Open ship systems"
              >
                <div className={`text-[9px] font-bold uppercase tracking-[0.2em] opacity-60 mb-2 ${isFantasy ? 'text-amber-400' : 'text-cyan-400'}`}>
                  Vessel
                </div>
                <div className={`${isFantasy ? 'font-fantasyHeader' : 'font-scifiHeader'} text-sm font-black text-white uppercase tracking-wide group-hover:text-cyan-300 transition-colors`}>
                  {ship.name}
                </div>
                <div className={`text-[10px] mt-0.5 ${isFantasy ? 'text-amber-400/60' : 'text-cyan-400/60'}`}>{ship.class}</div>
                <div className="mt-3 space-y-1.5">
                  <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isFantasy ? 'bg-amber-500' : 'bg-cyan-500'}`}
                      style={{ width: `${Math.round((ship.hull.current / ship.hull.max) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono opacity-40">
                    <span>HULL</span>
                    <span>{ship.hull.current}/{ship.hull.max}</span>
                  </div>
                </div>
                {ship.crew_stations && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
                    {Object.entries(ship.crew_stations).slice(0, 3).map(([station, crew]) => (
                      <div key={station} className="flex justify-between gap-2 text-[9px] leading-tight">
                        <span className="font-bold uppercase tracking-wider text-white/30">{station.replace('_', ' ')}</span>
                        <span className="font-mono text-white/55 text-right truncate max-w-[8rem]">{crew || 'unassigned'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {ship.conditions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ship.conditions.map((c: string) => (
                      <span key={c} className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse-slow">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-[9px] mt-2 opacity-0 group-hover:opacity-30 transition-opacity uppercase tracking-widest text-center">
                  click to manage
                </div>
              </div>
            )}
         </div>
      </aside>

      {/* Character Sheet Modal */}
      {showCharSheet && (
        <CharacterSheetModal
          character={activeChar}
          theme={theme}
          onClose={() => setShowCharSheet(false)}
          onUpdateHp={async (hp) => {
            try {
              const result = await updateCharacter(activeChar.id, { hp_current: hp }, campaignId);
              setCharacters(prev => prev.map(c =>
                c.id === activeChar.id ? { ...c, hp: result.character.hp.current } : c
              ));
            } catch (e) { console.error('HP update failed:', e); }
          }}
          onUpdateCredits={async (credits) => {
            try {
              const result = await updateCharacter(activeChar.id, { credits }, campaignId);
              setCharacters(prev => prev.map(c =>
                c.id === activeChar.id ? { ...c, resource: result.character.credits } : c
              ));
            } catch (e) { console.error('Credits update failed:', e); }
          }}
        />
      )}

      {/* Ship Systems Modal */}
      {showShipSheet && ship && (
        <ShipSystemsModal
          ship={ship}
          theme={theme}
          campaignId={campaignId}
          onClose={() => setShowShipSheet(false)}
          onPowerSaved={(updatedShip) => setShip(updatedShip)}
        />
      )}
    </div>
  );
}
