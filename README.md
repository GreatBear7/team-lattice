# ResponseWatch

**Find where and when ambulance responses need attention.**

A decision-support dashboard for an on-duty 911 dispatch supervisor. ResponseWatch turns completed-incident CSVs into district comparisons, daily control charts and time-of-day evidence, with a plain-language briefing that explains what changed and what to check next.

**[Open the live app](https://connect.systems-apps.com/response-watch/)** · **[Docs](https://connect.systems-apps.com/response-watch/guide)** · **[Three-minute demo](demo/README.md)**

Built by **team-lattice** for the Cornell SYSEN 5300 Six Sigma Hackathon — Health Systems: Emergency Response. The demonstration uses fictional historical incidents, not a live 911 feed. The public app requires no login; its first load may take a few seconds.

## Why this dashboard?

A monthly average can hide a short deterioration or a recurring morning problem. ResponseWatch separates two questions:

- **Are we meeting the service target?** A district can be consistently slow without a new change.
- **Has performance become worse than its own baseline?** A recent shift needs investigation, even when aggregation hides it.

Districts have different fictional travel profiles: A/B are downtown, C/D residential, and E/F outer or semi-rural. They have their own frozen baselines, rather than being treated as identical districts.

## First visit

1. Open the home page and choose one of the three datasets, or enter the dashboard.
2. Select a district in **District overview**. Its **Response briefing** gives a conclusion and a large contextual metric.
3. Use **What changed?**, **What to check?** and **Limits** to interpret the result, then follow the link to its supporting chart.

The dashboard provides three analysis tabs:

| View | What it answers |
|---|---|
| **Daily p chart** | Which days had an unusually high share of late calls? Move across the plot to inspect a day; arrow keys are also supported. |
| **Where & when** | Which districts and hours need attention? Switch between the hourly heatmap, 24-hour clock and five-band comparison. |
| **Why** | Which response stage looks different? Compare call handling, turnout and travel using medians and 90th percentiles. These comparisons suggest investigation, not a proven cause. |

The briefing follows the selected dataset, district and time-band window. It is generated from validated statistics and explicit interpretation rules; it does **not** call an external AI service. Home and Docs links remain available from the dashboard.

## Three reproducible datasets

Each CSV has **16,800 incidents**: six districts × 28 days × 100 calls per district per day. September 14–27, 2026 is the baseline; September 28–October 11 is monitoring. Generation uses seed **5300**.

| Dataset | File | What to look for |
|---|---|---|
| **1 · Normal** | [normal.csv](data/normal.csv) | No deterioration signals. Outer districts can still exceed the service target, illustrating a chronic coverage issue. |
| **2 · Recovery** | [recovery.csv](data/recovery.csv) | District C slows temporarily on October 1–6, then returns to its usual range. Its daily chart flags those six days. |
| **3 · Morning tail** | [morning_tail.csv](data/morning_tail.csv) | District D has severe delays concentrated at 06:00–10:00. Daily aggregation shows no control-limit signal, while the morning-band comparison identifies the change. |

In Dataset 3, D's full-monitoring morning late rate is approximately **37.1%**, compared with **17.9%** at baseline. This is the central demonstration of why a monthly or daily summary alone is insufficient.

See the [data generation notes](data/README.md) for assumptions and realized baseline rates, and the [variable-by-variable codebook](data/CODEBOOK.md) for field definitions. Scenario truth is used for testing and demonstration, not to produce application statistics.

## Run locally

Requires **Python 3.12** and **Node.js 20+ with npm**. Ensure `python3` resolves to Python 3.12 before the first run, or create `.venv` with Python 3.12 yourself.

```bash
git clone https://github.com/GreatBear7/team-lattice.git
cd team-lattice
bash app/testme.sh
```

The script creates a virtual environment, installs runtime dependencies, builds React in API mode and starts FastAPI. The first run needs network access. Stop with **Ctrl-C**.

| Page | Local address |
|---|---|
| Home | http://127.0.0.1:8000/ |
| Dashboard | http://127.0.0.1:8000/app |
| Docs | http://127.0.0.1:8000/guide |
| Interactive API documentation | http://127.0.0.1:8000/docs |

If port 8000 is occupied:

```bash
RESPONSEWATCH_PORT=8001 bash app/testme.sh
```

Use the running server rather than opening a built HTML file directly: the dashboard needs the analysis API. No database or Supabase setup is required.

## Analyze your own CSV

In the dashboard, choose **API data → Upload completed incidents**. Upload a UTF-8 CSV, up to **25 MiB**, with these required columns:

| Column | Meaning |
|---|---|
| `incident_id` | Unique incident identifier |
| `zone_id` | Response district, A–F |
| `call_received_at` | Time the call was received |
| `unit_notified_at` | Time the unit was notified |
| `unit_en_route_at` | Time the unit started travelling |
| `on_scene_at` | Time the unit arrived |

Timestamps must include UTC offsets and follow chronological order. Analysis uses America/New_York local dates and hours. The first 14 local calendar days form the baseline; at least one later monitoring day is required. Insufficient district or comparison data is reported as unavailable, not as an all-clear result.

The standard nine-column files also contain `priority`, `dispatcher_id` and `unit_id`. If priority is present, only high-priority incidents enter analysis; if absent, all rows are assumed in scope. Validation errors identify the row, field and reason without silently replacing the active dataset. See the [codebook](data/README.md) and [application documentation](app/README.md) for exact input rules.

## How to interpret the numbers

- **Response time:** minutes from unit notification to arrival on scene. Call handling precedes this interval.
- **Late:** response time **greater than 12 minutes**. The service target is at most **10%** late calls. These are demonstration settings, not clinical standards.
- **Daily change:** each district's first 14 days define a frozen pooled baseline late rate. Daily p-chart limits use ±3 standard errors, clipped to 0–100%; a monitoring day strictly above the upper limit is flagged when validity checks pass.
- **Time-band change:** five pooled time bands per district use a two-proportion comparison that includes uncertainty in both baseline and monitoring rates; an upper signal requires **z > 3**. The 30 comparisons are exploratory and unadjusted for multiplicity.
- **Hourly patterns:** heatmap and clock colors are descriptive. Optional circular three-hour pooling changes the view, not the number of independent alarms.
- **Stage summaries:** medians and 90th percentiles are descriptive and must not be added together.

The latest-seven-day option affects time-of-day comparisons; district headline metrics and the daily chart retain the full monitoring period. A chart signal does not establish a cause or individual staff fault. An above-target district and a newly deteriorating district may need different operational responses.

## Architecture and API

```text
Completed-incident CSV → FastAPI → tested statistics in qc.py → React dashboard
```

React/Vite and FastAPI are served at one address. Charts display backend results rather than recomputing statistical decisions in the browser.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Check service health |
| `POST /api/datasets/load` | Load a built-in scenario using JSON, or upload a CSV using multipart field `file`; returns a dataset ID |
| `GET /api/zones/summary?dataset_id=...` | Retrieve district summaries and time-of-day evidence |
| `GET /api/zones/C/analysis?dataset_id=...` | Retrieve the selected district's daily chart, stages and band comparisons |

Always use the returned `dataset_id`. Summary accepts `window=14` (full monitoring period) or `7` (latest seven days), plus `smooth=1` or `3`; district analysis accepts `window`. Rates are proportions from 0 to 1, hourly changes are percentage points, and durations are minutes. Missing values remain null. Additional response fields and root-route aliases are documented in [app/README.md](app/README.md) and the [API contract](docs/api-contract/README.md).

Uploads live in server memory: up to ten uploaded datasets plus the three built-ins. Restarting clears uploads; expired datasets must be reloaded. This version runs with **one application process / one worker**. It has no persistent database, authentication, incident editing or simulated real-time ingestion.

## Verification

```bash
bash app/verifyme.sh
```

This installs test dependencies, builds the frontend and runs the statistics/API and frontend suites. The integrated implementation was verified with **224 Python tests** and **76 frontend tests**, plus desktop navigation and scenario checks. Coverage includes known statistical answers, exact decision boundaries, empty/insufficient inputs, timezone handling, upload isolation and agreement between API results and the statistics module.

Follow the [three-minute demo](demo/README.md) to reproduce the three scenario outcomes. A fresh-clone walkthrough by another teammate remains a separate acceptance check.

## Project map and deployment

| Path | Contents |
|---|---|
| [app/](app/README.md) | FastAPI service, statistics module, React frontend and run/deployment scripts |
| [data/](data/README.md) | Generator, canonical scenario CSVs and codebook |
| [tests/](tests/) | Python statistics, data and API tests |
| [demo/](demo/README.md) | Supervisor demo and HTTP examples |
| [SPEC.md](SPEC.md) | Product scope and technical specification |
| [CONTRACT.yaml](CONTRACT.yaml) | Team task ledger and acceptance criteria |
| [Final plan · English](docs/Final_Plan.en.md) / [中文](docs/Final_Plan.md) | Agreed project plan |

The deployed app runs on the course **Posit Connect** server. The [deployment workflow](.github/workflows/deploy-fastapi.yml) publishes eligible changes on `main` and checks service health. Production uses relative asset/API paths so Home, Docs and Dashboard work under the deployment URL prefix. Build and manifest instructions are in [app/README.md](app/README.md#deployment); credentials belong in repository secrets or an ignored local environment file.
