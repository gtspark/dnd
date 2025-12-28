export type ThemeMode = 'fantasy' | 'scifi';

export type AIProvider = 'Gemini 2.5 Flash' | 'Gemini 2.5 Pro' | 'Gemini Thinking';

// ==================== INVENTORY ITEM ====================

export type ItemCategory = 'weapon' | 'armor' | 'consumable' | 'treasure' | 'misc';
export type ItemCondition = 'pristine' | 'good' | 'worn' | 'damaged' | 'broken';

export interface InventoryItem {
  name: string;
  equipped: boolean;
  category: ItemCategory;
  value: number;           // GP value
  condition: ItemCondition;
  stackable: boolean;
  quantity: number;
  treasure: boolean;       // True for gems, art objects, trade goods
}

export interface Character {
  id: string;
  name: string;
  class: string;
  avatar: string; // URL
  hp: number;
  maxHp: number;
  resource: number; // Gold or Credits
  resourceName: string;
  conditions: string[];
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  inventory: InventoryItem[];  // Changed from string[]
  heldSpells: string[];
}

export type MessageType = 'user' | 'ai' | 'system' | 'roll' | 'combat' | 'initiative' | 'loot_distribution';

export interface DiceResult {
  total: number;
  rolls: number[];
  faces: number;
  modifier: number;
  customNotation?: string; // For custom multi-dice rolls like "1d4+2d6"
}

export interface InitiativeRoll {
  id: string;
  name: string;
  roll: number;
  dexMod: number;
  total: number;
}

export interface Message {
  id: string;
  type: MessageType;
  sender: string;
  text: string;
  timestamp: Date;
  diceResult?: DiceResult;
  initiativeRolls?: InitiativeRoll[];
  isThinking?: boolean;
}

export interface Combatant {
  id: string;
  name: string;
  type: 'player' | 'enemy';
  initiative: number;
  avatar?: string;
  isDead?: boolean;
}

export interface CombatEconomy {
  actionSpent: boolean;
  bonusActionSpent: boolean;
  movementRemaining: number;
  maxMovement: number;
}

export interface CombatState {
  isActive: boolean;
  isPending?: boolean; // Combat detected but waiting for initiative rolls
  round: number;
  currentTurnIndex: number;
  order: Combatant[];
  lastOrder?: Combatant[]; // For re-entering combat
  economy: CombatEconomy;
  pendingRollRequest?: string; // Initiative roll request text
}

export interface CampaignState {
  theme: ThemeMode;
  provider: AIProvider;
  activeCharacterId: string;
  characters: Character[];
  history: Message[];
  brightness: number;
  combat: CombatState;
}

// ==================== LOOT SYSTEM TYPES ====================

export type LootItemType = 'weapon' | 'armor' | 'consumable' | 'gem' | 'art' | 'magic_item' | 'quest_item' | 'misc';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary';

export interface LootItem {
  name: string;
  type: LootItemType;
  quantity?: number;  // Default 1, for stacks like "Potion (×3)"
  sellValue?: number;  // GP value if sold (for gems/art)
  rarity?: ItemRarity;  // For magic items
  description?: string;  // Future: for tooltips
}

export interface LootCoins {
  totalGP: number;  // Converted total for display
  breakdown?: {
    cp?: number;
    sp?: number;
    ep?: number;
    gp?: number;
    pp?: number;
  };
}

export interface LootDistribution {
  lootId: string;
  coins?: LootCoins;
  items: LootItem[];
  createdAt?: string;
}

export interface LootAssignment {
  item: string;  // Item name
  quantity: number;  // Stack size
  assignedTo: string;  // Character ID (no 'party' - items must go to characters)
}

// Extended message type for loot distribution
export type LootMessageType = MessageType | 'loot_distribution';

export interface LootDistributionMessage {
  id: string;
  type: 'loot_distribution';
  sender: string;
  timestamp: Date;
  lootData: LootDistribution;
  assignments?: Record<string, string>;  // itemName -> characterId (tracked by UI)
  distributed?: boolean;  // True after player confirms distribution
  distributionMessage?: string;  // "Thorne received: Healing Potion (×2)..."
}

// Union type for all message types
export type AnyMessage = Message | LootDistributionMessage;