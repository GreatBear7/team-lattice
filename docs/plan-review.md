# Review of the ResponseWatch plan

Suggestions on [`plan.en.md`](plan.en.md) (commit `7205d86`). This is a proposal for the team to
discuss, not a decision. Nothing in `SPEC.md` or `CONTRACT.yaml` changes until we agree.

## Summary

Keep the plan. The statistics, data design and test table are solid. The main risk is
scope: there is too much to finish by **Sat 10-17 12:30 ET**. Cut the scope, keep the stats.

## What to keep as-is

- Notification-to-scene response time R, late means R > T (T = 12 min, demo setting).
- p chart per zone, daily batches with variable n, a frozen 14-day baseline, a weighted p0, and
  flag only when p > UCL.
- "Insufficient evidence" status when n·p0 < 5 or p0 is 0 or 1.
- Stage breakdown (call handling / turnout / travel) to answer "why", with no extra logging.
- Three seeded scenarios, and `scenario_truth.json` never read by the analysis.
- The test table in section 6, A/B cross-checks, and early deployment.

## Suggested change 1: shrink the must-have core

**Must-have (build first, deploy by 22:30):**

1. `data/generate_data.py` + three CSVs + codebook (H-02)
2. `app/qc.py` + tests: late rate, P90, p chart, validity status (H-03)
3. Load a scenario or upload a CSV, then show the zone summary table (n, late rate, P90, flag) (H-04)
4. p chart per zone, with out-of-control points marked (H-04)
5. Zone detail: stage breakdown for the flagged zone (H-04)
6. Public URL on Posit Connect (H-06)

**Only if the must-haves are deployed by ~02:00:**

- A simple "add one incident" form (the cheapest nod to "real-time logging" in the prompt)
- Replay with a virtual clock, incident editing (`PATCH`), live overdue timers
- Follow-up log, schematic zone map

**Drop:** everything in P2.

Why: the rubric scores a working tool (25), valid analysis (25), the demo (10) and docs (25).
All of it is covered by items 1-6. Replay and live state add the most integration risk and
earn the least.

## Suggested change 2: compare floats with a tolerance in tests

In Python, the known-answer case gives a lower limit that is not exactly 0.01:

```text
p0 = 0.10, n = 100
UCL = 0.19                    (19/100 > UCL -> False, 20/100 > UCL -> True; as planned)
LCL = 0.009999999999999995    (not 0.01)
```

Use `pytest.approx` for limits. Keep the strict `p > UCL` rule, but test the boundary case
(d = 19) explicitly, as the plan already does.

## Suggested change 3 (optional): fewer rows per dataset

At 100 incidents per zone per day, each CSV has about 16,800 rows (a few MB in git). With 50 per
day, baseline p0 around 0.10 gives n·p0 = 5, which is right at the plan's own cutoff. So either:

- keep 100 per day (safe for the n·p0 ≥ 5 check), or
- use 50 per day and confirm the realized baseline p0 keeps n·p0 ≥ 5 in every zone.

Recommendation: keep 100 unless file size causes problems.

## Next step

Agree on the scope above, then fill in `SPEC.md` (H-01) together and start H-02 / H-03 in parallel.
