/**
 * Achievements — the *Achievements* tab, prototype subset (spec §7).
 * `predicate` names a check in engine/meta.ts run over the finished run.
 * Card / modifier unlocks are recorded in MetaState; the prototype does not
 * gate its content pools on them yet (see prototype-tasks.md change log).
 */

import type { AchievementSpec } from '../engine/types';

export const achievements: AchievementSpec[] = [
  { id: 'first_word', name: 'First Word', category: 'progression', condition: 'Clear round 1.', predicate: 'rounds_cleared', params: { n: 1 }, reward: { unlockCards: ['vowel_shift', 'loanword'] } },
  { id: 'first_blood', name: 'First Blood', category: 'progression', condition: 'Beat B1.', predicate: 'bosses_beaten', params: { n: 1 }, reward: { lexicon: 2 } },
  { id: 'halfway', name: 'Halfway', category: 'progression', condition: 'Beat B3.', predicate: 'bosses_beaten', params: { n: 3 }, reward: { loadout: 1 } },
  { id: 'sesquipedalian', name: 'Sesquipedalian', category: 'progression', condition: 'Build a word/chain of 6+ morphemes.', predicate: 'max_morphemes', params: { n: 6 }, reward: { unlockModifiers: ['agglutination'] } },
  { id: 'twenty_letters', name: 'Twenty Letters', category: 'progression', condition: 'Build a chain of 20+ letters.', predicate: 'max_letters', params: { n: 20 }, reward: { lexicon: 3 } },
  { id: 'victory', name: 'Victory', category: 'progression', condition: 'Win a run.', predicate: 'won', params: {}, reward: { challenges: true, loadout: 2, lexicon: 5 } },
  { id: 'two_step', name: 'Two-Step', category: 'skill', condition: 'Extend by 2 morphemes in one round.', predicate: 'two_step', params: {}, reward: { lexicon: 1 } },
  { id: 'both_ends', name: 'Both Ends', category: 'skill', condition: 'Extend front and back in one round.', predicate: 'both_ends', params: {}, reward: { unlockModifiers: ['mirror'], lexicon: 1 } },
  { id: 'triple_step', name: 'Triple Step', category: 'skill', condition: 'Extend by 3+ morphemes in one round.', predicate: 'triple_step', params: {}, reward: { lexicon: 3 } },
  { id: 'natural_five', name: 'Natural Five', category: 'skill', condition: 'Reach a natural (fully real) word of 5 morphemes.', predicate: 'natural_morphemes', params: { n: 5 }, reward: { unlockModifiers: ['momentum'], lexicon: 2 } },
  { id: 'deathless', name: 'Deathless', category: 'abstention', condition: 'Win a run without losing a life.', predicate: 'won_deathless', params: {}, reward: { lexicon: 5 } },
  { id: 'purists_pride', name: "Purist's Pride", category: 'abstention', condition: 'Win a run using no Extension cards.', predicate: 'won_no_extension_cards', params: {}, reward: { lexicon: 8, unlockModifiers: ['polyglot'] } },
  { id: 'unaided', name: 'Unaided', category: 'abstention', condition: 'Win a run with no pre-run modifiers in the loadout.', predicate: 'won_unaided', params: {}, reward: { lexicon: 8, loadout: 1 } },
  { id: 'secret_polysynthetic', name: 'Polysynthetic', category: 'easter_egg', condition: "Build the word 'polysynthetic'.", predicate: 'secret_word', params: { word: 'polysynthetic' }, reward: { lexicon: 5 } },
  { id: 'secret_polysynthesis', name: 'Polysynthesis', category: 'easter_egg', condition: "Build the word 'polysynthesis'.", predicate: 'secret_word', params: { word: 'polysynthesis' }, reward: { lexicon: 5 } },
  { id: 'secret_morpheme', name: 'Morpheme', category: 'easter_egg', condition: "Build the word 'morpheme'.", predicate: 'secret_word', params: { word: 'morpheme' }, reward: { lexicon: 3 } },
  { id: 'secret_agglutinative', name: 'Agglutinative', category: 'easter_egg', condition: "Build the word 'agglutinative'.", predicate: 'secret_word', params: { word: 'agglutinative' }, reward: { lexicon: 5 } },
  { id: 'secret_sesquipedalian', name: 'Sesquipedalian (word)', category: 'easter_egg', condition: "Build the word 'sesquipedalian'.", predicate: 'secret_word', params: { word: 'sesquipedalian' }, reward: { lexicon: 5 } },
  { id: 'trapdoor', name: 'Trapdoor', category: 'easter_egg', condition: 'Trigger a boss jump and beat the boss.', predicate: 'trapdoor', params: {}, reward: { lexicon: 8 } },
];
