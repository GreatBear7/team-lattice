# ResponseWatch plan / 项目计划

- [中文详细计划](plan.zh-CN.md)
- [Detailed English plan](plan.en.md)

Status: proposed four-person implementation plan; this change adds documentation only.
Track: on-campus. Deadline: **2026-10-17 13:00 America/New_York**.
Working name: ResponseWatch. Suggested stack: Python + FastAPI + React/Vite.
Confirm the actual team name, prompt number, and proposed design choices in SPEC before implementation.

## Decisions and proposed defaults

- Confirmed: Health Systems / Emergency Response; four people; self-generated data; on-campus deadline; publish plans on `dev`.
- Proposed: supervisor workflow, one high-priority class, six fictional zones, three CSV scenarios, fixed seed `5300`.
- Primary response metric: unit-notification to on-scene; demo target T=12 minutes; late means R>T.
- Proposed optional allowed late rate q=10%; both thresholds are fictional demonstration settings.
- Baseline: first 14 of 28 days, frozen per zone and priority; monitoring uses settled daily cohorts.
- Core statistics: late proportion, P90 with linear interpolation, and a variable-n p chart.
- p chart: p0=sum(baseline late)/sum(baseline n); CL=p0; limits=clip(p0±3*sqrt(p0*(1-p0)/n),0,1).
- Deterioration rule: p>UCL; insufficient evidence suppresses statistical classification.

## CONTRACT sequence and checks

1. H-01: confirm SPEC; owner all/D coordinates; owns `SPEC.md`; each member explains metric definitions and scope.
2. H-02: A creates `data/`; three reproducible scenarios and codebook; check valid timestamps, shared baseline, and planted signals.
3. H-03: B owns `app/qc.py`, statistical requirements, and `tests/`; known answer p0=.1,n=100,d=20 gives UCL=.19,LCL=.01; also test constants, empty input, n=1, invalid timestamps, and p0=0/1.
4. H-04: C/D split frontend/backend paths before work; API output must match H-03; do not overwrite B's files.
5. H-06: D deploys after the first complete flow; owns deployment files; public URL and numeric smoke check pass.
6. H-05: A/C demonstrate all scenarios in `demo/` and the frontend; another member reproduces displayed numbers.
7. H-07: D assembles root/app READMEs; fresh-clone instructions explain inputs, parameters, limitations, and live access.
8. H-08: D coordinates repository reproducibility and submission; verify successful Devpost submission before the deadline.
9. H-09: this documentation task; bilingual plans, this index, consistency checks, and publication on `dev`.

## Gates and risks

- Targets: statistics 18:30, complete flow 21:30, public deployment 22:30 on 10-16; freeze 11:00, materials 12:00, submit 12:30 on 10-17, all ET.
- Incorrect statistics: independent A/B calculations and known-answer/degenerate tests before UI integration.
- Scope/deployment delay: finish P0, drop extensions, deploy early, preserve submission buffer.
- Circular synthetic validation: analysis cannot access scenario truth; publish generator parameters and test independent fixtures.
