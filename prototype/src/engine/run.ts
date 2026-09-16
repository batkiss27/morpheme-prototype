/**
 * Run state machine (spec §5). `reduce` is pure: same (state, action, content)
 * → equal state. Time enters as `BOSS_TICK`; randomness lives in `state.rng`.
 *
 *   ROUND_START ─START_ROUND─► EXTEND ─SUBMIT─► SCORED ─CONTINUE─► SHOP ─LEAVE─► ROUND_START
 *        │                        │ FORFEIT ─────► SCORED (score 0, always a fail)
 *        │                        │ PLAY_STEP / UNDO_STEP / USE_CARD
 *        │                                        │ fail w/ life or Insurance → ROUND_START (no shop)
 *        │ boss round                             │ fail w/o life → GAME_OVER
 *        ▼
 *   BOSS_INTRO ─START_BOSS─► BOSS_PLAY ─END_BOSS─► BOSS_END ─CONTINUE─► BOSS_REWARD ─PICK_MODIFIER─► ROUND_START / WIN
 *        │ USE_CARD (Amendment)                       │ fail w/ life → ROUND_START (retry same boss, D1)
 *                                                     │ fail w/o life → GAME_OVER
 *   SHOP: BUY_CARD · BUY_TILE_ACTION · REROLL · SELL · USE_CARD (Loanword) · LEAVE
 *
 * BOSS_PLAY: BOSS_TICK advances the timers and feed; PLACE_WORD types letters
 * from the rack onto the board; END_BOSS ends early (its `wordPoints` override
 * exists for tests and the DebugPanel only).
 */

import * as boss from './boss';
import * as cards from './cards';
import * as chainMod from './chain';
import * as economy from './economy';
import * as mods from './modifiers';
import * as reward from './reward';
import * as rng from './rng';
import * as scoring from './scoring';
import * as shopMod from './shop';
import * as tiles from './tiles';
import type {
  Action,
  BossState,
  CardInstance,
  CardTarget,
  Chain,
  CurrencySource,
  EngineContent,
  PreRunLoadout,
  RoundResult,
  RunEvent,
  RunState,
  StepRecord,
  StepSnapshot,
  Tile,
} from './types';

export const defaultLoadout: PreRunLoadout = { tileModifiers: [], categories: {} };

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export function createRun(seed: number, loadout: PreRunLoadout, content: EngineContent): RunState {
  const { balance } = content;
  return {
    seed,
    rng: rng.create(seed),
    round: 1,
    phase: 'ROUND_START',
    lives: balance.lives.base + (loadout.categories.second_breath ?? 0),
    currency: 0,
    pool: tiles.createPool({ letters: content.letters }, loadout),
    hand: [],
    destroyed: [],
    chain: null,
    cards: [],
    cardSeq: 0,
    inRun: [],
    modifierState: {},
    achievements: [],
    preRun: loadout,
    streak: 0,
    shop: null,
    boss: null,
    log: [],
    flags: {},
    steps: [],
    undo: [],
    lastResult: null,
    strainThisRound: 0,
    chainDirty: false,
    roundEffects: {},
  };
}

// ---------------------------------------------------------------------------
// Hooks that later milestones fill in
// ---------------------------------------------------------------------------

/**
 * Flat in-run score multiplier. No modifier in the prototype subset uses it
 * (Sesquipedalian would); per-morpheme values and the multiplier base carry
 * the modifiers instead — see `scoringInputs`.
 */
export function inRunMultiplier(_state: RunState): number {
  return 1;
}

/** Everything the scoring functions need from in-run modifiers (also used by screens for previews). */
export function scoringInputs(state: RunState, content: EngineContent) {
  const chain = state.chain;
  const shape = chain ? chainMod.morphemesAddedIn(chain, state.round) : { front: 0, back: 0, total: 0 };
  const kind = scoring.extensionBonusKind(shape);
  const points = chain ? scoring.wordPointsBy(chain, state.round, mods.morphemeMultiplier(state, content)) : { total: 0, perMorpheme: [] };
  const base = mods.multiplierBase(state, content);
  const extensionBonusMult = mods.extensionBonus(state, content, kind, 1);
  const notes: string[] = [];
  for (const p of points.perMorpheme) if (p.mult !== 1) notes.push(`"${p.text}" scores ×${p.mult} (${p.points} pts)`);
  if (base !== content.balance.scoring.multiplierBase) notes.push(`multiplier base ${base.toFixed(2)}`);
  if (extensionBonusMult !== 1) notes.push(`extension bonus ×${extensionBonusMult}`);
  return { shape, wordPoints: points.total, perMorpheme: points.perMorpheme, base, extensionBonusMult, inRunMult: inRunMultiplier(state), notes };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type Step = { ok: true; state: RunState } | { ok: false; error: string };

const ok = (state: RunState): Step => ({ ok: true, state });
const fail = (error: string): Step => ({ ok: false, error });

export function reduce(state: RunState, action: Action, content: EngineContent): RunState {
  const result = apply(state, action, content);
  const event: RunEvent = { seq: state.log.length, round: state.round, phase: state.phase, action };
  if (result.ok) {
    return { ...result.state, log: [...state.log, event] };
  }
  return { ...state, log: [...state.log, { ...event, error: result.error }] };
}

/** The most recent rejected action's error, if the last action was rejected. */
export function lastError(state: RunState): string | undefined {
  const last = state.log[state.log.length - 1];
  return last?.error;
}

function apply(state: RunState, action: Action, content: EngineContent): Step {
  const { balance } = content;
  const wrong = (): Step => fail(`${action.type} is not allowed in phase ${state.phase}`);

  switch (action.type) {
    case 'START_ROUND': {
      if (state.phase !== 'ROUND_START') return wrong();
      let round = state.round;
      let flags = state.flags;
      if (flags.bossJumpPending) {
        // Secret word: jump to the next Boss Round, skipping regular rounds (DESIGN.md §2.6).
        round = Math.min(balance.rounds.total, Math.ceil(round / balance.rounds.bossEvery) * balance.rounds.bossEvery);
        flags = { ...flags, bossJumpPending: false };
      }
      const base: RunState = { ...state, round, flags, steps: [], undo: [], strainThisRound: 0, roundEffects: {}, shop: null };
      if (scoring.isBossRound(round, balance)) {
        const [mod, r1] = boss.rollModifier(content.bossModifiers, state.rng);
        const bossState: BossState = {
          bossNumber: scoring.bossNumber(round, balance),
          modifierId: mod?.id ?? null,
          rules: null,
          board: boss.createBoard(balance.boss.gridSize),
          rack: [],
          queue: [],
          cycle: 0,
          timeLeftMs: 0,
          feedTimerMs: 0,
          wordPoints: 0,
          words: [],
          ended: false,
          endReason: null,
          rerolls: 0,
          reward: null,
        };
        return ok({ ...base, phase: 'BOSS_INTRO', boss: bossState, rng: r1 });
      }
      const d = tiles.draw(state.pool, balance.hand.size, state.rng);
      return ok({ ...base, phase: 'EXTEND', pool: d.pool, hand: d.drawn, rng: d.rng });
    }

    case 'PLAY_STEP': {
      if (state.phase !== 'EXTEND') return wrong();
      const before = snapshot(state);
      const r = action.viaCard === undefined ? playNaturalStep(state, action, content) : playCardStep(state, action, action.viaCard, content);
      if (!r.ok) return r;
      return ok({ ...r.state, undo: [...state.undo, before] });
    }

    case 'UNDO_STEP': {
      if (state.phase !== 'EXTEND') return wrong();
      const before = state.undo[state.undo.length - 1];
      if (!before) return fail('nothing to undo');
      return ok({ ...state, ...before, steps: state.steps.slice(0, -1), undo: state.undo.slice(0, -1) });
    }

    case 'SUBMIT': {
      if (state.phase !== 'EXTEND') return wrong();
      if (state.steps.length === 0 || !state.chain) return fail('extend by at least one morpheme before submitting');
      const chain = state.chain;
      if (state.chainDirty) {
        const v = chainMod.activeWordsValid(chain, content.dictionary);
        if (!v.ok) return fail(`after a Sound Shift the word must be valid again: "${v.word}" is not in the dictionary`);
      }
      const inputs = scoringInputs(state, content);
      const breakdown = scoring.scoreRegular(
        {
          round: state.round,
          wordPoints: inputs.wordPoints,
          morphemes: chainMod.morphemeCount(chain),
          strainCount: state.strainThisRound,
          extension: inputs.shape,
          inRunMult: inputs.inRunMult,
          multiplierBase: inputs.base,
          extensionBonusMult: inputs.extensionBonusMult,
        },
        balance,
      );
      // "Natural" = no extension card this round (Economy tab), whatever strain it caused.
      const natural = !state.steps.some((st) => st.viaCard !== undefined);
      const streakAfter = natural ? state.streak + 1 : 0;
      const sources = breakdown.passed ? economy.regularRoundCurrency(state, content, { breakdown, shape: inputs.shape, natural, streakAfter }) : [];
      const criteriaMet = breakdown.passed ? economy.shopCriteria(state, breakdown, inputs.shape) : [];
      let after = settle(state, breakdown, streakAfter, sources, inputs.notes, criteriaMet);
      if (breakdown.passed && natural) after = mods.onNaturalRound(after, content);
      // Secret words (P5-07): the next ROUND_START jumps to the boss.
      const text = chainMod.text(chain);
      let flags = after.flags;
      let achievements = after.achievements;
      if (content.secretWords.includes(text) && !achievements.includes(`secret:${text}`)) {
        flags = { ...flags, bossJumpPending: true };
        achievements = [...achievements, `secret:${text}`];
      }
      return ok({
        ...after,
        phase: 'SCORED',
        flags,
        achievements,
        pool: tiles.returnTiles(state.pool, state.hand),
        hand: [],
        undo: [],
        chainDirty: false,
      });
    }

    case 'FORFEIT': {
      if (state.phase !== 'EXTEND') return wrong();
      // Give up the round: everything since the first step is undone, the
      // hand returns to the pool, and the round scores 0 (always a fail).
      const first = state.undo[0];
      const reverted: RunState = first ? { ...state, ...first } : state;
      const breakdown = scoring.scoreRegular(
        {
          round: state.round,
          wordPoints: 0,
          morphemes: reverted.chain ? chainMod.morphemeCount(reverted.chain) : 0,
          strainCount: 0,
          extension: { front: 0, back: 0 },
          inRunMult: inRunMultiplier(state),
        },
        balance,
      );
      const after = settle(reverted, breakdown, 0, [], [], []);
      return ok({
        ...after,
        phase: 'SCORED',
        pool: tiles.returnTiles(reverted.pool, reverted.hand),
        hand: [],
        steps: [],
        undo: [],
      });
    }

    case 'USE_CARD':
      return useCard(state, action.instanceId, action.target ?? {}, content);

    case 'CONTINUE': {
      if (state.phase !== 'SCORED' && state.phase !== 'BOSS_END') return wrong();
      const result = state.lastResult;
      if (!result) return fail('no round result to continue from');
      if (result.outcome === 'game_over') return ok({ ...state, phase: 'GAME_OVER' });
      if (result.outcome === 'life_lost' || result.outcome === 'insured') {
        // Regular: move on without a shop. Boss: retry the same boss (D1).
        return ok(state.phase === 'SCORED' ? advanceRound(state, balance) : { ...state, phase: 'ROUND_START', boss: null });
      }
      if (state.phase === 'BOSS_END') return ok({ ...state, phase: 'BOSS_REWARD' });
      const built = shopMod.buildShop({ rng: state.rng, cards: content.cards, balance, heldTypes: heldTypes(state, content) });
      let shop = built.shop;
      let r = built.rng;
      const criterion = result.criteriaMet[0];
      if (criterion) {
        const slot = reward.buildShopSlotOffer({ ...state, rng: r }, content);
        r = slot.rng;
        if (slot.modifierId) shop = { ...shop, inRunOffer: { modifierId: slot.modifierId, price: balance.shop.inRunSlotPrice, sold: false, criterion } };
      }
      return ok({ ...state, phase: 'SHOP', shop, rng: r });
    }

    // --- Shop -----------------------------------------------------------------

    case 'BUY_CARD': {
      if (state.phase !== 'SHOP' || !state.shop) return wrong();
      const offer = state.shop.offers[action.slot];
      if (!offer) return fail(`no offer in slot ${action.slot}`);
      if (offer.sold) return fail('that slot is sold out');
      const spec = cards.cardSpec(content, offer.cardId);
      if (!spec) return fail(`unknown card ${offer.cardId}`);
      if (state.currency < offer.price) return fail(`not enough currency (${offer.price} needed)`);
      const limit = balance.shop.handLimits[spec.type];
      if (cards.countByType(state.cards, content)[spec.type] >= limit) return fail(`you can hold at most ${limit} ${spec.type} cards`);
      const instance: CardInstance = { instanceId: `c${state.cardSeq}`, cardId: spec.id };
      const offers = state.shop.offers.map((o, i) => (i === action.slot ? { ...o, sold: true } : o));
      return ok({
        ...state,
        currency: state.currency - offer.price,
        cards: [...state.cards, instance],
        cardSeq: state.cardSeq + 1,
        shop: { ...state.shop, offers },
      });
    }

    case 'BUY_TILE_ACTION': {
      if (state.phase !== 'SHOP' || !state.shop) return wrong();
      const offer = state.shop.tileAction;
      if (offer.sold) return fail('the tile action is sold out');
      if (state.currency < offer.price) return fail(`not enough currency (${offer.price} needed)`);
      let pool: Tile[];
      let destroyed = state.destroyed;
      if (offer.kind === 'add_tile') {
        const letter = action.target.letter;
        const spec = letter && content.letters.find((l) => l.letter === letter);
        if (!spec) return fail('choose a letter to add');
        const serial = state.pool.length + state.hand.length + (state.chain?.tiles.length ?? 0) + state.destroyed.length + 1;
        pool = [...state.pool, { id: `${letter}+${serial}`, letter: spec.letter, baseValue: spec.value, modifiers: [] }];
      } else {
        const tile = state.pool.find((t) => t.id === action.target.tileId);
        if (!tile) return fail('choose a tile in the pool to remove');
        pool = state.pool.filter((t) => t.id !== tile.id);
        destroyed = [...state.destroyed, tile];
      }
      return ok({ ...state, pool, destroyed, currency: state.currency - offer.price, shop: { ...state.shop, tileAction: { ...offer, sold: true } } });
    }

    case 'REROLL': {
      if (state.phase !== 'SHOP' || !state.shop) return wrong();
      const price = state.shop.rerollPrice;
      if (state.currency < price) return fail(`not enough currency (${price} needed)`);
      const built = shopMod.rerollShop({ rng: state.rng, cards: content.cards, balance, heldTypes: heldTypes(state, content), previous: state.shop });
      return ok({ ...state, currency: state.currency - price, shop: built.shop, rng: built.rng });
    }

    case 'BUY_IN_RUN': {
      if (state.phase !== 'SHOP' || !state.shop) return wrong();
      const offer = state.shop.inRunOffer;
      if (!offer) return fail('no in-run modifier is on offer');
      if (offer.sold) return fail('that modifier is sold');
      if (state.currency < offer.price) return fail(`not enough currency (${offer.price} needed)`);
      return ok({
        ...state,
        currency: state.currency - offer.price,
        inRun: [...state.inRun, offer.modifierId],
        shop: { ...state.shop, inRunOffer: { ...offer, sold: true } },
      });
    }

    case 'SELL': {
      if (state.phase !== 'SHOP') return wrong();
      const held = state.cards.find((c) => c.instanceId === action.instanceId);
      if (!held) return fail('that card is not in your hand');
      const spec = cards.cardSpec(content, held.cardId);
      if (!spec) return fail(`unknown card ${held.cardId}`);
      return ok({ ...state, currency: state.currency + shopMod.sellPrice(spec, balance), cards: state.cards.filter((c) => c !== held) });
    }

    case 'LEAVE': {
      if (state.phase !== 'SHOP') return wrong();
      return ok(advanceRound({ ...state, shop: null }, balance));
    }

    // --- Boss round ---------------------------------------------------------

    case 'START_BOSS': {
      if (state.phase !== 'BOSS_INTRO' || !state.boss) return wrong();
      const b = state.boss;
      const mod = content.bossModifiers.find((m) => m.id === b.modifierId);
      const rules = mods.bossRules(state, content, boss.applyModifier(boss.baseRules(b.bossNumber, balance), mod));
      const chainTiles = state.chain?.tiles ?? [];
      const board = state.chain ? boss.placeStarter(b.board, boss.starterTiles(state.chain, b.bossNumber, balance, rules)) : b.board;
      let [queue, r1] = boss.buildQueue(chainTiles, state.rng, 1);
      if (rules.vowelsToY) queue = boss.applyVowelsToY(queue);
      const rack = queue.slice(0, rules.startingRack);
      return ok({
        ...state,
        phase: 'BOSS_PLAY',
        rng: r1,
        boss: { ...b, rules, board, rack, queue: queue.slice(rules.startingRack), cycle: 1, timeLeftMs: rules.timerMs, feedTimerMs: rules.feedIntervalMs },
      });
    }

    case 'BOSS_TICK': {
      if (state.phase !== 'BOSS_PLAY' || !state.boss?.rules) return wrong();
      if (!(action.ms > 0)) return fail('BOSS_TICK needs a positive ms');
      const t = boss.tick(state.boss, action.ms, state.chain?.tiles ?? [], state.rng);
      const next = { ...state, boss: t.boss, rng: t.rng };
      return ok(t.ended ? finishBoss(next, t.boss.wordPoints, t.ended, content) : next);
    }

    case 'PLACE_WORD': {
      if (state.phase !== 'BOSS_PLAY' || !state.boss?.rules) return wrong();
      const b = state.boss;
      const rules = b.rules;
      if (!rules) return wrong();
      const resolved = boss.resolveRack(b.rack, action.letters);
      if (!resolved.ok) return fail(resolved.error);
      const placements = boss.placementsFor(b.board, action.row, action.col, action.dir, resolved.value.used);
      if (!placements.ok) return fail(placements.error);
      const v = boss.validatePlacement(b.board, placements.value, content.dictionary, rules);
      if (!v.ok) return fail(v.error);
      const entry = { word: v.value.main.word, crossWords: v.value.cross.map((w) => w.word), points: v.value.points, atMs: rules.timerMs - b.timeLeftMs };
      return ok({
        ...state,
        boss: {
          ...b,
          board: boss.applyPlacement(b.board, placements.value),
          rack: resolved.value.rack,
          wordPoints: b.wordPoints + v.value.points,
          words: [...b.words, entry],
        },
      });
    }

    case 'END_BOSS': {
      if (state.phase !== 'BOSS_PLAY' || !state.boss) return wrong();
      return ok(finishBoss(state, action.wordPoints ?? state.boss.wordPoints, 'ended', content));
    }

    case 'PICK_MODIFIER': {
      if (state.phase !== 'BOSS_REWARD' || !state.boss) return wrong();
      const offer = state.boss.reward;
      if (offer && offer.offers.length > 0) {
        if (action.id === undefined) return fail('pick one of the offered modifiers');
        if (!offer.offers.includes(action.id)) return fail(`${action.id} is not on offer`);
        const remaining = offer.offers.filter((id) => id !== action.id);
        const picksLeft = offer.picksLeft - 1;
        const next: RunState = { ...state, inRun: [...state.inRun, action.id], boss: { ...state.boss, reward: { offers: remaining, picksLeft } } };
        if (picksLeft > 0 && remaining.length > 0) return ok(next);
        return ok(advanceRound({ ...next, boss: null }, balance));
      }
      return ok(advanceRound({ ...state, boss: null }, balance));
    }

    default:
      return fail(`unknown action ${(action as { type: string }).type}`);
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function snapshot(state: RunState): StepSnapshot {
  return {
    chain: state.chain,
    hand: state.hand,
    pool: state.pool,
    destroyed: state.destroyed,
    cards: state.cards,
    strainThisRound: state.strainThisRound,
    chainDirty: state.chainDirty,
    roundEffects: state.roundEffects,
  };
}

type PlayStepAction = Extract<Action, { type: 'PLAY_STEP' }>;

/** One natural step: commit tiles from the hand, validate, record. */
function playNaturalStep(state: RunState, action: PlayStepAction, content: EngineContent): Step {
  const committed = tiles.commit(state.hand, action.tileIds, action.playedAs);
  if ('error' in committed) return fail(committed.error);

  let next: Chain;
  if (state.chain === null) {
    if (action.side !== 'start') return fail('the first word must be played with side "start"');
    const r = chainMod.createChain(committed.committed, state.round, content.dictionary);
    if (!r.ok) return fail(r.error);
    next = r.value;
  } else {
    if (action.side !== 'front' && action.side !== 'back') {
      return fail(`side "${action.side}" is not a natural extension`);
    }
    const r = chainMod.extendNatural(state.chain, action.side, committed.committed, content.dictionary, state.round);
    if (!r.ok) return fail(r.error);
    next = r.value;
  }

  const record: StepRecord = {
    side: action.side,
    tileIds: action.tileIds,
    word: action.side === 'front' ? chainMod.headText(next) : chainMod.tailText(next),
  };
  if (action.playedAs) record.playedAs = action.playedAs;

  return ok({ ...state, chain: next, hand: committed.hand, steps: [...state.steps, record] });
}

/** A step made by an Extension card: back only (D5); the card is consumed and applies strain. */
function playCardStep(state: RunState, action: PlayStepAction, instanceId: string, content: EngineContent): Step {
  const held = state.cards.find((c) => c.instanceId === instanceId);
  if (!held) return fail('that card is not in your hand');
  const spec = cards.cardSpec(content, held.cardId);
  if (!spec) return fail(`unknown card ${held.cardId}`);
  const effect = cards.stepEffects[spec.effectId as keyof typeof cards.stepEffects];
  if (!effect) return fail(`${spec.name} is not an extension card`);
  if (!state.chain) return fail('play a first word before using an extension card');
  if (action.side !== 'back') return fail('extension cards extend the back of the word (D5)');

  const committed = tiles.commit(state.hand, action.tileIds, action.playedAs);
  if ('error' in committed) return fail(committed.error);
  const r = effect(state.chain, committed.committed, content.dictionary, state.round, spec);
  if (!r.ok) return fail(`${spec.name}: ${r.error}`);

  const record: StepRecord = { side: 'back', tileIds: action.tileIds, word: chainMod.tailText(r.value), viaCard: spec.id };
  if (action.playedAs) record.playedAs = action.playedAs;
  const strained = mods.strain(state, content, spec, Number(spec.params.strain ?? 1));
  return ok({
    ...strained.state,
    chain: r.value,
    hand: committed.hand,
    steps: [...state.steps, record],
    cards: state.cards.filter((c) => c !== held),
    strainThisRound: state.strainThisRound + strained.units,
  });
}

/** An instant card (Sound Shift, Loanword, Utility, Echo): apply and consume. */
function useCard(state: RunState, instanceId: string, target: CardTarget, content: EngineContent): Step {
  const held = state.cards.find((c) => c.instanceId === instanceId);
  if (!held) return fail('that card is not in your hand');
  const spec = cards.cardSpec(content, held.cardId);
  if (!spec) return fail(`unknown card ${held.cardId}`);
  if (cards.usage(spec) === 'step') return fail(`${spec.name} is used by adding tiles to the back of the word`);
  if (!cards.usableIn(spec, state.phase)) return fail(`${spec.name} cannot be used in phase ${state.phase}`);
  const effect = cards.instantEffects[spec.effectId as keyof typeof cards.instantEffects];
  const r = effect({ state, card: spec, target, content });
  if (!r.ok) return fail(`${spec.name}: ${r.error}`);
  const remaining = (r.patch.cards ?? state.cards).filter((c) => c !== held);
  return ok({ ...state, ...r.patch, cards: remaining });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function heldTypes(state: RunState, content: EngineContent) {
  return state.cards.map((c) => cards.cardSpec(content, c.cardId)?.type).filter((t): t is NonNullable<typeof t> => !!t);
}

/** Apply pass/fail consequences: lives, currency, streak, lastResult. */
function settle(
  state: RunState,
  breakdown: scoring.ScoreBreakdown,
  streakIfPassed: number,
  sources: CurrencySource[],
  notes: string[],
  criteriaMet: string[],
): RunState {
  const base = { ...breakdown, notes, criteriaMet };
  if (breakdown.passed) {
    const earned = economy.total(sources);
    const result: RoundResult = { ...base, outcome: 'pass', currencyEarned: earned, currencySources: sources };
    return { ...state, lastResult: result, streak: streakIfPassed, currency: state.currency + earned };
  }
  const failed = { ...base, currencyEarned: 0, currencySources: [] as CurrencySource[] };
  if (state.roundEffects.insurance) return { ...state, lastResult: { ...failed, outcome: 'insured' }, streak: 0 };
  if (state.lives > 0) return { ...state, lastResult: { ...failed, outcome: 'life_lost' }, streak: 0, lives: state.lives - 1 };
  return { ...state, lastResult: { ...failed, outcome: 'game_over' }, streak: 0 };
}

/** Score the boss round from its placed-word points and settle pass/fail (P4-06). */
function finishBoss(state: RunState, wordPoints: number, reason: 'timer' | 'overflow' | 'ended', content: EngineContent): RunState {
  const { balance } = content;
  const b = state.boss as BossState;
  const morphemes = state.chain ? chainMod.morphemeCount(state.chain) : 1;
  const base = mods.multiplierBase(state, content);
  const breakdown = scoring.scoreBoss(
    { round: state.round, bossWordPoints: wordPoints, morphemes, inRunMult: inRunMultiplier(state), multiplierBase: base },
    balance,
  );
  const notes = base !== balance.scoring.multiplierBase ? [`multiplier base ${base.toFixed(2)}`] : [];
  const after = settle(state, breakdown, state.streak, breakdown.passed ? economy.bossCurrency(b.bossNumber, balance) : [], notes, []);
  let rewardOffer: BossState['reward'] = null;
  let r = after.rng;
  if (breakdown.passed) {
    const built = reward.buildRewardOffers(after, content, b.bossNumber);
    rewardOffer = { offers: built.offers, picksLeft: built.picks };
    r = built.rng;
  }
  return { ...after, rng: r, phase: 'BOSS_END', boss: { ...b, wordPoints, ended: true, endReason: reason, reward: rewardOffer } };
}

/** Next round, or WIN after the last one. */
function advanceRound(state: RunState, balance: EngineContent['balance']): RunState {
  if (state.round >= balance.rounds.total) return { ...state, phase: 'WIN' };
  return { ...state, round: state.round + 1, phase: 'ROUND_START' };
}

/** All tiles the run owns, wherever they are (for the conservation invariant). */
export function allTiles(state: RunState): Tile[] {
  return [...state.pool, ...state.hand, ...(state.chain?.tiles ?? []), ...state.destroyed];
}
