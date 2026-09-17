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

  // --- the rest of the tab (P8-03) ---
  { id: 'consonant_cluster', name: 'Consonant Cluster', rarity: 'basic', category: 'scoring', effect: 'Each run of 3+ consonants in the word scores a flat +15.', hookId: 'consonant_cluster', params: { perRun: 15 } },
  { id: 'long_form', name: 'Long Form', rarity: 'basic', category: 'scoring', effect: 'Morphemes of 5+ letters score +10 flat.', hookId: 'long_form', params: { minLength: 5, bonus: 10 } },
  { id: 'bonus_draw', name: 'Bonus Draw', rarity: 'basic', category: 'pool', effect: 'Hand size +1.', hookId: 'bonus_draw', params: { extra: 1 } },
  { id: 'blank_slate', name: 'Blank Slate', rarity: 'basic', category: 'pool', effect: 'Add 2 blank (wild) tiles to the pool.', hookId: 'blank_slate', params: { blanks: 2 } },
  { id: 'reduplication_mod', name: 'Reduplication', rarity: 'uncommon', category: 'scoring', effect: 'If the new morpheme repeats a morpheme already in the word, score it twice.', hookId: 'reduplication_mod', params: { mult: 2 } },
  { id: 'incorporation', name: 'Incorporation', rarity: 'uncommon', category: 'scoring', effect: 'Tiles with base value ≥ 8 score +1 for each morpheme in the word.', hookId: 'incorporation', params: { minValue: 8 } },
  { id: 'two_step', name: 'Two-Step', rarity: 'uncommon', category: 'extension', effect: 'The two-morpheme extension bonus is increased (×1.5 → ×2).', hookId: 'two_step', params: { bonus: 2 } },
  { id: 'streak_keeper', name: 'Streak Keeper', rarity: 'uncommon', category: 'economy', effect: 'The natural streak is not broken by the first extension card used per boss cycle.', hookId: 'streak_keeper', params: {} },
  { id: 'discount', name: 'Discount', rarity: 'uncommon', category: 'economy', effect: 'Shop prices −15%.', hookId: 'discount', params: { discount: 0.15 } },
  { id: 'boss_bounty', name: 'Boss Bounty', rarity: 'uncommon', category: 'boss', effect: '+2 currency per word placed in Boss Rounds.', hookId: 'boss_bounty', params: { perWord: 2 } },
  { id: 'feed_slow', name: 'Feed Slow', rarity: 'uncommon', category: 'boss', effect: 'Boss tile feed 20% slower.', hookId: 'feed_slow', params: { slower: 0.2 } },
  { id: 'second_chance', name: 'Second Chance', rarity: 'uncommon', category: 'modifiers', effect: '+1 life.', hookId: 'second_chance', params: { lives: 1 } },
  { id: 'free_reroll', name: 'Free Reroll', rarity: 'uncommon', category: 'economy', effect: '1 free shop reroll per round.', hookId: 'free_reroll', params: { perShop: 1 } },
  { id: 'heavy_metal', name: 'Heavy Metal', rarity: 'uncommon', category: 'scoring', effect: 'Tiles with base value ≥ 4 score +2.', hookId: 'heavy_metal', params: { minValue: 4, bonus: 2 } },
  { id: 'sesquipedalian', name: 'Sesquipedalian', rarity: 'exotic', category: 'scoring', effect: 'If the word is 20+ letters, ×1.5 to the round score.', hookId: 'sesquipedalian', params: { minLetters: 20, mult: 1.5 } },
  { id: 'overflow', name: 'Overflow', rarity: 'exotic', category: 'boss', effect: 'Rack overflow in Boss Rounds discards the newest tile instead of the oldest, and does not end the round.', hookId: 'overflow', params: {} },
  { id: 'affixer', name: 'Affixer', rarity: 'exotic', category: 'scoring', effect: 'Prefix (front) morphemes score ×1.5.', hookId: 'affixer', params: { mult: 1.5 } },
  { id: 'milestone_keeper', name: 'Milestone Keeper', rarity: 'exotic', category: 'economy', effect: 'Every shop offers an in-run modifier slot regardless of criteria.', hookId: 'milestone_keeper', params: {} },
  { id: 'double_time', name: 'Double Time', rarity: 'exotic', category: 'boss', effect: 'Boss timer +50%.', hookId: 'double_time', params: { more: 0.5 } },
  { id: 'polysynthesis', name: 'Polysynthesis', rarity: 'relic', category: 'scoring', effect: 'The morpheme multiplier has no cap, and multiplier base +0.015.', hookId: 'polysynthesis', params: { bonus: 0.015 } },
  { id: 'palindrome', name: 'Palindrome', rarity: 'relic', category: 'scoring', effect: 'If the new morpheme is a palindrome, the whole round score ×2.', hookId: 'palindrome', params: { mult: 2 } },
  { id: 'immortal_word', name: 'Immortal Word', rarity: 'relic', category: 'modifiers', effect: 'Once per run, a failed threshold is ignored entirely (no life lost, shop still offered).', hookId: 'immortal_word', params: {} },
];
