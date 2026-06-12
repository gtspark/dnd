import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Character, ThemeMode, Message } from '../types';
import { sendSideChatMessage } from '../services/apiService';
import { DiceRoller } from './DiceRoller';

interface SideChatProps {
  theme: ThemeMode;
  activeChar: Character;
  allCharacters: Character[];
  isOpen: boolean;
  onToggle: () => void;
  reserveRightPanel?: boolean;
}

export function SideChat({ theme, activeChar, allCharacters, isOpen, onToggle, reserveRightPanel = true }: SideChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isFantasy = theme === 'fantasy';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const addMessage = (msg: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, {
      ...msg,
      id: `side-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date()
    }]);
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isThinking) return;

    addMessage({ type: 'user', sender: activeChar.name, text });
    setInputValue('');
    setIsThinking(true);

    try {
      const result = await sendSideChatMessage(
        `${activeChar.name}: ${text}`,
        activeChar.name
      );

      addMessage({ type: 'ai', sender: 'DM', text: result.narrative });

      if (result.rollRequest) {
        addMessage({
          type: 'system',
          sender: 'System',
          text: `🎲 ${result.rollRequest}`
        });
      }
    } catch (err) {
      addMessage({
        type: 'system',
        sender: 'System',
        text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      });
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getModifier = (): number => {
    const abilityMap: Record<string, string> = {
      strength: 'str', str: 'str',
      dexterity: 'dex', dex: 'dex',
      constitution: 'con', con: 'con',
      intelligence: 'int', int: 'int',
      wisdom: 'wis', wis: 'wis',
      charisma: 'cha', cha: 'cha'
    };

    // All 18 D&D skills mapped to their governing ability
    const skillAbilityMap: Record<string, string> = {
      acrobatics: 'dex', 'animal handling': 'wis', arcana: 'int',
      athletics: 'str', deception: 'cha', engineering: 'int',
      history: 'int', insight: 'wis', intimidation: 'cha',
      investigation: 'int', medicine: 'wis', nature: 'int',
      perception: 'wis', performance: 'cha', persuasion: 'cha',
      religion: 'int', 'sleight of hand': 'dex', stealth: 'dex',
      survival: 'wis', technology: 'int', xenobiology: 'int'
    };

    // Scan backwards through side chat for DM mentioning a check
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type !== 'ai' && msg.type !== 'system') continue;
      const text = msg.text.toLowerCase();

      // Try to find which character the roll is for
      let char = activeChar;
      for (const c of allCharacters) {
        if (text.includes(c.name.toLowerCase())) {
          char = c;
          break;
        }
      }
      if (!char.stats) continue;

      // Try to match a skill name first (e.g. "Tech check", "Medicine check", "Technology")
      let skillKey: string | null = null;
      for (const [skill] of Object.entries(skillAbilityMap)) {
        // Match skill name or common abbreviation
        if (text.includes(skill) || (skill === 'technology' && text.includes('tech'))) {
          skillKey = skill;
          break;
        }
      }

      if (skillKey) {
        const govAbility = skillAbilityMap[skillKey];
        const score = char.stats[govAbility as keyof typeof char.stats] || 10;
        const mod = Math.floor((score - 10) / 2);
        // Check proficiency - normalize skill key for lookup
        const lookupKey = skillKey.replace(/ /g, '_');
        const skill = char.skills?.[skillKey] || char.skills?.[lookupKey];
        const profBonus = skill?.proficient ? (char.proficiencyBonus || 2) : 0;
        return mod + profBonus;
      }

      // Fallback: try to match a raw ability name
      const abilityMatch = text.match(/\b(strength|dexterity|constitution|intelligence|wisdom|charisma|str|dex|con|int|wis|cha)\b/);
      if (abilityMatch) {
        const key = abilityMap[abilityMatch[1]];
        if (key) {
          const score = char.stats[key as keyof typeof char.stats] || 10;
          return Math.floor((score - 10) / 2);
        }
      }
    }
    return 0;
  };

  const handleDiceRoll = (faces: number) => {
    const roll = Math.floor(Math.random() * faces) + 1;
    const modifier = faces === 20 ? getModifier() : 0;
    const total = roll + modifier;
    const modStr = modifier !== 0 ? `, modifier ${modifier >= 0 ? '+' : ''}${modifier}, for a total of ${total}` : '';

    const rollText = `rolled D${faces} with a natural ${roll}${modStr}`;

    addMessage({
      type: 'roll',
      sender: activeChar.name,
      text: `🎲 ${rollText}`,
      diceResult: { faces, rolls: [roll], modifier, total }
    });

    // Send to DM for interpretation
    setIsThinking(true);
    sendSideChatMessage(
      `${activeChar.name}: ${rollText}. [This is an above-table knowledge/clarification roll, not an in-story action]`,
      activeChar.name
    ).then(result => {
      addMessage({ type: 'ai', sender: 'DM', text: result.narrative });
    }).catch(err => {
      addMessage({ type: 'system', sender: 'System', text: `Error: ${err instanceof Error ? err.message : 'Unknown'}` });
    }).finally(() => {
      setIsThinking(false);
    });
  };

  const handleCustomRoll = (dice: { qty: number; faces: number; rolls?: number[]; chosen?: number; mode?: 'advantage' | 'disadvantage' }[]) => {
    const advDisDice = dice[0] as any;

    // Advantage/disadvantage roll
    if (advDisDice?.mode && advDisDice?.rolls && advDisDice?.chosen !== undefined) {
      const { rolls, chosen, mode } = advDisDice;
      const modifier = getModifier();
      const total = chosen + modifier;
      const discarded = rolls.find((r: number) => r !== chosen) ?? rolls[0];

      const rollText = `rolled D20 with ${mode} - rolled ${rolls[0]} and ${rolls[1]}, ${mode === 'advantage' ? 'taking the higher' : 'taking the lower'} (${chosen}), modifier ${modifier >= 0 ? '+' : ''}${modifier}, for a total of ${total}`;

      addMessage({
        type: 'roll',
        sender: activeChar.name,
        text: `🎲 ${rollText}`,
        diceResult: { faces: 20, rolls, total, modifier, advantageMode: mode, chosenRoll: chosen, discardedRoll: discarded }
      });

      setIsThinking(true);
      sendSideChatMessage(
        `${activeChar.name}: ${rollText}. [This is an above-table roll, not an in-story action]`,
        activeChar.name
      ).then(result => {
        addMessage({ type: 'ai', sender: 'DM', text: result.narrative });
      }).catch(err => {
        addMessage({ type: 'system', sender: 'System', text: `Error: ${err instanceof Error ? err.message : 'Unknown'}` });
      }).finally(() => setIsThinking(false));
      return;
    }

    // Standard custom dice roll
    const allRolls: number[] = [];
    const diceBreakdown: string[] = [];
    dice.forEach(({ qty, faces }) => {
      const rolls: number[] = [];
      for (let i = 0; i < qty; i++) {
        rolls.push(Math.floor(Math.random() * faces) + 1);
      }
      allRolls.push(...rolls);
      diceBreakdown.push(`${qty}d${faces}: ${rolls.join('+')}`);
    });

    const total = allRolls.reduce((sum, r) => sum + r, 0);
    const diceNotation = dice.map(d => `${d.qty}d${d.faces}`).join('+');
    const breakdown = diceBreakdown.join(', ');
    const rollText = `rolled ${diceNotation} with natural results: ${breakdown} = ${total} total`;

    addMessage({
      type: 'roll',
      sender: activeChar.name,
      text: `🎲 ${rollText}`,
      diceResult: { faces: 0, rolls: allRolls, total, modifier: 0, customNotation: diceNotation }
    });

    setIsThinking(true);
    sendSideChatMessage(
      `${activeChar.name}: ${rollText}. [This is an above-table roll, not an in-story action]`,
      activeChar.name
    ).then(result => {
      addMessage({ type: 'ai', sender: 'DM', text: result.narrative });
    }).catch(err => {
      addMessage({ type: 'system', sender: 'System', text: `Error: ${err instanceof Error ? err.message : 'Unknown'}` });
    }).finally(() => setIsThinking(false));
  };

  const renderText = (text: string) => {
    return text.split(/(\*\*.*?\*\*|\*(?!\*).*?\*(?!\*))/g).map((part, i) =>
      part.startsWith('**') ? <strong key={i} className={isFantasy ? 'text-amber-500' : 'text-cyan-500'}>{part.slice(2, -2)}</strong>
      : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <em key={i} className={isFantasy ? 'text-amber-600' : 'text-cyan-600'}>{part.slice(1, -1)}</em>
      : part
    );
  };

  return (
    <>
      {/* Toggle button — always visible — portaled to body to avoid Firefox flex issues */}
      {!isOpen && createPortal(
        <button
          onClick={onToggle}
          style={{ position: 'fixed', bottom: '7rem', right: '1.5rem', zIndex: 50 }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg border transition-all hover:scale-105
            ${isFantasy
              ? 'bg-stone-800 border-amber-700/50 text-amber-400 hover:bg-stone-700'
              : 'bg-slate-800 border-cyan-700/50 text-cyan-400 hover:bg-slate-700'
            }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">Ask DM</span>
          {messages.length > 0 && (
            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${isFantasy ? 'bg-amber-500/20' : 'bg-cyan-500/20'}`}>
              {messages.length}
            </span>
          )}
        </button>,
        document.body
      )}

      {/* Panel — portaled to body to avoid Firefox flex issues */}
      {createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: 384,
            height: '100vh',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 300ms ease-in-out',
            background: isFantasy ? '#0c0a09' : '#020617',
            borderLeft: `2px solid ${isFantasy ? '#78350f40' : '#164e6340'}`
          }}
        >
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isFantasy ? 'border-stone-800' : 'border-slate-800'}`}>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`text-sm font-bold ${isFantasy ? 'text-amber-500' : 'text-cyan-500'}`}>
                Above Table
              </h3>
              <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded ${isFantasy ? 'bg-amber-500/10 text-amber-600' : 'bg-cyan-500/10 text-cyan-600'}`}>
                metagame
              </span>
            </div>
            <p className={`text-[11px] mt-0.5 ${isFantasy ? 'text-stone-500' : 'text-slate-500'}`}>
              Not saved to story
            </p>
          </div>
          <button
            onClick={onToggle}
            className={`p-1.5 rounded transition-colors ${isFantasy ? 'hover:bg-stone-800 text-stone-400' : 'hover:bg-slate-800 text-slate-400'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${isFantasy ? 'bg-stone-950/80' : 'bg-slate-950/80'}`}>
          {messages.length === 0 && (
            <div className={`text-center py-8 ${isFantasy ? 'text-stone-600' : 'text-slate-600'}`}>
              <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs">Ask the DM anything without affecting the story.</p>
              <p className="text-xs mt-1 opacity-60">Knowledge checks, rules questions, tactical advice...</p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`${msg.type === 'user' ? 'ml-8' : msg.type === 'roll' ? 'mx-4' : 'mr-8'}`}>
              {msg.type === 'roll' ? (
                <div className={`text-center text-xs py-1.5 px-3 rounded-lg ${isFantasy ? 'bg-amber-500/10 text-amber-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                  {msg.text}
                </div>
              ) : (
                <div className={`rounded-lg px-3 py-2 text-sm ${
                  msg.type === 'user'
                    ? `${isFantasy ? 'bg-stone-800 text-stone-200' : 'bg-slate-800 text-slate-200'}`
                    : msg.type === 'system'
                    ? `${isFantasy ? 'bg-amber-900/20 text-amber-400' : 'bg-cyan-900/20 text-cyan-400'} text-xs`
                    : `${isFantasy ? 'bg-stone-900 border-l-2 border-amber-800/40 text-stone-300' : 'bg-slate-900 border-l-2 border-cyan-800/40 text-slate-300'}`
                }`}>
                  {msg.type === 'ai' && (
                    <div className={`text-[10px] uppercase tracking-wider mb-1 ${isFantasy ? 'text-amber-700' : 'text-cyan-700'}`}>
                      DM (above table)
                    </div>
                  )}
                  <div className={`whitespace-pre-line leading-relaxed ${msg.type === 'ai' ? (isFantasy ? '' : 'font-mono text-xs') : ''}`}>
                    {renderText(msg.text)}
                  </div>
                </div>
              )}
            </div>
          ))}

          {isThinking && (
            <div className="mr-8">
              <div className={`rounded-lg px-3 py-2 ${isFantasy ? 'bg-stone-900 border-l-2 border-amber-800/40' : 'bg-slate-900 border-l-2 border-cyan-800/40'}`}>
                <div className={`text-[10px] uppercase tracking-wider mb-1 ${isFantasy ? 'text-amber-700' : 'text-cyan-700'}`}>
                  DM (above table)
                </div>
                <div className="flex gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isFantasy ? 'bg-amber-600' : 'bg-cyan-600'}`} style={{ animationDelay: '0ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isFantasy ? 'bg-amber-600' : 'bg-cyan-600'}`} style={{ animationDelay: '150ms' }} />
                  <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isFantasy ? 'bg-amber-600' : 'bg-cyan-600'}`} style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-2" />
        </div>

        {/* Dice + Input */}
        <div className={`border-t px-4 py-3 space-y-2 ${isFantasy ? 'border-stone-800 bg-stone-950' : 'border-slate-800 bg-slate-950'}`}>
          <DiceRoller
            theme={theme}
            onRoll={handleDiceRoll}
            onCustomRoll={handleCustomRoll}
            compact
          />
          <div className="relative">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the DM anything... (won't affect the story)"
              disabled={isThinking}
              className={`w-full p-3 pr-12 rounded-lg resize-none text-sm h-16 focus:outline-none focus:ring-1 transition-colors
                ${isFantasy
                  ? `bg-stone-900 text-stone-200 placeholder-stone-600 focus:ring-amber-700/50 border border-stone-700`
                  : `bg-slate-900 text-slate-200 placeholder-slate-600 focus:ring-cyan-700/50 border border-slate-700 font-mono`
                }
                ${isThinking ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isThinking}
              className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all
                ${inputValue.trim() && !isThinking
                  ? `${isFantasy ? 'text-amber-400 hover:bg-amber-500/20' : 'text-cyan-400 hover:bg-cyan-500/20'}`
                  : `${isFantasy ? 'text-stone-600' : 'text-slate-600'} cursor-not-allowed`
                }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

      {/* Backdrop on mobile — also portaled */}
      {isOpen && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 30 }}
          className="bg-black/50 sm:hidden"
          onClick={onToggle}
        />,
        document.body
      )}
    </>
  );
}
