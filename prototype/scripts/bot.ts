/**
 * A headless bot that plays Morpheme through the real engine (P8-01). It is
 * deliberately simple — greedy natural extensions, extension cards when
 * stuck, greedy short words in boss rounds — so its margins are a floor for
 * what a thoughtful human reaches. Used by scripts/playtest.ts and tests.
 */

import { boss as B, chain as C, cards as cardFns, reduce, scoring, scoringInputs, tiles as T, thresholdFor } from '../src/engine';
import type { Dir, EngineContent, Letter, RunState, Side, Tile } from '../src/engine';

export interface BotOptions {
  /** Simulated thinking time per boss placement attempt (ms of BOSS_TICK). */
  bossThinkMs: number;
  /** Max natural steps per regular round. */
  maxSteps: number;
  /** Preferred in-run modifiers, most wanted first. */
  rewardPreference: string[];
  /** Words the bot may use in boss rounds, by length (built once per dictionary). */
  shortWords?: string[];
  /** Full word list (lowercase) — needed for extension search. */
  words: string[];
  /** Prefix / suffix counts so the bot prefers words that can still grow. */
  index?: ExtendIndex;
}

/** How many dictionary words extend `w` at the back / front (excluding w itself). */
export interface ExtendIndex {
  starts: Map<string, number>;
  ends: Map<string, number>;
}

export function buildExtendIndex(words: readonly string[], maxKey = 12): ExtendIndex {
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  for (const w of words) {
    for (let k = 2; k < w.length && k <= maxKey; k++) {
      const p = w.slice(0, k);
      starts.set(p, (starts.get(p) ?? 0) + 1);
      const q = w.slice(w.length - k);
      ends.set(q, (ends.get(q) ?? 0) + 1);
    }
  }
  return { starts, ends };
}

export function extendability(index: ExtendIndex | undefined, w: string): number {
  if (!index) return 0;
  return (index.starts.get(w) ?? 0) + (index.ends.get(w) ?? 0);
}

export const defaultBotOptions: Omit<BotOptions, 'words'> = {
  bossThinkMs: 4000,
  maxSteps: 3,
  rewardPreference: ['agglutination', 'momentum', 'chain_lightning', 'suffix_bias', 'prefix_bias', 'inflection', 'mirror', 'vowel_harmony', 'coinage', 'etymologist', 'rack_extension', 'polyglot'],
};

// --- letter multisets -----------------------------------------------------------

function counts(letters: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const ch of letters) m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
}

/** Can `needed` be spelled from `hand` (blanks fill any letter)? Returns the tile ids to use, in order. */
export function pickTiles(hand: readonly Tile[], needed: string): { tileIds: string[]; playedAs: Record<string, Letter> } | null {
  const remaining = hand.slice();
  const tileIds: string[] = [];
  const playedAs: Record<string, Letter> = {};
  for (const ch of needed.toUpperCase()) {
    let i = remaining.findIndex((t) => t.letter === ch);
    if (i === -1) i = remaining.findIndex((t) => T.isBlank(t));
    if (i === -1) return null;
    const tile = remaining.splice(i, 1)[0]!;
    tileIds.push(tile.id);
    if (T.isBlank(tile)) playedAs[tile.id] = ch as Letter;
  }
  return { tileIds, playedAs };
}

function formable(word: string, hand: Map<string, number>, blanks: number): boolean {
  let missing = 0;
  const used = new Map<string, number>();
  for (const ch of word.toUpperCase()) {
    const have = hand.get(ch) ?? 0;
    const u = (used.get(ch) ?? 0) + 1;
    used.set(ch, u);
    if (u > have) missing++;
    if (missing > blanks) return false;
  }
  return true;
}

function handCounts(hand: readonly Tile[]): { letters: Map<string, number>; blanks: number } {
  const letters = counts(hand.filter((t) => !T.isBlank(t)).map((t) => t.letter).join(''));
  return { letters, blanks: hand.filter((t) => T.isBlank(t)).length };
}

// --- regular rounds ---------------------------------------------------------------

interface Candidate {
  side: Side | 'start';
  letters: string;
  viaCard?: string;
  score: number;
}

function preview(state: RunState, content: EngineContent): number {
  if (!state.chain) return 0;
  const inputs = scoringInputs(state, content);
  return scoring.scoreRegular(
    {
      round: state.round,
      wordPoints: inputs.wordPoints,
      morphemes: C.morphemeCount(state.chain),
      strainCount: state.strainThisRound,
      extension: inputs.shape,
      inRunMult: inputs.inRunMult,
      multiplierBase: inputs.base,
      extensionBonusMult: inputs.extensionBonusMult,
    },
    content.balance,
  ).score;
}

/**
 * First word: among spellable dictionary words, prefer ones many other words
 * extend (so the run can keep growing), then tile value. Short roots like
 * "form" beat long dead ends like "aeronomy".
 */
function bestFirstWord(state: RunState, opts: BotOptions): Candidate | null {
  const { letters, blanks } = handCounts(state.hand);
  const maxLen = state.hand.length;
  let best: Candidate | null = null;
  let bestKey = -Infinity;
  for (const w of opts.words) {
    if (w.length < 2 || w.length > maxLen) continue;
    if (!formable(w, letters, blanks)) continue;
    const pick = pickTiles(state.hand, w)!;
    const value = pick.tileIds.reduce((s, id) => s + T.tileValue(state.hand.find((t) => t.id === id)!), 0);
    const ext = Math.min(extendability(opts.index, w), 40);
    const key = ext * 2 + value;
    if (key > bestKey) {
      bestKey = key;
      best = { side: 'start', letters: w, score: value };
    }
  }
  return best;
}

/** Natural extensions available from the hand, scored by the resulting preview. */
function naturalCandidates(state: RunState, content: EngineContent, opts: BotOptions): Candidate[] {
  const chain = state.chain!;
  const { letters, blanks } = handCounts(state.hand);
  const tail = C.tailText(chain);
  const head = C.headText(chain);
  const out: Candidate[] = [];
  for (const w of opts.words) {
    if (w.length <= tail.length && w.length <= head.length) continue;
    if (w.startsWith(tail) && w.length > tail.length) {
      const add = w.slice(tail.length);
      if (add.length <= state.hand.length && formable(add, letters, blanks)) out.push(tryStep(state, content, 'back', add));
    }
    if (w.endsWith(head) && w.length > head.length) {
      const add = w.slice(0, w.length - head.length);
      if (add.length <= state.hand.length && formable(add, letters, blanks)) out.push(tryStep(state, content, 'front', add));
    }
  }
  // Prefer steps that leave the word extendable; among those, the best score.
  const valid = out.filter((c) => c.score >= 0);
  const scored = valid.map((c) => {
    const word = c.side === 'back' ? tail + c.letters : c.letters + head;
    return { c, ext: extendability(opts.index, word) };
  });
  const open = scored.filter((x) => x.ext >= 3);
  const pool = open.length > 0 ? open : scored;
  return pool.sort((a, b) => b.c.score - a.c.score).map((x) => x.c);
}

function tryStep(state: RunState, content: EngineContent, side: Side, letters: string, viaCard?: string): Candidate {
  const pick = pickTiles(state.hand, letters);
  if (!pick) return { side, letters, score: -1 };
  const action = viaCard ? { type: 'PLAY_STEP' as const, side, ...pick, viaCard } : { type: 'PLAY_STEP' as const, side, ...pick };
  const next = reduce(state, action, content);
  if (next.log[next.log.length - 1]?.error) return { side, letters, score: -1 };
  const cand: Candidate = { side, letters, score: preview(next, content) };
  if (viaCard) cand.viaCard = viaCard;
  return cand;
}

/** An extension-card step if one is held and feasible. */
function cardCandidate(state: RunState, content: EngineContent, opts: BotOptions): Candidate | null {
  const chain = state.chain!;
  const { letters, blanks } = handCounts(state.hand);
  const held = state.cards.map((inst) => ({ inst, spec: cardFns.heldSpec(content, inst) })).filter((x) => x.spec && cardFns.usage(x.spec) === 'step');
  const order = ['before_and_after', 'blend', 'hyphen', 'reduplication', 'free_morpheme'];
  held.sort((a, b) => order.indexOf(a.spec!.effectId) - order.indexOf(b.spec!.effectId));
  for (const { inst, spec } of held) {
    const id = inst.instanceId;
    const last = C.morphemeText(chain, C.lastMorpheme(chain));
    const tail = C.tailText(chain);
    let best: { c: Candidate; key: number } | null = null;
    // Prefer results whose new tail word can still grow, then score.
    const consider = (add: string, tailWord: string) => {
      if (add.length === 0 || add.length > state.hand.length || !formable(add, letters, blanks)) return;
      const c = tryStep(state, content, 'back', add, id);
      if (c.score < 0) return;
      const key = Math.min(extendability(opts.index, tailWord), 40) * 10 + c.score;
      if (!best || key > best.key) best = { c, key };
    };
    switch (spec!.effectId) {
      case 'before_and_after':
        for (const w of opts.words) if (w.length > last.length && w.startsWith(last)) consider(w.slice(last.length), w);
        break;
      case 'blend':
        for (const w of opts.words) {
          for (let k = Math.min(tail.length, w.length - 1); k >= 2; k--) if (w.startsWith(tail.slice(tail.length - k))) consider(w.slice(k), w);
        }
        break;
      case 'hyphen':
        for (const w of opts.words) if (w.length >= 2 && w.length <= state.hand.length) consider(w, w);
        break;
      case 'reduplication':
        consider(last, last);
        break;
      case 'free_morpheme': {
        // Any 2-letter prefix that many words start with (the tail becomes those letters).
        const seen = new Set<string>();
        for (const a of state.hand) {
          for (const b of state.hand) {
            if (a === b) continue;
            const pair = (T.isBlank(a) ? 'E' : a.letter) + (T.isBlank(b) ? 'E' : b.letter);
            if (seen.has(pair)) continue;
            seen.add(pair);
            consider(pair.toLowerCase(), pair.toLowerCase());
          }
        }
        break;
      }
    }
    if (best) return (best as { c: Candidate }).c;
  }
  return null;
}

function act(state: RunState, content: EngineContent, cand: Candidate): RunState {
  const pick = pickTiles(state.hand, cand.letters)!;
  const action = cand.viaCard ? { type: 'PLAY_STEP' as const, side: cand.side, ...pick, viaCard: cand.viaCard } : { type: 'PLAY_STEP' as const, side: cand.side, ...pick };
  return reduce(state, action, content);
}

export function playRegularRound(state: RunState, content: EngineContent, opts: BotOptions): RunState {
  let s = state;
  if (!s.chain) {
    const first = bestFirstWord(s, opts);
    if (!first) return reduce(s, { type: 'FORFEIT' }, content);
    s = act(s, content, first);
  } else {
    let steps = 0;
    while (steps < opts.maxSteps) {
      const best = naturalCandidates(s, content, opts)[0];
      if (!best) break;
      // Only take a further step if it improves the score.
      if (steps > 0 && best.score <= preview(s, content)) break;
      s = act(s, content, best);
      steps++;
    }
    if (steps === 0) {
      const card = cardCandidate(s, content, opts);
      if (card) s = act(s, content, card);
      else {
        // Redraw once if held, then retry natural extensions.
        const redraw = s.cards.find((c) => c.cardId === 'redraw');
        const free = s.freeRedraws > 0;
        if (redraw || free) {
          s = reduce(s, free ? { type: 'REDRAW' } : { type: 'USE_CARD', instanceId: redraw!.instanceId }, content);
          const best = naturalCandidates(s, content, opts)[0];
          if (best) s = act(s, content, best);
        }
      }
    }
  }
  if (s.steps.length === 0) return reduce(s, { type: 'FORFEIT' }, content);
  return reduce(s, { type: 'SUBMIT' }, content);
}

// --- shop -----------------------------------------------------------------------------

export function shop(state: RunState, content: EngineContent): RunState {
  let s = state;
  const heldTypes = () => cardFns.countByType(s.cards, content);
  // Always keep one extension card; then a redraw; then the in-run slot; then a second extension.
  const buy = (pred: (spec: ReturnType<typeof cardFns.cardSpec>) => boolean) => {
    const slot = s.shop!.offers.findIndex((o) => !o.sold && o.price <= s.currency && pred(cardFns.cardSpec(content, o.cardId)));
    if (slot >= 0) s = reduce(s, { type: 'BUY_CARD', slot }, content);
  };
  const flexible = new Set(['hyphen', 'free_morpheme']);
  const heldFlexible = () => s.cards.filter((c) => flexible.has(cardFns.heldSpec(content, c)?.effectId ?? '')).length;
  const offeredFlexible = () => s.shop!.offers.some((o) => !o.sold && flexible.has(cardFns.cardSpec(content, o.cardId)?.effectId ?? ''));
  // Keep one flexible extension card at all times; reroll once to find one if needed.
  if (heldFlexible() === 0 && !offeredFlexible() && s.currency >= s.shop!.rerollPrice + 3) s = reduce(s, { type: 'REROLL' }, content);
  if (heldFlexible() === 0) buy((spec) => !!spec && flexible.has(spec.effectId));
  if (heldTypes().extension === 0) buy((spec) => spec?.type === 'extension' && spec.effectId !== 'echo');
  buy((spec) => spec?.id === 'redraw');
  const slot = s.shop!.inRunOffer;
  if (slot && !slot.sold && s.currency >= slot.price + 3) s = reduce(s, { type: 'BUY_IN_RUN' }, content);
  if (heldFlexible() < 2) buy((spec) => !!spec && flexible.has(spec.effectId));
  return reduce(s, { type: 'LEAVE' }, content);
}

// --- boss ------------------------------------------------------------------------------

export function shortWordList(words: readonly string[], maxLen = 5): string[] {
  return words.filter((w) => w.length >= 2 && w.length <= maxLen);
}

interface Placement {
  row: number;
  col: number;
  dir: Dir;
  letters: string;
  points: number;
}

/** Best placement anchored on one existing board tile. */
export function bestPlacement(state: RunState, content: EngineContent, shortWords: readonly string[]): Placement | null {
  const b = state.boss!;
  const rules = b.rules!;
  const board = b.board;
  const rackCounts = handCounts(b.rack);
  const anchors: [number, number, string][] = [];
  board.cells.forEach((t, i) => {
    if (t) {
      const [r, c] = B.rowCol(board, i);
      anchors.push([r, c, T.tileLetter(t).toLowerCase()]);
    }
  });
  let best: Placement | null = null;
  for (const w of shortWords) {
    if (w.length < rules.minWordLength) continue;
    for (const [ar, ac, al] of anchors) {
      for (let k = 0; k < w.length; k++) {
        if (w[k] !== al) continue;
        const rest = w.slice(0, k) + w.slice(k + 1);
        if (!formable(rest, rackCounts.letters, rackCounts.blanks)) continue;
        for (const dir of ['H', 'V'] as Dir[]) {
          const [sr, sc] = dir === 'H' ? [ar, ac - k] : [ar - k, ac];
          if (!B.inBounds(board, sr, sc)) continue;
          const resolved = B.resolveRack(b.rack, rest);
          if (!resolved.ok) continue;
          const placed = B.placementsFor(board, sr, sc, dir, resolved.value.used);
          if (!placed.ok) continue;
          const v = B.validatePlacement(board, placed.value, content.dictionary, rules);
          if (!v.ok || v.value.main.word !== w) continue;
          if (!best || v.value.points > best.points) best = { row: sr, col: sc, dir, letters: rest, points: v.value.points };
        }
      }
    }
  }
  return best;
}

export function playBossRound(state: RunState, content: EngineContent, opts: BotOptions): RunState {
  let s = reduce(state, { type: 'START_BOSS' }, content);
  const shortWords = opts.shortWords ?? shortWordList(opts.words);
  while (s.phase === 'BOSS_PLAY') {
    s = reduce(s, { type: 'BOSS_TICK', ms: opts.bossThinkMs }, content);
    if (s.phase !== 'BOSS_PLAY') break;
    const p = bestPlacement(s, content, shortWords);
    if (p) s = reduce(s, { type: 'PLACE_WORD', row: p.row, col: p.col, dir: p.dir, letters: p.letters }, content);
  }
  return s;
}

// --- a whole run --------------------------------------------------------------------------

export function playRun(state: RunState, content: EngineContent, opts: BotOptions): RunState {
  let s = state;
  let guard = 0;
  while (s.phase !== 'WIN' && s.phase !== 'GAME_OVER' && guard++ < 2000) {
    switch (s.phase) {
      case 'ROUND_START':
        s = reduce(s, { type: 'START_ROUND' }, content);
        break;
      case 'EXTEND':
        s = playRegularRound(s, content, opts);
        break;
      case 'SCORED':
      case 'BOSS_END':
        s = reduce(s, { type: 'CONTINUE' }, content);
        break;
      case 'SHOP':
        s = shop(s, content);
        break;
      case 'BOSS_INTRO':
        s = playBossRound(s, content, opts);
        break;
      case 'BOSS_REWARD': {
        const offers = s.boss?.reward?.offers ?? [];
        const pick = opts.rewardPreference.find((id) => offers.includes(id)) ?? offers[0];
        s = reduce(s, pick ? { type: 'PICK_MODIFIER', id: pick } : { type: 'PICK_MODIFIER' }, content);
        break;
      }
      default:
        throw new Error(`bot cannot handle phase ${s.phase}`);
    }
    const err = s.log[s.log.length - 1]?.error;
    if (err) throw new Error(`bot action rejected in ${s.phase} round ${s.round}: ${err}`);
  }
  return s;
}

/** Threshold ratio helper for reports. */
export function ratio(score: number, threshold: number): number {
  return threshold > 0 ? score / threshold : 0;
}

export { thresholdFor };
