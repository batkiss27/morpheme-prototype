/**
 * Meta-progression (P7-01 … P7-04): Lexicon points, letter and category
 * levels, loadout budget and validation, achievements and run awards. Pure;
 * the UI persists MetaState in localStorage.
 */

import * as C from './chain';
import { replayWithHistory, exportRun } from './export';
import type { RoundSummary } from './export';
import * as loadoutFns from './loadout';
import type {
  AchievementSpec,
  Balance,
  EngineContent,
  Letter,
  MetaState,
  PreRunCategoryId,
  PreRunLoadout,
  Result,
  RunAwards,
  RunState,
} from './types';

export const META_VERSION = 1;
export const MAX_LEVEL = 4;

export const emptyLoadout: PreRunLoadout = { tileModifiers: [], categories: {}, risks: {}, challenges: [] };

export function createMeta(balance: Balance): MetaState {
  return {
    version: META_VERSION,
    lexiconPoints: 0,
    letterLevels: {},
    categoryLevels: {},
    unlockedCards: [],
    unlockedModifiers: [],
    achievements: [],
    loadoutBudget: balance.meta.loadoutBudgetStart,
    challengesUnlocked: false,
    runs: 0,
    wins: 0,
    loadout: emptyLoadout,
  };
}

// --- Levels ----------------------------------------------------------------------

/** Cost to go from `current` to `current + 1`, or undefined at the cap. */
export function nextLevelCost(current: number, balance: Balance): number | undefined {
  return current >= MAX_LEVEL ? undefined : balance.meta.levelCosts[current];
}

export function buyLetterLevel(meta: MetaState, letter: Letter, balance: Balance): Result<MetaState> {
  if (letter === '_') return { ok: false, error: 'blanks have no level' };
  const current = meta.letterLevels[letter] ?? 0;
  const cost = nextLevelCost(current, balance);
  if (cost === undefined) return { ok: false, error: `${letter} is already level ${MAX_LEVEL}` };
  if (meta.lexiconPoints < cost) return { ok: false, error: `need ${cost} Lexicon points` };
  return { ok: true, value: { ...meta, lexiconPoints: meta.lexiconPoints - cost, letterLevels: { ...meta.letterLevels, [letter]: current + 1 } } };
}

export function buyCategoryLevel(meta: MetaState, id: PreRunCategoryId, balance: Balance): Result<MetaState> {
  const current = meta.categoryLevels[id] ?? 0;
  const cost = nextLevelCost(current, balance);
  if (cost === undefined) return { ok: false, error: `${id} is already level ${MAX_LEVEL}` };
  if (meta.lexiconPoints < cost) return { ok: false, error: `need ${cost} Lexicon points` };
  return { ok: true, value: { ...meta, lexiconPoints: meta.lexiconPoints - cost, categoryLevels: { ...meta.categoryLevels, [id]: current + 1 } } };
}

// --- Loadout ----------------------------------------------------------------------

export function modifierLevel(content: EngineContent, modifier: string): number {
  return content.tileModifiers.find((m) => m.id === modifier)?.level ?? 99;
}

/** Points spent: tile modifiers cost their level (D3: one tile each); categories cost the activated level. */
export function loadoutCost(loadout: PreRunLoadout, content: EngineContent): number {
  const tiles = loadout.tileModifiers.reduce((s, m) => s + modifierLevel(content, m.modifier), 0);
  const cats = Object.values(loadout.categories).reduce((s, l) => s + (l ?? 0), 0);
  return tiles + cats;
}

/** Points granted by risks and challenges. */
export function loadoutBonusPoints(loadout: PreRunLoadout, content: EngineContent): number {
  let pts = 0;
  for (const risk of content.preRun.risks) {
    const l = loadout.risks?.[risk.id] ?? 0;
    if (l > 0) pts += risk.points[l - 1] ?? 0;
  }
  for (const id of loadout.challenges ?? []) pts += content.preRun.challenges.find((c) => c.id === id)?.points ?? 0;
  return pts;
}

export function loadoutPoints(meta: MetaState, loadout: PreRunLoadout, content: EngineContent): number {
  return Math.min(meta.loadoutBudget, content.balance.meta.loadoutBudgetCap) + loadoutBonusPoints(loadout, content);
}

/** Every rule the Lexicon screen enforces; empty = valid. */
export function validateLoadout(meta: MetaState, loadout: PreRunLoadout, content: EngineContent): string[] {
  const errors: string[] = [];
  const { balance } = content;
  const seen = new Set<string>();
  for (const m of loadout.tileModifiers) {
    if (seen.has(m.letter)) errors.push(`${m.letter}: one loadout modifier per letter`);
    seen.add(m.letter);
    const need = modifierLevel(content, m.modifier);
    const have = meta.letterLevels[m.letter] ?? 0;
    if (need > have) errors.push(`${m.letter}: ${m.modifier} needs level ${need} (have ${have})`);
  }
  if (loadout.tileModifiers.length > balance.meta.modifiedLettersCap) errors.push(`at most ${balance.meta.modifiedLettersCap} modified letters`);
  for (const [id, lvl] of Object.entries(loadout.categories) as [PreRunCategoryId, number][]) {
    if ((lvl ?? 0) > (meta.categoryLevels[id] ?? 0)) errors.push(`${id}: level ${lvl} is not unlocked`);
    if ((lvl ?? 0) < 0 || (lvl ?? 0) > MAX_LEVEL) errors.push(`${id}: invalid level`);
  }
  for (const [id, lvl] of Object.entries(loadout.risks ?? {})) {
    const spec = content.preRun.risks.find((r) => r.id === id);
    if (!spec) errors.push(`unknown risk ${id}`);
    else if ((lvl ?? 0) < 0 || (lvl ?? 0) > spec.levels.length) errors.push(`${id}: invalid level`);
  }
  if ((loadout.challenges?.length ?? 0) > 0 && !meta.challengesUnlocked) errors.push('challenge modifiers unlock after your first win');
  for (const id of loadout.challenges ?? []) if (!content.preRun.challenges.some((c) => c.id === id)) errors.push(`unknown challenge ${id}`);
  const cost = loadoutCost(loadout, content);
  const pts = loadoutPoints(meta, loadout, content);
  if (cost > pts) errors.push(`loadout costs ${cost} but only ${pts} points are available`);
  return errors;
}

// --- Run facts & achievements ------------------------------------------------------

export interface RunFacts {
  roundsCleared: number;
  bossesBeaten: number;
  maxMorphemes: number;
  maxLetters: number;
  won: boolean;
  livesLost: number;
  extensionCardsUsed: number;
  twoStep: boolean;
  bothEnds: boolean;
  tripleStep: boolean;
  maxNaturalMorphemes: number;
  secretWords: string[];
  trapdoor: boolean;
  unaided: boolean;
}

export function runFacts(state: RunState, history: RoundSummary[], content: EngineContent): RunFacts {
  const regular = history.filter((h) => h.kind === 'regular');
  const extension = new Set(content.cards.filter((c) => c.type === 'extension').map((c) => c.id));
  let secretRound = Infinity;
  for (const h of history) if (h.secretWord && h.round < secretRound) secretRound = h.round;
  return {
    roundsCleared: regular.filter((h) => h.passed).length,
    bossesBeaten: history.filter((h) => h.kind === 'boss' && h.passed).length,
    maxMorphemes: Math.max(0, ...history.map((h) => h.morphemes)),
    maxLetters: Math.max(0, ...regular.map((h) => h.chain.length), state.chain ? C.text(state.chain).length : 0),
    won: state.phase === 'WIN',
    livesLost: history.filter((h) => h.outcome === 'life_lost').length,
    extensionCardsUsed: history.reduce((n, h) => n + h.cardIds.filter((id) => extension.has(id)).length, 0),
    twoStep: regular.some((h) => h.added >= 2),
    bothEnds: regular.some((h) => h.frontBack),
    tripleStep: regular.some((h) => h.added >= 3),
    maxNaturalMorphemes: Math.max(0, ...regular.filter((h) => h.natural).map((h) => h.morphemes)),
    secretWords: history.map((h) => h.secretWord).filter((w): w is string => !!w),
    trapdoor: history.some((h) => h.kind === 'boss' && h.passed && h.round > secretRound),
    unaided: loadoutCost(state.preRun, content) === 0 && (state.preRun.challenges?.length ?? 0) === 0 && loadoutFns.steepCurveLevel(state.preRun) === 0,
  };
}

export function achievementMet(spec: AchievementSpec, f: RunFacts): boolean {
  const n = Number(spec.params.n ?? 0);
  switch (spec.predicate) {
    case 'rounds_cleared':
      return f.roundsCleared >= n;
    case 'bosses_beaten':
      return f.bossesBeaten >= n;
    case 'max_morphemes':
      return f.maxMorphemes >= n;
    case 'max_letters':
      return f.maxLetters >= n;
    case 'won':
      return f.won;
    case 'won_deathless':
      return f.won && f.livesLost === 0;
    case 'won_no_extension_cards':
      return f.won && f.extensionCardsUsed === 0;
    case 'won_unaided':
      return f.won && f.unaided;
    case 'two_step':
      return f.twoStep;
    case 'both_ends':
      return f.bothEnds;
    case 'triple_step':
      return f.tripleStep;
    case 'natural_morphemes':
      return f.maxNaturalMorphemes >= n;
    case 'secret_word':
      return f.secretWords.includes(String(spec.params.word));
    case 'trapdoor':
      return f.trapdoor;
    default:
      return false;
  }
}

/** Award a finished run: base Lexicon points, first-time achievements and their rewards. */
export function applyRunEnd(meta: MetaState, state: RunState, content: EngineContent): { meta: MetaState; awards: RunAwards } {
  if (state.phase !== 'GAME_OVER' && state.phase !== 'WIN') throw new Error('the run has not ended');
  const { balance } = content;
  const { history } = replayWithHistory(exportRun(state), content);
  const facts = runFacts(state, history, content);
  let lexicon = facts.roundsCleared * balance.meta.lexiconPerRoundCleared + facts.bossesBeaten * balance.meta.lexiconPerBossBeaten + (facts.won ? balance.meta.lexiconPerWin : 0);
  let loadout = 0;
  let challenges = false;
  const earned: string[] = [];
  const unlockedCards = new Set(meta.unlockedCards);
  const unlockedModifiers = new Set(meta.unlockedModifiers);
  for (const spec of content.achievements) {
    if (meta.achievements.includes(spec.id) || !achievementMet(spec, facts)) continue;
    earned.push(spec.id);
    lexicon += spec.reward.lexicon ?? 0;
    loadout += spec.reward.loadout ?? 0;
    if (spec.reward.challenges) challenges = true;
    for (const c of spec.reward.unlockCards ?? []) unlockedCards.add(c);
    for (const m of spec.reward.unlockModifiers ?? []) unlockedModifiers.add(m);
  }
  const next: MetaState = {
    ...meta,
    lexiconPoints: meta.lexiconPoints + lexicon,
    achievements: [...meta.achievements, ...earned],
    loadoutBudget: Math.min(balance.meta.loadoutBudgetCap, meta.loadoutBudget + loadout),
    challengesUnlocked: meta.challengesUnlocked || challenges,
    unlockedCards: [...unlockedCards],
    unlockedModifiers: [...unlockedModifiers],
    runs: meta.runs + 1,
    wins: meta.wins + (facts.won ? 1 : 0),
    loadout: state.preRun,
  };
  return { meta: next, awards: { lexiconPoints: lexicon, achievements: earned, loadoutPoints: loadout, challengesUnlocked: challenges && !meta.challengesUnlocked } };
}
