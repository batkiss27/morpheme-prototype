import { describe, expect, it } from 'vitest';
import { defaultBalance } from '../src/content';

describe('smoke', () => {
  it('the toolchain runs a test', () => {
    expect(defaultBalance.rounds.total).toBe(24);
  });
});
