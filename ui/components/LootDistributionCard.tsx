import React, { useState, useMemo } from 'react';
import { Icons } from './Icons';
import { ThemeMode, Character, LootDistribution, LootItem, ItemRarity } from '../types';

interface LootDistributionCardProps {
  lootData: LootDistribution;
  characters: Character[];
  theme: ThemeMode;
  onConfirm: (assignments: Record<string, string>) => void;
  onSkip: () => void;
  distributed?: boolean;
  distributionMessage?: string;
}

// Rarity colors for magic items
const RARITY_COLORS: Record<ItemRarity, string> = {
  common: 'text-stone-400',
  uncommon: 'text-green-400',
  rare: 'text-blue-400',
  very_rare: 'text-purple-400',
  legendary: 'text-orange-400'
};

// Item type icons
const getItemTypeIcon = (type: string) => {
  switch (type) {
    case 'weapon': return 'Sword';
    case 'armor': return 'Shield';
    case 'consumable': return 'Flask';
    case 'gem': return 'Diamond';
    case 'art': return 'Palette';
    case 'magic_item': return 'Sparkles';
    case 'quest_item': return 'Scroll';
    default: return 'Package';
  }
};

export const LootDistributionCard: React.FC<LootDistributionCardProps> = ({
  lootData,
  characters,
  theme,
  onConfirm,
  onSkip,
  distributed = false,
  distributionMessage
}) => {
  // Track which character each item is assigned to (itemName -> characterId)
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  // Quick assign target
  const [quickAssignTarget, setQuickAssignTarget] = useState<string>('');

  const isFantasy = theme === 'fantasy';

  // Check if all items are assigned
  const allAssigned = useMemo(() => {
    if (!lootData.items || lootData.items.length === 0) return true;
    return lootData.items.every(item => assignments[item.name]);
  }, [lootData.items, assignments]);

  // Handle assigning an item to a character
  const handleAssign = (itemName: string, characterId: string) => {
    setAssignments(prev => ({
      ...prev,
      [itemName]: characterId
    }));
  };

  // Quick assign all unassigned items to a character
  const handleQuickAssign = (characterId: string) => {
    if (!characterId) return;
    setQuickAssignTarget(characterId);
    
    const newAssignments: Record<string, string> = { ...assignments };
    lootData.items?.forEach(item => {
      if (!newAssignments[item.name]) {
        newAssignments[item.name] = characterId;
      }
    });
    setAssignments(newAssignments);
  };

  // Handle confirm distribution
  const handleConfirm = () => {
    onConfirm(assignments);
  };

  // Format item display name with quantity and value
  const formatItemName = (item: LootItem): string => {
    let name = item.name;
    if (item.quantity && item.quantity > 1) {
      name = `${item.name} (x${item.quantity})`;
    }
    if (item.sellValue) {
      name += ` - ${item.sellValue} GP`;
    }
    return name;
  };

  // Get character name by ID
  const getCharacterName = (charId: string): string => {
    return characters.find(c => c.id === charId)?.name || 'Unknown';
  };

  // Theme-based styles
  const cardStyles = isFantasy
    ? 'bg-stone-900/95 border-amber-900/50 shadow-[0_0_30px_rgba(217,119,6,0.15)]'
    : 'bg-slate-900/95 border-cyan-900/50 shadow-[0_0_30px_rgba(34,211,238,0.15)]';

  const headerStyles = isFantasy
    ? 'text-fantasy-gold border-b border-amber-900/30'
    : 'text-scifi-accent border-b border-cyan-900/30';

  const buttonPrimaryStyles = isFantasy
    ? 'bg-fantasy-gold hover:bg-amber-500 text-black'
    : 'bg-scifi-accent hover:bg-cyan-400 text-slate-950';

  const buttonSecondaryStyles = isFantasy
    ? 'border-stone-700 hover:border-amber-700 hover:bg-amber-900/20'
    : 'border-slate-700 hover:border-cyan-700 hover:bg-cyan-900/20';

  // If already distributed, show confirmation state
  if (distributed) {
    return (
      <div className={`p-6 rounded-2xl border-2 ${cardStyles} opacity-60`}>
        <div className={`flex items-center gap-3 pb-4 mb-4 ${headerStyles}`}>
          <Icons.CheckCircle className={`w-6 h-6 ${isFantasy ? 'text-green-500' : 'text-emerald-400'}`} />
          <span className="text-sm font-black uppercase tracking-widest">Loot Distributed</span>
        </div>
        <div className={`text-sm opacity-80 ${isFantasy ? 'italic font-fantasyBody' : 'font-mono'}`}>
          {distributionMessage || 'Items have been distributed to the party.'}
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 rounded-2xl border-2 ${cardStyles} animate-pop-in`}>
      {/* Header */}
      <div className={`flex items-center gap-3 pb-4 mb-4 ${headerStyles}`}>
        <Icons.Package className={`w-6 h-6 ${isFantasy ? 'text-fantasy-gold' : 'text-scifi-accent'}`} />
        <span className="text-sm font-black uppercase tracking-widest">Loot Found</span>
      </div>

      {/* Coins Section - auto-added to party */}
      {lootData.coins && lootData.coins.totalGP > 0 && (
        <div className={`flex items-center justify-between p-4 mb-4 rounded-xl border ${isFantasy ? 'bg-amber-950/20 border-amber-900/30' : 'bg-cyan-950/20 border-cyan-900/30'}`}>
          <div className="flex items-center gap-3">
            <Icons.Coins className={`w-5 h-5 ${isFantasy ? 'text-fantasy-gold' : 'text-scifi-accent'}`} />
            <span className="font-bold">{lootData.coins.totalGP} GP</span>
            {lootData.coins.breakdown && (
              <span className="text-xs opacity-50 font-mono">
                ({Object.entries(lootData.coins.breakdown)
                  .filter(([_, v]) => v && v > 0)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(', ')})
              </span>
            )}
          </div>
          <div className={`flex items-center gap-2 text-xs font-bold ${isFantasy ? 'text-green-500' : 'text-emerald-400'}`}>
            <Icons.CheckCircle className="w-4 h-4" />
            <span>Added to Party Treasury</span>
          </div>
        </div>
      )}

      {/* Items Section */}
      {lootData.items && lootData.items.length > 0 && (
        <>
          {/* Quick Assign Dropdown */}
          <div className={`flex items-center gap-3 mb-4 p-3 rounded-xl border ${isFantasy ? 'bg-stone-800/50 border-stone-700' : 'bg-slate-800/50 border-slate-700'}`}>
            <span className="text-xs font-bold uppercase tracking-widest opacity-60">Quick Assign All:</span>
            <select
              value={quickAssignTarget}
              onChange={(e) => handleQuickAssign(e.target.value)}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-bold transition-colors cursor-pointer ${isFantasy ? 'bg-stone-900 border-stone-600 text-stone-200 hover:border-amber-700' : 'bg-slate-900 border-slate-600 text-slate-200 hover:border-cyan-700'}`}
            >
              <option value="">Select character...</option>
              {characters.map(char => (
                <option key={char.id} value={char.id}>{char.name}</option>
              ))}
            </select>
          </div>

          {/* Item List */}
          <div className="space-y-2 mb-4">
            {lootData.items.map((item, idx) => {
              const assignedTo = assignments[item.name];
              const rarityColor = item.rarity ? RARITY_COLORS[item.rarity] : '';

              return (
                <div
                  key={`${item.name}-${idx}`}
                  className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${assignedTo
                    ? (isFantasy ? 'bg-green-950/20 border-green-800/40' : 'bg-emerald-950/20 border-emerald-800/40')
                    : (isFantasy ? 'bg-stone-800/30 border-stone-700/50' : 'bg-slate-800/30 border-slate-700/50')
                  }`}
                >
                  {/* Item Info */}
                  <div className="flex-1">
                    <div className={`font-bold text-sm ${rarityColor}`}>
                      {formatItemName(item)}
                    </div>
                    {item.description && (
                      <div className="text-xs opacity-50 mt-1">{item.description}</div>
                    )}
                  </div>

                  {/* Character Assignment Buttons */}
                  <div className="flex gap-1.5">
                    {characters.map(char => (
                      <button
                        key={char.id}
                        onClick={() => handleAssign(item.name, char.id)}
                        title={char.name}
                        className={`w-9 h-9 rounded-lg border-2 overflow-hidden transition-all hover:scale-110 ${assignedTo === char.id
                          ? (isFantasy ? 'border-fantasy-gold ring-2 ring-fantasy-gold/30' : 'border-scifi-accent ring-2 ring-scifi-accent/30')
                          : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/30'
                        }`}
                      >
                        <img src={char.avatar} className="w-full h-full object-cover" alt={char.name} />
                      </button>
                    ))}
                  </div>

                  {/* Assigned indicator */}
                  {assignedTo && (
                    <div className={`text-xs font-bold opacity-70 min-w-[4rem] text-right ${isFantasy ? 'text-fantasy-gold' : 'text-scifi-accent'}`}>
                      {getCharacterName(assignedTo)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onSkip}
          className={`px-5 py-3 rounded-xl border-2 text-xs font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 ${buttonSecondaryStyles}`}
        >
          Skip Loot
        </button>
        <button
          onClick={handleConfirm}
          disabled={!allAssigned}
          className={`flex-1 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 ${allAssigned ? buttonPrimaryStyles : 'bg-white/5 text-white/30 cursor-not-allowed'}`}
        >
          {allAssigned ? 'Confirm Distribution' : 'Assign All Items First'}
        </button>
      </div>
    </div>
  );
};
