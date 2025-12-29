import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeMode, SpellDetails, ItemDetails, InventoryItem } from '../types';

// ==================== TOOLTIP WRAPPER ====================

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  theme: ThemeMode;
  disabled?: boolean;
}

export function Tooltip({ children, content, theme, disabled = false }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0, flipY: false });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    const tooltipHeight = tooltipRef.current?.offsetHeight || 400;
    const tooltipWidth = 340;
    const offset = 15;
    
    // Check if tooltip fits below cursor
    const spaceBelow = window.innerHeight - e.clientY - offset;
    const spaceAbove = e.clientY - offset;
    const flipY = spaceBelow < tooltipHeight && spaceAbove > spaceBelow;
    
    // Horizontal positioning - prefer right of cursor, constrain to viewport
    let x = e.clientX + offset;
    if (x + tooltipWidth > window.innerWidth - 10) {
      // Not enough space on right, position to left edge of viewport with padding
      x = Math.max(10, window.innerWidth - tooltipWidth - 10);
    }
    
    // Vertical positioning - below cursor normally, above if flipped
    let y;
    if (flipY) {
      // Position above cursor - anchor bottom of tooltip to cursor
      y = e.clientY - offset;
    } else {
      // Position below cursor
      y = e.clientY + offset;
    }
    
    setPosition({ x, y, flipY });
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (disabled) return;
    handleMouseMove(e);
    timeoutRef.current = setTimeout(() => setIsVisible(true), 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const isFantasy = theme === 'fantasy';

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="cursor-pointer"
      >
        {children}
      </div>

      {isVisible && createPortal(
        <div
          ref={tooltipRef}
          className={`fixed z-[9999] pointer-events-none animate-fade-in ${
            isFantasy 
              ? 'bg-stone-900/95 border-2 border-amber-700/50 shadow-xl shadow-amber-900/20' 
              : 'bg-slate-900/95 border-2 border-cyan-500/30 shadow-xl shadow-cyan-900/20'
          } rounded-xl backdrop-blur-sm max-w-[340px] overflow-hidden`}
          style={{ 
            left: position.x, 
            ...(position.flipY 
              ? { bottom: window.innerHeight - position.y }
              : { top: position.y }
            ),
          }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
}

// ==================== SPELL TOOLTIP CONTENT ====================

interface SpellTooltipProps {
  spell: SpellDetails;
  theme: ThemeMode;
}

export function SpellTooltipContent({ spell, theme }: SpellTooltipProps) {
  const isFantasy = theme === 'fantasy';
  const accentColor = isFantasy ? 'text-amber-400' : 'text-cyan-400';
  const mutedColor = isFantasy ? 'text-stone-400' : 'text-slate-400';
  const borderColor = isFantasy ? 'border-amber-900/30' : 'border-cyan-900/30';

  if (spell.error) {
    return (
      <div className="p-4 text-center">
        <div className="text-2xl mb-2">❓</div>
        <div className={`text-sm ${mutedColor}`}>{spell.error}</div>
      </div>
    );
  }

  const levelText = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;

  return (
    <div className="text-sm">
      {/* Header */}
      <div className={`p-3 border-b ${borderColor} bg-black/20`}>
        <div className="flex items-center justify-between gap-4">
          <div className={`font-bold text-base ${accentColor}`}>{spell.name}</div>
          <div className={`text-xs font-mono uppercase ${mutedColor}`}>{levelText}</div>
        </div>
        <div className={`text-xs ${mutedColor} mt-1`}>{spell.school}</div>
      </div>

      {/* Stats */}
      <div className={`p-3 border-b ${borderColor} space-y-1.5 text-white`}>
        {spell.damage && (
          <div className="flex items-center gap-2">
            <span className="text-red-400">💥</span>
            <span className="font-mono text-red-300">{spell.damage.formula}</span>
            <span className={mutedColor}>{spell.damage.type}</span>
          </div>
        )}
        {spell.dc && (
          <div className="flex items-center gap-2">
            <span>🎯</span>
            <span className="text-white">{spell.dc.type} Save</span>
            <span className={`text-xs ${mutedColor}`}>({spell.dc.success} on save)</span>
          </div>
        )}
        {spell.area && (
          <div className="flex items-center gap-2">
            <span>📐</span>
            <span className="text-white">{spell.area.size}ft {spell.area.type}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span>📏</span>
          <span className="text-white">{spell.range}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>⏱️</span>
          <span className="text-white">{spell.casting_time}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>🔮</span>
          <span className="text-white">{spell.components.join(', ')}</span>
          {spell.material && <span className={`text-xs ${mutedColor}`}>*</span>}
        </div>
        {spell.duration !== 'Instantaneous' && (
          <div className="flex items-center gap-2">
            <span>⌛</span>
            <span className="text-white">{spell.duration}</span>
            {spell.concentration && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-bold">C</span>
            )}
          </div>
        )}
        {spell.ritual && (
          <div className="flex items-center gap-2">
            <span>📜</span>
            <span className="text-purple-400">Ritual</span>
          </div>
        )}
      </div>

      {/* Stealth Info */}
      {(spell.isAudible || spell.isVisible) && (
        <div className={`px-3 py-2 border-b ${borderColor} flex gap-4 text-xs ${mutedColor}`}>
          {spell.isAudible && (
            <div className="flex items-center gap-1">
              <span>👂</span>
              <span>Audible</span>
            </div>
          )}
          {spell.isVisible && (
            <div className="flex items-center gap-1">
              <span>👁️</span>
              <span>Visible</span>
            </div>
          )}
        </div>
      )}

      {/* Material Component */}
      {spell.material && (
        <div className={`px-3 py-2 border-b ${borderColor} text-xs ${mutedColor} italic`}>
          *Material: {spell.material}
        </div>
      )}

      {/* Description */}
      <div className={`p-3 text-xs leading-relaxed ${mutedColor} max-h-48 overflow-y-auto`}>
        {spell.description.length > 400 
          ? spell.description.substring(0, 400) + '...' 
          : spell.description}
      </div>

      {/* Higher Levels */}
      {spell.higher_level && (
        <div className={`px-3 py-2 border-t ${borderColor} text-xs bg-black/20`}>
          <div className={`font-bold ${accentColor} mb-1`}>At Higher Levels:</div>
          <div className={`${mutedColor} leading-relaxed`}>
            {spell.higher_level.length > 150 
              ? spell.higher_level.substring(0, 150) + '...' 
              : spell.higher_level}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== ITEM TOOLTIP CONTENT ====================

interface ItemTooltipProps {
  item: ItemDetails;
  inventoryData?: InventoryItem;
  theme: ThemeMode;
}

export function ItemTooltipContent({ item, inventoryData, theme }: ItemTooltipProps) {
  const isFantasy = theme === 'fantasy';
  const accentColor = isFantasy ? 'text-amber-400' : 'text-cyan-400';
  const mutedColor = isFantasy ? 'text-stone-400' : 'text-slate-400';
  const borderColor = isFantasy ? 'border-amber-900/30' : 'border-cyan-900/30';

  if (item.error) {
    return (
      <div className="p-4 text-center">
        <div className="text-2xl mb-2">❓</div>
        <div className={`text-sm ${mutedColor}`}>{item.error}</div>
      </div>
    );
  }

  const rarityColors: Record<string, string> = {
    common: 'text-gray-400',
    uncommon: 'text-green-400',
    rare: 'text-blue-400',
    'very rare': 'text-purple-400',
    legendary: 'text-orange-400'
  };

  return (
    <div className="text-sm">
      {/* Header */}
      <div className={`p-3 border-b ${borderColor} bg-black/20`}>
        <div className="flex items-center justify-between gap-4">
          <div className={`font-bold text-base ${item.rarity ? rarityColors[item.rarity.toLowerCase()] || accentColor : accentColor}`}>
            {item.name}
          </div>
        </div>
        <div className={`text-xs ${mutedColor} mt-1`}>
          {item.equipment_category}
          {item.armor_category && ` (${item.armor_category})`}
          {item.rarity && ` • ${item.rarity}`}
        </div>
      </div>

      {/* Stats */}
      <div className={`p-3 border-b ${borderColor} space-y-1.5 text-white`}>
        {/* Weapon Damage */}
        {item.damage && (
          <div className="flex items-center gap-2">
            <span className="text-red-400">⚔️</span>
            <span className="font-mono text-red-300">{item.damage.dice}</span>
            <span className={mutedColor}>{item.damage.type}</span>
          </div>
        )}
        
        {/* Weapon Range */}
        {item.range && (
          <div className="flex items-center gap-2">
            <span>📏</span>
            <span className="text-white">{item.range.normal}ft</span>
            {item.range.long && <span className={mutedColor}>/ {item.range.long}ft</span>}
          </div>
        )}

        {/* Armor Class */}
        {item.armor_class && (
          <div className="flex items-center gap-2">
            <span>🛡️</span>
            <span className="text-white">AC {item.armor_class.base}</span>
            {item.armor_class.dex_bonus && (
              <span className={`text-xs ${mutedColor}`}>
                + DEX{item.armor_class.max_bonus ? ` (max ${item.armor_class.max_bonus})` : ''}
              </span>
            )}
          </div>
        )}

        {/* Weight & Cost */}
        {(item.weight || item.cost) && (
          <div className="flex items-center gap-4 text-white">
            {item.weight !== undefined && item.weight > 0 && (
              <div className="flex items-center gap-1">
                <span>⚖️</span>
                <span>{item.weight} lb</span>
              </div>
            )}
            {item.cost && (
              <div className="flex items-center gap-1">
                <span>💰</span>
                <span className="text-yellow-400">{item.cost.quantity} {item.cost.unit}</span>
              </div>
            )}
          </div>
        )}

        {/* Attunement */}
        {item.requires_attunement && (
          <div className="flex items-center gap-2 text-purple-400">
            <span>✨</span>
            <span>Requires Attunement</span>
          </div>
        )}
      </div>

      {/* Properties */}
      {item.properties && item.properties.length > 0 && (
        <div className={`p-3 border-b ${borderColor}`}>
          <div className="flex flex-wrap gap-1.5">
            {item.properties.map(prop => (
              <span 
                key={prop} 
                className={`text-xs px-2 py-0.5 rounded-full ${
                  isFantasy 
                    ? 'bg-amber-900/30 text-amber-300 border border-amber-700/30' 
                    : 'bg-cyan-900/30 text-cyan-300 border border-cyan-700/30'
                }`}
              >
                {prop}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Inventory condition if available */}
      {inventoryData && (
        <div className={`px-3 py-2 border-b ${borderColor} text-xs`}>
          <div className="flex items-center justify-between">
            <span className={mutedColor}>Condition:</span>
            <span className={getConditionColor(inventoryData.condition)}>
              {inventoryData.condition}
            </span>
          </div>
          {inventoryData.quantity > 1 && (
            <div className="flex items-center justify-between mt-1">
              <span className={mutedColor}>Quantity:</span>
              <span>{inventoryData.quantity}</span>
            </div>
          )}
        </div>
      )}

      {/* Description */}
      {item.description && (
        <div className={`p-3 text-xs leading-relaxed ${mutedColor} max-h-24 overflow-y-auto`}>
          {item.description.length > 200 
            ? item.description.substring(0, 200) + '...' 
            : item.description}
        </div>
      )}
    </div>
  );
}

// ==================== TREASURE/MISC TOOLTIP CONTENT ====================

interface TreasureTooltipProps {
  item: InventoryItem;
  theme: ThemeMode;
}

export function TreasureTooltipContent({ item, theme }: TreasureTooltipProps) {
  const isFantasy = theme === 'fantasy';
  const accentColor = isFantasy ? 'text-amber-400' : 'text-cyan-400';
  const mutedColor = isFantasy ? 'text-stone-400' : 'text-slate-400';
  const borderColor = isFantasy ? 'border-amber-900/30' : 'border-cyan-900/30';

  const categoryIcons: Record<string, string> = {
    weapon: '⚔️',
    armor: '🛡️',
    consumable: '🧪',
    treasure: '💎',
    misc: '📦'
  };

  return (
    <div className="text-sm">
      {/* Header */}
      <div className={`p-3 border-b ${borderColor} bg-black/20`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{categoryIcons[item.category] || '📦'}</span>
          <div className={`font-bold text-base ${accentColor}`}>{item.name}</div>
        </div>
        <div className={`text-xs ${mutedColor} mt-1 capitalize`}>{item.category}</div>
      </div>

      {/* Stats */}
      <div className={`p-3 space-y-2 text-white`}>
        {/* Sell Value */}
        {item.value > 0 && (
          <div className="flex items-center gap-2">
            <span>💰</span>
            <span>
              {item.treasure ? 'Can sell for ' : 'Worth '}
              <span className="text-yellow-400 font-bold">{item.value} GP</span>
            </span>
          </div>
        )}

        {/* Condition */}
        <div className="flex items-center gap-2">
          <span>📋</span>
          <span className={mutedColor}>Condition:</span>
          <span className={getConditionColor(item.condition)}>{item.condition}</span>
        </div>

        {/* Quantity */}
        {item.quantity > 1 && (
          <div className="flex items-center gap-2">
            <span>📦</span>
            <span>Quantity: <span className="font-bold">{item.quantity}</span></span>
          </div>
        )}

        {/* Equipped status */}
        {item.equipped && (
          <div className="flex items-center gap-2 text-green-400">
            <span>✓</span>
            <span>Equipped</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== HELPERS ====================

function getConditionColor(condition: string): string {
  switch (condition) {
    case 'pristine': return 'text-cyan-400';
    case 'good': return 'text-green-400';
    case 'worn': return 'text-yellow-400';
    case 'damaged': return 'text-orange-400';
    case 'broken': return 'text-red-400';
    default: return 'text-gray-400';
  }
}
