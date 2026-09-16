/**
 * Points, multipliers and thresholds (DESIGN.md §2.7, Scoring tab).
 *
 *   regular score = round( wordPoints × morphemeMult × extensionBonus × inRunMult ) + flat
 *   boss score    = round( bossWordPoints × morphemeMult × inRunMult )
 *   morphemeMult  = base ^ (effectiveMorphemes − 1)
 *   threshold     = round( T1 × growth ^ (round − 1) × (boss ? bossFactor : 1) )
 *
 * Every function takes `balance` as an argument; nothing here imports content.
 */

import { tileValue } from './tiles';
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

export function threshold(round: number, balance: Balance): number {
  const s = balance.scoring;
  const boss = isBossRound(round, balance) ? s.bossThresholdFactor : 1;
  return roundHalfUp(s.round1Threshold * Math.pow(s.thresholdGrowth, round - 1) * boss);
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

/** Sum of tile values over the whole chain (tile value modifiers included). */
export function wordPoints(chain: Chain): number {
  return chain.tiles.reduce((sum, t) => sum + tileValue(t), 0);
}

/** Morpheme count minus strain for the round; never below 1. */
export function effectiveMorphemes(morphemes: number, strainCount: number, balance: Balance): number {
  return Math.max(1, morphemes - strainCount * balance.scoring.strain);
}

export function morphemeMultiplier(effectiveMorphemes: number, balance: Balance): number {
  return Math.pow(balance.scoring.multiplierBase, effectiveMorphemes - 1);
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
}

export type ScoreBreakdown = Omit<RoundResult, 'outcome' | 'currencyEarned'>;

export function scoreRegular(input: RegularScoreInput, balance: Balance): ScoreBreakdown {
  const effM = effectiveMorphemes(input.morphemes, input.strainCount, balance);
  const morphemeMult = morphemeMultiplier(effM, balance);
  const extBonus = extensionBonus(input.extension, balance);
  const flat = input.flatBonus ?? 0;
  const score = roundHalfUp(input.wordPoints * morphemeMult * extBonus * input.inRunMult) + flat;
  const t = threshold(input.round, balance);
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
}

export function scoreBoss(input: BossScoreInput, balance: Balance): ScoreBreakdown {
  const effM = effectiveMorphemes(input.morphemes, 0, balance);
  const morphemeMult = morphemeMultiplier(effM, balance);
  const flat = input.flatBonus ?? 0;
  const score = roundHalfUp(input.bossWordPoints * morphemeMult * input.inRunMult) + flat;
  const t = threshold(input.round, balance);
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
