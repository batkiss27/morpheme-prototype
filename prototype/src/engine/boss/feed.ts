/**
 * Boss tile feed (P4-03): a queue of copies of the chain's tiles, shuffled,
 * cycling when exhausted (D4); a rack with a cap; and the two timers that
 * only advance through BOSS_TICK.
 */

import * as rng from '../rng';
import type { BossRules, BossState, RngState, Tile } from '../types';
import { tileLetter } from '../tiles';
import { bossCopy } from './board';

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/** A fresh shuffled cycle of copies of the chain tiles (Wild Drought / Mute Modifiers applied). */
export function buildQueue(chainTiles: readonly Tile[], state: RngState, cycle: number, rules?: Pick<BossRules, 'noWilds' | 'muteModifiers'>): [Tile[], RngState] {
  let copies = chainTiles.map((t) => bossCopy(t, cycle));
  if (rules?.noWilds) copies = copies.filter((t) => t.letter !== '_' && !t.modifiers.includes('wild'));
  if (rules?.muteModifiers) copies = copies.map((t) => ({ ...t, modifiers: [] }));
  const [shuffled, next] = rng.shuffle(state, copies);
  return [shuffled, next];
}

/** Y Not: vowel tiles play as Y; Vowel Wild tiles and blanks are unaffected. */
export function applyVowelsToY(tiles: readonly Tile[]): Tile[] {
  return tiles.map((t) => (VOWELS.has(t.letter) && !t.modifiers.includes('vowel_wild') ? { ...t, playedAs: 'Y' } : t));
}

export interface FeedResult {
  rack: Tile[];
  queue: Tile[];
  cycle: number;
  rng: RngState;
  /** Set when the rack overflowed. */
  overflow?: 'discarded' | 'ended';
}

/**
 * Move the next tile from the queue to the rack, refilling the queue from
 * the chain when empty. On a full rack: discard oldest / newest, or end.
 */
export function feedOne(boss: Pick<BossState, 'rack' | 'queue' | 'cycle'>, chainTiles: readonly Tile[], rules: BossRules, state: RngState): FeedResult {
  let queue = boss.queue.slice();
  let cycle = boss.cycle;
  let s = state;
  if (queue.length === 0) {
    if (chainTiles.length === 0) return { rack: boss.rack.slice(), queue, cycle, rng: s }; // nothing can feed
    cycle += 1;
    [queue, s] = buildQueue(chainTiles, s, cycle, rules);
    if (rules.vowelsToY) queue = applyVowelsToY(queue);
    if (queue.length === 0) return { rack: boss.rack.slice(), queue, cycle, rng: s };
  }
  const incoming = queue.shift() as Tile;
  const rack = boss.rack.slice();
  if (rules.deadLetter && tileLetter(incoming) === rules.deadLetter) return { rack, queue, cycle, rng: s }; // Dead Letter: lost
  if (rack.length >= rules.rackCap) {
    if (rules.overflowEnds) return { rack, queue: [incoming, ...queue], cycle, rng: s, overflow: 'ended' };
    if (rules.overflowDiscards === 'newest') return { rack, queue, cycle, rng: s, overflow: 'discarded' };
    rack.shift();
    rack.push(incoming);
    return { rack, queue, cycle, rng: s, overflow: 'discarded' };
  }
  rack.push(incoming);
  return { rack, queue, cycle, rng: s };
}

export interface TickResult {
  boss: BossState;
  rng: RngState;
  /** The round ended during this tick. */
  ended: false | 'timer' | 'overflow';
}

/** Advance both timers by `ms`, feeding tiles as their interval elapses. */
export function tick(boss: BossState, ms: number, chainTiles: readonly Tile[], state: RngState): TickResult {
  const rules = boss.rules;
  if (!rules) throw new Error('boss rules not resolved');
  let b: BossState = { ...boss, timeLeftMs: boss.timeLeftMs - ms, feedTimerMs: boss.feedTimerMs - ms };
  let s = state;
  if (rules.scrambleMs > 0) {
    let t = b.scrambleTimerMs - ms;
    let rack = b.rack;
    while (t <= 0) {
      [rack, s] = rng.shuffle(s, rack);
      t += rules.scrambleMs;
    }
    b = { ...b, rack, scrambleTimerMs: t };
  }
  while (b.feedTimerMs <= 0) {
    const fed = feedOne(b, chainTiles, rules, s);
    s = fed.rng;
    b = { ...b, rack: fed.rack, queue: fed.queue, cycle: fed.cycle, feedTimerMs: b.feedTimerMs + rules.feedIntervalMs };
    if (fed.overflow === 'ended') return { boss: { ...b, feedTimerMs: 0, ended: true, endReason: 'overflow' }, rng: s, ended: 'overflow' };
  }
  if (b.timeLeftMs <= 0) return { boss: { ...b, timeLeftMs: 0, ended: true, endReason: 'timer' }, rng: s, ended: 'timer' };
  return { boss: b, rng: s, ended: false };
}
