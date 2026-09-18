/**
 * P1-05: the Scoring tab scenario reproduced by the engine. Word points and
 * boss word points are inputs (as in the workbook); score and threshold per
 * round must match within ±1.
 */
import { describe, expect, it } from 'vitest';
import { defaultBalance } from '../src/content';
import { scoring as S } from '../src/engine';
import scenario from './fixtures/scenario-24.json';

type Row = (typeof scenario.rounds)[number];

const shape = (row: Row) =>
  row.bonus === 'two_same_side' ? { front: 0, back: 2 } : row.bonus === 'front_back' ? { front: 1, back: 1 } : { front: 0, back: 1 };

describe('scenario 24 (Scoring tab)', () => {
  const b = defaultBalance;
  const perBoss = scenario.parameters.inRunMultPerBoss;

  for (const row of scenario.rounds) {
    it(`round ${row.round} ${row.kind}: ${row.action}`, () => {
      // The workbook assumes one modest scoring modifier per boss beaten.
      const inRunMult = 1 + perBoss * S.bossesBefore(row.round, b);
      const r =
        row.kind === 'boss'
          ? S.scoreBoss({ round: row.round, bossWordPoints: row.bossWordPoints ?? 0, morphemes: row.morphemes, inRunMult }, b)
          : S.scoreRegular(
              {
                round: row.round,
                wordPoints: row.wordPoints ?? 0,
                morphemes: row.morphemes,
                strainCount: row.extensionCard ? 1 : 0,
                extension: shape(row),
                inRunMult,
              },
              b,
            );
      expect(r.effectiveMorphemes).toBe(row.expected.effectiveMorphemes);
      expect(r.morphemeMult).toBeCloseTo(row.expected.morphemeMult, 5);
      expect(r.extensionBonus).toBe(row.expected.extensionBonus);
      expect(r.inRunMult).toBeCloseTo(row.expected.inRunMult, 9);
      expect(Math.abs(r.score - row.expected.score)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.threshold - row.expected.threshold)).toBeLessThanOrEqual(1);
      expect(r.passed).toBe(row.expected.pass);
    });
  }

  it('records the workbook verdict: the no-modifier scenario passes 11 rounds and fails at B3', () => {
    expect(scenario.rounds).toHaveLength(24);
    expect(scenario.rounds.filter((r) => r.expected.pass)).toHaveLength(11);
    expect(scenario.rounds.find((r) => !r.expected.pass)?.round).toBe(12);
  });
});

describe('scenario 24 with Agglutination picked after B1 (P5-03)', () => {
  const b = defaultBalance;
  const perBoss = scenario.parameters.inRunMultPerBoss;
  const bonus = 0.03;

  for (const row of scenario.rounds.filter((r) => r.round >= 5)) {
    it(`round ${row.round}: base 1.5 from round 5 on`, () => {
      const inRunMult = 1 + perBoss * S.bossesBefore(row.round, b);
      const base = b.scoring.multiplierBase + bonus;
      const effM = Math.max(1, row.morphemes - (row.extensionCard ? 1 : 0));
      const r =
        row.kind === 'boss'
          ? S.scoreBoss({ round: row.round, bossWordPoints: row.bossWordPoints ?? 0, morphemes: row.morphemes, inRunMult, multiplierBase: base }, b)
          : S.scoreRegular(
              { round: row.round, wordPoints: row.wordPoints ?? 0, morphemes: row.morphemes, strainCount: row.extensionCard ? 1 : 0, extension: shape(row), inRunMult, multiplierBase: base },
              b,
            );
      const points = row.kind === 'boss' ? (row.bossWordPoints ?? 0) : (row.wordPoints ?? 0) * r.extensionBonus;
      expect(r.morphemeMult).toBeCloseTo(Math.pow(base, effM - 1), 9);
      expect(r.score).toBe(S.roundHalfUp(points * Math.pow(base, effM - 1) * inRunMult));
      expect(r.score).toBeGreaterThan(row.expected.score);
    });
  }
});
