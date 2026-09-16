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

export interface CardInstance {
  instanceId: string;
  cardId: CardId;
}

export type InRunModifierId = string;

/** Pre-run loadout chosen on the Lexicon screen (M7). Quick Start uses the default. */
export interface PreRunLoadout {
  /** Tile modifiers applied to one tile of the given letter (D3). */
  tileModifiers: { letter: Letter; modifier: TileModifierId }[];
  /** Pre-run category levels, 0 = not taken. */
  categories: Partial<Record<'second_breath' | 'treasury' | 'substrate' | 'tempo', number>>;
}

export interface ShopState {
  /** Placeholder until M3. */
  rerolls: number;
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
  viaCard?: CardId;
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
  outcome: 'pass' | 'life_lost' | 'game_over';
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
  /** null before the first word is played in round 1. */
  chain: Chain | null;
  cards: CardInstance[];
  inRun: InRunModifierId[];
  preRun: PreRunLoadout;
  /** Consecutive natural extension rounds. */
  streak: number;
  shop: ShopState | null;
  boss: BossState | null;
  log: RunEvent[];
  flags: { bossJumpPending?: boolean };

  // --- round-local state (reset at ROUND_START) ---
  /** Steps taken this round, in order. */
  steps: StepRecord[];
  /** Chain and hand as they were when the round started (for UNDO_STEP). */
  roundStart: { chain: Chain | null; hand: Tile[] } | null;
  /** Result of the most recently scored round. */
  lastResult: RoundResult | null;
  /** Extension cards used this round (strain count). */
  strainThisRound: number;
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
      viaCard?: CardId;
    }
  | { type: 'UNDO_STEP' }
  | { type: 'SUBMIT' }
  /** Give up the round (no valid extension): scores 0, fails the threshold. */
  | { type: 'FORFEIT' }
  | { type: 'CONTINUE' }
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
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; word?: string };
