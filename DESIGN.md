# Morpheme — Game Design Document

> **Status:** Early brainstorm, revision 5 (rev 5: loadout budget grows per boss beaten; rev 4: hand size 10, round-1 threshold 4, Steep Curve). This document is the narrative design;
> the companion workbook **`Morpheme_Master.xlsx`** is the master list of values
> (tiles, cards, modifiers, economy, scoring scenarios, achievements). When the two
> disagree, the spreadsheet wins for values and this document wins for rules.
>
> Ideas marked **[proposal]** go beyond the agreed concept and are open for discussion.
>
> **Open decisions** live in the workbook's *Decisions* tab; the first entry is a
> re-evaluation of Sound Shift cards (see §7 item 9).
>
> **Terminology:** rarity tiers are **Basic / Uncommon / Exotic / Relic**. Money is
> just **Currency** for now.
>
> **Document map:** `DESIGN.md` (product requirements, this file) →
> `prototype-spec.md` (how the browser prototype implements it) →
> `prototype-tasks.md` (milestones and user stories) →
> `production-architecture.md` (template for the eventual Steam/mobile/Switch build).
> `Morpheme_Master.xlsx` holds all values.

---

## 1. Concept

**Morpheme** is a roguelike word-building game inspired by polysynthetic languages —
languages where a single word is assembled from many meaningful pieces and can say
what English needs a whole sentence to say.

Each run, the player grows one word, one morpheme at a time, across 24 rounds.
Every regular round the word must get longer by at least one morpheme and must
remain a real English word — `bear` → `bearable` → `unbearable`. Every 4th round the
game changes gear: a fast-paced, timer-driven **Boss Round** where the player plays
quick Scrabble-style words using only the letters of the word they have built.

Scoring is Scrabble-like (each tile has a base value) multiplied by an exponential
morpheme-count multiplier, plus cards, in-run modifiers, and permanent tile upgrades
that carry across runs.

### Design pillars

1. **One word, 24 rounds.** The word is the run. Its growth is the story of the run.
2. **Always extend.** Every regular round adds at least one morpheme. Cards exist to
   make that possible when the dictionary won't cooperate — at a cost.
3. **Two tempos.** Regular rounds are unlimited-time strategy; Boss Rounds are
   timed skill tests. The letters you commit to in the slow rounds are the letters
   you fight with in the fast ones.
4. **Language as the theme, not just the skin.** Cards and modifiers are framed
   around real linguistic ideas: sound shifts, loanwords, blends, reduplication.

### Differentiation from Balatro

- The core object is a single growing word, not a series of independent hands.
- Timed Boss Rounds add a skill/speed element that deck-builders normally avoid.
- In-run modifiers are Hades-style boons chosen after each boss, not shop purchases.
- Meta-progression is tile levels + a loadout budget, not decks and stakes.
- Rarity names, currency, and round structure are original.

---

## 2. Gameplay

### 2.1 Run structure

A run is **24 rounds**: 18 regular rounds and 6 Boss Rounds.

```
R1  R2  R3  [B1]  R5  R6  R7  [B2]  R9  R10 R11 [B3]  R13 R14 R15 [B4]  R17 R18 R19 [B5]  R21 R22 R23 [B6 — final]
```

- **Regular round:** extend the word by ≥1 morpheme, beat the score threshold, shop.
- **Boss Round:** timed Scrabble-style round using the word's letters, beat a higher
  threshold, choose an in-run modifier as the reward.
- Thresholds rise every round. Failing one costs a life (if the loadout has any)
  or ends the run. Beating B6 wins the run.

### 2.2 Core loop

```
Lexicon screen: spend points, set loadout (§6)
  └─ Regular round
       ├─ draw a hand from the tile pool
       ├─ extend the word: play tiles to the front and/or back
       │    (must be a dictionary word; or use an Extension card — §2.5)
       ├─ score = word points × morpheme multiplier × modifiers  (§2.7)
       ├─ beat threshold? → shop (§2.8)
       └─ every 4th round → Boss Round (§2.6)
            ├─ optionally apply round cards before starting
            ├─ timed word play with the letters of the current word
            ├─ beat threshold? → choose 1 of 3–4 in-run modifiers (§5)
            └─ the word is unchanged; regular rounds resume from it
```

### 2.3 The tile pool and hand

- The player draws from **one tile pool per run**. The starting composition is the
  standard Scrabble distribution (100 tiles including 2 blanks), adjusted by the
  loadout and by Loanword cards during the run.
- Each round the player draws a **hand** (default 10; raised from 7 so early
  rounds nearly always offer a natural extension) and may play tiles from it.
- **[proposal] Tiles played into the word are committed** — they leave the pool for
  the rest of the run and live in the word. The pool is therefore a finite resource
  that Loanword cards replenish. (Alternative: played tiles return to the pool;
  see §7.)
- Unplayed tiles return to the pool at the end of the round unless a modifier says
  otherwise.

### 2.4 Tiles: base value and level

- **Base value** — Scrabble values (E = 1, Q = 10, blank = 0), fixed per letter.
  Not tiered or named.
- **Level (0–4)** — a per-letter upgrade track bought with Lexicon points between
  runs (§6.2). A letter's level gates **which tile modifiers may be chosen for it**
  in a loadout. Levels cannot be skipped. Modifier lists are in §4 and the
  workbook's *Tiles* tab.

Rarity tiers apply to cards and in-run modifiers, not to tiles.

### 2.5 Regular rounds: extending the word

**The rule:** each regular round the word must grow by **at least one morpheme**,
and the result must be a word in the in-game dictionary.

- A **morpheme**, for game purposes, is whatever contiguous group of letters the
  player adds to one side of the word in one step. The game does not check
  linguistic morpheme boundaries; it checks the dictionary.
- Letters may be added to the **front**, the **back**, or both.
- A round may contain **multiple steps** as long as every intermediate word is in
  the dictionary: `sing` → `singer` → `singers` in one round is two morphemes.

**Extension bonuses** — extending by more than the minimum is rewarded:

| Extension in one round | Bonus |
|------------------------|-------|
| 1 morpheme (front or back) | none — this is the baseline |
| 2 morphemes, same side | ×1.5 that round **[values are proposals]** |
| 1 front + 1 back | ×2 that round |
| 3+ morphemes | ×3 that round |

**Sound Shift cards** change letters already in the word (a chosen vowel → another
vowel, a vowel → Y, delete a letter, swap two letters). They exist so that
extensions requiring a spelling change become legal: `happy` + Vowel Shift (Y → I)
→ `happiness`.

#### Extension cards: keeping a run alive

Real English words run out of affixes quickly. **Extension cards** let the player
keep growing the *morpheme count* without the whole string being a dictionary word.
The word becomes a **chain**: a sequence of overlapping real words.

**Before & After** (the archetype — with the Wheel of Fortune sting as its sound cue):
pick the word's tail morpheme and use it as the start of a new dictionary word.

```
Round 4:   [un][bear][able]                 3 morphemes — "unbearable"
Round 5:   [un][bear][able][ism]            4 morphemes — B&A: "able" → "ableism"
Round 6:   [un][bear][able][ism][s]         5 morphemes — natural extension of "ableism"
```

All existing morphemes stay and keep counting toward the multiplier — that is the
entire point of the card. After a chain step, natural extensions apply to the
**active word** (the tail word, or the head word for front extensions).

Other extension cards (see §3.1 and the *Per Round Cards* tab):

| Card | How it extends | Rarity |
|------|----------------|--------|
| Before & After | Tail morpheme starts a new word. | Basic |
| Reduplication | Repeat the tail morpheme as a new morpheme (`bye` → `bye-bye`). | Basic |
| Hyphen | Append any dictionary word as a new morpheme, no overlap required. Larger strain. | Basic |
| Blend | The new word overlaps the tail *letters* (not a whole morpheme): `lymphatic` + `ticket` → `lymphaticket`. | Uncommon |
| Rhyme | Append a morpheme that rhymes with the tail morpheme. | Uncommon |
| Anagram | Rearrange the tail morpheme's letters into a new word, then extend it. | Uncommon |
| Backformation | Remove the tail morpheme, then add two. Net +1, resets a dead end. | Uncommon |
| Infix | Insert a whole dictionary word between two existing morphemes. | Exotic |
| Homophone | Respell the tail morpheme as a homophone, then extend it. | Exotic |
| Free Morpheme | Add any letters as a morpheme with no dictionary check. | Exotic |
| Echo | Copy another held card. Keeps Before & After in rotation. | Uncommon |

**Strain** — the cost of using an extension card. **[proposal]** When an extension
card is used:

- That round's morpheme multiplier is computed **as if the word had one fewer
  morpheme** (the morpheme still counts from the next round on).
- The **natural streak** (§3.4) breaks, which costs economy.
- The word is no longer *natural* for the purposes of the natural-word dividend.

Extension cards should be **common and cheap** so runs can always continue;
strain and the abstention achievements (§6.1) reward players who need them least.

### 2.6 Boss Rounds

Every 4th round the game switches to a **timed, Scrabble-style mode**, announced
with a fast-paced transition animation and a faster soundtrack.

**Setup**

- The **board** starts with a **starter word** placed in the middle.
  **[proposal]** B1 places the player's full current word; later bosses place only
  its last few morphemes (B2: last 3, B3: last 2, B4+: last 1) — so the starter is
  long in early bosses and short in late ones, and it is always the player's own
  letters.
- The **tile feed** is built from the **letters of the player's current word**
  (i.e. everything played in the previous regular rounds), with their tile
  modifiers intact. The player can therefore plan boss words in advance by choosing
  what to commit to the word.
- The player begins with a **small rack** (e.g. 3 tiles) and sees the **upcoming
  letters** in a queue, Tetris-style.
- Before starting, the player may apply **round cards** from their hand (e.g. a
  Sound Shift on a rack tile, Amendment to reroll the boss modifier).
- A **random negative boss modifier** is revealed (see §3.6 and the *Boss Round
  Modifiers* tab). It can be rerolled with an Amendment card or certain modifiers.

**Play**

- New tiles arrive on the rack at a fixed interval that speeds up in later bosses.
- The player must place words that **connect to a word already on the board**,
  standard crossword rules. No polysynthetic requirement — any dictionary word.
- **[proposal]** If the rack overflows (e.g. 7 tiles unplayed when the next
  arrives), the oldest tile is lost. If the overall **timer** (e.g. 90 s) expires,
  the round ends.
- Each placed word scores tile values × the player's current morpheme multiplier ×
  in-run modifiers. The sum must beat the boss threshold.

**Reward**

- Beating the boss: pick **1 of 3–4 random in-run modifiers** (Hades-boon style),
  plus a currency bonus.
- The word is unchanged; regular rounds resume extending it.

**Why this works:** it adds a skill/speed axis that separates Morpheme from pure
strategy deck-builders, and it makes the *letters* of the word matter, not just its
score — a word full of Q's and Z's is a boss-round liability.

#### Easter egg: the Polysynthetic jump **[proposal]**

If the player's word ever becomes `polysynthetic`, `polysynthesis`, or a small
set of other secret words (`morpheme`, `agglutinative`, `sesquipedalian`), the game
**immediately jumps to the next Boss Round**, skipping remaining regular rounds.
This is a trap as much as a reward — arriving early with fewer cards and modifiers
is dangerous — so the first discovery is a surprise and later runs can plan around it.
Each secret word is an achievement.

### 2.7 Scoring (conceptual)

```
regular round score = (sum of tile values in the whole word/chain)
                      × morpheme multiplier
                      × extension bonus (if >1 morpheme added)
                      × in-run modifier multipliers
                      + flat bonuses

boss round score    = Σ over words placed: (sum of tile values)
                      × morpheme multiplier
                      × in-run modifier multipliers
```

- **Morpheme multiplier** = `base ^ (morphemes − 1)`, exponential. Illustrative
  base 1.4: 3 morphemes → ×1.96, 10 → ×20.7, 19 → ×426. The workbook's *Scoring*
  tab has the base and threshold growth as editable parameters and a full
  24-round scenario.
- **Strain** lowers the effective morpheme count by 1 for that round.
- Thresholds follow a geometric curve with a boss bump; see the *Scoring* tab.
  **Tuning intent:** an unmodified run (no loadout, no cards) should almost
  always reach the first Boss Round; the round-1 threshold starts at 4
  (4 / 6 / 9 / 20 for rounds 1–4). Difficulty for experienced players comes
  from the opt-in **Steep Curve** risk modifier (§6.4), not the base curve.

### 2.8 Shops

After **every regular round** the player enters the shop:

- **Cards** — several random per-round cards priced by rarity.
- **Tile pool actions** — add a tile of a chosen letter, remove a tile, apply a
  run-time modifier to a tile.
- **Reroll** the card offer for a rising fee.
- **Conditional in-run modifier slot** **[proposal]** — if the round met a
  *criterion* (a natural word of 5+ morphemes, beating the threshold by 2×, a
  front + back extension, or a criterion set up by a Milestone card), the shop
  offers one in-run modifier for purchase.

Details in the *Shops* tab.

### 2.9 Run end

- **Loss:** failing a threshold with no lives left. Lexicon points and achievements
  are still awarded for distance reached.
- **Win:** beating B6. Unlocks challenge modifiers (§6.4) and higher rewards.

---

## 3. Features

### 3.1 Per-round cards
Cards in four types — **Sound Shift**, **Extension**, **Loanword**, **Utility** —
each with a rarity tier and a duration: most affect *this round only*; some change
a tile or the pool *for the rest of the run*. Bought in shops. Full list in the
*Per Round Cards* tab.

### 3.2 In-run modifiers
Persistent-for-the-run passive effects chosen after each Boss Round (1 of 3–4
offered), with the same four rarity tiers. Designed with synergies. One Relic
modifier lets the player choose 2 after every boss. Viewed in their own panel.
Full list in the *In-Run Modifiers* tab.

### 3.3 Pre-run modifiers
Chosen on the Lexicon screen from a shared loadout budget, persistent for the run.
Positive categories (lives, economy, hand size, shop, boss tempo, ...) each with
4 levels. After the first win, **challenge modifiers** become available: they make
runs harder and grant extra loadout points to spend on positives. See §6.

### 3.4 Economy
Currency is earned per round and spent in shops. Scaling sources include:
margin over threshold, the **natural streak** (consecutive rounds extended without
an extension card), the **natural word dividend** (bonus for a fully-real word of
4+ morphemes, growing with each morpheme), tile modifiers (Gilded, Trade), in-run
modifiers that pay out for morpheme types or tile patterns, and boss clear
bonuses. Full breakdown in the *Economy* tab.

### 3.5 Dictionary
All words are validated against an **in-game English dictionary** built from an
open word list. Admins can add words; players can submit words for review.
Dictionary source selection is an open question (§7).

### 3.6 Boss round modifiers
Each Boss Round draws one random negative modifier that changes the timed mode:
all vowels become Y (tile modifiers retained), all words must be 4+ letters, rack
size reduced, feed faster, upcoming letters hidden, and so on. Rerollable with the
Amendment card or certain pre-run/in-run modifiers. Full list in the *Boss Round
Modifiers* tab.

### 3.7 Audio
- **Every card and modifier has its own sound cue**, played whenever it appears in
  a shop or is used. Before & After uses the Wheel of Fortune "doo doo doo-doo"
  sting; other cues should be similarly recognizable and thematic.
- Regular rounds have a calm soundtrack; Boss Rounds switch to a faster track with
  the transition animation.

### 3.8 UI panels **[proposal]**
- **Card panel** — a persistent side panel divided into **four quadrants**, one per
  card type, listing held cards, their duration, and whether they are usable this
  round (greyed if blocked by a boss modifier).
- **In-run modifier panel** — a separate button/panel that opens the list of
  modifiers collected this run, grouped by rarity, with synergy highlights.
- **Boss preview** — during regular rounds, a small readout of the letters that
  will feed the next boss (i.e. the current word's letters), so the player can plan.

---

## 4. Tile Modifiers

Per-tile properties. Two ways to get them:

1. **Loadout modifiers** — chosen at run start; a letter's Level gates the options;
   cost in loadout points = the modifier's level (1–4).
2. **Run-time modifiers** — added during a run by cards or shop purchases.

Representative options by level (full list and effects in the *Tiles* tab):

| Level | Cost | Examples |
|-------|------|----------|
| 1 | 1 | +1 value · Gilded (currency while in word) · Anchored (×2 at head/tail) · Weighted (drawn more often) |
| 2 | 2 | +2 value · Vowel Wild · Trade (refund if unplayed) · Harmonic (×1.5 next to same value) · Sticky (stays in hand) |
| 3 | 3 | +3 value · Compounding (+1 per round in word) · Mutable (shift ±1 letter) · Silent (scores, ignored for validity) · Fragile (×3, breaks) · Boss Ready (arrives first in boss feed) |
| 4 | 4 | Wild · Stressed (+0.5× multiplier) · Tonal (×2 morpheme) · Heavy (2× base) · Cursed (×2, must play) · Volatile (0–3× random) · Twin (copies itself into pool) |

Rules: one loadout modifier per letter (see §7 on one tile vs. all copies);
run-time modifiers can stack to a per-tile slot limit; some pairs are exclusive.

---

## 5. In-Run Modifiers

Chosen after each Boss Round; persistent for the run; four rarity tiers; built for
synergy. Categories: **Scoring**, **Extension**, **Economy**, **Boss**, **Pool**.
Representative examples (full list in the *In-Run Modifiers* tab):

| Modifier | Rarity | Effect |
|----------|--------|--------|
| Suffix Bias | Basic | The tail morpheme scores ×2. |
| Coinage | Basic | +1 currency per morpheme in the word each round. |
| Rack Extension | Basic | Boss rack size +2. |
| Vowel Harmony | Uncommon | If every vowel in the new morpheme already appears in the word, that morpheme scores ×2. |
| Momentum | Uncommon | Each natural extension round adds a permanent +0.05 to the multiplier base. |
| Etymologist | Uncommon | The first extension card each boss cycle causes no strain. |
| Agglutination | Exotic | Multiplier base +0.1. |
| Mirror | Exotic | Front + back extension bonus is doubled. |
| Chain Lightning | Relic | Extension cards grant +0.1× instead of strain. |
| Polyglot | Relic | Choose 2 in-run modifiers after each Boss Round. |

---

## 6. Progression Mechanics

### 6.1 Achievements
Checked automatically at the end of each run. They **unlock cards and in-run
modifiers** (permanently added to the pools), **grant Lexicon points**, **grow the
loadout budget**, and after a win **unlock challenge modifiers**. Abstention
achievements (win without lives, without extension cards, without Level 4 letters,
on base economy) and easter eggs (secret words) are included. Full list in the
*Achievements* tab.

### 6.2 The Lexicon screen (between runs)
1. Cards and modifiers **unlock** from the previous run's achievements.
2. **Lexicon points** are awarded for distance reached plus achievement bonuses.
3. The **loadout budget** grows per boss beaten (§6.3) and if achievement
   milestones were hit.
4. Points are spent on **tile levels** and **pre-run modifier levels**; each
   successive level costs more (illustrative 2 / 4 / 7 / 11). Points may be
   saved, but levels can't be skipped, so saving only buys several at once.
5. The player sets the **loadout** and starts the run.

### 6.3 Loadout budget
- A shared pool of **loadout points** spent on tile modifiers (cost = level) and
  pre-run modifier categories (cost = activated level; a category may be run below
  its unlocked level).
- The budget starts at 4 and grows two ways: **per boss beaten** — each boss
  beaten in a run adds +1 while the budget is below that boss's cap (B1 → 6,
  B2 → 8, B3 → 10, B4 → 12, B5 → 14, B6 → 16), so progress is steady but a
  player who cannot pass B3 tops out at 10 — and through **achievements**, up
  to the hard cap of 20. **[proposal]** the number of modified letters is
  capped (e.g. 8) so choices stay strategic.

### 6.4 Pre-run modifiers
- **Positive categories** (each Level 1–4, bought with Lexicon points): Second
  Breath (lives), Treasury (economy), Substrate (hand size), Bazaar (shop),
  Tempo (boss timer/feed), Insight (boss preview/reroll), Reserve (starting
  cards/currency), Clemency (reduced strain). Details in the *Pre-Run Modifiers*
  tab.
- **Risk modifiers** (available from the start): opt-in handicaps that raise the
  scoring thresholds and **grant extra loadout points** for that run. The first
  is **Steep Curve** — Level 1: all thresholds ×1.15 for +1 loadout point;
  **[proposal]** Levels 2–4: ×1.3 / ×1.5 / ×1.75 for +2 / +3 / +4. It costs no
  loadout points itself. Details in the *Pre-Run Modifiers* tab.
- **Challenge modifiers** (unlocked after the first win): opt-in handicaps —
  vowels worth 0, shorter boss timer, no lives, hidden boss queue, etc. — each
  **grants extra loadout points** for that run. Some are descendants of the old
  Grammarian rules. **[proposal]** The *Steep* challenge (+25% thresholds) is
  superseded by Steep Curve. Details in the same tab.

### 6.5 Progression flow

```
Run ends → achievements → unlocks + Lexicon points + budget growth
Lexicon screen → spend/save points → set loadout (positives + challenges)
Start run → pool = Scrabble set + loadout tile modifiers; pre-run modifiers active
```

---

## 7. Open Questions

1. **Dictionary source** — which open English word list (size, inclusion of
   plurals/inflections, proper nouns excluded), and how the admin/submission
   review flow works.
2. **Committed vs. returned tiles** — do played tiles leave the pool (proposal) or
   return? Affects Loanword card value and hand pressure.
3. **Multiplier tuning** — exponent base, whether it caps, and strain size.
4. **Boss timing** — total timer, feed interval, rack size, overflow rule, and how
   each scales across B1–B6.
5. **Starter word rule for bosses** — the player's full word vs. its last N
   morphemes vs. a system word.
6. **Loadout tile modifiers: one tile or all copies of the letter?**
7. **In-run modifier offer size** — 3 or 4, and whether rarity odds shift by boss.
8. **Extension card frequency** — how common in shops, and whether the shop
   guarantees at least one.
9. **Sound Shift cards** — a shift that makes the word invalid must be repaired by
   the next step, but back-only extension cannot repair a broken *head* word and a
   Before & After moves the tail elsewhere, so many shifts strand the run. Options
   are logged in the *Decisions* tab (validate only touched words and allow front
   repairs; preview-and-reject invalid shifts; shifts apply to the next step's
   tiles; require immediate validity).

---

## 8. Abandoned Ideas

Kept for reference; not part of the current design.

- **Parse Tree board** — a branching run map with a Grammarian boss every 4th
  round, player-chosen paths to steer toward or away from bosses, path-specific
  rewards, and a Cartography pre-run category to reveal the map. Dropped in favor
  of a fixed 24-round sequence with timed Boss Rounds.
- **Grammarians as rule-bosses** — bosses defined by a static rule (The Purist:
  no Loanword cards; The Vowel Thief: vowels score 0; The Censor: a banned letter;
  The Minimalist / Maximalist: morpheme length limits; The Auditor; The
  Archivist). Superseded by the timed boss mode; some rules survive as boss round
  modifiers or challenge modifiers.
- **Constraint rounds every 3rd round** — earlier version of the boss cadence.
- **Extend / Pivot / Abandon** — a model where pivoting dropped earlier morphemes
  (keeping only the tail) and abandoning reset the word. Replaced by mandatory
  extension every round, with extension cards growing a chain instead of
  replacing it.
- **Spelling Reform / Partial Reform / Calque cards** — replacement cards from
  the pivot model.
- **Shop only after continuity** — shop access gated on keeping a morpheme from
  the previous round. Moot now that every round extends.
- **Tile rarity tiers** — tiles grouped as Unmarked / Marked / Exotic / Relic with
  tiered base values. Replaced by Scrabble base values + tile levels.
- **Rarity naming schemes** — Vernacular / Literary, Native / Borrowed,
  Colloquial / Formal, Modern / Archaic. Settled on Basic / Uncommon / Exotic / Relic.
- **Currency names** — Ink, Breath, Syllables, Glyphs. Using "Currency" for now.
- **Grammar cards as shop purchases** — run-wide passive scoring rules bought in
  the shop. Folded into in-run modifiers earned from bosses.
- **Wager pre-run category** — a risk category among the positive pre-run
  modifiers. Its idea lives on as challenge modifiers.
