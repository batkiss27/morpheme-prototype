/**
 * In-run modifier implementations, keyed by `hookId` (P5-01, P5-03). The
 * registry validates content at startup and folds hooks over the active
 * modifiers in acquisition order.
 */

import { bossesBefore } from '../scoring';
import type { ExtensionBonusKind, MorphemeInfo } from '../scoring';
import type { Balance, BossRules, CardSpec, CurrencySource, EngineContent, HookId, InRunModifierSpec, RunState } from '../types';
import type { HookContext, ModifierImpl } from './hooks';

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

export const implementations: Record<HookId, ModifierImpl> = {
  suffix_bias: {
    morphemeValue: ({ spec }, info, value) => (info.isTail ? value * num(spec.params.mult, 2) : value),
  },
  prefix_bias: {
    morphemeValue: ({ spec }, info, value) => (info.isHead ? value * num(spec.params.mult, 2) : value),
  },
  inflection: {
    morphemeValue: ({ spec }, info, value) => (info.text.length <= num(spec.params.maxLength, 2) ? value * num(spec.params.mult, 2) : value),
  },
  vowel_harmony: {
    morphemeValue: ({ spec }, info, value) => {
      if (!info.addedThisRound) return value;
      const mine = [...info.text.toUpperCase()].filter((c) => VOWELS.has(c));
      if (mine.length === 0) return value;
      const rest = new Set([...info.restText.toUpperCase()].filter((c) => VOWELS.has(c)));
      return mine.every((v) => rest.has(v)) ? value * num(spec.params.mult, 2) : value;
    },
  },
  coinage: {
    roundCurrency: ({ state, spec }) => {
      const m = state.chain?.morphemes.length ?? 0;
      return m > 0 ? { source: 'Coinage', amount: m * num(spec.params.perMorpheme, 1) } : null;
    },
  },
  rack_extension: {
    bossRules: ({ spec }, rules) => ({ ...rules, rackCap: rules.rackCap + num(spec.params.extra, 2) }),
  },
  momentum: {
    multiplierBase: ({ state }, base) => base + (state.modifierState.momentum ?? 0),
    onNaturalRound: ({ state, spec }) => ({
      modifierState: { ...state.modifierState, momentum: (state.modifierState.momentum ?? 0) + num(spec.params.perRound, 0.05) },
    }),
  },
  etymologist: {
    strain: ({ state, balance }, _card, units) => {
      const cycle = bossesBefore(state.round, balance);
      if (state.modifierState.etymologist_cycle === cycle) return { units };
      return { units: 0, patch: { modifierState: { ...state.modifierState, etymologist_cycle: cycle } } };
    },
  },
  agglutination: {
    multiplierBase: ({ spec }, base) => base + num(spec.params.bonus, 0.1),
  },
  mirror: {
    extensionBonus: ({ spec }, kind, bonus) => (kind === 'front_back' ? bonus * num(spec.params.mult, 2) : bonus),
  },
  chain_lightning: {
    multiplierBase: ({ state }, base) => base + (state.modifierState.chain_lightning ?? 0),
    strain: ({ state, spec }) => ({
      units: 0,
      patch: { modifierState: { ...state.modifierState, chain_lightning: (state.modifierState.chain_lightning ?? 0) + num(spec.params.bonus, 0.1) } },
    }),
  },
  polyglot: {
    reward: ({ spec }, r) => ({ offers: r.offers + num(spec.params.extraOffers, 1), picks: num(spec.params.picks, 2) }),
  },

  // --- remaining Basic ---------------------------------------------------------
  consonant_cluster: {
    flatBonus: ({ state, spec }) => {
      if (!state.chain) return 0;
      const text = state.chain.tiles.map((t) => (t.playedAs ?? t.letter).toUpperCase()).join('');
      const runs = text.match(/[^AEIOU_]{3,}/g)?.length ?? 0;
      return runs * num(spec.params.perRun, 15);
    },
  },
  long_form: {
    flatBonus: ({ state, spec }) => {
      if (!state.chain) return 0;
      const byId = new Map(state.chain.tiles.map((t) => [t.id, t]));
      const long = state.chain.morphemes.filter((m) => m.tileIds.length >= num(spec.params.minLength, 5)).length;
      void byId;
      return long * num(spec.params.bonus, 10);
    },
  },
  bonus_draw: {
    handSize: ({ spec }, size) => size + num(spec.params.extra, 1),
  },
  blank_slate: {
    onAcquire: ({ state, spec }) => {
      const n = num(spec.params.blanks, 2);
      const serial = state.pool.length + state.hand.length + (state.chain?.tiles.length ?? 0) + state.destroyed.length;
      const blanks = Array.from({ length: n }, (_, i) => ({ id: `_+${serial + i + 1}`, letter: '_' as const, baseValue: 0, modifiers: [] }));
      return { pool: [...state.pool, ...blanks] };
    },
  },

  // --- remaining Uncommon ------------------------------------------------------
  reduplication_mod: {
    morphemeValue: ({ spec }, info, value) =>
      info.addedThisRound && info.allTexts.some((t, k) => k !== info.index && t === info.text) ? value * num(spec.params.mult, 2) : value,
  },
  incorporation: {
    morphemeValue: ({ spec }, info, value) => {
      const heavy = info.tileValues.filter((v) => v >= num(spec.params.minValue, 8)).length;
      return value + heavy * info.count;
    },
  },
  two_step: {
    extensionBonus: ({ spec }, kind, bonus) => (kind === 'two_same_side' ? num(spec.params.bonus, 2) : bonus),
  },
  streak_keeper: {
    keepStreak: ({ state, balance }) => {
      const cycle = bossesBefore(state.round, balance);
      if (state.modifierState.streak_keeper_cycle === cycle) return { keep: false };
      return { keep: true, patch: { modifierState: { ...state.modifierState, streak_keeper_cycle: cycle } } };
    },
  },
  discount: {
    priceMult: ({ spec }, mult) => mult * (1 - num(spec.params.discount, 0.15)),
  },
  boss_bounty: {
    bossCurrency: ({ state, spec }) => {
      const words = state.boss?.words.length ?? 0;
      return words > 0 ? { source: 'Boss Bounty', amount: words * num(spec.params.perWord, 2) } : null;
    },
  },
  feed_slow: {
    bossRules: ({ spec }, rules) => ({ ...rules, feedIntervalMs: Math.round(rules.feedIntervalMs * (1 + num(spec.params.slower, 0.2))) }),
  },
  second_chance: {
    onAcquire: ({ state, spec }) => ({ lives: state.lives + num(spec.params.lives, 1) }),
  },
  free_reroll: {
    freeRerolls: ({ spec }, n) => n + num(spec.params.perShop, 1),
  },
  heavy_metal: {
    morphemeValue: ({ spec }, info, value) => value + info.tileValues.filter((v) => v >= num(spec.params.minValue, 4)).length * num(spec.params.bonus, 2),
  },

  // --- remaining Exotic --------------------------------------------------------
  sesquipedalian: {
    scoreMultiplier: ({ state, spec }) => ((state.chain?.tiles.length ?? 0) >= num(spec.params.minLetters, 20) ? num(spec.params.mult, 1.5) : 1),
  },
  overflow: {
    bossRules: (_ctx, rules) => ({ ...rules, overflowEnds: false, overflowDiscards: 'newest' }),
  },
  affixer: {
    morphemeValue: ({ spec }, info, value) => (info.side === 'front' ? value * num(spec.params.mult, 1.5) : value),
  },
  milestone_keeper: {
    shopSlot: () => true,
  },
  double_time: {
    bossRules: ({ spec }, rules) => ({ ...rules, timerMs: Math.round(rules.timerMs * (1 + num(spec.params.more, 0.5))) }),
  },

  // --- remaining Relic ---------------------------------------------------------
  polysynthesis: {
    multiplierBase: ({ spec }, base) => base + num(spec.params.bonus, 0.015),
  },
  palindrome: {
    scoreMultiplier: ({ state, spec }) => {
      const chain = state.chain;
      if (!chain) return 1;
      const byId = new Map(chain.tiles.map((t) => [t.id, t]));
      const added = chain.morphemes.filter((m) => m.round === state.round);
      const isPal = (m: (typeof added)[number]) => {
        const t = m.tileIds.map((id) => (byId.get(id)!.playedAs ?? byId.get(id)!.letter).toLowerCase()).join('');
        return t.length >= 2 && t === [...t].reverse().join('');
      };
      return added.some(isPal) ? num(spec.params.mult, 2) : 1;
    },
  },
  immortal_word: {
    ignoreFail: ({ state }) => {
      if (state.modifierState.immortal_word_used) return { ignore: false };
      return { ignore: true, patch: { modifierState: { ...state.modifierState, immortal_word_used: 1 } } };
    },
  },
};

export function validateInRunModifiers(mods: readonly InRunModifierSpec[]): void {
  const seen = new Set<string>();
  for (const m of mods) {
    if (seen.has(m.id)) throw new Error(`duplicate in-run modifier id "${m.id}"`);
    seen.add(m.id);
    if (!(m.hookId in implementations)) throw new Error(`in-run modifier "${m.id}" uses unknown hook "${m.hookId}"`);
  }
}

export function modifierSpec(content: EngineContent, id: string): InRunModifierSpec | undefined {
  return content.inRunModifiers.find((m) => m.id === id);
}

/** Active (spec, impl) pairs in acquisition order. Unknown ids are skipped. */
export function active(state: RunState, content: EngineContent): { spec: InRunModifierSpec; impl: ModifierImpl }[] {
  return state.inRun
    .map((id) => modifierSpec(content, id))
    .filter((s): s is InRunModifierSpec => !!s)
    .map((spec) => ({ spec, impl: implementations[spec.hookId] }));
}

const ctx = (state: RunState, balance: Balance, spec: InRunModifierSpec): HookContext => ({ state, balance, spec });

// --- Folds --------------------------------------------------------------------

export function multiplierBase(state: RunState, content: EngineContent): number {
  return active(state, content).reduce((base, { spec, impl }) => (impl.multiplierBase ? impl.multiplierBase(ctx(state, content.balance, spec), base) : base), content.balance.scoring.multiplierBase);
}

/** Per-morpheme points function for `scoring.wordPointsBy` (hooks fold over the base points). */
export function morphemeMultiplier(state: RunState, content: EngineContent): (info: MorphemeInfo, base: number) => number {
  const hooks = active(state, content).filter((a) => a.impl.morphemeValue);
  return (info, base) => hooks.reduce((v, { spec, impl }) => impl.morphemeValue!(ctx(state, content.balance, spec), info, v), base);
}

export function extensionBonus(state: RunState, content: EngineContent, kind: ExtensionBonusKind, bonus: number): number {
  return active(state, content).reduce((b, { spec, impl }) => (impl.extensionBonus ? impl.extensionBonus(ctx(state, content.balance, spec), kind, b) : b), bonus);
}

export function strain(state: RunState, content: EngineContent, card: CardSpec, units: number): { units: number; state: RunState } {
  let s = state;
  let u = units;
  for (const { spec, impl } of active(state, content)) {
    if (!impl.strain) continue;
    const r = impl.strain(ctx(s, content.balance, spec), card, u);
    u = r.units;
    if (r.patch) s = { ...s, ...r.patch };
  }
  return { units: u, state: s };
}

export function roundCurrency(state: RunState, content: EngineContent): CurrencySource[] {
  return active(state, content)
    .map(({ spec, impl }) => (impl.roundCurrency ? impl.roundCurrency(ctx(state, content.balance, spec)) : null))
    .filter((c): c is CurrencySource => !!c && c.amount > 0);
}

export function onNaturalRound(state: RunState, content: EngineContent): RunState {
  let s = state;
  for (const { spec, impl } of active(state, content)) {
    if (impl.onNaturalRound) s = { ...s, ...impl.onNaturalRound(ctx(s, content.balance, spec)) };
  }
  return s;
}

export function bossRules(state: RunState, content: EngineContent, rules: BossRules): BossRules {
  return active(state, content).reduce((r, { spec, impl }) => (impl.bossRules ? impl.bossRules(ctx(state, content.balance, spec), r) : r), rules);
}

export function flatBonus(state: RunState, content: EngineContent): number {
  return active(state, content).reduce((sum, { spec, impl }) => sum + (impl.flatBonus ? impl.flatBonus(ctx(state, content.balance, spec)) : 0), 0);
}

export function scoreMultiplier(state: RunState, content: EngineContent): number {
  return active(state, content).reduce((m, { spec, impl }) => m * (impl.scoreMultiplier ? impl.scoreMultiplier(ctx(state, content.balance, spec)) : 1), 1);
}

export function handSize(state: RunState, content: EngineContent, size: number): number {
  return active(state, content).reduce((n, { spec, impl }) => (impl.handSize ? impl.handSize(ctx(state, content.balance, spec), n) : n), size);
}

/** Run a newly acquired modifier's onAcquire hook. */
export function onAcquire(state: RunState, content: EngineContent, id: string): RunState {
  const spec = modifierSpec(content, id);
  const impl = spec && implementations[spec.hookId];
  if (!spec || !impl?.onAcquire) return state;
  return { ...state, ...impl.onAcquire(ctx(state, content.balance, spec)) };
}

export function priceMult(state: RunState, content: EngineContent, mult: number): number {
  return active(state, content).reduce((m, { spec, impl }) => (impl.priceMult ? impl.priceMult(ctx(state, content.balance, spec), m) : m), mult);
}

export function freeRerolls(state: RunState, content: EngineContent): number {
  return active(state, content).reduce((n, { spec, impl }) => (impl.freeRerolls ? impl.freeRerolls(ctx(state, content.balance, spec), n) : n), 0);
}

export function shopSlot(state: RunState, content: EngineContent, open: boolean): boolean {
  return active(state, content).reduce((o, { spec, impl }) => (impl.shopSlot ? impl.shopSlot(ctx(state, content.balance, spec), o) : o), open);
}

export function bossCurrency(state: RunState, content: EngineContent): CurrencySource[] {
  return active(state, content)
    .map(({ spec, impl }) => (impl.bossCurrency ? impl.bossCurrency(ctx(state, content.balance, spec)) : null))
    .filter((c): c is CurrencySource => !!c && c.amount > 0);
}

export function keepStreak(state: RunState, content: EngineContent): { keep: boolean; state: RunState } {
  let s = state;
  for (const { spec, impl } of active(state, content)) {
    if (!impl.keepStreak) continue;
    const r = impl.keepStreak(ctx(s, content.balance, spec));
    if (r.patch) s = { ...s, ...r.patch };
    if (r.keep) return { keep: true, state: s };
  }
  return { keep: false, state: s };
}

export function ignoreFail(state: RunState, content: EngineContent): { ignore: boolean; state: RunState } {
  let s = state;
  for (const { spec, impl } of active(state, content)) {
    if (!impl.ignoreFail) continue;
    const r = impl.ignoreFail(ctx(s, content.balance, spec));
    if (r.patch) s = { ...s, ...r.patch };
    if (r.ignore) return { ignore: true, state: s };
  }
  return { ignore: false, state: s };
}

export function rewardShape(state: RunState, content: EngineContent): { offers: number; picks: number } {
  return active(state, content).reduce((r, { spec, impl }) => (impl.reward ? impl.reward(ctx(state, content.balance, spec), r) : r), {
    offers: content.balance.reward.offers,
    picks: 1,
  });
}
