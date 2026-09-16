/** Helpers to drive the run reducer in tests. */
import { achievements, bossModifiers, cards, challenges, defaultBalance, inRunModifiers, letters, preRunCategories, risks, secretWords, tileModifiers } from '../src/content';
import { createRun, defaultLoadout, reduce, tiles as T } from '../src/engine';
import type { Balance, Dictionary, EngineContent, Letter, MorphemeSide, RunState } from '../src/engine';

/** Accepts any string of ≥ 2 letters — for transition tests where the word does not matter. */
export const anyDict: Dictionary = { has: (w) => w.length >= 2, size: Number.POSITIVE_INFINITY };

export function makeContent(dictionary: Dictionary = anyDict, balance: Balance = defaultBalance): EngineContent {
  return { balance, dictionary, letters, cards, bossModifiers, inRunModifiers, secretWords, preRun: { categories: preRunCategories, risks, challenges }, achievements, tileModifiers };
}

export function newRun(content: EngineContent, seed = 1, loadout = defaultLoadout): RunState {
  return createRun(seed, loadout, content);
}

/** Play the first `n` hand tiles on `side` (blanks played as E). */
export function playFromHand(state: RunState, content: EngineContent, n: number, side: MorphemeSide): RunState {
  const chosen = state.hand.slice(0, n);
  const playedAs: Record<string, Letter> = {};
  for (const t of chosen) if (T.isBlank(t)) playedAs[t.id] = 'E';
  return reduce(state, { type: 'PLAY_STEP', side, tileIds: chosen.map((t) => t.id), playedAs }, content);
}

/** One full regular round: START_ROUND → one step → SUBMIT → CONTINUE → LEAVE (if a shop was offered). */
export function playRegularRound(state: RunState, content: EngineContent, n = 1): RunState {
  let s = reduce(state, { type: 'START_ROUND' }, content);
  // The first word needs ≥ 2 letters.
  s = playFromHand(s, content, s.chain ? n : Math.max(n, 2), s.chain ? 'back' : 'start');
  if (s.phase === 'EXTEND' && s.steps.length === 0) throw new Error(`playRegularRound: ${s.log.at(-1)?.error}`);
  s = reduce(s, { type: 'SUBMIT' }, content);
  s = reduce(s, { type: 'CONTINUE' }, content);
  if (s.phase === 'SHOP') s = reduce(s, { type: 'LEAVE' }, content);
  return s;
}

/** One boss round ended early: START_ROUND → START_BOSS → END_BOSS(wordPoints, default = enough to pass) → CONTINUE → PICK_MODIFIER. */
export function playBossRound(state: RunState, content: EngineContent, wordPoints = 1_000_000): RunState {
  let s = reduce(state, { type: 'START_ROUND' }, content);
  s = reduce(s, { type: 'START_BOSS' }, content);
  s = reduce(s, { type: 'END_BOSS', wordPoints }, content);
  s = reduce(s, { type: 'CONTINUE' }, content);
  while (s.phase === 'BOSS_REWARD') {
    const id = s.boss?.reward?.offers[0];
    s = reduce(s, id ? { type: 'PICK_MODIFIER', id } : { type: 'PICK_MODIFIER' }, content);
  }
  return s;
}
