/** P5-01, P5-02, P5-03, P5-05, P5-07: in-run modifiers, rewards, conditional slot, secret words. */
import { describe, expect, it } from 'vitest';
import { defaultBalance, inRunModifiers } from '../src/content';
import { chain as C, economy, lastError, modifiers as M, reduce, reward as R, rng, scoring as S, scoringInputs } from '../src/engine';
import type { InRunModifierSpec, RunState } from '../src/engine';
import { balanceWith, chainFromMorphemes, content, dict, tilesFor, withCards } from './helpers';
import { anyDict, makeContent, newRun, playFromHand, playRegularRound } from './run-driver';

const easy = balanceWith({ scoring: { round1Threshold: 1 } });

/** EXTEND state at round `round` with a known chain and hand, holding the given modifiers. */
function withMods(words: string[], chainMorphemes: string[], hand: string, mods: string[], round = chainMorphemes.length + 1) {
  const c = content(words, easy);
  let s = reduce(newRun(c), { type: 'START_ROUND' }, c);
  s = { ...s, round, pool: [], hand: tilesFor(hand, 'h'), chain: chainFromMorphemes(chainMorphemes), inRun: mods };
  return { s, c };
}

describe('registry (P5-01)', () => {
  it('validates content and rejects unknown hooks / duplicates', () => {
    expect(() => M.validateInRunModifiers(inRunModifiers)).not.toThrow();
    expect(inRunModifiers).toHaveLength(12);
    const bad = { ...inRunModifiers[0]!, id: 'x', hookId: 'nope' as InRunModifierSpec['hookId'] };
    expect(() => M.validateInRunModifiers([bad])).toThrow(/unknown hook/);
    expect(() => M.validateInRunModifiers([inRunModifiers[0]!, inRunModifiers[0]!])).toThrow(/duplicate/);
  });

  it('active hooks run in acquisition order and unknown ids are skipped', () => {
    const c = makeContent(anyDict, easy);
    const s: RunState = { ...newRun(c), inRun: ['mirror', 'ghost', 'agglutination'] };
    expect(M.active(s, c).map((a) => a.spec.id)).toEqual(['mirror', 'agglutination']);
    const s2: RunState = { ...s, inRun: ['agglutination', 'mirror'] };
    expect(M.active(s2, c).map((a) => a.spec.id)).toEqual(['agglutination', 'mirror']);
    // folding is deterministic: same state → same numbers
    expect(M.multiplierBase(s, c)).toBe(M.multiplierBase(s, c));
    expect(M.multiplierBase(s, c)).toBeCloseTo(1.43, 9);
  });
});

describe('scoring modifiers (P5-03)', () => {
  const inputs = (mods: string[], morphemes = ['un', 'bear', 'able'], round = 4) => {
    const { s, c } = withMods([], morphemes, 'x', mods, round);
    return scoringInputs(s, c);
  };

  it('Suffix Bias doubles the tail morpheme', () => {
    const r = inputs(['suffix_bias']);
    expect(r.perMorpheme.map((p) => p.mult)).toEqual([1, 1, 2]);
    expect(r.wordPoints).toBe(S.wordPoints(chainFromMorphemes(['un', 'bear'])) + 2 * S.wordPoints(chainFromMorphemes(['able'])));
    expect(r.notes[0]).toMatch(/"able" scores ×2/);
  });

  it('Prefix Bias doubles the head morpheme; both stack on a one-morpheme word', () => {
    expect(inputs(['prefix_bias']).perMorpheme.map((p) => p.mult)).toEqual([2, 1, 1]);
    expect(inputs(['prefix_bias', 'suffix_bias'], ['bear']).perMorpheme.map((p) => p.mult)).toEqual([4]);
  });

  it('Inflection doubles morphemes of 1–2 letters', () => {
    expect(inputs(['inflection'], ['sing', 'er', 's']).perMorpheme.map((p) => p.mult)).toEqual([1, 2, 2]);
  });

  it('Vowel Harmony doubles the new morpheme when its vowels already appear in the word', () => {
    // chain: bear|able (round 2) — "able" adds a, e which "bear" has → ×2
    expect(inputs(['vowel_harmony'], ['bear', 'able'], 2).perMorpheme.map((p) => p.mult)).toEqual([1, 2]);
    // "ism" adds i, which "bear|able" lacks → no bonus
    expect(inputs(['vowel_harmony'], ['bear', 'able', 'ism'], 3).perMorpheme.map((p) => p.mult)).toEqual([1, 1, 1]);
    // only the morpheme added this round qualifies
    expect(inputs(['vowel_harmony'], ['bear', 'able'], 9).perMorpheme.map((p) => p.mult)).toEqual([1, 1]);
    // a morpheme with no vowels is unaffected
    expect(inputs(['vowel_harmony'], ['bear', 's'], 2).perMorpheme.map((p) => p.mult)).toEqual([1, 1]);
  });

  it('Agglutination raises the multiplier base; Momentum accrues per natural round', () => {
    expect(inputs(['agglutination']).base).toBeCloseTo(1.43, 9);
    const c = makeContent(anyDict, easy);
    let s: RunState = { ...newRun(c), inRun: ['momentum'] };
    expect(M.multiplierBase(s, c)).toBe(1.4);
    s = playRegularRound(s, c);
    expect(s.modifierState.momentum).toBeCloseTo(0.01, 9);
    s = playRegularRound(s, c);
    expect(M.multiplierBase(s, c)).toBeCloseTo(1.42, 9);
    // a card round does not add momentum
    const { s: cs, c: cc } = withMods(['word'], ['bear'], 'word', ['momentum']);
    let t = withCards(cs, 'hyphen');
    t = reduce(t, { type: 'PLAY_STEP', side: 'back', tileIds: ['hW0', 'hO1', 'hR2', 'hD3'], viaCard: 'chyphen0' }, cc);
    t = reduce(t, { type: 'SUBMIT' }, cc);
    expect(t.lastResult?.passed).toBe(true);
    expect(t.modifierState.momentum).toBeUndefined();
  });

  it('Mirror doubles the front + back bonus only', () => {
    const c = makeContent(anyDict, easy);
    const s: RunState = { ...newRun(c), inRun: ['mirror'] };
    expect(M.extensionBonus(s, c, 'front_back', 2)).toBe(4);
    expect(M.extensionBonus(s, c, 'two_same_side', 1.5)).toBe(1.5);
    // through a round
    let t = reduce(s, { type: 'START_ROUND' }, c);
    t = playFromHand(t, c, 2, 'start');
    t = reduce(t, { type: 'SUBMIT' }, c);
    t = reduce(reduce(t, { type: 'CONTINUE' }, c), { type: 'LEAVE' }, c);
    t = reduce(t, { type: 'START_ROUND' }, c);
    t = playFromHand(t, c, 1, 'back');
    t = playFromHand(t, c, 1, 'front');
    t = reduce(t, { type: 'SUBMIT' }, c);
    expect(t.lastResult?.extensionBonus).toBe(4);
  });

  it('Etymologist: the first extension card per boss cycle causes no strain', () => {
    const { s, c } = withMods(['word', 'ward'], ['bear'], 'wordward', ['etymologist']);
    let t = withCards(s, 'hyphen', 'hyphen');
    t = reduce(t, { type: 'PLAY_STEP', side: 'back', tileIds: ['hW0', 'hO1', 'hR2', 'hD3'], viaCard: 'chyphen0' }, c);
    expect(t.strainThisRound).toBe(0);
    expect(t.modifierState.etymologist_cycle).toBe(0);
    t = reduce(t, { type: 'PLAY_STEP', side: 'back', tileIds: ['hW4', 'hA5', 'hR6', 'hD7'], viaCard: 'chyphen1' }, c);
    expect(t.strainThisRound).toBe(2);
    // next cycle (round 5) is free again
    const { s: s5, c: c5 } = withMods(['word'], ['bear'], 'word', ['etymologist'], 5);
    let u = withCards({ ...s5, modifierState: { etymologist_cycle: 0 } }, 'hyphen');
    u = reduce(u, { type: 'PLAY_STEP', side: 'back', tileIds: ['hW0', 'hO1', 'hR2', 'hD3'], viaCard: 'chyphen0' }, c5);
    expect(u.strainThisRound).toBe(0);
  });

  it('Chain Lightning: extension cards add +0.02 base instead of strain', () => {
    const { s, c } = withMods(['word'], ['bear'], 'word', ['chain_lightning']);
    let t = withCards(s, 'hyphen');
    t = reduce(t, { type: 'PLAY_STEP', side: 'back', tileIds: ['hW0', 'hO1', 'hR2', 'hD3'], viaCard: 'chyphen0' }, c);
    expect(t.strainThisRound).toBe(0);
    expect(M.multiplierBase(t, c)).toBeCloseTo(1.42, 9);
    t = reduce(t, { type: 'SUBMIT' }, c);
    expect(t.lastResult?.effectiveMorphemes).toBe(2);
    expect(t.lastResult?.morphemeMult).toBeCloseTo(1.42, 9);
    expect(t.streak).toBe(0); // the streak still breaks: the card was used
  });

  it('Rack Extension adds 2 to the boss rack cap', () => {
    const c = makeContent(anyDict, easy);
    let s: RunState = { ...newRun(c), round: 4, chain: chainFromMorphemes(['in', 'form', 'al']), inRun: ['rack_extension'] };
    s = reduce(reduce(s, { type: 'START_ROUND' }, c), { type: 'START_BOSS' }, c);
    const mod = c.bossModifiers.find((m) => m.id === s.boss?.modifierId);
    const expected = (mod?.hookId === 'tight_rack' ? 4 : defaultBalance.boss.rackCap) + 2;
    expect(s.boss?.rules?.rackCap).toBe(expected);
  });

  it('UNDO_STEP after a strain hook restores the modifier state', () => {
    const { s, c } = withMods(['word'], ['bear'], 'word', ['chain_lightning']);
    let t = withCards(s, 'hyphen');
    t = reduce(t, { type: 'PLAY_STEP', side: 'back', tileIds: ['hW0', 'hO1', 'hR2', 'hD3'], viaCard: 'chyphen0' }, c);
    t = reduce(t, { type: 'UNDO_STEP' }, c);
    expect(t.strainThisRound).toBe(0);
    expect(t.cards).toHaveLength(1);
  });
});

describe('boss rewards (P5-02)', () => {
  const c = makeContent(anyDict, easy);
  function atReward(inRun: string[] = []): RunState {
    let s: RunState = { ...newRun(c, 5), round: 4, chain: chainFromMorphemes(['in', 'form', 'al']), inRun };
    s = reduce(reduce(s, { type: 'START_ROUND' }, c), { type: 'START_BOSS' }, c);
    s = reduce(s, { type: 'END_BOSS', wordPoints: 1000 }, c);
    return reduce(s, { type: 'CONTINUE' }, c);
  }

  it('offers 3 distinct modifiers the player does not hold', () => {
    const s = atReward(['coinage']);
    const offers = s.boss!.reward!.offers;
    expect(offers).toHaveLength(3);
    expect(new Set(offers).size).toBe(3);
    expect(offers).not.toContain('coinage');
    expect(s.boss!.reward!.picksLeft).toBe(1);
  });

  it('rarity odds follow the boss table (B1 never relic; B6 mostly exotic/relic)', () => {
    let s = rng.create(9);
    const count = (boss: number) => {
      const tally = { basic: 0, uncommon: 0, exotic: 0, relic: 0 };
      for (let i = 0; i < 2000; i++) {
        let r: keyof typeof tally;
        [r, s] = R.rollRewardRarity(s, boss, defaultBalance);
        tally[r]++;
      }
      return tally;
    };
    const b1 = count(1);
    expect(b1.relic).toBe(0);
    expect(b1.basic / 2000).toBeCloseTo(0.6, 1);
    const b6 = count(6);
    expect((b6.exotic + b6.relic) / 2000).toBeCloseTo(0.5, 1);
  });

  it('PICK_MODIFIER must name an offered modifier and then advances', () => {
    const s = atReward();
    expect(lastError(reduce(s, { type: 'PICK_MODIFIER' }, c))).toMatch(/pick one/);
    expect(lastError(reduce(s, { type: 'PICK_MODIFIER', id: 'zzz' }, c))).toMatch(/not on offer/);
    const id = s.boss!.reward!.offers[1]!;
    const t = reduce(s, { type: 'PICK_MODIFIER', id }, c);
    expect(t.inRun).toEqual([id]);
    expect(t.phase).toBe('ROUND_START');
    expect(t.round).toBe(5);
  });

  it('Polyglot: 4 offers and 2 picks', () => {
    const s = atReward(['polyglot']);
    expect(s.boss!.reward!.offers).toHaveLength(4);
    expect(s.boss!.reward!.picksLeft).toBe(2);
    const [a, b] = s.boss!.reward!.offers as [string, string];
    let t = reduce(s, { type: 'PICK_MODIFIER', id: a }, c);
    expect(t.phase).toBe('BOSS_REWARD');
    expect(t.boss!.reward!.offers).not.toContain(a);
    expect(lastError(reduce(t, { type: 'PICK_MODIFIER', id: a }, c))).toMatch(/not on offer/);
    t = reduce(t, { type: 'PICK_MODIFIER', id: b }, c);
    expect(t.inRun).toEqual(['polyglot', a, b]);
    expect(t.phase).toBe('ROUND_START');
  });

  it('with every modifier held the reward is empty and a bare PICK_MODIFIER advances', () => {
    const s = atReward(inRunModifiers.map((m) => m.id));
    expect(s.boss!.reward!.offers).toEqual([]);
    expect(reduce(s, { type: 'PICK_MODIFIER' }, c).phase).toBe('ROUND_START');
  });

  it('a failed boss offers no reward', () => {
    let s: RunState = { ...newRun(c, 5), round: 4, chain: chainFromMorphemes(['in', 'form', 'al']) };
    s = reduce(reduce(s, { type: 'START_ROUND' }, c), { type: 'START_BOSS' }, c);
    s = reduce(s, { type: 'END_BOSS', wordPoints: 0 }, c);
    expect(s.boss?.reward).toBeNull();
  });
});

describe('conditional in-run shop slot (P5-05)', () => {
  const c = makeContent(anyDict, easy);

  it('opens after Front + back and offers a Basic/Uncommon modifier for 10', () => {
    let s = playRegularRound(newRun(c, 2), c, 2);
    s = reduce(s, { type: 'START_ROUND' }, c);
    s = playFromHand(s, c, 1, 'back');
    s = playFromHand(s, c, 1, 'front');
    s = reduce(s, { type: 'SUBMIT' }, c);
    expect(s.lastResult?.criteriaMet).toContain('Front + back');
    s = reduce(s, { type: 'CONTINUE' }, c);
    const offer = s.shop!.inRunOffer!;
    expect(s.lastResult?.criteriaMet).toContain(offer.criterion);
    expect(offer.price).toBe(defaultBalance.shop.inRunSlotPrice);
    expect(['basic', 'uncommon']).toContain(c.inRunModifiers.find((m) => m.id === offer.modifierId)?.rarity);
    expect(lastError(reduce({ ...s, currency: 0 }, { type: 'BUY_IN_RUN' }, c))).toMatch(/not enough/);
    const bought = reduce({ ...s, currency: 10 }, { type: 'BUY_IN_RUN' }, c);
    expect(bought.inRun).toEqual([offer.modifierId]);
    expect(bought.currency).toBe(0);
    expect(bought.shop?.inRunOffer?.sold).toBe(true);
    expect(lastError(reduce(bought, { type: 'BUY_IN_RUN' }, c))).toMatch(/sold/);
  });

  it('does not open after a plain round', () => {
    let s = playRegularRound(newRun(c, 2), c, 2);
    s = reduce(s, { type: 'START_ROUND' }, c);
    s = playFromHand(s, c, 1, 'back');
    s = reduce(s, { type: 'SUBMIT' }, c);
    expect(s.lastResult?.criteriaMet).toEqual(expect.not.arrayContaining(['Front + back', 'Triple step']));
  });

  it('detects the other criteria', () => {
    const { s, c: cc } = withMods([], ['a', 'b', 'c', 'd', 'e'], 'x', [], 6);
    const shape3 = { front: 1, back: 2 };
    const b = S.scoreRegular({ round: 6, wordPoints: 50, morphemes: 5, strainCount: 0, extension: shape3, inRunMult: 1 }, cc.balance);
    const criteria = economy.shopCriteria(s, b, shape3);
    expect(criteria).toEqual(expect.arrayContaining(['Natural 5+', 'Double threshold', 'Triple step']));
  });
});

describe('secret words (P5-07)', () => {
  it('building "morpheme" flags the boss jump and records the achievement; the next round is the boss', () => {
    const c = content(['morph', 'morpheme'], easy);
    let s = reduce(newRun(c), { type: 'START_ROUND' }, c);
    s = { ...s, round: 2, pool: [], hand: tilesFor('eme', 'h'), chain: chainFromMorphemes(['morph']) };
    s = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hE0', 'hM1', 'hE2'] }, c);
    s = reduce(s, { type: 'SUBMIT' }, c);
    expect(C.text(s.chain!)).toBe('morpheme');
    expect(s.flags.bossJumpPending).toBe(true);
    expect(s.achievements).toEqual(['secret:morpheme']);
    s = reduce(reduce(s, { type: 'CONTINUE' }, c), { type: 'LEAVE' }, c);
    expect(s.round).toBe(3);
    s = reduce(s, { type: 'START_ROUND' }, c);
    expect(s.round).toBe(4);
    expect(s.phase).toBe('BOSS_INTRO');
    expect(s.flags.bossJumpPending).toBe(false);
  });

  it('secret words come from content', () => {
    const c = makeContent(anyDict, easy);
    expect(c.secretWords).toContain('polysynthetic');
    expect(c.secretWords).toHaveLength(5);
  });
});
