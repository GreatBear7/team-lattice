# ResponseWatch: Four-Person Implementation Plan

[中文版](plan.zh-CN.md) · [Plan index](plan.md) · [Team review](plan-review.md)

- Prepared: 2026-10-16. All scheduling uses New York time (ET).
- Team: four people, temporarily labeled A/B/C/D; the team can assign actual names.
- Track: on-campus; submission deadline: **2026-10-17 13:00 ET**.
- Revision basis: `docs/plan-review.md` from team commit `609bed9`; this revision adopts the reduced scope, float-tolerance guidance, and retained dataset size.
- Status: a proposed plan for execution and adjustment. ResponseWatch is a working name and Python/FastAPI/React is the recommended stack. This commit contains planning documents only; neither the application nor datasets have been implemented.

## 1. Prompt, User, and Product Goal

**Selected prompt: Health Systems / Emergency Response.**

> Ambulance dispatch to on-scene times are varying wildly across city zones, but the 911 center only looks at monthly averages, missing fatal outliers, not where or why these failures occur. Design a statistical tool to help manage dispatchers, response time logging in real-time, generate analyzes, and flag zones that are in need of resolution.

The primary user is the **on-duty supervisor at a 911 dispatch center**. The core tool identifies zones for investigation, locates the delayed process stage, and compares normal, deteriorated, and recovery scenarios.

Required flow: **load a scenario or CSV → inspect the zone summary and control chart → drill into timing stages → explain the signal and limitations.** Outputs describe response delays and statistical signals. Without patient outcome data, an overdue response is not labeled a death, and the prototype does not claim a mortality reduction.

Following the review, prioritize verified analysis and a working public deployment. Adding one incident, live replay, and dispatcher follow-up are gated optional features. If live functionality is not implemented, describe the demonstration as statistical monitoring of imported logs, without claiming a real 911 integration or complete live dispatch coverage.

## 2. Reduced MVP and Optional-Feature Gate

| Priority | Feature | Acceptance criterion |
|---|---|---|
| P0 | Synthetic generator, three CSVs, and codebook (H-02) | Reproduce the data with a fixed seed and document fields and scenarios |
| P0 | Plain statistical functions and tests (H-03) | Late rate, P90, p chart, and validity status pass known-answer and edge-case tests |
| P0 | Scenario selection or CSV upload and zone summary table (H-04) | Show n, late rate, P90, and flag/insufficient-evidence status; invalid input reports row numbers and reasons |
| P0 | p chart for each zone (H-04) | Show the frozen baseline, limits reflecting n, and marked limit violations |
| P0 | Timing stages in zone detail (H-04) | Inspect call handling/assignment, turnout, and travel for a flagged zone without extra manual logging |
| P0 | Public Posit Connect deployment (H-06) | Open while logged out and verify displayed numbers against backend tests |
| Optional 1 | Simple form to add one completed incident | Consider only after core deployment acceptance; refresh summaries without editing, a live state machine, or timers |
| Optional 2 | Virtual-clock replay, incident editing, live overdue timers | Evaluate only with a stable deployed core and sufficient time; independent of core acceptance |
| Optional 3 | Follow-up log and six-zone schematic | Lowest priority; excluded from the default demo and completion criteria |

**Finish and verify the six P0 items first, targeting public deployment by 10-16 22:30.** Optional work is allowed only after deployment, three-scenario checks, and statistical validation pass, with that gate reached no later than **10-17 02:00 ET**. This is a latest eligibility checkpoint, not a requirement to stay up or wait until 02:00. Try the cheapest completed-incident form first, timeboxed to 30–45 minutes, and revert if it risks regressions. If the core is not stable by 02:00, cancel all optional work and use the remaining time for deployment, fixes, and documentation.

Remove the former P2 items—real maps, allocation simulation, prediction, LLM explanations, and real-system integration—from this submission. Preserve statistical validation, data documentation, reproducibility, and submission buffer. Individual dispatcher performance rankings are outside the prototype.

## 3. Data Schema and Timing Definitions

**One row represents one incident and its single responding unit.** All MVP synthetic incidents use one high-priority class. Multiple responding vehicles, cancellations, and priority changes are outside this version. Timestamps use ISO 8601 with a timezone offset. Group by the unit-notification date in America/New_York, and report durations in minutes.

| Field | Type/example | Purpose |
|---|---|---|
| `incident_id` | Unique string | Deduplication and incident lookup |
| `zone_id` | `A`–`F` | Zone grouping |
| `priority` | `high` | Priority filtering and target configuration |
| `call_received_at` | Timestamp with offset | Call receipt |
| `unit_notified_at` | Timestamp with offset | Unit notification; start of the primary response metric |
| `unit_en_route_at` | Timestamp with offset | Unit departure |
| `on_scene_at` | Timestamp with offset | Arrival; required for core historical imports |
| `dispatcher_id` | Fictional string | Assignment information, not automatic attribution of blame |
| `unit_id` | Fictional string | Identifier of the single responding vehicle |

Definitions:

- Call handling and assignment wait = `unit_notified_at - call_received_at`.
- Turnout = `unit_en_route_at - unit_notified_at`.
- Travel = `on_scene_at - unit_en_route_at`.
- **Primary response time R = `on_scene_at - unit_notified_at` = turnout + travel.**
- Total call-to-scene wait = `on_scene_at - call_received_at`, displayed as a separately named descriptive metric.

The primary service threshold is **T = 12 minutes**. A response is late when **R > T**; exactly 12 minutes is not late. This is a synthetic demonstration setting, not a clinical or national standard. Configure targets by priority. A threshold change requires recomputing historical baselines and all late-response metrics.

The core accepts completed historical records with all four timestamps. Validate unique IDs, required fields, valid zones, timezone information, and chronological order; never silently replace missing values with zero. The optional single-incident form initially accepts completed records too. Introduce unfinished incidents and currently visible states only if optional replay is actually pursued.

## 4. Synthetic Data Generation

**All three CSVs are fictional and use seed `5300`.** Use no real patients, real dispatcher identities, or external traffic data. Model six fictional city zones A–F over **2026-09-14 through 2026-10-11, or 28 days**. The default is 100 incidents per zone per day, approximately **16,800 rows per dataset**.

**Adopt the review recommendation to keep 100 incidents per zone per day.** Do not reduce to 50 by default: with p0 around 0.10, 50 observations sit exactly at n·p0=5, and a slightly lower realized baseline can fail the approximation check. Even with 100, check each zone's estimated p0, `n_i*p0`, and `n_i*(1-p0)` and return insufficient evidence when required. Only revisit the row count if file size actually becomes a problem, with A/B jointly revalidating the result.

The first 14 days, 09-14 through 09-27, form the stable baseline; the next 14 days are monitored. Reuse the same baseline and underlying random draws across scenarios for comparison. Do not continually re-estimate the baseline as monitoring incidents arrive.

| File | Generation rule | Intended demonstration |
|---|---|---|
| `data/normal.csv` | Stable processes in all six zones, positive response durations with a right tail, and separately generated turnout and travel components | Ordinary variation without an intentionally planted deterioration; random samples are not guaranteed to have zero false alarms |
| `data/hidden_tail.csv` | Starting on day 18, add 6–12 minutes of travel time to approximately 25% of zone C incidents; preserve original draws elsewhere | Zone C's late rate and P90 rise, with some control-chart signals; citywide averages may still obscure the local problem |
| `data/recovery.csv` | Reuse that deterioration, then remove zone C's extra delay starting on day 24, leaving a recovery observation period | Show deterioration followed by recovery; this is a simulated scenario, not evidence of a real intervention effect |

Generate unit-notification times and assignments first, followed by positive turnout and travel durations. Obtain on-scene times by addition and call-received times by subtracting a positive call-handling/assignment interval. Capped lognormal mixtures may represent routine and slower incidents. Publish all parameters in the generator, then check observed late rates and batch sizes against the planned statistical method.

Use these directly implementable initial settings, all in minutes. `clip` caps a value at the given bounds. For the lognormal distribution, median means the median and sigma means the standard deviation on the log scale:

| Parameter | Initial setting |
|---|---|
| Call handling and assignment wait | `clip(LogNormal(median=1.0, sigma=0.35), 0.2, 4.0)` |
| Turnout | `clip(LogNormal(median=1.2, sigma=0.25), 0.3, 4.0)` |
| Routine travel | `clip(LogNormal(median=6.0, sigma=0.25), 2.0, 10.0)` |
| Ordinary tail | Independently add `Uniform(6,12)` travel minutes with 10% probability per incident |
| Additional deterioration | During the specified zone C period, independently add another `Uniform(6,12)` travel minutes with 25% probability per incident |

Use `log(median)` for the lognormal mean parameter in common libraries, rather than passing the median as the log mean. Ordinary tails and deterioration may overlap. Pre-generate injection masks and increments with a separate random stream so switching scenarios does not alter unaffected zones' original draws. These are demonstration assumptions, not empirical findings about real EMS duration distributions.

Also deliver:

- `data/generate_data.py`: a fixed seed, explicit parameters, and one-command reproduction of all three CSVs; turn component durations into consistent timestamps.
- `data/README.md`: a codebook covering every column, units, generation rules, limitations, and the CAD/EMS fields needed for real collection.
- `data/scenario_truth.json`: scenario names, seed, dates, affected zones, and injection rules for testing and demonstration only. **The statistical functions must not read this file or scenario names to decide which observations are abnormal.**

Use a separate exact fixture to illustrate equal means and different tails: zone A has ten 8-minute responses; zone B has eight 5-minute responses and two 20-minute responses. Both means equal 8 minutes, but late rates at T=12 are 0% and 20%. Do not claim the larger randomly generated datasets have exactly identical means.

Data acceptance requires three files, a complete codebook, seed reproducibility, valid historical ordering, identical baseline periods, and agreement between injection rules and realized scenarios. Cover sparse samples and invalid inputs primarily in unit tests, rather than adding a fourth demonstration CSV.

## 5. Statistical Design and Limitations

Implement and verify plain Python functions before connecting them to the API and interface. Keep all statistics in `app/qc.py`; the frontend only presents results.

### 5.1 Descriptive Metrics

For valid completed records, calculate sample size, mean, late count, late rate, P90, and component durations. The late rate is `d/n`. Define P90 using linear interpolation: after sorting, set `h=(n-1)*0.90` and interpolate between its adjacent positions. Document this convention so tests and the interface agree.

Core control charts use **fully settled unit-notification-date cohorts**, and all incidents in the three historical CSVs are complete. If optional replay is added, separate ongoing incidents and known overdue notifications, mark unsettled dates as pending, and never replace a full cohort with its completed subset. A virtual clock must expose only currently visible timestamps, without future information. These live-state requirements are not prerequisites for completing the core.

### 5.2 p Control Chart: Detecting Deterioration

Stratify by zone and priority, using a daily batch. Estimate `p0 = total baseline late incidents / total valid baseline incidents` within that stratum from the preselected stable period. This is a weighted proportion, not an unweighted average of daily percentages. Use each monitoring batch's own size `n_i`:

```text
p_i = d_i / n_i
CL = p0
UCL_i = min(1, p0 + 3 * sqrt(p0 * (1 - p0) / n_i))
LCL_i = max(0, p0 - 3 * sqrt(p0 * (1 - p0) / n_i))
```

The MVP uses one deterioration rule: **p_i > UCL_i**. Equality does not trigger that rule. A point below LCL may indicate an improvement signal, but does not establish a proven improvement. Control limits and the service-time threshold T are different concepts.

Assumptions include approximately independent incidents, a stable baseline within each stratum, and a binomial proportion model. The usual 3-sigma limits are an approximation. If `n_i*p0 < 5`, `n_i*(1-p0) < 5`, the baseline is insufficient, or `p0` equals 0 or 1, show insufficient evidence for the control chart rather than applying the formula and declaring normality. Baseline adequacy and dependence require review. Overdispersion, common traffic shocks, and simultaneous monitoring of many zones require recalibration in real use. A limit violation does not establish a cause.

### 5.3 Service Targets and Interpretation

Display deterioration relative to historical performance separately from failure to meet a configured service target. For a demonstration of chronic underperformance, optionally configure an allowed late rate **q = 10%**. Label a batch with `p_i > q` as above the demonstration service target; this label does not claim statistical significance. q is also a fictional setting. A stable but consistently poor zone should remain visible.

Component charts identify the delayed stage. Longer travel times may suggest checking coverage, routes, or traffic evidence; without additional data they do not establish congestion, staff fault, or a vehicle shortage. P90 is descriptive and must be marked unstable for small samples. Cp/Cpk and risk prediction are not part of the MVP.

## 6. Required Statistical Tests

| Test | Input | Expected result |
|---|---|---|
| Known proportion | `p0=0.10, n=100, d=20` | CL≈0.10, UCL≈0.19, LCL≈0.01, p≈0.20, deterioration flag true; compare numeric values with tolerance |
| Limit boundary | Same setup, but `d=19` | p=0.19; no flag under the strict greater-than rule; assert the boolean separately |
| Tail fixture | `[5,5,5,5,5,5,5,5,20,20]`, T=12 | Mean≈8, P90≈20, late rate≈0.20 |
| Unequal baseline sizes | Batches with 1/10 and 18/90 late responses | Weighted p0≈19/100=0.19, not the unweighted average 0.15 |
| Timing components | Call 12:00, notification 12:02, departure 12:04, arrival 12:12, same timezone | Assignment wait 2, turnout 2, travel 8, primary response 10, total wait 12 minutes |
| Degenerate/invalid inputs | Empty data, n=1, constants, missing values, duplicate IDs, reversed timestamps, invalid timezone, p0=0 or 1 | Explicit status or validation error; historical imports reject missing timestamps without silent zero imputation or misleading infinities |
| Planted signal | Fixed-seed deterioration and recovery scenarios | Verify the injection and record actual flagged batches; do not promise detection of every deterioration |

**Use `pytest.approx` for floating-point values; keep the alert rule strictly `p > UCL`.** The known Python example may return an LCL of `0.009999999999999995`, so do not validate it with `== 0.01`. Do not round calculations to satisfy tests or add a tolerance to the alert rule. Use `rel=1e-12, abs=1e-12` for numeric assertions and exact assertions for booleans. The following illustrates tests to implement, not an existing test suite:

```python
assert result["ucl"] == pytest.approx(0.19, rel=1e-12, abs=1e-12)
assert result["lcl"] == pytest.approx(0.01, rel=1e-12, abs=1e-12)
assert result["p"] == pytest.approx(0.20, rel=1e-12, abs=1e-12)
assert result["flag"] is True  # d=20
assert boundary_result["flag"] is False  # d=19
```

Accept the statistical layer only after known-answer, boundary, degenerate-input, and planted-signal tests pass. If optional replay is implemented, add tests for unsettled-cohort exclusion and hidden future arrivals; the core does not depend on replay tests.

## 7. Core Architecture, Interfaces, and Collaboration

- Recommended stack: plain Python statistics + FastAPI + React/Vite. Preserve `testme`, `manifestme`, `deployme`, and README conventions. Start with `demos/fastapi/`, place the React frontend in `app/frontend/`, and confirm choices before implementation.
- **Only four core endpoints:** `GET /health`, `POST /datasets/load`, `GET /zones/summary`, and `GET /zones/{id}/analysis`. They cover scenario selection/upload, zone summaries, daily control charts, and timing stages. These are planned contracts, not implemented endpoints.
- Return units, stratification, sample sizes, baseline dates, T, control-chart availability, and excluded counts. Return optional q only when enabled. Validate and compute server-side; do not duplicate statistics in the frontend.
- Request analysis after loading data; no polling, live state machine, or incident editing is required. A loaded dataset may live in single-process memory, with a clear reload-after-restart notice. Do not add a database for this submission.
- After the optional gate passes, consider `POST /incidents` first, limited to adding one completed incident and refreshing summaries. `PATCH /incidents/{id}`, incident-list endpoints, polling, a virtual clock, and timers remain lower-priority replay options and cannot become dependencies of the core API.
- Only if replay is actually built, add currently visible states, pending counts, pause/acceleration/reset, and synthetic-simulation labels. Follow-up logs and maps also stay outside the core architecture. Arrival does not mean a unit is available again.
- Use shared `dev` as the integration branch, with short-lived implementation branches and small PRs. Another member reviews statistical changes. Publishing a plan does not complete implementation tasks.

## 8. Four-Person Responsibilities

| Member | Responsibility and paths | Required deliverable | Dependencies and handoff |
|---|---|---|---|
| A: data lead | H-02; `data/`, then support H-05 | Three-scenario generator at 100 incidents/zone/day, CSVs, codebook, scenario truth | Agree definitions and approximation checks with B, independently verify known answers, provide data to C/D |
| B: statistics lead | H-03; `app/qc.py`, statistical dependencies, `tests/` | Late rate, P90, p chart, validity status, and tolerance/boundary tests | Cross-check with A; hand off a stable JSON structure after tests pass |
| C: frontend lead | H-04 frontend sub-scope; `app/frontend/` | Scenario selection/upload, zone summary table, per-zone p charts, and stage detail | Start with wireframes/contracts, integrate after statistical validation; live lists, maps, and follow-up are not required |
| D: backend/release lead | H-04 backend sub-scope and H-06; `app/` excluding B/C paths, plus deployment files | Four core endpoints, complete flow, public deployment, H-07/H-08 material integration | Do not add non-core write endpoints or a state machine; deploy early after validation and coordinate submission |

All four members confirm H-01's user, metrics, and scope. Actual team name and prompt number remain to be entered in SPEC. Each member claims one task at a time. Record disjoint H-04 paths and owners before C/D work concurrently; B exclusively owns statistics. D assembles the README, A/B provide data/method notes, and C supplies screenshots and demo actions. Optional work may be claimed only after the section 2 gate passes and cannot displace core responsibilities.

## 9. Schedule and Acceptance Gates

| Time (ET) | Phase and CONTRACT mapping | Required outcome |
|---|---|---|
| First 45 minutes on 10-16 | Reduced scope and contracts; H-01 | Confirm six core items, timing definitions, T, baseline, and response structure |
| By 10-16 18:30 | Data and statistics; H-02/H-03 | Generate three scenarios; validate known numbers with tolerance and pass exact d=19/20 boundary booleans |
| By 10-16 21:30 | Complete core flow; H-04 | Scenario/CSV → compute → zone summary → p chart → stage detail; no replay or editing requirement |
| By 10-16 22:30 | First public deployment; H-06 | All six P0 items accessible, with UI/API numbers matching tests; do not wait for optional work |
| By 10-16 23:30 | Three scenarios and peer review; H-05/H-07 | Another member reproduces results, core faults are fixed, and rest is arranged |
| No later than 10-17 02:00 | Optional-feature eligibility check | Permit optional work only with a deployed, verified core; otherwise cancel it all; prefer the completed-incident form with a 30–45-minute timebox |
| 10-17 09:00–11:00 | Integration and reproducibility; H-05/H-07/H-08 | Fresh clone runs; charts, units, timezones, and deployment agree; introduce no optional dependencies |
| 10-17 11:00 | Feature freeze | Only blocking fixes; remove unstable optional features |
| 10-17 12:00 | Materials complete | README, codebook, demo script/video, public repo, and live URL ready |
| 10-17 12:30 | Submission target; H-08 | Manually verify successful Devpost submission with 30 minutes of buffer |
| 10-17 13:00 | Official deadline | Submission already completed |

Start H-06 as soon as the first core complete flow works and check H-08 repository access early. If a milestone has already passed when this revision is adopted, treat it as an immediate checkpoint and reduce scope. Do not move the 02:00 eligibility gate, 11:00 freeze, or submission buffer. The 02:00 checkpoint does not require anyone to keep working until that time.

## 10. Core Deliverables and Two-Minute Demo

- A working React analysis interface and Python/FastAPI statistical service, with a one-command start.
- Three synthetic CSVs, a fixed-seed generator, codebook, and validation-only scenario truth.
- Known-answer/boundary/degenerate tests, core API smoke checks, and UI/backend numeric agreement.
- Public repository, Posit Connect demo, README, `demo/README.md`, and submission materials.

The default demo requires no optional functionality: **show the exact equal-mean/different-tail fixture → load normal → switch to hidden_tail → find zone C's higher late rate/P90 in the summary → inspect p-chart violations → drill into travel time → switch to recovery → show reproduction commands and statistical tests.** Distinguish simulated improvement, observed association, and established causes.

If a completed-incident form or another optional feature passed its gate and is stable, demonstrate it separately in a short segment. The main demonstration must still work with optional features disabled. State unimplemented live capabilities clearly, and do not describe CSV scenario switching as real-time replay.

## 11. Three Main Risks and Responses

1. **Incorrect statistical definitions:** fix the notification-to-scene primary metric, freeze the historical baseline, isolate statistical code, and have A/B cross-check calculations.
2. **Scope/deployment delay:** require only the six P0 items; replay, editing, timers, and maps cannot block deployment; retain the 22:30 deployment target, 02:00 optional eligibility gate, and 11:00 freeze.
3. **Synthetic data that merely validates itself:** publish parameters and ground truth, keep scenario labels away from analysis, and verify known answers, independent fixtures, and edge cases rather than relying only on demonstration charts.

## 12. Method References

- [NIST: Proportions Control Charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm): p-chart model, assumptions, and limits; use each batch's n when sample sizes differ.
- [NEMSIS v3.5.1: eTimes Data Dictionary](https://www.nemsis.org/media/nemsis_v3/release-3.5.1/DataDictionary/APIs/EMSDataSetAPI/eTimes_v3_xsd.html): reference definitions for call receipt, unit notification, departure, and arrival.
- Repository `docs/criteria.md`, `docs/prompts.md`, `SPEC.md`, and `CONTRACT.yaml`: scoring, delivery, and verification requirements.

## 13. Review Resolution Log

Source: [team plan review](plan-review.md), commit `609bed9`. Apply all three changes consistently to both detailed plans and the index.

| Review suggestion | Resolution |
|---|---|
| Shrink the required core | Keep six P0 items; gate all live options; remove core API, ownership, schedule, and demo dependencies on them; drop former P2 |
| Tolerant float comparisons | Use `pytest.approx` for numeric assertions while preserving strict `p > UCL` and independent d=19/20 boolean checks |
| Optional reduction in row count, with a recommendation to retain it | Keep 100 incidents/zone/day, approximately 16,800 rows/CSV, and verify realized zone baselines and approximation checks |

Next: complete H-01's SPEC together with the actual team name, prompt number, and final choices, then have A/B advance H-02/H-03 in parallel against the agreed definitions. This revision changes plans only and does not mark implementation tasks complete.
