/** P5-04: currency sources against the Economy tab. */
import { describe, expect, it } from 'vitest';
import { defaultBalance } from '../src/content';
import { economy as E, reduce, scoring as S } from '../src/engine';
import type { RunState } from '../src/engine';
import { balanceWith, chainFromMorphemes, tilesFor, withCards } from './helpers';
import { anyDict, makeContent, newRun, playFromHand } from './run-driver';

const b = defaultBalance;

describe('economy terms', () => {
  it('natural word dividend table: 4→2, 5→3, 6→5, 7→8, 8→12, 9+ → +5 each', () => {
    expect([1, 3, 4, 5, 6, 7, 8, 9, 10, 12].map((m) => E.naturalDividend(m, b))).toEqual([0, 0, 2, 3, 5, 8, 12, 17, 22, 32]);
  });

  it('margin bonus: +1 per 25% over the threshold, cap 4', () => {
    expect(E.marginBonus(9, 10, b)).toBe(0);
    expect(E.marginBonus(10, 10, b)).toBe(0);
    expect(E.marginBonus(12.5, 10, b)).toBe(1);
    expect(E.marginBonus(19, 10, b)).toBe(3);
    expect(E.marginBonus(100, 10, b)).toBe(4);
  });

  it('boss clear rises per boss', () => {
    expect(E.bossCurrency(1, b)).toEqual([{ source: 'Boss clear', amount: 5 }]);
    expect(E.bossCurrency(6, b)).toEqual([{ source: 'Boss clear', amount: 15 }]);
  });
});

describe('a passed round lists every source', () => {
  const c = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));

  it('round clear + margin + streak + dividend + extension payout + Coinage, then Bank doubles', () => {
    let s = reduce(newRun(c), { type: 'START_ROUND' }, c);
    // a natural 5-morpheme chain, streak 3 so far, two morphemes added this round (2 same side), Coinage held, Bank active
    s = {
      ...s,
      round: 6,
      streak: 3,
      inRun: ['coinage'],
      pool: [],
      hand: tilesFor('sx', 'h'),
      chain: chainFromMorphemes(['a', 'b', 'c', 'd']),
    };
    s = withCards(s, 'bank');
    s = reduce(s, { type: 'USE_CARD', instanceId: 'cbank0' }, c);
    s = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hS0'] }, c);
    s = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hX1'] }, c);
    s = reduce(s, { type: 'SUBMIT' }, c);
    const r = s.lastResult!;
    expect(r.passed).toBe(true);
    const by = Object.fromEntries(r.currencySources.map((x) => [x.source, x.amount]));
    expect(by['Round clear']).toBe(3);
    expect(by['Margin bonus']).toBe(E.marginBonus(r.score, r.threshold, b));
    expect(by['Natural streak']).toBe(4);
    expect(by['Natural word dividend']).toBe(E.naturalDividend(6, b));
    expect(by['Extension bonus payout']).toBe(1);
    expect(by['Coinage']).toBe(6);
    const beforeBank = 3 + by['Margin bonus']! + 4 + by['Natural word dividend']! + 1 + 6;
    expect(by['Bank (×2)']).toBe(beforeBank);
    expect(r.currencyEarned).toBe(beforeBank * 2);
    expect(s.currency).toBe(beforeBank * 2);
  });

  it('a card round breaks the streak: no streak bonus, no dividend on a non-natural chain', () => {
    let s = reduce(newRun(c), { type: 'START_ROUND' }, c);
    s = { ...s, round: 5, streak: 3, pool: [], hand: tilesFor('word', 'h'), chain: chainFromMorphemes(['a', 'b', 'c', 'd']) };
    s = withCards(s, 'hyphen');
    s = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hW0', 'hO1', 'hR2', 'hD3'], viaCard: 'chyphen0' }, c);
    s = reduce(s, { type: 'SUBMIT' }, c);
    const names = s.lastResult!.currencySources.map((x) => x.source);
    expect(names).not.toContain('Natural streak');
    expect(names).not.toContain('Natural word dividend');
    expect(s.streak).toBe(0);
  });

  it('the streak bonus is capped', () => {
    const flat = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1, thresholdGrowthByBlock: [1] } }));
    let s = reduce(newRun(flat), { type: 'START_ROUND' }, flat);
    s = { ...s, round: 9, streak: 8 };
    s = playFromHand(s, flat, 2, 'start');
    s = reduce(s, { type: 'SUBMIT' }, flat);
    expect(s.lastResult!.currencySources.find((x) => x.source === 'Natural streak')?.amount).toBe(b.economy.naturalStreakCap);
  });

  it('a failed round earns nothing', () => {
    const hard = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1_000_000 } }));
    let s = playFromHand(reduce(newRun(hard), { type: 'START_ROUND' }, hard), hard, 2, 'start');
    s = reduce(s, { type: 'SUBMIT' }, hard);
    expect(s.lastResult?.currencySources).toEqual([]);
    expect(s.currency).toBe(0);
  });

  it('threshold math for the margin uses the real threshold', () => {
    const r = S.scoreRegular({ round: 3, wordPoints: 30, morphemes: 3, strainCount: 0, extension: { front: 0, back: 1 }, inRunMult: 1 }, b);
    expect(E.marginBonus(r.score, r.threshold, b)).toBe(4); // 59 vs 9
  });

  it('boss pass pays the boss clear bonus only', () => {
    let s: RunState = { ...newRun(c, 3), round: 4, chain: chainFromMorphemes(['in', 'form', 'al']) };
    s = reduce(reduce(s, { type: 'START_ROUND' }, c), { type: 'START_BOSS' }, c);
    s = reduce(s, { type: 'END_BOSS', wordPoints: 1000 }, c);
    expect(s.lastResult?.currencySources).toEqual([{ source: 'Boss clear', amount: 5 }]);
  });
});
