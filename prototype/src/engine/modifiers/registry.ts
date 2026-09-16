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

/** Per-morpheme multiplier function for `scoring.wordPointsBy`. */
export function morphemeMultiplier(state: RunState, content: EngineContent): (info: MorphemeInfo) => number {
  const hooks = active(state, content).filter((a) => a.impl.morphemeValue);
  return (info) => hooks.reduce((v, { spec, impl }) => impl.morphemeValue!(ctx(state, content.balance, spec), info, v), 1);
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

export function rewardShape(state: RunState, content: EngineContent): { offers: number; picks: number } {
  return active(state, content).reduce((r, { spec, impl }) => (impl.reward ? impl.reward(ctx(state, content.balance, spec), r) : r), {
    offers: content.balance.reward.offers,
    picks: 1,
  });
}
