/**
 * Seeded PRNG (mulberry32). Pure: every function returns the next state
 * instead of mutating, so the run reducer stays replayable and the state is
 * a plain serializable object.
 */

export interface RngState {
  /** 32-bit internal state. */
  readonly a: number;
}

export function create(seed: number): RngState {
  return { a: seed >>> 0 };
}

/** Uniform float in [0, 1). */
export function next(state: RngState): [number, RngState] {
  let a = (state.a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { a }];
}

/** Uniform integer in [0, n). */
export function int(state: RngState, n: number): [number, RngState] {
  if (n <= 0) throw new Error(`rng.int: n must be positive, got ${n}`);
  const [v, s] = next(state);
  return [Math.floor(v * n), s];
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(state: RngState, arr: readonly T[]): [T[], RngState] {
  const out = arr.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    let j: number;
    [j, s] = int(s, i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return [out, s];
}

/** Derive a numeric seed from a string (for seed inputs like "banana"). */
export function seedFromString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
