/**
 * Set-backed dictionary. The engine never fetches; the UI (or a test) builds
 * one from word lists and injects it (spec §8).
 */

import type { Dictionary } from './types';

/** Normalize a candidate word for lookup: lowercase, trimmed. */
export function normalizeWord(word: string): string {
  return word.trim().toLowerCase();
}

/**
 * Build a dictionary from any iterable of words. Words shorter than 2 letters
 * and blank / comment lines are ignored.
 */
export function createDictionary(words: Iterable<string>): Dictionary {
  const set = new Set<string>();
  for (const raw of words) {
    const w = normalizeWord(raw);
    if (w.length < 2 || w.startsWith('#')) continue;
    set.add(w);
  }
  return {
    has: (word) => set.has(normalizeWord(word)),
    size: set.size,
  };
}

/** Parse a newline-separated word list (the format of enable1.txt / custom.txt). */
export function wordsFromText(text: string): string[] {
  return text.split(/\r?\n/);
}

/** Merge several word lists into one dictionary. */
export function createDictionaryFromTexts(...texts: string[]): Dictionary {
  return createDictionary(texts.flatMap(wordsFromText));
}
