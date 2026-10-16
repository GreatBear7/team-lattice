# ResponseWatch: Four-Person Implementation Plan

[中文版](plan.zh-CN.md) · [Plan index](plan.md)

- Prepared: 2026-10-16. All scheduling uses New York time (ET).
- Team: four people, temporarily labeled A/B/C/D; the team can assign actual names.
- Track: on-campus; submission deadline: **2026-10-17 13:00 ET**.
- Status: a proposed plan for execution and adjustment. ResponseWatch is a working name and Python/FastAPI/React is the recommended stack. This commit contains planning documents only; neither the application nor datasets have been implemented.

## 1. Prompt, User, and Product Goal

**Selected prompt: Health Systems / Emergency Response.**

> Ambulance dispatch to on-scene times are varying wildly across city zones, but the 911 center only looks at monthly averages, missing fatal outliers, not where or why these failures occur. Design a statistical tool to help manage dispatchers, response time logging in real-time, generate analyzes, and flag zones that are in need of resolution.

The primary user is the **on-duty supervisor at a 911 dispatch center**. The tool helps this supervisor identify currently overdue incidents, flag zones for investigation, locate the delayed process stage, record follow-up, and monitor subsequent performance.

Product flow: **live event logging → zone quality monitoring → stage-level analysis → follow-up and continued observation.** Outputs describe response delays and statistical signals. Without patient outcome data, an overdue response is not labeled a death, and the prototype does not claim a mortality reduction.

## 2. MVP and Priorities

| Priority | Feature | Acceptance criterion |
|---|---|---|
| P0 | Synthetic scenario selection, CSV upload, and validation | Each of three datasets loads independently; invalid inputs report row numbers and reasons |
| P0 | Live incident list | Replay and manual logging share an event model; show call received, unit notified, en route, on scene, and elapsed time |
| P0 | Zone overview | Show sample size, late-response rate, P90, and signal status; filter by zone, date, and priority |
| P0 | p control chart | Show a frozen historical baseline, limits that reflect each batch's sample size, and limit violations |
| P0 | Zone detail | Drill down from a flagged zone to individual incidents and three timing stages |
| P0 | Public deployment | Run on the course Posit Connect server and open the demonstration while logged out |
| P1 | Simple follow-up log | Record an owner, notes, and status; browser localStorage is acceptable if its lack of cross-device sharing is disclosed |
| P1 | Schematic zone map and analysis summary | Prefer a six-zone static SVG; generate summaries with deterministic rules and visible supporting evidence |
| P2 | Extensions | Real maps, resource-allocation simulation, prediction, LLM explanations, and real-system integrations |

If time runs short, drop P2 before reducing P1. Preserve P0 statistical validation, data documentation, and reproducible execution. Dispatcher management means current tasks, assignment information, and follow-up, rather than individual performance rankings. Synthetic replay and manual state updates provide the live workflow.

## 3. Data Schema and Timing Definitions

**One row represents one incident and its single responding unit.** All MVP synthetic incidents use one high-priority class. Multiple responding vehicles, cancellations, and priority changes are outside this version. Timestamps use ISO 8601 with a timezone offset. Group by the unit-notification date in America/New_York, and report durations in minutes.

| Field | Type/example | Purpose |
|---|---|---|
| `incident_id` | Unique string | Deduplication and event updates |
| `zone_id` | `A`–`F` | Zone grouping |
| `priority` | `high` | Priority filtering and target configuration |
| `call_received_at` | Timestamp with offset | Call receipt |
| `unit_notified_at` | Timestamp with offset | Unit notification; start of the primary response metric |
| `unit_en_route_at` | Timestamp with offset | Unit departure |
| `on_scene_at` | Timestamp with offset | Arrival; may be temporarily absent for a live incident |
| `dispatcher_id` | Fictional string | Assignment information, not automatic attribution of blame |
| `unit_id` | Fictional string | Identifier of the single responding vehicle |

Definitions:

- Call handling and assignment wait = `unit_notified_at - call_received_at`.
- Turnout = `unit_en_route_at - unit_notified_at`.
- Travel = `on_scene_at - unit_en_route_at`.
- **Primary response time R = `on_scene_at - unit_notified_at` = turnout + travel.**
- Total call-to-scene wait = `on_scene_at - call_received_at`, displayed as a separately named descriptive metric.

The primary service threshold is **T = 12 minutes**. A response is late when **R > T**; exactly 12 minutes is not late. This is a synthetic demonstration setting, not a clinical or national standard. Configure targets by priority. A threshold change requires recomputing historical baselines and all late-response metrics.

Validate unique IDs, required fields, valid zones, timezone information, and chronological order. Never silently replace missing values with zero. Preserve live incidents with their current state and timer; completed historical CSVs require all four timestamps. Derive UI states from timestamps currently visible to the application.

## 4. Synthetic Data Generation

**All three CSVs are fictional and use seed `5300`.** Use no real patients, real dispatcher identities, or external traffic data. Model six fictional city zones A–F over **2026-09-14 through 2026-10-11, or 28 days**. The default is 100 incidents per zone per day, approximately **16,800 rows per dataset**.

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

Track ongoing incidents separately. Once their known elapsed response exceeds T, they may trigger a live overdue notification. Control charts use **fully settled unit-notification-date cohorts**. Show a cohort with outstanding incidents as pending; do not treat its currently completed subset as the full batch. Replay uses a virtual clock and exposes only incidents and states visible at that moment, without future arrival information.

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
| Known proportion | `p0=0.10, n=100, d=20` | CL=0.10, UCL=0.19, LCL=0.01, p=0.20, deterioration flag true |
| Limit boundary | Same setup, but `d=19` | p=0.19; no flag under the strict greater-than rule |
| Tail fixture | `[5,5,5,5,5,5,5,5,20,20]`, T=12 | Mean=8, P90=20, late rate=0.20 |
| Unequal baseline sizes | Batches with 1/10 and 18/90 late responses | Weighted p0=19/100=0.19, rather than the unweighted average (0.10+0.20)/2=0.15 |
| Timing components | Call 12:00, notification 12:02, departure 12:04, arrival 12:12, same timezone | Assignment wait 2, turnout 2, travel 8, primary response 10, total wait 12 minutes |
| Degenerate/invalid inputs | Empty data, n=1, constants, missing values, duplicate IDs, reversed timestamps, invalid timezone, p0=0 or 1 | Explicit status or validation error; descriptive metrics follow their definitions, without misleading infinities or silent zero imputation |
| Unfinished/replayed incidents | Arrival is not visible yet, or cohort is unsettled | Only live elapsed time and known overdue notifications; exclude from settled control charts and do not reveal future states |
| Planted signal | Fixed-seed deterioration and recovery scenarios | Verify the injection and detection behavior, then record actual flagged batches; do not promise perfect detection of every deterioration |

Accept the statistical layer only after known-answer, boundary, degenerate-input, and planted-signal tests pass.

## 7. Architecture, Interfaces, and Collaboration

- Recommended stack: plain Python statistics + FastAPI + React/Vite. Preserve the repository's `testme`, `manifestme`, `deployme`, and README contract. Use `demos/fastapi/` as the primary starting point and adapt the React example into `app/frontend/`, subject to team confirmation.
- Proposed endpoints: `GET /health`, `POST /datasets/load`, `POST /incidents`, `PATCH /incidents/{id}`, `GET /incidents`, `GET /zones/summary`, and `GET /zones/{id}/analysis`. These are planned contracts, not implemented endpoints.
- Responses must include units, stratification filters, sample sizes, baseline dates, T, q, control-chart availability, and excluded/pending counts. Validate data server-side; do not trust statistics computed by the client.
- Approximately two-second polling is sufficient for the live MVP. First make ordinary reads and updates work. Replay supports pause, acceleration, and reset, with a clear synthetic-simulation label.
- Application incident state may initially live in single-process memory, with an explicit restart-reset notice. Shared persistent storage is an extension. Arrival does not mean a unit is available again; do not infer available fleet counts from on-scene status.
- Use shared `dev` as the integration branch. Future implementation work should use short-lived feature branches and small PRs into `dev`; another member reviews statistical changes. Publishing this plan does not complete implementation tasks.

## 8. Four-Person Responsibilities

| Member | Primary responsibility and paths | First phase | Dependencies and handoff |
|---|---|---|---|
| A: data lead | H-02; `data/`, then support H-05 | Schema, three-scenario generator, codebook, scenario truth | Agree definitions with B, independently check B's known answers, provide examples to C/D |
| B: statistics lead | H-03; `app/qc.py`, statistical dependencies, `tests/` | Pure functions, control chart, P90, validity statuses, tests | Cross-check with A; publish a stable JSON result structure after tests pass |
| C: frontend lead | H-04 frontend sub-scope; `app/frontend/` | Start with wireframes and interface contracts; implement overview, detail, and incident list after statistics pass | Agree fields with D; connect real scenarios for H-05; do not duplicate statistics in UI code |
| D: backend/release lead | H-04 backend sub-scope and H-06; parts of `app/` excluding every B/C-owned path, plus deployment files | Coordinate SPEC, endpoint contracts, and runtime setup; connect API after statistics pass | Deploy a working version early; integrate H-07/H-08 documentation, reproducibility, and submission materials |

All four members confirm H-01's user, metrics, and scope. Actual team name and prompt number remain to be entered in SPEC. Each person claims only one task at a time. Before C/D implement H-04 concurrently, record disjoint sub-paths and owners in CONTRACT. B exclusively owns statistical files so scaffolding cannot overwrite them. D assembles the root README using contributions from the others.

## 9. Schedule and Acceptance Gates

| Time (ET) | Phase and CONTRACT mapping | Required outcome |
|---|---|---|
| First 45 minutes on 10-16 | Scope and contracts; H-01 | Everyone can explain timing definitions, T, q, baseline, and response structure; confirm proposed choices |
| By 10-16 18:30 | Data and statistics; H-02/H-03 | Three scenarios generate; known-answer and boundary tests pass; C/D first finish designs and contracts |
| By 10-16 21:30 | Minimal complete flow; H-04 | Load CSV → compute → zone overview → detail; replay/manual updates work |
| By 10-16 22:30 | First public deployment; H-06 | Public URL opens; API numbers match a statistical test |
| By 10-16 23:30 | Three scenarios and peer review; H-05/H-07 | Another member reproduces results from docs; fix core faults and arrange rest |
| 10-17 09:00–11:00 | Integration and reproducibility; H-05/H-07/H-08 | Fresh clone runs; data, charts, units, timezones, and deployment agree |
| 10-17 11:00 | Feature freeze | Only fix blocking issues; drop unfinished extensions |
| 10-17 12:00 | Materials complete | README, codebook, demo script/video, public repo, and live URL ready |
| 10-17 12:30 | Submission target; H-08 | Manually verify successful Devpost submission with 30 minutes of buffer |
| 10-17 13:00 | Official deadline | Submission already completed |

Start H-06 as soon as the first complete flow works. Check H-08 repository access early and finish submission at the end. If the start time or progress changes, reduce scope while preserving validation, deployment, and submission buffer.

## 10. Deliverables and Two-Minute Demo

- A working React dashboard and Python/FastAPI statistical service, with a one-command start.
- Three synthetic CSVs, a fixed-seed generator, codebook, and validation-only scenario truth.
- Statistical unit tests, API smoke checks, and agreement between backend and UI numbers.
- Public GitHub repository, Posit Connect demo, README, `demo/README.md`, and submission materials.

Demo order: **show the limits of averages → open zone late rates/P90 → replay zone C's deterioration and show a control-chart signal → drill into travel time → record investigation/follow-up → switch to recovery → show reproducible data and statistical tests.** Distinguish simulated improvement, observed association, and established causes.

## 11. Three Main Risks and Responses

1. **Incorrect statistical definitions:** fix the notification-to-scene primary metric, freeze the historical baseline, isolate statistical code, and have A/B cross-check calculations.
2. **Scope/deployment delay:** finish P0 first, use a fictional six-zone schematic and polling, deploy early, and freeze features at 11:00.
3. **Synthetic data that merely validates itself:** publish parameters and ground truth, keep scenario labels away from analysis, and verify known answers, independent fixtures, and edge cases rather than relying only on demonstration charts.

## 12. Method References

- [NIST: Proportions Control Charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm): p-chart model, assumptions, and limits; use each batch's n when sample sizes differ.
- [NEMSIS v3.5.1: eTimes Data Dictionary](https://www.nemsis.org/media/nemsis_v3/release-3.5.1/DataDictionary/APIs/EMSDataSetAPI/eTimes_v3_xsd.html): reference definitions for call receipt, unit notification, departure, and arrival.
- Repository `docs/criteria.md`, `docs/prompts.md`, `SPEC.md`, and `CONTRACT.yaml`: scoring, delivery, and verification requirements.
