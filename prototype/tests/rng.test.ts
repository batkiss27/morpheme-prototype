import { describe, expect, it } from 'vitest';
import { rng } from '../src/engine';

describe('rng', () => {
  it('same seed → same sequence', () => {
    let a = rng.create(42);
    let b = rng.create(42);
    for (let i = 0; i < 100; i++) {
      let x: number, y: number;
      [x, a] = rng.next(a);
      [y, b] = rng.next(b);
      expect(x).toBe(y);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('different seeds → different sequences', () => {
    const [x] = rng.next(rng.create(1));
    const [y] = rng.next(rng.create(2));
    expect(x).not.toBe(y);
  });

  it('state is serializable and resumable', () => {
    const [, s1] = rng.next(rng.create(7));
    const restored = JSON.parse(JSON.stringify(s1)) as rng.RngState;
    expect(rng.next(restored)[0]).toBe(rng.next(s1)[0]);
  });

  it('int(n) stays in [0, n)', () => {
    let s = rng.create(99);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      let v: number;
      [v, s] = rng.int(s, 6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
    expect(() => rng.int(s, 0)).toThrow();
  });

  it('shuffle is a permutation, deterministic, and does not mutate', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const [a] = rng.shuffle(rng.create(3), arr);
    const [b] = rng.shuffle(rng.create(3), arr);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).not.toEqual(arr);
  });

  it('seedFromString is stable', () => {
    expect(rng.seedFromString('banana')).toBe(rng.seedFromString('banana'));
    expect(rng.seedFromString('banana')).not.toBe(rng.seedFromString('bananb'));
  });
});
