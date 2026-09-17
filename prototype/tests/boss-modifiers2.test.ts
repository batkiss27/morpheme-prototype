/** P8-03: the remaining boss modifiers. */
import { describe, expect, it } from 'vitest';
import { bossModifiers, defaultBalance } from '../src/content';
import { boss as B, lastError, reduce, rng } from '../src/engine';
import type { Board, BossRules, Letter, PlacedTile, RunState, Tile } from '../src/engine';
import { balanceWith, chainFromMorphemes, dict, tilesFor, values } from './helpers';
import { anyDict, makeContent, newRun } from './run-driver';

const b = defaultBalance;
const rules0 = (): BossRules => B.baseRules(1, b);
const mod = (id: string) => bossModifiers.find((m) => m.id === id)!;

function boardFrom(rows: string[]): Board {
  const size = rows.length;
  const board = B.createBoard(size);
  const cells = board.cells.slice();
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== '.') cells[r * size + c] = { id: `s${r}${c}`, letter: ch.toUpperCase() as Letter, baseValue: values[ch.toUpperCase()] ?? 0, modifiers: [] };
  }));
  return { ...board, cells };
}
const tile = (ch: string, id: string): Tile => ({ id, letter: ch.toUpperCase() as Letter, baseValue: values[ch.toUpperCase()] ?? 0, modifiers: [] });
const placed = (spec: [number, number, string][]): PlacedTile[] => spec.map(([row, col, ch], i) => ({ row, col, tile: tile(ch, `p${i}`) }));
const board = boardFrom(['.......', '.......', '.......', '.form..', '.......', '.......', '.......']);

describe('rule hooks', () => {
  it.each([
    ['short_words_only', { minWordLength: 3, maxWordLength: 3 }],
    ['gravity', { directionRule: 'gravity' }],
    ['one_direction', { directionRule: 'alternate' }],
    ['silence', { silent: true }],
    ['scramble', { scrambleMs: 10_000 }],
    ['echo_rule', { mustCrossPrevious: true }],
    ['frozen_multiplier', { morphemePenalty: 1 }],
    ['starter_shrink', { starterShrink: true }],
    ['mirror_board', { gridSize: 8 }],
    ['mute_modifiers', { muteModifiers: true }],
    ['toll', { tollPerWord: 1 }],
    ['wild_drought', { noWilds: true }],
  ])('%s', (id, expected) => {
    expect(B.applyModifier(rules0(), mod(id))).toMatchObject(expected);
  });
  it('content validates', () => {
    expect(() => B.validateBossModifiers(bossModifiers)).not.toThrow();
  });
});

describe('placement rules', () => {
  const d = dict('formal', 'mail', 'am', 'fa', 'or', 'ma');
  it('Short Words Only rejects a 6-letter word and accepts a 3-letter one', () => {
    const r = { ...rules0(), ...B.applyModifier(rules0(), mod('short_words_only')) };
    expect(B.validatePlacement(board, placed([[3, 5, 'a'], [3, 6, 'l']]), d, r)).toMatchObject({ ok: false, error: expect.stringContaining('at most 3') });
    const d3 = dict('mai');
    expect(B.validatePlacement(board, placed([[4, 4, 'a'], [5, 4, 'i']]), d3, r).ok).toBe(true);
  });
  it('Gravity: after the first word, only vertical', () => {
    const r = B.applyModifier(rules0(), mod('gravity'));
    const ctx = { wordsPlaced: 1, lastDir: 'H' as const, lastWordCells: [] };
    expect(B.validatePlacement(board, placed([[3, 5, 'a'], [3, 6, 'l']]), d, r, ctx)).toMatchObject({ ok: false, error: expect.stringContaining('Gravity') });
    expect(B.validatePlacement(board, placed([[4, 4, 'a'], [5, 4, 'i'], [6, 4, 'l']]), d, r, ctx).ok).toBe(true);
    expect(B.validatePlacement(board, placed([[3, 5, 'a'], [3, 6, 'l']]), d, r, { wordsPlaced: 0, lastDir: null, lastWordCells: [] }).ok).toBe(true);
  });
  it('One Direction: alternate directions', () => {
    const r = B.applyModifier(rules0(), mod('one_direction'));
    expect(B.validatePlacement(board, placed([[3, 5, 'a'], [3, 6, 'l']]), d, r, { wordsPlaced: 1, lastDir: 'H', lastWordCells: [] })).toMatchObject({ ok: false, error: expect.stringContaining('One Direction') });
    expect(B.validatePlacement(board, placed([[3, 5, 'a'], [3, 6, 'l']]), d, r, { wordsPlaced: 1, lastDir: 'V', lastWordCells: [] }).ok).toBe(true);
  });
  it('Echo Rule: must share a cell with the previous word', () => {
    const r = B.applyModifier(rules0(), mod('echo_rule'));
    const mailCells = [4 * 7 + 4, 5 * 7 + 4];
    expect(B.validatePlacement(board, placed([[3, 5, 'a'], [3, 6, 'l']]), d, r, { wordsPlaced: 1, lastDir: 'V', lastWordCells: mailCells })).toMatchObject({ ok: false, error: expect.stringContaining('Echo Rule') });
    // "am" through the starter's m — its cells include m at (3,4)... use previous word cells that include (3,4)
    expect(B.validatePlacement(board, placed([[4, 4, 'a']]), dict('ma'), r, { wordsPlaced: 1, lastDir: 'H', lastWordCells: [3 * 7 + 4] }).ok).toBe(true);
  });
});

describe('feed and tick effects', () => {
  const easy = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));
  function started(modifierId: string, chain = ['in', 'form', 'al']): RunState {
    let s: RunState = { ...newRun(easy, 3), round: 4, chain: chainFromMorphemes(chain) };
    s = reduce(s, { type: 'START_ROUND' }, easy);
    s = { ...s, boss: { ...s.boss!, modifierId } };
    return reduce(s, { type: 'START_BOSS' }, easy);
  }
  it('Mirror Board halves the grid and still places the starter', () => {
    const s = started('mirror_board');
    expect(s.boss?.board.size).toBe(8);
    expect(s.boss?.board.starter).toHaveLength(8);
  });
  it('Starter Shrink uses only the last morpheme', () => {
    const s = started('starter_shrink');
    expect(s.boss?.board.starter).toHaveLength(2);
  });
  it('Wild Drought removes blanks from the feed; Mute Modifiers strips tile modifiers', () => {
    const chain = chainFromMorphemes(['ab']);
    chain.tiles[0] = { ...chain.tiles[0]!, letter: '_', baseValue: 0 };
    chain.tiles[1] = { ...chain.tiles[1]!, modifiers: ['plus2'] };
    const [q1] = B.buildQueue(chain.tiles, rng.create(1), 1, { noWilds: true, muteModifiers: true });
    expect(q1).toHaveLength(1);
    expect(q1[0]?.modifiers).toEqual([]);
    const [q2] = B.buildQueue(chain.tiles, rng.create(1), 1);
    expect(q2).toHaveLength(2);
  });
  it('Dead Letter: tiles of the banned letter are lost when fed', () => {
    const s = started('dead_letter');
    const dead = s.boss!.rules!.deadLetter!;
    expect('INFORMAL').toContain(dead);
    let t = s;
    for (let i = 0; i < 12; i++) t = reduce(t, { type: 'BOSS_TICK', ms: 4000 }, easy);
    const seen = [...t.boss!.rack, ...t.boss!.queue].map((x) => x.playedAs ?? x.letter);
    // whatever was fed onto the rack never carries the dead letter
    expect(t.boss!.rack.every((x) => (x.playedAs ?? x.letter) !== dead)).toBe(true);
    void seen;
  });
  it('Scramble reshuffles the rack every 10 s', () => {
    const s = started('scramble');
    const big = { ...s, boss: { ...s.boss!, rack: tilesFor('abcdefg', 'r'), feedTimerMs: 1_000_000, rules: { ...s.boss!.rules!, rackCap: 50, feedIntervalMs: 1_000_000 } } };
    const t = reduce(big, { type: 'BOSS_TICK', ms: 10_000 }, easy);
    expect(t.boss!.rack.map((x) => x.id).sort()).toEqual(big.boss.rack.map((x) => x.id).sort());
    expect(t.boss!.rack.map((x) => x.id)).not.toEqual(big.boss.rack.map((x) => x.id));
    expect(t.boss!.scrambleTimerMs).toBe(10_000);
  });
  it('Toll charges 1 currency per word; Frozen Multiplier scores one morpheme lower', () => {
    let s = { ...started('toll'), currency: 5 };
    const b0 = s.boss!;
    s = { ...s, boss: { ...b0, rack: tilesFor('ail', 'r'), rules: { ...b0.rules!, vowelsToY: false } } };
    const mIndex = b0.board.starter.find((i) => b0.board.cells[i]?.letter === 'M')!;
    const [mr, mc] = B.rowCol(b0.board, mIndex);
    s = reduce(s, { type: 'PLACE_WORD', row: mr + 1, col: mc, dir: 'V', letters: 'ail' }, easy);
    expect(lastError(s)).toBeUndefined();
    expect(s.currency).toBe(4);
    const f = reduce(started('frozen_multiplier'), { type: 'END_BOSS', wordPoints: 100 }, easy);
    expect(f.lastResult?.morphemes).toBe(2);
    expect(f.lastResult?.morphemeMult).toBeCloseTo(1.4, 9);
  });
  it('direction rules apply through the reducer with real context', () => {
    let s = started('gravity');
    const b0 = s.boss!;
    s = { ...s, boss: { ...b0, rack: tilesFor('ailal', 'r'), rules: { ...b0.rules!, vowelsToY: false } } };
    const mIndex = b0.board.starter.find((i) => b0.board.cells[i]?.letter === 'M')!;
    const [mr, mc] = B.rowCol(b0.board, mIndex);
    const lIndex = b0.board.starter.find((i) => b0.board.cells[i]?.letter === 'L')!;
    const [lr, lc] = B.rowCol(b0.board, lIndex);
    s = reduce(s, { type: 'PLACE_WORD', row: mr + 1, col: mc, dir: 'V', letters: 'ail' }, easy);
    expect(lastError(s)).toBeUndefined();
    expect(s.boss?.lastDir).toBe('V');
    const across = reduce(s, { type: 'PLACE_WORD', row: lr, col: lc + 1, dir: 'H', letters: 'al' }, easy);
    expect(lastError(across)).toMatch(/Gravity/);
  });
});
