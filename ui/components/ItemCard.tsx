import React, { useState, useEffect } from 'react';
import type { ThemeMode, ItemDetails, InventoryItem } from '../types';
import { getItemDetails } from '../services/apiService';
import { Tooltip, ItemTooltipContent, TreasureTooltipContent } from './Tooltip';

interface ItemCardProps {
  item: InventoryItem;
  theme: ThemeMode;
}

export function ItemCard({ item, theme }: ItemCardProps) {
  const [itemData, setItemData] = useState<ItemDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Only fetch API data for weapons/armor that have a baseItem mapping
    // Custom items and items without baseItem just show inventory data
    if ((item.category === 'weapon' || item.category === 'armor') && item.baseItem && !item.custom) {
      setIsLoading(true);
      getItemDetails(item.baseItem)
        .then(data => {
          // Only set if we got real data (no error)
          if (!data.error) {
            setItemData(data);
          }
        })
        .finally(() => setIsLoading(false));
    }
  }, [item.baseItem, item.category, item.custom]);

  const isFantasy = theme === 'fantasy';

  // Category styling
  const categoryStyles: Record<string, { icon: string; border: string; bg: string; text: string }> = {
    weapon: { 
      icon: '⚔️', 
      border: 'border-red-500/30', 
      bg: 'bg-red-950/10',
      text: 'text-red-300'
    },
    armor: { 
      icon: '🛡️', 
      border: 'border-blue-500/30', 
      bg: 'bg-blue-950/10',
      text: 'text-blue-300'
    },
    consumable: { 
      icon: '🧪', 
      border: 'border-green-500/30', 
      bg: 'bg-green-950/10',
      text: 'text-green-300'
    },
    treasure: { 
      icon: '💎', 
      border: 'border-yellow-500/30', 
      bg: 'bg-yellow-950/10',
      text: 'text-yellow-300'
    },
    misc: { 
      icon: '📦', 
      border: 'border-gray-500/30', 
      bg: 'bg-gray-950/10',
      text: 'text-gray-300'
    },
  };

  const style = categoryStyles[item.category] || categoryStyles.misc;

  // Condition indicator colors
  const conditionColors: Record<string, string> = {
    pristine: 'bg-cyan-500',
    good: 'bg-green-500',
    worn: 'bg-yellow-500',
    damaged: 'bg-orange-500',
    broken: 'bg-red-500',
  };

  const cardContent = (
    <div 
      className={`p-3 rounded-xl border-2 ${style.border} ${style.bg} font-bold text-[11px] tracking-wide ${style.text} flex items-center gap-3 transition-all hover:scale-[1.02] hover:shadow-lg ${
        isLoading ? 'opacity-50' : ''
      }`}
    >
      {/* Icon */}
      <span className="text-base flex-shrink-0">{style.icon}</span>
      
      {/* Name */}
      <span className="flex-1 truncate">{item.name}</span>
      
      {/* Quantity badge */}
      {item.quantity > 1 && (
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
          isFantasy ? 'bg-amber-900/50 text-amber-300' : 'bg-cyan-900/50 text-cyan-300'
        }`}>
          x{item.quantity}
        </span>
      )}
      
      {/* Equipped indicator */}
      {item.equipped && (
        <span className="text-green-400 text-xs">✓</span>
      )}
      
      {/* Condition dot */}
      <span 
        className={`w-2 h-2 rounded-full flex-shrink-0 ${conditionColors[item.condition] || 'bg-gray-500'}`}
        title={item.condition}
      />
    </div>
  );

  // Determine which tooltip to show
  const tooltipContent = itemData 
    ? <ItemTooltipContent item={itemData} inventoryData={item} theme={theme} />
    : <TreasureTooltipContent item={item} theme={theme} />;

  return (
    <Tooltip 
      content={tooltipContent}
      theme={theme}
    >
      {cardContent}
    </Tooltip>
  );
}
