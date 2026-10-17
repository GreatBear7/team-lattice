"""ResponseWatch REST API: a thin FastAPI layer over app/qc.py (contract: docs/api-contract/README.md).

Every number comes from qc.py; this file only loads data, picks the baseline and monitoring
windows, and arranges qc's outputs into the agreed JSON. No statistics are computed here.

Run locally:  ./testme.sh   (http://127.0.0.1:8000/docs)
Entrypoint for Posit Connect:  api:app
"""
import csv
import io
import math
import sys
import threading
import uuid
from collections import OrderedDict
from datetime import datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import qc  # noqa: E402  (app/qc.py, the statistics)

VERSION = "0.1.0"
SCENARIO_DIR = HERE / "scenario_data"  # byte-identical copies of data/*.csv (checked by tests)
SCENARIOS = ("normal", "recovery", "morning_tail")
ZONES = tuple(qc.ZONE_TYPES)  # A-F
BASELINE_DAYS = 14
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_UPLOADS_KEPT = 10
MAX_ERRORS_SHOWN = 200
TZ = ZoneInfo(qc.TIMEZONE)

UNITS = {"time": "minutes", "rate": "proportion 0-1"}
SETTINGS = {"T_min": qc.DEFAULT_T, "q": qc.DEFAULT_Q, "priority": "high", "timezone": qc.TIMEZONE}
BAND_COMPARISON = "pooled monitoring vs frozen baseline per band"
BAND_NOTE = ("6 zones x 5 bands = 30 unadjusted comparisons; chance flags can occur. "
             "Flags guide investigation and do not prove causes.")
HEATMAP_METRIC = "change in % late, monitoring minus baseline (percentage points)"
HEATMAP_NOTE = "144 descriptive cells; no per-cell statistical flag. Flags are the time bands."


class ApiError(Exception):
    def __init__(self, status, payload):
        self.status, self.payload = status, payload


def _clean(obj):
    """JSON-safe copy: numpy scalars to Python, NaN/inf to None (never 0)."""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, np.generic):
        obj = obj.item()
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    return obj


# ---------- datasets in memory ----------
class Dataset:
    """A validated, prepared incident table plus its baseline/monitoring windows and a result cache."""

    def __init__(self, dataset_id, source, name, prepared, rows, excluded):
        self.id, self.source, self.name = dataset_id, source, name
        self.df, self.rows, self.excluded = prepared, rows, excluded
        self.cache = {}
        self.lock = threading.Lock()
        dates = prepared["local_date"] if len(prepared) else pd.Series(dtype="object")
        self.first = min(dates) if len(dates) else None
        self.last = max(dates) if len(dates) else None
        # Baseline = the first 14 local days of the data; monitoring = every later day.
        cut = self.first + timedelta(days=BASELINE_DAYS) if self.first else None
        self.cut = cut
        self.baseline_end = (datetime.combine(cut, time(0), TZ).isoformat()
                             if cut else qc.DEFAULT_BASELINE_END)
        self.baseline_days = int(sum(1 for d in set(dates) if d < cut)) if cut else 0
        self.monitoring_days = (self.last - cut).days + 1 if cut and self.last >= cut else 0

    def monitoring_start(self, window):
        """None for the whole monitoring period (window 14), else the first of the last 7 days."""
        if window == 14 or not self.monitoring_days:
            return None
        return max(self.cut, self.last - timedelta(days=window - 1)).isoformat()

    def cached(self, key, fn):
        with self.lock:
            if key not in self.cache:
                self.cache[key] = _clean(fn())
            return self.cache[key]

    def meta(self):
        return {
            "mock": False,
            "units": UNITS,
            "settings": SETTINGS,
            "baseline": {"start": self.first.isoformat() if self.first else None,
                         "end_exclusive": self.baseline_end, "days": self.baseline_days},
            "monitoring": {"start": self.cut.isoformat() if self.cut else None,
                           "end": self.last.isoformat() if self.last else None,
                           "days": self.monitoring_days},
            "excluded": self.excluded,
            "scenario": self.name,
            "dataset_id": self.id,
        }


_datasets = OrderedDict()
_datasets_lock = threading.Lock()
_last_loaded = {"id": None}


def _no_excluded():
    return {"count": 0, "reasons": []}


def _load_scenario(name, make_default=True):
    with _datasets_lock:
        if name not in _datasets:
            raw = pd.read_csv(SCENARIO_DIR / f"{name}.csv")
            _datasets[name] = Dataset(name, "scenario", name, qc.prepare(raw), len(raw), _no_excluded())
        if make_default:
            _last_loaded["id"] = name
        return _datasets[name]


def _read_upload(content):
    """Parse, validate and prepare an uploaded CSV, or raise ApiError(422) listing every problem."""
    if len(content) > MAX_UPLOAD_BYTES:
        raise ApiError(413, {"error": f"file too large (limit {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)"})
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ApiError(422, {"errors": [{"row": None, "field": None, "reason": "file is not UTF-8 text"}]})
    try:
        reader = csv.reader(io.StringIO(text), strict=True)
        header = next(reader, [])
        if len(header) != len(set(header)):
            raise ApiError(422, {"errors": [{"row": 1, "field": None, "reason": "duplicate column names are not allowed"}]})
        width_errors = []
        for row in reader:
            if row and len(row) != len(header):
                width_errors.append({"row": reader.line_num, "field": None, "reason": "column count differs from header"})
                if len(width_errors) >= MAX_ERRORS_SHOWN:
                    break
        if width_errors:
            raise ApiError(422, {"errors": width_errors})
    except csv.Error as exc:
        raise ApiError(422, {"errors": [{"row": None, "field": None, "reason": f"not a readable CSV: {exc}"}]})
    try:
        raw = pd.read_csv(io.StringIO(text), dtype=str)
    except (pd.errors.ParserError, pd.errors.EmptyDataError) as e:
        raise ApiError(422, {"errors": [{"row": None, "field": None, "reason": f"not a readable CSV: {e}"}]})
    if len(raw) == 0:
        raise ApiError(422, {"errors": [{"row": None, "field": None, "reason": "the file has no data rows"}]})
    errors = qc.validate_incidents(raw)
    if not errors:
        zones = raw["zone_id"].astype(str).str.strip()
        for i in np.flatnonzero(~zones.isin(ZONES)):
            errors.append({"row": int(i) + 2, "field": "zone_id",
                           "reason": f"unknown zone {zones.iat[i]!r}; expected one of {', '.join(ZONES)}"})
    if errors:
        payload = {"errors": errors[:MAX_ERRORS_SHOWN], "error_count": len(errors)}
        raise ApiError(422, payload)
    raw["zone_id"] = raw["zone_id"].astype(str).str.strip()
    excluded = _no_excluded()
    if "priority" in raw.columns:
        keep = raw["priority"].astype(str).str.strip().str.lower() == "high"
        dropped = int((~keep).sum())
        if dropped:
            excluded = {"count": dropped, "reasons": [{"reason": "priority is not high", "count": dropped}]}
        raw = raw[keep].reset_index(drop=True)
        if len(raw) == 0:
            raise ApiError(422, {"errors": [{"row": None, "field": "priority",
                                             "reason": "no high-priority rows to analyse"}]})
    return raw, excluded


def _store_upload(raw, excluded):
    ds = Dataset(f"upload-{uuid.uuid4().hex[:12]}", "upload", "upload", qc.prepare(raw), len(raw), excluded)
    if ds.monitoring_days == 0:
        span = (ds.last - ds.first).days + 1
        raise ApiError(422, {"errors": [{"row": None, "field": "unit_notified_at", "reason":
            f"the file covers {span} day(s) ({ds.first} to {ds.last}); it needs more than "
            f"{BASELINE_DAYS}: the first {BASELINE_DAYS} days are the baseline, later days are monitored"}]})
    with _datasets_lock:
        _datasets[ds.id] = ds
        uploads = [k for k, v in _datasets.items() if v.source == "upload"]
        for old in uploads[:-MAX_UPLOADS_KEPT]:  # keep memory bounded
            del _datasets[old]
        _last_loaded["id"] = ds.id
    return ds


def _get_dataset(dataset_id):
    with _datasets_lock:
        if dataset_id is None:
            dataset_id = _last_loaded["id"]
            if dataset_id is None:
                raise ApiError(409, {"error": "no dataset loaded"})
        if dataset_id in _datasets:
            return _datasets[dataset_id]
    if dataset_id in SCENARIOS:  # scenarios reload on demand, e.g. after a server restart
        return _load_scenario(dataset_id, make_default=False)  # a read never switches the default
    raise ApiError(409, {"error": "dataset not loaded (the server may have restarted); load it again"})


def _window(value):
    if value in (None, "", "14"):
        return 14
    if value == "7":
        return 7
    raise ApiError(422, {"errors": [{"row": None, "field": "window", "reason": "window must be 7 or 14"}]})


def _smooth(value):
    if value in (None, "", "1"):
        return 1
    if value == "3":
        return 3
    raise ApiError(422, {"errors": [{"row": None, "field": "smooth", "reason": "smooth must be 1 or 3"}]})


# ---------- responses ----------
def _load_response(ds):
    return {
        "dataset_id": ds.id,
        "source": ds.source,
        "rows": ds.rows,
        "zones": sorted(set(ds.df["zone_id"].astype(str))) if len(ds.df) else [],
        "date_range": {"start": ds.first.isoformat() if ds.first else None,
                       "end": ds.last.isoformat() if ds.last else None},
        "baseline": {"start": ds.first.isoformat() if ds.first else None,
                     "end_exclusive": ds.baseline_end, "days": ds.baseline_days},
        "excluded": ds.excluded,
    }


def _zones(ds):
    return ds.cached(("zones",), lambda: [qc.zone_summary(ds.df, z, baseline_end=ds.baseline_end)
                                          for z in ZONES])


def _bands(ds, zone, window):
    return ds.cached(("bands", zone, window), lambda: qc.late_rate_by_band(
        ds.df, zone, baseline_end=ds.baseline_end, monitoring_start=ds.monitoring_start(window)))


def summary_payload(ds, window=14, smooth=1):
    def heatmap():
        return {"metric": HEATMAP_METRIC, "window_days": window, "smooth_hours": smooth,
                "exploratory_note": HEATMAP_NOTE,
                "cells": qc.late_rate_change_by_hour(ds.df, baseline_end=ds.baseline_end,
                                                     monitoring_start=ds.monitoring_start(window),
                                                     smooth_hours=smooth)}
    return {
        **ds.meta(),
        "zones": _zones(ds),
        "slowest_incidents": ds.cached(("slowest", None), lambda: qc.slowest_incidents(
            ds.df, baseline_end=ds.baseline_end)),
        "hour_heatmap": ds.cached(("heatmap", window, smooth), heatmap),
        "time_of_day_all_zones": {z: _bands(ds, z, window) for z in ZONES},
    }


def analysis_payload(ds, zone, window=14):
    summary = next(z for z in _zones(ds) if z["zone_id"] == zone)
    return {
        **ds.meta(),
        "zone_id": zone,
        "zone_type": qc.ZONE_TYPES.get(zone),
        "summary": summary,
        "daily_p_chart": ds.cached(("daily", zone), lambda: qc.daily_p_chart(
            ds.df, zone, baseline_end=ds.baseline_end)),
        "stages": ds.cached(("stages", zone), lambda: qc.stage_summary(
            ds.df, zone, baseline_end=ds.baseline_end)),
        "time_of_day": {"comparison": BAND_COMPARISON, "exploratory_note": BAND_NOTE,
                        "bands": _bands(ds, zone, window)},
        "slowest_incidents": ds.cached(("slowest", zone), lambda: qc.slowest_incidents(
            ds.df, zone_id=zone, baseline_end=ds.baseline_end)),
    }


# ---------- routes ----------
router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok", "version": VERSION}


@router.post("/datasets/load")
async def load_dataset(request: Request):
    """JSON {"scenario": "normal" | "recovery" | "morning_tail"}, or multipart field `file` (CSV)."""
    ctype = request.headers.get("content-type", "")
    if ctype.startswith("multipart/form-data"):
        async with request.form(max_files=1, max_fields=10) as form:
            upload = form.get("file")
            if upload is None or not hasattr(upload, "read"):
                raise ApiError(422, {"errors": [{"row": None, "field": "file", "reason": "attach a CSV as form field 'file'"}]})
            content = await upload.read(MAX_UPLOAD_BYTES + 1)
            raw, excluded = await run_in_threadpool(_read_upload, content)
            dataset = await run_in_threadpool(_store_upload, raw, excluded)
            return _load_response(dataset)
    try:
        body = await request.json()
    except Exception:
        body = None
    scenario = body.get("scenario") if isinstance(body, dict) else None
    if scenario not in SCENARIOS:
        raise ApiError(422, {"errors": [{"row": None, "field": "scenario",
                                         "reason": f"scenario must be one of {', '.join(SCENARIOS)}"}]})
    return _load_response(await run_in_threadpool(_load_scenario, scenario))


@router.get("/zones/summary")
def zones_summary(dataset_id: str | None = None, window: str | None = None, smooth: str | None = None):
    return summary_payload(_get_dataset(dataset_id), _window(window), _smooth(smooth))


@router.get("/zones/{zone_id}/analysis")
def zone_analysis(zone_id: str, dataset_id: str | None = None, window: str | None = None):
    if zone_id not in ZONES:
        raise ApiError(404, {"error": "unknown zone"})
    return analysis_payload(_get_dataset(dataset_id), zone_id, _window(window))


app = FastAPI(title="ResponseWatch API", version=VERSION,
              description="Ambulance response-time quality control: daily p charts, time-of-day "
                          "bands and slowest calls per zone. Statistics: app/qc.py.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(ApiError)
async def _api_error(_request, exc):
    return JSONResponse(status_code=exc.status, content=exc.payload)


app.include_router(router)               # contract paths: /health, /zones/summary, ...
app.include_router(router, prefix="/api")  # same routes under /api, the front end's default base

# Serve the built front end (app/frontend/dist) from the same app when it is present.
DIST = HERE / "frontend" / "dist"
if (DIST / "index.html").is_file():
    if (DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    def home():
        page = DIST / "home.html"  # landing page (frontend/public/home.html, copied by Vite)
        return FileResponse(page if page.is_file() else DIST / "index.html")

    @app.get("/app", include_in_schema=False)
    def dashboard():
        return FileResponse(DIST / "index.html")

    @app.get("/guide", include_in_schema=False)
    def guide():
        return FileResponse(DIST / "guide.html")
else:
    @app.get("/", include_in_schema=False)
    def index():
        return {"name": "ResponseWatch API", "version": VERSION, "docs": "docs", "health": "health"}
