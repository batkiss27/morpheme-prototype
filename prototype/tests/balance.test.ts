/** P1-01: balance mirrors the Scoring tab parameters used by the scenario. */
import { describe, expect, it } from 'vitest';
import { defaultBalance } from '../src/content';
import { scoring } from '../src/engine';
import scenario from './fixtures/scenario-24.json';

describe('balance', () => {
  it('matches the Scoring tab parameters', () => {
    const p = scenario.parameters;
    expect(defaultBalance.scoring.multiplierBase).toBe(p.multiplierBase);
    expect(defaultBalance.scoring.round1Threshold).toBe(p.round1Threshold);
    expect(defaultBalance.scoring.thresholdGrowthByBlock).toEqual(p.thresholdGrowthByBlock);
    expect(defaultBalance.scoring.bossThresholdFactor).toBe(p.bossThresholdFactor);
    expect(defaultBalance.scoring.strain).toBe(p.strain);
    expect(defaultBalance.scoring.bonusTwoSameSide).toBe(p.bonusTwoSameSide);
    expect(defaultBalance.scoring.bonusFrontBack).toBe(p.bonusFrontBack);
  });

  it('has the run shape from DESIGN.md §2.1', () => {
    expect(defaultBalance.rounds.total).toBe(24);
    expect(defaultBalance.rounds.bossEvery).toBe(4);
    expect(defaultBalance.hand.size).toBe(8);
    expect(defaultBalance.boss.feedIntervalMs).toHaveLength(6);
    expect(defaultBalance.boss.starterMorphemes).toHaveLength(6);
    expect(defaultBalance.economy.bossClear).toHaveLength(6);
  });

  it('unmodified play reaches the first boss: thresholds 4 / 5 / 6 / 23', () => {
    expect([1, 2, 3, 4].map((r) => scoring.threshold(r, defaultBalance))).toEqual([4, 5, 6, 23]);
  });

  it('Steep Curve risk modifier has four levels of scale and points', () => {
    expect(defaultBalance.preRun.steepCurve.thresholdScale).toHaveLength(4);
    expect(defaultBalance.preRun.steepCurve.loadoutPoints).toEqual([1, 2, 3, 4]);
  });

  it('shop prices and odds match the Shops tab', () => {
    expect(defaultBalance.shop.prices).toEqual({ basic: 3, uncommon: 5, exotic: 8, relic: 12 });
    const odds = Object.values(defaultBalance.shop.rarityOdds).reduce((a, b) => a + b, 0);
    expect(odds).toBeCloseTo(1, 9);
  });
});
