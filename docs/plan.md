# ResponseWatch plan / 项目计划

- [中文详细计划](plan.zh-CN.md)
- [Detailed English plan](plan.en.md)
- [Team review / 组员评审](plan-review.md), commit `609bed9`
- [Time-of-day proposal / 时段提案](time-of-day-proposal.md), commit `b1b86b5`

Status: revised documentation-only plan incorporating the team's review and time-of-day proposal.
Track: on-campus. Deadline: **2026-10-17 13:00 America/New_York**.
Working name: ResponseWatch. Suggested stack: Python + FastAPI + React/Vite.
Confirm the actual team name, prompt number, and final choices in SPEC before implementation.

## Scope and shared defaults

- Six required items: seeded data/codebook; tested statistics; scenario/CSV loading and zone table; per-zone p charts; timing-stage and pooled time-band detail; public Posit Connect deployment.
- Optional only after deployed-core validation, reached no later than **2026-10-17 02:00 ET**: completed-incident form first; replay/editing/timers later; follow-up/map last.
- No optional feature may block core deployment or its demo; drop all former P2 items from this submission.
- Confirmed: Emergency Response; four people; self-generated data; on-campus deadline; publish on `dev`.
- Keep six fictional zones, 28 days, 14 frozen baseline days, seed `5300`, **100 incidents/zone/day**, and approximately **16,800 rows/CSV**; verify realized sample adequacy.
- Primary metric: unit-notification to on-scene; T=12 minutes; late means R>T. Optional q=10%; both thresholds are demo settings.
- Statistics: late proportion, linear-interpolated P90, primary daily variable-n p chart, and pooled baseline-vs-monitoring time-band comparison.
- Derive bands from local unit-notification time: [00,06), [06,10), [10,16), [16,20), [20,24); exclusive baseline end `2026-09-28T00:00:00-04:00`.
- Add `late_rate_by_band(df, T, baseline_end)`; same limit formula with frozen p0_band and monitoring n_band. Return insufficient evidence for empty/degenerate/sparse groups; no daily band charts.
- Generator: normalize published hourly weights (sum 25.6); normal routine travel ×1.3 during [07,09) and [16,19), present in the baseline too.
- Band counts are unequal (approximately 164/273/394/394/175 per monitoring zone); keep all-day injection by default and verify any evening-focused variant before using it.
- Existing detail endpoint adds `time_of_day`; paired bars show baseline/monitoring rates and UCL. Explain 30 unadjusted exploratory comparisons; risk adjustment stays gated optional.
- p0=sum(baseline late)/sum(baseline n); CL=p0; limits=clip(p0±3*sqrt(p0*(1-p0)/n),0,1).
- Deterioration rule remains strict **p>UCL**; suppress classification with insufficient evidence.
- Numeric tests use **pytest.approx**, suggested rel=1e-12/abs=1e-12; test d=19/20 booleans separately. No tolerance in the alert rule.

## CONTRACT sequence and checks

1. H-01: all confirm SPEC; D coordinates; owns `SPEC.md`; explain definitions and reduced core.
2. H-02: A owns `data/`; three reproducible CSVs/codebook; verify timestamps, hourly weights/rush, baseline, planted changes, and realized band adequacy.
3. H-03: B owns `app/qc.py`, statistical requirements, `tests/`; p0=.1,n=100,d=20 gives UCL≈.19,LCL≈.01; test daily d=19/20, band n=400/p0=.2 (UCL≈.26,LCL≈.14,d=104/108), tolerance, empty/sparse groups, timezones, and boundaries.
4. H-04: C owns table/daily charts/stage and time-band detail; D owns disjoint backend paths and four core endpoints; API/UI match H-03, with no live-state dependency.
5. H-06: D deploys the core early; owns deployment files; public access and numeric smoke check pass.
6. H-05: A/C demonstrate all three static scenarios in `demo/` and frontend; another member reproduces results without optional features.
7. H-07: D assembles READMEs explaining inputs, limits, reproducibility, and live access.
8. H-08: D coordinates fresh-clone checks and Devpost submission.
9. H-09: bilingual documentation and index, resolves review `609bed9` and proposal `b1b86b5`; implementation tasks remain separate.

## Gates and risks

- 10-16 ET targets: statistics 18:30; core flow 21:30; public core deployment 22:30; peer review 23:30.
- 10-17 ET: optional eligibility by 02:00; freeze 11:00; materials 12:00; submit 12:30. If core is not stable by 02:00, cancel all options.
- First optional form is timeboxed to 30–45 minutes; proceed only with safe core deployment. Passed milestones become immediate checkpoints, not delayed deadlines.
- Risks: incorrect statistics → independent A/B checks; scope → six-item core; circular validation → keep scenario truth away from analysis and test independent fixtures.
