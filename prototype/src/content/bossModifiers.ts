/**
 * Boss round modifiers — the *Boss Round Modifiers* tab, prototype subset
 * (spec §7). One is drawn at random per Boss Round; `hookId` names the rule
 * transform in engine/boss/modifiers.ts and `params` tunes it.
 */

import type { BossModifierSpec } from '../engine/types';

export const bossModifiers: BossModifierSpec[] = [
  { id: 'y_not', name: 'Y Not', effect: 'All vowel tiles become Y for this round; tile modifiers are retained.', severity: 3, hookId: 'y_not', params: {} },
  { id: 'long_words_only', name: 'Long Words Only', effect: 'All words placed must be 4+ letters.', severity: 2, hookId: 'long_words', params: { minLength: 4 } },
  { id: 'rapid_feed', name: 'Rapid Feed', effect: 'Tile feed arrives 50% faster.', severity: 2, hookId: 'rapid_feed', params: { factor: 1.5 } },
  { id: 'tight_rack', name: 'Tight Rack', effect: 'Rack size reduced to 4.', severity: 2, hookId: 'tight_rack', params: { rackCap: 4 } },
  { id: 'fog', name: 'Fog', effect: 'Upcoming-letter queue is hidden.', severity: 2, hookId: 'fog', params: {} },
  { id: 'half_time', name: 'Half Time', effect: 'Timer −30%.', severity: 2, hookId: 'half_time', params: { factor: 0.7 } },
  { id: 'vowel_tax', name: 'Vowel Tax', effect: 'Vowels score 0 this round.', severity: 2, hookId: 'vowel_tax', params: {} },
  { id: 'overload', name: 'Overload', effect: 'Rack overflow ends the round immediately.', severity: 3, hookId: 'overload', params: {} },
  // --- the rest of the tab (P8-03); Decay is not implemented (words score when placed) ---
  { id: 'short_words_only', name: 'Short Words Only', effect: 'All words placed must be exactly 3 letters.', severity: 2, hookId: 'short_words', params: { length: 3 } },
  { id: 'gravity', name: 'Gravity', effect: 'Only the first word can be placed horizontally; all subsequent words must be placed vertically.', severity: 1, hookId: 'gravity', params: {} },
  { id: 'one_direction', name: 'One Direction', effect: 'Each word must be placed in the opposite direction to the previous one.', severity: 1, hookId: 'one_direction', params: {} },
  { id: 'silence', name: 'Silence', effect: 'No sound cues or timer ticks this round.', severity: 1, hookId: 'silence', params: {} },
  { id: 'scramble', name: 'Scramble', effect: 'The rack shuffles every 10 seconds.', severity: 1, hookId: 'scramble', params: { everyMs: 10000 } },
  { id: 'dead_letter', name: 'Dead Letter', effect: 'A random letter is banned; its tiles are lost when they arrive in the feed.', severity: 2, hookId: 'dead_letter', params: {} },
  { id: 'echo_rule', name: 'Echo Rule', effect: 'Each word must cross the previous word placed.', severity: 2, hookId: 'echo_rule', params: {} },
  { id: 'frozen_multiplier', name: 'Frozen Multiplier', effect: 'The morpheme multiplier is frozen at 1 morpheme lower than current.', severity: 2, hookId: 'frozen_multiplier', params: { penalty: 1 } },
  { id: 'starter_shrink', name: 'Starter Shrink', effect: 'The starter word is only its last morpheme, regardless of boss number.', severity: 2, hookId: 'starter_shrink', params: {} },
  { id: 'mirror_board', name: 'Mirror Board', effect: 'The board is half its normal size.', severity: 2, hookId: 'mirror_board', params: { factor: 0.5 } },
  { id: 'mute_modifiers', name: 'Mute Modifiers', effect: 'Tile modifiers are ignored this round.', severity: 3, hookId: 'mute_modifiers', params: {} },
  { id: 'toll', name: 'Toll', effect: 'Each word placed costs 1 currency.', severity: 1, hookId: 'toll', params: { perWord: 1 } },
  { id: 'wild_drought', name: 'Wild Drought', effect: 'Blank and Wild tiles are removed from the feed.', severity: 1, hookId: 'wild_drought', params: {} },
];
