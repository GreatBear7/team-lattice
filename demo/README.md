# Three-minute supervisor demo

Start from the repository root with `bash app/testme.sh`, then open http://127.0.0.1:8000/. The top-right source reads **API data**. The left-bottom Manager insight changes with the selected district; its action links to the evidence. All numbers are computed from CSV by the backend, not the offline preview.

1. **Dataset 1 (normal):** inspect all six districts. There should be no daily or time-band deterioration signals. E/F can remain above the 10% service target: chronic coverage performance differs from a new deterioration.
2. **Dataset 2 (recovery):** select C, then Daily p chart. Six days (October 1–6) exceed UCL; the last days return below it. Where & when shows C's midday/evening exploratory band signals. Inspect Why to compare baseline and monitoring travel P90.
3. **Dataset 3 (morning_tail):** select D. Its full-period daily chart has no signals, but Where & when highlights 06:00–10:00. Morning band late rate is about 37.1% versus 17.9% baseline, UCL about 28.7%. Select latest seven days and pooled three hours; daily/main summaries should remain unchanged. Switch between hourly grid, 24-hour clock and band comparison. Manager insight highlights the morning late rate against its baseline even though daily totals show no deterioration; latest-seven-day insight should update to about 41.3%.
4. **Batch input:** API data → Upload completed incidents → choose `data/recovery.csv`. Return to evidence; C should reproduce the built-in Recovery results. Uploading malformed CSV shows row/field errors, with no silent preview fallback.

Interpretation: these are synthetic, historical, high-priority completed incidents. Thresholds are demo settings. Hourly colors are descriptive; band signals are exploratory and unadjusted. The tool guides investigation, not causal claims or individual staff ranking.

Independent HTTP examples (server running):

```bash
curl -s http://127.0.0.1:8000/api/health
curl -s -H 'Content-Type: application/json' -d '{"scenario":"recovery"}' http://127.0.0.1:8000/api/datasets/load
curl -s 'http://127.0.0.1:8000/api/zones/C/analysis?dataset_id=recovery'
curl -s -F file=@data/recovery.csv http://127.0.0.1:8000/api/datasets/load
```

Use the returned upload `dataset_id` in subsequent summary/analysis requests. Run `bash app/verifyme.sh` for automated numerical acceptance. A separate teammate walkthrough and public deployment remain release checks.
