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
];
