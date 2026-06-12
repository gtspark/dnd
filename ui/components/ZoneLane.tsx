import React from 'react';
import { ThemeMode, Combatant } from '../types';

interface ZoneLaneProps {
  positions: Record<string, { band: number; name: string }>;
  order: Combatant[];
  currentTurnIndex: number;
  theme: ThemeMode;
}

const BAND_LABELS = ['Engaged', 'Near', 'Far', 'Distant'];
const BAND_HINTS = ['melee', '~30 ft', '~60-90 ft', 'long range'];

const normalizeKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Horizontal range-band lane: four zones with combatant chips.
 * Mirrors combatState.positions maintained by the server's zone tracker.
 */
export const ZoneLane: React.FC<ZoneLaneProps> = ({ positions, order, currentTurnIndex, theme }) => {
  const isFantasy = theme === 'fantasy';

  // Group combatants into bands, joining position entries to initiative entries
  const bands: Array<Array<{ name: string; isPlayer: boolean; isDead: boolean; isCurrent: boolean }>> = [[], [], [], []];
  for (const [key, pos] of Object.entries(positions)) {
    const band = Math.max(0, Math.min(3, pos.band));
    const combatant = order.find(c => normalizeKey(c.name) === normalizeKey(pos.name) || normalizeKey(c.id) === key);
    const idx = combatant ? order.indexOf(combatant) : -1;
    bands[band].push({
      name: pos.name,
      isPlayer: combatant ? combatant.type === 'player' : false,
      isDead: combatant?.isDead || false,
      isCurrent: idx !== -1 && idx === currentTurnIndex
    });
  }

  return (
    <div className={`mx-6 mt-3 grid grid-cols-4 gap-2 animate-pop-in`}>
      {BAND_LABELS.map((label, i) => (
        <div
          key={label}
          className={`rounded-xl border p-2 min-h-[64px] ${
            isFantasy ? 'border-stone-700/60 bg-stone-900/40' : 'border-slate-700/60 bg-slate-900/40'
          } ${i === 0 ? (isFantasy ? 'border-red-800/60' : 'border-cyan-700/60') : ''}`}
        >
          <div className="flex items-baseline justify-between mb-1.5">
            <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${i === 0 ? (isFantasy ? 'text-red-400' : 'text-cyan-300') : 'opacity-50'}`}>{label}</span>
            <span className="text-[8px] opacity-30 font-mono">{BAND_HINTS[i]}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {bands[i].map(c => (
              <span
                key={c.name}
                className={`px-2 py-0.5 rounded-full border text-[10px] font-bold truncate max-w-[110px] ${
                  c.isDead
                    ? 'opacity-25 line-through border-transparent bg-black/30'
                    : c.isPlayer
                      ? (isFantasy ? 'border-amber-500/50 bg-amber-900/30 text-amber-200' : 'border-cyan-400/50 bg-cyan-900/30 text-cyan-200')
                      : (isFantasy ? 'border-red-500/50 bg-red-950/40 text-red-300' : 'border-rose-500/50 bg-rose-950/40 text-rose-300')
                } ${c.isCurrent ? 'ring-2 ring-white/40 animate-pulse' : ''}`}
                title={c.name}
              >
                {c.name}
              </span>
            ))}
            {bands[i].length === 0 && <span className="text-[9px] opacity-20 italic">empty</span>}
          </div>
        </div>
      ))}
    </div>
  );
};
