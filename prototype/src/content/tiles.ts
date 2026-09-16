/**
 * Letters, base values and starting pool counts — the *Tiles* tab
 * (standard Scrabble distribution, 100 tiles including 2 blanks).
 */

import type { Letter, TileModifierId } from '../engine/types';

export interface LetterSpec {
  letter: Letter;
  value: number;
  count: number;
  kind: 'vowel' | 'consonant' | 'wild';
}

export const letters: LetterSpec[] = [
  { letter: 'A', value: 1, count: 9, kind: 'vowel' },
  { letter: 'B', value: 3, count: 2, kind: 'consonant' },
  { letter: 'C', value: 3, count: 2, kind: 'consonant' },
  { letter: 'D', value: 2, count: 4, kind: 'consonant' },
  { letter: 'E', value: 1, count: 12, kind: 'vowel' },
  { letter: 'F', value: 4, count: 2, kind: 'consonant' },
  { letter: 'G', value: 2, count: 3, kind: 'consonant' },
  { letter: 'H', value: 4, count: 2, kind: 'consonant' },
  { letter: 'I', value: 1, count: 9, kind: 'vowel' },
  { letter: 'J', value: 8, count: 1, kind: 'consonant' },
  { letter: 'K', value: 5, count: 1, kind: 'consonant' },
  { letter: 'L', value: 1, count: 4, kind: 'consonant' },
  { letter: 'M', value: 3, count: 2, kind: 'consonant' },
  { letter: 'N', value: 1, count: 6, kind: 'consonant' },
  { letter: 'O', value: 1, count: 8, kind: 'vowel' },
  { letter: 'P', value: 3, count: 2, kind: 'consonant' },
  { letter: 'Q', value: 10, count: 1, kind: 'consonant' },
  { letter: 'R', value: 1, count: 6, kind: 'consonant' },
  { letter: 'S', value: 1, count: 4, kind: 'consonant' },
  { letter: 'T', value: 1, count: 6, kind: 'consonant' },
  { letter: 'U', value: 1, count: 4, kind: 'vowel' },
  { letter: 'V', value: 4, count: 2, kind: 'consonant' },
  { letter: 'W', value: 4, count: 2, kind: 'consonant' },
  { letter: 'X', value: 8, count: 1, kind: 'consonant' },
  { letter: 'Y', value: 4, count: 2, kind: 'consonant' },
  { letter: 'Z', value: 10, count: 1, kind: 'consonant' },
  { letter: '_', value: 0, count: 2, kind: 'wild' },
];

/** Base value lookup by letter. */
export const letterValues: Record<Letter, number> = Object.fromEntries(
  letters.map((l) => [l.letter, l.value]),
) as Record<Letter, number>;

/** Tile modifiers by level (a letter must be at this level to pick the modifier). */
export interface TileModifierSpec {
  id: TileModifierId;
  name: string;
  level: 1 | 2 | 3 | 4;
  effect: string;
  /** Has an effect in the prototype engine (others are data only). */
  implemented?: boolean;
}

export const tileModifiers: TileModifierSpec[] = [
  { id: 'plus1', implemented: true, name: '+1', level: 1, effect: 'Flat +1 to base value.' },
  { id: 'gilded', name: 'Gilded', level: 1, effect: 'Earn +1 currency each round this tile is in the word.' },
  { id: 'anchored', name: 'Anchored', level: 1, effect: '×2 value if the tile is the first or last letter of the word.' },
  { id: 'weighted', name: 'Weighted', level: 1, effect: 'This tile is 50% more likely to be drawn.' },
  { id: 'plus2', implemented: true, name: '+2', level: 2, effect: 'Flat +2 to base value.' },
  { id: 'vowel_wild', implemented: true, name: 'Vowel Wild', level: 2, effect: 'Tile can be played as any vowel (vowels only).' },
  { id: 'trade', name: 'Trade', level: 2, effect: 'When drawn and not played, refund 1 currency.' },
  { id: 'harmonic', name: 'Harmonic', level: 2, effect: '×1.5 if adjacent to a tile with the same base value.' },
  { id: 'sticky', name: 'Sticky', level: 2, effect: 'Stays in hand between rounds if unplayed.' },
  { id: 'plus3', implemented: true, name: '+3', level: 3, effect: 'Flat +3 to base value.' },
  { id: 'compounding', name: 'Compounding', level: 3, effect: 'Gains +1 value each round it remains in the word.' },
  { id: 'mutable', name: 'Mutable', level: 3, effect: 'Once per round, may be changed to an alphabetically adjacent letter for free.' },
  { id: 'silent', name: 'Silent', level: 3, effect: 'Counts for scoring but is ignored for dictionary validity.' },
  { id: 'fragile', name: 'Fragile', level: 3, effect: '×3 value, but the tile is destroyed after being scored twice.' },
  { id: 'boss_ready', name: 'Boss Ready', level: 3, effect: 'In Boss Rounds this tile is the first to arrive in the feed.' },
  { id: 'wild', name: 'Wild', level: 4, effect: 'Tile can be played as any letter (scores as base value 1).' },
  { id: 'stressed', name: 'Stressed', level: 4, effect: '+0.5× to the round multiplier while this tile is in the word.' },
  { id: 'tonal', name: 'Tonal', level: 4, effect: '×2 for the morpheme this tile is in, if that morpheme has no other Tonal tile.' },
  { id: 'heavy', implemented: true, name: 'Heavy', level: 4, effect: 'Tile scores double its base value.' },
  { id: 'cursed', name: 'Cursed', level: 4, effect: '×2 value, but the tile must be played if drawn.' },
  { id: 'volatile', name: 'Volatile', level: 4, effect: 'Value is randomized each round between 0 and 3× base.' },
  { id: 'twin', name: 'Twin', level: 4, effect: 'When played, a copy of this tile (with modifiers) is added to the pool.' },
];
