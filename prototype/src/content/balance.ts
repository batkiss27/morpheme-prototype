/**
 * Every tunable number, mirroring Morpheme_Master.xlsx (spec §7).
 *
 * The engine never imports `defaultBalance` directly — it receives a Balance
 * as an argument so the DebugPanel can edit a copy at runtime (P6-01).
 *
 * Sources per section:
 *   scoring  → Scoring tab (yellow parameter cells) + DESIGN.md §2.5 (3+ bonus)
 *   hand     → Scoring tab row 13
 *   preRun   → Pre-Run Modifiers tab (risk modifiers)
 *   reward   → In-Run Modifiers tab (offer rules)
 *   boss     → Boss Round Modifiers tab baseline note + DESIGN.md §2.6
 *   shop     → Shops tab
 *   economy  → Economy tab
 */

export type RarityKey = 'basic' | 'uncommon' | 'exotic' | 'relic';

export interface Balance {
  rounds: {
    /** 24 = 18 regular + 6 boss. */
    total: number;
    /** Every Nth round is a boss round. */
    bossEvery: number;
  };
  hand: {
    size: number;
  };
  lives: {
    /** Lives with no loadout. Second Breath adds to this. */
    base: number;
  };
  scoring: {
    /** morpheme multiplier = base ^ (effective morphemes − 1) */
    multiplierBase: number;
    round1Threshold: number;
    /** threshold = T1 × growth ^ (round − 1) */
    thresholdGrowth: number;
    bossThresholdFactor: number;
    /** Effective morphemes subtracted per extension card used this round. */
    strain: number;
    bonusTwoSameSide: number;
    bonusFrontBack: number;
    /** DESIGN.md §2.5 — not yet in the workbook's Scoring tab. */
    bonusThreePlus: number;
  };
  boss: {
    timerMs: number;
    /** Feed interval per boss, B1..B6. */
    feedIntervalMs: number[];
    startingRack: number;
    rackCap: number;
    gridSize: number;
    /** Starter-word morphemes per boss (0 = full word). D7. */
    starterMorphemes: number[];
    /** Shortest main word allowed on the board. */
    minWordLength: number;
    /** How many upcoming tiles the UI shows. */
    queuePreview: number;
    /** Elapsed-ms granularity the UI ticks at (keeps the log small). */
    tickMs: number;
  };
  shop: {
    cardSlots: number;
    prices: Record<RarityKey, number>;
    rarityOdds: Record<RarityKey, number>;
    inRunSlotPrice: number;
    rerollBase: number;
    rerollIncrement: number;
    addTile: number;
    removeTile: number;
    tileModifier: number;
    bossModifierReroll: number;
    /** Sell held cards at this fraction of price. */
    sellFraction: number;
    /** Held-card limit per type (Per Round Cards tab proposal). */
    handLimits: Record<'sound_shift' | 'extension' | 'loanword' | 'utility', number>;
    /** Slot 1 is forced to an Extension card when the player holds none (Shops tab proposal). */
    guaranteeExtension: boolean;
    /** Rarities the conditional in-run slot may offer (D8). */
    inRunSlotRarities: RarityKey[];
  };
  reward: {
    /** In-run modifiers offered after a boss (Polyglot adds one). */
    offers: number;
    /** Rarity odds per boss number, B1..B6 (In-Run Modifiers tab proposal). */
    rarityOddsByBoss: Record<RarityKey, number>[];
  };
  preRun: {
    /**
     * Steep Curve risk modifier (Pre-Run Modifiers tab): all thresholds are
     * scaled and the loadout gains points. Index = level − 1. Wired in M7.
     */
    steepCurve: { thresholdScale: number[]; loadoutPoints: number[] };
  };
  economy: {
    roundClear: number;
    /** +1 per this fraction of threshold beaten by. */
    marginBonusStep: number;
    marginBonusCap: number;
    naturalStreakPer: number;
    naturalStreakCap: number;
    /** Dividend by morpheme count (whole word is a real word). */
    naturalDividend: Record<number, number>;
    /** +this per morpheme beyond the last table entry. */
    naturalDividendBeyond: number;
    /** Boss clear bonus per boss, B1..B6. */
    bossClear: number[];
    extensionBonusPayout: number;
  };
}

export const defaultBalance: Balance = {
  rounds: { total: 24, bossEvery: 4 },
  hand: { size: 10 },
  lives: { base: 0 },
  scoring: {
    multiplierBase: 1.4,
    round1Threshold: 4,
    thresholdGrowth: 1.5,
    bossThresholdFactor: 1.5,
    strain: 1,
    bonusTwoSameSide: 1.5,
    bonusFrontBack: 2,
    bonusThreePlus: 3,
  },
  boss: {
    timerMs: 90_000,
    feedIntervalMs: [4000, 3700, 3400, 3100, 2800, 2500],
    startingRack: 3,
    rackCap: 7,
    gridSize: 15,
    starterMorphemes: [0, 3, 2, 1, 1, 1],
    minWordLength: 2,
    queuePreview: 5,
    tickMs: 100,
  },
  shop: {
    cardSlots: 3,
    prices: { basic: 3, uncommon: 5, exotic: 8, relic: 12 },
    rarityOdds: { basic: 0.55, uncommon: 0.3, exotic: 0.12, relic: 0.03 },
    inRunSlotPrice: 10,
    rerollBase: 2,
    rerollIncrement: 1,
    addTile: 3,
    removeTile: 3,
    tileModifier: 6,
    bossModifierReroll: 8,
    sellFraction: 0.5,
    handLimits: { sound_shift: 3, extension: 3, loanword: 3, utility: 2 },
    guaranteeExtension: true,
    inRunSlotRarities: ['basic', 'uncommon'],
  },
  reward: {
    offers: 3,
    rarityOddsByBoss: [
      { basic: 0.6, uncommon: 0.3, exotic: 0.1, relic: 0 },
      { basic: 0.5, uncommon: 0.35, exotic: 0.13, relic: 0.02 },
      { basic: 0.4, uncommon: 0.38, exotic: 0.17, relic: 0.05 },
      { basic: 0.3, uncommon: 0.4, exotic: 0.22, relic: 0.08 },
      { basic: 0.2, uncommon: 0.4, exotic: 0.28, relic: 0.12 },
      { basic: 0.1, uncommon: 0.4, exotic: 0.32, relic: 0.18 },
    ],
  },
  preRun: {
    steepCurve: { thresholdScale: [1.15, 1.3, 1.5, 1.75], loadoutPoints: [1, 2, 3, 4] },
  },
  economy: {
    roundClear: 3,
    marginBonusStep: 0.25,
    marginBonusCap: 4,
    naturalStreakPer: 1,
    naturalStreakCap: 5,
    naturalDividend: { 4: 2, 5: 3, 6: 5, 7: 8, 8: 12 },
    naturalDividendBeyond: 5,
    bossClear: [5, 7, 9, 11, 13, 15],
    extensionBonusPayout: 1,
  },
};
