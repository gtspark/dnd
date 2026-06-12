import React, { useState, useEffect } from 'react';
import { Ship, ShipSystem, ThemeMode } from '../types';
import { updateShipPower } from '../services/apiService';

interface ShipSystemsModalProps {
  ship: Ship;
  theme: ThemeMode;
  onClose: () => void;
  onPowerSaved?: (updatedShip: Ship) => void;
  campaignId: string;
}

// System icon map — using unicode for zero-dependency rendering
const SYSTEM_ICONS: Record<string, string> = {
  engines: '\u2699',      // ⚙
  weapons: '\u2694',      // ⚔
  shields_sys: '\u26E8',  // ⛨ (shield)
  sensors: '\u25CE',      // ◎
  comms: '\u2637',        // ☷
  life_support: '\u2661', // ♡
  cargo_bay: '\u25A3',    // ▣
};

const SYSTEM_ORDER = ['engines', 'weapons', 'shields_sys', 'sensors', 'comms', 'life_support', 'cargo_bay'];

function statusColor(status: string) {
  switch (status) {
    case 'operational': return { text: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400' };
    case 'damaged':     return { text: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-500/10', dot: 'bg-yellow-400' };
    case 'disabled':    return { text: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10', dot: 'bg-orange-400' };
    case 'destroyed':   return { text: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/10', dot: 'bg-red-400' };
    default:            return { text: 'text-slate-400', border: 'border-slate-500/30', bg: 'bg-slate-500/10', dot: 'bg-slate-400' };
  }
}

function hullBarColor(pct: number): string {
  if (pct > 60) return 'bg-cyan-500';
  if (pct > 25) return 'bg-yellow-500';
  if (pct > 0) return 'bg-red-500 animate-pulse-slow';
  return 'bg-red-900';
}

function shieldBarColor(pct: number): string {
  if (pct > 50) return 'bg-blue-400';
  if (pct > 0) return 'bg-blue-300/60';
  return 'bg-slate-700';
}

export function ShipSystemsModal({ ship, theme, onClose, onPowerSaved, campaignId }: ShipSystemsModalProps) {
  const isScifi = theme === 'scifi';
  const accent = isScifi ? 'cyan' : 'amber';
  const bg = isScifi ? 'slate' : 'stone';
  const headerFont = isScifi ? 'font-scifiHeader' : 'font-fantasyHeader';
  const bodyFont = isScifi ? 'font-scifiBody' : '';
  const accentText = isScifi ? 'text-cyan-400' : 'text-amber-400';
  const accentBorder = isScifi ? 'border-cyan-500/20' : 'border-amber-500/20';

  // Local power allocation state
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [dirty, setDirty] = useState(false);

  // Initialize allocations from ship data
  useEffect(() => {
    const initial: Record<string, number> = {};
    for (const [key, sys] of Object.entries(ship.systems)) {
      initial[key] = sys.power_allocated;
    }
    setAllocations(initial);
    setDirty(false);
  }, [ship]);

  const totalUsed = Object.values(allocations).reduce((s, v) => s + v, 0);
  const totalBudget = ship.power.total;
  const remaining = totalBudget - totalUsed;

  const adjustPower = (sysKey: string, delta: number) => {
    const sys = ship.systems[sysKey];
    if (!sys || sys.status === 'destroyed' || sys.status === 'disabled') return;
    const current = allocations[sysKey] || 0;
    const next = current + delta;
    if (next < sys.power_min || next > sys.power_max) return;
    if (delta > 0 && remaining <= 0) return;
    setAllocations(prev => ({ ...prev, [sysKey]: next }));
    setDirty(true);
  };

  const resetPower = () => {
    const initial: Record<string, number> = {};
    for (const [key, sys] of Object.entries(ship.systems)) {
      initial[key] = sys.power_allocated;
    }
    setAllocations(initial);
    setDirty(false);
  };

  const commitPower = async () => {
    setSaveState('saving');
    try {
      const result = await updateShipPower(allocations, campaignId);
      if (result.success && onPowerSaved) {
        onPowerSaved(result.ship as Ship);
      }
      setSaveState('saved');
      setDirty(false);
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      console.error('Power commit failed:', err);
      setSaveState('idle');
    }
  };

  const hullPct = ship.hull.max > 0 ? Math.round((ship.hull.current / ship.hull.max) * 100) : 0;
  const shieldPct = ship.shields.max > 0 ? Math.round((ship.shields.current / ship.shields.max) * 100) : 0;
  const fuelPct = ship.fuel.max > 0 ? Math.round((ship.fuel.current / ship.fuel.max) * 100) : 0;
  const suppliesPct = ship.supplies.max > 0 ? Math.round((ship.supplies.current / ship.supplies.max) * 100) : 0;

  const overBudget = totalUsed > totalBudget;

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`${isScifi ? 'bg-slate-900 border-cyan-500/20' : 'bg-stone-900 border-amber-500/20'} border rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-pop-in`}>

        {/* Header */}
        <div className={`px-6 py-4 border-b ${accentBorder} flex items-center justify-between`}>
          <div>
            <h2 className={`${headerFont} text-xl font-black text-white uppercase tracking-wider`}>
              {ship.name}
            </h2>
            <p className={`text-xs ${accentText} opacity-70 mt-0.5`}>
              {ship.class} &mdash; {ship.location}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-lg ${isScifi ? 'bg-slate-800 hover:bg-slate-700' : 'bg-stone-800 hover:bg-stone-700'} flex items-center justify-center text-white/40 hover:text-white transition-colors`}
          >
            &times;
          </button>
        </div>

        {/* Hull + Shields Bar */}
        <div className={`px-6 py-4 border-b ${accentBorder} space-y-3`}>
          {/* Hull */}
          <div className="flex items-center gap-3">
            <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60 w-12`}>Hull</span>
            <div className="flex-1 h-5 bg-black/40 rounded-full overflow-hidden p-[2px]">
              <div
                className={`h-full rounded-full transition-all duration-700 ${hullBarColor(hullPct)}`}
                style={{ width: `${hullPct}%` }}
              />
            </div>
            <span className={`text-xs font-mono ${accentText} w-20 text-right`}>
              {ship.hull.current}/{ship.hull.max}
            </span>
          </div>
          {/* Shields */}
          <div className="flex items-center gap-3">
            <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60 w-12`}>Shld</span>
            <div className="flex-1 h-5 bg-black/40 rounded-full overflow-hidden p-[2px]">
              <div
                className={`h-full rounded-full transition-all duration-700 ${shieldBarColor(shieldPct)}`}
                style={{ width: `${shieldPct}%` }}
              />
            </div>
            <span className={`text-xs font-mono ${accentText} w-20 text-right`}>
              {ship.shields.current}/{ship.shields.max}
            </span>
          </div>
          {/* Conditions */}
          {ship.conditions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {ship.conditions.map(c => (
                <span key={c} className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse-slow">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Main content — two columns */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: Systems Grid */}
          <div className={`flex-1 overflow-y-auto p-6 ${bodyFont}`}>
            <div className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60 mb-4`}>
              Ship Systems
            </div>

            <div className="space-y-3">
              {SYSTEM_ORDER.map(sysKey => {
                const sys = ship.systems[sysKey];
                if (!sys) return null;
                const sc = statusColor(sys.status);
                const power = allocations[sysKey] ?? sys.power_allocated;
                const isOffline = sys.status === 'destroyed' || sys.status === 'disabled';
                const canMinus = !isOffline && power > sys.power_min;
                const canPlus = !isOffline && power < sys.power_max && remaining > 0;

                return (
                  <div
                    key={sysKey}
                    className={`rounded-xl border ${sc.border} ${sc.bg} p-4 ${isOffline ? 'opacity-50' : ''} transition-all`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{SYSTEM_ICONS[sysKey] || '\u2022'}</span>
                        <span className={`text-sm font-bold ${isScifi ? 'text-white' : 'text-stone-100'}`}>
                          {sys.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${sc.text}`}>
                          {sys.status}
                        </span>
                      </div>
                    </div>

                    {/* Power allocation controls */}
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`text-[9px] font-bold uppercase tracking-[0.15em] opacity-40 ${isScifi ? 'text-cyan-300' : 'text-amber-300'}`}>
                        Power
                      </span>
                      <button
                        onClick={() => adjustPower(sysKey, -1)}
                        disabled={!canMinus}
                        className={`w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-colors ${
                          canMinus
                            ? (isScifi ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40' : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/40')
                            : 'bg-white/5 text-white/20 cursor-not-allowed'
                        }`}
                      >
                        -
                      </button>
                      <div className="flex gap-1">
                        {Array.from({ length: sys.power_max }, (_, i) => (
                          <div
                            key={i}
                            className={`w-4 h-4 rounded-sm transition-all duration-300 ${
                              i < power
                                ? (isScifi ? 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.4)]' : 'bg-amber-400 shadow-[0_0_6px_rgba(217,119,6,0.4)]')
                                : 'bg-white/10 border border-white/10'
                            }`}
                          />
                        ))}
                      </div>
                      <button
                        onClick={() => adjustPower(sysKey, 1)}
                        disabled={!canPlus}
                        className={`w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition-colors ${
                          canPlus
                            ? (isScifi ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40' : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/40')
                            : 'bg-white/5 text-white/20 cursor-not-allowed'
                        }`}
                      >
                        +
                      </button>
                      <span className={`text-xs font-mono opacity-40 ml-1`}>
                        {power}/{sys.power_max}
                      </span>
                    </div>

                    {/* Upgrades */}
                    {sys.upgrades.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {sys.upgrades.map(u => (
                          <span key={u} className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${isScifi ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20' : 'bg-amber-500/15 text-amber-300 border border-amber-500/20'}`}>
                            {u}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    {sys.notes && (
                      <p className={`text-[10px] opacity-40 mt-1.5 italic`}>
                        {sys.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Codex Column */}
          <div className={`w-64 border-l ${accentBorder} overflow-y-auto p-5 flex flex-col gap-6 ${bodyFont}`}>

            {/* Power Summary */}
            <div>
              <div className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60 mb-3`}>
                Power Grid
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-3xl font-black font-mono ${overBudget ? 'text-red-400' : (isScifi ? 'text-cyan-300' : 'text-amber-300')}`}>
                  {totalUsed}
                </span>
                <span className="text-sm font-mono text-white/30">/ {totalBudget}</span>
              </div>
              <div className="h-2 bg-black/40 rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${overBudget ? 'bg-red-500' : (isScifi ? 'bg-cyan-500' : 'bg-amber-500')}`}
                  style={{ width: `${Math.min(100, (totalUsed / totalBudget) * 100)}%` }}
                />
              </div>
              <p className={`text-[9px] font-mono ${remaining >= 0 ? 'text-white/30' : 'text-red-400'}`}>
                {remaining >= 0 ? `${remaining} available` : `${Math.abs(remaining)} over budget!`}
              </p>

              {/* Commit / Reset */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={commitPower}
                  disabled={!dirty || overBudget || saveState === 'saving'}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                    dirty && !overBudget
                      ? (isScifi ? 'bg-cyan-500/30 text-cyan-200 hover:bg-cyan-500/50 border border-cyan-500/30' : 'bg-amber-500/30 text-amber-200 hover:bg-amber-500/50 border border-amber-500/30')
                      : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'
                  }`}
                >
                  {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved!' : 'Commit'}
                </button>
                {dirty && (
                  <button
                    onClick={resetPower}
                    className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-white/5 text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors border border-white/5"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

                    {/* Crew Stations */}
                    <div>
                      <div className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60 mb-2`}>
                        Crew Stations
                      </div>
                      <div className="space-y-2">
                        {Object.entries(ship.crew_stations).map(([station, crew]) => (
                          <div key={station} className={`rounded-lg border border-white/5 bg-black/20 p-2 ${crew ? '' : 'opacity-45'}`}>
                            <div className="flex justify-between items-center gap-3">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                                {station.replace('_', ' ')}
                              </span>
                              <span className={`text-[10px] font-mono text-right ${crew ? 'text-white/85' : 'text-white/20'}`}>
                                {crew || '\u2014'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[9px] leading-snug text-white/25 mt-2">
                        Station roles inform ship checks, assistance, and complications.
                      </p>
                    </div>

            {/* Resources */}
            <div>
              <div className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60 mb-2`}>
                Resources
              </div>
              {/* Fuel */}
              <div className="mb-2">
                <div className="flex justify-between text-[9px] font-mono text-white/40 mb-1">
                  <span>Fuel</span>
                  <span>{ship.fuel.current}/{ship.fuel.max} {ship.fuel.unit}</span>
                </div>
                <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${fuelPct > 30 ? (isScifi ? 'bg-cyan-500/70' : 'bg-amber-500/70') : 'bg-orange-500'}`}
                    style={{ width: `${fuelPct}%` }}
                  />
                </div>
              </div>
              {/* Supplies */}
              <div>
                <div className="flex justify-between text-[9px] font-mono text-white/40 mb-1">
                  <span>Supplies</span>
                  <span>{ship.supplies.current}/{ship.supplies.max} {ship.supplies.unit}</span>
                </div>
                <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${suppliesPct > 30 ? (isScifi ? 'bg-cyan-500/70' : 'bg-amber-500/70') : 'bg-orange-500'}`}
                    style={{ width: `${suppliesPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Cargo */}
            <div>
              <div className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60 mb-2`}>
                Cargo Hold
              </div>
              {ship.cargo_manifest.length === 0 ? (
                <p className="text-[10px] text-white/20 italic">Empty</p>
              ) : (
                <div className="space-y-1">
                  {ship.cargo_manifest.map((item, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-[10px] text-white/60">{item.name}</span>
                      {item.quantity > 1 && (
                        <span className="text-[9px] font-mono text-white/30">&times;{item.quantity}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer status bar */}
        <div className={`px-6 py-3 border-t ${accentBorder} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              ship.status === 'docked' ? 'bg-emerald-400' :
              ship.status === 'in_transit' ? 'bg-cyan-400 animate-pulse' :
              ship.status === 'in_combat' ? 'bg-red-400 animate-pulse-slow' :
              ship.status === 'adrift' ? 'bg-orange-400 animate-pulse-slow' :
              'bg-red-600'
            }`} />
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
              {ship.status.replace('_', ' ')}
            </span>
            <span className="text-[10px] text-white/20 ml-2">{ship.location}</span>
          </div>
          <div className="flex items-center gap-4 text-[9px] font-mono text-white/30">
            <span>Fuel {ship.fuel.current}/{ship.fuel.max}</span>
            <span>Supplies {ship.supplies.current}/{ship.supplies.max}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShipSystemsModal;
