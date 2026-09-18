/**
 * Pre-run modifiers — the *Pre-Run Modifiers* tab, prototype subset
 * (spec §7): four positive categories, the Steep Curve risk, four
 * challenges. Numbers live in balance.preRun; this file is the text.
 */

import type { ChallengeSpec, PreRunCategorySpec, RiskSpec } from '../engine/types';

export const preRunCategories: PreRunCategorySpec[] = [
  { id: 'second_breath', name: 'Second Breath', levels: ['1 extra life', '2 extra lives', '3 extra lives', '4 extra lives'] },
  {
    id: 'treasury',
    name: 'Treasury',
    levels: ['+1 currency per round cleared', 'Natural streak bonus doubled', '10% shop discount', 'Natural word dividend doubled'],
  },
  { id: 'substrate', name: 'Substrate', levels: ['1 free redraw per round', 'Hand size +1', 'Hand +1, 1 free redraw per round', 'Hand +2, 1 free redraw per round'] },
  { id: 'tempo', name: 'Tempo', levels: ['Boss timer +10%', 'Boss timer +20%', 'Boss timer +20%, feed 10% slower', 'Boss timer +30%, feed 20% slower, rack +1'] },
];

export const risks: RiskSpec[] = [
  {
    id: 'steep_curve',
    name: 'Steep Curve',
    levels: ['All thresholds ×1.15', 'All thresholds ×1.3', 'All thresholds ×1.5', 'All thresholds ×1.75'],
    points: [1, 2, 3, 4],
  },
];

export const challenges: ChallengeSpec[] = [
  { id: 'vowel_thief', name: 'Vowel Thief', effect: 'All vowel tiles have base value 0.', points: 2 },
  { id: 'tight_clock', name: 'Tight Clock', effect: 'Boss timer −30%.', points: 2 },
  { id: 'no_breath', name: 'No Breath', effect: 'Second Breath disabled; any failed threshold ends the run.', points: 3 },
  { id: 'inflation', name: 'Inflation', effect: 'Shop prices +50%.', points: 2 },
];
