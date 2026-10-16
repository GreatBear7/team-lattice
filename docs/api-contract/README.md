# ResponseWatch API contract (draft for team review)

The JSON shape the four core endpoints return, so C (front end), D (back end) and B (statistics)
can build in parallel. Source of truth for the statistics: [`../Final_Plan.en.md`](../Final_Plan.en.md)
sections 3, 5 and 7. Status: **draft by B, waiting for C and D to agree**.

## How to use it

- **C** builds the screens from the two `*.mock.json` files.
- **D** returns these files from the endpoints until `app/qc.py` is ready, then swaps in real calls.
- **B** makes `app/qc.py` produce exactly these fields (plus tests).
- Mock files carry `"mock": true`. Their numbers are invented (hidden_tail-like story) but
  internally consistent: every `ucl`/`lcl` is computed from the mock counts with the plan's formula.
- Changing a field name after agreement needs a message to all three of B, C and D.

## Conventions

- Times in **minutes**; rates as **proportions 0-1** (the UI formats as %). Mocks are rounded to 4
  decimals; the real API returns unrounded floats.
- Timestamps: ISO 8601 with offset, America/New_York (`-04:00` on these dates).
- `null` means "not available" (no data, insufficient evidence, or not applicable). **Never** read
  `null` as `false` or `0`, and the API never returns `0` in place of missing.
- `status` values:

| status | Meaning | UI shows |
|---|---|---|
| `ok` | statistic computed | the value / flag |
| `insufficient_evidence` | n*p0 < 5, n*(1-p0) < 5, p0 = 0 or 1, or < 5 late / non-late in a band baseline | "Insufficient evidence", grey, no red/green |
| `baseline_insufficient` | fewer than 14 nonempty baseline days or < 5 late / non-late baseline incidents | "Baseline insufficient", grey |
| `no_data` | n = 0 | "No data" (not 0%, not 0 min) |

- Two **independent** labels, never merged into one:
  - `above_service_target`: `late_rate > q` (q = 0.10, a demo setting, not significance)
  - `deterioration_flag`: some monitoring day had `p > ucl` (strict) against the zone's own frozen baseline
- `p90_warning`: `"small_sample"` when n < 20, else `null`.

## Endpoints

### `GET /health`

```json
{ "status": "ok", "version": "0.1.0" }
```

### `POST /datasets/load`

Request, one of:
- JSON `{ "scenario": "normal" | "hidden_tail" | "recovery" }`
- multipart form upload, field `file` = a CSV with the schema in Final_Plan section 3

Response 200:

```json
{
  "dataset_id": "hidden_tail",
  "source": "scenario",
  "rows": 16800,
  "zones": ["A", "B", "C", "D", "E", "F"],
  "date_range": { "start": "2026-09-14", "end": "2026-10-11" },
  "baseline": { "start": "2026-09-14", "end_exclusive": "2026-09-28T00:00:00-04:00", "days": 14 },
  "excluded": { "count": 0, "reasons": [] }
}
```

Response 422 (invalid upload; nothing loaded):

```json
{
  "errors": [
    { "row": 17, "field": "on_scene_at", "reason": "missing timestamp" },
    { "row": 42, "field": "unit_en_route_at", "reason": "earlier than unit_notified_at" },
    { "row": 88, "field": "incident_id", "reason": "duplicate id INC-B-0088" }
  ]
}
```

The loaded dataset lives in server memory; after a restart the UI must load again.

### `GET /zones/summary`

Example: [`zones_summary.mock.json`](zones_summary.mock.json). Top level: `scenario`, `units`,
`settings` (`T_min`, `q`, `priority`, `timezone`), `baseline`, `monitoring`, `excluded`, `zones[]`,
`slowest_incidents[]` (five slowest across all zones).

Each `zones[]` item:

| Field | Type | Meaning |
|---|---|---|
| `zone_id`, `zone_type` | string | `A`-`F`; `downtown` / `residential` / `outer` |
| `n`, `late`, `late_rate` | int, int, float | monitoring window (days 15-28), late means R > T |
| `p90_min`, `p90_warning` | float, string or null | monitoring-window P90 of R (linear interpolation) |
| `baseline_n`, `baseline_late`, `p0` | int, int, float | frozen first-14-day baseline |
| `above_service_target` | bool or null | `late_rate > q` |
| `deterioration_flag` | bool or null | any monitoring day `p > ucl` |
| `deterioration_days`, `first_flag_date`, `last_flag_date` | int, date or null | when it flagged |
| `status` | string | see table above |

### `GET /zones/{zone_id}/analysis`

Example: [`zone_C_analysis.mock.json`](zone_C_analysis.mock.json). Top level adds:

- `summary`: the same object as this zone's `zones[]` item.
- `daily_p_chart`: `status`, `p0`, `baseline_n`, `baseline_late`, `baseline_days`, and `points[]`
  (28 days), each `date`, `phase` (`baseline` / `monitoring`), `n`, `late`, `p`, `cl`, `ucl`,
  `lcl`, `deterioration_flag` (`null` on baseline days), `above_service_target`, `status`.
- `stages[]`: `call_handling`, `turnout`, `travel`, each with `from` / `to` columns,
  `baseline_median_min`, `monitoring_median_min`, `monitoring_p90_min`.
- `time_of_day`: `exploratory_note` and `bands[]`, each `band`, `label`, `interval_local`,
  `baseline_n`, `baseline_late`, `p0_band`, `n_band`, `monitoring_late`, `p_band`, `ucl`, `lcl`,
  `flag`, `status`. Bands are half-open, by local `unit_notified_at`.
- `slowest_incidents[]`: up to five, this zone only, ordered by `response_min` descending then
  `incident_id` ascending; each `incident_id`, `zone_id`, `unit_notified_at`, `on_scene_at`,
  `response_min`, `minutes_over_target` (= max(0, R - T)). Empty zone: `[]`.

Unknown `zone_id`: 404 `{ "error": "unknown zone" }`. No dataset loaded: 409
`{ "error": "no dataset loaded" }`.

## What the mock data shows (so C can build every state)

- A, B (downtown): under the 10% target, not flagged.
- C (residential): above target **and** flagged from 2026-10-01 (day 18); travel median rises.
- D (residential): just above target (0.12), not flagged.
- E, F (outer): above target (~0.22-0.24), **not** flagged: chronically slow, not newly worse.
- Zone C bands: morning rush, midday and evening rush flagged; night ok; late evening
  `insufficient_evidence` (only 3 late baseline incidents).
