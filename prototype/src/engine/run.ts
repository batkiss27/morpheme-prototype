/**
 * Run state machine (spec §5). `reduce` is pure: same (state, action, content)
 * → equal state. Time enters as `BOSS_TICK`; randomness lives in `state.rng`.
 *
 *   ROUND_START ─START_ROUND─► EXTEND ─SUBMIT─► SCORED ─CONTINUE─► SHOP ─LEAVE─► ROUND_START
 *        │                        │ FORFEIT ─────► SCORED (score 0, always a fail)
 *        │                                        │ fail w/ life → ROUND_START (no shop)
 *        │ boss round                             │ fail w/o life → GAME_OVER
 *        ▼
 *   BOSS_INTRO ─START_BOSS─► BOSS_PLAY ─END_BOSS─► BOSS_END ─CONTINUE─► BOSS_REWARD ─PICK_MODIFIER─► ROUND_START / WIN
 *                                                     │ fail w/ life → ROUND_START (retry same boss, D1)
 *                                                     │ fail w/o life → GAME_OVER
 *
 * Boss phases are stubs until M4: END_BOSS takes the placed-word points as an
 * input (omitted = auto-pass at exactly the threshold).
 */

import * as chainMod from './chain';
import * as rng from './rng';
import * as scoring from './scoring';
import * as tiles from './tiles';
import type {
  Action,
  Chain,
  EngineContent,
  PreRunLoadout,
  RoundResult,
  RunEvent,
  RunState,
  StepRecord,
  Tile,
} from './types';

export const defaultLoadout: PreRunLoadout = { tileModifiers: [], categories: {} };

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export function createRun(seed: number, loadout: PreRunLoadout, content: EngineContent): RunState {
  const { balance } = content;
  return {
    seed,
    rng: rng.create(seed),
    round: 1,
    phase: 'ROUND_START',
    lives: balance.lives.base + (loadout.categories.second_breath ?? 0),
    currency: 0,
    pool: tiles.createPool({ letters: content.letters }, loadout),
    hand: [],
    chain: null,
    cards: [],
    inRun: [],
    preRun: loadout,
    streak: 0,
    shop: null,
    boss: null,
    log: [],
    flags: {},
    steps: [],
    roundStart: null,
    lastResult: null,
    strainThisRound: 0,
  };
}

// ---------------------------------------------------------------------------
// Hooks that later milestones fill in
// ---------------------------------------------------------------------------

/** In-run modifier multiplier. M5 computes this from `state.inRun`. */
export function inRunMultiplier(_state: RunState): number {
  return 1;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type Step = { ok: true; state: RunState } | { ok: false; error: string };

const ok = (state: RunState): Step => ({ ok: true, state });
const fail = (error: string): Step => ({ ok: false, error });

export function reduce(state: RunState, action: Action, content: EngineContent): RunState {
  const result = apply(state, action, content);
  const event: RunEvent = { seq: state.log.length, round: state.round, phase: state.phase, action };
  if (result.ok) {
    return { ...result.state, log: [...state.log, event] };
  }
  return { ...state, log: [...state.log, { ...event, error: result.error }] };
}

/** The most recent rejected action's error, if the last action was rejected. */
export function lastError(state: RunState): string | undefined {
  const last = state.log[state.log.length - 1];
  return last?.error;
}

function apply(state: RunState, action: Action, content: EngineContent): Step {
  const { balance } = content;
  const wrong = (): Step => fail(`${action.type} is not allowed in phase ${state.phase}`);

  switch (action.type) {
    case 'START_ROUND': {
      if (state.phase !== 'ROUND_START') return wrong();
      const base: RunState = { ...state, steps: [], strainThisRound: 0, shop: null };
      if (scoring.isBossRound(state.round, balance)) {
        return ok({
          ...base,
          phase: 'BOSS_INTRO',
          boss: { bossNumber: scoring.bossNumber(state.round, balance), wordPoints: 0 },
        });
      }
      const d = tiles.draw(state.pool, balance.hand.size, state.rng);
      return ok({
        ...base,
        phase: 'EXTEND',
        pool: d.pool,
        hand: d.drawn,
        rng: d.rng,
        roundStart: { chain: state.chain, hand: d.drawn },
      });
    }

    case 'PLAY_STEP': {
      if (state.phase !== 'EXTEND') return wrong();
      if (action.viaCard !== undefined) return fail('extension cards are not implemented yet (M3)');
      const r = playStep(state, action, content);
      if (!r.ok) return r;
      return ok(r.state);
    }

    case 'UNDO_STEP': {
      if (state.phase !== 'EXTEND') return wrong();
      if (state.steps.length === 0 || !state.roundStart) return fail('nothing to undo');
      // Re-apply every step but the last from the round's starting position.
      let s: RunState = {
        ...state,
        chain: state.roundStart.chain,
        hand: state.roundStart.hand,
        steps: [],
        strainThisRound: 0,
      };
      for (const step of state.steps.slice(0, -1)) {
        const r = playStep(s, { type: 'PLAY_STEP', ...stepToAction(step) }, content);
        if (!r.ok) return fail(`undo replay failed: ${r.error}`);
        s = r.state;
      }
      return ok(s);
    }

    case 'SUBMIT': {
      if (state.phase !== 'EXTEND') return wrong();
      if (state.steps.length === 0 || !state.chain) return fail('extend by at least one morpheme before submitting');
      const chain = state.chain;
      const shape = chainMod.morphemesAddedIn(chain, state.round);
      const breakdown = scoring.scoreRegular(
        {
          round: state.round,
          wordPoints: scoring.wordPoints(chain),
          morphemes: chainMod.morphemeCount(chain),
          strainCount: state.strainThisRound,
          extension: shape,
          inRunMult: inRunMultiplier(state),
        },
        balance,
      );
      const natural = state.strainThisRound === 0;
      const after = settle(state, breakdown, natural ? state.streak + 1 : 0, balance.economy.roundClear);
      return ok({
        ...after,
        phase: 'SCORED',
        pool: tiles.returnTiles(state.pool, state.hand),
        hand: [],
        roundStart: null,
      });
    }

    case 'FORFEIT': {
      if (state.phase !== 'EXTEND' || !state.roundStart) return wrong();
      // Give up the round: this round's steps are discarded, the hand returns
      // to the pool, and the round scores 0 (always a fail).
      const chain = state.roundStart.chain;
      const breakdown = scoring.scoreRegular(
        {
          round: state.round,
          wordPoints: 0,
          morphemes: chain ? chainMod.morphemeCount(chain) : 0,
          strainCount: 0,
          extension: { front: 0, back: 0 },
          inRunMult: inRunMultiplier(state),
        },
        balance,
      );
      const after = settle(state, breakdown, 0, 0);
      return ok({
        ...after,
        phase: 'SCORED',
        chain,
        pool: tiles.returnTiles(state.pool, state.roundStart.hand),
        hand: [],
        steps: [],
        roundStart: null,
      });
    }

    case 'CONTINUE': {
      if (state.phase !== 'SCORED' && state.phase !== 'BOSS_END') return wrong();
      const result = state.lastResult;
      if (!result) return fail('no round result to continue from');
      if (result.outcome === 'game_over') return ok({ ...state, phase: 'GAME_OVER' });
      if (result.outcome === 'life_lost') {
        // Regular: move on without a shop. Boss: retry the same boss (D1).
        return ok(state.phase === 'SCORED' ? advanceRound(state, balance) : { ...state, phase: 'ROUND_START', boss: null });
      }
      if (state.phase === 'BOSS_END') return ok({ ...state, phase: 'BOSS_REWARD' });
      return ok({ ...state, phase: 'SHOP', shop: { rerolls: 0 } });
    }

    case 'LEAVE': {
      if (state.phase !== 'SHOP') return wrong();
      return ok(advanceRound({ ...state, shop: null }, balance));
    }

    // --- Boss stubs (M4) ---------------------------------------------------

    case 'START_BOSS': {
      if (state.phase !== 'BOSS_INTRO') return wrong();
      return ok({ ...state, phase: 'BOSS_PLAY' });
    }

    case 'BOSS_TICK': {
      if (state.phase !== 'BOSS_PLAY') return wrong();
      return ok(state);
    }

    case 'END_BOSS': {
      if (state.phase !== 'BOSS_PLAY' || !state.boss) return wrong();
      const morphemes = state.chain ? chainMod.morphemeCount(state.chain) : 1;
      const inRunMult = inRunMultiplier(state);
      const t = scoring.threshold(state.round, balance);
      const wordPoints =
        action.wordPoints ?? Math.ceil(t / (scoring.morphemeMultiplier(morphemes, balance) * inRunMult));
      const breakdown = scoring.scoreBoss(
        { round: state.round, bossWordPoints: wordPoints, morphemes, inRunMult },
        balance,
      );
      const bonus = balance.economy.bossClear[state.boss.bossNumber - 1] ?? 0;
      const after = settle(state, breakdown, state.streak, bonus);
      return ok({ ...after, phase: 'BOSS_END', boss: { ...state.boss, wordPoints } });
    }

    case 'PICK_MODIFIER': {
      if (state.phase !== 'BOSS_REWARD') return wrong();
      const inRun = action.id !== undefined ? [...state.inRun, action.id] : state.inRun;
      return ok(advanceRound({ ...state, inRun, boss: null }, balance));
    }

    default:
      return fail(`unknown action ${(action as { type: string }).type}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stepToAction(step: StepRecord): Omit<Extract<Action, { type: 'PLAY_STEP' }>, 'type'> {
  const a: Omit<Extract<Action, { type: 'PLAY_STEP' }>, 'type'> = { side: step.side, tileIds: step.tileIds };
  if (step.playedAs) a.playedAs = step.playedAs;
  if (step.viaCard !== undefined) a.viaCard = step.viaCard;
  return a;
}

/** One natural step: commit tiles from the hand, validate, record. */
function playStep(
  state: RunState,
  action: Extract<Action, { type: 'PLAY_STEP' }>,
  content: EngineContent,
): Step {
  const committed = tiles.commit(state.hand, action.tileIds, action.playedAs);
  if ('error' in committed) return fail(committed.error);

  let next: Chain;
  if (state.chain === null) {
    if (action.side !== 'start') return fail('the first word must be played with side "start"');
    const r = chainMod.createChain(committed.committed, state.round, content.dictionary);
    if (!r.ok) return fail(r.error);
    next = r.value;
  } else {
    if (action.side !== 'front' && action.side !== 'back') {
      return fail(`side "${action.side}" is not a natural extension`);
    }
    const r = chainMod.extendNatural(state.chain, action.side, committed.committed, content.dictionary, state.round);
    if (!r.ok) return fail(r.error);
    next = r.value;
  }

  const record: StepRecord = {
    side: action.side,
    tileIds: action.tileIds,
    word: action.side === 'front' ? chainMod.headText(next) : chainMod.tailText(next),
  };
  if (action.playedAs) record.playedAs = action.playedAs;

  return ok({ ...state, chain: next, hand: committed.hand, steps: [...state.steps, record] });
}

/** Apply pass/fail consequences: lives, currency, streak, lastResult. */
function settle(
  state: RunState,
  breakdown: scoring.ScoreBreakdown,
  streakIfPassed: number,
  currencyIfPassed: number,
): RunState {
  if (breakdown.passed) {
    const result: RoundResult = { ...breakdown, outcome: 'pass', currencyEarned: currencyIfPassed };
    return { ...state, lastResult: result, streak: streakIfPassed, currency: state.currency + currencyIfPassed };
  }
  if (state.lives > 0) {
    const result: RoundResult = { ...breakdown, outcome: 'life_lost', currencyEarned: 0 };
    return { ...state, lastResult: result, streak: 0, lives: state.lives - 1 };
  }
  const result: RoundResult = { ...breakdown, outcome: 'game_over', currencyEarned: 0 };
  return { ...state, lastResult: result, streak: 0 };
}

/** Next round, or WIN after the last one. */
function advanceRound(state: RunState, balance: EngineContent['balance']): RunState {
  if (state.round >= balance.rounds.total) return { ...state, phase: 'WIN' };
  return { ...state, round: state.round + 1, phase: 'ROUND_START' };
}

/** All tiles the run owns, wherever they are (for the conservation invariant). */
export function allTiles(state: RunState): Tile[] {
  return [...state.pool, ...state.hand, ...(state.chain?.tiles ?? [])];
}
