/**
 * What a run's loadout means to the engine (P7-04 … P7-07): lives, hand
 * size, free redraws, threshold scale, shop prices, boss rules, tile values.
 * All read from `state.preRun`; the Lexicon screen builds the loadout.
 */

import type { Balance, BossRules, ChallengeId, PreRunCategoryId, PreRunLoadout, RunState, Tile } from './types';

export function level(loadout: PreRunLoadout, id: PreRunCategoryId): number {
  return loadout.categories[id] ?? 0;
}

export function hasChallenge(loadout: PreRunLoadout, id: ChallengeId): boolean {
  return loadout.challenges?.includes(id) ?? false;
}

export function steepCurveLevel(loadout: PreRunLoadout): number {
  return loadout.risks?.steep_curve ?? 0;
}

/** Starting lives: Second Breath level, unless No Breath. */
export function lives(loadout: PreRunLoadout, balance: Balance): number {
  if (hasChallenge(loadout, 'no_breath')) return 0;
  return balance.lives.base + level(loadout, 'second_breath');
}

export function handSize(loadout: PreRunLoadout, balance: Balance): number {
  const l = level(loadout, 'substrate');
  return balance.hand.size + (l > 0 ? (balance.preRun.substrate.handBonus[l - 1] ?? 0) : 0);
}

export function freeRedraws(loadout: PreRunLoadout, balance: Balance): number {
  return level(loadout, 'substrate') >= balance.preRun.substrate.freeRedrawFromLevel ? 1 : 0;
}

/** Threshold multiplier from Steep Curve. */
export function thresholdScale(loadout: PreRunLoadout, balance: Balance): number {
  const l = steepCurveLevel(loadout);
  return l > 0 ? (balance.preRun.steepCurve.thresholdScale[l - 1] ?? 1) : 1;
}

/** Shop price multiplier: Treasury L3 discount × Inflation. */
export function priceMult(loadout: PreRunLoadout, balance: Balance): number {
  let m = 1;
  if (level(loadout, 'treasury') >= 3) m *= 1 - balance.preRun.treasury.shopDiscount;
  if (hasChallenge(loadout, 'inflation')) m *= balance.preRun.challenges.inflationPriceMult;
  return m;
}

/** Boss rule changes from Tempo and Tight Clock (applied after the boss modifier). */
export function bossRules(loadout: PreRunLoadout, balance: Balance, rules: BossRules): BossRules {
  let r = rules;
  const l = level(loadout, 'tempo');
  if (l > 0) {
    const t = balance.preRun.tempo;
    r = {
      ...r,
      timerMs: Math.round(r.timerMs * (t.timerMult[l - 1] ?? 1)),
      feedIntervalMs: Math.round(r.feedIntervalMs * (t.feedMult[l - 1] ?? 1)),
      rackCap: r.rackCap + (t.rackBonus[l - 1] ?? 0),
    };
  }
  if (hasChallenge(loadout, 'tight_clock')) r = { ...r, timerMs: Math.round(r.timerMs * balance.preRun.challenges.tightClockTimerMult) };
  return r;
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/** Vowel Thief: vowel tiles are worth 0 for the run. */
export function applyToPool(loadout: PreRunLoadout, pool: Tile[]): Tile[] {
  if (!hasChallenge(loadout, 'vowel_thief')) return pool;
  return pool.map((t) => (VOWELS.has(t.letter) ? { ...t, baseValue: 0 } : t));
}

export const fromState = {
  thresholdScale: (state: RunState, balance: Balance) => thresholdScale(state.preRun, balance),
  priceMult: (state: RunState, balance: Balance) => priceMult(state.preRun, balance),
};
