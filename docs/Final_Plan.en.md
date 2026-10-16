# Final_Plan: ResponseWatch Final Implementation Plan

[中文版](Final_Plan.md) · [Plan index](plan.md) · [Team review](plan-review.md) · [Time-of-day proposal](time-of-day-proposal.md)

- Prepared: 2026-10-16. All scheduling uses New York time (ET).
- Team: four people, temporarily labeled A/B/C/D; the team can assign actual names.
- Track: on-campus; submission deadline: **2026-10-17 13:00 ET**.
- Revision basis: `docs/plan-review.md` from team commit `609bed9`; this revision adopts the reduced scope, float-tolerance guidance, and retained dataset size.
- Current revision: adopt time-of-day proposal `b1b86b5`; retain the daily zone p chart as the primary flag and add a pooled time-band comparison in zone detail.
- Status: this file and the Chinese version are the sole current execution plan, consolidating prior reviews and the team's agreed selections. ResponseWatch is a working name and Python/FastAPI/React the recommended stack. Enter the actual team name and prompt number in H-01's SPEC. This change finalizes documentation only; neither the application nor datasets have been implemented.
- Final selection: add read-only slowest incidents, minutes over target, explicit empty-data/sorting/baseline-adequacy rules and a unified deployment entry point; do not restore a live system, follow-up panel, or second severe-delay threshold as requirements.
- Functional zones are confirmed: A/B downtown, C/D residential, E/F outer/semi-rural. Fix their underlying travel profiles and randomize incidents within them, not the zones' identities.

## 1. Prompt, User, and Product Goal

**Selected prompt: Health Systems / Emergency Response.**

> Ambulance dispatch to on-scene times are varying wildly across city zones, but the 911 center only looks at monthly averages, missing fatal outliers, not where or why these failures occur. Design a statistical tool to help manage dispatchers, response time logging in real-time, generate analyzes, and flag zones that are in need of resolution.

The primary user is the **on-duty supervisor at a 911 dispatch center**. The core tool identifies zones for investigation, shows which times of day deteriorated relative to their own baselines, locates the delayed process stage, and compares normal, deteriorated, and recovery scenarios.

Required flow: **load a scenario or CSV → inspect the zone summary and control chart → drill into timing stages → explain the signal and limitations.** Outputs describe response delays and statistical signals. Without patient outcome data, an overdue response is not labeled a death, and the prototype does not claim a mortality reduction.

Following the review, prioritize verified analysis and a working public deployment. Adding one incident, live replay, and dispatcher follow-up are gated optional features. If live functionality is not implemented, describe the demonstration as statistical monitoring of imported logs, without claiming a real 911 integration or complete live dispatch coverage.

## 2. Reduced MVP and Optional-Feature Gate

| Priority | Feature | Acceptance criterion |
|---|---|---|
| P0 | Synthetic generator, three CSVs, and codebook (H-02) | Reproduce the data with a fixed seed and document fields and scenarios |
| P0 | Plain statistical functions and tests (H-03) | Late rate, P90, daily p chart, pooled time-band comparison, and validity status pass known-answer and edge-case tests |
| P0 | Scenario selection or CSV upload and zone summary table (H-04) | Show functional zone, n, late rate, P90 and independent service-target/deterioration labels; keep insufficient evidence separate and report import row/reason |
| P0 | p chart for each zone (H-04) | Show the frozen baseline, limits reflecting n, and marked limit violations |
| P0 | Zone detail, slowest incidents and time bands (H-04) | Show three delay stages, five slowest completed incidents with minutes over target, and five-band comparisons; the slowest list does not depend on a zone flag |
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
| `zone_id` | `A`–`F` | Fixed functional zones: A/B downtown, C/D residential, E/F outer |
| `priority` | `high` | Priority filtering and target configuration |
| `call_received_at` | Timestamp with offset | Call receipt |
| `unit_notified_at` | Timestamp with offset | Unit notification; start of the primary response metric |
| `unit_en_route_at` | Timestamp with offset | Unit departure |
| `on_scene_at` | Timestamp with offset | Arrival; required for core historical imports |
| `dispatcher_id` | Fictional string | Assignment information, not automatic attribution of blame |
| `unit_id` | Fictional string | Identifier of the single responding vehicle |

**Time band is derived, not a new required input.** Convert `unit_notified_at` to America/New_York before assigning a band; do not group by call receipt or arrival time. Section 5.4 defines half-open intervals and the baseline split.

Zone type is also derived from fixed `zone_id` metadata, without new dispatcher-entered fields. For real integration, prefer existing CAD response districts or GIS address-to-district mapping and verify local district/first-due definitions; do not assume every system uses identical boundaries. The codebook explains the local field or mapping rather than asking dispatchers to type a functional zone.

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
| Routine travel | `clip(LogNormal(median=zone_median, sigma=0.25), 2.0, zone_cap)`, using the zone parameters below |
| Ordinary tail | Independently add `Uniform(6,12)` travel minutes with 10% probability per incident |
| Additional deterioration | During the specified zone C period, independently add another `Uniform(6,12)` travel minutes with 25% probability per incident |

Use `log(median)` for the lognormal mean parameter in common libraries, rather than passing the median as the log mean. Ordinary tails and deterioration may overlap. Pre-generate injection masks and increments with a separate random stream so switching scenarios does not alter unaffected zones' original draws. These are demonstration assumptions, not empirical findings about real EMS duration distributions.

### 4.1 Fixed Functional-Zone Profiles

| Zones | Fictional functional type | Routine travel median | Routine travel cap | Rush multiplier |
|---|---|---:|---:|---:|
| A, B | Downtown | 5 minutes | 8 minutes | 1.3 |
| C, D | Residential | 6 minutes | 10 minutes | 1.3 |
| E, F | Outer / semi-rural | 7.5 minutes | 12 minutes | 1.3 |

Each zone retains its functional identity. A defines a small configuration table in `data/generate_data.py`, effective from baseline onward and identical across normal, hidden_tail and recovery. All zones use routine travel sigma=0.25 and lower bound 2 minutes, with other parameters as above. Keep call handling/assignment and turnout distributions shared as a modeling simplification, not a claim that location never affects them. Use 1.3 for every zone initially; do not include the suggested 1.5/1.1 alternatives in the default configuration.

Zone C still receives an independent all-day 25% chance of 6–12 additional travel minutes from day 18, removed from day 24 in recovery. Do not treat E/F's inherently slower baseline profile as a planted failure. Estimate and freeze each zone's p0 and each zone/band's p0_band from realized first-14-day records, never from a citywide shared p0 or a profile's preset late probability.

The proposal's approximately 10%/12%/23% figures come from different approximate simulation conditions; they are scale references, not generated results or acceptance constants. Under this plan's hourly weights, rush-window weight is 8.4/25.6, about 32.8%, rather than the approximation's roughly 25%. A records realized zone baseline n, late count, p0, P90 and band counts in the codebook. Verify n·p0 and n·(1−p0) per batch; 100 incidents per day alone does not guarantee adequacy.

### 4.2 Hourly Volume and Normal Rush Hours

Sample the local unit-notification hour using relative weights, then sample minutes and seconds within that hour. Keep 100 incidents per zone per day. The following are **relative weights** normalized by their sum, 25.6, not fixed hourly counts:

| Local hours | Weight per hour | Comparison band |
|---|---:|---|
| 00–05 | 0.5 | Night |
| 06 and 09 | 1.0 | Morning rush |
| 07–08 | 1.5 | Morning rush |
| 10–15 | 1.2 | Midday |
| 16–19 | 1.8 | Evening rush |
| 20–23 | 0.8 | Late evening |

For notifications during **07:00–09:00 and 16:00–19:00**, multiply routine travel time by **1.3**, with inclusive starts and exclusive ends. Cap routine travel first, apply the multiplier second, then add ordinary-tail and injected increments, so increments are not multiplied twice. These rush-factor windows are narrower than the comparison bands in section 5.4 and serve a different purpose.

Hourly weights and the normal rush factor apply from the baseline onward, identically across all three scenarios, so they are not planted failures. A publishes weights, factors, calculation order, random streams, and scenario rules in the generator/codebook. A/B agree on them before H-02 starts.

Retain the default all-day independent 25% probability of zone C's additional delay to preserve detection by the daily primary chart. The proposed concentration in 16:00–20:00 is an optional data variant: restricting the same 25% probability to that band dilutes the daily effect, so do not promise detection. If adopted, A/B must record the revised injection rule, verify realized detection in daily and band views, and replace an existing scenario rather than add a fourth CSV. It cannot delay core deployment.

Each zone still has 1,400 monitoring incidents across 14 days, but bands have unequal counts. Under these weights, expected counts are approximately **night 164, morning rush 273, midday 394, evening rush 394, late evening 175**. Actual n comes from the realized sample. Do not assume 280 observations in every band; check adequacy for each one.

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

**Empty data and small samples:** for n=0 return null for rates, mean and P90, and show No data rather than 0% or 0 minutes. For n=1 the observation may be displayed as descriptive P90 with a small-sample warning. The demo shows Small sample, unstable P90 when n<20; 20 is a UI warning convention, not a guarantee of reliability at or above that size.

**A read-only slowest list is core:** take the five slowest valid completed incidents in the selected monitoring interval, ordered by descending primary response time R and then ascending lexicographic `incident_id` string. Show all if fewer than five and return [] for an empty set. The overview covers selected zones together; zone detail covers its own zone. Show ID, zone, notification/arrival times, R and `minutes_over_target = max(0, R - T)`, all derived from existing inputs.

Keep this list visible even without a daily zone control-chart flag, so isolated severe delays are not hidden by aggregate proportions. A slow incident below T has zero minutes over target. This does not introduce live timers, incident editing, or a separate severe threshold S=24. Return read-only records through existing summary/detail endpoints, without a fifth core API.

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

**Baseline-adequacy convention for this demo:** each zone/priority uses the fixed 14-day baseline window, with at least 14 nonempty completed daily batches and at least five late and five non-late baseline incidents. Otherwise return `baseline_insufficient`, retaining descriptive metrics where defined. Monitoring batches still undergo the approximation checks above. Adequacy does not establish process stability; synthetic baseline stability follows from documented generation assumptions, while real baselines require review.

### 5.3 Service Targets and Interpretation

Enable allowed late rate **q = 10%** in the core demonstration, displayed alongside T=12 as demo settings. For a completed batch/selected monitoring window, `p > q` means Above demonstration service target. Separately show daily `p_i > UCL_i` as Deteriorated from own baseline, with each label's date range. q is not a significance threshold or clinical standard; insufficient evidence must not masquerade as no deterioration.

The intended story is E/F remaining chronically slower under their travel-distance settings, potentially above q without sustained deterioration from their own history, while zone C deteriorates from its own baseline during the fault. Verify actual rates and flagged batches after generation; stable zones can have chance violations. Chronic target failure suggests investigating coverage or target suitability, not a proven vehicle shortage, and historical stability does not mean acceptable service.

Component charts identify the delayed stage. Longer travel times may suggest checking coverage, routes, or traffic evidence; without additional data they do not establish congestion, staff fault, or a vehicle shortage. P90 is descriptive and must be marked unstable for small samples. Cp/Cpk and risk prediction are not part of the MVP.

### 5.4 Pooled Time-Band Comparison: When Deterioration Occurred

**The daily zone-by-day p chart remains the primary flag, with unchanged formulas and rules.** Add a second zone-detail view computed by a new plain function, `late_rate_by_band(df, T, baseline_end)`, in `app/qc.py`. Verify the daily statistics first, then this function; C displays its chart only after its tests pass.

Derive five half-open bands from the unit-notification time in New York:

| Key | Label | Local interval |
|---|---|---|
| `night` | Night | [00:00, 06:00) |
| `morning_rush` | Morning rush | [06:00, 10:00) |
| `midday` | Midday | [10:00, 16:00) |
| `evening_rush` | Evening rush | [16:00, 20:00) |
| `late_evening` | Late evening | [20:00, 24:00) |

06:00 belongs to morning rush. 10:00, 16:00, and 20:00 enter the next interval, and next-day 00:00 belongs to that day's night band. The exclusive baseline end is **`2026-09-28T00:00:00-04:00`**: the first 14 days precede it, followed by monitoring days 15–28.

For each zone, priority, and band, **pool counts across days**, separately for baseline and monitoring. Do not add zone-by-band-by-day control charts: splitting 100 daily incidents across five groups leaves many points with n·p0 below 5. This compares the full monitoring period against the same band's historical baseline; it is not a prediction of current risk. The summary table's primary flag still comes from the daily chart; display band flags separately in detail.

```text
p0_band = baseline_late_band / baseline_n_band  # weighted and frozen
n_band = total valid monitoring incidents in this zone and band
p_band = monitoring_late_band / n_band
UCL_band = min(1, p0_band + 3 * sqrt(p0_band * (1 - p0_band) / n_band))
LCL_band = max(0, p0_band - 3 * sqrt(p0_band * (1 - p0_band) / n_band))
flag_band = p_band > UCL_band
```

Return insufficient evidence for an empty baseline, monitoring n=0, p0_band equal to 0 or 1, `n_band*p0_band < 5`, or `n_band*(1-p0_band) < 5`. Do not divide by zero or label such groups normal; preserve descriptive rates where defined. These are approximate historical-proportion comparison limits, not a formal multiplicity-adjusted inference.

Band comparisons also require the zone/priority to pass the 14-day baseline check above and the band's baseline to contain at least five late and five non-late incidents. A band need not contain incidents on every baseline day. Failed checks suppress statistical flags, without inventing 0% or Normal statuses.

Show paired baseline/monitoring late-rate bars for five bands, with UCL markers, sample sizes, comparison dates, and evidence status; color above-limit bands red. Return results in a `time_of_day` field within the existing `GET /zones/{id}/analysis`, without new inputs or endpoints. Each item includes at least band, baseline_n, p0_band, n_band, p_band, ucl, lcl, flag, and status.

State in the UI and README: **six zones × five bands create 30 exploratory comparisons; chance violations can occur, no multiple-comparison correction is applied, and red bars guide investigation rather than prove causes.** A band's own baseline accounts for normal rush-hour patterns. Recovery-period pooling still includes earlier deteriorated days, so recovery in the last few days need not remove a full-period red bar; inspect the daily primary chart for recent recovery.

A risk-adjusted daily p chart is a statistical extension to evaluate only after the 02:00 gate: expected daily late count `E=sum(p0_band_of_each_call)`, with count limits `clip(E ± 3*sqrt(sum(p*(1-p))), 0, n_day)`. It addresses changing time-band composition, needs separate tests and explanation, and is outside six-item core acceptance. It cannot block deployment.

## 6. Required Statistical Tests

| Test | Input | Expected result |
|---|---|---|
| Known proportion | `p0=0.10, n=100, d=20` | CL≈0.10, UCL≈0.19, LCL≈0.01, p≈0.20, deterioration flag true; compare numeric values with tolerance |
| Limit boundary | Same setup, but `d=19` | p=0.19; no flag under the strict greater-than rule; assert the boolean separately |
| Known band answer | `p0_band=0.20, n_band=400, d_band=108` | sigma≈0.02, UCL≈0.26, LCL≈0.14, p_band≈0.27, flag true; compare numeric values with tolerance |
| Band limit boundary | Same setup, but `d_band=104` | p_band=0.26; no flag under strict greater-than |
| Band assignment and empty groups | 06:00, 10:00, 16:00, 20:00, next-day 00:00, empty baseline/monitoring, p0_band=0 or 1 | Correct half-open bands, insufficient evidence for empty groups, timezone conversion first; UTC 10:00 maps to local 06:00 on these dates |
| Hourly weights and normal rush | Weight sum 25.6; 1.3 factor present from baseline onward | Reproduce with the seed and shared baseline/draws; verify actual band n and do not treat normal rush as an injected failure |
| Tail fixture | `[5,5,5,5,5,5,5,5,20,20]`, T=12 | Mean≈8, P90≈20, late rate≈0.20 |
| Slowest list and excess minutes | T=12; incidents F=8, B=20, A=20, D=12, C=5, E=25 minutes | First five E, A, B, D, F; excess minutes 13, 8, 8, 0, 0; still visible when the zone flag is false |
| Empty data and P90 warning | n=0, n=1, n=19, n=20; fewer than five incidents | Empty metrics null and list []; defined descriptive values otherwise; warn for n<20 without zero imputation |
| Baseline adequacy | 13 completed baseline days, or fewer than five late/non-late baseline incidents | `baseline_insufficient`, without a Normal conclusion; separately check band baseline counts |
| Zone profiles and paired scenarios | A/B=(5,8,1.3), C/D=(6,10,1.3), E/F=(7.5,12,1.3) | Fixed identities/settings, identical baseline across scenarios, injection only in C on specified dates; verify realized zone/band adequacy |
| Independent labels (constructed unit fixture, not simulation results) | q=0.10; E: p0=0.20, n=100, d=25; C: p0=0.10, n=100, d=20 | E has UCL≈0.32 and exceeds q but not its UCL; C exceeds both q and its UCL≈0.19; retain independent zone baselines |
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
assert band_result["ucl"] == pytest.approx(0.26, rel=1e-12, abs=1e-12)
assert band_result["lcl"] == pytest.approx(0.14, rel=1e-12, abs=1e-12)
assert band_result["flag"] is True  # d_band=108
assert band_boundary_result["flag"] is False  # d_band=104
```

Accept the statistical layer only after known-answer, boundary, degenerate-input, and planted-signal tests pass. If optional replay is implemented, add tests for unsettled-cohort exclusion and hidden future arrivals; the core does not depend on replay tests.

## 7. Core Architecture, Interfaces, and Collaboration

- Recommended stack: plain Python statistics + FastAPI + React/Vite. Preserve `testme`, `manifestme`, `deployme`, and README conventions. Start with `demos/fastapi/`, place the React frontend in `app/frontend/`, and confirm choices before implementation.
- **One production deployment entry point:** build React static assets and serve the page, assets, and four core APIs from the same FastAPI application, without requiring two development servers. SPA fallback must not hide API validation errors or 404s. Deployment smoke checks cover the homepage, assets and the expected `/health` response type.
- **Only four core endpoints:** `GET /health`, `POST /datasets/load`, `GET /zones/summary`, and `GET /zones/{id}/analysis`. They cover scenario selection/upload, zone summaries, daily control charts, timing stages, and the detail response's `time_of_day` field. These are planned contracts, not implemented endpoints.
- Return units, stratification, sample sizes, baseline dates, T, q=10%, zone type, independent `above_service_target` / `deterioration_flag` states and excluded counts. Bands also include baseline_n, p0_band, n_band, comparison dates and evidence status. Preserve unavailable statistical states rather than returning false. Include metadata in existing responses, without new endpoints; compute statistics server-side.
- Existing summary and zone-detail responses each add `slowest_incidents`. The backend owns ordering, R and excess-minute calculations; empty lists and nulls follow section 5.1. Keep the same four core endpoints.
- Request analysis after loading data; no polling, live state machine, or incident editing is required. A loaded dataset may live in single-process memory, with a clear reload-after-restart notice. Do not add a database for this submission.
- After the optional gate passes, consider `POST /incidents` first, limited to adding one completed incident and refreshing summaries. `PATCH /incidents/{id}`, incident-list endpoints, polling, a virtual clock, and timers remain lower-priority replay options and cannot become dependencies of the core API.
- Only if replay is actually built, add currently visible states, pending counts, pause/acceleration/reset, and synthetic-simulation labels. Follow-up logs and maps also stay outside the core architecture. Arrival does not mean a unit is available again.
- Use shared `dev` as the integration branch, with short-lived implementation branches and small PRs. Another member reviews statistical changes. Publishing a plan does not complete implementation tasks.

## 8. Four-Person Responsibilities

| Member | Responsibility and paths | Required deliverable | Dependencies and handoff |
|---|---|---|---|
| A: data lead | H-02; `data/`, then support H-05 | Fixed zone profiles, three scenarios at 100 incidents/zone/day, hourly/rush patterns, CSVs, realized zone baselines and codebook | Fix profiles before H-02, verify zone/band adequacy with B, cross-check calculations and provide data to C/D |
| B: statistics lead | H-03; `app/qc.py`, statistical dependencies, `tests/` | Verify daily statistics first, then `late_rate_by_band`, validity, tolerance, empty-group and band-boundary tests | Cross-check with A; hand off a stable JSON structure after tests pass |
| C: frontend lead | H-04 frontend sub-scope; `app/frontend/` | Scenario selection/upload, summary table, read-only five slowest incidents, daily charts, stage detail and five-band bars | Start with contracts and integrate after statistical validation; live lists, maps and follow-up are not required |
| D: backend/release lead | H-04 backend sub-scope and H-06; `app/` excluding B/C paths, plus deployment files | Four endpoints, slowest/band structures, unified React/FastAPI deployment and submission materials | No non-core write endpoints or state machine; deploy early and verify shared UI/backend null and ordering behavior |

All four members confirm H-01's user, metrics, and scope. Actual team name and prompt number remain to be entered in SPEC. Each member claims one task at a time. Record disjoint H-04 paths and owners before C/D work concurrently; B exclusively owns statistics. D assembles the README, A/B provide data/method notes, and C supplies screenshots and demo actions. Optional work may be claimed only after the section 2 gate passes and cannot displace core responsibilities.

## 9. Schedule and Acceptance Gates

| Time (ET) | Phase and CONTRACT mapping | Required outcome |
|---|---|---|
| First 45 minutes on 10-16 | Reduced scope and contracts; H-01 | Confirm six core items, timing definitions, T, baseline, hourly/rush settings, and five-band response structure |
| By 10-16 18:30 | Data and statistics; H-02/H-03 | Generate three scenarios with normal rush; pass daily/band known answers, tolerance, empty-group and band-boundary tests |
| By 10-16 21:30 | Complete core flow; H-04 | Scenario/CSV → summary → daily p chart → stage and five-band detail; no replay or editing requirement |
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

The default demo requires no optional functionality: **introduce downtown/residential/outer profiles → show the limits of averages and slowest incidents → contrast E/F's chronic target failure without sustained own-baseline deterioration → switch to hidden_tail for C's deterioration → inspect travel stages and pooled bands → switch to recovery → show reproduction and tests.** Use realized results to explain independent labels, without promising zero false alarms; keep slowest incidents independently visible, use daily charts for recovery and avoid causal claims.

If a completed-incident form or another optional feature passed its gate and is stable, demonstrate it separately in a short segment. The main demonstration must still work with optional features disabled. State unimplemented live capabilities clearly, and do not describe CSV scenario switching as real-time replay.

## 11. Three Main Risks and Responses

1. **Incorrect statistical definitions:** fix the notification-to-scene metric and frozen baseline; derive bands from local notification times and pool across days; have A/B cross-check and explain 30 exploratory comparisons and approximation assumptions.
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

Current proposal: [time-of-day analysis](time-of-day-proposal.md), commit `b1b86b5`.

| Time-of-day proposal | Resolution |
|---|---|
| Normal hourly volume and rush | Publish fixed hourly weights and a 1.3 rush factor in the baseline too; retain all-day injection by default and validate any optional evening-only variant |
| New statistic and verification | Add pooled `late_rate_by_band`; known UCL≈0.26/LCL≈0.14; test empty groups, timezone conversion, boundaries and insufficient evidence |
| Zone detail | Add five-band baseline/monitoring bars with UCL through the existing detail endpoint, without new inputs or endpoints |
| Risks and scope | Explain 30 unadjusted exploratory comparisons; retain the daily primary chart, six core items, four endpoints, dataset size and schedule; gate risk adjustment as an extension |

Final selections also draw from Yurui Xu's proposal `4832c3d`: adopt read-only slowest incidents, excess minutes, explicit empty-data/sorting/adequacy rules and unified deployment. Do not promote live editing, replay, acknowledgment or follow-up to P0, introduce a second severe threshold, or alter strict statistical flags. Retain this version's five-band analysis and established scope.

**Version convention:** only this file and `Final_Plan.md` are the active execution plan. `plan.zh-CN.md`, `plan.en.md`, `ResponseWatch-plan.zh-CN.md` and `ResponseWatch-plan.en.md` are historical references whose older scope must not override this version. `plan.md` links here.

Adopted [functional-zone proposal](zone-profiles-proposal.md), commit `6c9aa6f`: fix three zone profiles, enable independent service-target/own-baseline labels, and add realized zone baseline reporting and checks. Preserve six core items, four endpoints, roles and deadlines. This change updates plans only; it does not implement the generator or reproduce the proposal's simulated rates.

Next: complete H-01's SPEC with the actual team name, prompt number and confirmed scope, then have A/B advance H-02/H-03 in parallel. This change finalizes planning only; implementation tasks remain separate.
