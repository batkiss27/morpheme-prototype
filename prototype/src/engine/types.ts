/**
 * Shared engine types (prototype-spec.md §4).
 *
 * Plain data only. Everything here must be JSON-serializable so runs can be
 * exported and replayed. No classes with behavior, no React, no DOM.
 */

import type { Balance } from '../content/balance';
import type { LetterSpec } from '../content/tiles';
import type { RngState } from './rng';

export type { Balance, LetterSpec, RngState };

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

/** '_' is the blank / wild tile. */
export type Letter =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z'
  | '_';

/** Tile modifier ids mirror the *Tiles* tab. Only the value modifiers score in M1. */
export type TileModifierId =
  | 'plus1' | 'gilded' | 'anchored' | 'weighted'
  | 'plus2' | 'vowel_wild' | 'trade' | 'harmonic' | 'sticky'
  | 'plus3' | 'compounding' | 'mutable' | 'silent' | 'fragile' | 'boss_ready'
  | 'wild' | 'stressed' | 'tonal' | 'heavy' | 'cursed' | 'volatile' | 'twin';

export interface Tile {
  id: string;
  letter: Letter;
  /** Set once a blank / Wild tile is placed. */
  playedAs?: Letter;
  baseValue: number;
  modifiers: TileModifierId[];
}

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

export type Side = 'front' | 'back';
export type MorphemeSide = Side | 'start' | 'insert';

export type CardId = string;

export interface Morpheme {
  id: string;
  /** Ordered left → right. */
  tileIds: string[];
  side: MorphemeSide;
  round: number;
  /** Set when an Extension card created it (strain). */
  viaCard?: CardId;
}

/** [start, end] are inclusive-exclusive indices into `Chain.tiles`. */
export type Span = [start: number, end: number];

export interface Chain {
  /** Full left → right string of the chain. */
  tiles: Tile[];
  /** In order of position, not creation. */
  morphemes: Morpheme[];
  /** The real word at the front. */
  headSpan: Span;
  /** The real word at the back (== headSpan when natural). */
  tailSpan: Span;
  /** True iff the whole chain is one dictionary word. */
  natural: boolean;
}

// ---------------------------------------------------------------------------
// Dictionary
// ---------------------------------------------------------------------------

export interface Dictionary {
  has(word: string): boolean;
  readonly size: number;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export type Phase =
  | 'ROUND_START'
  | 'EXTEND'
  | 'SCORED'
  | 'SHOP'
  | 'BOSS_INTRO'
  | 'BOSS_PLAY'
  | 'BOSS_END'
  | 'BOSS_REWARD'
  | 'GAME_OVER'
  | 'WIN';

export type Rarity = 'basic' | 'uncommon' | 'exotic' | 'relic';

// ---------------------------------------------------------------------------
// Cards (content/cards.ts mirrors the *Per Round Cards* tab)
// ---------------------------------------------------------------------------

export type CardType = 'sound_shift' | 'extension' | 'loanword' | 'utility';

/** Effect ids implemented in engine/cards/. A card that reuses one is data-only. */
export type EffectId =
  // extension (used through PLAY_STEP { viaCard })
  | 'before_and_after' | 'reduplication' | 'hyphen' | 'blend' | 'free_morpheme'
  // instant (used through USE_CARD)
  | 'echo'
  | 'vowel_shift' | 'glide' | 'elision' | 'metathesis'
  | 'loanword' | 'simplification' | 'redraw'
  | 'amendment' | 'lexicographer' | 'bank' | 'insurance';

export interface CardSpec {
  id: CardId;
  name: string;
  type: CardType;
  rarity: Rarity;
  /** 'round' = this round only · 'run' = lasting change to a tile / the pool. */
  duration: 'round' | 'run';
  price: number;
  effectId: EffectId;
  params: Record<string, number | string | boolean>;
  cueId: string;
  /** Effect text shown on the card. */
  text: string;
}

export interface CardInstance {
  instanceId: string;
  cardId: CardId;
}

/** What a card acts on. Which fields are needed depends on the effect. */
export interface CardTarget {
  /** A tile in the chain (Sound Shift) or in the pool (remove). */
  tileId?: string;
  /** A letter to add (Loanword). */
  letter?: Letter;
  /** Another held card (Echo). */
  instanceId?: string;
}

/** Card effects that are active for the current round. */
export interface RoundEffects {
  /** Bank: currency earned this round is doubled. */
  bank?: boolean;
  /** Insurance: a failed threshold costs no life (but no shop). */
  insurance?: boolean;
  /** Lexicographer: next round's threshold (and boss modifier, M4) revealed. */
  lexicographer?: boolean;
}

export type InRunModifierId = string;

/** Pre-run loadout chosen on the Lexicon screen (M7). Quick Start uses the default. */
export interface PreRunLoadout {
  /** Tile modifiers applied to one tile of the given letter (D3). */
  tileModifiers: { letter: Letter; modifier: TileModifierId }[];
  /** Pre-run category levels, 0 = not taken. */
  categories: Partial<Record<'second_breath' | 'treasury' | 'substrate' | 'tempo', number>>;
}

export interface ShopOffer {
  cardId: CardId;
  price: number;
  sold: boolean;
}

export interface TileActionOffer {
  kind: 'add_tile' | 'remove_tile';
  price: number;
  sold: boolean;
}

export interface ShopState {
  offers: ShopOffer[];
  tileAction: TileActionOffer;
  /** Rerolls bought in this shop. */
  rerolls: number;
  rerollPrice: number;
}

export interface BossState {
  /** Placeholder until M4. Boss number 1..6. */
  bossNumber: number;
  /** Stubbed: total word points placed this boss round. */
  wordPoints: number;
}

/** One step of extension within a round, as recorded in the run state. */
export interface StepRecord {
  side: MorphemeSide;
  tileIds: string[];
  /** Letter chosen for each blank in `tileIds`. */
  playedAs?: Record<string, Letter>;
  /** The word that was validated for this step (head or tail word). */
  word: string;
  /** Card id of the Extension card that made this step. */
  viaCard?: CardId;
}

/**
 * Everything a step can change, captured before the step so UNDO_STEP can
 * restore it exactly (cards used after the step are restored too).
 */
export interface StepSnapshot {
  chain: Chain | null;
  hand: Tile[];
  pool: Tile[];
  destroyed: Tile[];
  cards: CardInstance[];
  strainThisRound: number;
  chainDirty: boolean;
  roundEffects: RoundEffects;
}

/** Score breakdown for the round just played (spec §6 ScoreScreen). */
export interface RoundResult {
  round: number;
  kind: 'regular' | 'boss';
  wordPoints: number;
  morphemes: number;
  effectiveMorphemes: number;
  morphemeMult: number;
  extensionBonus: number;
  inRunMult: number;
  flatBonus: number;
  score: number;
  threshold: number;
  passed: boolean;
  /** What happened as a consequence of pass/fail. */
  outcome: 'pass' | 'life_lost' | 'insured' | 'game_over';
  currencyEarned: number;
}

export interface RunState {
  seed: number;
  rng: RngState;
  /** 1..balance.rounds.total */
  round: number;
  phase: Phase;
  lives: number;
  currency: number;
  /** Undrawn tiles. */
  pool: Tile[];
  hand: Tile[];
  /** Tiles removed from the run (Elision, Simplification, Fragile …). */
  destroyed: Tile[];
  /** null before the first word is played in round 1. */
  chain: Chain | null;
  cards: CardInstance[];
  /** Counter for card instance ids. */
  cardSeq: number;
  inRun: InRunModifierId[];
  preRun: PreRunLoadout;
  /** Consecutive natural extension rounds. */
  streak: number;
  shop: ShopState | null;
  boss: BossState | null;
  log: RunEvent[];
  flags: { bossJumpPending?: boolean; amendmentUsed?: boolean };

  // --- round-local state (reset at ROUND_START) ---
  /** Steps taken this round, in order. */
  steps: StepRecord[];
  /** One snapshot per step in `steps`, taken before that step (for UNDO_STEP / FORFEIT). */
  undo: StepSnapshot[];
  /** Result of the most recently scored round. */
  lastResult: RoundResult | null;
  /** Strain units from extension cards used this round. */
  strainThisRound: number;
  /**
   * Set by a Sound Shift: the active words may no longer be in the dictionary.
   * SUBMIT requires head and tail words to be valid while this is set.
   */
  chainDirty: boolean;
  roundEffects: RoundEffects;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'START_ROUND' }
  | {
      type: 'PLAY_STEP';
      side: MorphemeSide;
      tileIds: string[];
      playedAs?: Record<string, Letter>;
      /** Instance id of a held Extension card that makes this step. */
      viaCard?: string;
    }
  | { type: 'UNDO_STEP' }
  | { type: 'SUBMIT' }
  /** Give up the round (no valid extension): scores 0, fails the threshold. */
  | { type: 'FORFEIT' }
  /** Use an instant card (Sound Shift, Loanword, Utility, Echo). */
  | { type: 'USE_CARD'; instanceId: string; target?: CardTarget }
  | { type: 'CONTINUE' }
  // Shop
  | { type: 'BUY_CARD'; slot: number }
  | { type: 'BUY_TILE_ACTION'; target: CardTarget }
  | { type: 'REROLL' }
  | { type: 'SELL'; instanceId: string }
  | { type: 'LEAVE' }
  // Boss stubs (M4 replaces these). END_BOSS takes the placed-word points as
  // input so the scenario can be driven; omitted = auto-pass at threshold.
  | { type: 'START_BOSS' }
  | { type: 'BOSS_TICK'; ms: number }
  | { type: 'END_BOSS'; wordPoints?: number }
  | { type: 'PICK_MODIFIER'; id?: InRunModifierId };

export type ActionType = Action['type'];

/** Append-only log entry, one per accepted or rejected action. */
export interface RunEvent {
  seq: number;
  round: number;
  phase: Phase;
  action: Action;
  /** Set when the reducer rejected the action; state is unchanged. */
  error?: string;
}

/** Content the engine needs; injected so the engine never imports data directly. */
export interface EngineContent {
  balance: Balance;
  dictionary: Dictionary;
  letters: LetterSpec[];
  cards: CardSpec[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; word?: string };
