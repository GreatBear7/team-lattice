# ResponseWatch supervisor dashboard — C H-04

English, desktop-first response-quality workspace. The frontend is ready for D's API implementation; its default preview uses precomputed output from A's committed synthetic CSVs and B's unchanged statistics. It is not a live dispatch feed.

## Run and verify

```bash
npm --prefix app/frontend ci
npm --prefix app/frontend run dev -- --host 127.0.0.1
npm --prefix app/frontend test
npm --prefix app/frontend run build
```

Open the printed local URL in a full browser window. Desktop 1280×720 and larger keeps all six districts, the selected evidence and five longest incidents on one screen. Narrow screens put the main evidence first, then districts and severe incidents. Wide charts/tables scroll locally.

## Operator flow

1. Choose **Normal operations**, **Recovery · Zone C**, or **Morning tail · Zone D**. The opening brief and initial selection derive from supplied daily/band results, never `scenario_truth.json`.
2. Inspect the selected zone in the large right instrument. **Where & when** shows a six-zone × 24-hour heatmap or five pooled time bands. **Daily p chart** exposes frozen-baseline limits, date inspection and a cohort table. **Delay stages** compares separate baseline/monitoring medians and P90s.
3. Keep service acceptability, statistical change and severity separate: amber late rates exceed q; the Change column distinguishes daily and exploratory band signals; severe individual incidents remain visible without a flag. Incident IDs select their zone. All/selected-zone scope and timestamps are local to the incident table.
4. **Preview data / API data** opens source settings and interpretation. API mode adds CSV upload, visible request errors and row/field validation errors. No API error falls back to preview data.

The 7/14-day window and raw/circular 3-hour aggregation affect **time-of-day views only**. Other summary figures, daily chart, stages and incidents stay on the full 14-day monitoring period. Baseline is always frozen. Black outlines use supplied same-window band flags; hourly colors are descriptive on a fixed ±25 percentage-point scale. Grey hatch preserves missing/insufficient evidence, including a real zero change with insufficient status. Three-hour readouts name the pooled hours.

## Latest fixture source

`src/mocks/{normal,recovery,morning_tail}.json` each contain `{summary, analyses: {A,...,F}, hourly_views}`. Four hourly variants (`14_1`, `7_1`, `14_3`, `7_3`) are precomputed, not calculated in the browser. `source.json` records Git object IDs and SHA-256 input hashes.

- Verified merged dev: `f6a1e5264e79fad547806cc7697893e9ff770263`.
- Data last change: `9853338b31dcc761860ede9b549208029c877251`.
- Statistics last change: `f8b0641be25270d0ea84bd46f024f2def801f194`.
- Each CSV: 16,800 complete high-priority incidents; 8,400 shared baseline incidents Sep14–27 and 8,400 monitoring incidents Sep28–Oct11, six functional zones. A/B downtown; C/D residential; E/F outer. Fixed seed5300.
- Normal: no daily flags; C's evening band has an exploratory chance signal. Recovery: C flags Oct1–6, then returns below daily limits; historical and pooled flags remain. Morning tail: no daily flags, D's morning band is flagged (37.1% versus17.9% baseline, UCL24.9%); longest response41.6min. B–F are above q in all three datasets.
- Reconciled all18 zone/scenario views and daily/band counts; all12 hourly variants have144 cells. Raw views have44 insufficient cells; pooled3-hour views have none. No frontend statistical formulas, X-bar/S chart, clock, causal inference or incident-write API is invented.

The previous `hidden_tail` fixture and manually authored API mock numbers are superseded for this frontend. The team API contract remains unchanged. A's codebook is now present on dev.

## Connect D's backend

The HTTP client is implemented in `src/api/client.js`. Use the on-screen source settings or build-time environment:

```bash
VITE_DATA_SOURCE=api VITE_API_BASE=/api npm --prefix app/frontend run dev -- --host 127.0.0.1
```

Vite proxies `/api` to `http://127.0.0.1:8000` and strips `/api`; override the target with `API_PROXY_TARGET` if needed. Production deployment must serve/proxy the same prefix or build with D's chosen `VITE_API_BASE`. `VITE_*` values are public browser configuration, never secrets.

Client sequence: GET `/health`, POST `/datasets/load` (scenario JSON or multipart `file`), GET `/zones/summary`, GET all six `/zones/{id}/analysis`. Hourly controls request `/zones/summary?window=7|14&smooth=1|3`. The client sends returned `dataset_id` on reads; D should honor it to avoid concurrent users replacing one another's in-memory dataset. Each selection aborts stale requests. Strict core-shape errors are actionable; missing H-10 fields leave the other analyses usable and show unavailable hourly evidence.

D owns actual validation/statistics execution, dataset isolation, FastAPI routes, serving `dist/`, testme and public deployment. The C checks use a **test-only fixture HTTP harness** to verify the transport, upload and error path; this does not claim a real D backend is complete. H-04 overall remains in progress until end-to-end backend acceptance passes.

## Validation

62 Vitest assertions/tests cover client requests, cancellation, malformed/failed HTTP responses, multipart upload, immutable fixtures, frozen baseline, counts, independent signals, P90, heatmap evidence masks and keyboard structure. Production build passes. Browser checks cover all three scenarios, 7/14-day and1/3-hour views, keyboard heatmap selection, charts/tables, source mode, CSV422 and API503. Source tests and the smoke harness do not claim B's complete pytest suite ran in this frontend session.
