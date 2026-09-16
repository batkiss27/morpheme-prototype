/**
 * Crossword placement rules (P4-02): the placed tiles must lie in one line,
 * be contiguous with existing tiles filling any gaps, connect to a tile
 * already on the board, and every word they form (the main run plus every
 * perpendicular run of ≥ 2) must be in the dictionary. Points = the sum of
 * tile values over every formed word (no premium squares).
 */

import { tileLetter, tileValue } from '../tiles';
import type { Board, BossRules, Dictionary, Dir, FormedWord, PlacedTile, Result, Tile } from '../types';
import { inBounds, index, isEmpty, step, tileAt, typingCells } from './board';

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

export interface PlacementOutcome {
  main: FormedWord;
  cross: FormedWord[];
  /** Total points over main + cross words. */
  points: number;
}

type Lookup = (row: number, col: number) => Tile | null;

function lookupWith(board: Board, placed: readonly PlacedTile[]): Lookup {
  const extra = new Map(placed.map((p) => [index(board, p.row, p.col), p.tile]));
  return (row, col) => (inBounds(board, row, col) ? (extra.get(index(board, row, col)) ?? tileAt(board, row, col)) : null);
}

/** The maximal run of tiles through (row, col) along `dir`. */
function runThrough(board: Board, at: Lookup, row: number, col: number, dir: Dir): { cells: [number, number][]; tiles: Tile[] } {
  let [r, c] = [row, col];
  // walk back to the start of the run
  for (;;) {
    const [pr, pc] = step(r, c, dir, -1);
    if (at(pr, pc) === null) break;
    [r, c] = [pr, pc];
  }
  const cells: [number, number][] = [];
  const tiles: Tile[] = [];
  for (;;) {
    const t = at(r, c);
    if (t === null) break;
    cells.push([r, c]);
    tiles.push(t);
    [r, c] = step(r, c, dir);
  }
  return { cells, tiles };
}

export function wordPoints(tiles: readonly Tile[], rules: Pick<BossRules, 'vowelsScoreZero'>): number {
  return tiles.reduce((sum, t) => sum + (rules.vowelsScoreZero && VOWELS.has(tileLetter(t)) ? 0 : tileValue(t)), 0);
}

function formed(board: Board, run: { cells: [number, number][]; tiles: Tile[] }, rules: BossRules): FormedWord {
  return {
    word: run.tiles.map((t) => tileLetter(t)).join('').toLowerCase(),
    cells: run.cells.map(([r, c]) => index(board, r, c)),
    points: wordPoints(run.tiles, rules),
  };
}

/**
 * Validate a set of new tiles on the board. Returns the formed words and
 * points, or the first rule broken (with the offending word when relevant).
 */
export function validatePlacement(board: Board, placed: readonly PlacedTile[], dict: Dictionary, rules: BossRules): Result<PlacementOutcome> {
  if (placed.length === 0) return { ok: false, error: 'place at least one tile' };
  const seen = new Set<number>();
  for (const p of placed) {
    if (!inBounds(board, p.row, p.col)) return { ok: false, error: `(${p.row}, ${p.col}) is off the board` };
    if (tileAt(board, p.row, p.col) !== null) return { ok: false, error: `(${p.row}, ${p.col}) is already occupied` };
    const i = index(board, p.row, p.col);
    if (seen.has(i)) return { ok: false, error: `(${p.row}, ${p.col}) is used twice` };
    seen.add(i);
  }
  const rows = new Set(placed.map((p) => p.row));
  const cols = new Set(placed.map((p) => p.col));
  if (rows.size > 1 && cols.size > 1) return { ok: false, error: 'tiles must be in one row or one column' };

  const at = lookupWith(board, placed);
  const first = placed[0] as PlacedTile;
  // Direction: the line the tiles share; a single tile prefers the longer run.
  let dir: Dir;
  if (placed.length > 1) dir = rows.size === 1 ? 'H' : 'V';
  else {
    const h = runThrough(board, at, first.row, first.col, 'H').tiles.length;
    const v = runThrough(board, at, first.row, first.col, 'V').tiles.length;
    dir = v > h ? 'V' : 'H';
  }
  const mainRun = runThrough(board, at, first.row, first.col, dir);
  const placedIdx = new Set(placed.map((p) => index(board, p.row, p.col)));
  const mainIdx = new Set(mainRun.cells.map(([r, c]) => index(board, r, c)));
  for (const i of placedIdx) if (!mainIdx.has(i)) return { ok: false, error: 'tiles must be contiguous (existing tiles may fill gaps)' };

  const main = formed(board, mainRun, rules);
  const cross: FormedWord[] = [];
  const perp: Dir = dir === 'H' ? 'V' : 'H';
  for (const p of placed) {
    const run = runThrough(board, at, p.row, p.col, perp);
    if (run.tiles.length >= 2) cross.push(formed(board, run, rules));
  }

  const touchesExisting = mainRun.cells.some(([r, c]) => !placedIdx.has(index(board, r, c))) || cross.length > 0;
  if (!isEmpty(board) && !touchesExisting) return { ok: false, error: 'the word must connect to a tile already on the board', word: main.word };

  if (main.word.length < 2 && cross.length === 0) return { ok: false, error: 'a word needs at least 2 letters', word: main.word };
  // A single tile whose only word is perpendicular: that word is the main word.
  const mainWord = main.word.length >= 2 ? main : (cross.shift() as FormedWord);
  if (mainWord.word.length < rules.minWordLength) return { ok: false, error: `words must be at least ${rules.minWordLength} letters`, word: mainWord.word };
  for (const w of [mainWord, ...cross]) {
    if (!dict.has(w.word)) return { ok: false, error: `"${w.word}" is not in the dictionary`, word: w.word };
  }
  return { ok: true, value: { main: mainWord, cross, points: mainWord.points + cross.reduce((s, w) => s + w.points, 0) } };
}

export function applyPlacement(board: Board, placed: readonly PlacedTile[]): Board {
  const cells = board.cells.slice();
  for (const p of placed) cells[index(board, p.row, p.col)] = p.tile;
  return { ...board, cells };
}

/**
 * Take tiles from the rack to spell `letters`, in order: an exact letter
 * first, otherwise a blank (played as that letter). Returns the tiles used
 * and the remaining rack.
 */
export function resolveRack(rack: readonly Tile[], letters: string): Result<{ used: Tile[]; rack: Tile[] }> {
  const remaining = rack.slice();
  const used: Tile[] = [];
  for (const ch of letters.toUpperCase()) {
    if (!/^[A-Z]$/.test(ch)) return { ok: false, error: `"${ch}" is not a letter` };
    let i = remaining.findIndex((t) => tileLetter(t) === ch && t.letter !== '_');
    if (i === -1) i = remaining.findIndex((t) => t.letter === '_');
    if (i === -1) return { ok: false, error: `no tile for "${ch}" on the rack`, word: letters.toLowerCase() };
    const tile = remaining.splice(i, 1)[0] as Tile;
    used.push(tile.letter === '_' ? { ...tile, playedAs: ch as Tile['letter'] } : tile);
  }
  return { ok: true, value: { used, rack: remaining } };
}

/** Typed letters from (row, col) in `dir` → concrete placements (skipping occupied cells). */
export function placementsFor(board: Board, row: number, col: number, dir: Dir, tiles: readonly Tile[]): Result<PlacedTile[]> {
  const cells = typingCells(board, row, col, dir, tiles.length);
  if (cells.length < tiles.length) return { ok: false, error: 'the word runs off the board' };
  return { ok: true, value: tiles.map((tile, k) => ({ row: cells[k]![0], col: cells[k]![1], tile })) };
}
