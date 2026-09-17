/**
 * Instant card effects, used through USE_CARD: Sound Shift, Loanword,
 * Utility, and Echo. Each returns a partial RunState patch or an error.
 * Consuming the card and logging is the reducer's job.
 */

import { rollModifier } from '../boss/modifiers';
import * as C from '../chain';
import * as rng from '../rng';
import { draw, isBlank, returnTiles, tileLetter } from '../tiles';
import type { CardSpec, CardTarget, EngineContent, Letter, Phase, RunState, Tile } from '../types';

export interface EffectContext {
  state: RunState;
  card: CardSpec;
  target: CardTarget;
  content: EngineContent;
}

export type EffectResult = { ok: true; patch: Partial<RunState> } | { ok: false; error: string };
export type InstantEffect = (ctx: EffectContext) => EffectResult;

const ok = (patch: Partial<RunState>): EffectResult => ({ ok: true, patch });
const fail = (error: string): EffectResult => ({ ok: false, error });

const VOWELS: Letter[] = ['A', 'E', 'I', 'O', 'U'];

function chainTile(state: RunState, target: CardTarget): { tile: Tile } | { error: string } {
  if (!state.chain) return { error: 'there is no word yet' };
  if (!target.tileId) return { error: 'choose a letter in the word' };
  const tile = state.chain.tiles.find((t) => t.id === target.tileId);
  if (!tile) return { error: `tile ${target.tileId} is not in the word` };
  return { tile };
}

// --- Sound Shift ------------------------------------------------------------

/** A chosen vowel becomes a random *other* vowel. */
export const vowelShift: InstantEffect = ({ state, target }) => {
  const r = chainTile(state, target);
  if ('error' in r) return fail(r.error);
  const current = tileLetter(r.tile);
  if (!VOWELS.includes(current)) return fail(`${current} is not a vowel`);
  const others = VOWELS.filter((v) => v !== current);
  const [i, next] = rng.int(state.rng, others.length);
  return ok({ chain: C.setTileLetter(state.chain!, r.tile.id, others[i] as Letter), rng: next, chainDirty: true });
};

/** A chosen vowel becomes Y. */
export const glide: InstantEffect = ({ state, target }) => {
  const r = chainTile(state, target);
  if ('error' in r) return fail(r.error);
  if (!VOWELS.includes(tileLetter(r.tile))) return fail(`${tileLetter(r.tile)} is not a vowel`);
  return ok({ chain: C.setTileLetter(state.chain!, r.tile.id, 'Y'), chainDirty: true });
};

/** Delete one letter from the word; the tile is destroyed. */
export const elision: InstantEffect = ({ state, target }) => {
  const r = chainTile(state, target);
  if ('error' in r) return fail(r.error);
  const removed = C.removeTile(state.chain!, r.tile.id);
  if (!removed.ok) return fail(removed.error);
  return ok({ chain: removed.value.chain, destroyed: [...state.destroyed, removed.value.removed], chainDirty: true });
};

/** Swap a chosen letter with the one after it. */
export const metathesis: InstantEffect = ({ state, target }) => {
  const r = chainTile(state, target);
  if ('error' in r) return fail(r.error);
  const swapped = C.swapWithNext(state.chain!, r.tile.id);
  if (!swapped.ok) return fail(swapped.error);
  return ok({ chain: swapped.value, chainDirty: true });
};

// --- Loanword ---------------------------------------------------------------

/** Add one tile of a chosen letter to the pool, for the rest of the run. */
export const loanword: InstantEffect = ({ state, target, content }) => {
  const letter = target.letter;
  if (!letter) return fail('choose a letter to add');
  const spec = content.letters.find((l) => l.letter === letter);
  if (!spec) return fail(`unknown letter ${letter}`);
  const serial = state.pool.length + state.hand.length + (state.chain?.tiles.length ?? 0) + state.destroyed.length + 1;
  const tile: Tile = { id: `${letter}+${serial}`, letter, baseValue: spec.value, modifiers: [] };
  return ok({ pool: [...state.pool, tile] });
};

/** Remove N random tiles of base value ≤ maxValue from the pool. */
export const simplification: InstantEffect = ({ state, card }) => {
  const count = Number(card.params.count ?? 3);
  const maxValue = Number(card.params.maxValue ?? 1);
  const candidates = state.pool.filter((t) => t.baseValue <= maxValue && !isBlank(t));
  if (candidates.length === 0) return fail(`no tiles of value ≤ ${maxValue} left in the pool`);
  const [shuffled, next] = rng.shuffle(state.rng, candidates);
  const gone = new Set(shuffled.slice(0, count).map((t) => t.id));
  return ok({
    pool: state.pool.filter((t) => !gone.has(t.id)),
    destroyed: [...state.destroyed, ...state.pool.filter((t) => gone.has(t.id))],
    rng: next,
  });
};

/** Return the hand and draw a fresh one. Only before any step this round. */
export const redraw: InstantEffect = ({ state, content }) => {
  if (state.steps.length > 0) return fail('Redraw must be used before playing a step this round');
  const pool = returnTiles(state.pool, state.hand);
  const d = draw(pool, content.balance.hand.size, state.rng);
  return ok({ pool: d.pool, hand: d.drawn, rng: d.rng });
};

// --- Utility ----------------------------------------------------------------

export const bank: InstantEffect = ({ state }) => ok({ roundEffects: { ...state.roundEffects, bank: true } });
export const insurance: InstantEffect = ({ state }) => ok({ roundEffects: { ...state.roundEffects, insurance: true } });
export const lexicographer: InstantEffect = ({ state }) => ok({ roundEffects: { ...state.roundEffects, lexicographer: true } });

/** Reroll the boss modifier to a different one. */
export const amendment: InstantEffect = ({ state, content }) => {
  if (!state.boss) return fail('Amendment is used at the start of a Boss Round');
  const [mod, next] = rollModifier(content.bossModifiers, state.rng, state.boss.modifierId);
  if (!mod) return fail('there is no other boss modifier to roll');
  return ok({ boss: { ...state.boss, modifierId: mod.id, rerolls: state.boss.rerolls + 1 }, rng: next, flags: { ...state.flags, amendmentUsed: true } });
};

// --- Echo ---------------------------------------------------------------------

/** Copy another held card. */
export const echo: InstantEffect = ({ state, target }) => {
  if (!target.instanceId) return fail('choose a card to copy');
  const source = state.cards.find((c) => c.instanceId === target.instanceId);
  if (!source) return fail('that card is not in your hand');
  const copy = { instanceId: `c${state.cardSeq}`, cardId: source.cardId };
  return ok({ cards: [...state.cards, copy], cardSeq: state.cardSeq + 1 });
};

// --- more Sound Shift ---------------------------------------------------------

const CONSONANTS: Letter[] = [...'BCDFGHJKLMNPQRSTVWXYZ'] as Letter[];

function reletterConsonant(direction: 'lower' | 'higher'): InstantEffect {
  return ({ state, target, content }) => {
    const r = chainTile(state, target);
    if ('error' in r) return fail(r.error);
    const current = tileLetter(r.tile);
    if (!CONSONANTS.includes(current)) return fail(`${current} is not a consonant`);
    const value = (l: Letter) => content.letters.find((x) => x.letter === l)?.value ?? 0;
    const cur = value(current);
    const pool = CONSONANTS.filter((l) => (direction === 'lower' ? value(l) < cur : value(l) > cur));
    if (pool.length === 0) return fail(`no consonant has a ${direction} value than ${current}`);
    const [i, next] = rng.int(state.rng, pool.length);
    return ok({ chain: C.setTileLetter(state.chain!, r.tile.id, pool[i] as Letter), rng: next, chainDirty: true });
  };
}
export const lenition = reletterConsonant('lower');
export const fortition = reletterConsonant('higher');

/** Every letter of the chosen tile's base value is re-lettered at random within that value. */
export const weightSwap: InstantEffect = ({ state, target, content }) => {
  const r = chainTile(state, target);
  if ('error' in r) return fail(r.error);
  const v = r.tile.baseValue;
  const same = content.letters.filter((l) => l.value === v && l.letter !== '_').map((l) => l.letter);
  if (same.length < 2) return fail(`no other letter is worth ${v}`);
  let chain = state.chain!;
  let s = state.rng;
  for (const t of chain.tiles) {
    if (t.baseValue !== v || t.letter === '_') continue;
    let i: number;
    [i, s] = rng.int(s, same.length);
    chain = C.setTileLetter(chain, t.id, same[i] as Letter);
  }
  return ok({ chain, rng: s, chainDirty: true });
};

/** Double a chosen letter: a copy tile right after it (it scores twice). */
export const gemination: InstantEffect = ({ state, target }) => {
  const r = chainTile(state, target);
  if ('error' in r) return fail(r.error);
  const d = C.duplicateTile(state.chain!, r.tile.id, `${r.tile.id}+gem${state.cardSeq}`);
  if (!d.ok) return fail(d.error);
  return ok({ chain: d.value, chainDirty: true });
};

/** Rotate every vowel A→E→I→O→U→A. */
export const greatVowelShift: InstantEffect = ({ state }) => {
  if (!state.chain) return fail('there is no word yet');
  let chain = state.chain;
  for (const t of chain.tiles) {
    const l = tileLetter(t);
    const k = VOWELS.indexOf(l);
    if (k !== -1) chain = C.setTileLetter(chain, t.id, VOWELS[(k + 1) % VOWELS.length] as Letter);
  }
  return ok({ chain, chainDirty: true });
};

/** Ablaut (reusable): change a chosen vowel to a chosen vowel. */
export const ablaut: InstantEffect = ({ state, target }) => {
  const r = chainTile(state, target);
  if ('error' in r) return fail(r.error);
  if (!VOWELS.includes(tileLetter(r.tile))) return fail(`${tileLetter(r.tile)} is not a vowel`);
  if (!target.letter || !VOWELS.includes(target.letter)) return fail('choose a vowel to change it to');
  return ok({ chain: C.setTileLetter(state.chain!, r.tile.id, target.letter), chainDirty: true });
};

// --- more Extension-type instants -----------------------------------------------

/** Rearrange the tail morpheme's letters into a new dictionary word (then extend it naturally). */
export const anagram: InstantEffect = ({ state, target, content }) => {
  if (!state.chain) return fail('there is no word yet');
  if (!target.letters) return fail('type the rearranged letters');
  const a = C.anagramLastMorpheme(state.chain, target.letters);
  if (!a.ok) return fail(a.error);
  const tail = C.tailText(a.value);
  if (!content.dictionary.has(tail)) return fail(`"${tail}" is not in the dictionary`);
  return ok({ chain: a.value, strainThisRound: state.strainThisRound + 1 });
};

/** Remove the tail morpheme (its tiles return to the hand), then add two. */
export const backformation: InstantEffect = ({ state }) => {
  if (!state.chain) return fail('there is no word yet');
  const r = C.removeLastMorpheme(state.chain);
  if (!r.ok) return fail(r.error);
  const cleared = r.value.removed.map((t) => {
    const { playedAs: _p, ...rest } = t;
    return rest;
  });
  return ok({ chain: r.value.chain, hand: [...state.hand, ...cleared], strainThisRound: state.strainThisRound + 1, chainDirty: true });
};

// --- more Loanword -------------------------------------------------------------

function serialFor(state: RunState): number {
  return state.pool.length + state.hand.length + (state.chain?.tiles.length ?? 0) + state.destroyed.length + 1;
}

/** Add N random tiles of base value ≥ minValue. */
export const borrowing: InstantEffect = ({ state, card, content }) => {
  const n = Number(card.params.count ?? 3);
  const minValue = Number(card.params.minValue ?? 4);
  const pool = content.letters.filter((l) => l.value >= minValue);
  if (pool.length === 0) return fail('no letters qualify');
  let s = state.rng;
  const added: Tile[] = [];
  for (let k = 0; k < n; k++) {
    let i: number;
    [i, s] = rng.int(s, pool.length);
    const spec = pool[i]!;
    added.push({ id: `${spec.letter}+${serialFor(state) + k}`, letter: spec.letter, baseValue: spec.value, modifiers: [] });
  }
  return ok({ pool: [...state.pool, ...added], rng: s });
};

/** Remove every pool tile of a chosen letter. */
export const purism: InstantEffect = ({ state, target }) => {
  if (!target.letter) return fail('choose a letter to remove');
  const gone = state.pool.filter((t) => t.letter === target.letter);
  if (gone.length === 0) return fail(`no ${target.letter} tiles in the pool`);
  return ok({ pool: state.pool.filter((t) => t.letter !== target.letter), destroyed: [...state.destroyed, ...gone] });
};

/** Apply a level-1/2 tile modifier to a tile in hand for the rest of the run. */
export const tileSmith: InstantEffect = ({ state, target, content, card }) => {
  if (!target.tileId) return fail('choose a tile in your hand');
  if (!target.modifier) return fail('choose a modifier');
  const spec = content.tileModifiers.find((m) => m.id === target.modifier);
  if (!spec || spec.level > Number(card.params.maxLevel ?? 2)) return fail('choose a level 1 or 2 modifier');
  const i = state.hand.findIndex((t) => t.id === target.tileId);
  if (i === -1) return fail('that tile is not in your hand');
  const hand = state.hand.map((t, k) => (k === i ? { ...t, modifiers: [...t.modifiers, target.modifier!] } : t));
  return ok({ hand });
};

/** Duplicate a hand tile into the pool, modifiers included. */
export const dialect: InstantEffect = ({ state, target }) => {
  const tile = state.hand.find((t) => t.id === target.tileId);
  if (!tile) return fail('choose a tile in your hand');
  return ok({ pool: [...state.pool, { ...tile, id: `${tile.letter}+${serialFor(state)}`, modifiers: [...tile.modifiers] }] });
};

/** Hand size +1 for the rest of the run. */
export const substrateCard: InstantEffect = ({ state, card }) => ok({ modifierState: { ...state.modifierState, hand_bonus: (state.modifierState.hand_bonus ?? 0) + Number(card.params.extra ?? 1) } });

/** Copies of every committed word tile back into the pool. */
export const restock: InstantEffect = ({ state }) => {
  if (!state.chain || state.chain.tiles.length === 0) return fail('there is no word yet');
  const base = serialFor(state);
  const copies = state.chain.tiles.map((t, k) => ({ ...t, id: `${t.letter}+${base + k}`, modifiers: [...t.modifiers] }));
  return ok({ pool: [...state.pool, ...copies] });
};

// --- more Utility ----------------------------------------------------------------

/** One free shop reroll. */
export const etymology: InstantEffect = ({ state }) => {
  if (!state.shop) return fail('Etymology is used in the shop');
  return ok({ shop: { ...state.shop, freeRerolls: state.shop.freeRerolls + 1 } });
};
export const milestone: InstantEffect = ({ state }) => ok({ roundEffects: { ...state.roundEffects, milestone: true } });
export const tempoCard: InstantEffect = ({ state, card }) => ok({ flags: { ...state.flags, tempoBonus: (state.flags.tempoBonus ?? 0) + Number(card.params.bonus ?? 0.2) } });
export const wildcardRound: InstantEffect = ({ state }) => ok({ roundEffects: { ...state.roundEffects, wildcard: true } });
export const secondWind: InstantEffect = ({ state }) => ok({ lives: state.lives + 1 });

export const instantEffects = {
  vowel_shift: vowelShift,
  glide,
  elision,
  metathesis,
  loanword,
  simplification,
  redraw,
  bank,
  insurance,
  lexicographer,
  amendment,
  echo,
  lenition,
  fortition,
  weight_swap: weightSwap,
  gemination,
  great_vowel_shift: greatVowelShift,
  ablaut,
  anagram,
  backformation,
  borrowing,
  purism,
  tile_smith: tileSmith,
  dialect,
  substrate_card: substrateCard,
  restock,
  etymology,
  milestone,
  tempo_card: tempoCard,
  wildcard_round: wildcardRound,
  second_wind: secondWind,
} satisfies Partial<Record<CardSpec['effectId'], InstantEffect>>;

export type InstantEffectId = keyof typeof instantEffects;

export function isInstantEffect(id: string): id is InstantEffectId {
  return id in instantEffects;
}

/** Phases in which an instant effect may be used. */
export const effectPhases: Record<InstantEffectId, Phase[]> = {
  vowel_shift: ['EXTEND'],
  glide: ['EXTEND'],
  elision: ['EXTEND'],
  metathesis: ['EXTEND'],
  loanword: ['EXTEND', 'SHOP'],
  simplification: ['EXTEND', 'SHOP'],
  redraw: ['EXTEND'],
  bank: ['EXTEND'],
  insurance: ['EXTEND'],
  lexicographer: ['EXTEND'],
  amendment: ['BOSS_INTRO'],
  echo: ['EXTEND', 'SHOP'],
  lenition: ['EXTEND'],
  fortition: ['EXTEND'],
  weight_swap: ['EXTEND'],
  gemination: ['EXTEND'],
  great_vowel_shift: ['EXTEND'],
  ablaut: ['EXTEND'],
  anagram: ['EXTEND'],
  backformation: ['EXTEND'],
  borrowing: ['EXTEND', 'SHOP'],
  purism: ['EXTEND', 'SHOP'],
  tile_smith: ['EXTEND'],
  dialect: ['EXTEND'],
  substrate_card: ['EXTEND', 'SHOP'],
  restock: ['EXTEND', 'SHOP'],
  etymology: ['SHOP'],
  milestone: ['EXTEND'],
  tempo_card: ['EXTEND', 'SHOP', 'BOSS_INTRO'],
  wildcard_round: ['EXTEND'],
  second_wind: ['EXTEND', 'SHOP'],
};
