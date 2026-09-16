/** P6-01 … P6-03: debug actions, live balance override, export v2 and round history. */
import { describe, expect, it } from 'vitest';
import { defaultBalance } from '../src/content';
import { exportRun, lastError, parseRunExport, reduce, replay, replayWithHistory, scoring } from '../src/engine';
import { balanceWith } from './helpers';
import { anyDict, makeContent, newRun, playBossRound, playFromHand, playRegularRound } from './run-driver';

const content = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));

describe('DEBUG actions', () => {
  it('currency, lives, card, modifier', () => {
    let s = newRun(content);
    s = reduce(s, { type: 'DEBUG', op: { kind: 'currency', amount: 25 } }, content);
    s = reduce(s, { type: 'DEBUG', op: { kind: 'lives', lives: 2 } }, content);
    s = reduce(s, { type: 'DEBUG', op: { kind: 'card', cardId: 'hyphen' } }, content);
    s = reduce(s, { type: 'DEBUG', op: { kind: 'modifier', id: 'coinage' } }, content);
    expect(s.currency).toBe(25);
    expect(s.lives).toBe(2);
    expect(s.cards).toEqual([{ instanceId: 'c0', cardId: 'hyphen' }]);
    expect(s.inRun).toEqual(['coinage']);
    expect(reduce(s, { type: 'DEBUG', op: { kind: 'currency', amount: -100 } }, content).currency).toBe(0);
    expect(lastError(reduce(s, { type: 'DEBUG', op: { kind: 'card', cardId: 'nope' } }, content))).toMatch(/unknown card/);
    expect(lastError(reduce(s, { type: 'DEBUG', op: { kind: 'modifier', id: 'coinage' } }, content))).toMatch(/already held/);
    expect(s.log.every((e) => e.action.type === 'DEBUG')).toBe(true);
  });

  it('skip to round N abandons the round in progress and keeps tiles conserved', () => {
    let s = reduce(newRun(content), { type: 'START_ROUND' }, content);
    s = playFromHand(s, content, 2, 'start');
    s = reduce(s, { type: 'DEBUG', op: { kind: 'round', round: 8 } }, content);
    expect(s.round).toBe(8);
    expect(s.phase).toBe('ROUND_START');
    expect(s.hand).toEqual([]);
    expect(s.pool.length + (s.chain?.tiles.length ?? 0)).toBe(100);
    expect(lastError(reduce(s, { type: 'DEBUG', op: { kind: 'round', round: 99 } }, content))).toMatch(/1\.\.24/);
    s = reduce(s, { type: 'START_ROUND' }, content);
    expect(s.phase).toBe('BOSS_INTRO');
    expect(s.boss?.bossNumber).toBe(2);
  });

  it('force boss modifier at the intro only', () => {
    let s = reduce(newRun(content), { type: 'DEBUG', op: { kind: 'round', round: 4 } }, content);
    expect(lastError(reduce(s, { type: 'DEBUG', op: { kind: 'boss_modifier', id: 'fog' } }, content))).toMatch(/boss intro/);
    s = reduce(s, { type: 'START_ROUND' }, content);
    s = reduce(s, { type: 'DEBUG', op: { kind: 'boss_modifier', id: 'fog' } }, content);
    expect(s.boss?.modifierId).toBe('fog');
    expect(lastError(reduce(s, { type: 'DEBUG', op: { kind: 'boss_modifier', id: 'nope' } }, content))).toMatch(/unknown/);
    expect(reduce(s, { type: 'START_BOSS' }, content).boss?.rules?.hideQueue).toBe(true);
  });

  it('a balance override applies to the next action and travels in the export', () => {
    const steep = balanceWith({ scoring: { round1Threshold: 1000 } });
    let s = reduce(newRun(content), { type: 'DEBUG', op: { kind: 'balance', balance: steep } }, content);
    s = reduce(s, { type: 'START_ROUND' }, content);
    s = playFromHand(s, content, 2, 'start');
    s = reduce(s, { type: 'SUBMIT' }, content);
    expect(s.lastResult?.threshold).toBe(scoring.threshold(1, steep));
    expect(s.lastResult?.passed).toBe(false);
    // replaying with the *original* content reproduces it because the override is an action
    expect(replay(exportRun(s), content)).toEqual(s);
  });
});

describe('export v2', () => {
  it('carries the starting balance and replays with it', () => {
    const tuned = balanceWith({ scoring: { round1Threshold: 1, multiplierBase: 2 } });
    const c = makeContent(anyDict, tuned);
    let s = newRun(c, 4);
    for (let i = 0; i < 2; i++) s = playRegularRound(s, c);
    const exp = exportRun(s, tuned);
    expect(exp.version).toBe(2);
    expect(exp.balance).toEqual(tuned);
    // replay against default content still reproduces the run
    expect(replay(exp, makeContent(anyDict, defaultBalance))).toEqual(s);
    expect(parseRunExport(JSON.stringify(exp)).balance).toEqual(tuned);
  });

  it('still accepts a v1 export', () => {
    const s = playRegularRound(newRun(content, 4), content);
    const exp = { ...exportRun(s), version: 1 };
    expect(replay(exp, content)).toEqual(s);
  });

  it('replayWithHistory summarises every scored round with the cards used', () => {
    let t = reduce(newRun(content, 6), { type: 'DEBUG', op: { kind: 'card', cardId: 'bank' } }, content);
    t = reduce(t, { type: 'START_ROUND' }, content);
    t = reduce(t, { type: 'USE_CARD', instanceId: 'c0' }, content);
    t = playFromHand(t, content, 2, 'start');
    t = reduce(t, { type: 'SUBMIT' }, content);
    t = reduce(reduce(t, { type: 'CONTINUE' }, content), { type: 'LEAVE' }, content);
    for (let i = 0; i < 2; i++) t = playRegularRound(t, content);
    t = playBossRound(t, content, 500);
    const { state, history } = replayWithHistory(exportRun(t), content);
    expect(state).toEqual(t);
    expect(history.map((h) => [h.round, h.kind, h.passed])).toEqual([
      [1, 'regular', true],
      [2, 'regular', true],
      [3, 'regular', true],
      [4, 'boss', true],
    ]);
    expect(history[0]?.cardsUsed).toEqual(['Bank']);
    expect(history[1]?.cardsUsed).toEqual([]);
    expect(history[0]?.margin).toBe(history[0]!.score - history[0]!.threshold);
    expect(history[3]?.currencyEarned).toBe(5);
    expect(history[0]?.chain.length).toBe(2);
  });
});
