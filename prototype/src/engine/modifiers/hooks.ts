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
  /** Adjust one morpheme's points (starts at its tile-value sum). Multiply or add. */
  morphemeValue?: (ctx: HookContext, info: MorphemeInfo, points: number) => number;
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
  /** Flat points added after multiplication (regular rounds). */
  flatBonus?: (ctx: HookContext) => number;
  /** Multiply the whole round score (regular rounds). */
  scoreMultiplier?: (ctx: HookContext) => number;
  /** Extra hand tiles. */
  handSize?: (ctx: HookContext, size: number) => number;
  /** State changes when the modifier is acquired (reward pick or shop slot). */
  onAcquire?: (ctx: HookContext) => Partial<RunState>;
  /** Shop price multiplier. */
  priceMult?: (ctx: HookContext, mult: number) => number;
  /** Free rerolls per shop. */
  freeRerolls?: (ctx: HookContext, n: number) => number;
  /** Force the conditional in-run shop slot open. */
  shopSlot?: (ctx: HookContext, open: boolean) => boolean;
  /** Extra currency after a passed boss round. */
  bossCurrency?: (ctx: HookContext) => CurrencySource | null;
  /** Keep the natural streak despite extension-card use this round; may patch state. */
  keepStreak?: (ctx: HookContext) => { keep: boolean; patch?: Partial<RunState> };
  /** Ignore a failed threshold entirely (no life lost, shop still offered); may patch state. */
  ignoreFail?: (ctx: HookContext) => { ignore: boolean; patch?: Partial<RunState> };
}

export type HookName = keyof ModifierImpl;
