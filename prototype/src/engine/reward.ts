/**
 * Boss rewards (P5-02): offer N in-run modifiers by rarity odds for the boss
 * number, never one the player holds, no duplicates. Also builds the
 * conditional shop slot offer (D8: Basic / Uncommon only).
 */

import * as mods from './modifiers';
import * as rng from './rng';
import type { Balance, EngineContent, InRunModifierSpec, Rarity, RngState, RunState } from './types';

const RARITIES: Rarity[] = ['basic', 'uncommon', 'exotic', 'relic'];

export function rollRewardRarity(state: RngState, bossNumber: number, balance: Balance): [Rarity, RngState] {
  const table = balance.reward.rarityOddsByBoss;
  const odds = table[Math.min(bossNumber, table.length) - 1] ?? table[table.length - 1] ?? { basic: 1, uncommon: 0, exotic: 0, relic: 0 };
  const [v, next] = rng.next(state);
  let acc = 0;
  for (const r of RARITIES) {
    acc += odds[r];
    if (v < acc) return [r, next];
  }
  return ['basic', next];
}

/** Pick one modifier of a rolled rarity from `pool`, falling back to lower rarities. */
function pickByRarity(state: RngState, pool: readonly InRunModifierSpec[], rarity: Rarity): [InRunModifierSpec | undefined, RngState] {
  if (pool.length === 0) return [undefined, state];
  let r = rarity;
  let candidates = pool.filter((m) => m.rarity === r);
  while (candidates.length === 0) {
    const i = RARITIES.indexOf(r);
    if (i === 0) {
      candidates = pool.slice();
      break;
    }
    r = RARITIES[i - 1] as Rarity;
    candidates = pool.filter((m) => m.rarity === r);
  }
  const [k, next] = rng.int(state, candidates.length);
  return [candidates[k], next];
}

export function buildRewardOffers(state: RunState, content: EngineContent, bossNumber: number): { offers: string[]; picks: number; rng: RngState } {
  const shape = mods.rewardShape(state, content);
  const held = new Set(state.inRun);
  let pool = content.inRunModifiers.filter((m) => !held.has(m.id));
  const offers: string[] = [];
  let s = state.rng;
  for (let i = 0; i < shape.offers && pool.length > 0; i++) {
    let rarity: Rarity;
    [rarity, s] = rollRewardRarity(s, bossNumber, content.balance);
    let m: InRunModifierSpec | undefined;
    [m, s] = pickByRarity(s, pool, rarity);
    if (!m) break;
    offers.push(m.id);
    pool = pool.filter((x) => x.id !== m!.id);
  }
  return { offers, picks: Math.min(shape.picks, offers.length), rng: s };
}

/** One Basic/Uncommon modifier the player does not hold, for the conditional shop slot. */
export function buildShopSlotOffer(state: RunState, content: EngineContent): { modifierId: string | undefined; rng: RngState } {
  const held = new Set(state.inRun);
  const allowed = new Set(content.balance.shop.inRunSlotRarities);
  const pool = content.inRunModifiers.filter((m) => !held.has(m.id) && allowed.has(m.rarity));
  if (pool.length === 0) return { modifierId: undefined, rng: state.rng };
  const [k, next] = rng.int(state.rng, pool.length);
  return { modifierId: pool[k]!.id, rng: next };
}
