/**
 * Points, multipliers and thresholds (DESIGN.md §2.7, Scoring tab).
 *
 *   regular score = round( wordPoints × morphemeMult × extensionBonus × inRunMult ) + flat
 *   boss score    = round( bossWordPoints × morphemeMult × inRunMult )
 *   morphemeMult  = base ^ (effectiveMorphemes − 1)
 *   threshold     = round( T1 × Π growth(block) × (boss ? bossFactor : 1) × loadoutScale )
 *
 * Every function takes `balance` as an argument; nothing here imports content.
 */

import { tileLetter, tileValue } from './tiles';
import type { Balance, Chain, RoundResult } from './types';

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export function isBossRound(round: number, balance: Balance): boolean {
  return round % balance.rounds.bossEvery === 0;
}

/** 1-based boss number for a boss round (4 → 1, 8 → 2 …). */
export function bossNumber(round: number, balance: Balance): number {
  return Math.floor(round / balance.rounds.bossEvery);
}

/** Bosses beaten before `round` starts (rounds 1–4 → 0, 5–8 → 1 …). */
export function bossesBefore(round: number, balance: Balance): number {
  return Math.floor((round - 1) / balance.rounds.bossEvery);
}

/** Growth factor applied going *into* `round` (rounds 1–4 use block 0, 5–8 block 1 …). */
export function growthFor(round: number, balance: Balance): number {
  const g = balance.scoring.thresholdGrowthByBlock;
  const block = Math.floor((round - 1) / balance.scoring.growthBlockSize);
  return g[Math.min(block, g.length - 1)] ?? 1;
}

/** Unrounded regular-round threshold before the boss factor and loadout scale. */
export function baseThreshold(round: number, balance: Balance): number {
  let t = balance.scoring.round1Threshold;
  for (let k = 2; k <= round; k++) t *= growthFor(k, balance);
  return t;
}

/** `scale` is the loadout's threshold multiplier (Steep Curve), 1 by default. */
export function threshold(round: number, balance: Balance, scale = 1): number {
  const boss = isBossRound(round, balance) ? balance.scoring.bossThresholdFactor : 1;
  return roundHalfUp(baseThreshold(round, balance) * boss * scale);
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

/** Sum of tile values over the whole chain (tile value modifiers included). */
export function wordPoints(chain: Chain): number {
  return chain.tiles.reduce((sum, t) => sum + tileValue(t), 0);
}

/** What a per-morpheme scoring hook can look at. */
export interface MorphemeInfo {
  index: number;
  count: number;
  text: string;
  /** The rest of the chain's text without this morpheme. */
  restText: string;
  isHead: boolean;
  isTail: boolean;
  addedThisRound: boolean;
  side: 'front' | 'back' | 'start' | 'insert';
  /** Base values of the morpheme's tiles, in order. */
  tileValues: number[];
  /** Texts of every morpheme in the chain, for pattern hooks. */
  allTexts: string[];
}

export interface MorphemePoints {
  text: string;
  base: number;
  mult: number;
  points: number;
}

/**
 * Word points with a per-morpheme multiplier (in-run modifiers). With the
 * identity multiplier this equals `wordPoints(chain)`.
 */
export function wordPointsBy(chain: Chain, round: number, value: (info: MorphemeInfo, base: number) => number): { total: number; perMorpheme: MorphemePoints[] } {
  const byId = new Map(chain.tiles.map((t) => [t.id, t]));
  const texts = chain.morphemes.map((m) => m.tileIds.map((id) => tileLetter(byId.get(id)!)).join('').toLowerCase());
  const perMorpheme = chain.morphemes.map((m, i) => {
    const base = m.tileIds.reduce((sum, id) => sum + tileValue(byId.get(id)!), 0);
    const info: MorphemeInfo = {
      index: i,
      count: chain.morphemes.length,
      text: texts[i]!,
      restText: texts.filter((_, k) => k !== i).join(''),
      isHead: i === 0,
      isTail: i === chain.morphemes.length - 1,
      addedThisRound: m.round === round,
      side: m.side,
      tileValues: m.tileIds.map((id) => tileValue(byId.get(id)!)),
      allTexts: texts,
    };
    const points = value(info, base);
    return { text: info.text, base, mult: base > 0 ? points / base : 1, points };
  });
  return { total: perMorpheme.reduce((s, p) => s + p.points, 0), perMorpheme };
}

/** Morpheme count minus strain for the round; never below 1. */
export function effectiveMorphemes(morphemes: number, strainCount: number, balance: Balance): number {
  return Math.max(1, morphemes - strainCount * balance.scoring.strain);
}

export function morphemeMultiplier(effectiveMorphemes: number, balance: Balance, base = balance.scoring.multiplierBase): number {
  return Math.pow(base, effectiveMorphemes - 1);
}

export interface ExtensionShape {
  front: number;
  back: number;
}

export type ExtensionBonusKind = 'none' | 'two_same_side' | 'front_back' | 'three_plus';

export function extensionBonusKind(shape: ExtensionShape): ExtensionBonusKind {
  const total = shape.front + shape.back;
  if (total >= 3) return 'three_plus';
  if (total === 2) return shape.front === 1 && shape.back === 1 ? 'front_back' : 'two_same_side';
  return 'none';
}

/** Multiplier for extending by more than the minimum in one round. */
export function extensionBonus(shape: ExtensionShape, balance: Balance): number {
  switch (extensionBonusKind(shape)) {
    case 'three_plus':
      return balance.scoring.bonusThreePlus;
    case 'front_back':
      return balance.scoring.bonusFrontBack;
    case 'two_same_side':
      return balance.scoring.bonusTwoSameSide;
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// Round scores
// ---------------------------------------------------------------------------

export interface RegularScoreInput {
  round: number;
  wordPoints: number;
  morphemes: number;
  /** Number of extension cards used this round (each applies `strain`). */
  strainCount: number;
  extension: ExtensionShape;
  /** In-run modifier multiplier (hook — computed by modifiers from M5). */
  inRunMult: number;
  /** Flat bonuses added after multiplication (hook). */
  flatBonus?: number;
  /** Morpheme-multiplier base after in-run modifiers (default: balance). */
  multiplierBase?: number;
  /** Multiplier applied to the extension bonus (Mirror). */
  extensionBonusMult?: number;
  /** Threshold scale from the loadout (Steep Curve). */
  thresholdScale?: number;
}

export type ScoreBreakdown = Omit<RoundResult, 'outcome' | 'currencyEarned' | 'currencySources' | 'notes' | 'criteriaMet'>;

export function scoreRegular(input: RegularScoreInput, balance: Balance): ScoreBreakdown {
  const effM = effectiveMorphemes(input.morphemes, input.strainCount, balance);
  const morphemeMult = morphemeMultiplier(effM, balance, input.multiplierBase);
  const extBonus = extensionBonus(input.extension, balance) * (input.extensionBonusMult ?? 1);
  const flat = input.flatBonus ?? 0;
  const score = roundHalfUp(input.wordPoints * morphemeMult * extBonus * input.inRunMult) + flat;
  const t = threshold(input.round, balance, input.thresholdScale);
  return {
    round: input.round,
    kind: 'regular',
    wordPoints: input.wordPoints,
    morphemes: input.morphemes,
    effectiveMorphemes: effM,
    morphemeMult,
    extensionBonus: extBonus,
    inRunMult: input.inRunMult,
    flatBonus: flat,
    score,
    threshold: t,
    passed: score >= t,
  };
}

export interface BossScoreInput {
  round: number;
  /** Sum of tile values over every word placed. */
  bossWordPoints: number;
  morphemes: number;
  inRunMult: number;
  flatBonus?: number;
  multiplierBase?: number;
  thresholdScale?: number;
}

export function scoreBoss(input: BossScoreInput, balance: Balance): ScoreBreakdown {
  const effM = effectiveMorphemes(input.morphemes, 0, balance);
  const morphemeMult = morphemeMultiplier(effM, balance, input.multiplierBase);
  const flat = input.flatBonus ?? 0;
  const score = roundHalfUp(input.bossWordPoints * morphemeMult * input.inRunMult) + flat;
  const t = threshold(input.round, balance, input.thresholdScale);
  return {
    round: input.round,
    kind: 'boss',
    wordPoints: input.bossWordPoints,
    morphemes: input.morphemes,
    effectiveMorphemes: effM,
    morphemeMult,
    extensionBonus: 1,
    inRunMult: input.inRunMult,
    flatBonus: flat,
    score,
    threshold: t,
    passed: score >= t,
  };
}

/** Excel-style ROUND for non-negative values (half away from zero). */
export function roundHalfUp(x: number): number {
  return Math.round(x + Number.EPSILON);
}
