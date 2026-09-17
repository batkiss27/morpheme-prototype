/**
 * Currency earning rules (Economy tab, P5-04) and the criteria that open the
 * conditional in-run shop slot (Shops tab, P5-05).
 */

import * as C from './chain';
import * as mods from './modifiers';
import type { ExtensionShape, ScoreBreakdown } from './scoring';
import type { Balance, CurrencySource, EngineContent, RunState } from './types';

/** Natural word dividend for a fully real word of `morphemes` morphemes. */
export function naturalDividend(morphemes: number, balance: Balance): number {
  const table = balance.economy.naturalDividend;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const min = keys[0] ?? Infinity;
  const max = keys[keys.length - 1] ?? -Infinity;
  if (morphemes < min) return 0;
  if (morphemes <= max) return table[morphemes] ?? 0;
  return (table[max] ?? 0) + balance.economy.naturalDividendBeyond * (morphemes - max);
}

/** +1 per `marginBonusStep` of the threshold beaten by, capped. */
export function marginBonus(score: number, threshold: number, balance: Balance): number {
  if (threshold <= 0 || score < threshold) return 0;
  const steps = Math.floor((score - threshold) / threshold / balance.economy.marginBonusStep);
  return Math.min(balance.economy.marginBonusCap, steps);
}

export interface RegularRoundEconomyInput {
  breakdown: ScoreBreakdown;
  shape: ExtensionShape;
  /** No extension card used this round. */
  natural: boolean;
  /** Streak value after this round (0 if not natural). */
  streakAfter: number;
}

/** Currency sources for a passed regular round, in Economy-tab order. */
export function regularRoundCurrency(state: RunState, content: EngineContent, input: RegularRoundEconomyInput): CurrencySource[] {
  const { balance } = content;
  const e = balance.economy;
  const t = balance.preRun.treasury;
  const treasury = state.preRun.categories.treasury ?? 0;
  const chain = state.chain;
  const sources: CurrencySource[] = [{ source: 'Round clear', amount: e.roundClear }];
  if (treasury >= 1) sources.push({ source: 'Treasury', amount: t.roundClearBonus });
  const margin = marginBonus(input.breakdown.score, input.breakdown.threshold, balance);
  if (margin > 0) sources.push({ source: 'Margin bonus', amount: margin });
  if (input.natural && input.streakAfter > 0) {
    const streak = Math.min(e.naturalStreakCap, input.streakAfter) * e.naturalStreakPer;
    sources.push({ source: treasury >= 2 ? 'Natural streak (Treasury ×2)' : 'Natural streak', amount: streak * (treasury >= 2 ? t.streakMult : 1) });
  }
  if (chain?.natural) {
    const d = naturalDividend(C.morphemeCount(chain), balance);
    if (d > 0) sources.push({ source: treasury >= 4 ? 'Natural word dividend (Treasury ×2)' : 'Natural word dividend', amount: d * (treasury >= 4 ? t.dividendMult : 1) });
  }
  const extra = input.shape.front + input.shape.back - 1;
  if (extra > 0) sources.push({ source: 'Extension bonus payout', amount: extra * e.extensionBonusPayout });
  sources.push(...mods.roundCurrency(state, content));
  if (state.roundEffects.bank) sources.push({ source: 'Bank (×2)', amount: sources.reduce((s, c) => s + c.amount, 0) });
  return sources;
}

export function bossCurrency(bossNumber: number, balance: Balance): CurrencySource[] {
  const amount = balance.economy.bossClear[bossNumber - 1] ?? 0;
  return amount > 0 ? [{ source: 'Boss clear', amount }] : [];
}

export function total(sources: readonly CurrencySource[]): number {
  return sources.reduce((s, c) => s + c.amount, 0);
}

/** Criteria (Shops tab) met by a passed regular round. */
export function shopCriteria(state: RunState, breakdown: ScoreBreakdown, shape: ExtensionShape): string[] {
  const met: string[] = [];
  const chain = state.chain;
  if (chain?.natural && C.morphemeCount(chain) >= 5) met.push('Natural 5+');
  if (breakdown.threshold > 0 && breakdown.score >= 2 * breakdown.threshold) met.push('Double threshold');
  if (shape.front >= 1 && shape.back >= 1) met.push('Front + back');
  if (shape.front + shape.back >= 3) met.push('Triple step');
  if (state.roundEffects.milestone && shape.front + shape.back >= 2) met.push('Milestone card');
  return met;
}
