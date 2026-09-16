/**
 * The word / chain model and natural extension validation (spec §4, DESIGN.md §2.5).
 *
 * A chain is the full left → right list of tiles plus morpheme boundaries and
 * two "active" spans: the real word at the front (`headSpan`) and the real word
 * at the back (`tailSpan`). While the chain is natural (one dictionary word)
 * both spans cover everything. Extension cards (M3) make them diverge.
 *
 * The dictionary is the only judge of validity; the engine never decides
 * which morphemes are linguistically real.
 */

import { tileLetter } from './tiles';
import type { Chain, Dictionary, Morpheme, MorphemeSide, Result, Side, Span, Tile } from './types';

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function lettersOf(tiles: readonly Tile[]): string {
  return tiles.map((t) => tileLetter(t)).join('').toLowerCase();
}

/** The whole chain as a lowercase string. */
export function text(chain: Chain): string {
  return lettersOf(chain.tiles);
}

export function spanText(chain: Chain, span: Span): string {
  return lettersOf(chain.tiles.slice(span[0], span[1]));
}

export function headText(chain: Chain): string {
  return spanText(chain, chain.headSpan);
}

export function tailText(chain: Chain): string {
  return spanText(chain, chain.tailSpan);
}

export function morphemeCount(chain: Chain): number {
  return chain.morphemes.length;
}

/** The morpheme at the back of the chain. */
export function lastMorpheme(chain: Chain): Morpheme {
  const m = chain.morphemes[chain.morphemes.length - 1];
  if (!m) throw new Error('chain has no morphemes');
  return m;
}

/** Index of the first tile of a morpheme within `chain.tiles`. */
export function morphemeStart(chain: Chain, morpheme: Morpheme): number {
  const first = morpheme.tileIds[0];
  const idx = chain.tiles.findIndex((t) => t.id === first);
  if (idx === -1) throw new Error(`morpheme ${morpheme.id} not in chain`);
  return idx;
}

/** Text of a single morpheme. */
export function morphemeText(chain: Chain, morpheme: Morpheme): string {
  const byId = new Map(chain.tiles.map((t) => [t.id, t]));
  return lettersOf(morpheme.tileIds.map((id) => byId.get(id)).filter((t): t is Tile => !!t));
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

function makeMorpheme(tiles: readonly Tile[], side: MorphemeSide, round: number, viaCard?: string): Morpheme {
  const first = tiles[0];
  if (!first) throw new Error('morpheme needs at least one tile');
  const m: Morpheme = { id: `m:${first.id}`, tileIds: tiles.map((t) => t.id), side, round };
  if (viaCard !== undefined) m.viaCard = viaCard;
  return m;
}

/**
 * Round 1: the first word. Must be a dictionary word of ≥ 2 letters and is
 * recorded as one morpheme (side 'start').
 */
export function createChain(tiles: readonly Tile[], round: number, dict: Dictionary): Result<Chain> {
  const word = lettersOf(tiles);
  if (tiles.length < 2) return { ok: false, error: 'first word needs at least 2 letters', word };
  if (!dict.has(word)) return { ok: false, error: `"${word}" is not in the dictionary`, word };
  const span: Span = [0, tiles.length];
  return {
    ok: true,
    value: {
      tiles: tiles.slice(),
      morphemes: [makeMorpheme(tiles, 'start', round)],
      headSpan: span,
      tailSpan: span,
      natural: true,
    },
  };
}

/** Which word an extension on `side` must keep valid. */
export function activeWord(chain: Chain, side: Side): string {
  return side === 'front' ? headText(chain) : tailText(chain);
}

/** The word that a natural extension would produce, before validation. */
export function attemptedWord(chain: Chain, side: Side, tiles: readonly Tile[]): string {
  const added = lettersOf(tiles);
  return side === 'front' ? added + headText(chain) : tailText(chain) + added;
}

/**
 * Natural extension: append (back) or prepend (front) tiles so that the
 * active word on that side stays a dictionary word. The span on that side
 * grows; if the chain is natural, both spans grow.
 */
export function extendNatural(
  chain: Chain,
  side: Side,
  tiles: readonly Tile[],
  dict: Dictionary,
  round: number,
): Result<Chain> {
  if (tiles.length === 0) return { ok: false, error: 'an extension needs at least one tile', word: '' };
  const word = attemptedWord(chain, side, tiles);
  if (!dict.has(word)) return { ok: false, error: `"${word}" is not in the dictionary`, word };
  return { ok: true, value: appendTiles(chain, side, tiles, makeMorpheme(tiles, side, round)) };
}

/**
 * Structural add of tiles + a morpheme on one side, growing that side's span.
 * No dictionary check — callers validate first. Exported for card effects (M3).
 */
export function appendTiles(chain: Chain, side: Side, tiles: readonly Tile[], morpheme: Morpheme): Chain {
  const k = tiles.length;
  if (side === 'back') {
    const tailSpan: Span = [chain.tailSpan[0], chain.tailSpan[1] + k];
    return {
      tiles: [...chain.tiles, ...tiles],
      morphemes: [...chain.morphemes, morpheme],
      headSpan: chain.natural ? tailSpan : chain.headSpan,
      tailSpan,
      natural: chain.natural,
    };
  }
  const headSpan: Span = [0, chain.headSpan[1] + k];
  return {
    tiles: [...tiles, ...chain.tiles],
    morphemes: [morpheme, ...chain.morphemes],
    headSpan,
    tailSpan: chain.natural ? headSpan : shiftSpan(chain.tailSpan, k),
    natural: chain.natural,
  };
}

export function shiftSpan(span: Span, by: number): Span {
  return [span[0] + by, span[1] + by];
}

// ---------------------------------------------------------------------------
// Multi-step rounds
// ---------------------------------------------------------------------------

export interface NaturalStep {
  side: Side;
  tiles: Tile[];
}

export interface StepOutcome {
  chain: Chain;
  /** The word validated at each step. */
  words: string[];
}

export type StepsResult =
  | { ok: true; value: StepOutcome }
  | { ok: false; error: string; word: string; stepIndex: number };

/**
 * Apply several natural steps in order. Each step is validated against the
 * chain produced by the previous one; the first invalid step aborts with its
 * index and the attempted word.
 */
export function applyNaturalSteps(
  chain: Chain,
  steps: readonly NaturalStep[],
  dict: Dictionary,
  round: number,
): StepsResult {
  let current = chain;
  const words: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] as NaturalStep;
    const r = extendNatural(current, step.side, step.tiles, dict, round);
    if (!r.ok) return { ok: false, error: r.error, word: r.word ?? '', stepIndex: i };
    current = r.value;
    words.push(activeWord(current, step.side));
  }
  return { ok: true, value: { chain: current, words } };
}

/**
 * Morphemes added in a given round, by side. The round-1 'start' morpheme
 * counts as one (back) morpheme so round 1 scores as a 1-morpheme extension.
 */
export function morphemesAddedIn(chain: Chain, round: number): { front: number; back: number; total: number } {
  let front = 0;
  let back = 0;
  for (const m of chain.morphemes) {
    if (m.round !== round) continue;
    if (m.side === 'front') front++;
    else back++;
  }
  return { front, back, total: front + back };
}
