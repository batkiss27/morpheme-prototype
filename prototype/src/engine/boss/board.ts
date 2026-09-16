/**
 * Boss board: an N×N grid with the starter word placed centred on the middle
 * row (P4-01). Which morphemes form the starter follows D7 via
 * `balance.boss.starterMorphemes` (0 = the whole chain).
 */

import * as C from '../chain';
import type { Balance, Board, BossRules, Chain, Dir, Tile } from '../types';

export function createBoard(size: number): Board {
  return { size, cells: Array<Tile | null>(size * size).fill(null), starter: [] };
}

export function inBounds(board: Board, row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < board.size && col < board.size;
}

export function index(board: Board, row: number, col: number): number {
  return row * board.size + col;
}

export function rowCol(board: Board, i: number): [row: number, col: number] {
  return [Math.floor(i / board.size), i % board.size];
}

export function tileAt(board: Board, row: number, col: number): Tile | null {
  return inBounds(board, row, col) ? (board.cells[index(board, row, col)] ?? null) : null;
}

export function isEmpty(board: Board): boolean {
  return board.cells.every((c) => c === null);
}

/** Copy of a chain tile for the boss board / feed; `cycle` keeps ids unique across feed cycles. */
export function bossCopy(tile: Tile, cycle: number): Tile {
  return { ...tile, modifiers: [...tile.modifiers], id: `${tile.id}~b${cycle}` };
}

/**
 * The chain tiles that form the starter word for boss `bossNumber` (D7), or
 * the last morpheme only under Starter Shrink. Longer than the board → the
 * last `size` tiles.
 */
export function starterTiles(chain: Chain, bossNumber: number, balance: Balance, rules?: Pick<BossRules, 'starterShrink'>): Tile[] {
  const table = balance.boss.starterMorphemes;
  const n = rules?.starterShrink ? 1 : (table[Math.min(bossNumber, table.length) - 1] ?? 1);
  const morphemes = n === 0 ? chain.morphemes : chain.morphemes.slice(-n);
  const ids = new Set(morphemes.flatMap((m) => m.tileIds));
  const tiles = chain.tiles.filter((t) => ids.has(t.id));
  return tiles.slice(-balance.boss.gridSize);
}

/** Place tiles horizontally, centred on the middle row, and mark them as the starter. */
export function placeStarter(board: Board, tiles: readonly Tile[]): Board {
  if (tiles.length > board.size) throw new Error(`starter of ${tiles.length} letters does not fit a ${board.size}-board`);
  const row = Math.floor(board.size / 2);
  const col0 = Math.floor((board.size - tiles.length) / 2);
  const cells = board.cells.slice();
  const starter: number[] = [];
  tiles.forEach((t, k) => {
    const i = index(board, row, col0 + k);
    cells[i] = t;
    starter.push(i);
  });
  return { ...board, cells, starter };
}

/** Step one cell along a direction. */
export function step(row: number, col: number, dir: Dir, n = 1): [number, number] {
  return dir === 'H' ? [row, col + n] : [row + n, col];
}

/**
 * Cells that typing `count` letters from (row, col) in `dir` would fill,
 * skipping occupied cells (the RoundScreen and PLACE_WORD share this rule).
 * Returns fewer cells than `count` if the board edge is reached.
 */
export function typingCells(board: Board, row: number, col: number, dir: Dir, count: number): [number, number][] {
  const out: [number, number][] = [];
  let [r, c] = [row, col];
  while (out.length < count && inBounds(board, r, c)) {
    if (tileAt(board, r, c) === null) out.push([r, c]);
    [r, c] = step(r, c, dir);
  }
  return out;
}
