
## 2026-09-16 — full content pool (`2026-09-17-tuned1-fullcontent.md`)

Same bot and balance as tuning pass 1, after P8-02 / P8-03 added the remaining
cards (39) and modifiers (34 in-run, 21 boss).

| Wins / 10 | 4 |
|---|---|
| Tightest round ratio in wins | 0.54 – 2.00 |
| Losses | B3 ×2 (0.72, 0.75), B4 (0.09), B6 ×2 (0.13, 0.73), round 5 stuck |

Findings: with 34 in-run modifiers the bot no longer collects every scoring
modifier by B6, so the snowball is gone and later bosses (×3 factor) decide
runs. The bot does not use any of the new cards' abilities (it only knows the
original extension cards), so this is again a floor. Human playtests should
now focus on whether B4–B6 feel fair with deliberate reward picks.

## 2026-09-18 — threshold growth by block (`2026-09-18-curve2.md`)

Growth 1.5 / 2 / 2.5 / 3 / 3.5 / 5 per round by block of four. Bot: 0/10 wins,
runs end at rounds 8–12 (B2 at 0.31–0.96×, B3 at 0.13×). Gentler tables
(1.5/1.75/2/2.25/2.5/3 and 1.5/1.75/1.75/2/2/2.5) also stop the bot at B3.
The bot uses no card synergies, so treat these as floors; the decision is
logged in the workbook's Decisions tab.
