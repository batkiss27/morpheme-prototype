/**
 * Extension card step effects (DESIGN.md §2.5, spec §4). Each takes the chain
 * and the tiles the player is adding to the back and returns the new chain,
 * or an error with the attempted word. Back only in v0.1 (D5). All of them
 * make the chain non-natural; strain is applied by the reducer from
 * `params.strain`.
 */

import * as C from '../chain';
import type { CardSpec, Chain, Dictionary, Result, Tile } from '../types';

export type StepEffect = (chain: Chain, tiles: readonly Tile[], dict: Dictionary, round: number, card: CardSpec) => Result<Chain>;

const morpheme = (tiles: readonly Tile[], round: number, card: CardSpec) => C.newMorpheme(tiles, 'back', round, card.id);

/** Tail morpheme + new letters must be a word: informal[ly] + ric → lyric. */
export const beforeAndAfter: StepEffect = (chain, tiles, dict, round, card) => {
  if (tiles.length === 0) return { ok: false, error: 'add at least one tile', word: '' };
  const last = C.lastMorpheme(chain);
  const word = C.morphemeText(chain, last) + C.lettersOf(tiles);
  if (!dict.has(word)) return { ok: false, error: `"${word}" is not in the dictionary`, word };
  return { ok: true, value: C.appendChained(chain, tiles, morpheme(tiles, round, card), C.morphemeStart(chain, last)) };
};

/** New tiles must spell the tail morpheme again; no dictionary check on the join. */
export const reduplication: StepEffect = (chain, tiles, _dict, round, card) => {
  const last = C.morphemeText(chain, C.lastMorpheme(chain));
  const added = C.lettersOf(tiles);
  if (added !== last) return { ok: false, error: `Reduplication must repeat "${last}", not "${added}"`, word: added };
  return { ok: true, value: C.appendChained(chain, tiles, morpheme(tiles, round, card), chain.tiles.length) };
};

/** New letters must be a dictionary word on their own; no overlap. */
export const hyphen: StepEffect = (chain, tiles, dict, round, card) => {
  const word = C.lettersOf(tiles);
  if (word.length < 2) return { ok: false, error: 'a Hyphen morpheme needs at least 2 letters', word };
  if (!dict.has(word)) return { ok: false, error: `"${word}" is not in the dictionary`, word };
  return { ok: true, value: C.appendChained(chain, tiles, morpheme(tiles, round, card), chain.tiles.length) };
};

/**
 * The new word overlaps the last k letters of the chain (k ≥ minOverlap,
 * within the tail word); the longest valid overlap wins.
 */
export const blend: StepEffect = (chain, tiles, dict, round, card) => {
  if (tiles.length === 0) return { ok: false, error: 'add at least one tile', word: '' };
  const minOverlap = Number(card.params.minOverlap ?? 2);
  const tail = C.tailText(chain);
  const added = C.lettersOf(tiles);
  const end = chain.tiles.length;
  for (let k = tail.length; k >= minOverlap; k--) {
    const word = tail.slice(tail.length - k) + added;
    if (dict.has(word)) {
      return { ok: true, value: C.appendChained(chain, tiles, morpheme(tiles, round, card), end - k) };
    }
  }
  const attempted = tail.slice(Math.max(0, tail.length - minOverlap)) + added;
  return { ok: false, error: `no word blends the tail letters with "${added}" (e.g. "${attempted}")`, word: attempted };
};

/** Any letters, no dictionary check. */
export const freeMorpheme: StepEffect = (chain, tiles, _dict, round, card) => {
  if (tiles.length === 0) return { ok: false, error: 'add at least one tile', word: '' };
  return { ok: true, value: C.appendChained(chain, tiles, morpheme(tiles, round, card), chain.tiles.length) };
};

export const stepEffects = {
  before_and_after: beforeAndAfter,
  reduplication,
  hyphen,
  blend,
  free_morpheme: freeMorpheme,
} satisfies Partial<Record<CardSpec['effectId'], StepEffect>>;

export type StepEffectId = keyof typeof stepEffects;

export function isStepEffect(id: string): id is StepEffectId {
  return id in stepEffects;
}
