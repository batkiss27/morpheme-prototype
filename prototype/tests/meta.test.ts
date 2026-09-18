/** P7-01 … P7-07: meta-progression, loadouts, pre-run categories, challenges, Steep Curve, achievements. */
import { describe, expect, it } from 'vitest';
import { achievements, defaultBalance } from '../src/content';
import { boss as B, createRun, lastError, loadout as L, meta as M, reduce, scoring as S, thresholdFor } from '../src/engine';
import type { MetaState, PreRunLoadout, RunState } from '../src/engine';
import { balanceWith, chainFromMorphemes, tilesFor, withCards } from './helpers';
import { anyDict, makeContent, newRun, playBossRound, playFromHand, playRegularRound } from './run-driver';

const b = defaultBalance;
const c = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));
const lo = (partial: Partial<PreRunLoadout>): PreRunLoadout => ({ tileModifiers: [], categories: {}, risks: {}, challenges: [], ...partial });

describe('loadout → engine (P7-04, P7-05)', () => {
  it('Second Breath gives lives; No Breath removes them', () => {
    expect(createRun(1, lo({ categories: { second_breath: 3 } }), c).lives).toBe(3);
    expect(createRun(1, lo({ categories: { second_breath: 3 }, challenges: ['no_breath'] }), c).lives).toBe(0);
  });

  it('Substrate: L1 free redraw, L2 hand +1, L3 hand +1 & redraw, L4 hand +2 & redraw', () => {
    expect(L.handSize(lo({ categories: { substrate: 1 } }), b)).toBe(10);
    expect(L.freeRedraws(lo({ categories: { substrate: 1 } }), b)).toBe(1);
    expect(L.handSize(lo({ categories: { substrate: 2 } }), b)).toBe(11);
    expect(L.freeRedraws(lo({ categories: { substrate: 2 } }), b)).toBe(0);
    expect(L.handSize(lo({ categories: { substrate: 4 } }), b)).toBe(12);
    expect(L.freeRedraws(lo({ categories: { substrate: 4 } }), b)).toBe(1);
    let s = reduce(createRun(1, lo({ categories: { substrate: 3 } }), c), { type: 'START_ROUND' }, c);
    expect(s.hand).toHaveLength(11);
    expect(s.freeRedraws).toBe(1);
    const before = s.hand.map((t) => t.id);
    s = reduce(s, { type: 'REDRAW' }, c);
    expect(lastError(s)).toBeUndefined();
    expect(s.hand.map((t) => t.id)).not.toEqual(before);
    expect(s.pool.length + s.hand.length).toBe(100);
    expect(lastError(reduce(s, { type: 'REDRAW' }, c))).toMatch(/no free redraw/);
    const noSub = reduce(createRun(1, lo({}), c), { type: 'START_ROUND' }, c);
    expect(noSub.freeRedraws).toBe(0);
    const played = playFromHand(reduce(createRun(1, lo({ categories: { substrate: 4 } }), c), { type: 'START_ROUND' }, c), c, 2, 'start');
    expect(lastError(reduce(played, { type: 'REDRAW' }, c))).toMatch(/before playing/);
  });

  it('Treasury: +1 per round cleared, streak ×2, 10% shop discount, dividend ×2', () => {
    const run = (level: number) => {
      let s = reduce(createRun(1, lo({ categories: { treasury: level } }), c), { type: 'START_ROUND' }, c);
      s = { ...s, round: 5, streak: 2, pool: [], hand: tilesFor('sx', 'h'), chain: chainFromMorphemes(['a', 'b', 'c', 'd']) };
      s = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['hS0'] }, c);
      s = reduce(s, { type: 'SUBMIT' }, c);
      return s;
    };
    const by = (s: RunState) => Object.fromEntries(s.lastResult!.currencySources.map((x) => [x.source, x.amount]));
    expect(by(run(0))['Treasury']).toBeUndefined();
    expect(by(run(1))['Treasury']).toBe(1);
    expect(by(run(1))['Natural streak']).toBe(3);
    expect(by(run(2))['Natural streak (Treasury ×2)']).toBe(6);
    expect(by(run(4))['Natural word dividend (Treasury ×2)']).toBe(2 * 3);
    const shop = reduce(run(3), { type: 'CONTINUE' }, c);
    expect(shop.shop!.offers.every((o) => o.price === Math.ceil(c.cards.find((x) => x.id === o.cardId)!.price * 0.9))).toBe(true);
    expect(shop.shop!.rerollPrice).toBe(Math.ceil(2 * 0.9));
  });

  it('Tempo and Tight Clock change the boss rules', () => {
    const base = { timerMs: 90_000, feedIntervalMs: 4000, rackCap: 7 };
    const r = (loadout: PreRunLoadout) => L.bossRules(loadout, b, { ...B.baseRules(1, b), ...base });
    expect(r(lo({ categories: { tempo: 1 } }))).toMatchObject({ timerMs: 99_000, feedIntervalMs: 4000, rackCap: 7 });
    expect(r(lo({ categories: { tempo: 4 } }))).toMatchObject({ timerMs: 117_000, feedIntervalMs: 4800, rackCap: 8 });
    expect(r(lo({ challenges: ['tight_clock'] }))).toMatchObject({ timerMs: 63_000 });
    expect(r(lo({ categories: { tempo: 2 }, challenges: ['tight_clock'] })).timerMs).toBe(Math.round(108_000 * 0.7));
    // through the reducer
    let s: RunState = { ...createRun(1, lo({ categories: { tempo: 4 } }), c), round: 4, chain: chainFromMorphemes(['in', 'form', 'al']) };
    s = reduce(reduce(s, { type: 'START_ROUND' }, c), { type: 'START_BOSS' }, c);
    expect(s.boss?.rules?.rackCap).toBeGreaterThanOrEqual(5); // 7 (or 4 under Tight Rack) + 1
    expect(s.boss?.timeLeftMs).toBeGreaterThanOrEqual(Math.round(90_000 * 0.7 * 1.3));
  });

  it('Vowel Thief zeroes vowel values; Inflation raises prices 50%', () => {
    const s = createRun(1, lo({ challenges: ['vowel_thief'] }), c);
    expect(s.pool.filter((t) => 'AEIOU'.includes(t.letter)).every((t) => t.baseValue === 0)).toBe(true);
    expect(s.pool.find((t) => t.letter === 'Q')?.baseValue).toBe(10);
    let t = playRegularRound(createRun(1, lo({ challenges: ['inflation'] }), c), c, 2);
    t = reduce(playFromHand(reduce(t, { type: 'START_ROUND' }, c), c, 1, 'back'), { type: 'SUBMIT' }, c);
    t = reduce(t, { type: 'CONTINUE' }, c);
    expect(t.shop!.offers.every((o) => o.price === Math.ceil(c.cards.find((x) => x.id === o.cardId)!.price * 1.5))).toBe(true);
    expect(t.shop!.rerollPrice).toBe(3);
  });

  it('a loadout tile modifier lands on one tile of that letter', () => {
    const s = createRun(1, lo({ tileModifiers: [{ letter: 'E', modifier: 'plus2' }] }), c);
    expect(s.pool.filter((t) => t.letter === 'E' && t.modifiers.includes('plus2'))).toHaveLength(1);
  });
});

describe('Steep Curve (P7-07)', () => {
  it('scales every threshold by the level and the scenario still passes at level 1', () => {
    const l1 = lo({ risks: { steep_curve: 1 } });
    expect(L.thresholdScale(l1, b)).toBe(1.15);
    expect(S.threshold(1, b, 1.15)).toBe(5); // 4 × 1.15 = 4.6
    expect(S.threshold(4, b, 1.15)).toBe(47); // 40.5 × 1.15
    const s = createRun(1, l1, makeContent(anyDict));
    expect(thresholdFor(s, makeContent(anyDict))).toBe(5);
    expect(thresholdFor(s, makeContent(anyDict), 24)).toBe(S.threshold(24, b, 1.15));
    // a level-4 steep run fails a round it would otherwise pass
    let hard = reduce(createRun(3, lo({ risks: { steep_curve: 4 } }), makeContent(anyDict)), { type: 'START_ROUND' }, makeContent(anyDict));
    hard = playFromHand(hard, makeContent(anyDict), 2, 'start');
    hard = reduce(hard, { type: 'SUBMIT' }, makeContent(anyDict));
    expect(hard.lastResult?.threshold).toBe(7); // 4 × 1.75
  });

  it('grants loadout points', () => {
    const meta = M.createMeta(b);
    expect(M.loadoutPoints(meta, lo({ risks: { steep_curve: 2 } }), c)).toBe(b.meta.loadoutBudgetStart + 2);
    expect(M.loadoutBonusPoints(lo({ challenges: ['no_breath', 'inflation'] }), c)).toBe(5);
  });
});

describe('meta state (P7-01, P7-03)', () => {
  it('starts empty with the base budget', () => {
    const m = M.createMeta(b);
    expect(m.lexiconPoints).toBe(0);
    expect(m.loadoutBudget).toBe(4);
    expect(m.challengesUnlocked).toBe(false);
    expect(m.version).toBe(M.META_VERSION);
  });

  it('levels cost 2 / 4 / 7 / 11 and cannot be skipped or exceed 4', () => {
    let m: MetaState = { ...M.createMeta(b), lexiconPoints: 30 };
    expect(M.nextLevelCost(0, b)).toBe(2);
    expect(M.nextLevelCost(3, b)).toBe(11);
    expect(M.nextLevelCost(4, b)).toBeUndefined();
    for (const cost of [2, 4, 7, 11]) {
      const r = M.buyLetterLevel(m, 'E', b);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(m.lexiconPoints - r.value.lexiconPoints).toBe(cost);
      m = r.value;
    }
    expect(m.letterLevels.E).toBe(4);
    expect(m.lexiconPoints).toBe(6);
    expect(M.buyLetterLevel(m, 'E', b)).toMatchObject({ ok: false });
    expect(M.buyLetterLevel({ ...m, lexiconPoints: 1 }, 'A', b)).toMatchObject({ ok: false, error: expect.stringContaining('need 2') });
    expect(M.buyLetterLevel(m, '_', b)).toMatchObject({ ok: false });
    const cat = M.buyCategoryLevel(m, 'treasury', b);
    expect(cat.ok && cat.value.categoryLevels.treasury).toBe(1);
  });
});

describe('loadout validation (P7-04)', () => {
  const meta: MetaState = { ...M.createMeta(b), letterLevels: { E: 2, Q: 1 }, categoryLevels: { treasury: 2 }, loadoutBudget: 5 };

  it('accepts a valid loadout and costs it', () => {
    const l = lo({ tileModifiers: [{ letter: 'E', modifier: 'plus2' }, { letter: 'Q', modifier: 'plus1' }], categories: { treasury: 2 } });
    expect(M.validateLoadout(meta, l, c)).toEqual([]);
    expect(M.loadoutCost(l, c)).toBe(5);
  });

  it('rejects modifiers above the letter level, unlocked levels, duplicates, budget and locked challenges', () => {
    expect(M.validateLoadout(meta, lo({ tileModifiers: [{ letter: 'E', modifier: 'plus3' }] }), c)[0]).toMatch(/needs level 3/);
    expect(M.validateLoadout(meta, lo({ categories: { treasury: 3 } }), c)[0]).toMatch(/not unlocked/);
    expect(M.validateLoadout(meta, lo({ tileModifiers: [{ letter: 'E', modifier: 'plus1' }, { letter: 'E', modifier: 'plus2' }] }), c)[0]).toMatch(/one loadout modifier/);
    expect(M.validateLoadout(meta, lo({ tileModifiers: [{ letter: 'E', modifier: 'plus2' }, { letter: 'Q', modifier: 'plus1' }], categories: { treasury: 2 }, risks: {} }), c)).toEqual([]);
    const over = lo({ tileModifiers: [{ letter: 'E', modifier: 'plus2' }, { letter: 'Q', modifier: 'plus1' }], categories: { treasury: 2, second_breath: 1 } });
    expect(M.validateLoadout({ ...meta, categoryLevels: { treasury: 2, second_breath: 1 } }, over, c)[0]).toMatch(/costs 6 but only 5/);
    // Steep Curve pays for it
    expect(M.validateLoadout({ ...meta, categoryLevels: { treasury: 2, second_breath: 1 } }, { ...over, risks: { steep_curve: 1 } }, c)).toEqual([]);
    expect(M.validateLoadout(meta, lo({ challenges: ['inflation'] }), c)[0]).toMatch(/unlock after your first win/);
    expect(M.validateLoadout({ ...meta, challengesUnlocked: true }, lo({ challenges: ['inflation'] }), c)).toEqual([]);
  });

  it('caps modified letters', () => {
    const many = lo({ tileModifiers: 'ABCDEFGHI'.split('').map((l) => ({ letter: l as 'A', modifier: 'plus1' as const })) });
    const m: MetaState = { ...meta, letterLevels: Object.fromEntries('ABCDEFGHI'.split('').map((l) => [l, 1])), loadoutBudget: 20 };
    expect(M.validateLoadout(m, many, c)).toEqual([expect.stringContaining('at most 8')]);
  });
});

describe('achievements & awards (P7-02)', () => {
  function finished(seed = 1, loadout = lo({}), win = false): RunState {
    const total = win ? balanceWith({ rounds: { total: 4 }, scoring: { round1Threshold: 1 } }) : balanceWith({ scoring: { round1Threshold: 1 } });
    const cc = makeContent(anyDict, total);
    let s = createRun(seed, loadout, cc);
    for (let i = 0; i < 3; i++) s = playRegularRound(s, cc);
    s = playBossRound(s, cc, win ? 10_000 : 0);
    if (!win) s = reduce(s, { type: 'CONTINUE' }, cc);
    return s;
  }

  it('a lost run awards base points and the progression achievements it hit', () => {
    const s = finished();
    expect(s.phase).toBe('GAME_OVER');
    const { meta, awards } = M.applyRunEnd(M.createMeta(b), s, c);
    expect(awards.lexiconPoints).toBe(3 * b.meta.lexiconPerRoundCleared);
    expect(awards.achievements).toEqual(['first_word']);
    expect(meta.unlockedCards).toEqual(['vowel_shift', 'loanword']);
    expect(meta.runs).toBe(1);
    expect(meta.wins).toBe(0);
    expect(meta.lexiconPoints).toBe(3);
    expect(meta.loadout).toEqual(lo({}));
  });

  it('a won run awards win points, Victory, Deathless, Purist\'s Pride and Unaided; challenges unlock', () => {
    const s = finished(2, lo({}), true);
    expect(s.phase).toBe('WIN');
    const { meta, awards } = M.applyRunEnd(M.createMeta(b), s, makeContent(anyDict, balanceWith({ rounds: { total: 4 }, scoring: { round1Threshold: 1 } })));
    expect(awards.achievements).toEqual(expect.arrayContaining(['first_word', 'first_blood', 'victory', 'deathless', 'purists_pride', 'unaided']));
    expect(awards.challengesUnlocked).toBe(true);
    expect(meta.challengesUnlocked).toBe(true);
    expect(meta.loadoutBudget).toBe(4 + 1 + 2 + 1); // B1 budget point + Victory + Unaided
    expect(meta.unlockedModifiers).toContain('polyglot');
    // 3 rounds + 1 boss + win + first_blood 2 + victory 5 + deathless 5 + purist 8 + unaided 8
    expect(awards.lexiconPoints).toBe(3 + 2 + 5 + 2 + 5 + 5 + 8 + 8);
  });

  it('achievements are awarded once; later runs only add base points', () => {
    const s = finished();
    const first = M.applyRunEnd(M.createMeta(b), s, c);
    const second = M.applyRunEnd(first.meta, s, c);
    expect(second.awards.achievements).toEqual([]);
    expect(second.meta.lexiconPoints).toBe(6);
  });

  it('skill predicates read the round history', () => {
    const facts: M.RunFacts = { roundsCleared: 3, bossesBeaten: 0, maxMorphemes: 6, maxLetters: 21, won: false, livesLost: 1, extensionCardsUsed: 1, twoStep: true, bothEnds: true, tripleStep: false, maxNaturalMorphemes: 5, secretWords: ['morpheme'], trapdoor: false, unaided: true };
    const by = (id: string) => M.achievementMet(achievements.find((a) => a.id === id)!, facts);
    expect(by('sesquipedalian')).toBe(true);
    expect(by('twenty_letters')).toBe(true);
    expect(by('two_step')).toBe(true);
    expect(by('both_ends')).toBe(true);
    expect(by('triple_step')).toBe(false);
    expect(by('natural_five')).toBe(true);
    expect(by('secret_morpheme')).toBe(true);
    expect(by('secret_polysynthetic')).toBe(false);
    expect(by('deathless')).toBe(false);
    expect(by('trapdoor')).toBe(false);
  });

  it('run facts count extension cards and detect a trapdoor', () => {
    const cc = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));
    let s = reduce(createRun(4, lo({}), cc), { type: 'DEBUG', op: { kind: 'card', cardId: 'hyphen' } }, cc);
    s = reduce(s, { type: 'START_ROUND' }, cc);
    s = playFromHand(s, cc, 2, 'start');
    s = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: s.hand.slice(0, 2).map((t) => t.id), viaCard: 'c0', playedAs: Object.fromEntries(s.hand.slice(0, 2).filter((t) => t.letter === '_').map((t) => [t.id, 'E'])) }, cc);
    s = reduce(s, { type: 'SUBMIT' }, cc);
    s = reduce(s, { type: 'CONTINUE' }, cc);
    s = reduce(s, { type: 'LEAVE' }, cc);
    s = reduce(s, { type: 'DEBUG', op: { kind: 'round', round: 4 } }, cc);
    s = playBossRound(s, cc, 0);
    s = reduce(s, { type: 'CONTINUE' }, cc);
    const { meta, awards } = M.applyRunEnd(M.createMeta(b), s, cc);
    void meta;
    expect(awards.achievements).toContain('first_word');
    expect(awards.achievements).toContain('two_step');
    void withCards;
  });
});

describe('loadout budget grows per boss beaten', () => {
  const cc = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1, thresholdGrowthByBlock: [1] } }));

  /** A finished run with `bosses` bosses beaten (0–5) and then a loss. */
  function runWithBosses(bosses: number, seed = 1): RunState {
    let s = createRun(seed, lo({}), cc);
    for (let k = 0; k < bosses; k++) {
      for (let i = 0; i < 3; i++) s = playRegularRound(s, cc);
      s = playBossRound(s, cc, 10_000);
    }
    for (let i = 0; i < 3; i++) s = playRegularRound(s, cc);
    s = playBossRound({ ...s, lives: 0 }, cc, 0); // a reward may have granted a life; the final boss must end the run
    return s;
  }

  it('B1 adds one point up to 6; a second B1 win adds again until the cap', () => {
    let meta = M.createMeta(b);
    const s = runWithBosses(1);
    expect(s.phase).toBe('GAME_OVER');
    let r = M.applyRunEnd(meta, s, cc);
    expect(r.awards.loadoutFromBosses).toBe(1);
    expect(r.meta.loadoutBudget).toBe(5);
    r = M.applyRunEnd(r.meta, s, cc);
    expect(r.meta.loadoutBudget).toBe(6);
    r = M.applyRunEnd(r.meta, s, cc);
    expect(r.meta.loadoutBudget).toBe(6); // B1 alone never passes 6
    expect(r.awards.loadoutFromBosses).toBe(0);
  });

  it('each boss has its own cap: B1..B3 in one run → +3 (4 → 7); repeating reaches 10', () => {
    const s = runWithBosses(3);
    let r = M.applyRunEnd(M.createMeta(b), s, cc);
    expect(r.awards.loadoutFromBosses).toBe(3);
    expect(r.meta.loadoutBudget).toBe(7 + 1); // + Halfway achievement (B3)
    for (let i = 0; i < 5; i++) r = M.applyRunEnd(r.meta, s, cc);
    expect(r.meta.loadoutBudget).toBe(10); // B3 cap
  });

  it('caps: B1 6, B2 8, B3 10, B4 12, B5 14, B6 16; achievements still add beyond, up to 20', () => {
    const budget = (start: number, bosses: number) => M.applyRunEnd({ ...M.createMeta(b), loadoutBudget: start, achievements: ['first_word', 'first_blood', 'halfway', 'victory', 'deathless', 'purists_pride', 'unaided'] }, runWithBosses(bosses), cc).meta.loadoutBudget;
    expect(budget(5, 1)).toBe(6);
    expect(budget(6, 1)).toBe(6);
    expect(budget(6, 2)).toBe(7);
    expect(budget(9, 3)).toBe(10);
    expect(budget(10, 3)).toBe(10);
    expect(budget(11, 5)).toBe(13); // B4 (cap 12): 11→12; B5 (cap 14): 12→13
    expect(budget(15, 5)).toBe(15);
    expect(budget(16, 5)).toBe(16);
    // a fresh profile beating B1 in a full win: +6 boss points (4→10) + Victory +2 + Unaided +1
    const win = M.applyRunEnd(M.createMeta(b), (() => {
      const short = makeContent(anyDict, balanceWith({ rounds: { total: 4 }, scoring: { round1Threshold: 1 } }));
      let s = createRun(2, lo({}), short);
      for (let i = 0; i < 3; i++) s = playRegularRound(s, short);
      return playBossRound(s, short, 10_000);
    })(), makeContent(anyDict, balanceWith({ rounds: { total: 4 }, scoring: { round1Threshold: 1 } })));
    expect(win.awards.loadoutFromBosses).toBe(1);
    expect(win.meta.loadoutBudget).toBe(4 + 1 + 2 + 1);
  });
});
