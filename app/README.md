# ResponseWatch API

A FastAPI service that runs the ResponseWatch quality-control statistics (`qc.py`) on ambulance
response-time data: a daily p chart per zone against a frozen 14-day baseline, time-of-day bands,
stage medians and P90s, and the slowest calls. `api.py` only loads data and arranges `qc.py`'s
output into JSON; it computes no statistics itself. Full field list:
[`docs/api-contract/README.md`](../docs/api-contract/README.md).

## Endpoints

Every route is also served under `/api` (for example `/api/health`).

| Route | What it does |
|---|---|
| `GET /health` | `{"status": "ok", "version": "0.1.0"}` |
| `POST /datasets/load` | JSON `{"scenario": "normal" \| "recovery" \| "morning_tail"}`, or a multipart CSV upload in field `file`. Returns `dataset_id`, rows, zones, date range, baseline window. A bad upload returns 422 with row-level `errors`. |
| `GET /zones/summary` | All six zones: late rate, P90, baseline p0, `above_service_target`, `deterioration_flag`. Query: `dataset_id`, `window` = `14` or `7`, `smooth` = `1` or `3`. |
| `GET /zones/{zone_id}/analysis` | One zone (`A`-`F`): daily p chart points with UCL/LCL, stages, time-of-day bands, slowest incidents. Query: `dataset_id`, `window`. |
| `GET /docs` | Interactive OpenAPI docs. |
| `GET /` | The front end if `frontend/dist` is built, otherwise a short JSON pointer to `/docs`. |

The loaded dataset lives in server memory; after a restart, load it again.

## Run it locally

```bash
./testme.sh        # uses ../.venv/bin/python if it exists, else python
```

Then open http://127.0.0.1:8000/docs. Tests run from the repo root:
`.venv/bin/python -m pytest tests/`.

## Front end from the same app

When `frontend/dist/index.html` exists, `api.py` serves it at `/` and its files at `/assets`.
Build it with:

```bash
VITE_DATA_SOURCE=api VITE_API_BASE=api npm --prefix app/frontend run build
```

**Note for the front end:** on Posit Connect the app lives under a sub-path
(`https://<server>/content/<id>/`), not at the server root. So:

- call the API with a **relative** base: `VITE_API_BASE=api`, not `/api` (a leading slash goes
  to the server root and misses the app);
- use API mode: `VITE_DATA_SOURCE=api`;
- make asset links relative too (Vite `base: './'`), for the same reason.

After building `dist`, re-run `./manifestme.sh` so the manifest lists the new files.

## Deploy to Posit Connect

The publisher key and server address are handed out at the event. They never go in a file that
is committed: use GitHub repo secrets `CONNECT_SERVER` and `CONNECT_API_KEY`, or a gitignored
`app/.env` for a local deploy.

1. `./manifestme.sh` writes `manifest.json` on your machine (entrypoint `api:app`, mode
   `python-fastapi`, Python from `.python-version`). It bundles `api.py`, `qc.py`,
   `requirements.txt`, `.python-version`, `scenario_data/*.csv` and `frontend/dist` if built; it
   leaves out `frontend/node_modules`, front-end sources, `tests`, `__pycache__` and `.env`.
   Commit `manifest.json`. Re-run it after any change to dependencies, files or `dist`.
2. **Local deploy:** `./deployme.sh` (reads `app/.env` if present).
3. **GitHub Actions:** `.github/workflows/deploy-fastapi.yml` (with `APP_DIR: 'app'`,
   `HEALTH_PATH: '/health'`) ships the committed manifest on every push to `main` and waits for
   `/health` to answer 200. It never regenerates the manifest. The bundle is exactly the files the
   manifest lists, so every one of them must be committed: the repo's `.gitignore` ignores
   `dist/`, so a manifest that lists `frontend/dist` needs that folder committed
   (`git add -f app/frontend/dist`) or the deploy stops with "stale manifest".

Dependencies are pinned with `==` in `requirements.txt` (runtime only; `pytest` stays in the repo
venv).
