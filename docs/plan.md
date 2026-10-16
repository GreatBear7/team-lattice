# ResponseWatch plan / 项目计划

- [中文详细计划](plan.zh-CN.md)
- [Detailed English plan](plan.en.md)
- [Team review / 组员评审](plan-review.md), commit `609bed9`

Status: revised documentation-only plan incorporating the team's review.
Track: on-campus. Deadline: **2026-10-17 13:00 America/New_York**.
Working name: ResponseWatch. Suggested stack: Python + FastAPI + React/Vite.
Confirm the actual team name, prompt number, and final choices in SPEC before implementation.

## Scope and shared defaults

- Six required items: seeded data/codebook; tested statistics; scenario/CSV loading and zone table; per-zone p charts; timing-stage detail; public Posit Connect deployment.
- Optional only after deployed-core validation, reached no later than **2026-10-17 02:00 ET**: completed-incident form first; replay/editing/timers later; follow-up/map last.
- No optional feature may block core deployment or its demo; drop all former P2 items from this submission.
- Confirmed: Emergency Response; four people; self-generated data; on-campus deadline; publish on `dev`.
- Keep six fictional zones, 28 days, 14 frozen baseline days, seed `5300`, **100 incidents/zone/day**, and approximately **16,800 rows/CSV**; verify realized sample adequacy.
- Primary metric: unit-notification to on-scene; T=12 minutes; late means R>T. Optional q=10%; both thresholds are demo settings.
- Statistics: late proportion, P90 with linear interpolation, variable-n p chart on settled daily cohorts.
- p0=sum(baseline late)/sum(baseline n); CL=p0; limits=clip(p0±3*sqrt(p0*(1-p0)/n),0,1).
- Deterioration rule remains strict **p>UCL**; suppress classification with insufficient evidence.
- Numeric tests use **pytest.approx**, suggested rel=1e-12/abs=1e-12; test d=19/20 booleans separately. No tolerance in the alert rule.

## CONTRACT sequence and checks

1. H-01: all confirm SPEC; D coordinates; owns `SPEC.md`; explain definitions and reduced core.
2. H-02: A owns `data/`; three reproducible CSVs/codebook; verify timestamps, baseline, planted changes, and realized adequacy.
3. H-03: B owns `app/qc.py`, statistical requirements, `tests/`; p0=.1,n=100,d=20 gives UCL≈.19,LCL≈.01; test numeric tolerance, d=19 boundary, constants, empty/n=1, invalid inputs, p0=0/1.
4. H-04: C owns frontend table/p charts/stage detail; D owns disjoint backend paths and four core endpoints; API/UI match H-03, with no live-state dependency.
5. H-06: D deploys the core early; owns deployment files; public access and numeric smoke check pass.
6. H-05: A/C demonstrate all three static scenarios in `demo/` and frontend; another member reproduces results without optional features.
7. H-07: D assembles READMEs explaining inputs, limits, reproducibility, and live access.
8. H-08: D coordinates fresh-clone checks and Devpost submission.
9. H-09: bilingual documentation and index, reopened to resolve review `609bed9`; implementation tasks remain separate.

## Gates and risks

- 10-16 ET targets: statistics 18:30; core flow 21:30; public core deployment 22:30; peer review 23:30.
- 10-17 ET: optional eligibility by 02:00; freeze 11:00; materials 12:00; submit 12:30. If core is not stable by 02:00, cancel all options.
- First optional form is timeboxed to 30–45 minutes; proceed only with safe core deployment. Passed milestones become immediate checkpoints, not delayed deadlines.
- Risks: incorrect statistics → independent A/B checks; scope → six-item core; circular validation → keep scenario truth away from analysis and test independent fixtures.
