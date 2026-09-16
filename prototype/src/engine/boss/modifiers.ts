/**
 * Boss modifier hooks (P4-04): each transforms the resolved BossRules. Y Not
 * additionally re-letters feed tiles (see feed.ts). Unknown hook ids are a
 * startup error.
 */

import * as rng from '../rng';
import type { Balance, BossHookId, BossModifierSpec, BossRules, RngState } from '../types';

export type RuleHook = (rules: BossRules, params: BossModifierSpec['params']) => BossRules;

export const bossHooks: Record<BossHookId, RuleHook> = {
  y_not: (r) => ({ ...r, vowelsToY: true }),
  long_words: (r, p) => ({ ...r, minWordLength: Math.max(r.minWordLength, Number(p.minLength ?? 4)) }),
  rapid_feed: (r, p) => ({ ...r, feedIntervalMs: Math.round(r.feedIntervalMs / Number(p.factor ?? 1.5)) }),
  tight_rack: (r, p) => ({ ...r, rackCap: Number(p.rackCap ?? 4) }),
  fog: (r) => ({ ...r, hideQueue: true }),
  half_time: (r, p) => ({ ...r, timerMs: Math.round(r.timerMs * Number(p.factor ?? 0.7)) }),
  vowel_tax: (r) => ({ ...r, vowelsScoreZero: true }),
  overload: (r) => ({ ...r, overflowEnds: true }),
};

export function validateBossModifiers(mods: readonly BossModifierSpec[]): void {
  const seen = new Set<string>();
  for (const m of mods) {
    if (seen.has(m.id)) throw new Error(`duplicate boss modifier id "${m.id}"`);
    seen.add(m.id);
    if (!(m.hookId in bossHooks)) throw new Error(`boss modifier "${m.id}" uses unknown hook "${m.hookId}"`);
  }
}

/** The rules with no modifier, for boss `bossNumber`. */
export function baseRules(bossNumber: number, balance: Balance): BossRules {
  const feed = balance.boss.feedIntervalMs;
  return {
    timerMs: balance.boss.timerMs,
    feedIntervalMs: feed[Math.min(bossNumber, feed.length) - 1] ?? feed[feed.length - 1] ?? 4000,
    startingRack: balance.boss.startingRack,
    rackCap: balance.boss.rackCap,
    minWordLength: balance.boss.minWordLength,
    vowelsScoreZero: false,
    vowelsToY: false,
    hideQueue: false,
    overflowEnds: false,
    overflowDiscards: 'oldest',
    starterShrink: false,
  };
}

export function applyModifier(rules: BossRules, mod: BossModifierSpec | undefined): BossRules {
  return mod ? bossHooks[mod.hookId](rules, mod.params) : rules;
}

/** Draw a modifier at random, never the one to exclude (Amendment reroll). */
export function rollModifier(mods: readonly BossModifierSpec[], state: RngState, exclude?: string | null): [BossModifierSpec | undefined, RngState] {
  const pool = mods.filter((m) => m.id !== exclude);
  if (pool.length === 0) return [undefined, state];
  const [i, next] = rng.int(state, pool.length);
  return [pool[i], next];
}
