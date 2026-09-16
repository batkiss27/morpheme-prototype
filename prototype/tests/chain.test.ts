/** P1-03: chain creation, natural extension, multi-step rounds, morpheme boundaries. */
import { describe, expect, it } from 'vitest';
import { chain as C } from '../src/engine';
import type { Chain, Side } from '../src/engine';
import { dict, tilesFor } from './helpers';
import fixtures from './fixtures/chain/natural.json';

interface Fixture {
  name: string;
  dictionary: string[];
  start: string;
  steps: { round: number; side: Side; letters: string }[];
  expect: {
    ok: boolean;
    text?: string;
    morphemeCount?: number;
    natural?: boolean;
    headText?: string;
    tailText?: string;
    addedInRound?: { round: number; front: number; back: number };
    stepIndex?: number;
    word?: string;
  };
}

function runFixture(f: Fixture) {
  const d = dict(...f.dictionary);
  const first = C.createChain(tilesFor(f.start, 's'), 1, d);
  if (!first.ok) return { ok: false as const, stepIndex: -1, word: first.word ?? '', error: first.error };
  let chain = first.value;
  for (let i = 0; i < f.steps.length; i++) {
    const step = f.steps[i] as Fixture['steps'][number];
    const r = C.extendNatural(chain, step.side, tilesFor(step.letters, `s${i}`), d, step.round);
    if (!r.ok) return { ok: false as const, stepIndex: i, word: r.word ?? '', error: r.error };
    chain = r.value;
  }
  return { ok: true as const, chain };
}

describe('chain fixtures', () => {
  for (const f of fixtures as Fixture[]) {
    it(f.name, () => {
      const r = runFixture(f);
      expect(r.ok).toBe(f.expect.ok);
      if (r.ok) {
        const c = r.chain;
        if (f.expect.text !== undefined) expect(C.text(c)).toBe(f.expect.text);
        if (f.expect.morphemeCount !== undefined) expect(C.morphemeCount(c)).toBe(f.expect.morphemeCount);
        if (f.expect.natural !== undefined) expect(c.natural).toBe(f.expect.natural);
        if (f.expect.headText !== undefined) expect(C.headText(c)).toBe(f.expect.headText);
        if (f.expect.tailText !== undefined) expect(C.tailText(c)).toBe(f.expect.tailText);
        if (f.expect.addedInRound) {
          const { round, front, back } = f.expect.addedInRound;
          expect(C.morphemesAddedIn(c, round)).toEqual({ front, back, total: front + back });
        }
      } else {
        expect(r.stepIndex).toBe(f.expect.stepIndex);
        expect(r.word).toBe(f.expect.word);
        expect(r.error).toBeTruthy();
      }
    });
  }
});

describe('chain structure', () => {
  const d = dict('bear', 'bearable', 'unbearable', 'unbearables');

  function build(): Chain {
    const c0 = C.createChain(tilesFor('bear', 'a'), 1, d);
    if (!c0.ok) throw new Error(c0.error);
    const c1 = C.extendNatural(c0.value, 'back', tilesFor('able', 'b'), d, 2);
    if (!c1.ok) throw new Error(c1.error);
    const c2 = C.extendNatural(c1.value, 'front', tilesFor('un', 'c'), d, 3);
    if (!c2.ok) throw new Error(c2.error);
    return c2.value;
  }

  it('records morpheme boundaries in positional order', () => {
    const c = build();
    expect(c.morphemes.map((m) => C.morphemeText(c, m))).toEqual(['un', 'bear', 'able']);
    expect(c.morphemes.map((m) => m.side)).toEqual(['front', 'start', 'back']);
    expect(c.morphemes.map((m) => m.round)).toEqual([3, 1, 2]);
    expect(c.morphemes.map((m) => C.morphemeStart(c, m))).toEqual([0, 2, 6]);
    expect(C.lastMorpheme(c).tileIds).toEqual(tilesFor('able', 'b').map((t) => t.id));
  });

  it('spans cover the whole chain while natural, and shift on front extension', () => {
    const c = build();
    expect(c.headSpan).toEqual([0, 10]);
    expect(c.tailSpan).toEqual([0, 10]);
    expect(c.natural).toBe(true);
  });

  it('every morpheme tile is in the chain exactly once', () => {
    const c = build();
    const fromMorphemes = c.morphemes.flatMap((m) => m.tileIds);
    expect(fromMorphemes).toEqual(c.tiles.map((t) => t.id));
  });

  it('does not mutate the input chain', () => {
    const c = build();
    const before = JSON.stringify(c);
    C.extendNatural(c, 'back', tilesFor('s', 'd'), d, 4);
    expect(JSON.stringify(c)).toBe(before);
  });

  it('applyNaturalSteps reports the validated word per step and the failing step', () => {
    const c0 = C.createChain(tilesFor('bear', 'a'), 1, d);
    if (!c0.ok) throw new Error(c0.error);
    const good = C.applyNaturalSteps(
      c0.value,
      [
        { side: 'back', tiles: tilesFor('able', 'b') },
        { side: 'front', tiles: tilesFor('un', 'c') },
      ],
      d,
      2,
    );
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.value.words).toEqual(['bearable', 'unbearable']);
      expect(C.morphemesAddedIn(good.value.chain, 2)).toEqual({ front: 1, back: 1, total: 2 });
    }
    const bad = C.applyNaturalSteps(
      c0.value,
      [
        { side: 'back', tiles: tilesFor('able', 'b') },
        { side: 'back', tiles: tilesFor('zz', 'c') },
      ],
      d,
      2,
    );
    expect(bad).toMatchObject({ ok: false, stepIndex: 1, word: 'bearablezz' });
  });

  it('a non-natural chain extends only the active side span', () => {
    // Simulate what an Extension card will do in M3: tail word diverges from head word.
    const c0 = C.createChain(tilesFor('bear', 'a'), 1, dict('bear', 'able', 'ables', 'unbear'));
    if (!c0.ok) throw new Error(c0.error);
    const forced: Chain = {
      ...C.appendTiles(c0.value, 'back', tilesFor('able', 'b'), { id: 'm:x', tileIds: tilesFor('able', 'b').map((t) => t.id), side: 'back', round: 2, viaCard: 'hyphen' }),
      natural: false,
      headSpan: [0, 4],
      tailSpan: [4, 8],
    };
    const dd = dict('bear', 'able', 'ables', 'unbear');
    const back = C.extendNatural(forced, 'back', tilesFor('s', 'c'), dd, 3);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(C.tailText(back.value)).toBe('ables');
      expect(C.headText(back.value)).toBe('bear');
      expect(back.value.natural).toBe(false);
    }
    const front = C.extendNatural(forced, 'front', tilesFor('un', 'd'), dd, 3);
    expect(front.ok).toBe(true);
    if (front.ok) {
      expect(C.headText(front.value)).toBe('unbear');
      expect(C.tailText(front.value)).toBe('able');
      expect(front.value.tailSpan).toEqual([6, 10]);
    }
    // The whole string is not a word, so a back extension is validated against the tail word only.
    expect(C.extendNatural(forced, 'back', tilesFor('s', 'c'), dict('bear', 'bearables'), 3).ok).toBe(false);
  });
});
