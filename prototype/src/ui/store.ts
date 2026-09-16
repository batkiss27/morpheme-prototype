/**
 * Minimal external store (useSyncExternalStore). Wraps the engine reducer,
 * loads the dictionary, and owns the seed. The engine never sees this file.
 */

import { useSyncExternalStore } from 'react';
import { createRun, dictionary as dictFns, reduce, defaultLoadout } from '../engine';
import type { Action, Balance, Dictionary, EngineContent, PreRunLoadout, RunState } from '../engine';
import { defaultBalance, letters } from '../content';

export type DictionaryStatus =
  | { state: 'loading' }
  | { state: 'ready'; dictionary: Dictionary }
  | { state: 'error'; message: string };

export interface StoreState {
  dictionary: DictionaryStatus;
  balance: Balance;
  run: RunState | null;
}

let state: StoreState = {
  dictionary: { state: 'loading' },
  balance: defaultBalance,
  run: null,
};

const listeners = new Set<() => void>();

function setState(patch: Partial<StoreState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, () => state);
}

export function getState(): StoreState {
  return state;
}

// ---------------------------------------------------------------------------
// Dictionary (spec §8): the only network calls in the app.
// ---------------------------------------------------------------------------

let dictionaryLoad: Promise<void> | null = null;

/** Idempotent: repeated calls (e.g. StrictMode double effects) share one fetch. */
export function loadDictionary(): Promise<void> {
  dictionaryLoad ??= loadDictionaryOnce();
  return dictionaryLoad;
}

async function loadDictionaryOnce(): Promise<void> {
  try {
    const t0 = performance.now();
    const [base, custom] = await Promise.all([fetchText('/dict/enable1.txt'), fetchText('/dict/custom.txt')]);
    const dictionary = dictFns.createDictionaryFromTexts(base, custom);
    console.log(`dictionary loaded: ${dictionary.size} words in ${Math.round(performance.now() - t0)} ms`);
    setState({ dictionary: { state: 'ready', dictionary } });
  } catch (e) {
    setState({ dictionary: { state: 'error', message: e instanceof Error ? e.message : String(e) } });
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export function content(): EngineContent {
  if (state.dictionary.state !== 'ready') throw new Error('dictionary not loaded');
  return { balance: state.balance, dictionary: state.dictionary.dictionary, letters };
}

export function startRun(seed: number, loadout: PreRunLoadout = defaultLoadout): void {
  setState({ run: createRun(seed, loadout, content()) });
}

export function dispatch(action: Action): void {
  if (!state.run) throw new Error('no run in progress');
  setState({ run: reduce(state.run, action, content()) });
}

export function setBalance(balance: Balance): void {
  setState({ balance });
}
