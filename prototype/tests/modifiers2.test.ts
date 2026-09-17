/** P8-03: the remaining in-run modifiers. */
import { describe, expect, it } from 'vitest';
import { defaultBalance } from '../src/content';
import { createRun, lastError, modifiers as M, reduce, scoringInputs } from '../src/engine';
import type { RunState } from '../src/engine';
import { balanceWith, chainFromMorphemes, content, tilesFor, withCards } from './helpers';
import { anyDict, makeContent, newRun, playFromHand, playRegularRound } from './run-driver';

const easy = balanceWith({ scoring: { round1Threshold: 1 } });

function at(words: string[], morphemes: string[], hand: string, mods: string[], round = morphemes.length + 1) {
  const c = content(words, easy);
  let s = reduce(newRun(c), { type: 'START_ROUND' }, c);
  s = { ...s, round, pool: [], hand: tilesFor(hand, 'h'), chain: chainFromMorphemes(morphemes), inRun: mods };
  return { s, c };
}
const inputs = (mods: string[], morphemes: string[], round?: number) => {
  const { s, c } = at([], morphemes, 'x', mods, round);
  return scoringInputs(s, c);
};

describe('Basic', () => {
  it('Consonant Cluster: +15 per run of 3+ consonants', () => {
    expect(inputs(['consonant_cluster'], ['str', 'ength']).flatBonus).toBe(30); // str, ngth
    expect(inputs(['consonant_cluster'], ['area']).flatBonus).toBe(0);
  });
  it('Long Form: +10 per morpheme of 5+ letters', () => {
    expect(inputs(['long_form'], ['inter', 'nation', 'al']).flatBonus).toBe(20);
  });
  it('Bonus Draw: hand +1', () => {
    const c = makeContent(anyDict, easy);
    const s = reduce({ ...newRun(c), inRun: ['bonus_draw'] }, { type: 'START_ROUND' }, c);
    expect(s.hand).toHaveLength(defaultBalance.hand.size + 1);
  });
  it('Blank Slate adds two blanks when acquired', () => {
    const c = makeContent(anyDict, easy);
    const s = M.onAcquire({ ...newRun(c), inRun: ['blank_slate'] }, c, 'blank_slate');
    expect(s.pool.filter((t) => t.letter === '_')).toHaveLength(4);
    expect(new Set(s.pool.map((t) => t.id)).size).toBe(102);
  });
});

describe('Uncommon', () => {
  it('Reduplication (modifier): a new morpheme repeating an existing one scores twice', () => {
    expect(inputs(['reduplication_mod'], ['bye', 'bye'], 2).perMorpheme.map((p) => p.mult)).toEqual([1, 2]);
    expect(inputs(['reduplication_mod'], ['bye', 'bye'], 5).perMorpheme.map((p) => p.mult)).toEqual([1, 1]);
  });
  it('Incorporation: tiles ≥ 8 get +1 per morpheme', () => {
    const r = inputs(['incorporation'], ['qi', 'ab', 'cd']);
    expect(r.perMorpheme[0]!.points).toBe(10 + 1 + 3); // q(10)+i(1) + 1×3 morphemes
  });
  it('Two-Step raises the same-side bonus to ×2', () => {
    const c = makeContent(anyDict, easy);
    expect(M.extensionBonus({ ...newRun(c), inRun: ['two_step'] }, c, 'two_same_side', 1.5)).toBe(2);
    expect(M.extensionBonus({ ...newRun(c), inRun: ['two_step'] }, c, 'front_back', 2)).toBe(2);
  });
  it('Streak Keeper: the first card per cycle keeps the streak', () => {
    const { s, c } = at(['word', 'ward'], ['bear'], 'wordward', ['streak_keeper']);
    let t = withCards({ ...s, streak: 3 }, 'hyphen', 'hyphen');
    t = reduce(t, { type: 'PLAY_STEP', side: 'back', tileIds: ['hW0', 'hO1', 'hR2', 'hD3'], viaCard: 'chyphen0' }, c);
    t = reduce(t, { type: 'SUBMIT' }, c);
    expect(t.streak).toBe(4);
    expect(t.modifierState.streak_keeper_cycle).toBe(0);
    // second card in the same cycle breaks it
    const { s: s2, c: c2 } = at(['word'], ['bear'], 'word', ['streak_keeper']);
    let u = withCards({ ...s2, streak: 4, modifierState: { streak_keeper_cycle: 0 } }, 'hyphen');
    u = reduce(u, { type: 'PLAY_STEP', side: 'back', tileIds: ['hW0', 'hO1', 'hR2', 'hD3'], viaCard: 'chyphen0' }, c2);
    u = reduce(u, { type: 'SUBMIT' }, c2);
    expect(u.streak).toBe(0);
  });
  it('Discount and Free Reroll in the shop', () => {
    const c = makeContent(anyDict, easy);
    let s = playRegularRound({ ...newRun(c), inRun: ['discount', 'free_reroll'] }, c, 2);
    s = reduce(s, { type: 'START_ROUND' }, c);
    s = playFromHand(s, c, 1, 'back');
    s = reduce(reduce(s, { type: 'SUBMIT' }, c), { type: 'CONTINUE' }, c);
    expect(s.shop!.offers.every((o) => o.price === Math.ceil(c.cards.find((x) => x.id === o.cardId)!.price * 0.85))).toBe(true);
    expect(s.shop!.freeRerolls).toBe(1);
    const before = s.currency;
    s = reduce(s, { type: 'REROLL' }, c);
    expect(s.currency).toBe(before);
    expect(s.shop!.freeRerolls).toBe(0);
    expect(s.shop!.rerolls).toBe(0);
    s = reduce({ ...s, currency: 10 }, { type: 'REROLL' }, c);
    expect(s.currency).toBe(10 - Math.ceil(2 * 0.85));
  });
  it('Boss Bounty pays per word placed; Feed Slow slows the feed; Second Chance adds a life', () => {
    const c = makeContent(anyDict, easy);
    let s: RunState = { ...newRun(c), round: 4, chain: chainFromMorphemes(['in', 'form', 'al']), inRun: ['boss_bounty', 'feed_slow'] };
    s = reduce(reduce(s, { type: 'START_ROUND' }, c), { type: 'START_BOSS' }, c);
    const mod = c.bossModifiers.find((m) => m.id === s.boss?.modifierId);
    const baseFeed = mod?.hookId === 'rapid_feed' ? Math.round(4000 / 1.5) : 4000;
    expect(s.boss?.rules?.feedIntervalMs).toBe(Math.round(baseFeed * 1.2));
    s = { ...s, boss: { ...s.boss!, words: [{ word: 'a', crossWords: [], points: 1, atMs: 0 }, { word: 'b', crossWords: [], points: 1, atMs: 0 }] } };
    s = reduce(s, { type: 'END_BOSS', wordPoints: 1000 }, c);
    expect(s.lastResult?.currencySources).toEqual([{ source: 'Boss clear', amount: 5 }, { source: 'Boss Bounty', amount: 4 }]);
    expect(M.onAcquire({ ...newRun(c), inRun: ['second_chance'] }, c, 'second_chance').lives).toBe(1);
  });
  it('Heavy Metal: +2 per tile worth 4+', () => {
    const r = inputs(['heavy_metal'], ['fox']); // f4 o1 x8 → 13 + 2×2
    expect(r.wordPoints).toBe(17);
  });
});

describe('Exotic', () => {
  it('Sesquipedalian ×1.5 at 20+ letters', () => {
    expect(inputs(['sesquipedalian'], ['abcdefghij', 'klmnopqrst']).inRunMult).toBe(1.5);
    expect(inputs(['sesquipedalian'], ['abc']).inRunMult).toBe(1);
  });
  it('Overflow: newest tile discarded, round continues', () => {
    const c = makeContent(anyDict, easy);
    let s: RunState = { ...newRun(c), round: 4, chain: chainFromMorphemes(['in', 'form', 'al']), inRun: ['overflow'] };
    s = reduce(reduce(s, { type: 'START_ROUND' }, c), { type: 'START_BOSS' }, c);
    expect(s.boss?.rules).toMatchObject({ overflowEnds: false, overflowDiscards: 'newest' });
  });
  it('Affixer: front morphemes ×1.5', () => {
    const { s, c } = at([], ['bear'], 'x', ['affixer']);
    const chain = { ...s.chain!, morphemes: [{ ...s.chain!.morphemes[0]!, side: 'front' as const }] };
    expect(scoringInputs({ ...s, chain }, c).perMorpheme[0]!.mult).toBe(1.5);
  });
  it('Milestone Keeper opens the shop slot every time', () => {
    const c = makeContent(anyDict, easy);
    let s = playRegularRound({ ...newRun(c), inRun: ['milestone_keeper'] }, c, 2);
    s = reduce(s, { type: 'START_ROUND' }, c);
    s = playFromHand(s, c, 1, 'back');
    s = reduce(reduce(s, { type: 'SUBMIT' }, c), { type: 'CONTINUE' }, c);
    expect(s.shop!.inRunOffer).not.toBeNull();
  });
  it('Double Time: boss timer +50%', () => {
    const c = makeContent(anyDict, easy);
    let s: RunState = { ...newRun(c), round: 4, chain: chainFromMorphemes(['in', 'form', 'al']), inRun: ['double_time'] };
    s = reduce(reduce(s, { type: 'START_ROUND' }, c), { type: 'START_BOSS' }, c);
    const mod = c.bossModifiers.find((m) => m.id === s.boss?.modifierId);
    const baseTimer = mod?.hookId === 'half_time' ? 63_000 : 90_000;
    expect(s.boss?.rules?.timerMs).toBe(Math.round(baseTimer * 1.5));
  });
});

describe('Relic', () => {
  it('Polysynthesis: base +0.015', () => {
    expect(inputs(['polysynthesis'], ['bear']).base).toBeCloseTo(1.415, 9);
  });
  it('Palindrome: a palindromic new morpheme doubles the round', () => {
    expect(inputs(['palindrome'], ['bear', 'ana'], 2).inRunMult).toBe(2);
    expect(inputs(['palindrome'], ['bear', 'ana'], 7).inRunMult).toBe(1);
    expect(inputs(['palindrome'], ['bear', 's'], 2).inRunMult).toBe(1);
  });
  it('Immortal Word ignores one failed threshold, then never again', () => {
    const hard = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1_000_000 } }));
    let s = { ...reduce(newRun(hard), { type: 'START_ROUND' }, hard), inRun: ['immortal_word'] };
    s = playFromHand(s, hard, 2, 'start');
    s = reduce(s, { type: 'SUBMIT' }, hard);
    expect(s.lastResult?.outcome).toBe('pass');
    expect(s.lastResult?.notes).toContain('Immortal Word ignored the failed threshold');
    expect(s.lives).toBe(0);
    s = reduce(s, { type: 'CONTINUE' }, hard);
    expect(s.phase).toBe('SHOP');
    s = reduce(reduce(s, { type: 'LEAVE' }, hard), { type: 'START_ROUND' }, hard);
    s = playFromHand(s, hard, 1, 'back');
    s = reduce(s, { type: 'SUBMIT' }, hard);
    expect(s.lastResult?.outcome).toBe('game_over');
    expect(lastError(s)).toBeUndefined();
  });
});

describe('acquiring through rewards runs onAcquire', () => {
  it('Second Chance picked as a reward adds a life', () => {
    const c = makeContent(anyDict, easy);
    let s: RunState = { ...newRun(c), round: 4, chain: chainFromMorphemes(['in', 'form', 'al']) };
    s = reduce(reduce(s, { type: 'START_ROUND' }, c), { type: 'START_BOSS' }, c);
    s = reduce(s, { type: 'END_BOSS', wordPoints: 1000 }, c);
    s = reduce(s, { type: 'CONTINUE' }, c);
    s = { ...s, boss: { ...s.boss!, reward: { offers: ['second_chance'], picksLeft: 1 } } };
    s = reduce(s, { type: 'PICK_MODIFIER', id: 'second_chance' }, c);
    expect(s.lives).toBe(1);
    void createRun;
  });
});
