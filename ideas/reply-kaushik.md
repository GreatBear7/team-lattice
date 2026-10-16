# Reply to section 4 (evening_tail.csv) — Kaushik (A, data)

Short version: **yes to a rare-and-severe scenario, with two changes.** Move zone D's delay to
**morning rush**, and drop **`hidden_tail.csv`** instead of `recovery.csv`. I implement it on
`h02-data` as soon as B, C and D agree.

## 1. Why I'm in favour

You're right that with the current files every view catches zone C, so the demo can't show what
the time-band view and the slowest list are for. A few-but-severe delay also matches the prompt's
"fatal outliers" directly. I reproduced your evening-rush numbers exactly on seed 5300 (79 of 302
calls hit; D daily flags 1; D evening_rush 0.316 vs UCL 0.246), so the implementation note works
as written.

## 2. Change 1: put zone D's delay in morning rush, not evening rush

In both `normal.csv` and your `evening_tail.csv`, **zone C's evening_rush band has a chance flag**
(0.183 vs UCL 0.175). With D's real delay also in evening rush, the demo shows two red
"Evening rush" bars, one real and one chance. That is hard to explain in a two-minute demo.

Same settings (zone D, days 18-28, 25% of calls, +15-25 travel minutes), seed 5300, via
`ideas/sim.py` + `app/qc.py`:

| D's delay in | Calls hit | D daily p chart | D's band: p_band vs UCL | Other flagged bands | D five slowest (min) |
|---|---|---|---|---|---|
| evening_rush (your proposal) | 79 / 302 | 1 day | 0.316 vs 0.246 | C evening_rush (chance) | 41.7, 41.4, 41.1, 41.0, 39.6 |
| **morning_rush** | 64 / 225 | 0 days | **0.371 vs 0.249** | C evening_rush (chance) | 41.6, 40.7, 40.6, 37.0, 35.6 |
| late_evening | 34 / 143 | 0 days | 0.257 vs 0.173 | C evening_rush (chance) | 41.1, 38.7, 38.4, 35.0, 33.6 |

Morning rush gives the clearest margin over its UCL and keeps the real flag in a different band
from the chance one. No other zone gets daily flags in any version. These are one seed only:
could you run `scan.py` for morning_rush over 50 seeds to confirm the detection rate?

## 3. Change 2: keep recovery, drop hidden_tail

`recovery.csv` already tells the whole zone C story: it breaks on Oct 1, is flagged on 6
consecutive days (Oct 1-6), and is back in control from Oct 7. That answers the manager's next
question, "we fixed it; did it work?", which fits "flag zones in need of resolution".
`hidden_tail.csv` adds nothing statistically beyond that; it's the same fault without the fix.

| File | Story | What catches it |
|---|---|---|
| `normal.csv` | nothing wrong | nothing flags (no false daily alarms) |
| `recovery.csv` | zone C, all day, many calls a bit slower, then fixed | daily p chart: Oct 1-6 red, then back in control |
| `evening_tail.csv` → `morning_tail.csv` | zone D, morning rush, a few calls much slower | time-band view and the slowest list; daily p chart misses it |

Caveat to say in the demo: in `recovery.csv` zone C's time-band bars stay red because they pool
the whole monitoring period; the daily chart is the one that shows recovery (already in
Final_Plan 5.4).

**Knock-on:** your integration tests switch from hidden_tail (11 flagged days) to recovery
(6 flagged days, Oct 1-6) and add D / morning_rush; `zone_C_analysis.mock.json` stays valid if
it's regenerated from recovery; the demo script and Final_Plan section 4 name the new files.

## 4. Separate point, not part of this decision: "why"

Both planted faults would still be **travel**, so the stage breakdown always answers "travel".
The prompt also asks *why* delays happen and to help manage dispatchers. A call-handling or
turnout fault would let the tool show it can tell causes apart. I'm not proposing it for tonight
(it needs the stage view in the UI first), but I'd like it on the list after deploy, together
with your dispatcher scenario (section 3.2).

## Next step

Reply in the chat with yes / no / changes. On a yes I will: add the scenario to
`data/generate_data.py`, regenerate, update `scenario_truth.json` and the codebook, re-check
byte-identical baselines, and push to `h02-data` within about 30 minutes.
