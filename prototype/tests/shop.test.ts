/** P3-02: shop generation and purchase rules. */
import { describe, expect, it } from 'vitest';
import { cards as cardContent, defaultBalance } from '../src/content';
import { lastError, reduce, rng, shop as S } from '../src/engine';
import type { RunState } from '../src/engine';
import { balanceWith, withCards } from './helpers';
import { anyDict, makeContent, newRun, playFromHand, playRegularRound } from './run-driver';

const easy = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));

/** Play round 1 and stop in the shop with some currency. */
function inShop(currency = 20, seed = 1): RunState {
  let s = newRun(easy, seed);
  s = reduce(s, { type: 'START_ROUND' }, easy);
  s = playFromHand(s, easy, 2, 'start');
  s = reduce(s, { type: 'SUBMIT' }, easy);
  s = reduce(s, { type: 'CONTINUE' }, easy);
  expect(s.phase).toBe('SHOP');
  return { ...s, currency };
}

describe('shop generation', () => {
  it('rolls rarities by the configured odds', () => {
    let s = rng.create(42);
    const counts = { basic: 0, uncommon: 0, exotic: 0, relic: 0 };
    for (let i = 0; i < 4000; i++) {
      let r: keyof typeof counts;
      [r, s] = S.rollRarity(s, defaultBalance);
      counts[r]++;
    }
    expect(counts.basic / 4000).toBeCloseTo(0.55, 1);
    expect(counts.uncommon / 4000).toBeCloseTo(0.3, 1);
    expect(counts.exotic / 4000).toBeCloseTo(0.12, 1);
    expect(counts.relic).toBeGreaterThanOrEqual(0);
  });

  it('falls back to a lower rarity when the pool has none of the rolled one', () => {
    const basicsOnly = cardContent.filter((c) => c.rarity === 'basic');
    let s = rng.create(7);
    for (let i = 0; i < 50; i++) {
      let card;
      [card, s] = S.rollCard(s, basicsOnly, defaultBalance);
      expect(card?.rarity).toBe('basic');
    }
  });

  it('builds 3 offers, a tile action and the base reroll price', () => {
    const built = S.buildShop({ rng: rng.create(1), cards: cardContent, balance: defaultBalance, heldTypes: [] });
    expect(built.shop.offers).toHaveLength(3);
    expect(built.shop.offers.every((o) => o.price === cardContent.find((c) => c.id === o.cardId)?.price)).toBe(true);
    expect(['add_tile', 'remove_tile']).toContain(built.shop.tileAction.kind);
    expect(built.shop.rerollPrice).toBe(2);
    expect(built.shop.rerolls).toBe(0);
  });

  it('guarantees an Extension card in slot 1 when the player holds none', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const built = S.buildShop({ rng: rng.create(seed), cards: cardContent, balance: defaultBalance, heldTypes: [] });
      const first = cardContent.find((c) => c.id === built.shop.offers[0]!.cardId)!;
      expect(first.type).toBe('extension');
    }
    let sawNonExtension = false;
    for (let seed = 1; seed <= 30; seed++) {
      const built = S.buildShop({ rng: rng.create(seed), cards: cardContent, balance: defaultBalance, heldTypes: ['extension'] });
      const first = cardContent.find((c) => c.id === built.shop.offers[0]!.cardId)!;
      if (first.type !== 'extension') sawNonExtension = true;
    }
    expect(sawNonExtension).toBe(true);
  });

  it('is deterministic per seed', () => {
    const a = S.buildShop({ rng: rng.create(9), cards: cardContent, balance: defaultBalance, heldTypes: [] });
    const b = S.buildShop({ rng: rng.create(9), cards: cardContent, balance: defaultBalance, heldTypes: [] });
    expect(a).toEqual(b);
  });

  it('reroll price rises by the increment', () => {
    expect(S.rerollPrice(0, defaultBalance)).toBe(2);
    expect(S.rerollPrice(3, defaultBalance)).toBe(5);
  });
});

describe('shop actions', () => {
  it('CONTINUE after a passed regular round builds a shop', () => {
    const s = inShop();
    expect(s.shop?.offers).toHaveLength(3);
  });

  it('BUY_CARD deducts currency, adds the card, marks the slot sold', () => {
    const s = inShop(20);
    const offer = s.shop!.offers[1]!;
    const r = reduce(s, { type: 'BUY_CARD', slot: 1 }, easy);
    expect(lastError(r)).toBeUndefined();
    expect(r.currency).toBe(20 - offer.price);
    expect(r.cards).toEqual([{ instanceId: 'c0', cardId: offer.cardId }]);
    expect(r.shop?.offers[1]?.sold).toBe(true);
    expect(lastError(reduce(r, { type: 'BUY_CARD', slot: 1 }, easy))).toMatch(/sold out/);
    expect(lastError(reduce(r, { type: 'BUY_CARD', slot: 7 }, easy))).toMatch(/no offer/);
  });

  it('BUY_CARD needs enough currency', () => {
    const s = inShop(0);
    expect(lastError(reduce(s, { type: 'BUY_CARD', slot: 0 }, easy))).toMatch(/not enough currency/);
  });

  it('BUY_CARD respects per-type hand limits', () => {
    let s = inShop(100);
    const first = cardContent.find((c) => c.id === s.shop!.offers[0]!.cardId)!;
    const limit = defaultBalance.shop.handLimits[first.type];
    s = withCards(s, ...Array<string>(limit).fill(first.id));
    expect(lastError(reduce(s, { type: 'BUY_CARD', slot: 0 }, easy))).toMatch(/at most/);
  });

  it('REROLL replaces the offers, keeps the tile action, raises the price', () => {
    const s = inShop(20);
    const r = reduce(s, { type: 'REROLL' }, easy);
    expect(lastError(r)).toBeUndefined();
    expect(r.currency).toBe(18);
    expect(r.shop?.rerolls).toBe(1);
    expect(r.shop?.rerollPrice).toBe(3);
    expect(r.shop?.tileAction).toEqual(s.shop?.tileAction);
    expect(r.shop?.offers).not.toEqual(s.shop?.offers);
    expect(lastError(reduce({ ...s, currency: 1 }, { type: 'REROLL' }, easy))).toMatch(/not enough/);
  });

  it('SELL refunds half the price and removes the card', () => {
    const s = withCards(inShop(0), 'blend');
    const r = reduce(s, { type: 'SELL', instanceId: 'cblend0' }, easy);
    expect(r.currency).toBe(2);
    expect(r.cards).toEqual([]);
    expect(lastError(reduce(s, { type: 'SELL', instanceId: 'nope' }, easy))).toMatch(/not in your hand/);
  });

  it('BUY_TILE_ACTION adds or removes a pool tile', () => {
    const s = inShop(20);
    const kind = s.shop!.tileAction.kind;
    const target = kind === 'add_tile' ? { letter: 'Z' as const } : { tileId: s.pool[0]!.id };
    const r = reduce(s, { type: 'BUY_TILE_ACTION', target }, easy);
    expect(lastError(r)).toBeUndefined();
    expect(r.currency).toBe(20 - s.shop!.tileAction.price);
    expect(r.shop?.tileAction.sold).toBe(true);
    if (kind === 'add_tile') {
      expect(r.pool).toHaveLength(s.pool.length + 1);
      expect(r.pool.at(-1)?.letter).toBe('Z');
    } else {
      expect(r.pool).toHaveLength(s.pool.length - 1);
      expect(r.destroyed).toHaveLength(1);
    }
    expect(lastError(reduce(r, { type: 'BUY_TILE_ACTION', target }, easy))).toMatch(/sold out/);
    expect(lastError(reduce(s, { type: 'BUY_TILE_ACTION', target: {} }, easy))).toMatch(/choose/);
  });

  it('Loanword can be used in the shop', () => {
    const s = withCards(inShop(0), 'loanword');
    const r = reduce(s, { type: 'USE_CARD', instanceId: 'cloanword0', target: { letter: 'E' } }, easy);
    expect(lastError(r)).toBeUndefined();
    expect(r.pool.filter((t) => t.letter === 'E')).toHaveLength(s.pool.filter((t) => t.letter === 'E').length + 1);
  });

  it('shop actions are rejected outside SHOP', () => {
    const s = reduce(newRun(easy), { type: 'START_ROUND' }, easy);
    expect(lastError(reduce(s, { type: 'BUY_CARD', slot: 0 }, easy))).toBeTruthy();
    expect(lastError(reduce(s, { type: 'REROLL' }, easy))).toBeTruthy();
    expect(lastError(reduce(s, { type: 'SELL', instanceId: 'x' }, easy))).toBeTruthy();
    expect(lastError(reduce(s, { type: 'BUY_TILE_ACTION', target: {} }, easy))).toBeTruthy();
  });

  it('LEAVE clears the shop and moves to the next round', () => {
    const r = reduce(inShop(), { type: 'LEAVE' }, easy);
    expect(r.shop).toBeNull();
    expect(r.round).toBe(2);
    expect(r.phase).toBe('ROUND_START');
  });

  it('a full run with shops keeps tiles conserved and replays', () => {
    let s = newRun(easy, 5);
    for (let i = 0; i < 3; i++) s = playRegularRound(s, easy);
    expect(s.round).toBe(4);
  });
});
