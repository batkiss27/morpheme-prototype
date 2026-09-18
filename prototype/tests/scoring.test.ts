/** P1-04: every term of DESIGN.md §2.7 has a named test. */
import { describe, expect, it } from 'vitest';
import { defaultBalance } from '../src/content';
import { chain as C, scoring as S } from '../src/engine';
import { balanceWith, dict, tilesFor } from './helpers';

const b = defaultBalance;

describe('rounds and thresholds', () => {
  it('every 4th round is a boss round', () => {
    expect([1, 2, 3, 4, 5, 8, 23, 24].map((r) => S.isBossRound(r, b))).toEqual([false, false, false, true, false, true, false, true]);
    expect(S.bossNumber(4, b)).toBe(1);
    expect(S.bossNumber(24, b)).toBe(6);
    expect([1, 4, 5, 8, 9, 24].map((r) => S.bossesBefore(r, b))).toEqual([0, 0, 1, 1, 2, 5]);
  });

  it('threshold = round(T1 × Π growth(block) × bossFactor)', () => {
    expect(S.threshold(1, b)).toBe(4);
    expect(S.threshold(2, b)).toBe(6);
    expect(S.threshold(3, b)).toBe(9);
    expect(S.threshold(4, b)).toBe(41); // 13.5 × 3 = 40.5
    expect(S.threshold(5, b)).toBe(27); // 13.5 × 2
    expect(S.threshold(8, b)).toBe(648); // 13.5 × 2^4 × 3
    expect(S.threshold(12, b)).toBe(25313);
    expect(S.threshold(24, b)).toBe(192296887207);
    expect(S.growthFor(1, b)).toBe(1.5);
    expect(S.growthFor(5, b)).toBe(2);
    expect(S.growthFor(24, b)).toBe(5);
  });

  it('threshold responds to balance changes', () => {
    const steep = balanceWith({ scoring: { round1Threshold: 10, thresholdGrowthByBlock: [2], bossThresholdFactor: 3 } });
    expect(S.threshold(1, steep)).toBe(10);
    expect(S.threshold(3, steep)).toBe(40);
    expect(S.threshold(4, steep)).toBe(240);
    expect(S.threshold(9, steep)).toBe(2560); // a single-block table applies to every round
  });
});

describe('word points', () => {
  it('sums tile values over the whole chain, including value modifiers', () => {
    const c = C.createChain(tilesFor('form'), 1, dict('form'));
    if (!c.ok) throw new Error(c.error);
    expect(S.wordPoints(c.value)).toBe(9);
    const boosted = { ...c.value, tiles: c.value.tiles.map((t, i) => (i === 0 ? { ...t, modifiers: ['plus2' as const] } : t)) };
    expect(S.wordPoints(boosted)).toBe(11);
  });
});

describe('morpheme multiplier', () => {
  it('base^(effective − 1)', () => {
    expect(S.morphemeMultiplier(1, b)).toBe(1);
    expect(S.morphemeMultiplier(3, b)).toBeCloseTo(1.96, 9);
    expect(S.morphemeMultiplier(10, b)).toBeCloseTo(20.66, 1);
    expect(S.morphemeMultiplier(19, b)).toBeCloseTo(426.88, 1);
  });

  it('strain lowers the effective count by `strain` per card, never below 1', () => {
    expect(S.effectiveMorphemes(5, 0, b)).toBe(5);
    expect(S.effectiveMorphemes(5, 1, b)).toBe(4);
    expect(S.effectiveMorphemes(5, 2, b)).toBe(3);
    expect(S.effectiveMorphemes(1, 1, b)).toBe(1);
    expect(S.effectiveMorphemes(5, 1, balanceWith({ scoring: { strain: 2 } }))).toBe(3);
  });
});

describe('extension bonus', () => {
  it('classifies the shape of a round', () => {
    expect(S.extensionBonusKind({ front: 0, back: 1 })).toBe('none');
    expect(S.extensionBonusKind({ front: 1, back: 0 })).toBe('none');
    expect(S.extensionBonusKind({ front: 0, back: 2 })).toBe('two_same_side');
    expect(S.extensionBonusKind({ front: 2, back: 0 })).toBe('two_same_side');
    expect(S.extensionBonusKind({ front: 1, back: 1 })).toBe('front_back');
    expect(S.extensionBonusKind({ front: 1, back: 2 })).toBe('three_plus');
    expect(S.extensionBonusKind({ front: 0, back: 3 })).toBe('three_plus');
  });

  it('maps to the balance values', () => {
    expect(S.extensionBonus({ front: 0, back: 1 }, b)).toBe(1);
    expect(S.extensionBonus({ front: 0, back: 2 }, b)).toBe(1.5);
    expect(S.extensionBonus({ front: 1, back: 1 }, b)).toBe(2);
    expect(S.extensionBonus({ front: 2, back: 1 }, b)).toBe(3);
  });
});

describe('scoreRegular', () => {
  it('multiplies every term and rounds like the workbook', () => {
    const r = S.scoreRegular({ round: 17, wordPoints: 61, morphemes: 14, strainCount: 0, extension: { front: 0, back: 2 }, inRunMult: 1.8 }, b);
    expect(r.effectiveMorphemes).toBe(14);
    expect(r.extensionBonus).toBe(1.5);
    expect(r.score).toBe(13072);
    expect(r.threshold).toBe(2392031);
    expect(r.passed).toBe(false);
    expect(r.kind).toBe('regular');
  });

  it('applies strain and the in-run multiplier hook', () => {
    const r = S.scoreRegular({ round: 6, wordPoints: 23, morphemes: 5, strainCount: 1, extension: { front: 0, back: 1 }, inRunMult: 1.2 }, b);
    expect(r.effectiveMorphemes).toBe(4);
    expect(r.score).toBe(76);
  });

  it('adds flat bonuses after multiplication', () => {
    const r = S.scoreRegular({ round: 1, wordPoints: 9, morphemes: 1, strainCount: 0, extension: { front: 0, back: 1 }, inRunMult: 1, flatBonus: 5 }, b);
    expect(r.score).toBe(14);
    expect(r.flatBonus).toBe(5);
  });

  it('fails when below threshold', () => {
    const r = S.scoreRegular({ round: 3, wordPoints: 2, morphemes: 1, strainCount: 0, extension: { front: 0, back: 1 }, inRunMult: 1 }, b);
    expect(r.passed).toBe(false);
  });
});

describe('scoreBoss', () => {
  it('uses boss word points × morpheme mult × in-run mult, no extension bonus', () => {
    const r = S.scoreBoss({ round: 8, bossWordPoints: 52, morphemes: 6, inRunMult: 1.2 }, b);
    expect(r.score).toBe(336);
    expect(r.threshold).toBe(648);
    expect(r.extensionBonus).toBe(1);
    expect(r.kind).toBe('boss');
  });
});

describe('roundHalfUp', () => {
  it('rounds .5 up like Excel ROUND for positives', () => {
    expect(S.roundHalfUp(13.5)).toBe(14);
    expect(S.roundHalfUp(20.25)).toBe(20);
    expect(S.roundHalfUp(20.5)).toBe(21);
    expect(S.roundHalfUp(2.4999)).toBe(2);
  });
});
