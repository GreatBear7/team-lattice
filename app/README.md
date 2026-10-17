# ResponseWatch: local CSV application

For an on-duty 911 dispatch supervisor investigating late ambulance responses. React and FastAPI run at one address; every API number comes from B's unchanged `qc.py`. No live stream, database or Supabase is needed.

## Start

Requires Python 3.12 (the version the course Connect server runs) and Node.js 20+ with npm. From the repository root:

```bash
bash app/testme.sh
```

This creates `.venv`, installs pinned runtime dependencies, builds the UI in **API mode**, and starts one server. Open **http://127.0.0.1:8000/** for the home page. Dashboard: **http://127.0.0.1:8000/app**; quick guide: **http://127.0.0.1:8000/guide**; interactive API documentation is at **http://127.0.0.1:8000/docs**. Stop with Ctrl-C. If port 8000 is occupied, run `RESPONSEWATCH_PORT=8001 bash app/testme.sh`. First run needs network access to install packages. Do not open `dist/index.html` directly: the API requires the running server.

For frontend development, leave the backend running and run `VITE_DATA_SOURCE=api npm --prefix app/frontend run dev`; Vite proxies `/api` to port 8000. The standalone HTML shared earlier remains an offline, precomputed preview.

## Input and interpretation

Select Normal operations, Recovery, or Morning tail. Each loads all six zones from A's 16,800-row synthetic CSV, with a common 14-day baseline and 14 monitoring days. Recovery plants a temporary deterioration in C; Morning tail concentrates delays in D's morning rush. They are fictional scenarios, not real patient records.

To analyze another CSV, open **API data → Upload completed incidents**. Required columns: `incident_id`, `zone_id`, `call_received_at`, `unit_notified_at`, `unit_en_route_at`, `on_scene_at`. The standard nine-column files also include `priority`, `dispatcher_id`, and `unit_id`. See [data codebook](../data/README.md) for definitions and units. IDs must be unique; zones must be A–F; timestamps need UTC offsets and chronological order. If priority is supplied, only high-priority rows enter analysis; exclusions are returned. If absent, all rows are assumed in scope. The first 14 local calendar days form the baseline; at least one later day is required. Upload limit: 25 MiB. Errors report CSV row/field/reason without replacing the active data.

Response R = unit-notified to on-scene, in minutes. Late means R > 12 min; q = 10% is a demo service target. A zone above q and a zone worse than its frozen baseline are independent labels. Daily p-chart limits come from B's QC module. Time-band signals use its H-11 pooled comparison (z > 3); hourly colors and clock views are descriptive. There are 30 unadjusted exploratory band comparisons. No chart proves a cause or dispatcher fault. Call handling precedes R; stage medians/P90s must not be added.

## API

Routes are available both at the root and under `/api`.

| Endpoint | Input / result |
|---|---|
| `GET /health` | Service health/version. |
| `POST /datasets/load` | JSON `{"scenario":"normal"}` (also `recovery`, `morning_tail`) or multipart `file`; returns dataset ID, rows, exclusions and windows. |
| `GET /zones/summary?dataset_id=...` | Six zone summaries, global slowest five, all-zone time bands and hourly changes. |
| `GET /zones/C/analysis?dataset_id=...` | Selected zone's summary, daily p chart, stages, slowest five and time bands. |

Summary accepts `window=14` (whole monitoring period) or `7` (latest seven, clamped to monitoring start), and `smooth=1` or `3` (raw/circular pooled hours). Analysis accepts `window`. These options affect time-of-day evidence only; main summary, daily chart and slowest calls retain the full monitoring period. Rates are proportions; hourly changes are percentage points; times are minutes. Missing/insufficient results remain null. See [API contract](../docs/api-contract/README.md).

The UI always sends `dataset_id`; uploads cannot overwrite another client's selected data. At most ten uploaded datasets are kept in memory, plus the three built-ins. Restarting clears uploads; an expired ID returns 409 with a reload message. Run **one worker / one application process** for this version. No persistent multi-worker storage, login, incident editing or simulated stream is implemented. The optional no-ID API default is only a compatibility convenience; clients should always send an ID.

## Verify and demo

```bash
bash app/verifyme.sh
```

Installs pinned test tooling, builds the UI, runs all statistics/API tests and frontend tests. API tests cover three scenarios, all zones, every supported window/smoothing option, exact agreement with QC results, upload isolation, bad inputs, timezone/DST shifts and dataset expiry. Follow [demo walkthrough](../demo/README.md) for a supervisor presentation.

## Deployment

`bash app/manifestme.sh` builds the production UI and writes an ASGI Posit Connect manifest locally. The bundle contains `api.py`, unchanged `qc.py`, pinned dependencies, exact scenario CSV copies and built frontend assets. Tests check the CSV copies match `data/`; update both copies when A changes data. The committed `frontend/dist` is a release snapshot used by manifest-based CI; never hand-edit it. After source changes, rebuild, regenerate the manifest and commit both. Relative API base `api` and Vite base `./` support Connect subpaths.

**Live at https://connect.systems-apps.com/response-watch/** (public, no login). Every merge to `main` that touches `*.py`, `requirements.txt`, `manifest.json`, `.python-version` or the workflow redeploys to the same address through `.github/workflows/deploy-fastapi.yml`, using the `CONNECT_SERVER` and `CONNECT_API_KEY` repository secrets; the workflow fails unless `/health` answers 200. Regenerate `manifest.json` only on a laptop with Python 3.12 (e.g. `uv venv --python 3.12 .venv`), because the server offers only 3.12.4.

To deploy by hand instead, put `CONNECT_SERVER` and `CONNECT_API_KEY` in ignored `app/.env`, then run `bash app/deployme.sh`. Never commit `.env`. The prepared GitHub workflow publishes on main (or manual dispatch) using repository secrets and checks health. Configure a single application process because uploads currently live in memory. No server URL or key is included in this repository.

## First-use navigation

Home (`/`) offers three dataset links (`app?dataset=normal`, `recovery`, `morning_tail`) and a direct dashboard entry. `/app` serves the integrated manager dashboard, with relative Home and Guide links; `/guide` defaults to a short onboarding path and folds CSV requirements and mathematical methods into disclosures. Relative navigation/assets/API URLs preserve the deployment content prefix. H12 is restored from `h12-home-guide` after its earlier merge/revert; runtime requirements and statistics are unchanged.
