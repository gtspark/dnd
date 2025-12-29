import React, { useState } from 'react';
import type { Character, ThemeMode, InventoryItem } from '../types';
import { ItemCard } from './ItemCard';

interface CompanionRosterProps {
  companions: Character[];
  theme: ThemeMode;
  partyCredits?: number;
}

interface CompanionDetailModalProps {
  companion: Character;
  theme: ThemeMode;
  onClose: () => void;
}

function CompanionDetailModal({ companion, theme, onClose }: CompanionDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'stats' | 'items'>('stats');
  const isFantasy = theme === 'fantasy';
  
  const accentColor = isFantasy ? 'amber' : 'cyan';
  const bgColor = isFantasy ? 'stone' : 'slate';

  const getModifier = (stat: number) => {
    const mod = Math.floor((stat - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className={`bg-${bgColor}-900 border-2 border-${accentColor}-500/50 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 border-b border-${bgColor}-700 bg-${bgColor}-800/50`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-xl font-bold text-${accentColor}-400`}>{companion.name}</h2>
              <p className={`text-sm text-${bgColor}-400`}>
                {companion.race && `${companion.race} `}{companion.class}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30`}>
                DM Controlled
              </span>
              <button 
                onClick={onClose}
                className={`text-${bgColor}-400 hover:text-white text-2xl leading-none`}
              >
                &times;
              </button>
            </div>
          </div>
          
          {/* HP and Credits */}
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-2">
              <span className="text-red-400">HP:</span>
              <span className="font-mono">{companion.hp}/{companion.maxHp}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-${accentColor}-400`}>{companion.resourceName}:</span>
              <span className="font-mono">{companion.resource.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex border-b border-${bgColor}-700`}>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              activeTab === 'stats' 
                ? `text-${accentColor}-400 border-b-2 border-${accentColor}-400 bg-${bgColor}-800/30` 
                : `text-${bgColor}-400 hover:text-${bgColor}-200`
            }`}
          >
            Stats
          </button>
          <button
            onClick={() => setActiveTab('items')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              activeTab === 'items' 
                ? `text-${accentColor}-400 border-b-2 border-${accentColor}-400 bg-${bgColor}-800/30` 
                : `text-${bgColor}-400 hover:text-${bgColor}-200`
            }`}
          >
            Items ({companion.inventory.length})
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {activeTab === 'stats' && (
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(companion.stats).map(([stat, value]) => (
                <div 
                  key={stat}
                  className={`bg-${bgColor}-800/50 rounded-lg p-3 text-center border border-${bgColor}-700`}
                >
                  <div className={`text-xs uppercase text-${bgColor}-400 mb-1`}>{stat}</div>
                  <div className="text-2xl font-bold text-white">{value}</div>
                  <div className={`text-sm text-${accentColor}-400`}>{getModifier(value)}</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'items' && (
            <div className="space-y-2">
              {companion.inventory.length === 0 ? (
                <p className={`text-${bgColor}-500 text-center py-4`}>No items</p>
              ) : (
                companion.inventory.map((item, idx) => (
                  <ItemCard key={idx} item={item} theme={theme} />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CompanionRoster({ companions, theme, partyCredits }: CompanionRosterProps) {
  const [selectedCompanion, setSelectedCompanion] = useState<Character | null>(null);
  const isFantasy = theme === 'fantasy';
  
  if (companions.length === 0) return null;

  const accentColor = isFantasy ? 'amber' : 'cyan';
  const bgColor = isFantasy ? 'stone' : 'slate';

  return (
    <>
      <div className={`mt-4 p-3 rounded-xl bg-${bgColor}-900/50 border border-${bgColor}-700/50`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-bold text-${bgColor}-400 uppercase tracking-wider flex items-center gap-2`}>
            <span>Companions</span>
            <span className={`text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30`}>
              DM Controlled
            </span>
          </h3>
          {partyCredits !== undefined && (
            <div className={`text-xs text-${bgColor}-400`}>
              Party Pool: <span className={`text-${accentColor}-400 font-mono`}>{partyCredits.toLocaleString()}</span> {isFantasy ? 'GP' : 'Creds'}
            </div>
          )}
        </div>

        {/* Companion Cards - stacked layout for narrow sidebar */}
        <div className="space-y-2">
          {companions.map(companion => {
            const hpPercent = (companion.hp / companion.maxHp) * 100;
            const hpColor = hpPercent > 50 ? 'bg-green-500' : hpPercent > 25 ? 'bg-yellow-500' : 'bg-red-500';

            return (
              <div
                key={companion.id}
                onClick={() => setSelectedCompanion(companion)}
                className={`p-3 rounded-lg bg-${bgColor}-800/50 border border-${bgColor}-700/50 cursor-pointer hover:border-${accentColor}-500/30 hover:bg-${bgColor}-800 transition-all group`}
              >
                {/* Top row: Name and class */}
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white text-sm">{companion.name}</span>
                  <span className={`text-xs text-${bgColor}-400`}>{companion.class}</span>
                </div>
                
                {/* HP Bar - full width */}
                <div className="mb-2">
                  <div className={`h-2 bg-${bgColor}-700 rounded-full overflow-hidden`}>
                    <div 
                      className={`h-full ${hpColor} transition-all`}
                      style={{ width: `${hpPercent}%` }}
                    />
                  </div>
                </div>

                {/* Bottom row: HP and Credits */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 font-mono">
                    HP: {companion.hp}/{companion.maxHp}
                  </span>
                  <span className={`font-mono text-${accentColor}-400`}>
                    {companion.resource.toLocaleString()} {companion.resourceName}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedCompanion && (
        <CompanionDetailModal
          companion={selectedCompanion}
          theme={theme}
          onClose={() => setSelectedCompanion(null)}
        />
      )}
    </>
  );
}
