/** P8-02: the remaining cards, in rarity order. */
import { describe, expect, it } from 'vitest';
import { cards as cardContent } from '../src/content';
import { allTiles, cards, chain as C, lastError, reduce, scoringInputs } from '../src/engine';
import type { RunState } from '../src/engine';
import { balanceWith, chainFromMorphemes, content, tilesFor, withCards } from './helpers';
import { anyDict, makeContent, newRun, playFromHand, playRegularRound } from './run-driver';

const easy = balanceWith({ scoring: { round1Threshold: 1 } });

function extendState(words: string[], hand: string, morphemes: string[], ...cardIds: string[]) {
  const c = content(words, easy);
  let s = reduce(newRun(c), { type: 'START_ROUND' }, c);
  s = { ...s, round: morphemes.length + 1, pool: [], hand: tilesFor(hand, 'h'), chain: chainFromMorphemes(morphemes) };
  return { s: withCards(s, ...cardIds), c };
}
const ids = (s: RunState) => s.cards.map((c) => c.cardId);
const spec = (id: string) => cardContent.find((c) => c.id === id)!;

describe('Basic', () => {
  it('Lenition lowers a consonant, Fortition raises one; vowels are rejected', () => {
    const { s, c } = extendState([], 'x', ['quiz'], 'lenition', 'fortition');
    const low = reduce(s, { type: 'USE_CARD', instanceId: 'clenition0', target: { tileId: 'm0Q0' } }, c);
    expect(lastError(low)).toBeUndefined();
    const newLetter = C.text(low.chain!)[0]!.toUpperCase();
    expect(newLetter).not.toBe('Q');
    expect(c.letters.find((l) => l.letter === newLetter)!.value).toBeLessThan(10);
    expect(low.chainDirty).toBe(true);
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'cfortition1', target: { tileId: 'm0Q0' } }, c))).toMatch(/no consonant/);
    const high = reduce(s, { type: 'USE_CARD', instanceId: 'cfortition1', target: { tileId: 'm0Z3' } }, c);
    expect(lastError(high)).toMatch(/no consonant/); // Z is already 10
    const hi2 = reduce(s, { type: 'USE_CARD', instanceId: 'cfortition1', target: { tileId: 'm0I2' } }, c);
    expect(lastError(hi2)).toMatch(/not a consonant/);
  });

  it('Etymology grants a free reroll in the shop', () => {
    const c = makeContent(anyDict, easy);
    let s = playRegularRound(newRun(c), c, 2);
    s = reduce(s, { type: 'START_ROUND' }, c);
    s = playFromHand(s, c, 1, 'back');
    s = reduce(reduce(s, { type: 'SUBMIT' }, c), { type: 'CONTINUE' }, c);
    s = withCards(s, 'etymology');
    expect(lastError(reduce({ ...s, phase: 'EXTEND' }, { type: 'USE_CARD', instanceId: 'cetymology0' }, c))).toMatch(/cannot be used/);
    s = reduce(s, { type: 'USE_CARD', instanceId: 'cetymology0' }, c);
    expect(s.shop?.freeRerolls).toBe(1);
    expect(s.cards).toEqual([]);
  });
});

describe('Uncommon', () => {
  it('Rhyme: the new word must share the tail morpheme\'s last two letters', () => {
    const { s, c } = extendState(['bear', 'wear', 'tear', 'ball'], 'wearball', ['b', 'ear'], 'rhyme', 'rhyme');
    const good = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hW0', 'hE1', 'hA2', 'hR3'], viaCard: 'crhyme0' }, c);
    expect(lastError(good)).toBeUndefined();
    expect(C.tailText(good.chain!)).toBe('wear');
    expect(good.strainThisRound).toBe(1);
    const bad = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hB4', 'hA5', 'hL6', 'hL7'], viaCard: 'crhyme0' }, c);
    expect(lastError(bad)).toMatch(/does not rhyme/);
  });

  it('Anagram rearranges the tail morpheme into a dictionary word', () => {
    const { s, c } = extendState(['bear', 'bare', 'brae'], 'x', ['un', 'bear'], 'anagram');
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'canagram0', target: { letters: 'bare' } }, c);
    expect(lastError(r)).toBeUndefined();
    expect(C.text(r.chain!)).toBe('unbare');
    expect(C.tailText(r.chain!)).toBe('bare');
    expect(r.chain?.natural).toBe(false);
    expect(r.strainThisRound).toBe(1);
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'canagram0', target: { letters: 'bera' } }, c))).toMatch(/not in the dictionary/);
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'canagram0', target: { letters: 'bears' } }, c))).toMatch(/exactly the 4 letters/);
  });

  it('Backformation removes the tail morpheme into the hand', () => {
    const { s, c } = extendState([], 'x', ['un', 'bear', 'able'], 'backformation');
    const before = allTiles(s).length;
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'cbackformation0' }, c);
    expect(lastError(r)).toBeUndefined();
    expect(C.text(r.chain!)).toBe('unbear');
    expect(C.morphemeCount(r.chain!)).toBe(2);
    expect(r.hand).toHaveLength(5);
    expect(allTiles(r)).toHaveLength(before);
    expect(r.strainThisRound).toBe(1);
  });

  it('Weight Swap re-letters every tile of the chosen value', () => {
    const { s, c } = extendState([], 'x', ['bear'], 'weight_swap'); // b=3, e=1, a=1, r=1
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'cweight_swap0', target: { tileId: 'm0E1' } }, c);
    expect(lastError(r)).toBeUndefined();
    const text = C.text(r.chain!);
    expect(text[0]).toBe('b');
    for (const t of r.chain!.tiles.slice(1)) expect(c.letters.find((l) => l.letter === (t.playedAs ?? t.letter))!.value).toBe(1);
    expect(r.chainDirty).toBe(true);
  });

  it('Borrowing adds three tiles worth 4+; Purism removes a letter from the pool', () => {
    const c = makeContent(anyDict, easy);
    let s = withCards(reduce(newRun(c), { type: 'START_ROUND' }, c), 'borrowing', 'purism');
    s = reduce(s, { type: 'USE_CARD', instanceId: 'cborrowing0' }, c);
    expect(allTiles(s)).toHaveLength(103);
    expect(s.pool.slice(-3).every((t) => t.baseValue >= 4)).toBe(true);
    const es = s.pool.filter((t) => t.letter === 'E').length;
    s = reduce(s, { type: 'USE_CARD', instanceId: 'cpurism1', target: { letter: 'E' } }, c);
    expect(s.pool.filter((t) => t.letter === 'E')).toHaveLength(0);
    expect(s.destroyed).toHaveLength(es);
    expect(allTiles(s)).toHaveLength(103);
  });

  it('Tile Smith applies a level 1–2 modifier to a hand tile', () => {
    const c = makeContent(anyDict, easy);
    const s = withCards(reduce(newRun(c), { type: 'START_ROUND' }, c), 'tile_smith');
    const id = s.hand[0]!.id;
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'ctile_smith0', target: { tileId: id, modifier: 'plus2' } }, c);
    expect(r.hand[0]?.modifiers).toEqual(['plus2']);
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'ctile_smith0', target: { tileId: id, modifier: 'heavy' } }, c))).toMatch(/level 1 or 2/);
  });

  it('Milestone opens the shop slot after a 2-morpheme round; Tempo boosts the next boss timer', () => {
    const c = makeContent(anyDict, easy);
    let s = playRegularRound(newRun(c), c, 2);
    s = withCards(reduce(s, { type: 'START_ROUND' }, c), 'milestone', 'tempo_card');
    s = reduce(s, { type: 'USE_CARD', instanceId: 'cmilestone0' }, c);
    s = reduce(s, { type: 'USE_CARD', instanceId: 'ctempo_card1' }, c);
    expect(s.flags.tempoBonus).toBeCloseTo(0.2, 9);
    s = playFromHand(s, c, 1, 'back');
    s = playFromHand(s, c, 1, 'back');
    s = reduce(s, { type: 'SUBMIT' }, c);
    expect(s.lastResult?.criteriaMet).toContain('Milestone card');
    let t: RunState = { ...s, round: 4, phase: 'ROUND_START' };
    t = reduce(reduce(t, { type: 'START_ROUND' }, c), { type: 'START_BOSS' }, c);
    const mod = c.bossModifiers.find((m) => m.id === t.boss?.modifierId);
    const base = mod?.hookId === 'half_time' ? 63_000 : 90_000;
    expect(t.boss?.rules?.timerMs).toBe(Math.round(base * 1.2));
    expect(t.flags.tempoBonus).toBe(0);
  });
});

describe('Exotic', () => {
  it('Infix inserts a dictionary word between two morphemes', () => {
    const { s, c } = extendState(['able', 'bear', 'un'], 'able', ['un', 'bear'], 'infix');
    const r = reduce(s, { type: 'PLAY_STEP', side: 'insert', insertAfter: 0, tileIds: ['hA0', 'hB1', 'hL2', 'hE3'], viaCard: 'cinfix0' }, c);
    expect(lastError(r)).toBeUndefined();
    expect(C.text(r.chain!)).toBe('unablebear');
    expect(r.chain?.morphemes.map((m) => C.morphemeText(r.chain!, m))).toEqual(['un', 'able', 'bear']);
    expect(r.chain?.natural).toBe(false);
    expect(C.headText(r.chain!)).toBe('un');
    expect(C.tailText(r.chain!)).toBe('bear');
    expect(lastError(reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hA0'], viaCard: 'cinfix0' }, c))).toMatch(/insert/);
    expect(lastError(reduce(s, { type: 'PLAY_STEP', side: 'insert', insertAfter: 1, tileIds: ['hA0', 'hB1', 'hL2', 'hE3'], viaCard: 'cinfix0' }, c))).toMatch(/between/);
  });

  it('Gemination doubles a letter so it scores twice', () => {
    const { s, c } = extendState([], 'x', ['bear'], 'gemination');
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'cgemination0', target: { tileId: 'm0B0' } }, c);
    expect(C.text(r.chain!)).toBe('bbear');
    expect(scoringInputs(r, c).wordPoints).toBe(3 + 3 + 1 + 1 + 1);
    expect(r.chain?.morphemes[0]?.tileIds).toHaveLength(5);
    expect(r.chain?.tailSpan).toEqual([0, 5]);
  });

  it('Great Vowel Shift rotates every vowel', () => {
    const { s, c } = extendState(['bear', 'bier'], 'x', ['bear'], 'great_vowel_shift');
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'cgreat_vowel_shift0' }, c);
    expect(C.text(r.chain!)).toBe('bier'); // e→i, a→e
    expect(r.chainDirty).toBe(true);
  });

  it('Dialect duplicates a hand tile into the pool; Substrate raises the hand size for the run', () => {
    const c = makeContent(anyDict, easy);
    let s = withCards(reduce(newRun(c), { type: 'START_ROUND' }, c), 'dialect', 'substrate_card');
    const tile = s.hand[0]!;
    s = reduce(s, { type: 'USE_CARD', instanceId: 'cdialect0', target: { tileId: tile.id } }, c);
    expect(s.pool.at(-1)?.letter).toBe(tile.letter);
    expect(new Set(allTiles(s).map((t) => t.id)).size).toBe(101);
    s = reduce(s, { type: 'USE_CARD', instanceId: 'csubstrate_card1' }, c);
    s = playFromHand(s, c, 2, 'start');
    s = reduce(reduce(reduce(s, { type: 'SUBMIT' }, c), { type: 'CONTINUE' }, c), { type: 'LEAVE' }, c);
    s = reduce(s, { type: 'START_ROUND' }, c);
    expect(s.hand).toHaveLength(11);
  });

  it('Wildcard Round doubles the extension bonus', () => {
    const c = makeContent(anyDict, easy);
    let s = playRegularRound(newRun(c), c, 2);
    s = withCards(reduce(s, { type: 'START_ROUND' }, c), 'wildcard_round');
    s = reduce(s, { type: 'USE_CARD', instanceId: 'cwildcard_round0' }, c);
    s = playFromHand(s, c, 1, 'back');
    s = playFromHand(s, c, 1, 'front');
    s = reduce(s, { type: 'SUBMIT' }, c);
    expect(s.lastResult?.extensionBonus).toBe(4);
  });
});

describe('Relic', () => {
  it('Before & After Deluxe is reusable once per round with no strain', () => {
    const { s, c } = extendState(['ableism', 'ismatic'], 'ismatic', ['bear', 'able'], 'before_and_after_deluxe');
    const one = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hI0', 'hS1', 'hM2'], viaCard: 'cbefore_and_after_deluxe0' }, c);
    expect(lastError(one)).toBeUndefined();
    expect(one.strainThisRound).toBe(0);
    expect(ids(one)).toEqual(['before_and_after_deluxe']);
    const two = reduce(one, { type: 'PLAY_STEP', side: 'back', tileIds: ['hA3', 'hT4', 'hI5', 'hC6'], viaCard: 'cbefore_and_after_deluxe0' }, c);
    expect(lastError(two)).toMatch(/already used this round/);
    // undo restores the use
    const undone = reduce(one, { type: 'UNDO_STEP' }, c);
    expect(undone.cardsUsedThisRound).toEqual([]);
    // next round it is available again
    let n = reduce(one, { type: 'SUBMIT' }, c);
    n = reduce(reduce(n, { type: 'CONTINUE' }, c), { type: 'LEAVE' }, c);
    n = reduce(n, { type: 'START_ROUND' }, c);
    expect(n.cardsUsedThisRound).toEqual([]);
    expect(ids(n)).toEqual(['before_and_after_deluxe']);
  });

  it('Ablaut changes a vowel to a chosen vowel, once per round, and is kept', () => {
    const { s, c } = extendState([], 'x', ['bear'], 'ablaut');
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'cablaut0', target: { tileId: 'm0E1', letter: 'O' } }, c);
    expect(C.text(r.chain!)).toBe('boar');
    expect(ids(r)).toEqual(['ablaut']);
    expect(lastError(reduce(r, { type: 'USE_CARD', instanceId: 'cablaut0', target: { tileId: 'm0A2', letter: 'I' } }, c))).toMatch(/already used/);
    expect(lastError(reduce(s, { type: 'USE_CARD', instanceId: 'cablaut0', target: { tileId: 'm0E1', letter: 'K' } }, c))).toMatch(/choose a vowel/);
  });

  it('Restock copies the word tiles into the pool; Second Wind adds a life', () => {
    const { s, c } = extendState([], 'x', ['un', 'bear'], 'restock', 'second_wind');
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'crestock0' }, c);
    expect(r.pool).toHaveLength(6);
    expect(new Set(allTiles(r).map((t) => t.id)).size).toBe(allTiles(r).length);
    const w = reduce(s, { type: 'USE_CARD', instanceId: 'csecond_wind1' }, c);
    expect(w.lives).toBe(1);
  });

  it('every card usage phase table covers the new cards', () => {
    for (const card of cardContent) expect(cards.usableIn(card, 'EXTEND') || cards.usableIn(card, 'SHOP') || cards.usableIn(card, 'BOSS_INTRO')).toBe(true);
    expect(spec('before_and_after_deluxe').reusable).toBe(true);
  });
});
