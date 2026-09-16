/**
 * Run export and replay (spec §9 / P1-07, P6-03).
 *
 * An export is `{ seed, loadout, balance, actions[] }` — everything needed to
 * rebuild the final state by folding `reduce` over the actions from
 * `createRun`. Balance edits made mid-run travel inside the actions
 * (`DEBUG { kind: 'balance' }`), so replays are exact.
 */

import * as cards from './cards';
import { createRun, reduce } from './run';
import type { Action, Balance, EngineContent, PreRunLoadout, RunState } from './types';

export const EXPORT_VERSION = 2;

export interface RunExport {
  version: number;
  seed: number;
  loadout: PreRunLoadout;
  /** The balance the run started with (v2). */
  balance?: Balance;
  actions: Action[];
}

export function exportRun(state: RunState, balance?: Balance): RunExport {
  const exp: RunExport = {
    version: EXPORT_VERSION,
    seed: state.seed,
    loadout: state.preRun,
    actions: state.log.map((e) => e.action),
  };
  if (balance) exp.balance = balance;
  return exp;
}

export function exportRunJson(state: RunState, balance?: Balance): string {
  return JSON.stringify(exportRun(state, balance), null, 2);
}

function contentFor(exp: RunExport, content: EngineContent): EngineContent {
  return exp.balance ? { ...content, balance: exp.balance } : content;
}

/** Rebuild the final state from an export. Identical content ⇒ identical state. */
export function replay(exp: RunExport, content: EngineContent): RunState {
  if (exp.version !== 1 && exp.version !== EXPORT_VERSION) {
    throw new Error(`unsupported export version ${exp.version} (expected ${EXPORT_VERSION})`);
  }
  const c = contentFor(exp, content);
  return exp.actions.reduce((s, a) => reduce(s, a, c), createRun(exp.seed, exp.loadout, c));
}

/** One line of the per-round table (P6-03). */
export interface RoundSummary {
  round: number;
  kind: 'regular' | 'boss';
  chain: string;
  morphemes: number;
  score: number;
  threshold: number;
  margin: number;
  passed: boolean;
  outcome: string;
  currencyEarned: number;
  cardsUsed: string[];
}

/**
 * Replay an export and collect a summary of every scored round. Cards used
 * are taken from the actions of that round (PLAY_STEP via card, USE_CARD).
 */
export function replayWithHistory(exp: RunExport, content: EngineContent): { state: RunState; history: RoundSummary[] } {
  const c = contentFor(exp, content);
  let s = createRun(exp.seed, exp.loadout, c);
  const history: RoundSummary[] = [];
  let cardsUsed: string[] = [];
  for (const a of exp.actions) {
    const before = s;
    s = reduce(s, a, c);
    const rejected = s.log[s.log.length - 1]?.error !== undefined;
    if (!rejected) {
      if (a.type === 'PLAY_STEP' && a.viaCard) {
        const id = before.cards.find((x) => x.instanceId === a.viaCard)?.cardId;
        if (id) cardsUsed.push(id);
      } else if (a.type === 'USE_CARD') {
        const id = before.cards.find((x) => x.instanceId === a.instanceId)?.cardId;
        if (id) cardsUsed.push(id);
      }
    }
    const scored = (s.phase === 'SCORED' || s.phase === 'BOSS_END') && before.phase !== s.phase && s.lastResult;
    if (scored && s.lastResult) {
      const r = s.lastResult;
      history.push({
        round: r.round,
        kind: r.kind,
        chain: s.chain ? s.chain.tiles.map((t) => t.playedAs ?? t.letter).join('').toLowerCase() : '',
        morphemes: r.morphemes,
        score: r.score,
        threshold: r.threshold,
        margin: r.score - r.threshold,
        passed: r.passed,
        outcome: r.outcome,
        currencyEarned: r.currencyEarned,
        cardsUsed: cardsUsed.map((id) => cards.cardSpec(c, id)?.name ?? id),
      });
      cardsUsed = [];
    }
  }
  return { state: s, history };
}

export function parseRunExport(json: string): RunExport {
  const parsed = JSON.parse(json) as Partial<RunExport>;
  if (typeof parsed.seed !== 'number' || !Array.isArray(parsed.actions) || !parsed.loadout) {
    throw new Error('not a run export');
  }
  const exp: RunExport = { version: parsed.version ?? EXPORT_VERSION, seed: parsed.seed, loadout: parsed.loadout, actions: parsed.actions };
  if (parsed.balance) exp.balance = parsed.balance;
  return exp;
}
