import React, { useState } from 'react';
import type { Character, ThemeMode } from '../types';
import CharacterSheetModal from './CharacterSheetModal';

interface CompanionRosterProps {
  companions: Character[];
  theme: ThemeMode;
  partyCredits?: number;
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

      {/* Detail Modal — read-only for DM companions */}
      {selectedCompanion && (
        <CharacterSheetModal
          character={selectedCompanion}
          theme={theme}
          onClose={() => setSelectedCompanion(null)}
          onUpdateHp={() => {}}
          onUpdateCredits={() => {}}
          readOnly
        />
      )}
    </>
  );
}
