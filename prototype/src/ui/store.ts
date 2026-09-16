/**
 * Minimal external store (useSyncExternalStore). Wraps the engine reducer,
 * loads the dictionary, and owns the seed. The engine never sees this file.
 */

import { useSyncExternalStore } from 'react';
import { createRun, dictionary as dictFns, lastError, reduce, defaultLoadout, rng as rngFns } from '../engine';
import { playCue } from './audio';
import type { Action, Balance, CardSpec, Dictionary, EngineContent, PreRunLoadout, RunState } from '../engine';
import { bossModifiers, cards, defaultBalance, letters } from '../content';
import { validateCards } from '../engine/cards';
import { validateBossModifiers } from '../engine/boss';

// Startup checks: every card / boss modifier names an implemented effect (P3-01, P4-04).
validateCards(cards);
validateBossModifiers(bossModifiers);

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
  return useSyncExternalStore(subscribe, () => state, () => state);
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
  return { balance: state.balance, dictionary: state.dictionary.dictionary, letters, cards, bossModifiers };
}

/**
 * A seed input is either a number or any string (hashed). Empty → random.
 */
export function parseSeed(input: string): number {
  const trimmed = input.trim();
  if (trimmed === '') return randomSeed();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) >>> 0;
  return rngFns.seedFromString(trimmed);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function startRun(seed: number, loadout: PreRunLoadout = defaultLoadout): void {
  setState({ run: autoAdvance(createRun(seed, loadout, content())) });
}

export function dispatch(action: Action): void {
  if (!state.run) throw new Error('no run in progress');
  const before = state.run;
  const after = reduce(before, action, content());
  const cue = cueFor(before, action);
  if (cue && !lastError(after)) playCue(cue.cueId, cue.rarity);
  setState({ run: autoAdvance(after) });
}

/** The card whose cue should play if this action succeeds (bought or used). */
function cueFor(run: RunState, action: Action): CardSpec | undefined {
  const spec = (cardId: string | undefined) => cards.find((c) => c.id === cardId);
  const held = (instanceId: string) => spec(run.cards.find((c) => c.instanceId === instanceId)?.cardId);
  switch (action.type) {
    case 'USE_CARD':
      return held(action.instanceId);
    case 'PLAY_STEP':
      return action.viaCard ? held(action.viaCard) : undefined;
    case 'BUY_CARD':
      return spec(run.shop?.offers[action.slot]?.cardId);
    default:
      return undefined;
  }
}

/** Back to the start screen. */
export function endRun(): void {
  setState({ run: null });
}

/** ROUND_START has no screen: the UI drives the START_ROUND arrow itself (spec §5). */
function autoAdvance(run: RunState): RunState {
  let r = run;
  while (r.phase === 'ROUND_START') r = reduce(r, { type: 'START_ROUND' }, content());
  return r;
}

export function setBalance(balance: Balance): void {
  setState({ balance });
}

/** Inject a dictionary directly (tests, or a future "add word" admin hook). */
export function setDictionary(dictionary: Dictionary): void {
  setState({ dictionary: { state: 'ready', dictionary } });
}
