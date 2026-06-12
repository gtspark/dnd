import React from 'react';
import { Icons } from './Icons';
import { ThemeMode, MutationRecord } from '../types';

interface MutationCardProps {
  mutations: MutationRecord[];
  theme: ThemeMode;
  undoneIds: Set<string>;
  undoingId: string | null;
  onUndo: (mutationId: string) => void;
}

const describeMutation = (m: MutationRecord): { icon: keyof typeof Icons; text: string; tone: 'damage' | 'heal' | 'gold' | 'item' | 'condition' | 'neutral' } => {
  const name = m.target?.name || 'Unknown';
  switch (m.type) {
    case 'hp_change': {
      const dmg = (m.delta ?? 0) < 0;
      return {
        icon: 'Heart',
        text: `${name} ${dmg ? '−' : '+'}${Math.abs(m.delta ?? 0)} HP (${m.before} → ${m.after})${m.reason ? ` — ${m.reason}` : ''}`,
        tone: dmg ? 'damage' : 'heal'
      };
    }
    case 'gold_change':
    case 'transaction': {
      const spent = (m.delta ?? 0) < 0;
      return {
        icon: 'Coins',
        text: `${name} ${spent ? '−' : '+'}${Math.abs(m.delta ?? 0)} ${m.refs?.resourceKey || 'gold'}${m.reason ? ` — ${m.reason}` : ''}`,
        tone: 'gold'
      };
    }
    case 'item_add':
      return { icon: 'Package', text: `${name} gained ${m.after}${m.reason ? ` — ${m.reason}` : ''}`, tone: 'item' };
    case 'item_remove':
      return { icon: 'Package', text: `${name} lost ${m.before}${m.reason ? ` — ${m.reason}` : ''}`, tone: 'item' };
    case 'condition_add':
      return { icon: 'AlertTriangle', text: `${name} is now ${m.after}${m.reason ? ` — ${m.reason}` : ''}`, tone: 'condition' };
    case 'condition_remove':
    case 'condition_expired':
      return { icon: 'Sparkles', text: `${name} no longer ${m.before}${m.type === 'condition_expired' ? ' (expired)' : ''}`, tone: 'condition' };
    case 'xp':
      return { icon: 'Sparkles', text: `${name} +${m.delta} XP${m.reason ? ` — ${m.reason}` : ''}`, tone: 'neutral' };
    default:
      return { icon: 'Sparkles', text: `${name}: ${m.type}${m.reason ? ` — ${m.reason}` : ''}`, tone: 'neutral' };
  }
};

const TONE_COLORS: Record<string, string> = {
  damage: 'text-red-400 border-red-900/40',
  heal: 'text-green-400 border-green-900/40',
  gold: 'text-yellow-400 border-yellow-900/40',
  item: 'text-blue-300 border-blue-900/40',
  condition: 'text-purple-300 border-purple-900/40',
  neutral: 'text-stone-300 border-white/10'
};

export const MutationCard: React.FC<MutationCardProps> = ({ mutations, theme, undoneIds, undoingId, onUndo }) => {
  const isFantasy = theme === 'fantasy';
  const visible = mutations.filter(m => m.status !== 'rejected' || m.actor === 'dm');

  if (visible.length === 0) return null;

  return (
    <div className={`rounded-xl border ${isFantasy ? 'bg-stone-900/60 border-stone-700/50' : 'bg-slate-900/60 border-slate-700/50'} px-4 py-2 space-y-1`}>
      {visible.map(m => {
        const { icon, text, tone } = describeMutation(m);
        const IconComp = Icons[icon];
        const isUndone = undoneIds.has(m.id) || m.status === 'undone';
        const isRejected = m.status === 'rejected';
        const canUndo = !isUndone && !isRejected && m.actor === 'dm' &&
          ['hp_change', 'gold_change', 'transaction', 'item_add', 'item_remove', 'condition_add', 'condition_remove'].includes(m.type);

        return (
          <div key={m.id} className={`flex items-center gap-2 py-1 text-xs font-mono ${isUndone ? 'opacity-40' : ''}`}>
            <IconComp className={`w-3.5 h-3.5 shrink-0 ${TONE_COLORS[tone].split(' ')[0]}`} />
            <span className={`flex-1 ${isUndone ? 'line-through' : ''} ${isRejected ? 'opacity-50 italic' : ''}`}>
              {text}
              {isRejected && ' [rejected by server]'}
              {m.refs?.validated && <span className="ml-1 opacity-50" title="Validated against rolled result">✓roll</span>}
            </span>
            {canUndo && (
              <button
                onClick={() => onUndo(m.id)}
                disabled={undoingId === m.id}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] uppercase font-black tracking-wider transition-colors ${isFantasy ? 'border-stone-600 hover:bg-stone-700/50 text-stone-400' : 'border-slate-600 hover:bg-slate-700/50 text-slate-400'} disabled:opacity-30`}
                title="Undo this change"
              >
                {undoingId === m.id ? <Icons.Loader2 className="w-3 h-3 animate-spin" /> : <Icons.RotateCcw className="w-3 h-3" />}
                Undo
              </button>
            )}
            {isUndone && <span className="text-[10px] uppercase font-black tracking-wider opacity-50">Undone</span>}
          </div>
        );
      })}
    </div>
  );
};
