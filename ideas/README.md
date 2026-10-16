# Ideas: what-if simulator and detection study (not for merge)

Prototype work by Saptarshi (B) for the team, mainly for **Kaushik (A, data)** to think about data
generation. Nothing here is part of the tool or the graded core. Final_Plan stays the plan until the
team agrees on any change.

Needs: Kaushik's `data/generate_data.py` (branch `h02-data`) and `app/qc.py` (PR #1, branch
`h03-stats`). This branch copies neither; pass their locations on the command line.

## 1. What-if simulator (`sim.py` + `index.html`)

A local web page: pick zones, time bands, days (15-28 only, so the baseline is never touched), the
share of calls affected and the extra travel minutes, press Run. It generates 16,800 incidents with
Kaushik's generator, runs `app/qc.py`, and shows the zone table, daily p charts and time-band chart.

```bash
# from a checkout that has both data/generate_data.py and app/qc.py
uv run --no-project --with pandas --with numpy --with matplotlib \
  python ideas/sim.py data/generate_data.py .            # then open http://127.0.0.1:8765
uv run --no-project --with pandas --with numpy --with matplotlib \
  python ideas/sim.py data/generate_data.py . --selfcheck data   # reproduces the three CSVs
```

**Self-check:** with the presets hidden_tail / recovery / no change it reproduces `hidden_tail.csv`,
`recovery.csv` and `normal.csv` **byte for byte**, so it is exactly Kaushik's model. It reuses the
generator's own injection stream (U < p, then lo + (hi - lo)·U2), so p = 0.25 and 6-12 min give his
draws.

How: `base_draws()` once, add our increments to `travel` for the chosen zone/day/hour rows, then
`build_scenario(draws, [])`. If the generator exposed `generate(zones, bands, days, prob, lo, hi,
seed)` itself, the simulator could be a thin wrapper.

## 2. Does an average chart catch what the p chart catches? (`compare50.py`)

Same data, 50 seeds, three views. "Days caught" = share of changed days flagged (mean over seeds);
"ever" = share of seeds with at least one flagged changed day. X-bar = daily mean R per zone, limits
from the frozen 14-day baseline, sigma-hat = S-bar / c4(n).

| Scenario (only the named zone changes) | p chart: days / ever | Daily X-bar: days / ever | Citywide mean change |
|---|---|---|---|
| hidden_tail: C, 25% of calls +6-12 min, days 18-28 | 99% / 100% | 100% / 100% | +3.3% |
| Rare & severe: C, 5% +20-30 min | **6% / 54%** | **65% / 100%** | +1.9% |
| Near threshold: C, 30% +3-5 min | 58% / 100% | 66% / 100% | +1.8% |
| Evening rush only: E, 50% +6-12 min, days 20-28 | 25% / 88% | 64% / 100% | +1.6% |
| Small: D, 10% +1-3 min | 1% / 10% | 2% / 18% | +0.3% |
| False alarms, no change (share of zone-days) | 0.21% | 0.33% | - |

```bash
uv run --no-project --with pandas --with numpy --with matplotlib \
  python ideas/compare50.py ideas data/generate_data.py . 50
```

Takeaways:
- The **monthly citywide average** (what the prompt says the 911 center uses) moves only 0.3-3.3%:
  it hides every scenario. This claim is safe for the demo.
- A **per-zone daily X-bar** catches as much as or more than the p chart; the gap is largest for
  **rare but severe** delays (the prompt's "fatal outliers"), because the p chart counts a 40-min call
  the same as a 13-min one.
- Proposal (needs team agreement): keep the p chart as the main flag, add X-bar + S per zone as a
  "severity" view in zone detail, after the core is deployed. Do not claim "averages don't work";
  claim "the monthly citywide average hides it; per-zone control charts catch it".

## 3. Data-generation ideas for Kaushik

1. **Parameterized generator.** `generate(zones, bands, start_day, end_day, prob, lo, hi, seed)`
   returning a DataFrame, with the three CSVs as calls of it. Same seed = same data; baseline days
   never changed; reject zones outside A-F and start days before 15. Makes the simulator (or a
   post-02:00 "custom scenario" option in `POST /datasets/load`) trivial.
2. **Dispatcher scenario.** Today only travel ever gets worse, so nothing about dispatch can flag,
   although the prompt says "help manage dispatchers". Idea: call handling ~1 min -> 3-5 min on ~30% of
   calls, days 20-28, late evening, citywide (dispatch is centralized). Expected: the main R chart does
   not move (R starts at unit_notified_at), the total wait does, and a p chart on call handling
   (share > 2 min) would flag it. Frame it as shift/staffing, never as ranking a dispatcher.
3. **Severity scenario.** "Rare & severe" (5% of calls +20-30 min) shows the p chart's blind spot;
   worth having as a demo case if the team adds the X-bar view.
4. **Delay reason code (codebook, no code).** The data says when, not why. Recommend one extra
   field crews log with one tap, e.g. `delay_reason` = traffic / no unit available / address problem /
   access / other. Put it in `data/README.md` as "what we would collect next": it answers the prompt's
   "why" and its data-collection preamble ("define exactly what proxy variables field workers ... need
   to log").
5. **Keep the chance flag.** normal.csv's zone C evening-rush band flag is an expected chance flag (30
   unadjusted comparisons); document it, do not reseed to hide it.
