/**
 * Shop generation and purchase rules (Shops tab, spec §5).
 *
 * - `cardSlots` offers drawn by rarity odds, then uniformly within the rarity.
 * - If the player holds no Extension card, slot 1 is forced to one
 *   (`balance.shop.guaranteeExtension`), so a run can always keep growing.
 * - One tile action (add / remove a tile), rerolls at a rising price.
 * Purchases are applied by the reducer; this module only builds offers.
 */

import * as rng from './rng';
import type { Balance, CardSpec, CardType, Rarity, RngState, ShopOffer, ShopState, TileActionOffer } from './types';

const RARITIES: Rarity[] = ['basic', 'uncommon', 'exotic', 'relic'];

/** Pick a rarity by the configured odds. */
export function rollRarity(state: RngState, balance: Balance): [Rarity, RngState] {
  const [v, next] = rng.next(state);
  let acc = 0;
  for (const r of RARITIES) {
    acc += balance.shop.rarityOdds[r];
    if (v < acc) return [r, next];
  }
  return ['basic', next];
}

/**
 * Pick one card of a rolled rarity from `pool`, falling back to the nearest
 * lower rarity when nothing of that rarity exists in the pool.
 */
export function rollCard(state: RngState, pool: readonly CardSpec[], balance: Balance): [CardSpec | undefined, RngState] {
  if (pool.length === 0) return [undefined, state];
  let [rarity, s] = rollRarity(state, balance);
  let candidates = pool.filter((c) => c.rarity === rarity);
  while (candidates.length === 0) {
    const i = RARITIES.indexOf(rarity);
    if (i === 0) {
      candidates = pool.slice();
      break;
    }
    rarity = RARITIES[i - 1] as Rarity;
    candidates = pool.filter((c) => c.rarity === rarity);
  }
  const [k, s2] = rng.int(s, candidates.length);
  return [candidates[k], s2];
}

export interface BuildShopInput {
  rng: RngState;
  cards: readonly CardSpec[];
  balance: Balance;
  /** Types the player currently holds, to apply the Extension guarantee. */
  heldTypes: readonly CardType[];
  /** Existing shop when rerolling (keeps the tile action and reroll count). */
  previous?: ShopState;
}

export function buildOffers(input: BuildShopInput): { offers: ShopOffer[]; rng: RngState } {
  const { cards, balance } = input;
  const offers: ShopOffer[] = [];
  let s = input.rng;
  for (let slot = 0; slot < balance.shop.cardSlots; slot++) {
    const forceExtension = slot === 0 && balance.shop.guaranteeExtension && !input.heldTypes.includes('extension');
    const pool = forceExtension ? cards.filter((c) => c.type === 'extension') : cards;
    let card: CardSpec | undefined;
    [card, s] = rollCard(s, pool.length > 0 ? pool : cards, balance);
    if (card) offers.push({ cardId: card.id, price: card.price, sold: false });
  }
  return { offers, rng: s };
}

export function rollTileAction(state: RngState, balance: Balance): [TileActionOffer, RngState] {
  const [k, next] = rng.int(state, 2);
  return [
    k === 0 ? { kind: 'add_tile', price: balance.shop.addTile, sold: false } : { kind: 'remove_tile', price: balance.shop.removeTile, sold: false },
    next,
  ];
}

export function rerollPrice(rerolls: number, balance: Balance): number {
  return balance.shop.rerollBase + balance.shop.rerollIncrement * rerolls;
}

/** A fresh shop after a regular round. */
export function buildShop(input: BuildShopInput): { shop: ShopState; rng: RngState } {
  const built = buildOffers(input);
  const [tileAction, s] = rollTileAction(built.rng, input.balance);
  return { shop: { offers: built.offers, tileAction, rerolls: 0, rerollPrice: rerollPrice(0, input.balance) }, rng: s };
}

/** The same shop with new card offers (tile action stays). */
export function rerollShop(input: BuildShopInput & { previous: ShopState }): { shop: ShopState; rng: RngState } {
  const built = buildOffers(input);
  const rerolls = input.previous.rerolls + 1;
  return {
    shop: { ...input.previous, offers: built.offers, rerolls, rerollPrice: rerollPrice(rerolls, input.balance) },
    rng: built.rng,
  };
}

export function sellPrice(card: CardSpec, balance: Balance): number {
  return Math.floor(card.price * balance.shop.sellFraction);
}
