import React, { useState } from 'react';
import { Character, ThemeMode, CharacterSkill } from '../types';
import { ItemCard } from './ItemCard';

interface Props {
  character: Character;
  theme: ThemeMode;
  onClose: () => void;
  onUpdateHp: (hp: number) => void;
  onUpdateCredits: (credits: number) => void;
  readOnly?: boolean;
}

const STAT_ORDER: Array<keyof typeof STAT_LABELS> = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const STAT_LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const STAT_FULL: Record<string, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

// Group skills by governing ability for visual grouping
const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export default function CharacterSheetModal({ character, theme, onClose, onUpdateHp, onUpdateCredits, readOnly = false }: Props) {
  const [editingHp, setEditingHp] = useState(false);
  const [editingCredits, setEditingCredits] = useState(false);
  const [hpValue, setHpValue] = useState(character.hp);
  const [creditsValue, setCreditsValue] = useState(character.resource);

  const isScifi = theme === 'scifi';
  const accent = isScifi ? 'cyan' : 'amber';
  const bg = isScifi ? 'slate' : 'stone';
  const profBonus = character.proficiencyBonus ?? 2;

  const mod = (score: number) => Math.floor((score - 10) / 2);
  const fmtMod = (m: number) => (m >= 0 ? `+${m}` : `${m}`);

  const hpPercent = character.maxHp > 0 ? Math.min(100, (character.hp / character.maxHp) * 100) : 0;
  const hpColor = hpPercent > 50
    ? (isScifi ? 'bg-cyan-500' : 'bg-green-500')
    : hpPercent > 25 ? 'bg-yellow-500' : 'bg-red-500';

  const savingThrows = (character as any).savingThrows as Record<string, { proficient: boolean }> | undefined;
  const ac = (character as any).ac ?? (10 + mod(character.stats.dex));
  const speed = (character as any).speed ?? 30;
  const speedLabel = isScifi ? 'm' : 'ft';
  const level = character.level ?? 1;
  const currentXP = character.experience?.current ?? 0;
  const levelStartXP = character.experience?.levelStart ?? currentXP;
  const nextLevelXP = character.experience?.nextLevel ?? null;
  const toNextLevel = character.experience?.toNextLevel ?? null;
  const xpProgress = nextLevelXP
    ? Math.max(0, Math.min(100, character.experience?.progressPct ?? Math.round(((currentXP - levelStartXP) / (nextLevelXP - levelStartXP)) * 100)))
    : 100;

  const dexMod = mod(character.stats.dex);
  const initiative = dexMod;

  const handleHpSave = () => {
    const clamped = Math.max(0, Math.min(character.maxHp, hpValue));
    onUpdateHp(clamped);
    setEditingHp(false);
  };

  const handleCreditsSave = () => {
    const clamped = Math.max(0, creditsValue);
    onUpdateCredits(clamped);
    setEditingCredits(false);
  };

  // Sort skills by governing ability for grouped display
  const skillsByAbility: Record<string, Array<[string, CharacterSkill]>> = {};
  if (character.skills) {
    for (const [name, skill] of Object.entries(character.skills)) {
      if (!skillsByAbility[skill.ability]) skillsByAbility[skill.ability] = [];
      skillsByAbility[skill.ability].push([name, skill]);
    }
  }

  const accentText = isScifi ? 'text-cyan-400' : 'text-amber-400';
  const accentBorder = isScifi ? 'border-cyan-500/30' : 'border-amber-500/30';
  const accentBg = isScifi ? 'bg-cyan-500/10' : 'bg-amber-500/10';
  const accentBgStrong = isScifi ? 'bg-cyan-500/20' : 'bg-amber-500/20';
  const headerFont = isScifi ? 'font-scifiHeader' : 'font-fantasyHeader';
  const dividerColor = isScifi ? 'border-cyan-500/10' : 'border-amber-500/10';

  // Skills with notes => features section
  const skillFeatures = character.skills
    ? Object.entries(character.skills).filter(([, s]) => s.notes)
    : [];

  // Racial trait text from race field
  const racialTrait = character.race
    ? getRacialTrait(character.race)
    : null;

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-${bg}-900 border border-${accent}-500/20 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-pop-in`}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1">
          <div className="flex min-h-full">

            {/* ══════════════════════════════════
                LEFT COLUMN — Ability Scores + Skills + Saves
            ══════════════════════════════════ */}
            <div className={`w-[280px] flex-shrink-0 border-r ${dividerColor} flex flex-col`}>

              {/* Section header */}
              <div className={`px-4 pt-5 pb-2 border-b ${dividerColor}`}>
                <div className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60`}>
                  Ability Scores
                </div>
              </div>

              {/* Ability Score Blocks */}
              <div className="px-3 py-3 space-y-1.5">
                {STAT_ORDER.map(stat => {
                  const val = character.stats[stat];
                  const m = mod(val);
                  const isProfSave = savingThrows?.[stat]?.proficient ?? false;
                  const saveTotal = m + (isProfSave ? profBonus : 0);
                  return (
                    <div
                      key={stat}
                      className={`flex items-center gap-2 rounded-lg border ${accentBorder} bg-black/20 px-3 py-2`}
                    >
                      {/* Stat block */}
                      <div className="text-center w-14 flex-shrink-0">
                        <div className={`text-[9px] font-bold uppercase tracking-widest opacity-40`}>
                          {STAT_LABELS[stat]}
                        </div>
                        <div className="text-2xl font-black leading-tight">{val}</div>
                        <div className={`text-xs font-mono font-bold ${m > 0 ? 'text-emerald-400' : m < 0 ? 'text-red-400' : 'opacity-40'}`}>
                          {fmtMod(m)}
                        </div>
                      </div>

                      {/* Vertical separator */}
                      <div className={`w-px self-stretch ${isScifi ? 'bg-cyan-500/10' : 'bg-amber-500/10'}`} />

                      {/* Saving throw */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] uppercase tracking-widest opacity-30 mb-1">Save</div>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 border ${isProfSave ? `${isScifi ? 'bg-cyan-400 border-cyan-400' : 'bg-amber-400 border-amber-400'}` : 'bg-transparent border-white/20'}`} />
                          <span className={`text-sm font-mono font-bold ${saveTotal > 0 ? 'text-emerald-400' : saveTotal < 0 ? 'text-red-400' : 'opacity-40'}`}>
                            {fmtMod(saveTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Proficiency bonus chip */}
              <div className="px-3 pb-4">
                <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${accentBg} border ${accentBorder}`}>
                  <span className="text-[10px] uppercase tracking-widest opacity-50">Prof. Bonus</span>
                  <span className={`text-sm font-mono font-black ${accentText}`}>+{profBonus}</span>
                </div>
              </div>

              {/* ── Divider ── */}
              <div className={`mx-3 border-t ${dividerColor}`} />

              {/* Skills header */}
              <div className={`px-4 pt-4 pb-2`}>
                <div className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60`}>
                  Skills
                </div>
              </div>

              {/* Skills grouped by ability */}
              <div className="px-3 pb-4 space-y-3 flex-1">
                {character.skills && Object.keys(character.skills).length > 0 ? (
                  ABILITY_ORDER.map(ability => {
                    const group = skillsByAbility[ability];
                    if (!group || group.length === 0) return null;
                    return (
                      <div key={ability}>
                        {/* Ability group label */}
                        <div className={`text-[8px] uppercase tracking-[0.15em] opacity-30 mb-1 px-1`}>
                          {STAT_FULL[ability]}
                        </div>
                        <div className="space-y-0.5">
                          {group.map(([name, skill]) => {
                            const score = character.stats[skill.ability as keyof typeof character.stats] || 10;
                            const total = mod(score) + (skill.proficient ? profBonus : 0);
                            return (
                              <div
                                key={name}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                                  skill.proficient ? accentBg : 'hover:bg-white/3'
                                }`}
                              >
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 border ${
                                  skill.proficient
                                    ? `${isScifi ? 'bg-cyan-400 border-cyan-400' : 'bg-amber-400 border-amber-400'}`
                                    : 'bg-transparent border-white/20'
                                }`} />
                                <span className={`flex-1 text-xs capitalize ${skill.proficient ? 'font-semibold opacity-90' : 'opacity-60'}`}>
                                  {name}
                                </span>
                                <span className={`text-xs font-mono font-bold min-w-[2rem] text-right ${
                                  total > 0 ? accentText : total < 0 ? 'text-red-400' : 'opacity-40'
                                }`}>
                                  {fmtMod(total)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 opacity-20 text-[10px] uppercase tracking-widest">No skills defined</div>
                )}
              </div>
            </div>

            {/* ══════════════════════════════════
                RIGHT COLUMN — Everything else
            ══════════════════════════════════ */}
            <div className="flex-1 min-w-0 flex flex-col">

              {/* ── Header: portrait + name + close ── */}
              <div className={`px-6 py-5 border-b ${dividerColor} flex items-center gap-5`}>
                <div className={`w-20 h-20 rounded-2xl border-2 ${accentBorder} overflow-hidden flex-shrink-0 shadow-lg`}>
                  <img src={character.avatar} className="w-full h-full object-cover" alt={character.name} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className={`text-2xl font-black uppercase tracking-tight ${headerFont} ${isScifi ? 'text-white' : 'text-amber-100'}`}>
                    {character.name}
                  </h2>
                  <div className={`text-xs font-bold uppercase tracking-widest mt-1 ${accentText} opacity-80 flex items-center gap-2`}>
                    Level {level} · {character.race && `${character.race} · `}{character.class}
                    {readOnly && <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[9px] tracking-wider">DM Controlled</span>}
                  </div>
                  {character.heldSpells && character.heldSpells.length > 0 && (
                    <div className="text-[10px] opacity-40 mt-1 truncate">
                      Spells: {character.heldSpells.join(', ')}
                    </div>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center text-lg transition-all flex-shrink-0"
                >
                  ×
                </button>
              </div>

              {/* ── Combat Stats Row ── */}
              <div className={`px-6 py-4 border-b ${dividerColor} bg-black/20`}>
                <div className="flex gap-3">

                  {/* AC */}
                  <div className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl border-2 ${accentBorder} ${accentBg} relative`}>
                    <div className="text-[8px] uppercase tracking-[0.2em] opacity-40 mb-1">Armor Class</div>
                    <div className={`text-3xl font-black font-mono ${accentText}`}>{ac}</div>
                    <div className="text-[9px] opacity-30 mt-0.5 uppercase tracking-wider">AC</div>
                  </div>

                  {/* Initiative */}
                  <div className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl border-2 ${accentBorder} ${accentBg} relative`}>
                    <div className="text-[8px] uppercase tracking-[0.2em] opacity-40 mb-1">Initiative</div>
                    <div className={`text-3xl font-black font-mono ${initiative >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtMod(initiative)}
                    </div>
                    <div className="text-[9px] opacity-30 mt-0.5 uppercase tracking-wider">DEX</div>
                  </div>

                  {/* Speed */}
                  <div className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl border-2 ${accentBorder} ${accentBg} relative`}>
                    <div className="text-[8px] uppercase tracking-[0.2em] opacity-40 mb-1">Speed</div>
                    <div className={`text-3xl font-black font-mono ${accentText}`}>{speed}</div>
                    <div className="text-[9px] opacity-30 mt-0.5 uppercase tracking-wider">{speedLabel}</div>
                  </div>

                  {/* Proficiency bonus (desktop) */}
                  <div className={`flex-1 flex flex-col items-center justify-center py-3 rounded-xl border-2 ${accentBorder} ${accentBg}`}>
                    <div className="text-[8px] uppercase tracking-[0.2em] opacity-40 mb-1">Prof. Bonus</div>
                    <div className={`text-3xl font-black font-mono ${accentText}`}>+{profBonus}</div>
                    <div className="text-[9px] opacity-30 mt-0.5 uppercase tracking-wider">BONUS</div>
                  </div>
                </div>
                <div className={`mt-4 rounded-xl border ${accentBorder} bg-black/20 px-4 py-3`}>
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] opacity-50 mb-2">
                    <span>Experience</span>
                    <span>{nextLevelXP ? `${toNextLevel ?? 0} XP to level ${level + 1}` : 'Max Level'}</span>
                  </div>
                  <div className="h-2 rounded-full bg-black/40 overflow-hidden border border-white/5">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isScifi ? 'bg-cyan-400' : 'bg-amber-400'}`}
                      style={{ width: `${xpProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] font-mono opacity-45">
                    <span>{currentXP.toLocaleString()} XP</span>
                    <span>{nextLevelXP ? nextLevelXP.toLocaleString() : '20'}</span>
                  </div>
                </div>
              </div>

              {/* ── HP + Credits ── */}
              <div className={`px-6 py-4 border-b ${dividerColor} space-y-4`}>

                {/* HP */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60`}>
                      Hit Points
                    </span>
                    {!readOnly && editingHp ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setHpValue(v => Math.max(0, v - 1))}
                          className={`w-6 h-6 rounded bg-${bg}-700 text-white/70 text-sm flex items-center justify-center hover:bg-${bg}-600`}
                        >−</button>
                        <input
                          type="number"
                          value={hpValue}
                          onChange={e => setHpValue(parseInt(e.target.value) || 0)}
                          className={`w-14 text-center bg-${bg}-800 border ${accentBorder} rounded text-sm text-white py-0.5`}
                        />
                        <button
                          onClick={() => setHpValue(v => Math.min(character.maxHp, v + 1))}
                          className={`w-6 h-6 rounded bg-${bg}-700 text-white/70 text-sm flex items-center justify-center hover:bg-${bg}-600`}
                        >+</button>
                        <span className="text-white/30 text-sm">/ {character.maxHp}</span>
                        <button
                          onClick={handleHpSave}
                          className={`px-2 py-0.5 rounded text-xs font-bold ${accentBg} ${accentText} hover:${accentBgStrong} border ${accentBorder}`}
                        >Save</button>
                        <button
                          onClick={() => { setEditingHp(false); setHpValue(character.hp); }}
                          className="text-white/30 text-xs hover:text-white/60"
                        >Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => !readOnly && setEditingHp(true)}
                        className={`text-sm font-bold font-mono ${accentText} ${readOnly ? '' : 'hover:opacity-80 cursor-pointer'} transition-opacity`}
                      >
                        {character.hp} <span className="opacity-40">/ {character.maxHp}</span>
                      </button>
                    )}
                  </div>
                  <div className="h-4 bg-black/40 rounded-full overflow-hidden p-[2px]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${hpColor}`}
                      style={{ width: `${hpPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] opacity-20">0</span>
                    <span className="text-[9px] opacity-20">{character.maxHp} max</span>
                  </div>
                </div>

                {/* Credits / Gold */}
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${accentBorder} bg-black/20`}>
                  <div className="text-lg">
                    {isScifi ? '💳' : '🪙'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[9px] uppercase tracking-[0.2em] opacity-40`}>
                      {character.resourceName}
                    </div>
                    {!readOnly && editingCredits ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="number"
                          value={creditsValue}
                          onChange={e => setCreditsValue(parseInt(e.target.value) || 0)}
                          className={`w-28 bg-${bg}-800 border ${accentBorder} rounded px-2 py-0.5 text-sm text-white font-mono`}
                        />
                        <button
                          onClick={handleCreditsSave}
                          className={`px-2 py-0.5 rounded text-xs font-bold ${accentBg} ${accentText} border ${accentBorder}`}
                        >Save</button>
                        <button
                          onClick={() => { setEditingCredits(false); setCreditsValue(character.resource); }}
                          className="text-white/30 text-xs hover:text-white/60"
                        >Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => !readOnly && setEditingCredits(true)}
                        className={`text-xl font-black font-mono ${accentText} ${readOnly ? '' : 'hover:opacity-80 cursor-pointer'} transition-opacity mt-0.5 block`}
                      >
                        {character.resource.toLocaleString()}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Conditions ── */}
              {character.conditions.length > 0 && (
                <div className={`px-6 py-3 border-b ${dividerColor} bg-black/10`}>
                  <div className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60 mb-2`}>
                    Conditions
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {character.conditions.map(c => {
                      const detail = character.conditionDetails?.find(d => d.name.toLowerCase() === c.toLowerCase());
                      const rounds = detail?.remainingRounds;
                      const title = [
                        detail?.source ? `Source: ${detail.source}` : null,
                        rounds !== undefined ? `Expires in ${rounds} round${rounds === 1 ? '' : 's'}` : 'Until removed'
                      ].filter(Boolean).join(' · ');
                      return (
                        <span
                          key={c}
                          title={title}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            isScifi
                              ? 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10'
                              : 'border-amber-500/30 text-amber-300 bg-amber-500/10'
                          }`}
                        >
                          {c}
                          {rounds !== undefined && (
                            <span className={`px-1 rounded-full text-[9px] ${isScifi ? 'bg-cyan-500/20' : 'bg-amber-500/20'}`}>{rounds}r</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Equipment ── */}
              <div className={`px-6 py-4 border-b ${dividerColor}`}>
                <div className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60 mb-3`}>
                  Equipment & Inventory
                  <span className="opacity-50 ml-2 normal-case font-normal">({character.inventory.length} items)</span>
                </div>
                {character.inventory.length > 0 ? (
                  <div className="grid grid-cols-1 gap-1.5">
                    {/* Equipped items first */}
                    {character.inventory.filter(i => i.equipped).length > 0 && (
                      <div>
                        <div className="text-[8px] uppercase tracking-widest opacity-25 mb-1 px-1">Equipped</div>
                        {character.inventory.filter(i => i.equipped).map((item, idx) => (
                          <div key={`e-${idx}`} className="mb-1">
                            <ItemCard item={item} theme={theme} />
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Unequipped items */}
                    {character.inventory.filter(i => !i.equipped).length > 0 && (
                      <div>
                        <div className="text-[8px] uppercase tracking-widest opacity-25 mb-1 px-1 mt-2">Carried</div>
                        {character.inventory.filter(i => !i.equipped).map((item, idx) => (
                          <div key={`c-${idx}`} className="mb-1">
                            <ItemCard item={item} theme={theme} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 opacity-20 text-[10px] uppercase tracking-widest">No items carried</div>
                )}
              </div>

              {/* ── Features & Traits ── */}
              {(skillFeatures.length > 0 || racialTrait) && (
                <div className={`px-6 py-4`}>
                  <div className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentText} opacity-60 mb-3`}>
                    Features & Traits
                  </div>
                  <div className="space-y-2">
                    {/* Racial trait */}
                    {racialTrait && (
                      <div className={`p-3 rounded-xl border ${accentBorder} bg-black/20`}>
                        <div className={`text-[10px] font-black uppercase tracking-wider ${accentText} mb-1`}>
                          {character.race} Traits
                        </div>
                        <p className="text-xs opacity-60 leading-relaxed">{racialTrait}</p>
                      </div>
                    )}
                    {/* Skill notes as features */}
                    {skillFeatures.map(([name, skill]) => (
                      <div key={name} className={`p-3 rounded-xl border ${accentBorder} bg-black/20`}>
                        <div className={`text-[10px] font-black uppercase tracking-wider ${accentText} mb-1 capitalize`}>
                          {name}
                        </div>
                        <p className="text-xs opacity-60 leading-relaxed">{skill.notes}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Lookup known racial traits for display in Features section
function getRacialTrait(race: string): string | null {
  const traits: Record<string, string> = {
    Vexian: 'Four arms allow holding multiple weapons or tools simultaneously. Compound eyes grant exceptional peripheral vision, advantage on Perception checks to detect motion. Natural-born scouts of the Vex star system.',
    Human: 'Versatile and adaptive. Gain one additional skill proficiency and one additional feat at character creation.',
    Elf: 'Keen senses and fey ancestry grant proficiency in Perception. Immune to magical sleep. Trance replaces sleep — 4 hours of meditation equals 8 hours of rest.',
    Dwarf: 'Darkvision 60 ft. Dwarven Resilience grants advantage on poison saves. Stonecunning — double proficiency bonus on History checks related to stonework.',
    Halfling: 'Lucky — reroll any 1 on attack rolls, ability checks, or saving throws. Brave — advantage against Frightened. Naturally stealthy — can hide behind creatures one size larger.',
    Tiefling: 'Darkvision 60 ft. Hellish Resistance — fire damage resistance. Thaumaturgy cantrip at will. Hellish Rebuke 1/day at 3rd level.',
    Gnome: 'Darkvision 60 ft. Gnome Cunning — advantage on all INT, WIS, CHA saving throws against magic.',
    'Half-Orc': 'Darkvision 60 ft. Relentless Endurance — once per long rest, drop to 1 HP instead of 0. Savage Attacks — extra die on critical weapon hits.',
  };
  return traits[race] ?? null;
}
