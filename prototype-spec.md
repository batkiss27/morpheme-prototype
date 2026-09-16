# Morpheme — Prototype Technical Specification

> **Status:** Living document, v0.1. This spec guides AI coding agents building the
> gameplay prototype. It is iterative: when a decision changes, update the relevant
> section **and** add a line to the Change Log (§12). Keep it consistent with
> `DESIGN.md` (product requirements) and `prototype-tasks.md` (plan and stories).
>
> **Precedence:** `DESIGN.md` defines *what the game is*. This spec defines *how the
> prototype implements it*. If they conflict, flag it in §11 rather than silently
> picking one.

---

## 1. Purpose and scope

The prototype exists to **play and iterate on the gameplay** of Morpheme in a
browser. It is not the product. Its success criteria:

1. A full 24-round run (18 regular + 6 boss rounds) is playable end to end.
2. Every balance number can be changed without touching game logic.
3. Runs are reproducible (seeded) and exportable for analysis.
4. The rules engine is isolated so it can be ported later.

**Explicitly out of scope:** polished visuals, animations, real audio, accounts,
servers, multiplayer, mobile layout, localization, monetization, word-submission
workflow. Anything in `DESIGN.md` marked as production-only or listed in §10.

---

## 2. Technology stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Types double as documentation for agents; portable rules. |
| Build/dev | Vite | Instant reload; zero config. |
| UI | React 18, function components + hooks | Conventional; fast to iterate; UI is a thin layer. |
| Styling | Plain CSS with CSS custom properties, one `theme.css` | No framework setup; blue/green palette in one place. |
| State | Engine is a pure reducer; UI subscribes via a minimal store (`useSyncExternalStore`). No Redux/Zustand unless a story needs it. | Reducer = replayable, testable, portable. |
| Tests | Vitest | Same toolchain as Vite; fast. |
| RNG | Own `mulberry32`-style seeded PRNG in `engine/rng.ts` | Zero dependencies; deterministic runs. |
| Dictionary | ENABLE1 word list (public domain) as `public/dict/enable1.txt` + `public/dict/custom.txt` | Free to use; ~173k words; custom file is the admin "add word" hook. |
| Persistence | `localStorage` (meta-progression, settings) | Enough for a prototype. |
| Package manager | npm | Lowest friction. |
| Node | 20 LTS or newer | |

**Non-goals for the stack:** no backend, no database, no CSS framework, no game
engine (Phaser etc.), no state library, no component library.

---

## 3. Repository layout

```
morpheme-game/
├── DESIGN.md                    # product requirements (source of truth for rules)
├── prototype-spec.md            # this file
├── prototype-tasks.md           # plan + user stories
├── production-architecture.md   # future-facing template
├── Morpheme_Master.xlsx         # balance/content master (values)
├── prototype/                   # the app lives here so docs stay at the root
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── public/
│   │   └── dict/
│   │       ├── enable1.txt      # base dictionary, one word per line, lowercase
│   │       └── custom.txt       # admin additions, same format; may be empty
│   └── src/
│       ├── engine/              # PURE. No React, no DOM, no timers, no fetch.
│       │   ├── index.ts         # public API of the engine
│       │   ├── types.ts         # all shared types
│       │   ├── rng.ts           # seeded PRNG
│       │   ├── dictionary.ts    # Set-backed lookup; injected, never fetched here
│       │   ├── tiles.ts         # pool creation, draw, return, commit
│       │   ├── chain.ts         # the word/chain model + extension validation
│       │   ├── scoring.ts       # points, multipliers, thresholds
│       │   ├── run.ts           # run state machine (reducer)
│       │   ├── shop.ts          # shop generation + purchase rules
│       │   ├── cards/           # one file per card type + registry
│       │   ├── modifiers/       # in-run, pre-run, tile, boss modifiers + registry
│       │   ├── boss/            # board, placement, feed, timer logic
│       │   └── export.ts        # run log → JSON
│       ├── content/             # DATA ONLY. Mirrors the spreadsheet tabs.
│       │   ├── balance.ts       # every tunable number (Scoring tab parameters etc.)
│       │   ├── tiles.ts         # letters, values, counts, tile modifiers by level
│       │   ├── cards.ts         # Per Round Cards tab
│       │   ├── inRunModifiers.ts
│       │   ├── preRunModifiers.ts
│       │   ├── bossModifiers.ts
│       │   ├── achievements.ts
│       │   └── secretWords.ts
│       ├── ui/                  # React. Thin. Reads state, dispatches actions.
│       │   ├── App.tsx
│       │   ├── store.ts         # wraps engine reducer; loads dictionary; seeds
│       │   ├── theme.css
│       │   ├── screens/         # one component per run phase (§6)
│       │   ├── components/      # Tile, Hand, Chain, CardPanel, ModifierPanel, DebugPanel …
│       │   └── audio.ts         # playCue(id) stub (console.log / optional beep)
│       └── main.tsx
│   ├── tests/                   # Vitest; engine tests only, no DOM
│   │   ├── fixtures/            # JSON test vectors (see §9) — these are portable
│   │   ├── helpers.ts           # tiny dictionaries, tiles from strings
│   │   ├── run-driver.ts        # helpers that drive the reducer through rounds
│   │   └── *.test.ts
│   └── scripts/
│       └── content-from-xlsx.ts # OPTIONAL later: regenerate src/content from the workbook
└── .claude/launch.json          # dev-server launch config for the Claude desktop app
```

**Rule for agents:** anything under `src/engine/` must import only from
`src/engine/` and `src/content/`. A lint rule or a test that greps imports enforces
this (story P1-01).

---

## 4. Engine: core data model

All types live in `src/engine/types.ts`. Prefer plain data objects; no classes with
behavior. Everything below is illustrative and may be refined, but names should be
kept stable once used.

```ts
type Letter = 'A' | 'B' | /* … */ 'Z' | '_';         // '_' = blank/wild

interface Tile {
  id: string;                 // unique within a run
  letter: Letter;
  playedAs?: Letter;          // for blanks / Wild tiles once placed
  baseValue: number;          // from content/tiles.ts
  modifiers: TileModifierId[];
}

interface Morpheme {
  id: string;
  tileIds: string[];          // ordered, left → right
  side: 'front' | 'back' | 'start' | 'insert';
  round: number;
  viaCard?: CardId;           // set when an Extension card created it (strain)
}

/** The word. A list of tiles plus morpheme boundaries plus the "active" spans. */
interface Chain {
  tiles: Tile[];              // full left → right string of the chain
  morphemes: Morpheme[];      // in order of position, not creation
  headSpan: [start: number, end: number];  // indices into tiles: the real word at the front
  tailSpan: [start: number, end: number];  // the real word at the back (== headSpan when natural)
  natural: boolean;           // true iff the whole chain is one dictionary word
}
```

**Chain semantics** (from `DESIGN.md` §2.5):

- `text(chain)` = concatenation of `playedAs ?? letter` over `tiles`.
- **Natural back extension:** new letters appended; `text(tailSpan + new)` must be
  in the dictionary. `tailSpan` grows to include the new tiles. If `natural`,
  `headSpan` grows too.
- **Natural front extension:** symmetric with `headSpan`.
- **Multi-step round:** an extension is a list of steps; each step is validated
  against the chain produced by the previous step. Morphemes added = steps.
- **Before & After (extension card):** the last morpheme of the chain becomes the
  start of a new tail word: `tailSpan = [lastMorpheme.start, end + new]`, and
  `text(tailSpan)` must be a dictionary word. `natural` becomes `false`.
- **Blend:** like Before & After but the shared prefix is a suffix of *letters*
  (length ≥ 2) rather than a whole morpheme.
- **Hyphen:** `tailSpan` = just the new letters; must be a dictionary word.
- **Reduplication:** append tiles that spell the last morpheme again (drawn from
  hand; letters must match). No dictionary check on the join.
- Other extension cards are specified in `content/cards.ts` with an `apply`
  function in `engine/cards/extension.ts`; see §7.

- **Reduplication / Free Morpheme:** no dictionary check; `tailSpan` = just the
  new letters, so the next natural back step validates `newLetters + more`.
- **Blend** searches overlaps from the longest (the whole tail word) down to
  `minOverlap` (2) and takes the first dictionary hit; the shared letters stay
  in their original morpheme and the new morpheme is the added letters only.
- **Sound Shift cards** (Vowel Shift, Glide, Elision, Metathesis) edit tiles
  already in the chain. A shifted tile keeps its base value and records the new
  letter in `playedAs`; Elision moves the tile to `destroyed` and drops an
  emptied morpheme. A shift may make the chain temporarily non-dictionary
  (`chainDirty`): the next steps must restore validity, and `SUBMIT` is
  rejected while either active word (head or tail span) is not in the
  dictionary. Middle morphemes of a non-natural chain are never re-validated.

The engine never decides *which* morphemes are linguistically real. The
dictionary is the only judge of validity.

```ts
interface RunState {
  seed: number;
  rng: RngState;              // serializable
  round: number;              // 1..24
  phase: Phase;               // see §5
  lives: number;
  currency: number;
  pool: Tile[];               // undrawn tiles
  hand: Tile[];
  chain: Chain | null;        // null before round 1 is scored
  cards: CardInstance[];      // held per-round cards
  inRun: InRunModifierId[];
  preRun: PreRunLoadout;      // chosen before the run
  streak: number;             // consecutive natural extension rounds
  shop: ShopState | null;
  boss: BossState | null;
  log: RunEvent[];            // append-only; used for export and debugging
  flags: { bossJumpPending?: boolean; /* … */ };
}
```

---

## 5. Engine: run state machine

`engine/run.ts` exports `reduce(state: RunState, action: Action): RunState` and
`createRun(seed, loadout, content): RunState`. The reducer is pure; the UI is the
only thing that calls it (through `ui/store.ts`). Time is an action (`BOSS_TICK`),
never a `setTimeout` inside the engine.

```
           ┌──────────────┐
  start ──►│  ROUND_START │ draw hand; if round % 4 == 0 → BOSS_INTRO
           └──────┬───────┘
                  ▼
           ┌──────────────┐  actions: PLAY_STEP, UNDO_STEP, USE_CARD,
           │   EXTEND     │           REDRAW, SUBMIT
           └──────┬───────┘
                  ▼
           ┌──────────────┐  compute score & threshold; apply lives on fail
           │   SCORED     │  → SHOP on pass (regular) · GAME_OVER on fail w/o lives
           └──────┬───────┘
                  ▼
           ┌──────────────┐  BUY_CARD, BUY_TILE_ACTION, REROLL, SELL, LEAVE
           │    SHOP      │ ──► ROUND_START (round + 1)
           └──────────────┘

  BOSS_INTRO ─(APPLY_CARD*, REROLL_BOSS_MOD, START_BOSS)─► BOSS_PLAY
  BOSS_PLAY  ─(BOSS_TICK, SELECT_CELL, TYPE_LETTER, PLACE_WORD, CLEAR)─► BOSS_END
  BOSS_END   ─pass─► BOSS_REWARD ─(PICK_MODIFIER)─► ROUND_START
             ─fail─► lose life → ROUND_START (retry same boss? see §11) · GAME_OVER
  round 24 passed ─► WIN
```

**Actions in M1** (`engine/types.ts` `Action`): `START_ROUND`, `PLAY_STEP {side, tileIds, playedAs?, viaCard?}`,
`UNDO_STEP`, `SUBMIT`, `FORFEIT` (give up the round: steps discarded, scores 0, fails),
`USE_CARD {instanceId, target?}` (instant cards), `CONTINUE` (leaves SCORED / BOSS_END),
the shop actions `BUY_CARD {slot}`, `BUY_TILE_ACTION {target}`, `REROLL`, `SELL {instanceId}`,
`LEAVE`, and the boss actions `START_BOSS` (resolves the modifier into `BossRules`, places the
starter, builds the feed and starting rack), `BOSS_TICK {ms}` (the only clock: feeds tiles and
counts down; ends the round on the timer or an Overload overflow), `PLACE_WORD {row, col, dir,
letters}` (rack tiles are consumed in order — exact letter first, then a blank — and laid from the
cell along `dir`, skipping occupied cells; validated by `boss/placement.ts`), `END_BOSS {wordPoints?}`
(end early; the override is for tests and the DebugPanel), `PICK_MODIFIER {id?}`. Rejected actions
are still appended to `log` with an `error` and leave the rest of the state untouched, so an export
replays exactly. Every `PLAY_STEP` pushes a `StepSnapshot` (chain, hand, pool, destroyed, cards,
strain, dirty flag, round effects) onto `undo`; `UNDO_STEP` pops it, which also reverts any card
used after that step. `FORFEIT` restores the first snapshot. Extension cards ride on
`PLAY_STEP { viaCard: instanceId }` (back only, D5) and are consumed on success.

**Invariants** (write tests for each):

- A regular round cannot be submitted unless `morphemesAdded ≥ 1`.
- Every intermediate step in a multi-step submission was dictionary-valid.
- Tiles are in exactly one of: `pool`, `hand`, `chain.tiles`, boss board/rack,
  or `destroyed` (Fragile). No duplication, no loss.
- Score is a pure function of `(chain, cardsUsedThisRound, inRun, preRun, balance)`.
- `reduce` with the same `(state, action)` always returns an equal state.

---

## 6. UI screens

One React component per phase, all reading from the store. **Keep them ugly and
clear.** No animation beyond a CSS transition on the boss transition screen.

| Phase | Screen | Must show |
|---|---|---|
| (pre-run) | `LexiconScreen` | Seed input, loadout picker (tile modifiers by letter level, pre-run categories), start button. **Milestone 7** — until then a "Quick Start" button with a default loadout. |
| ROUND_START/EXTEND | `RoundScreen` | Round number, threshold, current chain (tiles as boxes, morpheme boundaries as gaps, active spans underlined), hand, front/back drop zones, step list with undo, live preview score, card quadrant panel, in-run modifier button, submit. |
| SCORED | `ScoreScreen` | Breakdown: word points × morpheme mult × bonuses × in-run mult = score vs threshold; pass/fail; currency earned by source. Continue. |
| SHOP | `ShopScreen` | Card slots with type/rarity/price, tile action slot, reroll (price), sell held cards, conditional in-run slot when criteria met, currency, leave. |
| BOSS_INTRO | `BossIntroScreen` | Boss number, negative modifier (with reroll if a card allows), the letters that will feed the round, threshold, card-apply area, start. |
| BOSS_PLAY | `BossScreen` | Grid, starter word, rack, upcoming queue (next 5), timer bar, running score vs threshold, placement controls, word log. |
| BOSS_REWARD | `RewardScreen` | 3–4 in-run modifier choices with rarity color; pick one. |
| GAME_OVER / WIN | `EndScreen` | Summary, achievements hit, Lexicon points earned, export run JSON, restart with same seed / new seed. |
| (any) | `DebugPanel` | Collapsible overlay: edit every `balance.ts` value live, grant card/modifier/currency, skip to round N, force boss modifier, show state JSON. Enabled via `?debug=1`. |

**Interaction model for extension (RoundScreen):** click tiles in the hand to
select them in order, then click "Add to front" / "Add to back". Each click is
one step; the step is validated immediately and shown green (valid) or red (invalid
— with the attempted word). Invalid steps cannot be kept. Blanks prompt for a
letter. Extension cards change what "valid" means for the *next* step and are
selected from the card panel before the step.

**Interaction model for the boss board:** click a cell, choose direction (H/V,
toggle key), type letters; letters are consumed from the rack as typed; Enter
places the word if valid (all formed words in dictionary, connected to the board,
standard crossword rules); Escape clears. Mouse-only alternative is not required.

### Visual theme

`ui/theme.css` defines the palette; components use only these variables.

```css
:root {
  --bg:            #0f2a3a;   /* deep blue-green */
  --panel:         #143d4d;
  --panel-alt:     #1b5566;
  --tile:          #dff5ec;   /* pale mint, dark text */
  --tile-text:     #0c2b2a;
  --tile-committed:#9fd8c3;
  --accent:        #2dd4a0;   /* green for valid / pass */
  --accent-2:      #4cc3ff;   /* blue for selection / info */
  --warn:          #ffb454;
  --danger:        #ff6b6b;
  --text:          #e7f6f2;
  --muted:         #9bbcc4;
  /* rarity */
  --r-basic:    #7dd3a5;
  --r-uncommon: #5aa9ff;
  --r-exotic:   #35e0d6;
  --r-relic:    #a78bfa;
}
```

System font stack. Tiles are 44×44 px boxes with the letter and a small value
subscript. Cards are 120×70 px boxes with name, type badge, rarity border. That is
all the design the prototype needs.

---

## 7. Content and balance (data-driven)

Everything a designer might tune lives in `src/content/` and mirrors the workbook
tabs one-to-one, so the spreadsheet stays the design master.

- `balance.ts` — the *Scoring* tab parameters plus round count, hand size, boss
  timing (timer ms, feed interval per boss, starting rack, rack cap, grid size,
  starter-morpheme rule), shop prices/odds, economy base values, strain, extension
  bonuses, life rule. **One object, exported as `defaultBalance`.** The DebugPanel
  edits a copy of it at runtime; the engine receives balance as an argument, never
  imports it directly.
- `tiles.ts` — letters/values/counts and tile modifiers by level.
- `cards.ts` — each card: `{ id, name, type, rarity, duration, price, effectId, params, cueId }`.
  Effects are implemented in `engine/cards/<type>.ts` as a registry
  `effects[effectId](state, params, target) → state`. Adding a card that reuses
  an existing effect is a data-only change.
- `inRunModifiers.ts`, `preRunModifiers.ts`, `bossModifiers.ts` — same pattern:
  data + `hookId`. Modifiers are implemented as hooks the engine calls at named
  points (`onScoreWord`, `onMorphemeScore`, `onRoundEnd`, `onBossSetup`,
  `onShopBuild`, `onStrain`, …). Unknown hooks are a startup error.
- `achievements.ts` — `{ id, name, condition: predicateId, params, reward }`.
- `secretWords.ts` — list of words that trigger the boss jump.

**Prototype content subset** (first implementation target; grow from here):

| Kind | Initial set |
|---|---|
| Extension cards | Before & After, Reduplication, Hyphen, Blend, Echo, Free Morpheme |
| Sound Shift cards | Vowel Shift, Glide, Elision, Metathesis |
| Loanword cards | Loanword, Redraw, Simplification |
| Utility cards | Amendment, Lexicographer, Bank, Insurance |
| In-run modifiers | Suffix Bias, Prefix Bias, Inflection, Coinage, Rack Extension, Vowel Harmony, Momentum, Etymologist, Agglutination, Mirror, Chain Lightning, Polyglot |
| Boss modifiers | Y Not, Long Words Only, Rapid Feed, Tight Rack, Fog, Half Time, Vowel Tax, Overload |
| Pre-run categories | Second Breath, Treasury, Substrate, Tempo (levels 1–4) |
| Tile modifiers | Level 1: +1, Gilded, Anchored · Level 2: +2, Vowel Wild, Harmonic · Level 3: +3, Compounding, Silent · Level 4: Wild, Stressed, Heavy |
| Achievements | ~10 covering progression, abstention, and the secret words |

---

## 8. Dictionary

- Loaded once by `ui/store.ts` via `fetch('/dict/enable1.txt')` and
  `fetch('/dict/custom.txt')`, merged into a `Set<string>` (lowercase), passed to
  the engine as a `Dictionary` object `{ has(word): boolean, size }`.
- Words of length < 2 are ignored. Proper nouns are absent from ENABLE1 by design.
- `custom.txt` is the "admin adds a word" mechanism. Player submission for review
  is out of scope; the EndScreen offers a "flag a word" textarea that just appends
  to the run export.
- The engine must be testable with a tiny in-memory dictionary (fixtures use
  ~50 words). Never read files inside `engine/`.

---

## 9. Testing strategy

Engine tests are the real product of the prototype — they are what survives the
port. Aim for every rule in `DESIGN.md` §2 to have a named test.

- **Unit tests** per engine module (Vitest). Minimum coverage targets: `chain.ts`
  and `scoring.ts` 100% of branches; `run.ts` every transition; `boss/` placement
  rules complete.
- **Fixture-driven tests** in `tests/fixtures/*.json`: input state + action +
  expected output (or expected error). Format:
  ```json
  { "name": "before-and-after keeps all morphemes",
    "dictionary": ["bear","bearable","unbearable","ableism"],
    "state": { … minimal RunState … },
    "action": { "type": "PLAY_STEP", "side": "back", "letters": "ism", "viaCard": "before_and_after" },
    "expect": { "morphemeCount": 4, "natural": false, "tailText": "ableism" } }
  ```
  These fixtures are language-agnostic and become conformance tests for the
  production engine (`production-architecture.md` §5).
- **Scenario test:** replay the 24-round scenario from the workbook's *Scoring*
  tab (`tests/scenario-24.test.ts`) and assert every round's score and threshold
  match the spreadsheet within rounding. This is the guard against balance drift.
- **Determinism test:** two runs with the same seed and action list produce
  identical logs.
- **No UI tests** in the prototype beyond "App renders without crashing".

Run with `npm test`. CI is not required; `npm test` must pass before a story is
marked done.

---

## 10. Non-functional requirements

- Loads and starts a run in < 2 s on a laptop (dictionary fetch included).
- Boss round input latency imperceptible; the timer is driven by
  `requestAnimationFrame` in the UI dispatching `BOSS_TICK` with elapsed ms.
- Works in current Chrome/Firefox/Safari desktop. Mobile is not a target.
- No network calls except the two dictionary files.
- Run export is a single JSON file downloadable from EndScreen and DebugPanel.
- No analytics, no accounts, no ads.

---

## 11. Open decisions (to resolve during implementation)

| # | Question | Default until decided |
|---|---|---|
| D1 | Boss fail with a life: retry the same boss, or continue to the next round with the boss counted as lost? | Retry the same boss with a fresh random modifier. |
| D2 | Tiles played into the chain: committed (leave pool) or returned? | Committed (per DESIGN.md proposal). |
| D3 | Loadout tile modifier: one tile of that letter or all copies? | One tile. |
| D4 | Boss feed when the word's letters are exhausted: cycle, or stop? | Cycle, reshuffled. |
| D5 | Front extension on a chained word: extends `headSpan` only. Is Before & After allowed at the front? | Back only in v0.1. |
| D6 | Morpheme multiplier cap? | No cap. |
| D7 | Starter word on the boss board: full word / last N morphemes by boss number | B1 full, B2 last 3, B3 last 2, B4+ last 1 (per DESIGN.md). |
| D8 | Where does the conditional in-run shop slot sit relative to boss rewards in priority? | Shop slot offers Basic/Uncommon only. |

When a decision is made: move it to the Decision Log below, update the affected
section, and update `DESIGN.md` if the product rule changed.

### Decision log

| Date | Decision | Where reflected |
|---|---|---|
| 2026-09-16 | Prototype is browser-based; Vite + React + TS; engine isolated from UI. | §2, §3 |
| 2026-09-16 | ENABLE1 + custom.txt as dictionary. | §8 |
| 2026-09-16 | Reducer-based engine with time as an action. | §5 |
| 2026-09-16 | App lives in `prototype/`; design docs and workbook stay at the repo root. | §3 |
| 2026-09-16 | The first word (round 1) is played with `side: 'start'`, must be ≥ 2 letters and in the dictionary, and counts as one morpheme (so round 1 scores as a 1-morpheme extension, matching the Scoring tab). | §4, §5 |
| 2026-09-16 | Failing a regular round with a life in hand: the extension stays, the streak resets, no shop is offered, play continues at the next round (Pre-Run Modifiers tab proposal). Without a life: SCORED → CONTINUE → GAME_OVER. | §5 |
| 2026-09-16 | D1 implemented as its default: a failed boss with a life is retried (same round, fresh `START_ROUND`). | §5, §11 |
| 2026-09-16 | Rounding: scores and thresholds use half-up rounding (Excel `ROUND`) via `scoring.roundHalfUp`. Effective morphemes never drop below 1. | §7 |
| 2026-09-16 | Morpheme ids are `m:<first tile id>`; tiles are unique per run so this is stable across undo/replay. | §4 |
| 2026-09-16 | `FORFEIT` exists so a stuck player (no valid extension, no cards) can end the round: it discards the round's steps, returns the hand, scores 0 and fails the threshold (life or GAME_OVER). The UI asks for confirmation. | §5, §6 |
| 2026-09-16 | `ROUND_START` has no screen: `ui/store.ts` dispatches `START_ROUND` immediately after any action that lands there, so the log still records the arrow. | §5, §6 |
| 2026-09-16 | In round 1 the start word plus a further step in the same round counts as "2 morphemes, same side" for the extension bonus (the start morpheme is a back morpheme for bonus purposes). | §7 |
| 2026-09-16 | Cards: `content/cards.ts` rows carry `effectId`; `engine/cards/registry.ts` validates every id at startup (store) and in tests. Step effects (extension) live in `cards/extension.ts`, instant ones in `cards/instant.ts` with a per-effect phase table. | §7 |
| 2026-09-16 | Reduplication and Free Morpheme set `tailSpan` to the new letters; Blend takes the longest valid overlap ≥ 2; Hyphen has strain 2 via `params.strain`. Extension cards are back-only (D5 default kept). | §4 |
| 2026-09-16 | Sound-shifted tiles keep their base value (`playedAs` changes the letter). Elision destroys the tile. `chainDirty` gates SUBMIT on head/tail validity. | §4 |
| 2026-09-16 | Redraw is only usable before the first step of a round (otherwise undo snapshots could duplicate tiles). | §4 |
| 2026-09-16 | Shop: 3 slots by rarity odds with fallback to a lower rarity when the pool lacks one; slot 1 forced to an Extension card when none is held (`balance.shop.guaranteeExtension`); per-type hand limits 3/3/3/2; tile action = add or remove only; reroll 2 +1; sell at 50% floored. Loanword/Echo may be used in SHOP. | §5, §7 |
| 2026-09-16 | Insurance adds a fourth round outcome `insured` (no life lost, no shop). Bank doubles `currencyEarned`. Lexicographer sets a round flag the UI reads. Amendment sets `flags.amendmentUsed` until M4. | §5 |
| 2026-09-16 | In-run modifiers: content rows carry `hookId`; `engine/modifiers/registry.ts` implements hook points `morphemeValue`, `multiplierBase`, `extensionBonus`, `strain`, `roundCurrency`, `onNaturalRound`, `bossRules`, `reward`, folded in acquisition order (`state.inRun`). `scoringInputs(state, content)` is the one place the reducer and the screens get modifier-aware scoring inputs. | §7 |
| 2026-09-16 | Scoring with modifiers: word points are summed per morpheme with a per-morpheme multiplier (Suffix/Prefix Bias, Inflection, Vowel Harmony); the multiplier base is `balance + Agglutination + Momentum + Chain Lightning`; Mirror multiplies the front+back bonus. The workbook's flat "in-run multiplier" stays a scenario assumption. | §7 |
| 2026-09-16 | Economy (Economy tab): a passed regular round earns round clear + margin bonus (per 25 %, cap 4) + natural streak (cap 5) + natural word dividend (4+ morphemes, natural chain) + extension payout (+1 per extra morpheme) + Coinage; Bank doubles the total. Boss pass earns the boss clear bonus. Failed rounds earn nothing. `RoundResult.currencySources` lists them. | §5, §7 |
| 2026-09-16 | The natural streak counts rounds with **no extension card**, regardless of strain. | §7 |
| 2026-09-16 | Boss reward: `balance.reward.offers` (3) by `rarityOddsByBoss`, never held, no duplicates; Polyglot → 4 offers / 2 picks; `PICK_MODIFIER {id}` must name an offer. Conditional shop slot: first criterion met (Natural 5+, Double threshold, Front + back, Triple step) → one unheld Basic/Uncommon modifier for `inRunSlotPrice`; `BUY_IN_RUN`. | §5, §7 |
| 2026-09-16 | Secret words: on SUBMIT, a chain whose text is in `content/secretWords.ts` sets `flags.bossJumpPending` and records `secret:<word>` in `state.achievements`; the next `START_ROUND` moves `round` to the next multiple of `bossEvery`. | §5 |
| 2026-09-16 | Boss board: `balance.boss.gridSize` (15) square; starter centred on the middle row per D7 (`starterMorphemes`, 0 = whole chain); a starter longer than the board keeps its last `size` letters. | §4, §5 |
| 2026-09-16 | Placement rules: one line, contiguous through existing tiles, must touch an existing tile, every formed word (main + perpendicular runs ≥ 2) in the dictionary; a lone tile's main word is its longer run; Long Words Only applies to the main word; points = Σ tile values over all formed words (Vowel Tax zeroes vowels). | §5 |
| 2026-09-16 | Feed: shuffled copies of the chain tiles, reshuffled per cycle (D4); starting rack from the queue; overflow drops the oldest tile (newest under the M5 Overflow hook; ends the round under Overload). Y Not applies to feed tiles only. Boss modifier rolled at `START_ROUND`, resolved at `START_BOSS`; Amendment rerolls to a different one. | §5 |
| 2026-09-16 | The UI ticks the engine every `balance.boss.tickMs` (100 ms) of rAF-accumulated time, so a 90 s boss adds ~900 log entries; the clock pauses when the tab is not painting (rAF). | §6, §10 |
| 2026-09-16 | Balance retune: hand size 10 (was 7) and round-1 threshold 4 (was 6) so an unmodified run nearly always reaches B1 (4 / 6 / 9 / 20). Workbook Scoring tab C6 and new row 13 updated; scenario fixture regenerated (all 24 rounds still pass). | §7 |
| 2026-09-16 | New pre-run *Risk* category "Steep Curve" (thresholds ×1.15 … ×1.75, grants +1 … +4 loadout points) tracked in `balance.preRun.steepCurve` and the Pre-Run Modifiers tab; wired to `threshold()` in M7 (P7-07). | §7 |
| 2026-09-16 | RoundScreen shows live candidate words for front/back with a ✓/✗ dictionary hint before the step is played; the engine still validates on `PLAY_STEP` and rejected steps show red with the attempted word. | §6 |

---

## 12. Change log

| Date | Version | Change |
|---|---|---|
| 2026-09-16 | 0.1 | Initial spec drafted from DESIGN.md rev 3 and Morpheme_Master.xlsx. |
| 2026-09-16 | 0.7 | M5 landed. §5: `BUY_IN_RUN`, reward picks, boss jump. §7: hook points and economy rules. Decision log: modifiers, economy, streak rule, rewards, secret words. |
| 2026-09-16 | 0.6 | M4 landed. §5: boss actions and placement/feed semantics. §6: BossIntroScreen and BossScreen exist; the 1 s transition; BOSS_REWARD still a stub until M5. Decision log: board, placement, feed, ticking. |
| 2026-09-16 | 0.5 | Balance retune (hand 10, T1 = 4) and the Steep Curve risk modifier recorded; DESIGN.md rev 4. |
| 2026-09-16 | 0.4 | M3 landed. §4: extension-card and Sound Shift chain semantics (dirty-chain rule). §5: USE_CARD and shop actions; undo snapshots. §7: card registry. Decision log: eight card/shop entries. |
| 2026-09-16 | 0.3 | M2 landed. §5: `FORFEIT` action. §6: Start/Round/Score/Shop/End screens exist; boss phases use a stub screen until M4; ScoreScreen also serves BOSS_END. Decision log: forfeit, ROUND_START auto-advance, round-1 bonus rule, candidate-word hints. |
| 2026-09-16 | 0.2 | M0/M1 landed. §3: `tests/` and `scripts/` live under `prototype/` (they need its toolchain). §5: listed the M1 action set and the log/undo mechanics. Decision log: first-word rule, life-loss flow, D1 default, rounding, morpheme ids. `EngineContent` = `{ balance, dictionary, letters }` is what the reducer receives. |
