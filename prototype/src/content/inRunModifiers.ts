/**
 * In-run modifiers — the *In-Run Modifiers* tab, prototype subset (spec §7).
 * `hookId` names the implementation in engine/modifiers/registry.ts.
 */

import type { InRunModifierSpec } from '../engine/types';

export const inRunModifiers: InRunModifierSpec[] = [
  { id: 'suffix_bias', name: 'Suffix Bias', rarity: 'basic', category: 'scoring', effect: 'The tail morpheme scores ×2.', hookId: 'suffix_bias', params: { mult: 2 } },
  { id: 'prefix_bias', name: 'Prefix Bias', rarity: 'basic', category: 'scoring', effect: 'The head morpheme scores ×2.', hookId: 'prefix_bias', params: { mult: 2 } },
  { id: 'inflection', name: 'Inflection', rarity: 'basic', category: 'scoring', effect: 'Morphemes of 1–2 letters score ×2.', hookId: 'inflection', params: { maxLength: 2, mult: 2 } },
  { id: 'coinage', name: 'Coinage', rarity: 'basic', category: 'economy', effect: '+1 currency per morpheme in the word at the end of each round.', hookId: 'coinage', params: { perMorpheme: 1 } },
  { id: 'rack_extension', name: 'Rack Extension', rarity: 'basic', category: 'boss', effect: 'Boss rack size +2.', hookId: 'rack_extension', params: { extra: 2 } },
  { id: 'vowel_harmony', name: 'Vowel Harmony', rarity: 'uncommon', category: 'scoring', effect: 'If every vowel in the new morpheme already appears in the word, that morpheme scores ×2.', hookId: 'vowel_harmony', params: { mult: 2 } },
  { id: 'momentum', name: 'Momentum', rarity: 'uncommon', category: 'scoring', effect: 'Each natural extension round adds a permanent +0.01 to the multiplier base.', hookId: 'momentum', params: { perRound: 0.01 } },
  { id: 'etymologist', name: 'Etymologist', rarity: 'uncommon', category: 'extension', effect: 'The first extension card used in each boss cycle causes no strain.', hookId: 'etymologist', params: {} },
  { id: 'agglutination', name: 'Agglutination', rarity: 'exotic', category: 'scoring', effect: 'Morpheme multiplier base +0.03.', hookId: 'agglutination', params: { bonus: 0.03 } },
  { id: 'mirror', name: 'Mirror', rarity: 'exotic', category: 'extension', effect: 'The front + back extension bonus is doubled.', hookId: 'mirror', params: { mult: 2 } },
  { id: 'chain_lightning', name: 'Chain Lightning', rarity: 'relic', category: 'extension', effect: 'Extension cards grant +0.02 to the multiplier base instead of causing strain.', hookId: 'chain_lightning', params: { bonus: 0.02 } },
  { id: 'polyglot', name: 'Polyglot', rarity: 'relic', category: 'modifiers', effect: 'Choose 2 in-run modifiers after each Boss Round instead of 1 (from 4 offers).', hookId: 'polyglot', params: { picks: 2, extraOffers: 1 } },
];
