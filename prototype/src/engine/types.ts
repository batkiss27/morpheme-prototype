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

// ---------------------------------------------------------------------------
// In-run modifiers (content/inRunModifiers.ts mirrors the *In-Run Modifiers* tab)
// ---------------------------------------------------------------------------

export type ModifierCategory = 'scoring' | 'extension' | 'economy' | 'boss' | 'pool' | 'modifiers';

/** Hook implementation ids in engine/modifiers/registry.ts. */
export type HookId =
  | 'suffix_bias' | 'prefix_bias' | 'inflection' | 'coinage' | 'rack_extension' | 'vowel_harmony'
  | 'momentum' | 'etymologist' | 'agglutination' | 'mirror' | 'chain_lightning' | 'polyglot';

export interface InRunModifierSpec {
  id: InRunModifierId;
  name: string;
  rarity: Rarity;
  category: ModifierCategory;
  effect: string;
  hookId: HookId;
  params: Record<string, number | string | boolean>;
}

/** A currency source listed on the ScoreScreen (Economy tab). */
export interface CurrencySource {
  source: string;
  amount: number;
}

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

/** The conditional in-run modifier slot (Shops tab; D8: Basic / Uncommon only). */
export interface InRunOffer {
  modifierId: InRunModifierId;
  price: number;
  sold: boolean;
  /** The criterion that opened the slot. */
  criterion: string;
}

export interface ShopState {
  offers: ShopOffer[];
  tileAction: TileActionOffer;
  inRunOffer: InRunOffer | null;
  /** Rerolls bought in this shop. */
  rerolls: number;
  rerollPrice: number;
}

// ---------------------------------------------------------------------------
// Boss round (engine/boss/, content/bossModifiers.ts)
// ---------------------------------------------------------------------------

export type Dir = 'H' | 'V';

/** N×N crossword board. `cells` is row-major, `starter` lists the starter word's cell indices. */
export interface Board {
  size: number;
  cells: (Tile | null)[];
  starter: number[];
}

export interface PlacedTile {
  row: number;
  col: number;
  tile: Tile;
}

export interface FormedWord {
  word: string;
  /** Cell indices left→right / top→bottom. */
  cells: number[];
  points: number;
}

/** Everything a boss modifier can change, resolved once at START_BOSS. */
export interface BossRules {
  timerMs: number;
  feedIntervalMs: number;
  startingRack: number;
  rackCap: number;
  /** Minimum length of the main word placed. */
  minWordLength: number;
  vowelsScoreZero: boolean;
  /** Vowel feed tiles play as Y (Vowel Wild tiles unaffected). */
  vowelsToY: boolean;
  hideQueue: boolean;
  /** Rack overflow ends the round instead of discarding a tile. */
  overflowEnds: boolean;
  /** Which tile is lost on overflow. */
  overflowDiscards: 'oldest' | 'newest';
  /** Starter word uses only its last morpheme regardless of boss number. */
  starterShrink: boolean;
}

/** Boss modifier ids implemented in engine/boss/modifiers.ts. */
export type BossHookId =
  | 'y_not' | 'long_words' | 'rapid_feed' | 'tight_rack' | 'fog' | 'half_time' | 'vowel_tax' | 'overload';

export interface BossModifierSpec {
  id: string;
  name: string;
  effect: string;
  severity: 1 | 2 | 3;
  hookId: BossHookId;
  params: Record<string, number | string | boolean>;
}

export interface BossWordLog {
  word: string;
  crossWords: string[];
  points: number;
  /** Elapsed ms when placed. */
  atMs: number;
}

export interface BossState {
  /** 1..6 */
  bossNumber: number;
  modifierId: string | null;
  /** null until START_BOSS resolves the modifier. */
  rules: BossRules | null;
  board: Board;
  rack: Tile[];
  /** Upcoming tiles, front = next to arrive. Refilled (reshuffled) when empty (D4). */
  queue: Tile[];
  /** How many times the feed has cycled; makes copied tile ids unique. */
  cycle: number;
  timeLeftMs: number;
  /** ms until the next tile arrives. */
  feedTimerMs: number;
  /** Sum of points of every word placed (the scenario's "boss word points"). */
  wordPoints: number;
  words: BossWordLog[];
  ended: boolean;
  endReason: 'timer' | 'overflow' | 'ended' | null;
  /** Amendment rerolls used. */
  rerolls: number;
  /** Boss reward offer, set on a pass (BOSS_REWARD). */
  reward: { offers: InRunModifierId[]; picksLeft: number } | null;
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
  currencySources: CurrencySource[];
  /** How in-run modifiers changed the score, for the ScoreScreen. */
  notes: string[];
  /** Shop-slot criteria met this round (Shops tab). */
  criteriaMet: string[];
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
  /** Per-run numbers owned by modifiers (Momentum bonus, Etymologist cycle …). */
  modifierState: Record<string, number>;
  /** Achievement ids earned this run (secret words in M5; the rest in M7). */
  achievements: string[];
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
  | { type: 'BUY_IN_RUN' }
  | { type: 'SELL'; instanceId: string }
  | { type: 'LEAVE' }
  // Boss round
  | { type: 'START_BOSS' }
  /** Time advances only through this action (UI drives it with rAF). */
  | { type: 'BOSS_TICK'; ms: number }
  /** Type `letters` from the rack starting at a cell, skipping occupied cells. */
  | { type: 'PLACE_WORD'; row: number; col: number; dir: Dir; letters: string }
  /** End the boss early. `wordPoints` overrides the placed total (debug / tests only). */
  | { type: 'END_BOSS'; wordPoints?: number }
  /** Pick one of the offered in-run modifiers (Polyglot: twice). */
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
  bossModifiers: BossModifierSpec[];
  inRunModifiers: InRunModifierSpec[];
  secretWords: string[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; word?: string };
