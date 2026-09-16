# Morpheme — Production Architecture (Template)

> **Status:** Working template, v0.1 — deliberately short. This will grow as the
> prototype settles the gameplay. Nothing here is final; every section has a
> **Decision needed** line where one is pending. Keep the Decision Log (§9)
> current.
>
> **Relationship to the prototype:** the prototype (`prototype-spec.md`) exists to
> find the fun. Production is a rebuild, not an evolution of the prototype's code —
> except for the **rules test fixtures**, which carry over as conformance tests (§5).

---

## 1. Product targets (v1)

| Platform | Priority | Notes |
|---|---|---|
| Steam (Windows, macOS, Linux) | Primary launch | Keyboard/mouse + controller. Steam Deck verified is a goal. |
| iOS / Android | Second wave | Touch-first layout; the boss round needs a touch-native placement model. |
| Nintendo Switch | Third wave | Requires Nintendo developer program approval and an engine with a supported Switch export path. |

Single-player, offline-first. No account required to play. Cloud save and
leaderboards are optional v1.x features.

**Decision needed:** confirm launch order and whether mobile ships simultaneously
with Steam.

---

## 2. Engine and language

Candidates, evaluated on: all three platform targets, 2D/UI strength, timer/input
precision for the boss round, team familiarity, licensing.

| Option | Pros | Cons |
|---|---|---|
| **Godot 4 (C# or GDScript)** | Open source, strong 2D/UI, free, fast iteration, C# gives a typed rules core. | Switch export is via third-party partners (e.g. W4 Games), not first-party. Mobile C# support still maturing. |
| **Unity (C#)** | First-party Switch/mobile/Steam support, mature UI toolkit, huge ecosystem. | Licensing/runtime-fee history; heavier; editor-centric. |
| **Custom (TypeScript/web wrapped, e.g. Electron/Capacitor)** | Reuses prototype knowledge directly. | No Switch path; poor fit for console requirements; performance ceiling on mobile. |

**Working recommendation:** Godot 4 with C# for the rules core and GDScript or C#
for presentation, *unless* Switch is confirmed as a must-have for v1, in which case
Unity's first-party support tips the balance. Decide after the prototype
stabilizes and before any production code.

**Decision needed:** engine; language for the rules core; whether the rules core
is a separate assembly/package.

---

## 3. High-level architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Presentation (engine scenes/UI, input, audio, animation)      │
├──────────────────────────────────────────────────────────────┤
│ Application (run controller, screens/flow, save/load, options)│
├──────────────────────────────────────────────────────────────┤
│ Rules Core (pure: tiles, chain, scoring, cards, modifiers,    │
│             boss placement, run state machine) — no engine    │
│             types, no I/O, deterministic with a seed          │
├──────────────────────────────────────────────────────────────┤
│ Content (data: balance, cards, modifiers, achievements,       │
│          dictionary) — generated from the design workbook     │
└──────────────────────────────────────────────────────────────┘
        ▲ optional services: cloud save · leaderboards · telemetry · word submissions
```

Principles carried from the prototype:

- **Rules Core is pure and deterministic.** Time, input, randomness enter as data.
- **Content is data, not code.** A content pipeline regenerates it from
  `Morpheme_Master.xlsx` (or its successor) so design keeps ownership of numbers.
- **Presentation is replaceable.** Desktop, touch, and controller front-ends share
  the Application and Rules layers.

---

## 4. Content and dictionary

- **Content pipeline:** spreadsheet/CSV → validated JSON → engine resources at
  build time. Validation fails the build on unknown effect/hook IDs.
- **Dictionary:** must be redistributable commercially. ENABLE1 (public domain)
  is the default; evaluate SCOWL (permissive) for broader coverage. Collins/TWL are
  licensed and likely out. Shipped as a compressed trie or sorted array with a
  bloom filter for fast lookup on mobile.
- **Word submissions:** in-game "flag a word" → optional backend queue → admin
  review → included in the next content update. Offline players still get the
  base dictionary.
- **Localization:** UI strings externalized from day one; gameplay is English-only
  in v1 (the dictionary *is* the game).

**Decision needed:** dictionary source and licensing sign-off; whether the
submission backend exists at launch.

---

## 5. Conformance testing (what carries over from the prototype)

The prototype's `tests/fixtures/*.json` (state + action → expected result) are
language-agnostic. The production Rules Core must pass the same fixtures via a
small adapter. Add to that:

- The 24-round scenario test tied to the workbook.
- Determinism: same seed + same action list → identical run log, on every platform.
- Boss placement rule suite.

This is the single most important guard against the rebuild drifting from the
tested design.

---

## 6. Platform requirements (placeholders)

| Area | Steam | Mobile | Switch |
|---|---|---|---|
| Input | KB/M + controller; Steam Input | Touch; external controller optional | Joy-Con/Pro; touch in handheld |
| Save | Local + Steam Cloud | Local + iCloud/Google | Local (console save data rules) |
| Achievements | Steam achievements mapped from in-game | Game Center / Play Games | Nintendo (if supported) |
| Performance | 60 fps at 1080p on integrated GPU | 60 fps on mid-range devices from ~2020 | 60 fps docked and handheld |
| Certification | Steamworks review | App Store / Play review | Nintendo lotcheck |
| Audio | Engine-native; evaluate FMOD if the per-card cue library grows large | same | same |

---

## 7. Services (all optional for v1)

| Service | Purpose | Notes |
|---|---|---|
| Cloud save | Cross-device progression | Platform-native first; own backend only if cross-platform sync is required. |
| Leaderboards / daily seed | Community retention | Daily seeded run is cheap given deterministic runs. |
| Telemetry | Balance data (per-round margins, card usage, boss fail rates) | Opt-in; anonymized; mirrors the prototype's run export format. |
| Word submission queue | Dictionary growth | Tiny HTTP service + admin page. |
| Crash reporting | Stability | Engine/platform-native. |

---

## 8. Team, tooling, and process (placeholders)

- Source control: Git; monorepo with `rules-core/`, `game/`, `content/`, `tools/`.
- CI: build all targets on PR; run conformance fixtures; content validation.
- Design tooling: the workbook remains the balance master; a content-diff report
  runs on every regeneration.
- Spec-driven development continues: `production-spec.md` (to be created) will
  play the role `prototype-spec.md` plays today.

---

## 9. Decision log

| Date | Decision | Status |
|---|---|---|
| 2026-09-16 | Production is a rebuild; rules fixtures are the carry-over. | Agreed |
| 2026-09-16 | Rules Core is pure/deterministic and separate from presentation. | Agreed |
| — | Engine choice (Godot vs Unity). | Open — after prototype stabilizes |
| — | Launch platform order. | Open |
| — | Dictionary licensing. | Open |

## 10. Change log

| Date | Change |
|---|---|
| 2026-09-16 | v0.1 — initial template. |
