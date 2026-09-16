/** P3-01, P3-03, P3-04, P3-05: card registry and card effects. */
import { describe, expect, it } from 'vitest';
import { cards as cardContent, defaultBalance } from '../src/content';
import { allTiles, cards, chain as C, lastError, reduce } from '../src/engine';
import type { CardSpec, RunState, Side } from '../src/engine';
import { balanceWith, chainFromMorphemes, content, dict, tilesFor, withCards } from './helpers';
import { anyDict, makeContent, newRun, playFromHand } from './run-driver';
import fixtures from './fixtures/cards/extension.json';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('card registry', () => {
  it('every card in content names an implemented effect', () => {
    expect(() => cards.validateCards(cardContent)).not.toThrow();
    expect(cardContent.length).toBe(17);
  });

  it('rejects unknown effects and duplicate ids', () => {
    const bad = { ...cardContent[0]!, id: 'x', effectId: 'nope' as CardSpec['effectId'] };
    expect(() => cards.validateCards([...cardContent, bad])).toThrow(/unknown effect/);
    expect(() => cards.validateCards([cardContent[0]!, cardContent[0]!])).toThrow(/duplicate/);
  });

  it('classifies usage and phases', () => {
    const spec = (id: string) => cardContent.find((c) => c.id === id)!;
    expect(cards.usage(spec('hyphen'))).toBe('step');
    expect(cards.usage(spec('echo'))).toBe('instant');
    expect(cards.usableIn(spec('hyphen'), 'EXTEND')).toBe(true);
    expect(cards.usableIn(spec('hyphen'), 'SHOP')).toBe(false);
    expect(cards.usableIn(spec('amendment'), 'EXTEND')).toBe(false);
    expect(cards.usableIn(spec('amendment'), 'BOSS_INTRO')).toBe(true);
    expect(cards.usableIn(spec('loanword'), 'SHOP')).toBe(true);
  });

  it('prices follow the Shops tab defaults by rarity', () => {
    for (const c of cardContent) expect(c.price).toBe(defaultBalance.shop.prices[c.rarity]);
  });
});

// ---------------------------------------------------------------------------
// Extension cards (fixture-driven)
// ---------------------------------------------------------------------------

interface Fixture {
  name: string;
  dictionary: string[];
  chain: string[];
  card: string;
  letters: string;
  then?: { side: Side; letters: string };
  expect: { ok: boolean; morphemeCount?: number; natural?: boolean; text?: string; tailText?: string; headText?: string; strain?: number; word?: string };
}

describe('extension card fixtures', () => {
  for (const f of fixtures as Fixture[]) {
    it(f.name, () => {
      const spec = cardContent.find((c) => c.id === f.card)!;
      const effect = cards.stepEffects[spec.effectId as keyof typeof cards.stepEffects]!;
      const d = dict(...f.dictionary);
      const chain = chainFromMorphemes(f.chain);
      const round = f.chain.length + 1;
      const r = effect(chain, tilesFor(f.letters, 'x'), d, round, spec);
      expect(r.ok).toBe(f.expect.ok);
      if (!r.ok) {
        if (f.expect.word !== undefined) expect(r.word).toBe(f.expect.word);
        return;
      }
      let c = r.value;
      expect(C.lastMorpheme(c).viaCard).toBe(spec.id);
      if (f.then) {
        const n = C.extendNatural(c, f.then.side, tilesFor(f.then.letters, 'y'), d, round + 1);
        expect(n.ok).toBe(true);
        if (!n.ok) return;
        c = n.value;
      }
      if (f.expect.morphemeCount !== undefined) expect(C.morphemeCount(c)).toBe(f.expect.morphemeCount);
      if (f.expect.natural !== undefined) expect(c.natural).toBe(f.expect.natural);
      if (f.expect.text !== undefined) expect(C.text(c)).toBe(f.expect.text);
      if (f.expect.tailText !== undefined) expect(C.tailText(c)).toBe(f.expect.tailText);
      if (f.expect.headText !== undefined) expect(C.headText(c)).toBe(f.expect.headText);
      if (f.expect.strain !== undefined) expect(Number(spec.params.strain)).toBe(f.expect.strain);
      // every morpheme tile is in the chain exactly once
      expect(c.morphemes.flatMap((m) => m.tileIds)).toEqual(c.tiles.map((t) => t.id));
    });
  }
});

// ---------------------------------------------------------------------------
// Cards through the reducer
// ---------------------------------------------------------------------------

const easy = balanceWith({ scoring: { round1Threshold: 1 } });

/** Round-1 EXTEND state with a known hand, the chain "bear|able" already built, and cards. */
function extendState(words: string[], hand: string, ...cardIds: string[]): { s: RunState; c: ReturnType<typeof content> } {
  const c = content(words, easy);
  let s = reduce(newRun(c), { type: 'START_ROUND' }, c);
  const chain = chainFromMorphemes(['bear', 'able']);
  s = { ...s, round: 3, pool: [], hand: tilesFor(hand, 'h'), chain };
  return { s: withCards(s, ...cardIds), c };
}

const ids = (s: RunState) => s.cards.map((c) => c.cardId);

describe('extension cards in a round', () => {
  it('PLAY_STEP via card consumes it, applies strain and breaks the streak', () => {
    const { s: s0, c } = extendState(['bear', 'bearable', 'ableism'], 'ismxyz', 'before_and_after');
    const s1 = reduce({ ...s0, streak: 3 }, { type: 'PLAY_STEP', side: 'back', tileIds: ['hI0', 'hS1', 'hM2'], viaCard: 'cbefore_and_after0' }, c);
    expect(lastError(s1)).toBeUndefined();
    expect(C.text(s1.chain!)).toBe('bearableism');
    expect(s1.chain?.natural).toBe(false);
    expect(s1.cards).toEqual([]);
    expect(s1.strainThisRound).toBe(1);
    expect(s1.steps[0]).toMatchObject({ side: 'back', word: 'ableism', viaCard: 'before_and_after' });
    const s2 = reduce(s1, { type: 'SUBMIT' }, c);
    expect(s2.lastResult?.morphemes).toBe(3);
    expect(s2.lastResult?.effectiveMorphemes).toBe(2);
    expect(s2.streak).toBe(0);
  });

  it('extension cards are back-only (D5) and need a first word', () => {
    const { s, c } = extendState(['bear'], 'ism', 'before_and_after');
    expect(lastError(reduce(s, { type: 'PLAY_STEP', side: 'front', tileIds: ['hI0'], viaCard: 'cbefore_and_after0' }, c))).toMatch(/D5/);
    expect(lastError(reduce({ ...s, chain: null }, { type: 'PLAY_STEP', side: 'back', tileIds: ['hI0'], viaCard: 'cbefore_and_after0' }, c))).toMatch(/first word/);
  });

  it('a failed card step keeps the card and the hand', () => {
    const { s, c } = extendState(['bear'], 'zz', 'hyphen');
    const r = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hZ0', 'hZ1'], viaCard: 'chyphen0' }, c);
    expect(lastError(r)).toMatch(/Hyphen/);
    expect(r.cards).toHaveLength(1);
    expect(r.hand).toHaveLength(2);
  });

  it('UNDO_STEP restores the card and the strain', () => {
    const { s, c } = extendState(['word'], 'word', 'hyphen');
    const s1 = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hW0', 'hO1', 'hR2', 'hD3'], viaCard: 'chyphen0' }, c);
    expect(s1.strainThisRound).toBe(2);
    const s2 = reduce(s1, { type: 'UNDO_STEP' }, c);
    expect(s2.cards).toHaveLength(1);
    expect(s2.strainThisRound).toBe(0);
    expect(s2.chain).toEqual(s.chain);
    expect(s2.hand).toEqual(s.hand);
  });

  it('a step card cannot be used through USE_CARD', () => {
    const { s, c } = extendState(['bear'], 'ism', 'hyphen');
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'chyphen0' }, c))).toMatch(/adding tiles/);
  });

  it('Echo copies another held card', () => {
    const { s, c } = extendState(['bear'], 'ism', 'echo', 'before_and_after');
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'cecho0', target: { instanceId: 'cbefore_and_after1' } }, c);
    expect(lastError(r)).toBeUndefined();
    expect(ids(r)).toEqual(['before_and_after', 'before_and_after']);
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'cecho0' }, c))).toMatch(/choose a card/);
  });
});

describe('sound shift cards', () => {
  it('Glide turns a vowel into Y and marks the chain dirty; SUBMIT then needs valid words', () => {
    const { s, c } = extendState(['happy', 'happiness'], 'ness', 'glide', 'vowel_shift');
    const base = { ...s, chain: chainFromMorphemes(['happy']) };
    // happy → happi via Vowel Shift is random; test Glide on a made-up chain instead: "happi" → glide i → "happy"
    const happi = { ...base, chain: chainFromMorphemes(['happi']) };
    const g = reduce(happi, { type: 'USE_CARD', instanceId: 'cglide0', target: { tileId: 'm0I4' } }, c);
    expect(lastError(g)).toBeUndefined();
    expect(C.text(g.chain!)).toBe('happy');
    expect(g.chainDirty).toBe(true);
    expect(g.cards.map((x) => x.cardId)).toEqual(['vowel_shift']);
    // a consonant is not a valid target
    expect(lastError(reduce(happi, { type: 'USE_CARD', instanceId: 'cglide0', target: { tileId: 'm0H0' } }, c))).toMatch(/not a vowel/);
  });

  it('Vowel Shift picks a different vowel deterministically from the seed', () => {
    const { s, c } = extendState(['happy', 'happiness'], 'ness', 'vowel_shift');
    const happy = { ...s, chain: chainFromMorphemes(['happy']) };
    const r = reduce(happy, { type: 'USE_CARD', instanceId: 'cvowel_shift0', target: { tileId: 'm0A1' } }, c);
    const letter = C.text(r.chain!)[1];
    expect('eiou').toContain(letter);
    expect(reduce(happy, { type: 'USE_CARD', instanceId: 'cvowel_shift0', target: { tileId: 'm0A1' } }, c)).toEqual(r);
    expect(r.rng).not.toEqual(happy.rng);
  });

  it('after a shift the next step must restore validity: happy → happi + ness', () => {
    const { s, c } = extendState(['happy', 'happiness'], 'ness', 'glide');
    const happi = { ...s, chain: chainFromMorphemes(['happi']), chainDirty: true };
    // can't submit a dirty chain without a valid word
    const stuck = reduce({ ...happi, steps: [{ side: 'back', tileIds: [], word: 'x' }] }, { type: 'SUBMIT' }, c);
    expect(lastError(stuck)).toMatch(/must be valid again/);
    const fixed = reduce(happi, { type: 'PLAY_STEP', side: 'back', tileIds: ['hN0', 'hE1', 'hS2', 'hS3'] }, c);
    expect(C.text(fixed.chain!)).toBe('happiness');
    const done = reduce(fixed, { type: 'SUBMIT' }, c);
    expect(done.phase).toBe('SCORED');
    expect(done.chainDirty).toBe(false);
  });

  it('Elision deletes a letter into the graveyard; tiles are conserved', () => {
    const { s, c } = extendState(['bear'], 'xyz', 'elision');
    const before = allTiles(s).length;
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'celision0', target: { tileId: 'm1A0' } }, c);
    expect(lastError(r)).toBeUndefined();
    expect(C.text(r.chain!)).toBe('bearble');
    expect(r.destroyed.map((t) => t.id)).toEqual(['m1A0']);
    expect(allTiles(r)).toHaveLength(before);
    expect(r.chain?.morphemes[1]?.tileIds).toEqual(['m1B1', 'm1L2', 'm1E3']);
    expect(r.chain?.tailSpan).toEqual([0, 7]);
  });

  it('Elision removes an emptied morpheme', () => {
    const { s, c } = extendState([], 'x', 'elision');
    const single = { ...s, chain: chainFromMorphemes(['bear', 's']) };
    const r = reduce(single, { type: 'USE_CARD', instanceId: 'celision0', target: { tileId: 'm1S0' } }, c);
    expect(C.morphemeCount(r.chain!)).toBe(1);
  });

  it('Metathesis swaps a letter with the next one, across a morpheme boundary too', () => {
    const { s, c } = extendState([], 'x', 'metathesis', 'metathesis');
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'cmetathesis0', target: { tileId: 'm0R3' } }, c);
    expect(C.text(r.chain!)).toBe('beaarble');
    expect(r.chain?.morphemes.map((m) => C.morphemeText(r.chain!, m))).toEqual(['beaa', 'rble']);
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'cmetathesis0', target: { tileId: 'm1E3' } }, c))).toMatch(/nothing after it/);
  });

  it('sound shifts need a target in the word', () => {
    const { s, c } = extendState([], 'x', 'glide');
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'cglide0' }, c))).toMatch(/choose a letter/);
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'cglide0', target: { tileId: 'hX0' } }, c))).toMatch(/not in the word/);
  });

  it('undoing a step also reverts a shift used after it', () => {
    const { s, c } = extendState(['bearable', 'bearables'], 'sx', 'glide');
    const s1 = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hS0'] }, c);
    const s2 = reduce(s1, { type: 'USE_CARD', instanceId: 'cglide0', target: { tileId: 'm0E1' } }, c);
    expect(C.text(s2.chain!)).toBe('byarables');
    const s3 = reduce(s2, { type: 'UNDO_STEP' }, c);
    expect(s3.chain).toEqual(s.chain);
    expect(s3.cards).toHaveLength(1);
    expect(s3.chainDirty).toBe(false);
  });
});

describe('loanword cards', () => {
  it('Loanword adds a tile of a chosen letter to the pool for the run', () => {
    const c = makeContent(anyDict, easy);
    let s = reduce(newRun(c), { type: 'START_ROUND' }, c);
    s = withCards(s, 'loanword');
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'cloanword0', target: { letter: 'Q' } }, c);
    expect(lastError(r)).toBeUndefined();
    expect(allTiles(r)).toHaveLength(101);
    expect(r.pool.filter((t) => t.letter === 'Q')).toHaveLength(2);
    expect(new Set(allTiles(r).map((t) => t.id)).size).toBe(101);
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'cloanword0' }, c))).toMatch(/choose a letter/);
  });

  it('Simplification destroys 3 random 1-point tiles from the pool', () => {
    const c = makeContent(anyDict, easy);
    let s = reduce(newRun(c), { type: 'START_ROUND' }, c);
    s = withCards(s, 'simplification');
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'csimplification0' }, c);
    expect(r.destroyed).toHaveLength(3);
    expect(r.destroyed.every((t) => t.baseValue === 1)).toBe(true);
    expect(allTiles(r)).toHaveLength(100);
    expect(r.pool).toHaveLength(100 - defaultBalance.hand.size - 3);
  });

  it('Redraw replaces the hand, only before the first step', () => {
    const c = makeContent(anyDict, easy);
    let s = reduce(newRun(c), { type: 'START_ROUND' }, c);
    s = withCards(s, 'redraw', 'redraw');
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'credraw0' }, c);
    expect(r.hand).toHaveLength(defaultBalance.hand.size);
    expect(r.hand.map((t) => t.id)).not.toEqual(s.hand.map((t) => t.id));
    expect(allTiles(r)).toHaveLength(100);
    const played = playFromHand(r, c, 2, 'start');
    expect(lastError(reduce(played, { type: 'USE_CARD', instanceId: 'credraw1' }, c))).toMatch(/before playing a step/);
  });
});

describe('utility cards', () => {
  it('Bank doubles the currency earned this round', () => {
    const c = makeContent(anyDict, easy);
    let s = withCards(reduce(newRun(c), { type: 'START_ROUND' }, c), 'bank');
    s = reduce(s, { type: 'USE_CARD', instanceId: 'cbank0' }, c);
    expect(s.roundEffects.bank).toBe(true);
    s = playFromHand(s, c, 2, 'start');
    s = reduce(s, { type: 'SUBMIT' }, c);
    const bank = s.lastResult!.currencySources.find((x) => x.source.startsWith('Bank'))!;
    expect(bank.amount).toBe(s.lastResult!.currencyEarned - bank.amount);
    expect(s.currency).toBe(s.lastResult!.currencyEarned);
    // reset next round
    s = reduce(reduce(s, { type: 'CONTINUE' }, c), { type: 'LEAVE' }, c);
    expect(reduce(s, { type: 'START_ROUND' }, c).roundEffects).toEqual({});
  });

  it('Insurance: a failed threshold costs no life and offers no shop', () => {
    const hard = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1_000_000 } }));
    let s = withCards(reduce(newRun(hard), { type: 'START_ROUND' }, hard), 'insurance');
    s = reduce(s, { type: 'USE_CARD', instanceId: 'cinsurance0' }, hard);
    s = playFromHand(s, hard, 2, 'start');
    s = reduce(s, { type: 'SUBMIT' }, hard);
    expect(s.lastResult?.outcome).toBe('insured');
    expect(s.lives).toBe(0);
    s = reduce(s, { type: 'CONTINUE' }, hard);
    expect(s.phase).toBe('ROUND_START');
    expect(s.round).toBe(2);
  });

  it('Lexicographer sets its round flag', () => {
    const c = makeContent(anyDict, easy);
    const s = withCards(reduce(newRun(c), { type: 'START_ROUND' }, c), 'lexicographer');
    expect(reduce(s, { type: 'USE_CARD', instanceId: 'clexicographer0' }, c).roundEffects.lexicographer).toBe(true);
  });

  it('Amendment rerolls the boss modifier at a boss intro only', () => {
    const c = makeContent(anyDict, easy);
    const s = withCards(reduce(newRun(c), { type: 'START_ROUND' }, c), 'amendment');
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'camendment0' }, c))).toMatch(/cannot be used in phase EXTEND/);
    let intro = withCards({ ...newRun(c), round: 4 }, 'amendment');
    intro = reduce(intro, { type: 'START_ROUND' }, c);
    expect(intro.phase).toBe('BOSS_INTRO');
    const before = intro.boss?.modifierId;
    const r = reduce(intro, { type: 'USE_CARD', instanceId: 'camendment0' }, c);
    expect(lastError(r)).toBeUndefined();
    expect(r.boss?.modifierId).not.toBe(before);
    expect(r.boss?.rerolls).toBe(1);
    expect(r.flags.amendmentUsed).toBe(true);
    expect(r.cards).toEqual([]);
  });
});
