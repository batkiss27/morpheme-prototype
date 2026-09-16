/**
 * Run export and replay (spec §9 / P1-07).
 *
 * An export is `{ seed, loadout, actions[] }` — everything needed to rebuild
 * the final state by folding `reduce` over the actions from `createRun`.
 */

import { createRun, reduce } from './run';
import type { Action, EngineContent, PreRunLoadout, RunState } from './types';

export const EXPORT_VERSION = 1;

export interface RunExport {
  version: number;
  seed: number;
  loadout: PreRunLoadout;
  actions: Action[];
}

export function exportRun(state: RunState): RunExport {
  return {
    version: EXPORT_VERSION,
    seed: state.seed,
    loadout: state.preRun,
    actions: state.log.map((e) => e.action),
  };
}

export function exportRunJson(state: RunState): string {
  return JSON.stringify(exportRun(state), null, 2);
}

/** Rebuild the final state from an export. Identical content ⇒ identical state. */
export function replay(exp: RunExport, content: EngineContent): RunState {
  if (exp.version !== EXPORT_VERSION) {
    throw new Error(`unsupported export version ${exp.version} (expected ${EXPORT_VERSION})`);
  }
  return exp.actions.reduce((s, a) => reduce(s, a, content), createRun(exp.seed, exp.loadout, content));
}

export function parseRunExport(json: string): RunExport {
  const parsed = JSON.parse(json) as Partial<RunExport>;
  if (typeof parsed.seed !== 'number' || !Array.isArray(parsed.actions) || !parsed.loadout) {
    throw new Error('not a run export');
  }
  return { version: parsed.version ?? EXPORT_VERSION, seed: parsed.seed, loadout: parsed.loadout, actions: parsed.actions };
}
