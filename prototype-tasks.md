# Morpheme — Prototype Project Plan & User Stories

> **Status:** Living document, v0.1. Companion to `prototype-spec.md`. Agents pick
> stories in milestone order unless told otherwise; each story lists its
> dependencies. Update the **Status** column as work lands and append to the
> Change Log (§5) when stories are added, split, or re-scoped.
>
> **Status values:** `todo` · `in-progress` · `blocked` · `done` · `dropped`
>
> **Definition of Done (every story):** acceptance criteria met · `npm test`
> passes · no engine → UI imports · spec/design updated if a rule was clarified ·
> Change Log entry if scope changed.

---

## 1. Milestone overview

| Milestone | Goal | Playable outcome |
|---|---|---|
| **M0 — Scaffold** | Repo, tooling, theme, dictionary loading | App boots, dictionary loaded, "hello tiles" render. |
| **M1 — Rules engine core** | Tiles, chain, extension validation, scoring, thresholds, run reducer | Engine tests pass for regular rounds; scenario test reproduces the spreadsheet. |
| **M2 — Regular round loop** | RoundScreen, ScoreScreen, quick-start run | Play rounds 1–3 with natural extensions only; lose on threshold. |
| **M3 — Shop & cards** | Shop generation, buying, card effects (initial subset), card panel | Full regular-round loop with Sound Shift and Extension cards; runs survive past round 5. |
| **M4 — Boss round** | Board, rack, feed, timer, placement rules, boss modifiers, intro/reward screens | Full 24-round run playable to win/lose. |
| **M5 — In-run modifiers & economy** | Modifier hooks, boss rewards, conditional shop slot, streak/dividend | Economy and modifier synergies testable. |
| **M6 — Iteration tooling** | DebugPanel, live balance editing, run export, seed replay | Designers can tune and reproduce runs without code changes. |
| **M7 — Meta-progression lite** | Lexicon screen, tile levels, pre-run loadout, achievements, localStorage | Multi-run progression loop testable. |
| **M8 — Playtest & tune** | Playtest rounds, balance passes, content growth | Ongoing; stories are added per playtest. |

Rough sizing is in story points (1 = an hour or two for an agent, 5 = a day).

---

## 2. User stories

### M0 — Scaffold

| ID | Story | Acceptance criteria | Pts | Deps | Status |
|---|---|---|---|---|---|
| P0-01 | As a developer I can run the app locally. | `prototype/` created with Vite + React + TS strict; `npm run dev` serves a page; `npm test` runs Vitest (one passing smoke test); `npm run build` succeeds. | 2 | — | done |
| P0-02 | As a developer I have the folder layout from spec §3. | All directories exist with `index.ts` placeholders; `engine/` has a test asserting no imports from `ui/` or `react` (grep-based). | 1 | P0-01 | done |
| P0-03 | As a player I see the blue/green theme. | `theme.css` with the palette from spec §6; a sample Tile and Card component render using only CSS variables. | 1 | P0-01 | done |
| P0-04 | As the engine I receive a dictionary. | `public/dict/enable1.txt` and empty `custom.txt` added; `ui/store.ts` loads both into a `Dictionary` object; loading state shown; `size` logged. Engine `dictionary.ts` accepts an injected Set. | 2 | P0-02 | done |
| P0-05 | As a developer I have seeded randomness. | `engine/rng.ts` with `create(seed)`, `next()`, `int(n)`, `shuffle(arr)`; state is serializable; test: same seed → same sequence. | 1 | P0-02 | done |

### M1 — Rules engine core

| ID | Story | Acceptance criteria | Pts | Deps | Status |
|---|---|---|---|---|---|
| P1-01 | As a designer all tunables live in `content/balance.ts`. | Object matches the *Scoring* tab parameters plus hand size, round count, boss timings, prices, economy bases (spec §7). Engine functions take `balance` as an argument. | 1 | P0-02 | done |
| P1-02 | As a run I have a tile pool. | `content/tiles.ts` with Scrabble letters/values/counts; `tiles.ts` builds a pool from content + loadout, draws N with the RNG, returns unplayed tiles, commits played tiles (D2). Tests: pool totals 100; draw/return conserve tiles. | 2 | P0-05, P1-01 | done |
| P1-03 | As a player I can build a natural chain. | `chain.ts`: create from first word; `extendNatural(chain, side, tiles, dict)` validates against head/tail span; multi-step helper; morpheme boundaries recorded. Fixture tests: bear→bearable→unbearable; front+back in one round; invalid step rejected with the attempted word. | 5 | P0-04, P1-02 | done |
| P1-04 | As a player I am scored per DESIGN.md §2.7. | `scoring.ts`: word points (tile values + tile modifiers), morpheme multiplier `base^(effM−1)`, strain, extension bonuses, in-run multiplier hook, flat bonuses; `threshold(round, balance)`. Tests for each term. | 3 | P1-03 | done |
| P1-05 | As the spreadsheet I am reproduced by the engine. | `tests/scenario-24.test.ts` drives the *Scoring* tab scenario (word points and boss word points as inputs) and asserts score and threshold per round match the workbook within ±1. | 2 | P1-04 | done |
| P1-06 | As a run I move through phases. | `run.ts` reducer implements ROUND_START → EXTEND → SCORED → SHOP → next round for regular rounds; lives; GAME_OVER; `log` appended per action. Boss phases stubbed as auto-pass. Transition tests for every arrow in spec §5. | 5 | P1-04 | done |
| P1-07 | As a developer I can replay a run. | `export.ts` serializes `{seed, loadout, actions[]}`; `replay(export)` reproduces identical final state. Determinism test. | 2 | P1-06 | done |

### M2 — Regular round loop (UI)

| ID | Story | Acceptance criteria | Pts | Deps | Status |
|---|---|---|---|---|---|
| P2-01 | As a player I can quick-start a run. | Start screen: seed input (random default), Quick Start with default loadout; store creates the run. | 1 | P1-06 | done |
| P2-02 | As a player I can extend the word. | `RoundScreen` per spec §6: chain display with morpheme gaps and span underline; hand; select tiles → add front/back; step list with undo; invalid step shown red with attempted word; blank prompts letter; submit disabled until ≥1 morpheme. | 5 | P2-01, P1-03 | done |
| P2-03 | As a player I see why I scored what I scored. | `ScoreScreen` shows every term in the formula and pass/fail vs threshold; continue. | 2 | P2-02 | done |
| P2-04 | As a player I see a placeholder shop and can continue. | `ShopScreen` stub with currency and Leave button so rounds chain. | 1 | P2-03 | done |
| P2-05 | As a player I can lose and restart. | `EndScreen` on GAME_OVER; restart same seed / new seed. | 1 | P2-04 | done |

### M3 — Shop & cards

| ID | Story | Acceptance criteria | Pts | Deps | Status |
|---|---|---|---|---|---|
| P3-01 | As a designer cards are data. | `content/cards.ts` for the spec §7 subset with `effectId`, `params`, `cueId`; card registry validates every `effectId` exists at startup. | 2 | P1-06 | todo |
| P3-02 | As a player I can buy in the shop. | `shop.ts` builds 3 card slots by rarity odds + 1 tile action + reroll price; BUY/REROLL/SELL/LEAVE actions; currency checks; tests. `ShopScreen` real. | 3 | P3-01, P2-04 | todo |
| P3-03 | As a player I can use Sound Shift cards. | Vowel Shift, Glide, Elision, Metathesis implemented as effects on chain tiles; chain re-validation rules documented (a Sound Shift may make the chain temporarily non-dictionary; the next step must restore validity — record in spec §4). Tests. | 3 | P3-02 | todo |
| P3-04 | As a player I can use Extension cards. | Before & After, Reduplication, Hyphen, Blend, Free Morpheme, Echo per spec §4; strain applied in scoring; streak broken; `natural=false`. Fixture tests for each. | 5 | P3-02, P1-04 | todo |
| P3-05 | As a player I can use Loanword and Utility cards. | Loanword, Redraw, Simplification, Amendment (stub until M4), Lexicographer, Bank, Insurance. Tests. | 3 | P3-02 | todo |
| P3-06 | As a player I see my cards in four quadrants. | `CardPanel` with Sound Shift / Extension / Loanword / Utility quadrants; usable vs blocked state; select-to-arm for next step. | 2 | P3-03 | todo |
| P3-07 | As a player I hear something when I use a card. | `ui/audio.ts` `playCue(cueId)` stub: console log + optional short Web Audio beep keyed by rarity. | 1 | P3-06 | todo |

### M4 — Boss round

| ID | Story | Acceptance criteria | Pts | Deps | Status |
|---|---|---|---|---|---|
| P4-01 | As the engine I have a boss board. | `boss/board.ts`: N×N grid (balance), place starter word centered (D7 rule for which morphemes), cell model. Tests. | 2 | P1-06 | todo |
| P4-02 | As a player my placements follow crossword rules. | `boss/placement.ts`: in-line contiguous, connected to existing tiles, all formed words (main + cross) in dictionary, first word must touch starter; returns formed words and their points. Exhaustive fixture tests. | 5 | P4-01 | todo |
| P4-03 | As a player I get a feed and a rack. | `boss/feed.ts`: queue built from the chain's tiles (modifiers intact), shuffled, cycling (D4); rack with cap; overflow rule; `BOSS_TICK(ms)` advances feed timer and round timer. Tests with simulated ticks. | 3 | P4-01 | todo |
| P4-04 | As a player boss rounds have a negative modifier. | `content/bossModifiers.ts` subset; hooks applied at setup/placement/scoring; Amendment rerolls; tests per modifier. | 3 | P4-03 | todo |
| P4-05 | As a player I can play the boss round. | `BossIntroScreen` and `BossScreen` per spec §6: grid, rack, next-5 queue, timer bar, running score, click-cell + direction + type + Enter placement, word log; rAF drives `BOSS_TICK`. | 5 | P4-02, P4-03, P4-04 | todo |
| P4-06 | As a run the boss outcome is applied. | BOSS_END → pass to BOSS_REWARD (stub picks nothing until M5) or fail → life/GAME_OVER per D1; boss threshold factor; round 24 pass → WIN screen. Transition tests. | 2 | P4-05 | todo |
| P4-07 | As a player I see the tempo change. | Transition screen (simple CSS fade + "BOSS ROUND" text, 1 s); faster placeholder cue. | 1 | P4-05 | todo |

### M5 — In-run modifiers & economy

| ID | Story | Acceptance criteria | Pts | Deps | Status |
|---|---|---|---|---|---|
| P5-01 | As a designer modifiers are hooks. | `engine/modifiers/hooks.ts` defines hook points (spec §7); registry validates `hookId`s; `content/inRunModifiers.ts` subset. Tests: hook ordering deterministic. | 3 | P1-06 | todo |
| P5-02 | As a player I choose a boss reward. | `RewardScreen`: 3 offers (4 with Polyglot), rarity odds by boss number from balance, no duplicates, PICK_MODIFIER. Tests. | 2 | P5-01, P4-06 | todo |
| P5-03 | As a player modifiers change my score. | Suffix/Prefix Bias, Inflection, Vowel Harmony, Momentum, Agglutination, Mirror, Chain Lightning, Etymologist implemented; scenario test extended with one modifier. | 3 | P5-02 | todo |
| P5-04 | As a player I earn currency by the economy rules. | Round clear, margin bonus, natural streak, natural word dividend table, extension bonus payout, boss clear, Coinage; ScoreScreen lists sources. Tests against *Economy* tab values. | 3 | P5-01 | todo |
| P5-05 | As a player I can earn a conditional in-run slot. | Criteria from *Shops* tab (Natural 5+, Double threshold, Front+back, Triple step, Milestone card); slot appears in shop; D8 rarity rule. Tests. | 2 | P5-04, P3-02 | todo |
| P5-06 | As a player I can view my modifiers. | `ModifierPanel` button + overlay listing in-run modifiers by rarity with effect text. | 1 | P5-02 | todo |
| P5-07 | As a player the secret words jump me to the boss. | `content/secretWords.ts`; on submit, if chain text matches → flag → next ROUND_START goes to BOSS_INTRO; achievement recorded. Test. | 1 | P4-06 | todo |

### M6 — Iteration tooling

| ID | Story | Acceptance criteria | Pts | Deps | Status |
|---|---|---|---|---|---|
| P6-01 | As a designer I can edit balance live. | `DebugPanel` (`?debug=1`): form over `balance` object; changes apply to the running engine on next action; reset to defaults. | 3 | P2-01 | todo |
| P6-02 | As a designer I can cheat. | Grant currency/card/modifier, skip to round N, set lives, force boss modifier, reveal state JSON. | 2 | P6-01 | todo |
| P6-03 | As a designer I can export and replay a run. | Export JSON (spec §9 format) from EndScreen and DebugPanel; "Load run" replays it; per-round table (score, threshold, margin, cards used). | 2 | P1-07, P6-01 | todo |
| P6-04 | As a designer I can see the chain's boss letters ahead of time. | Small "next boss feed" readout on RoundScreen. | 1 | P4-03 | todo |
| P6-05 | As a designer I can regenerate content from the workbook (optional). | `scripts/content-from-xlsx.ts` reads `Morpheme_Master.xlsx` tabs into `src/content/*.ts`; diff-friendly output. | 3 | P3-01, P5-01 | todo |

### M7 — Meta-progression lite

| ID | Story | Acceptance criteria | Pts | Deps | Status |
|---|---|---|---|---|---|
| P7-01 | As a player my progress persists. | `MetaState` (Lexicon points, letter levels, pre-run levels, unlocked cards/modifiers, achievements, loadout budget) in localStorage with a version key; reset button. | 2 | P2-05 | todo |
| P7-02 | As a player I earn Lexicon points and achievements. | End-of-run awards per *Achievements* tab subset; EndScreen lists them. Tests for predicates. | 3 | P7-01, P5-07 | todo |
| P7-03 | As a player I spend points on levels. | `LexiconScreen`: letters with level and cost, pre-run categories with level and cost; escalating cost; no skipping; save-able points. | 3 | P7-02 | todo |
| P7-04 | As a player I set a loadout. | Shared budget; tile modifiers by unlocked level (cost = level, D3 rule); pre-run categories at ≤ unlocked level; budget cap; start run applies loadout to pool and rules. Tests. | 3 | P7-03, P1-02 | todo |
| P7-05 | As a player pre-run categories work. | Second Breath, Treasury, Substrate, Tempo levels 1–4 wired to engine. Tests. | 2 | P7-04 | todo |
| P7-06 | As a winner I can enable challenge modifiers. | After first WIN, LexiconScreen shows challenge toggles granting loadout points; 4–5 implemented (Vowel Thief, Tight Clock, No Breath, Steep, Inflation). | 2 | P7-05 | todo |

### M8 — Playtest & tune (rolling)

| ID | Story | Acceptance criteria | Pts | Deps | Status |
|---|---|---|---|---|---|
| P8-01 | Run 5 seeded playtests and record margins per round. | Table added to `Morpheme_Master.xlsx` or a `playtests/` folder; findings summarized in the Change Log. | 2 | M6 | todo |
| P8-02 | Add remaining cards from the *Per Round Cards* tab. | Data + effects + tests, in rarity order. | 5 | M3 | todo |
| P8-03 | Add remaining in-run and boss modifiers. | Data + hooks + tests. | 5 | M5 | todo |
| P8-04 | Tune thresholds/multiplier from playtest data. | `balance.ts` updated; scenario test and workbook updated together. | 2 | P8-01 | todo |

---

## 3. Sequencing notes

- **Critical path:** P0-01 → P0-04 → P1-03 → P1-04 → P1-06 → P2-02 → P3-04 →
  P4-02 → P4-05 → P4-06. Everything else can be parallelized around it.
- M1 is engine-only and should be finished (tests green) before UI work beyond
  M0, so UI never compensates for missing rules.
- The boss round (M4) is the largest risk. If it slips, M5 and M6 can proceed
  against the auto-pass stub from P1-06.
- M7 is deliberately last: gameplay iteration does not need persistence.

---

## 4. Backlog / ideas parking lot

Items not yet turned into stories. Promote by adding a row above with an ID.

- Mouse-only boss placement (drag tiles) — if keyboard entry feels wrong in playtest.
- Undo last boss placement (probably no — it's a timed round).
- Simple bar chart of score vs threshold per round on EndScreen.
- "Suggest a valid extension" helper (Lexicon Hint modifier) — needs a fast
  prefix/suffix search over the dictionary.
- Word-submission flag review UI (production concern).

---

## 5. Change log

| Date | Change |
|---|---|
| 2026-09-16 | v0.1 — initial plan drafted from `prototype-spec.md` v0.1. |
| 2026-09-16 | M2 done (P2-01…P2-05). 138 tests. Added to scope: (1) `FORFEIT` action + "Forfeit round" button — without it a player holding no valid extension had no move at all, so "lose on threshold" was unreachable; scores 0, discards the round's steps, fails. (2) `BossStubScreen` placeholder for BOSS_INTRO/PLAY/END/REWARD so a run can pass round 4 before M4 lands (auto-pass / fail buttons). (3) Export-run-JSON button on EndScreen landed early (part of P6-03). (4) `tests/app.test.tsx` server-renders every screen ("App renders without crashing", spec §9). |
| 2026-09-16 | M0 and M1 done (P0-01…P0-05, P1-01…P1-07). 128 engine tests. Notes: (1) `balance.scoring.bonusThreePlus = 3` comes from DESIGN.md §2.5 — the workbook's Scoring tab has no 3+ bonus parameter; add one to the sheet or drop it from the design. (2) The Scoring tab's "in-run multiplier gained per boss" (0.2) is a scenario assumption, not a game rule, so it lives in `tests/fixtures/scenario-24.json`, not in `balance.ts`. (3) `tests/fixtures/scenario-24.json` is generated from the workbook formulas — regenerate it whenever the Scoring tab changes. (4) Boss stub: `END_BOSS { wordPoints? }` accepts placed-word points as input (omitted = auto-pass at threshold) so later tests can drive the full 24 rounds before M4 lands. |
