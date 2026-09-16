/**
 * Hook points for in-run modifiers (spec §7). A modifier implementation
 * registers functions at any of these points; the reducer folds the active
 * modifiers' hooks in acquisition order (`state.inRun`), so results are
 * deterministic and replayable.
 */

import type { ExtensionBonusKind, MorphemeInfo } from '../scoring';
import type { Balance, BossRules, CardSpec, CurrencySource, InRunModifierSpec, RunState } from '../types';

export interface HookContext {
  state: RunState;
  balance: Balance;
  spec: InRunModifierSpec;
}

/** What a hook reports for the ScoreScreen. */
export interface Note {
  text: string;
}

export interface ModifierImpl {
  /** Multiply one morpheme's tile-value sum. Return the new value and an optional note. */
  morphemeValue?: (ctx: HookContext, info: MorphemeInfo, value: number) => number;
  /** Adjust the morpheme-multiplier base (1.4 by default). */
  multiplierBase?: (ctx: HookContext, base: number) => number;
  /** Multiply the extension bonus for this round's shape. */
  extensionBonus?: (ctx: HookContext, kind: ExtensionBonusKind, bonus: number) => number;
  /** Adjust the strain an extension card causes; may also patch run state. */
  strain?: (ctx: HookContext, card: CardSpec, units: number) => { units: number; patch?: Partial<RunState> };
  /** Extra currency at the end of a passed regular round. */
  roundCurrency?: (ctx: HookContext) => CurrencySource | null;
  /** State changes after a natural (card-free) round is scored. */
  onNaturalRound?: (ctx: HookContext) => Partial<RunState>;
  /** Adjust boss rules at START_BOSS (after the boss modifier). */
  bossRules?: (ctx: HookContext, rules: BossRules) => BossRules;
  /** Adjust how many modifiers are offered / picked after a boss. */
  reward?: (ctx: HookContext, r: { offers: number; picks: number }) => { offers: number; picks: number };
}

export type HookName = keyof ModifierImpl;
