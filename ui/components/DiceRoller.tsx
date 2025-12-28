import React, { useState } from 'react';
import { Icons } from './Icons';
import { ThemeMode } from '../types';

interface DiceRollerProps {
  theme: ThemeMode;
  onRoll: (faces: number) => void;
  onCustomRoll: (dice: { qty: number; faces: number }[]) => void;
}

export const DiceRoller: React.FC<DiceRollerProps> = ({ theme, onRoll, onCustomRoll }) => {
  const [isRolling, setIsRolling] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customDice, setCustomDice] = useState<{ qty: number; faces: number }[]>([{ qty: 1, faces: 6 }]);

  const handleRoll = (faces: number) => {
    setIsRolling(true);
    setTimeout(() => {
      setIsRolling(false);
      onRoll(faces);
    }, 800);
  };

  const handleCustomRoll = () => {
    setIsRolling(true);
    setShowCustomModal(false);
    setTimeout(() => {
      setIsRolling(false);
      onCustomRoll(customDice);
    }, 800);
  };

  const addDiceRow = () => {
    if (customDice.length < 5) {
      setCustomDice([...customDice, { qty: 1, faces: 6 }]);
    }
  };

  const removeDiceRow = (index: number) => {
    if (customDice.length > 1) {
      setCustomDice(customDice.filter((_, i) => i !== index));
    }
  };

  const updateDiceRow = (index: number, field: 'qty' | 'faces', value: number) => {
    const updated = [...customDice];
    updated[index][field] = value;
    setCustomDice(updated);
  };

  const btnClass = `
    relative group flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-500 transform hover:scale-110 active:scale-90 border-2 shadow-2xl overflow-hidden
    ${theme === 'fantasy'
      ? 'bg-gradient-to-br from-stone-800 to-stone-950 border-fantasy-gold/30 hover:border-fantasy-gold text-fantasy-gold'
      : 'bg-gradient-to-br from-slate-800 to-slate-950 border-scifi-accent/30 hover:border-scifi-accent text-scifi-accent'
    }
  `;

  return (
    <div className={`flex gap-4 p-5 rounded-3xl border shadow-2xl relative overflow-hidden ${
      theme === 'fantasy'
        ? 'bg-stone-900/90 border-stone-800'
        : 'bg-slate-900/90 border-slate-800 backdrop-blur-2xl'
    }`}>
      {/* Glow effect background */}
      <div className={`absolute inset-0 opacity-5 blur-3xl pointer-events-none ${theme === 'fantasy' ? 'bg-fantasy-gold' : 'bg-scifi-accent'}`} />

      <button onClick={() => handleRoll(20)} className={`${btnClass} w-16 h-16 z-10`} title="Roll d20">
        <Icons.Dices className={`w-9 h-9 transition-transform duration-700 ${isRolling ? 'animate-spin' : 'group-hover:rotate-12'}`} />
        <span className="text-[10px] font-black uppercase mt-1 opacity-60">D20</span>
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none ${theme === 'fantasy' ? 'bg-fantasy-gold' : 'bg-scifi-accent'}`} />
      </button>

      {[12, 10, 8, 6, 4].map(d => (
        <button key={d} onClick={() => handleRoll(d)} className={`${btnClass} hidden md:flex z-10`} title={`Roll d${d}`}>
          <span className={`font-black text-xl ${theme === 'fantasy' ? 'font-fantasyHeader' : 'font-scifiHeader'}`}>{d}</span>
          <span className="text-[9px] font-bold opacity-50">D{d}</span>
          <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none ${theme === 'fantasy' ? 'bg-fantasy-gold' : 'bg-scifi-accent'}`} />
        </button>
      ))}

      {/* Custom Dice Button */}
      <button onClick={() => setShowCustomModal(true)} className={`${btnClass} z-10`} title="Custom Roll">
        <Icons.Dices className="w-6 h-6" />
        <span className="text-[8px] font-black uppercase mt-1 opacity-60">Custom</span>
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none ${theme === 'fantasy' ? 'bg-fantasy-gold' : 'bg-scifi-accent'}`} />
      </button>

      {/* Custom Dice Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowCustomModal(false)}>
          <div className={`w-full max-w-md p-6 rounded-3xl border-2 shadow-2xl ${theme === 'fantasy' ? 'bg-stone-900 border-fantasy-gold/30' : 'bg-slate-900 border-scifi-accent/30'}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-black uppercase tracking-widest ${theme === 'fantasy' ? 'text-fantasy-gold' : 'text-scifi-accent'}`}>Custom Roll</h3>
              <button onClick={() => setShowCustomModal(false)} className="text-white/40 hover:text-white transition-colors">✕</button>
            </div>

            <div className="space-y-3 mb-6">
              {customDice.map((dice, i) => (
                <div key={i} className="flex items-center gap-3">
                  <select
                    value={dice.qty}
                    onChange={(e) => updateDiceRow(i, 'qty', parseInt(e.target.value))}
                    className={`w-20 px-3 py-2 rounded-lg border font-bold ${theme === 'fantasy' ? 'bg-stone-800 border-stone-700 text-fantasy-gold' : 'bg-slate-800 border-slate-700 text-scifi-accent'}`}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <span className="text-xl font-black opacity-60">×</span>
                  <select
                    value={dice.faces}
                    onChange={(e) => updateDiceRow(i, 'faces', parseInt(e.target.value))}
                    className={`flex-1 px-3 py-2 rounded-lg border font-bold ${theme === 'fantasy' ? 'bg-stone-800 border-stone-700 text-fantasy-gold' : 'bg-slate-800 border-slate-700 text-scifi-accent'}`}
                  >
                    <option value={4}>d4</option>
                    <option value={6}>d6</option>
                    <option value={8}>d8</option>
                    <option value={10}>d10</option>
                    <option value={12}>d12</option>
                    <option value={20}>d20</option>
                    <option value={100}>d100</option>
                  </select>
                  {customDice.length > 1 && (
                    <button
                      onClick={() => removeDiceRow(i)}
                      className="px-3 py-2 rounded-lg border border-red-500/30 bg-red-950/20 text-red-400 hover:bg-red-950/40 transition-colors font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {customDice.length < 5 && (
              <button
                onClick={addDiceRow}
                className={`w-full mb-4 py-2 rounded-lg border-2 border-dashed font-bold uppercase text-xs tracking-widest transition-colors ${theme === 'fantasy' ? 'border-fantasy-gold/30 text-fantasy-gold/60 hover:bg-fantasy-gold/10' : 'border-scifi-accent/30 text-scifi-accent/60 hover:bg-scifi-accent/10'}`}
              >
                + Add Dice
              </button>
            )}

            <button
              onClick={handleCustomRoll}
              className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all hover:scale-105 active:scale-95 ${theme === 'fantasy' ? 'bg-fantasy-gold text-black hover:bg-fantasy-gold/90' : 'bg-scifi-accent text-black hover:bg-scifi-accent/90'}`}
            >
              🎲 Roll Dice
            </button>
          </div>
        </div>
      )}
    </div>
  );
};