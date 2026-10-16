# ResponseWatch Final Implementation Plan

[中文版](ResponseWatch-plan.zh-CN.md)

- Challenge: Health Systems / Emergency Response.
- Primary user: The on-duty supervisor at a 911 emergency dispatch center.
- Team: Four members, referred to as A, B, C, and D.
- Scope: A demonstrable web MVP using synthetic data, without a connection to a real emergency dispatch system.
- Schedule: Retain the team's original submission target of October 17, 2026 at 12:30 PM ET. The original plan lists 1:00 PM ET as the official deadline; the team must verify the event announcement before submission.

## 1 Product goal

Help supervisors identify severe response delays in real time, discover problem zones hidden by citywide monthly averages, locate the stage where delays occur, and record investigation and follow-up observation.

Core workflow: Live incident logging → Incident delay alerts → Zone monitoring → Incident and stage drill-down → Follow-up actions → Subsequent observation.

The tool answers four questions:

1. Which incidents are approaching their thresholds, overdue, or severely delayed right now?
2. Which zones exceed configured service targets, and which have deteriorated relative to their own history?
3. Are delays concentrated in call-to-notification wait, departure preparation, or travel?
4. Who owns the investigation, what action is being taken, and how do subsequent metrics change?

Without patient outcome data, do not interpret a delay as a death or claim reduced mortality. Stage analysis guides investigation; it cannot by itself establish congestion, insufficient vehicles, or individual misconduct.

## 2 MVP scope and priorities

| Priority | Feature | Acceptance criteria |
|---|---|---|
| P0 | Three scenarios and validated CSV import | All three CSVs load; errors identify row, field, and reason |
| P0 | Live incident list and manual updates | Replay and manual operations share one incident model; show status, elapsed wait, and assignments |
| P0 | Overdue incidents and severe delays | Configurable thresholds; show minutes over target, five slowest incidents, and severe-delay counts |
| P0 | Zone overview | Show sample counts, exceedance rates, P90, service-target status, and historical deterioration status |
| P0 | p control chart | Frozen historical baseline, limits based on each batch's sample size, and out-of-limit signals |
| P0 | Zone and incident details | Drill down from a flagged zone to incidents and three timing stages |
| P0 | Minimal follow-up records | Owner, status, notes, creation time, and linked zone or incident |
| P0 | Deployment and reproducibility | Public demo accessible; a fresh clone starts and passes core tests using the documentation |
| P1 | Static six-zone SVG and deterministic summaries | Zone selection updates data; summaries identify supporting metrics and time windows |
| P1 | Follow-up export and interaction refinements | Export current follow-up information; improve filters, empty states, and demo controls |
| P2 | Future extensions | Real maps, GPS, hospital handover, resource simulation, prediction, LLMs, and production integration |

If time becomes limited, remove P2 first, then reduce P1. Visual polish must not displace P0 statistical validation, extreme cases, data documentation, or deployment.

## 3 Screens and user actions

### 3.1 Live operations

Show the current simulation time, mode, incident list, unassigned incidents, overdue incidents, severe delays, and each dispatcher's current workload. Allow inspection, incident status updates, and alert acknowledgment.

This version records dispatcher and responding-unit assignments. It does not rank individual performance or claim automatic vehicle selection or route optimization.

### 3.2 Zone overview

For each zone, show incident count, mean, median, P90, exceedance rate, severe-delay count, and two independent labels: “Above service target” and “Unusual increase from baseline.” Show “No data” for empty samples and explicit notices for insufficient samples.

Prioritize zones needing attention using a visible sorting rule. Do not introduce an opaque composite risk score.

### 3.3 Zone and incident details

Zone details contain a daily p chart, stage-time distributions, the five slowest incidents, and follow-up records. Incident details show visible timestamps, primary response time, total wait, minutes over target, and notes.

### 3.4 Follow-up panel

Statuses are To investigate, In progress, Under observation, and Closed. Record owner, notes, creation and update times, and linked incident or zone. Closed means the administrative record is complete; it does not establish statistical resolution.

The prototype may use browser localStorage, with clear disclosure that records do not synchronize across devices and are lost if browser data is cleared. Separate records by dataset or replay-run identifier; reset must clear them or explicitly preserve archived records.

## 4 Data model and timing definitions

One row represents one incident and its sole responding unit. Synthetic data uses one high-priority category. Multiple-unit responses, cancellations, and priority changes are outside the MVP.

| Field | Purpose |
|---|---|
| `incident_id` | Unique identifier for deduplication and updates |
| `zone_id` | Incident zone A–F |
| `priority` | Urgency; `high` throughout the demo |
| `call_received_at` | Call received time |
| `unit_notified_at` | Unit notification time; primary metric start |
| `unit_en_route_at` | Unit departure time |
| `on_scene_at` | Arrival time; temporarily absent for active incidents |
| `dispatcher_id` | Fictional dispatcher identifier |
| `unit_id` | Fictional responding-unit identifier |

Use timezone-aware ISO 8601 timestamps. Group by notification date in America/New_York and report durations in minutes. An arrival after midnight remains in its notification-date batch.

```text
Call-to-notification wait = unit_notified_at − call_received_at
Departure preparation = unit_en_route_at − unit_notified_at
Travel time = on_scene_at − unit_en_route_at
Primary response time R = on_scene_at − unit_notified_at
Total call-to-scene wait = on_scene_at − call_received_at
Minutes over target = max(0, R − T)
```

The primary threshold T defaults to 12 minutes. An exceedance is R > T; equality does not count. The severe-delay threshold S initially defaults to 24 minutes, with severe delay defined as R > S and S required to exceed T. Both are demo settings, not clinical standards.

Completed records use final R. Active incidents use current visible time minus notification time as known elapsed wait. Incidents without a notification timestamp display call wait only; do not apply the dispatch-to-scene threshold to them.

Validate required fields, unique IDs, zones, timezones, and timestamp order. Never fill missing timestamps with zero. Historical CSVs require all four timestamps. Derive live status from visible timestamps and reject updates that skip into an inconsistent future state.

Vehicle origins and hospital locations are not required P0 inputs. An optional `origin_zone_id` can be added later. Without release timestamps, arrival does not mean a unit is available; do not infer nearby available-unit counts.

## 5 Three synthetic datasets

Use seed 5300 and six fictional zones for September 14 through October 11, 2026: 28 days, 100 incidents per zone per day, approximately 16,800 rows per file. The first 14 days form a stable baseline; the remaining 14 form the monitoring period.

| File | Rule | Demonstration |
|---|---|---|
| `normal.csv` | Stable process with a right tail | Normal variation and occasional extreme incidents; zero false alarms is not guaranteed |
| `hidden_tail.csv` | From day 18, add 6–12 travel minutes to approximately 25% of C-zone incidents | Changes in zone exceedance rates, P90, and p-chart signals |
| `recovery.csv` | Reuse deterioration; remove added delay from day 24 | Observe simulated recovery without claiming real intervention effectiveness |

Initial generation parameters, in minutes:

| Stage or mechanism | Configuration |
|---|---|
| Call-to-notification wait | `clip(LogNormal(median=1.0, sigma=0.35), 0.2, 4.0)` |
| Departure preparation | `clip(LogNormal(median=1.2, sigma=0.25), 0.3, 4.0)` |
| Ordinary travel | `clip(LogNormal(median=6.0, sigma=0.25), 2.0, 10.0)` |
| Normal tail | Independently add `Uniform(6,12)` travel minutes with 10% probability |
| Added deterioration | In the specified C-zone period, independently add `Uniform(6,12)` travel minutes with 25% probability |

Use `log(median)` for the lognormal mean parameter in common libraries. Normal-tail and deterioration additions may overlap. Generate masks and increments with independent random streams. Reuse baseline and underlying draws across scenarios so unrelated zones do not change.

Deliver `data/generate_data.py`, three CSVs, `data/README.md`, and `data/scenario_truth.json`. Truth is for testing and demo verification only; statistics must not read scenario names or truth to determine anomalies.

Use a separate exact example to explain averages: ten 8-minute incidents versus eight 5-minute and two 20-minute incidents. Both average 8 minutes, but exceedance rates at T=12 are 0% and 20%. Do not claim the large random datasets have exactly equal means.

## 6 Statistics and alert rules

Keep statistical calculations in pure functions in `app/qc.py`. The API calls these functions; the frontend does not duplicate statistics.

### 6.1 Descriptive metrics and extreme incidents

For complete valid records, compute sample count, mean, median, P90, exceedance count and rate, severe-delay count, and stage durations. Use linear interpolation for P90: sort values, calculate h=(n−1)×0.90, and interpolate adjacent positions. Sort the slowest list by descending R, breaking ties by incident ID.

Separate completed-record metrics from active-incident timers. An empty sample is No data, not 0% exceedance. Warn that small-sample P90 is unstable and document the warning rule.

### 6.2 p control chart

Stratify by zone, priority, and notification date. Estimate baseline p0 as total baseline exceedances divided by total valid baseline incidents, not the average of daily percentages. Use each monitoring batch's sample size:

```text
p_i = d_i / n_i
CL = p0
UCL_i = min(1, p0 + 3 × sqrt(p0 × (1−p0) / n_i))
LCL_i = max(0, p0 − 3 × sqrt(p0 × (1−p0) / n_i))
Deterioration signal: p_i > UCL_i
```

Equality does not trigger a signal. Use a documented numerical tolerance to prevent floating-point boundary errors; tests must use the same convention. Values below LCL may be labeled improvement signals, not proof of intervention effectiveness.

Assume a stable baseline, approximately independent incidents within each stratum, and a binomial proportion model. If p0 is 0 or 1, baseline evidence is insufficient, n_i×p0 < 5, or n_i×(1−p0) < 5, return Insufficient control-chart evidence. Descriptive metrics can remain visible. A/B must agree and document an explicit baseline-sufficiency rule before implementation.

Only ended date batches with no unfinished incidents enter the control chart. Mark the current date and historical dates with unfinished incidents as Pending settlement. Show No data for n=0. Correlation, overdispersion, and monitoring multiple zones require additional calibration in production.

### 6.3 Three independent statuses

1. Active incident delay: Compare elapsed wait against T and S.
2. Above demo service target: A complete batch has p_i > q, initially q=10%; this is not statistical significance.
3. Historical deterioration: p_i > UCL_i.

Keep these labels independent so a consistently poor zone remains visible. Changing T recalculates historical exceedances, p0, and limits. Changing S or q affects only the corresponding severe-delay or service-target labels. Retain thresholds, baseline period, and configuration version.

## 7 Historical mode and live replay

Historical mode may access full records. Replay uses a virtual clock and exposes only incidents and timestamps known at that time. Future arrival information must not influence display, ordering, or statistics.

Support pause, speed changes, and reset. Always show Synthetic simulation, virtual time, dataset, and configuration. Filtering monitoring dates must not silently recalculate the frozen baseline.

Create one alert per incident per severity level; overdue alerts may escalate to severe. Distinguish New, Acknowledged, and Arrived. Acknowledgment means reviewed, not resolved. Arrival stops the active timer while preserving the delay record. Isolate or clear alerts on scenario changes and replay resets.

## 8 Required validation

| Test | Expected result |
|---|---|
| p0=0.10, n=100, d=20 | CL=0.10, UCL=0.19, LCL=0.01; deterioration signal |
| Same parameters with d=19 | Equality does not signal; include floating-point coverage |
| Eight 5s and two 20s, T=12 | Mean 8, P90=20, exceedance 20% |
| Baseline batches 1/10 and 18/90 | Weighted p0=0.19 |
| Call 12:00, notification 12:02, departure 12:04, arrival 12:12 | Stages 2, 2, 8; primary response 10; total wait 12 minutes |
| R=T, R=S, and values just above | Consistent strict-greater-than classification |
| Empty data, n=0, n=1, missing, duplicate, reversed, invalid timezone, p0=0/1 | Explicit states or errors; no silent zero filling |
| Midnight crossings and incomplete batches | Correct notification-date grouping and exclusion from settled chart |
| Replay, reset, and acknowledgment | No future leakage, repeated polling alerts, or scenario mixing |
| Threshold changes and date filters | Correct dependent recalculation; filters preserve baseline |
| Three scenarios and frontend/backend agreement | Reproducible generation; record actual detected batches; UI matches statistics |

Do not require every deteriorated batch to be detected. Record actual detection results on fixed datasets. Extreme-incident lists remain available even without a zone-level signal.

## 9 Architecture and API contract

Follow repository conventions, starting primarily from `demos/fastapi/`, with Python/FastAPI and React/Vite. Preserve `testme`, `manifestme`, `deployme`, and README contracts. Serve the built React frontend through FastAPI so deployment does not depend on two development servers.

Suggested endpoints: `GET /health`, `POST /datasets/load`, `GET /incidents`, `POST /incidents`, `PATCH /incidents/{id}`, `GET /zones/summary`, `GET /zones/{id}/analysis`, plus replay controls. Follow-up records may remain local without backend persistence.

Agree on sample requests and JSON responses within the first 45 minutes. Frontend and backend develop against mock responses while statistics are validated, then replace the mock implementation. Responses include units, counts, exclusions, pending records, filters, thresholds, baseline period, configuration version, and control-chart availability.

Poll approximately every two seconds. If incident state is in single-process memory, disclose restart resets. Public visitors may share demo state; use packaged synthetic data and do not accept sensitive information. Validate CSVs on the server and enforce a size limit. Reset must not modify source files.

## 10 Four-person ownership and integration

| Member | Ownership | First deliverables |
|---|---|---|
| A Data | `data/`, fixtures, and truth | Schema, generator, scenarios, codebook; independently check B's answers |
| B Statistics | `app/qc.py`, statistical dependencies, `tests/` | Pure functions, boundary rules, response schema, tests |
| C Frontend | `app/frontend/` | Incident list, overview, details, follow-up, and alerts using mocks |
| D Backend and release | API, integration, deployment, documentation assembly | Health check, contract, shell deployment, run scripts |

Agree jointly on scope, metric definitions, and JSON contracts. Use short-lived branches and small PRs into `dev`; another member reviews statistical changes. D copies the scaffold once to avoid overwriting B/C files. Record path ownership and acceptance results in the repository task contract.

## 11 Milestones and fallback

All times are ET and retain the original team schedule. If starting later, preserve sequencing and reduce features rather than validation or submission buffer.

| Time | Required result |
|---|---|
| First 45 minutes | Scope, metrics, JSON contract, and path ownership agreed |
| Oct 16, 6:30 PM | Generated data and known-answer tests; frontend/backend using fixtures; shell deployed |
| Oct 16, 9:30 PM | CSV → statistics → overview → details; replay and manual updates work |
| Oct 16, 10:30 PM | First complete public version; displayed values match tests |
| Oct 16, 11:30 PM | Three scenarios, extreme cases, follow-up, and cross-team reproduction |
| Oct 17, 9:00–11:00 AM | Integration, fresh-clone run, deployment and demo checks |
| Oct 17, 11:00 AM | Feature freeze; blocking fixes only |
| Oct 17, noon | Documentation, demo materials, repository and live links ready |
| Oct 17, 12:30 PM | Target submission and manual success confirmation, preserving buffer |

If behind, remove P2, SVG, and export; use a simple zone list and fixed demo datasets. Preserve pure statistics, essential tests, live timers, extreme cases, p chart, incident drill-down, minimal follow-up, and accessible deployment.

## 12 Deliverables and two-minute demo

Deliver a working app, three CSVs, generator, codebook, tests, startup instructions, API and parameter documentation, public repository, Posit Connect link, and demo materials. Document simulation limits, reset behavior, and local follow-up storage.

Demo sequence:

1. 0:00–0:15: Explain the limitation of monthly averages using the exact equal-mean example.
2. 0:15–0:40: Show C-zone exceedance rate, P90, service-target label, and historical deterioration signal.
3. 0:40–1:00: Inspect the slowest incident and travel duration; explain that the evidence locates a stage, not a proven cause.
4. 1:00–1:25: Replay a live incident, trigger and acknowledge an alert, and record follow-up.
5. 1:25–1:45: Switch to recovery and observe falling metrics without claiming causality.
6. 1:45–2:00: Show the three datasets, statistical validation, and reproducible execution.

Final acceptance: A user can trace an abnormal metric to incidents, delay stages, and follow-up records. Numbers are explainable, results reproducible, and the public link usable.

## 13 Method and project references

- [NIST p control charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm): Proportion model, independence assumptions, and limits.
- [NEMSIS eTimes dictionary](https://www.nemsis.org/media/nemsis_v3/release-3.5.1/DataDictionary/APIs/EMSDataSetAPI/eTimes_v3_xsd.html): Timestamp reference; verify field semantics during implementation.
- Repository `docs/criteria.md`, `SPEC.md`, and `CONTRACT.yaml`: Rubric, scope, runtime, and task contracts.
