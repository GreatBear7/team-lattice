# ResponseWatch

**Live:** https://connect.systems-apps.com/response-watch/ (public, no login; first load takes a few seconds while the server wakes the app).

A compact ambulance response quality dashboard for an on-duty 911 dispatch supervisor. Load synthetic scenarios or upload a completed-incident CSV; investigate **where, when and which response stage** needs attention using frozen-baseline daily p charts, time-band comparisons, hourly/clock views and severe individual delays.

## Run the complete application

Requires Python 3.12 (the version the course Connect server runs) and Node.js 20+ / npm. From this folder:

```bash
bash app/testme.sh
```

Open **http://127.0.0.1:8000/** for the home page; choose a dataset or enter the dashboard at **http://127.0.0.1:8000/app**. The quick guide is at **http://127.0.0.1:8000/guide**. This command installs runtime dependencies in `.venv`, builds React in API mode and starts FastAPI serving both the website and statistics API. First run requires network access. Ctrl-C stops the service. API docs: http://127.0.0.1:8000/docs. The public app is available at https://connect.systems-apps.com/response-watch/.

- [Application setup, inputs, endpoints, parameters, tests and deployment](app/README.md)
- [Supervisor demo for all three datasets](demo/README.md)
- [Data codebook: every column, derived variable and zone](data/CODEBOOK.md)
- [Synthetic datasets: files, generation, scenarios and limitations](data/README.md)
- [API contract](docs/api-contract/README.md)
- [Final plan](docs/Final_Plan.md)

Every API statistic comes from `app/qc.py`; frontend charts display those results. Static batch input only: no live dispatch feed or database is required. Uploaded data lives in one server process and must be reloaded after restart. Required inputs are incident ID, zone A–F and four offset-aware timestamps; priority and dispatcher/unit IDs are supported as documented in the codebook. First 14 local days define baseline, all later days are monitoring. R is unit-notified to on-scene; late means >12 minutes and service target q=10% (demo values).

Run all checks with `bash app/verifyme.sh`. Normal operations has no deterioration signals; Recovery plants a temporary C shift; Morning tail concentrates D delays in the morning that daily aggregation can miss. Daily signals, service target breaches and exploratory band signals answer different questions. No chart establishes cause or staff fault; all records are fictional.

The original hackathon resources remain in [docs](docs/). Team registration/submission and public deployment are separate release steps.
