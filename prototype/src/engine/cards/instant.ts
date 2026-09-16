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
};
