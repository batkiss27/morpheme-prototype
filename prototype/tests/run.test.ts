/** P1-06: run reducer — every arrow in spec §5 plus the invariants. */
import { describe, expect, it } from 'vitest';
import { defaultBalance } from '../src/content';
import { allTiles, chain as C, lastError, reduce } from '../src/engine';
import type { RunState } from '../src/engine';
import { balanceWith, dict, tilesFor } from './helpers';
import { anyDict, makeContent, newRun, playBossRound, playFromHand, playRegularRound } from './run-driver';

const content = makeContent();
const start = (s: RunState) => reduce(s, { type: 'START_ROUND' }, content);

describe('createRun', () => {
  it('starts at ROUND_START of round 1 with a full pool', () => {
    const s = newRun(content, 7);
    expect(s.phase).toBe('ROUND_START');
    expect(s.round).toBe(1);
    expect(s.pool).toHaveLength(100);
    expect(s.hand).toEqual([]);
    expect(s.chain).toBeNull();
    expect(s.lives).toBe(0);
    expect(s.currency).toBe(0);
    expect(s.seed).toBe(7);
    expect(s.log).toEqual([]);
  });

  it('lives come from the loadout (Second Breath)', () => {
    const s = newRun(content, 1, { tileModifiers: [], categories: { second_breath: 2 } });
    expect(s.lives).toBe(2);
  });
});

describe('ROUND_START → EXTEND', () => {
  it('START_ROUND draws a hand', () => {
    const s = start(newRun(content));
    expect(s.phase).toBe('EXTEND');
    expect(s.hand).toHaveLength(defaultBalance.hand.size);
    expect(s.pool).toHaveLength(100 - defaultBalance.hand.size);
    expect(s.log).toHaveLength(1);
  });

  it('START_ROUND in the wrong phase is rejected and logged', () => {
    const s = start(start(newRun(content)));
    expect(s.phase).toBe('EXTEND');
    expect(lastError(s)).toMatch(/not allowed in phase EXTEND/);
    expect(s.log).toHaveLength(2);
  });
});

describe('EXTEND', () => {
  const realDict = dict('bear', 'bearable', 'unbearable');
  const real = makeContent(realDict);

  /** Round-1 state with a known hand (pool emptied so conservation still holds). */
  function withHand(word: string): RunState {
    const s = start(newRun(real));
    const hand = tilesFor(word, 'h');
    return { ...s, pool: [], hand };
  }

  it('the first PLAY_STEP creates the chain', () => {
    const s0 = withHand('bearxyz');
    const s = reduce(s0, { type: 'PLAY_STEP', side: 'start', tileIds: ['hB0', 'hE1', 'hA2', 'hR3'] }, real);
    expect(lastError(s)).toBeUndefined();
    expect(s.chain && C.text(s.chain)).toBe('bear');
    expect(s.hand.map((t) => t.letter)).toEqual(['X', 'Y', 'Z']);
    expect(s.steps).toHaveLength(1);
    expect(s.steps[0]?.word).toBe('bear');
  });

  it('the first step must use side "start"; later steps must be front/back', () => {
    const s0 = withHand('bearable');
    const bad = reduce(s0, { type: 'PLAY_STEP', side: 'back', tileIds: ['hB0', 'hE1', 'hA2', 'hR3'] }, real);
    expect(lastError(bad)).toMatch(/start/);
    const s1 = reduce(s0, { type: 'PLAY_STEP', side: 'start', tileIds: ['hB0', 'hE1', 'hA2', 'hR3'] }, real);
    const bad2 = reduce(s1, { type: 'PLAY_STEP', side: 'start', tileIds: ['hA4', 'hB5', 'hL6', 'hE7'] }, real);
    expect(lastError(bad2)).toMatch(/not a natural extension/);
  });

  it('an invalid step is rejected with the attempted word and leaves the hand intact', () => {
    const s1 = reduce(withHand('bearxyz'), { type: 'PLAY_STEP', side: 'start', tileIds: ['hB0', 'hE1', 'hA2', 'hR3'] }, real);
    const s2 = reduce(s1, { type: 'PLAY_STEP', side: 'back', tileIds: ['hX4', 'hY5'] }, real);
    expect(lastError(s2)).toContain('"bearxy"');
    expect(s2.hand).toEqual(s1.hand);
    expect(s2.chain).toEqual(s1.chain);
    expect(s2.steps).toHaveLength(1);
  });

  it('a tile not in hand is rejected', () => {
    const s = reduce(withHand('bear'), { type: 'PLAY_STEP', side: 'start', tileIds: ['nope'] }, real);
    expect(lastError(s)).toContain('nope');
  });

  it('a step via a card the player does not hold is rejected', () => {
    const s = reduce(withHand('bear'), { type: 'PLAY_STEP', side: 'start', tileIds: ['hB0', 'hE1', 'hA2', 'hR3'], viaCard: 'c99' }, real);
    expect(lastError(s)).toMatch(/not in your hand/);
  });

  it('UNDO_STEP restores the previous chain and hand', () => {
    const s1 = reduce(withHand('bearable'), { type: 'PLAY_STEP', side: 'start', tileIds: ['hB0', 'hE1', 'hA2', 'hR3'] }, real);
    const s2 = reduce(s1, { type: 'PLAY_STEP', side: 'back', tileIds: ['hA4', 'hB5', 'hL6', 'hE7'] }, real);
    expect(s2.chain && C.text(s2.chain)).toBe('bearable');
    const u1 = reduce(s2, { type: 'UNDO_STEP' }, real);
    expect(u1.chain).toEqual(s1.chain);
    expect(u1.hand).toEqual(s1.hand);
    expect(u1.steps).toHaveLength(1);
    const u2 = reduce(u1, { type: 'UNDO_STEP' }, real);
    expect(u2.chain).toBeNull();
    expect(u2.hand.map((t) => t.id)).toEqual(tilesFor('bearable', 'h').map((t) => t.id));
    const u3 = reduce(u2, { type: 'UNDO_STEP' }, real);
    expect(lastError(u3)).toMatch(/nothing to undo/);
  });

  it('SUBMIT needs at least one morpheme', () => {
    const s = reduce(start(newRun(content)), { type: 'SUBMIT' }, content);
    expect(s.phase).toBe('EXTEND');
    expect(lastError(s)).toMatch(/at least one morpheme/);
  });
});

describe('EXTEND → SCORED → SHOP → ROUND_START', () => {
  it('SUBMIT scores the round, returns the hand, and CONTINUE opens the shop', () => {
    let s = playFromHand(start(newRun(content)), content, 3, 'start');
    s = reduce(s, { type: 'SUBMIT' }, content);
    expect(s.phase).toBe('SCORED');
    expect(s.hand).toEqual([]);
    expect(s.pool).toHaveLength(97);
    expect(s.chain?.tiles).toHaveLength(3);
    const r = s.lastResult;
    expect(r?.round).toBe(1);
    expect(r?.morphemes).toBe(1);
    expect(r?.threshold).toBe(4);
    expect(r?.outcome).toBe(r?.passed ? 'pass' : 'game_over');
    if (r?.passed) {
      expect(r.currencySources[0]).toEqual({ source: 'Round clear', amount: defaultBalance.economy.roundClear });
      expect(s.currency).toBe(r.currencyEarned);
      expect(s.streak).toBe(1);
      s = reduce(s, { type: 'CONTINUE' }, content);
      expect(s.phase).toBe('SHOP');
      expect(s.shop?.offers).toHaveLength(defaultBalance.shop.cardSlots);
      s = reduce(s, { type: 'LEAVE' }, content);
      expect(s.phase).toBe('ROUND_START');
      expect(s.round).toBe(2);
      expect(s.shop).toBeNull();
    }
  });

  it('round 2 extends the existing chain and counts both morphemes', () => {
    const easy = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));
    let s = playRegularRound(newRun(easy), easy, 3);
    s = start(s);
    s = playFromHand(s, easy, 2, 'back');
    s = reduce(s, { type: 'SUBMIT' }, easy);
    expect(s.lastResult?.morphemes).toBe(2);
    expect(s.lastResult?.morphemeMult).toBeCloseTo(1.4, 9);
    expect(s.chain?.tiles).toHaveLength(5);
  });

  it('front + back in one round earns the ×2 bonus', () => {
    const easy = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));
    let s = playRegularRound(newRun(easy), easy, 2);
    s = start(s);
    s = playFromHand(s, easy, 1, 'back');
    s = playFromHand(s, easy, 1, 'front');
    s = reduce(s, { type: 'SUBMIT' }, easy);
    expect(s.lastResult?.extensionBonus).toBe(2);
    expect(s.lastResult?.morphemes).toBe(3);
  });
});

describe('failing a threshold', () => {
  const hard = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1_000_000 } }));

  it('without lives → game_over → GAME_OVER', () => {
    let s = playFromHand(start(newRun(hard)), hard, 2, 'start');
    s = reduce(s, { type: 'SUBMIT' }, hard);
    expect(s.lastResult?.passed).toBe(false);
    expect(s.lastResult?.outcome).toBe('game_over');
    expect(s.currency).toBe(0);
    s = reduce(s, { type: 'CONTINUE' }, hard);
    expect(s.phase).toBe('GAME_OVER');
    expect(lastError(reduce(s, { type: 'START_ROUND' }, hard))).toBeTruthy();
  });

  it('with a life → life lost, no shop, next round', () => {
    let s = start(newRun(hard, 1, { tileModifiers: [], categories: { second_breath: 1 } }));
    s = playFromHand(s, hard, 2, 'start');
    s = reduce(s, { type: 'SUBMIT' }, hard);
    expect(s.lastResult?.outcome).toBe('life_lost');
    expect(s.lives).toBe(0);
    expect(s.streak).toBe(0);
    s = reduce(s, { type: 'CONTINUE' }, hard);
    expect(s.phase).toBe('ROUND_START');
    expect(s.round).toBe(2);
    expect(s.chain?.tiles).toHaveLength(2); // the word still grew
  });
});

describe('FORFEIT', () => {
  it('scores 0, fails, discards this round\'s steps and returns the hand', () => {
    const easy = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));
    let s = playRegularRound(newRun(easy), easy, 3);
    s = start(s);
    s = playFromHand(s, easy, 2, 'back'); // a step the player then abandons
    const before = s.chain;
    s = reduce(s, { type: 'FORFEIT' }, easy);
    expect(s.phase).toBe('SCORED');
    expect(s.lastResult?.score).toBe(0);
    expect(s.lastResult?.passed).toBe(false);
    expect(s.lastResult?.outcome).toBe('game_over');
    expect(s.chain?.tiles).toHaveLength(3);
    expect(s.chain).not.toEqual(before);
    expect(s.hand).toEqual([]);
    expect(allTiles(s)).toHaveLength(100);
    expect(s.steps).toEqual([]);
    s = reduce(s, { type: 'CONTINUE' }, easy);
    expect(s.phase).toBe('GAME_OVER');
  });

  it('with a life: loses it and moves on', () => {
    const easy = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));
    let s = start(newRun(easy, 1, { tileModifiers: [], categories: { second_breath: 1 } }));
    s = reduce(s, { type: 'FORFEIT' }, easy);
    expect(s.lastResult?.outcome).toBe('life_lost');
    expect(s.chain).toBeNull();
    s = reduce(s, { type: 'CONTINUE' }, easy);
    expect(s.phase).toBe('ROUND_START');
    expect(s.round).toBe(2);
  });

  it('is only allowed in EXTEND', () => {
    expect(lastError(reduce(newRun(content), { type: 'FORFEIT' }, content))).toBeTruthy();
  });
});

describe('boss rounds (stubbed)', () => {
  const easy = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));

  function toRound4(): RunState {
    let s = newRun(easy);
    for (let i = 0; i < 3; i++) s = playRegularRound(s, easy);
    expect(s.round).toBe(4);
    return s;
  }

  it('ROUND_START on a boss round → BOSS_INTRO → BOSS_PLAY → BOSS_END → BOSS_REWARD → ROUND_START', () => {
    let s = start(toRound4());
    expect(s.phase).toBe('BOSS_INTRO');
    expect(s.boss).toMatchObject({ bossNumber: 1, wordPoints: 0, rules: null });
    expect(s.hand).toEqual([]);
    s = reduce(s, { type: 'START_BOSS' }, easy);
    expect(s.phase).toBe('BOSS_PLAY');
    expect(s.boss?.rules).not.toBeNull();
    s = reduce(s, { type: 'BOSS_TICK', ms: 16 }, easy);
    expect(lastError(s)).toBeUndefined();
    const currencyBefore = s.currency;
    s = reduce(s, { type: 'END_BOSS', wordPoints: 1000 }, easy);
    expect(s.phase).toBe('BOSS_END');
    expect(s.lastResult?.kind).toBe('boss');
    expect(s.lastResult?.passed).toBe(true);
    expect(s.lastResult?.threshold).toBe(10); // 1 × 1.5^3 × 3 = 10.125
    expect(s.currency).toBe(currencyBefore + easy.balance.economy.bossClear[0]!);
    s = reduce(s, { type: 'CONTINUE' }, easy);
    expect(s.phase).toBe('BOSS_REWARD');
    const pick = s.boss!.reward!.offers[0]!;
    s = reduce(s, { type: 'PICK_MODIFIER', id: pick }, easy);
    expect(s.inRun).toEqual([pick]);
    expect(s.phase).toBe('ROUND_START');
    expect(s.round).toBe(5);
    expect(s.boss).toBeNull();
  });

  it('END_BOSS takes word points as input; failing with a life retries the same boss (D1)', () => {
    let s = toRound4();
    s = { ...s, lives: 1 };
    s = reduce(start(s), { type: 'START_BOSS' }, easy);
    s = reduce(s, { type: 'END_BOSS', wordPoints: 0 }, easy);
    expect(s.lastResult?.passed).toBe(false);
    expect(s.lastResult?.outcome).toBe('life_lost');
    expect(s.boss?.wordPoints).toBe(0);
    s = reduce(s, { type: 'CONTINUE' }, easy);
    expect(s.phase).toBe('ROUND_START');
    expect(s.round).toBe(4);
    expect(s.lives).toBe(0);
  });

  it('failing a boss without a life ends the run', () => {
    let s = reduce(start(toRound4()), { type: 'START_BOSS' }, easy);
    s = reduce(s, { type: 'END_BOSS', wordPoints: 0 }, easy);
    s = reduce(s, { type: 'CONTINUE' }, easy);
    expect(s.phase).toBe('GAME_OVER');
  });

  it('boss actions are rejected outside their phases', () => {
    const s = start(newRun(easy));
    expect(lastError(reduce(s, { type: 'START_BOSS' }, easy))).toBeTruthy();
    expect(lastError(reduce(s, { type: 'BOSS_TICK', ms: 1 }, easy))).toBeTruthy();
    expect(lastError(reduce(s, { type: 'END_BOSS' }, easy))).toBeTruthy();
    expect(lastError(reduce(s, { type: 'PICK_MODIFIER' }, easy))).toBeTruthy();
    expect(lastError(reduce(s, { type: 'LEAVE' }, easy))).toBeTruthy();
    expect(lastError(reduce(s, { type: 'CONTINUE' }, easy))).toBeTruthy();
  });
});

describe('WIN', () => {
  it('passing the final boss wins the run', () => {
    const short = makeContent(anyDict, balanceWith({ rounds: { total: 4 }, scoring: { round1Threshold: 1 } }));
    let s = newRun(short);
    for (let i = 0; i < 3; i++) s = playRegularRound(s, short);
    s = playBossRound(s, short);
    expect(s.phase).toBe('WIN');
    expect(s.round).toBe(4);
  });
});

describe('invariants', () => {
  it('tiles are conserved across a whole 24-round run', () => {
    const easy = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1, thresholdGrowth: 1 } }));
    let s = newRun(easy, 123);
    const check = (st: RunState) => {
      const ids = allTiles(st).map((t) => t.id);
      const expected = 100 + (st.inRun.includes('blank_slate') ? 2 : 0); // Blank Slate adds two tiles
      expect(ids).toHaveLength(expected);
      expect(new Set(ids).size).toBe(expected);
    };
    for (let guard = 0; guard < 30 && s.phase !== 'WIN' && s.phase !== 'GAME_OVER'; guard++) {
      s = s.round % 4 === 0 ? playBossRound(s, easy) : playRegularRound(s, easy);
      check(s);
    }
    expect(s.phase).toBe('WIN');
    expect(s.chain?.morphemes).toHaveLength(18);
    expect(s.log.every((e) => !e.error)).toBe(true);
  });

  it('reduce is pure: same (state, action) → equal state, input untouched', () => {
    const s = start(newRun(content, 9));
    const before = JSON.stringify(s);
    const a = reduce(s, { type: 'PLAY_STEP', side: 'start', tileIds: s.hand.slice(0, 2).map((t) => t.id), playedAs: { [s.hand[0]!.id]: 'E', [s.hand[1]!.id]: 'E' } }, content);
    const b = reduce(s, { type: 'PLAY_STEP', side: 'start', tileIds: s.hand.slice(0, 2).map((t) => t.id), playedAs: { [s.hand[0]!.id]: 'E', [s.hand[1]!.id]: 'E' } }, content);
    expect(a).toEqual(b);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('the log records one event per action, including rejected ones', () => {
    let s = newRun(content);
    s = reduce(s, { type: 'SUBMIT' }, content); // rejected
    s = start(s);
    expect(s.log.map((e) => [e.action.type, e.error !== undefined])).toEqual([
      ['SUBMIT', true],
      ['START_ROUND', false],
    ]);
    expect(s.log.map((e) => e.seq)).toEqual([0, 1]);
  });
});
