/** Shared test helpers: tiny dictionaries, tiles from strings, engine content. */

import { achievements, bossModifiers, cards, challenges, defaultBalance, inRunModifiers, letters, preRunCategories, risks, secretWords, tileModifiers } from '../src/content';
import { dictionary as dictFns } from '../src/engine';
import { chain as C } from '../src/engine';
import type { Balance, CardInstance, Chain, Dictionary, EngineContent, Letter, RunState, Tile } from '../src/engine';

export const values: Record<string, number> = Object.fromEntries(letters.map((l) => [l.letter, l.value]));

/** Build tiles that spell `word`; ids are `${letter}${n}` with an optional prefix to keep them unique. */
export function tilesFor(word: string, prefix = ''): Tile[] {
  return word
    .toUpperCase()
    .split('')
    .map((ch, i) => ({
      id: `${prefix}${ch}${i}`,
      letter: ch as Letter,
      baseValue: values[ch] ?? 0,
      modifiers: [],
    }));
}

export function dict(...words: string[]): Dictionary {
  return dictFns.createDictionary(words);
}

export function content(words: string[], balance: Balance = defaultBalance): EngineContent {
  return { balance, dictionary: dict(...words), letters, cards, bossModifiers, inRunModifiers, secretWords, preRun: { categories: preRunCategories, risks, challenges }, achievements, tileModifiers };
}

/** A balance with only the given overrides changed (shallow per section). */
export function balanceWith(overrides: { [K in keyof Balance]?: Partial<Balance[K]> }): Balance {
  const b: Balance = structuredClone(defaultBalance);
  for (const key of Object.keys(overrides) as (keyof Balance)[]) {
    Object.assign(b[key], overrides[key]);
  }
  return b;
}

/**
 * Build a natural chain from morpheme strings without dictionary checks, e.g.
 * ['un', 'bear', 'able'] → unbearable with 3 morphemes (rounds 1, 2, 3 …).
 */
export function chainFromMorphemes(morphemes: string[], prefix = 'm'): Chain {
  let chain: Chain | null = null;
  morphemes.forEach((text, i) => {
    const tiles = tilesFor(text, `${prefix}${i}`);
    if (!chain) {
      chain = { tiles, morphemes: [C.newMorpheme(tiles, 'start', 1)], headSpan: [0, tiles.length], tailSpan: [0, tiles.length], natural: true };
    } else {
      chain = C.appendTiles(chain, 'back', tiles, C.newMorpheme(tiles, 'back', i + 1));
    }
  });
  if (!chain) throw new Error('need at least one morpheme');
  return chain;
}

/** Put card instances (id = `c<cardId>`) into a run state's hand. */
export function withCards(state: RunState, ...cardIds: string[]): RunState {
  const cards: CardInstance[] = cardIds.map((cardId, i) => ({ instanceId: `c${cardId}${i}`, cardId }));
  return { ...state, cards: [...state.cards, ...cards] };
}
