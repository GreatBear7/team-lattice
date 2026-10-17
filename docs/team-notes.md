# Team notes: who does what, starting now

Plan: [`Final_Plan.en.md`](Final_Plan.en.md) (the only active plan). API shape:
[`api-contract/`](api-contract/README.md) (draft, agree within 10 minutes).
Updated 2026-10-16 by Saptarshi (B).

## How we work

- Branch from `dev` for your task (`h02-data`, `h03-stats`, `h04-frontend`, `h04-backend`), write
  only inside your task's paths, and open a small PR into `dev`. Someone else reviews stats PRs.
- `git pull` on `dev` before you start and whenever someone says they pushed.
- A change to a field name in `docs/api-contract/` needs a message to B, C and D first.
- Never put statistics anywhere except `app/qc.py`. No keys or passwords in any file.
- Next deadlines (ET): stats tests 18:30, working app 21:30, **public deploy 22:30**.

## B: statistics (Saptarshi), branch `h03-stats`

- Owns `app/qc.py`, `tests/`. Drafted the API contract and mocks.
- Next: daily p chart + known-answer tests (UCL 0.19 / LCL 0.01; d=19 no flag, d=20 flag), then
  late rate, P90, stages, slowest five, service-target label, then `late_rate_by_band`.
- Output of `qc.py` will match the field names in `docs/api-contract/`.

- **H-10 (time-of-day statistics) added in PR #1:** `late_rate_change_by_hour` (144 hourly cells
  for the heatmap and the 24-hour clock, optional 3-hour smoothing), a 7/14-day `monitoring_start`
  window, `bands_all_zones`, and `baseline_p90_min` in the stage summary. New API fields are in
  `docs/api-contract/README.md` ("Added in H-10"). For C and D, **after the core deploy**.

## A: data, branch `h02-data`

- Owns `data/`. Not blocked: start now.
- `data/generate_data.py` (seed 5300) -> `normal.csv`, `hidden_tail.csv`, `recovery.csv`,
  plus `scenario_truth.json` and `data/README.md` (codebook).
- Use the zone profiles in Final_Plan 4.1 (A/B 5 min, C/D 6 min, E/F 7.5 min routine travel),
  hourly weights and x1.3 rush (4.2). Column names exactly as Final_Plan section 3.
- Report realized per-zone baseline p0 and n*p0 (must be >= 5), and check zone C changes on
  day 18 (and day 24 in recovery). Tell B the realized numbers.

## C: front end, branch `h04-frontend`

- **After the core deploy (H-10 views):** a zone x hour grid heatmap and a 24-hour clock (one ring
  per zone, angle = hour), both from `hour_heatmap.cells`; colour = `change_pts` on a diverging
  red-blue scale, grey midpoint at 0, symmetric -25..+25 points (labels in points, not %);
  `insufficient_evidence` / `no_data` cells flat grey and hatched; black outlines from
  `time_of_day_all_zones` where `flag` is true; a 7-day / 14-day toggle. Previews:
  `ideas/heatmap/` and the clock images on `temp-ideas`. Colours are descriptive; only outlines
  are flags. Say so in a footnote.

- Owns `app/frontend/`. Not blocked: start from the mock files now.
- Screens: scenario picker / CSV upload, zone table (both labels separately), daily p chart per
  zone (CL, UCL, LCL, red flagged days), zone detail (stages, five time-band bars with UCL,
  five slowest incidents).
- Grey states: `insufficient_evidence`, `baseline_insufficient`, `no_data`. `null` is never 0
  or "normal". Format rates as %; the API sends proportions 0-1.
- Read `docs/api-contract/README.md` now and reply with any field you need renamed or added.

## D: back end and release, branch `h04-backend`

- **After the core deploy (H-10 fields):** add `hour_heatmap` and `time_of_day_all_zones` to
  `GET /zones/summary`, the `window` (7 / 14) and `smooth` (1 / 3) query parameters, and pass
  `baseline_p90_min` through in `stages[]`. All numbers come from `app/qc.py`; nothing computed in the API.

- Owns `app/` except `app/qc.py` and `app/frontend/`, plus `.github/workflows/`. Not blocked.
- Copy `demos/fastapi/` into `app/`, get `testme` running, return the mock JSON from
  `GET /health`, `POST /datasets/load`, `GET /zones/summary`, `GET /zones/{id}/analysis`.
- Serve C's React build from FastAPI (one app). **Deploy the mock version to Posit Connect
  early** (`connect-publish` skill); keys go in GitHub repo secrets only.
- When B's tests pass: swap the mocks for calls into `app/qc.py`; the JSON must not change.
- Upload validation (row, field, reason) can be built now; it is not statistics.
