/**
 * Tile pool: creation from content + loadout, drawing, returning, committing.
 * Played tiles are committed — they leave the pool for the run (D2).
 */

import type { LetterSpec } from '../content/tiles';
import * as rng from './rng';
import type { Letter, PreRunLoadout, RngState, Tile, TileModifierId } from './types';

export interface PoolContent {
  letters: LetterSpec[];
}

/** Value of a tile for scoring, including flat value modifiers. */
export function tileValue(tile: Tile): number {
  let v = tile.baseValue;
  for (const m of tile.modifiers) {
    if (m === 'plus1') v += 1;
    else if (m === 'plus2') v += 2;
    else if (m === 'plus3') v += 3;
    else if (m === 'heavy') v *= 2;
  }
  return v;
}

/** The letter a tile spells in the chain (blanks use `playedAs`). */
export function tileLetter(tile: Tile): Letter {
  return tile.playedAs ?? tile.letter;
}

export function isBlank(tile: Tile): boolean {
  return tile.letter === '_' || tile.modifiers.includes('wild');
}

/**
 * Build the starting pool. Tile ids are stable (`A1`, `A2`, … `_2`) so a
 * loadout and a replay refer to the same tiles.
 */
export function createPool(content: PoolContent, loadout: PreRunLoadout): Tile[] {
  const pool: Tile[] = [];
  for (const spec of content.letters) {
    for (let i = 1; i <= spec.count; i++) {
      pool.push({
        id: `${spec.letter}${i}`,
        letter: spec.letter,
        baseValue: spec.value,
        modifiers: [],
      });
    }
  }
  // Loadout modifiers apply to one tile of that letter (D3): the first copy
  // that does not yet carry a modifier.
  for (const { letter, modifier } of loadout.tileModifiers) {
    const target = pool.find((t) => t.letter === letter && t.modifiers.length === 0);
    if (target) target.modifiers = [...target.modifiers, modifier as TileModifierId];
  }
  return pool;
}

/**
 * Draw up to `n` tiles at random. Returns the drawn tiles, the remaining
 * pool, and the advanced RNG state.
 */
export function draw(
  pool: readonly Tile[],
  n: number,
  state: RngState,
): { drawn: Tile[]; pool: Tile[]; rng: RngState } {
  const remaining = pool.slice();
  const drawn: Tile[] = [];
  let s = state;
  while (drawn.length < n && remaining.length > 0) {
    let i: number;
    [i, s] = rng.int(s, remaining.length);
    drawn.push(remaining.splice(i, 1)[0] as Tile);
  }
  return { drawn, pool: remaining, rng: s };
}

/** Return unplayed tiles to the pool (end of round). Clears any `playedAs`. */
export function returnTiles(pool: readonly Tile[], tiles: readonly Tile[]): Tile[] {
  return [
    ...pool,
    ...tiles.map((t) => {
      if (t.playedAs === undefined) return t;
      const { playedAs: _drop, ...rest } = t;
      return rest;
    }),
  ];
}

/**
 * Commit tiles from the hand into the chain: removes them from the hand and
 * stamps `playedAs` for blanks. Returns the committed tiles in the requested
 * order plus the remaining hand.
 */
export function commit(
  hand: readonly Tile[],
  tileIds: readonly string[],
  playedAs: Readonly<Record<string, Letter>> = {},
): { committed: Tile[]; hand: Tile[] } | { error: string } {
  const committed: Tile[] = [];
  const remaining = hand.slice();
  for (const id of tileIds) {
    const idx = remaining.findIndex((t) => t.id === id);
    if (idx === -1) return { error: `tile ${id} is not in hand` };
    const tile = remaining.splice(idx, 1)[0] as Tile;
    const chosen = playedAs[id];
    if (isBlank(tile)) {
      if (!chosen || chosen === '_') return { error: `blank tile ${id} needs a letter` };
      committed.push({ ...tile, playedAs: chosen });
    } else if (chosen !== undefined && chosen !== tile.letter) {
      return { error: `tile ${id} is ${tile.letter}, cannot play as ${chosen}` };
    } else {
      committed.push(tile);
    }
  }
  return { committed, hand: remaining };
}
