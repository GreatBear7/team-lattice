# C H-04 acceptance — frontend

Base: merged dev88890e4 plus existing C185fbab. Preview statistics use unchanged B149cfbb and A9853338; exact hashes in src/mocks/source.json.

| Requested behavior | Verified result |
|---|---|
| Three scenario choices | Direct explained buttons; each keeps all six districts. Recovery changes C, Morning tail changes D mornings. |
| Visible district selection | Teal row frame and zone badge; clock ring frame/center follows the same selection; data fills unchanged. |
| Delay stages | Existing paired-dot chart retained; enriched grouped median/P90 table with a descriptive delta column and stage definitions. |
| Daily p chart | Pointer on blank plot and axis labels inspects nearest date; crosshair and tooltip; point keyboard/date selection retained. |
| Incident scope | Two direct buttons, all zones/current district. Five records fit at1280x720; timestamps expand locally. |
| Clock | A–F outer-to-inner24-hour rings; same144cells, mask, ±25ppscale and supplied band outlines as grid; local7/14day1/3h. |
| Mobile mode change | Clock→grid retains250px plot at390px; no page-horizontal overflow; rows/readout preserved. |
| Latest H-11 | Normal no band flags; Recovery C midday/evening; Morning D morning only, UCL28.7% at14days. |
| Errors/API | Strict core shape, cancellation, explicit mode, multipart file and422/503 paths; missing evidence never called normal. |

Commands completed:

```text
python3 app/frontend/scripts/generate-fixtures.py → PASS
npm --prefix app/frontend test → Tests 69 passed (69)
npm --prefix app/frontend run build → built successfully
latest-fixture local HTTP harness → passed:true, checks:25
```

Fixture adapter reconciles18zone/scenario views,180band comparisons and12hourly variants with144cells each. Only B functions compute statistics. The HTTP harness returns fixtures and does not analyze uploads; it validates transport rather than completing D’s backend. Browser checks cover all scenarios, direct scopes, selection, time controls, point-independent inspection, stage table and responsive grid/clock switching.

Independent Impeccable review: desktop/clock/table/controls accepted; mobilegrid-height finding corrected and scored resolved, disposition ship for that fix. No shipping raster assets, external fonts or CDNs.

D still owns actual FastAPI/statistics execution, dataset_id isolation, testme, serving dist and public deployment. H-04 global status stays in progress. SPEC H-01 placeholders remain team-owned and are not filled by guessing.
