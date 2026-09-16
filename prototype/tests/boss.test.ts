/** P4-01 … P4-04, P4-06: board, placement, feed/timer, boss modifiers, boss transitions. */
import { describe, expect, it } from 'vitest';
import { bossModifiers, defaultBalance } from '../src/content';
import { boss as B, chain as C, lastError, reduce, rng } from '../src/engine';
import type { Board, BossModifierSpec, BossRules, Letter, PlacedTile, RunState, Tile } from '../src/engine';
import { balanceWith, chainFromMorphemes, dict, tilesFor, values, withCards } from './helpers';
import { anyDict, makeContent, newRun, playRegularRound } from './run-driver';
import fixtures from './fixtures/boss/placement.json';

const b = defaultBalance;
const rules0 = (): BossRules => B.baseRules(1, b);

function boardFrom(rows: string[]): Board {
  const size = rows.length;
  const board = B.createBoard(size);
  const cells = board.cells.slice();
  const starter: number[] = [];
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const L = ch.toUpperCase() as Letter;
      cells[r * size + c] = { id: `s${r}${c}`, letter: L, baseValue: values[L] ?? 0, modifiers: [] };
      starter.push(r * size + c);
    });
  });
  return { ...board, cells, starter };
}

const tile = (ch: string, id: string): Tile => ({ id, letter: ch.toUpperCase() as Letter, baseValue: values[ch.toUpperCase()] ?? 0, modifiers: [] });

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

describe('board', () => {
  it('creates an empty N×N grid', () => {
    const board = B.createBoard(15);
    expect(board.cells).toHaveLength(225);
    expect(B.isEmpty(board)).toBe(true);
    expect(B.inBounds(board, 14, 14)).toBe(true);
    expect(B.inBounds(board, 15, 0)).toBe(false);
    expect(B.rowCol(board, 16)).toEqual([1, 1]);
  });

  it('places the starter centred on the middle row', () => {
    const board = B.placeStarter(B.createBoard(15), tilesFor('informal'));
    expect(board.starter).toHaveLength(8);
    const [r, c] = B.rowCol(board, board.starter[0]!);
    expect(r).toBe(7);
    expect(c).toBe(3);
    expect(B.tileAt(board, 7, 3)?.letter).toBe('I');
    expect(B.tileAt(board, 7, 10)?.letter).toBe('L');
    expect(B.tileAt(board, 7, 11)).toBeNull();
  });

  it('starter morphemes follow D7: B1 full, B2 last 3, B3 last 2, B4+ last 1', () => {
    const chain = chainFromMorphemes(['in', 'form', 'al', 'ly']);
    const text = (t: Tile[]) => C.lettersOf(t);
    expect(text(B.starterTiles(chain, 1, b))).toBe('informally');
    expect(text(B.starterTiles(chain, 2, b))).toBe('formally');
    expect(text(B.starterTiles(chain, 3, b))).toBe('ally');
    expect(text(B.starterTiles(chain, 4, b))).toBe('ly');
    expect(text(B.starterTiles(chain, 6, b))).toBe('ly');
    expect(text(B.starterTiles(chain, 1, b, { starterShrink: true }))).toBe('ly');
  });

  it('a starter longer than the board keeps its last `size` letters', () => {
    const chain = chainFromMorphemes(['abcdefgh', 'ijklmnop', 'qr']);
    expect(B.starterTiles(chain, 1, b)).toHaveLength(15);
    expect(C.lettersOf(B.starterTiles(chain, 1, b))).toBe('bcdefghijklmnopqr'.slice(-15));
  });

  it('typingCells skips occupied cells and stops at the edge', () => {
    const board = boardFrom(['.....', '.....', '.abc.', '.....', '.....']);
    expect(B.typingCells(board, 2, 0, 'H', 2)).toEqual([[2, 0], [2, 4]]);
    expect(B.typingCells(board, 0, 2, 'V', 3)).toEqual([[0, 2], [1, 2], [3, 2]]);
    expect(B.typingCells(board, 4, 3, 'V', 2)).toEqual([[4, 3]]);
  });

  it('boss copies keep modifiers and get unique ids per cycle', () => {
    const t: Tile = { id: 'E1', letter: 'E', baseValue: 1, modifiers: ['plus1'] };
    expect(B.bossCopy(t, 1)).toEqual({ ...t, id: 'E1~b1' });
    expect(B.bossCopy(t, 2).id).toBe('E1~b2');
  });
});

// ---------------------------------------------------------------------------
// Placement (fixtures)
// ---------------------------------------------------------------------------

interface Fixture {
  name: string;
  board: string[];
  dictionary: string[];
  rules?: Partial<BossRules>;
  placed: [number, number, string][];
  expect: { ok: boolean; main?: string; cross?: string[]; points?: number; error?: string };
}

describe('placement fixtures', () => {
  for (const f of fixtures as unknown as Fixture[]) {
    it(f.name, () => {
      const board = boardFrom(f.board);
      const placed: PlacedTile[] = f.placed.map(([row, col, ch], i) => ({ row, col, tile: tile(ch, `p${i}`) }));
      const r = B.validatePlacement(board, placed, dict(...f.dictionary), { ...rules0(), ...f.rules });
      if (!f.expect.ok || f.expect.error) {
        expect(r.ok).toBe(false);
        if (!r.ok && f.expect.error) expect(r.error).toContain(f.expect.error);
        return;
      }
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.main.word).toBe(f.expect.main);
      expect(r.value.cross.map((w) => w.word)).toEqual(f.expect.cross);
      expect(r.value.points).toBe(f.expect.points);
      const after = B.applyPlacement(board, placed);
      expect(after.cells.filter(Boolean)).toHaveLength(board.cells.filter(Boolean).length + placed.length);
    });
  }

  it('resolveRack takes exact letters first, then blanks', () => {
    const rack: Tile[] = [tile('a', 'a'), { id: 'b', letter: '_', baseValue: 0, modifiers: [] }, tile('r', 'r')];
    const r = B.resolveRack(rack, 'arm');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.used.map((t) => t.id)).toEqual(['a', 'r', 'b']);
    expect(r.value.used[2]?.playedAs).toBe('M');
    expect(r.value.rack).toEqual([]);
    expect(B.resolveRack(rack, 'arms')).toMatchObject({ ok: false, error: expect.stringContaining('"S"') });
    expect(B.resolveRack(rack, 'a1')).toMatchObject({ ok: false });
  });

  it('placementsFor lays typed tiles across occupied cells', () => {
    const board = boardFrom(['.....', '.....', '.abc.', '.....', '.....']);
    const r = B.placementsFor(board, 2, 0, 'H', [tile('x', '1'), tile('y', '2')]);
    expect(r.ok && r.value.map((p) => [p.row, p.col])).toEqual([[2, 0], [2, 4]]);
    expect(B.placementsFor(board, 2, 4, 'H', [tile('x', '1'), tile('y', '2')]).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Feed & timers
// ---------------------------------------------------------------------------

function bossAt(chainText: string, rules: Partial<BossRules> = {}): { boss: RunState['boss'] & object; tiles: Tile[] } {
  const tiles = tilesFor(chainText, 'c');
  const r: BossRules = { ...rules0(), ...rules };
  const [queue, s] = B.buildQueue(tiles, rng.create(1), 1);
  void s;
  return {
    tiles,
    boss: {
      bossNumber: 1,
      modifierId: null,
      rules: r,
      board: B.createBoard(7),
      rack: queue.slice(0, r.startingRack),
      queue: queue.slice(r.startingRack),
      cycle: 1,
      timeLeftMs: r.timerMs,
      feedTimerMs: r.feedIntervalMs,
      wordPoints: 0,
      words: [],
      ended: false,
      endReason: null,
      rerolls: 0,
      reward: null,
    },
  };
}

describe('feed', () => {
  it('the queue is a shuffled copy of the chain tiles, deterministic per seed', () => {
    const tiles = tilesFor('informal');
    const [a] = B.buildQueue(tiles, rng.create(4), 1);
    const [bq] = B.buildQueue(tiles, rng.create(4), 1);
    expect(a).toEqual(bq);
    expect(a.map((t) => t.letter).sort()).toEqual(tiles.map((t) => t.letter).sort());
    expect(a.every((t) => t.id.endsWith('~b1'))).toBe(true);
  });

  it('ticks feed one tile per interval and count down the timer', () => {
    const { boss, tiles } = bossAt('informal');
    const t1 = B.tick(boss, 1000, tiles, rng.create(1));
    expect(t1.boss.rack).toHaveLength(3);
    expect(t1.boss.timeLeftMs).toBe(89_000);
    expect(t1.boss.feedTimerMs).toBe(3000);
    const t2 = B.tick(t1.boss, 3000, tiles, t1.rng);
    expect(t2.boss.rack).toHaveLength(4);
    expect(t2.boss.feedTimerMs).toBe(4000);
    expect(t2.ended).toBe(false);
    const t3 = B.tick(t2.boss, 8000, tiles, t2.rng); // two feeds in one tick
    expect(t3.boss.rack).toHaveLength(6);
  });

  it('cycles the feed when the queue runs out (D4)', () => {
    const { boss, tiles } = bossAt('ab', { rackCap: 50 });
    let s = boss;
    let r = rng.create(2);
    for (let i = 0; i < 5; i++) {
      const t = B.tick(s, 4000, tiles, r);
      s = t.boss;
      r = t.rng;
    }
    expect(s.rack).toHaveLength(7);
    expect(s.cycle).toBeGreaterThan(1);
    expect(new Set(s.rack.map((t) => t.id)).size).toBe(7);
  });

  it('overflow discards the oldest tile by default', () => {
    const { boss, tiles } = bossAt('informal', { rackCap: 3 });
    const oldest = boss.rack[0]!.id;
    const t = B.tick(boss, 4000, tiles, rng.create(1));
    expect(t.boss.rack).toHaveLength(3);
    expect(t.boss.rack.map((x) => x.id)).not.toContain(oldest);
    expect(t.ended).toBe(false);
  });

  it('overflow can discard the newest tile instead (Overflow modifier hook)', () => {
    const { boss, tiles } = bossAt('informal', { rackCap: 3, overflowDiscards: 'newest' });
    const before = boss.rack.map((x) => x.id);
    const t = B.tick(boss, 4000, tiles, rng.create(1));
    expect(t.boss.rack.map((x) => x.id)).toEqual(before);
  });

  it('Overload: overflow ends the round', () => {
    const { boss, tiles } = bossAt('informal', { rackCap: 3, overflowEnds: true });
    const t = B.tick(boss, 4000, tiles, rng.create(1));
    expect(t.ended).toBe('overflow');
    expect(t.boss.ended).toBe(true);
    expect(t.boss.endReason).toBe('overflow');
  });

  it('an empty chain feeds nothing (boss reached with no word)', () => {
    const { boss } = bossAt('ab');
    const empty = { ...boss, rack: [], queue: [] };
    const t = B.tick(empty, 12_000, [], rng.create(1));
    expect(t.boss.rack).toEqual([]);
    expect(t.boss.queue).toEqual([]);
    expect(t.ended).toBe(false);
  });

  it('the timer ends the round at zero', () => {
    const { boss, tiles } = bossAt('informal', { rackCap: 50 });
    const t = B.tick(boss, 90_000, tiles, rng.create(1));
    expect(t.ended).toBe('timer');
    expect(t.boss.timeLeftMs).toBe(0);
  });

  it('Y Not re-letters vowels but not Vowel Wild tiles or blanks', () => {
    const tiles: Tile[] = [tile('a', '1'), { ...tile('e', '2'), modifiers: ['vowel_wild'] }, tile('x', '3'), { id: '4', letter: '_', baseValue: 0, modifiers: [] }];
    const out = B.applyVowelsToY(tiles);
    expect(out.map((t) => t.playedAs ?? t.letter)).toEqual(['Y', 'E', 'X', '_']);
    expect(out[0]?.baseValue).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

describe('boss modifiers', () => {
  it('content validates and covers the spec §7 subset', () => {
    expect(() => B.validateBossModifiers(bossModifiers)).not.toThrow();
    expect(bossModifiers.map((m) => m.id).sort()).toEqual(['fog', 'half_time', 'long_words_only', 'overload', 'rapid_feed', 'tight_rack', 'vowel_tax', 'y_not']);
    const bad = { ...bossModifiers[0]!, id: 'x', hookId: 'nope' as BossModifierSpec['hookId'] };
    expect(() => B.validateBossModifiers([bad])).toThrow(/unknown hook/);
  });

  it('base rules come from balance per boss number', () => {
    expect(B.baseRules(1, b).feedIntervalMs).toBe(4000);
    expect(B.baseRules(6, b).feedIntervalMs).toBe(2500);
    expect(B.baseRules(9, b).feedIntervalMs).toBe(2500);
    expect(B.baseRules(1, b)).toMatchObject({ timerMs: 90_000, rackCap: 7, startingRack: 3, minWordLength: 2 });
  });

  const mod = (id: string) => bossModifiers.find((m) => m.id === id)!;
  it.each([
    ['y_not', { vowelsToY: true }],
    ['long_words_only', { minWordLength: 4 }],
    ['rapid_feed', { feedIntervalMs: 2667 }],
    ['tight_rack', { rackCap: 4 }],
    ['fog', { hideQueue: true }],
    ['half_time', { timerMs: 63_000 }],
    ['vowel_tax', { vowelsScoreZero: true }],
    ['overload', { overflowEnds: true }],
  ])('%s changes the rules', (id, expected) => {
    expect(B.applyModifier(rules0(), mod(id))).toMatchObject(expected);
  });

  it('rollModifier never returns the excluded one', () => {
    let s = rng.create(3);
    for (let i = 0; i < 40; i++) {
      let m: BossModifierSpec | undefined;
      [m, s] = B.rollModifier(bossModifiers, s, 'fog');
      expect(m?.id).not.toBe('fog');
    }
    expect(B.rollModifier([mod('fog')], s, 'fog')[0]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Through the reducer
// ---------------------------------------------------------------------------

describe('boss round in the reducer', () => {
  const words = ['form', 'formal', 'informal', 'mail', 'loan', 'norm', 'farm'];
  const easy = makeContent(dict(...words), balanceWith({ scoring: { round1Threshold: 1 } }));

  /** A run at round 4 (BOSS_INTRO) with the chain "in|form|al". */
  function atBossIntro(): RunState {
    let s = newRun(easy, 11);
    s = { ...s, round: 4, chain: chainFromMorphemes(['in', 'form', 'al']) };
    return reduce(s, { type: 'START_ROUND' }, easy);
  }

  it('START_ROUND rolls a modifier; START_BOSS resolves rules, board, rack and queue', () => {
    const intro = atBossIntro();
    expect(intro.phase).toBe('BOSS_INTRO');
    expect(bossModifiers.some((m) => m.id === intro.boss?.modifierId)).toBe(true);
    const s = reduce(intro, { type: 'START_BOSS' }, easy);
    const bs = s.boss!;
    expect(bs.rules).not.toBeNull();
    expect(bs.board.starter).toHaveLength(8); // B1: full word
    expect(bs.rack.length + bs.queue.length).toBe(8);
    expect(bs.rack).toHaveLength(bs.rules!.startingRack);
    expect(bs.timeLeftMs).toBe(bs.rules!.timerMs);
  });

  it('PLACE_WORD types letters from the rack, validates, scores and logs', () => {
    let s = reduce(atBossIntro(), { type: 'START_BOSS' }, easy);
    // give the rack known tiles: play "mail" down from the starter's m
    const rack = tilesFor('ail', 'r');
    const b0 = s.boss!;
    s = { ...s, boss: { ...b0, rack, rules: { ...b0.rules!, vowelsToY: false } } };
    const mIndex = b0.board.starter.find((i) => b0.board.cells[i]?.letter === 'M')!;
    const [mr, mc] = B.rowCol(b0.board, mIndex);
    const bad = reduce(s, { type: 'PLACE_WORD', row: mr + 1, col: mc, dir: 'V', letters: 'ali' }, easy);
    expect(lastError(bad)).toMatch(/"mali" is not in the dictionary/);
    const good = reduce(s, { type: 'PLACE_WORD', row: mr + 1, col: mc, dir: 'V', letters: 'ail' }, easy);
    expect(lastError(good)).toBeUndefined();
    expect(good.boss?.wordPoints).toBe(6);
    expect(good.boss?.words).toEqual([{ word: 'mail', crossWords: [], points: 6, atMs: 0 }]);
    expect(good.boss?.rack).toEqual([]);
    expect(B.tileAt(good.boss!.board, mr + 3, mc)?.letter).toBe('L');
    expect(lastError(reduce(good, { type: 'PLACE_WORD', row: 0, col: 0, dir: 'H', letters: 'z' }, easy))).toMatch(/no tile/);
  });

  it('ticks run the timer down and end the round; the result uses the placed points', () => {
    let s = reduce(atBossIntro(), { type: 'START_BOSS' }, easy);
    const rules = s.boss!.rules!;
    s = { ...s, boss: { ...s.boss!, wordPoints: 40, rules: { ...rules, overflowEnds: false, rackCap: 99 } } };
    expect(lastError(reduce(s, { type: 'BOSS_TICK', ms: 0 }, easy))).toMatch(/positive/);
    let ticks = 0;
    while (s.phase === 'BOSS_PLAY') {
      s = reduce(s, { type: 'BOSS_TICK', ms: 1000 }, easy);
      ticks++;
    }
    expect(ticks).toBe(rules.timerMs / 1000);
    expect(s.phase).toBe('BOSS_END');
    expect(s.boss?.endReason).toBe('timer');
    expect(s.lastResult?.kind).toBe('boss');
    expect(s.lastResult?.wordPoints).toBe(40);
    expect(s.lastResult?.score).toBe(Math.round(40 * 1.96));
    expect(lastError(reduce(s, { type: 'BOSS_TICK', ms: 100 }, easy))).toBeTruthy();
  });

  it('Overload ends the round on overflow through the reducer', () => {
    let s = reduce(atBossIntro(), { type: 'START_BOSS' }, easy);
    s = { ...s, boss: { ...s.boss!, rules: { ...s.boss!.rules!, overflowEnds: true, rackCap: 3 } } };
    s = reduce(s, { type: 'BOSS_TICK', ms: 4000 }, easy);
    expect(s.phase).toBe('BOSS_END');
    expect(s.boss?.endReason).toBe('overflow');
  });

  it('BOSS_END → pass → BOSS_REWARD → PICK_MODIFIER → next round; final boss → WIN (P4-06)', () => {
    let s = reduce(atBossIntro(), { type: 'START_BOSS' }, easy);
    s = reduce(s, { type: 'END_BOSS', wordPoints: 500 }, easy);
    expect(s.lastResult?.passed).toBe(true);
    expect(s.boss?.endReason).toBe('ended');
    s = reduce(s, { type: 'CONTINUE' }, easy);
    expect(s.phase).toBe('BOSS_REWARD');
    s = reduce(s, { type: 'PICK_MODIFIER', id: s.boss!.reward!.offers[0]! }, easy);
    expect(s.phase).toBe('ROUND_START');
    expect(s.round).toBe(5);
    expect(s.boss).toBeNull();

    const short = makeContent(anyDict, balanceWith({ rounds: { total: 4 }, scoring: { round1Threshold: 1 } }));
    let w = newRun(short, 1);
    for (let i = 0; i < 3; i++) w = playRegularRound(w, short);
    w = reduce(reduce(w, { type: 'START_ROUND' }, short), { type: 'START_BOSS' }, short);
    w = reduce(w, { type: 'END_BOSS', wordPoints: 10_000 }, short);
    w = reduce(w, { type: 'CONTINUE' }, short);
    w = reduce(w, { type: 'PICK_MODIFIER', id: w.boss!.reward!.offers[0]! }, short);
    expect(w.phase).toBe('WIN');
  });

  it('a failed boss with a life is retried with a fresh modifier roll (D1)', () => {
    let s = { ...atBossIntro(), lives: 1 };
    s = reduce(s, { type: 'START_BOSS' }, easy);
    s = reduce(s, { type: 'END_BOSS' }, easy); // 0 points
    expect(s.lastResult?.outcome).toBe('life_lost');
    s = reduce(s, { type: 'CONTINUE' }, easy);
    expect(s.phase).toBe('ROUND_START');
    expect(s.round).toBe(4);
    s = reduce(s, { type: 'START_ROUND' }, easy);
    expect(s.phase).toBe('BOSS_INTRO');
    expect(s.boss?.wordPoints).toBe(0);
  });

  it('Amendment rerolls at the intro and the new modifier is what START_BOSS applies', () => {
    let s = withCards(atBossIntro(), 'amendment');
    s = { ...s, boss: { ...s.boss!, modifierId: 'fog' } };
    s = reduce(s, { type: 'USE_CARD', instanceId: 'camendment0' }, easy);
    expect(s.boss?.modifierId).not.toBe('fog');
    const started = reduce(s, { type: 'START_BOSS' }, easy);
    expect(started.boss?.rules).toEqual(B.applyModifier(B.baseRules(1, b), bossModifiers.find((m) => m.id === s.boss?.modifierId)));
  });

  it('boss rounds do not touch the pool, hand or chain', () => {
    const intro = atBossIntro();
    let s = reduce(intro, { type: 'START_BOSS' }, easy);
    s = reduce(s, { type: 'BOSS_TICK', ms: 20_000 }, easy);
    expect(s.pool).toEqual(intro.pool);
    expect(s.hand).toEqual([]);
    expect(s.chain).toEqual(intro.chain);
  });
});
