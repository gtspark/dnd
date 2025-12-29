export type ThemeMode = 'fantasy' | 'scifi';

export type AIProvider = 'Gemini 2.5 Flash' | 'Gemini 2.5 Pro' | 'Gemini Thinking';

// ==================== INVENTORY ITEM ====================

export type ItemCategory = 'weapon' | 'armor' | 'consumable' | 'treasure' | 'misc';
export type ItemCondition = 'pristine' | 'good' | 'worn' | 'damaged' | 'broken';

export interface InventoryItem {
  name: string;
  baseItem?: string;       // SRD equipment slug for API lookups (e.g., "scimitar" for "Rusty Scimitar")
  custom?: boolean;        // True for quest/lore items with no SRD equivalent
  equipped: boolean;
  category: ItemCategory;
  value: number;           // GP value
  condition: ItemCondition;
  stackable: boolean;
  quantity: number;
  treasure: boolean;       // True for gems, art objects, trade goods
}

export interface CharacterSkill {
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  proficient: boolean;
  notes?: string;
}

export interface Character {
  id: string;
  name: string;
  class: string;
  race?: string;              // e.g., "Vexian" for Dax
  avatar: string;             // URL
  hp: number;
  maxHp: number;
  resource: number;           // Gold or Credits
  resourceName: string;
  conditions: string[];
  controlledBy?: 'player' | 'dm';  // Who controls this character
  companion?: boolean;             // True for DM-controlled party members
  proficiencyBonus?: number;       // Proficiency bonus (default 2)
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  skills?: Record<string, CharacterSkill>;  // e.g., { technology: { ability: 'int', proficient: true } }
  inventory: InventoryItem[];
  heldSpells: string[];
}

export type MessageType = 'user' | 'ai' | 'system' | 'roll' | 'combat' | 'initiative' | 'loot_distribution';

export interface DiceResult {
  total: number;
  rolls: number[];
  faces: number;
  modifier: number;
  customNotation?: string; // For custom multi-dice rolls like "1d4+2d6"
  advantageMode?: 'advantage' | 'disadvantage'; // For advantage/disadvantage rolls
  chosenRoll?: number;    // The roll that was kept
  discardedRoll?: number; // The roll that was dropped
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

// ==================== D&D 5e RULES TYPES ====================

export interface SpellDetails {
  name: string;
  level: number;  // 0 = cantrip
  school: string;  // "Evocation"
  casting_time: string;  // "1 action"
  range: string;  // "120 feet"
  components: string[];  // ["V", "S"]
  material?: string;  // Material component description
  duration: string;  // "Instantaneous"
  concentration: boolean;
  ritual: boolean;
  damage?: {
    type: string;  // "Fire"
    formula: string;  // "1d10"
    at_level: number;
  };
  dc?: {
    type: string;  // "Dexterity"
    success: string;  // "half"
  };
  area?: {
    type: string;  // "sphere"
    size: number;
  };
  description: string;
  higher_level?: string;  // Scaling info
  classes: string[];
  
  // Derived stealth info
  isVisible?: boolean;  // Has S component (somatic)
  isAudible?: boolean;  // Has V component (verbal)
  
  error?: string;  // If API failed
}

export interface ItemDetails {
  name: string;
  equipment_category?: string;  // "Weapon", "Armor"
  damage?: {
    dice: string;  // "1d4"
    type: string;  // "Piercing"
  };
  range?: {
    normal: number;
    long?: number;
  };
  properties?: string[];  // ["Finesse", "Light", "Thrown"]
  armor_class?: {
    base: number;
    dex_bonus?: boolean;
    max_bonus?: number;
  };
  armor_category?: string;  // "Light", "Medium", "Heavy"
  weight?: number;
  cost?: {
    quantity: number;
    unit: string;  // "gp"
  };
  rarity?: string;  // "Common", "Rare"
  requires_attunement?: boolean;
  description?: string;
  error?: string;
}