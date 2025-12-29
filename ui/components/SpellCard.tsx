import React, { useState, useEffect } from 'react';
import type { ThemeMode, SpellDetails } from '../types';
import { getSpellDetails } from '../services/apiService';
import { Tooltip, SpellTooltipContent } from './Tooltip';
import { Icons } from './Icons';

interface SpellCardProps {
  spellName: string;
  theme: ThemeMode;
}

export function SpellCard({ spellName, theme }: SpellCardProps) {
  const [spellData, setSpellData] = useState<SpellDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    getSpellDetails(spellName)
      .then(setSpellData)
      .finally(() => setIsLoading(false));
  }, [spellName]);

  const isFantasy = theme === 'fantasy';

  // School color mapping
  const schoolColors: Record<string, string> = {
    'Evocation': 'border-red-500/30 bg-red-950/10',
    'Abjuration': 'border-blue-500/30 bg-blue-950/10',
    'Conjuration': 'border-yellow-500/30 bg-yellow-950/10',
    'Divination': 'border-cyan-500/30 bg-cyan-950/10',
    'Enchantment': 'border-pink-500/30 bg-pink-950/10',
    'Illusion': 'border-purple-500/30 bg-purple-950/10',
    'Necromancy': 'border-gray-500/30 bg-gray-950/10',
    'Transmutation': 'border-green-500/30 bg-green-950/10',
  };

  const schoolColor = spellData?.school 
    ? schoolColors[spellData.school] || 'border-purple-500/30 bg-purple-950/10'
    : 'border-purple-500/30 bg-purple-950/10';

  const levelText = spellData 
    ? (spellData.level === 0 ? 'C' : spellData.level.toString())
    : '?';

  const cardContent = (
    <div 
      className={`p-3 rounded-xl border-2 ${schoolColor} font-black uppercase text-[10px] tracking-[0.15em] text-purple-300 flex items-center gap-3 transition-all hover:scale-[1.02] hover:shadow-lg ${
        isLoading ? 'opacity-50' : ''
      }`}
    >
      <Icons.Zap className="w-4 h-4 animate-pulse flex-shrink-0" />
      <span className="flex-1 truncate">{spellName}</span>
      <span className={`w-5 h-5 flex items-center justify-center rounded text-[9px] font-mono ${
        isFantasy ? 'bg-amber-900/50 text-amber-300' : 'bg-cyan-900/50 text-cyan-300'
      }`}>
        {levelText}
      </span>
    </div>
  );

  if (!spellData) {
    return cardContent;
  }

  return (
    <Tooltip 
      content={<SpellTooltipContent spell={spellData} theme={theme} />}
      theme={theme}
    >
      {cardContent}
    </Tooltip>
  );
}
