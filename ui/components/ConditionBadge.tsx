import React from 'react';
import { ThemeMode, ConditionDetail } from '../types';

interface ConditionBadgeProps {
  name: string;
  detail?: ConditionDetail;
  theme: ThemeMode;
}

/**
 * Pill badge for an active condition, showing remaining rounds + source when known.
 * Server-enforced conditions auto-expire; duration-less ones persist until removed.
 */
export const ConditionBadge: React.FC<ConditionBadgeProps> = ({ name, detail, theme }) => {
  const isFantasy = theme === 'fantasy';
  const hasDuration = detail?.remainingRounds !== undefined && detail.remainingRounds !== null;
  const title = [
    detail?.source ? `Source: ${detail.source}` : null,
    hasDuration ? `Expires in ${detail!.remainingRounds} round${detail!.remainingRounds === 1 ? '' : 's'}` : 'Until removed'
  ].filter(Boolean).join(' · ');

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-[0.15em] ${
        isFantasy
          ? 'border-fantasy-gold/30 text-fantasy-gold bg-fantasy-gold/10'
          : 'border-scifi-accent/30 text-scifi-accent bg-scifi-accent/10'
      }`}
    >
      {name}
      {hasDuration && (
        <span className={`px-1.5 rounded-full text-[9px] ${isFantasy ? 'bg-fantasy-gold/20' : 'bg-scifi-accent/20'}`}>
          {detail!.remainingRounds}r
        </span>
      )}
    </span>
  );
};
