# SPEC: Six Sigma Hackathon team project

What your tool IS. Your agent reads this before every task. Where the code and this file
disagree, the code is the bug: change this file first, then the code.

Most of this page is already decided by the event and the [rubric](docs/criteria.md).
**Only the `FILL IN` lines change, and you do not have to write them by hand:** describe your app and ask your agent to update them. They depend on the prompt your team picks at kickoff
(prompts are secret until then, see [`docs/prompts.md`](docs/prompts.md)) and on your team.
The examples after each `FILL IN` show the shape of an answer. They are not hints about the prompts.

## 1. Team and prompt
- **Team name:** **team-lattice** (confirmed by the team). Product: **ResponseWatch**.
- **Track:** On-campus, 24-hour sprint; submission deadline October 17, 2026 at 13:00 America/New_York (confirmed by the team).
- **Prompt we chose:** **Prompt 2 — Health Systems: Emergency Response**, as recorded in [A’s data codebook](data/README.md). Ambulance dispatch-to-scene times vary across city zones; monthly averages hide severe outliers and where/when failures occur. Build a statistical tool to support investigation and identify zones needing attention.
- **Our public repo:** https://github.com/GreatBear7/team-lattice

## 2. User and use case (rubric: scope 5, user and use case 5)
- **User:** An on-duty supervisor at a 911 dispatch center, reviewing completed high-priority ambulance incidents.
- **Decision the tool helps them make, and when:** After loading a batch of completed incidents, decide which district, time band and response stage needs investigation; distinguish chronic service-target failures from deterioration against a district’s own baseline, and inspect severe individual delays even without an aggregate signal.
- **Why this matches the prompt:** Zone-level late rates, P90, daily control charts and time-of-day evidence reveal delays that citywide monthly averages hide; the current deliverable supports retrospective batch review rather than live dispatch logging.

## 3. Inputs (rubric: minimal inputs 5)
Only what this user can actually measure or already knows. Fewer is better; every input a user
cannot measure costs points.

| Input | Type and units | Where the user gets it |
|---|---|---|
| `incident_id`, `zone_id` | Unique incident ID; district A–F | Existing CAD incident ID and address-to-response-district assignment; no new manual logging |
| `call_received_at`, `unit_notified_at`, `unit_en_route_at`, `on_scene_at` | Four ISO 8601 timestamps with UTC offsets; derived durations in minutes | CAD/call-center and crew status timestamps; one completed response per row |
| `priority` | Optional text; if present only `high` rows are analyzed; otherwise all rows assumed in scope | Existing CAD urgency classification |
| `dispatcher_id`, `unit_id` | Optional contextual identifiers, no staff ranking | CAD assignment records |
| Scenario or uploaded CSV | Built-in three scenarios, or UTF-8 CSV ≤25 MiB with the six required columns above | Synthetic datasets supplied by A, or a completed-incident batch in the same schema |
| Analysis settings | T=12 min, q=0.10, first 14 local calendar days as baseline; full/later monitoring, time-of-day window full or latest 7 days, hourly pooling 1 or 3 | Fixed demo targets and UI display choices; not clinical standards |

## 4. The statistics, and why (rubric: valid QC analysis 25)
Say the method in words before any code exists. Load the `stats-first-steering` skill first.
- **Method:** Convert offset-aware timestamps to America/New_York. Define response R = on_scene_at − unit_notified_at in minutes, and late = R > T, with demo T = 12 minutes and q = 10%. Freeze each zone’s pooled late proportion p0 from the first 14 local calendar days. Use a daily p chart with CL=p0, UCL=min(1,p0+3√(p0(1−p0)/n)), LCL=max(0,p0−3√(p0(1−p0)/n)); flag deterioration only when monitoring p > UCL (strict equality does not flag; no extra run rules). Separately label full-period p > q as above service target. Compare each zone’s five pooled time bands to its own frozen band baseline using the H-11 pooled two-proportion test: z=(p_monitor−p_base)/√(p_pool(1−p_pool)(1/n_monitor+1/n_base)); flag only z > 3. Band limit lines are the equivalent test boundaries, not daily p-chart limits. Report empirical median/P90, stage summaries and the five slowest completed responses. Hourly/clock colors show descriptive late-rate changes in percentage points, with no hourly significance test.
- **Why it fits the use case:** Late/not-late is a binary outcome suited to a proportion chart; district-specific frozen baselines preserve different travel profiles, while P90, individual incidents and pooled time bands expose long-tail and localized patterns hidden by means or daily aggregation.
- **Assumptions and how the tool checks them:** Incidents should be comparable high-priority completed responses with approximately independent binary outcomes and a stable, representative baseline; these process assumptions require supervisor judgment and are not proven by the software. Validate required fields, unique incident IDs, A–F zone IDs, timezone offsets and ordered timestamps. A zone needs 14 nonempty baseline days and at least five late/five non-late baseline incidents. Daily limits/flags require 0<p0<1 and n·p0≥5, n·(1−p0)≥5. Time bands require an adequate zone baseline, at least five baseline late/five non-late incidents within the band, and monitoring expected late/non-late counts ≥5 under its band baseline rate. Empty/insufficient groups return explicit status and null limits/flags, never a false all-clear. Use 30 unadjusted exploratory zone-band comparisons; chance flags can occur. The 144 hourly cells are descriptive and mark missing/limited evidence. Circular three-hour pooling adds no independent evidence. Do not infer causes, clinical outcomes or staff fault from signals.
- **Known-answer check:** `tests/test_qc.py`: p0=0.10, n=100 gives CL=0.10, UCL=0.19, LCL=0.01; 20 late flags, 19 late does not. `tests/test_bands.py`: baseline 120/600 and monitoring 180/600 give pooled p=0.25, SE=0.025, z=4.0 and a signal; exact z=3 is not a signal. Existing tests also cover no rows, no late/all late, inadequate baseline, timestamp/band boundaries, planted changes and API/QC numerical agreement. Run `bash app/verifyme.sh` for full acceptance.

Fixed for every team:
- The statistic lives in **one plain, tested function** (`app/qc.py` or `app/qc.R`). The API, app or
  package only calls it and displays the result. No statistics inside UI code.
- Every statistic has a test against a known answer and a degenerate case (constant data, n = 1, missing values).
- You can explain every number the tool prints. If you cannot, it is not done.

## 5. Delivery (rubric: working tool 25)
- **Stack:** React dashboard + Python FastAPI REST API, pandas/NumPy statistics in `app/qc.py`; one FastAPI process serves the built UI and API from the same origin. Static CSV batches, no database. `bash app/testme.sh` bootstraps dependencies, builds in API mode and starts http://127.0.0.1:8000/.
- **Starting demo:** FastAPI deployment/scaffold conventions from `demos/fastapi/`, combined with React/Vite frontend conventions from `demos/reactfront/`. The integrated deliverable is `app/`, preserving `testme.sh`, `manifestme.sh`, `deployme.sh` and `README.md`; this records the actual combined implementation rather than claiming only one demo was copied.

Fixed for every team:
- Start from **one** demo in `demos/`, copied to `app/`. Keep its four-script contract
  (`testme`, `manifestme`, `deployme`, `README.md`); `testme` starts the tool with one command.
- Deployed on the course **Posit Connect** server with a public URL (publisher key handed out at the
  event). **Current status: local UI/API verified; public deployment and logged-out URL acceptance remain pending by the user’s choice.** Deploy early: copy one workflow from
  [`.claude/skills/connect-publish/workflows/`](.claude/skills/connect-publish/workflows/).
- A small tool that runs beats a large tool that does not.

## 6. Outputs
- **What the user sees:** A compact supervisor dashboard: flat Normal/Recovery/Morning tail scenario selection or CSV upload; six-district late rate (%) and response P90 (minutes); separate service-target and deterioration labels; selected-zone daily p chart with nearest-date inspection; zone×hour heatmap, selectable 24-hour clock and five-band comparison; baseline/monitoring call-handling, turnout and travel median/P90; and the five slowest completed responses with timestamps. Select a district to link the evidence. Full-period/latest-seven-day and raw/pooled-three-hour options affect time-of-day views only. Summary, daily charts and slowest calls retain full monitoring coverage. Call handling precedes R; stage quantiles cannot be added. Errors and insufficient evidence remain visible; API failure never substitutes mock data.
  Example: "a control chart with out-of-control points in red, plus 'stop the line: yes/no'"

## 7. Test datasets and codebook (rubric: demo 10, datasets 5, codebook 5)
2-3 small CSVs in `data/`, invented but shaped like real field data, each showing one behavior.
`data/README.md` is the codebook: every file, every column with units, and what it would take to
collect this data for real.
- **Datasets:** `data/normal.csv` (no planted deterioration), `data/recovery.csv` (C deterioration October 1–6, returning to baseline conditions October 7), `data/morning_tail.csv` (D severe travel delays at 06:00–10:00 from October 1). Each has 16,800 fictional incidents: 6 zones × 28 days × 100 calls/zone/day, September 14–October 11, 2026; common baseline September 14–27, monitoring September 28–October 11; seed 5300. A/B are downtown, C/D residential, E/F outer/semi-rural, with invented travel profiles. The generator and codebook are in `data/`; `scenario_truth.json` is test/demo ground truth only and is never read by production statistics. Built-in runtime copies in `app/scenario_data/` are tested byte-identical to the originals.

## 8. Documentation and reproducibility (rubric: docs 10, public repo 5)
- `README.md` says what the tool does, for whom, every input and parameter, how to run it in one
  command, and walks through the demo on each test dataset.
- Public GitHub repo; a fresh clone runs `testme` and the tests pass with no extra steps.
- Submit on Devpost: the repo link plus a demo.

## 9. Out of scope
What we will NOT build, so nobody (human or agent) builds it by accident.
- Default: logins, databases, real customer data, a second statistic before the first one is tested.
- No simulated/live incident stream, unfinished-call prediction, incident write/edit workflow, dispatcher performance ranking, causal diagnosis, clinical outcome prediction, optimization/forecasting, X-bar/S production chart, or scenario-truth-driven analysis. Uploads are transient in-memory datasets (ten retained plus three built-ins), one worker/process; restart requires re-upload. Authentication, persistent/multi-process storage and Supabase are outside this local version.
