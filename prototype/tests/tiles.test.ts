/** P1-02: pool creation, draw, return, commit. */
import { describe, expect, it } from 'vitest';
import { letters } from '../src/content';
import { rng, tiles } from '../src/engine';
import type { Tile } from '../src/engine';
import { tilesFor } from './helpers';

const noLoadout = { tileModifiers: [], categories: {} };

describe('tile pool', () => {
  it('starts with 100 tiles including 2 blanks', () => {
    const pool = tiles.createPool({ letters }, noLoadout);
    expect(pool).toHaveLength(100);
    expect(pool.filter((t) => t.letter === '_')).toHaveLength(2);
    expect(pool.filter((t) => t.letter === 'E')).toHaveLength(12);
    expect(new Set(pool.map((t) => t.id)).size).toBe(100);
  });

  it('applies a loadout modifier to exactly one tile of the letter (D3)', () => {
    const pool = tiles.createPool({ letters }, { tileModifiers: [{ letter: 'E', modifier: 'plus1' }], categories: {} });
    const es = pool.filter((t) => t.letter === 'E');
    expect(es.filter((t) => t.modifiers.includes('plus1'))).toHaveLength(1);
  });

  it('draw and return conserve tiles', () => {
    const pool = tiles.createPool({ letters }, noLoadout);
    const d = tiles.draw(pool, 7, rng.create(1));
    expect(d.drawn).toHaveLength(7);
    expect(d.pool).toHaveLength(93);
    const ids = new Set([...d.drawn, ...d.pool].map((t) => t.id));
    expect(ids.size).toBe(100);
    const back = tiles.returnTiles(d.pool, d.drawn);
    expect(back).toHaveLength(100);
    expect(pool).toHaveLength(100); // input untouched
  });

  it('draw is deterministic per seed', () => {
    const pool = tiles.createPool({ letters }, noLoadout);
    const a = tiles.draw(pool, 7, rng.create(5)).drawn.map((t) => t.id);
    const b = tiles.draw(pool, 7, rng.create(5)).drawn.map((t) => t.id);
    expect(a).toEqual(b);
  });

  it('draw stops when the pool is empty', () => {
    const d = tiles.draw(tilesFor('abc'), 7, rng.create(1));
    expect(d.drawn).toHaveLength(3);
    expect(d.pool).toHaveLength(0);
  });

  it('commit removes tiles from the hand in the requested order', () => {
    const hand = tilesFor('bearx');
    const r = tiles.commit(hand, ['R3', 'E1']);
    if ('error' in r) throw new Error(r.error);
    expect(r.committed.map((t) => t.letter)).toEqual(['R', 'E']);
    expect(r.hand.map((t) => t.letter)).toEqual(['B', 'A', 'X']);
  });

  it('commit rejects tiles not in hand', () => {
    expect(tiles.commit(tilesFor('bear'), ['Z9'])).toMatchObject({ error: expect.stringContaining('Z9') });
  });

  it('blanks need a letter and get playedAs; return clears it', () => {
    const blank: Tile = { id: '_1', letter: '_', baseValue: 0, modifiers: [] };
    expect(tiles.commit([blank], ['_1'])).toMatchObject({ error: expect.stringContaining('letter') });
    const r = tiles.commit([blank], ['_1'], { _1: 'Q' });
    if ('error' in r) throw new Error(r.error);
    expect(r.committed[0]?.playedAs).toBe('Q');
    expect(tiles.tileLetter(r.committed[0] as Tile)).toBe('Q');
    expect(tiles.tileValue(r.committed[0] as Tile)).toBe(0);
    expect(tiles.returnTiles([], r.committed)[0]?.playedAs).toBeUndefined();
  });

  it('a non-blank cannot be played as another letter', () => {
    expect(tiles.commit(tilesFor('a'), ['A0'], { A0: 'B' })).toMatchObject({ error: expect.any(String) });
  });

  it('tileValue applies flat and heavy modifiers', () => {
    const q: Tile = { id: 'Q1', letter: 'Q', baseValue: 10, modifiers: [] };
    expect(tiles.tileValue(q)).toBe(10);
    expect(tiles.tileValue({ ...q, modifiers: ['plus1'] })).toBe(11);
    expect(tiles.tileValue({ ...q, modifiers: ['plus3'] })).toBe(13);
    expect(tiles.tileValue({ ...q, modifiers: ['heavy'] })).toBe(20);
    expect(tiles.tileValue({ ...q, modifiers: ['plus2', 'heavy'] })).toBe(24);
  });
});
