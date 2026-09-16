/** Shared test helpers: tiny dictionaries, tiles from strings, engine content. */

import { defaultBalance, letters } from '../src/content';
import { dictionary as dictFns } from '../src/engine';
import type { Balance, Dictionary, EngineContent, Letter, Tile } from '../src/engine';

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
  return { balance, dictionary: dict(...words), letters };
}

/** A balance with only the given overrides changed (shallow per section). */
export function balanceWith(overrides: { [K in keyof Balance]?: Partial<Balance[K]> }): Balance {
  const b: Balance = structuredClone(defaultBalance);
  for (const key of Object.keys(overrides) as (keyof Balance)[]) {
    Object.assign(b[key], overrides[key]);
  }
  return b;
}
