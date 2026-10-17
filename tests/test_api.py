"""Tests for the FastAPI layer (app/api.py) against the contract in docs/api-contract/README.md.

The API must be a thin layer over app/qc.py: every number it returns has to equal calling qc
directly on data/<scenario>.csv. Known answers come from tests/test_integration_data.py and
data/README.md. The module is imported as `api` (not `app`, which is the package used by the
other tests as `from app.qc import ...`).
"""
import hashlib
import io
import math
import sys
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT / "app") not in sys.path:
    sys.path.insert(0, str(ROOT / "app"))
import api  # noqa: E402
import qc  # noqa: E402  (the same module object api uses)

DATA = ROOT / "data"
SCENARIOS = ["normal", "recovery", "morning_tail"]
ZONES = ["A", "B", "C", "D", "E", "F"]
BASELINE_END = "2026-09-28T00:00:00-04:00"
MON7 = "2026-10-05"
OCT = lambda a, b: [f"2026-10-{d:02d}" for d in range(a, b + 1)]
EXPECTED_BAND_FLAGS = {  # same for window 14 and window 7
    "normal": {},
    "recovery": {"C": ["midday", "evening_rush"]},
    "morning_tail": {"D": ["morning_rush"]},
}

client = TestClient(api.app)


# ---------- helpers ----------
def norm(obj):
    """JSON-equivalent copy: numpy to Python, tuples to lists, NaN/inf to None."""
    if isinstance(obj, dict):
        return {k: norm(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [norm(v) for v in obj]
    if isinstance(obj, np.generic):
        obj = obj.item()
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    return obj


def load(scenario):
    r = client.post("/datasets/load", json={"scenario": scenario})
    assert r.status_code == 200, r.text
    return r.json()


def get_summary(ds, window=None, smooth=None, prefix=""):
    params = {"dataset_id": ds}
    if window is not None:
        params["window"] = window
    if smooth is not None:
        params["smooth"] = smooth
    r = client.get(f"{prefix}/zones/summary", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def get_analysis(ds, zone, window=None, prefix=""):
    params = {"dataset_id": ds}
    if window is not None:
        params["window"] = window
    r = client.get(f"{prefix}/zones/{zone}/analysis", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def upload(content, name="incidents.csv"):
    return client.post("/datasets/load", files={"file": (name, content, "text/csv")})


def csv_bytes(df):
    return df.to_csv(index=False).encode("utf-8")


def assert_errors(r, expected=None):
    """422 with errors[] of {row, field, reason}; optionally check (row, field) pairs are present."""
    assert r.status_code == 422, r.text
    body = r.json()
    assert isinstance(body.get("errors"), list) and body["errors"], body
    for e in body["errors"]:
        assert set(e) == {"row", "field", "reason"}, e
        assert e["row"] is None or isinstance(e["row"], int)
        assert isinstance(e["reason"], str) and e["reason"]
    if expected:
        got = {(e["row"], e["field"]) for e in body["errors"]}
        for pair in expected:
            assert pair in got, (pair, body["errors"])
    return body["errors"]


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def raw():
    """Each data/*.csv read once (plain pd.read_csv, as a user would)."""
    return {s: pd.read_csv(DATA / f"{s}.csv") for s in SCENARIOS}


@pytest.fixture(scope="module")
def prepared(raw):
    """qc.prepare of each CSV; qc documents identical results for raw and prepared tables."""
    return {s: qc.prepare(df) for s, df in raw.items()}


@pytest.fixture(scope="module")
def loaded():
    """Load each scenario once and return the load responses."""
    return {s: load(s) for s in SCENARIOS}


@pytest.fixture
def fresh_state():
    """Empty dataset store for one test, restored afterwards."""
    saved, last = api._datasets.copy(), dict(api._last_loaded)
    api._datasets.clear()
    api._last_loaded["id"] = None
    yield
    api._datasets.clear()
    api._datasets.update(saved)
    api._last_loaded.clear()
    api._last_loaded.update(last)


def expected_summary(df, window, smooth):
    ms = MON7 if window == 7 else None
    return {
        "zones": norm([qc.zone_summary(df, z, baseline_end=BASELINE_END) for z in ZONES]),
        "slowest_incidents": norm(qc.slowest_incidents(df, baseline_end=BASELINE_END)),
        "hour_heatmap_cells": norm(qc.late_rate_change_by_hour(
            df, baseline_end=BASELINE_END, monitoring_start=ms, smooth_hours=smooth)),
        "time_of_day_all_zones": norm(qc.bands_all_zones(df, baseline_end=BASELINE_END,
                                                         monitoring_start=ms)),
    }


def expected_analysis(df, zone, window):
    ms = MON7 if window == 7 else None
    return {
        "summary": norm(qc.zone_summary(df, zone, baseline_end=BASELINE_END)),
        "daily_p_chart": norm(qc.daily_p_chart(df, zone, baseline_end=BASELINE_END)),
        "stages": norm(qc.stage_summary(df, zone, baseline_end=BASELINE_END)),
        "bands": norm(qc.late_rate_by_band(df, zone, baseline_end=BASELINE_END, monitoring_start=ms)),
        "slowest_incidents": norm(qc.slowest_incidents(df, zone_id=zone, baseline_end=BASELINE_END)),
    }


def band_flags(tod_all):
    out = {}
    for z, bands in tod_all.items():
        keys = [b["band"] for b in bands if b["flag"] is True]
        if keys:
            out[z] = keys
    return out


# =====================================================================
# 1. Contract shape
# =====================================================================
@pytest.mark.parametrize("path", ["/health", "/api/health"])
def test_health(path):
    r = client.get(path)
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": api.VERSION}


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_load_response_shape(loaded, scenario):
    body = loaded[scenario]
    assert body == {
        "dataset_id": scenario,
        "source": "scenario",
        "rows": 16800,
        "zones": ZONES,
        "date_range": {"start": "2026-09-14", "end": "2026-10-11"},
        "baseline": {"start": "2026-09-14", "end_exclusive": BASELINE_END, "days": 14},
        "excluded": {"count": 0, "reasons": []},
    }


def test_load_under_api_prefix():
    r = client.post("/api/datasets/load", json={"scenario": "normal"})
    assert r.status_code == 200 and r.json()["dataset_id"] == "normal"


@pytest.mark.parametrize("window,smooth", [(None, None), ("14", "1"), ("14", "3"), ("7", "1"), ("7", "3")])
@pytest.mark.parametrize("prefix", ["", "/api"])
def test_summary_shape(loaded, window, smooth, prefix):
    s = get_summary("recovery", window, smooth, prefix)
    w = int(window or 14)
    sm = int(smooth or 1)
    assert s["mock"] is False
    assert s["scenario"] == "recovery" and s["dataset_id"] == "recovery"
    assert s["units"] == {"time": "minutes", "rate": "proportion 0-1"}
    assert s["settings"]["T_min"] == 12.0 and s["settings"]["q"] == 0.10
    assert s["settings"]["priority"] == "high" and s["settings"]["timezone"] == "America/New_York"
    assert s["baseline"] == {"start": "2026-09-14", "end_exclusive": BASELINE_END, "days": 14}
    assert s["monitoring"] == {"start": "2026-09-28", "end": "2026-10-11", "days": 14}
    assert s["excluded"] == {"count": 0, "reasons": []}
    assert [z["zone_id"] for z in s["zones"]] == ZONES
    zone_keys = {"zone_id", "zone_type", "n", "late", "late_rate", "p90_min", "p90_warning",
                 "baseline_n", "baseline_late", "p0", "above_service_target", "deterioration_flag",
                 "deterioration_days", "first_flag_date", "last_flag_date", "status"}
    for z in s["zones"]:
        assert zone_keys <= set(z), zone_keys - set(z)
    assert isinstance(s["slowest_incidents"], list) and len(s["slowest_incidents"]) == 5
    hm = s["hour_heatmap"]
    assert hm["window_days"] == w and hm["smooth_hours"] == sm
    assert {"metric", "exploratory_note", "cells"} <= set(hm)
    assert len(hm["cells"]) == 144
    assert [(c["zone_id"], c["hour"]) for c in hm["cells"]] == [(z, h) for z in ZONES for h in range(24)]
    assert all(c["smooth_hours"] == sm for c in hm["cells"])
    tod = s["time_of_day_all_zones"]
    assert sorted(tod) == ZONES
    for z in ZONES:
        assert [b["band"] for b in tod[z]] == ["night", "morning_rush", "midday", "evening_rush",
                                              "late_evening"]
        for b in tod[z]:
            assert {"band", "label", "interval_local", "baseline_n", "baseline_late", "p0_band",
                    "n_band", "monitoring_late", "p_band", "ucl", "lcl", "z", "flag", "status"} <= set(b)


@pytest.mark.parametrize("zone", ZONES)
@pytest.mark.parametrize("window", [None, "14", "7"])
def test_analysis_shape(loaded, zone, window):
    a = get_analysis("morning_tail", zone, window)
    assert a["mock"] is False and a["dataset_id"] == "morning_tail"
    assert a["zone_id"] == zone and a["zone_type"] == qc.ZONE_TYPES[zone]
    assert a["summary"]["zone_id"] == zone
    pc = a["daily_p_chart"]
    assert {"status", "p0", "baseline_n", "baseline_late", "baseline_days", "points"} <= set(pc)
    assert len(pc["points"]) == 28
    for p in pc["points"]:
        assert {"date", "phase", "n", "late", "p", "cl", "ucl", "lcl", "deterioration_flag",
                "above_service_target", "status"} <= set(p)
    assert [st["stage"] for st in a["stages"]] == ["call_handling", "turnout", "travel"]
    for st in a["stages"]:
        assert {"from", "to", "baseline_median_min", "monitoring_median_min", "baseline_p90_min",
                "monitoring_p90_min"} <= set(st)
    assert "exploratory_note" in a["time_of_day"]
    assert len(a["time_of_day"]["bands"]) == 5
    assert isinstance(a["slowest_incidents"], list) and len(a["slowest_incidents"]) == 5
    assert all(s["zone_id"] == zone for s in a["slowest_incidents"])


def test_analysis_under_api_prefix(loaded):
    assert get_analysis("normal", "A", prefix="/api") == get_analysis("normal", "A")


def test_default_dataset_is_last_loaded(loaded):
    load("morning_tail")
    r = client.get("/zones/summary")
    assert r.status_code == 200 and r.json()["dataset_id"] == "morning_tail"


# =====================================================================
# 2. Numbers equal qc.py called directly on data/<name>.csv
# =====================================================================
@pytest.mark.parametrize("scenario", SCENARIOS)
@pytest.mark.parametrize("window,smooth", [(14, 1), (14, 3), (7, 1), (7, 3)])
def test_summary_equals_qc(loaded, prepared, scenario, window, smooth):
    s = get_summary(scenario, str(window), str(smooth))
    exp = expected_summary(prepared[scenario], window, smooth)
    assert s["zones"] == exp["zones"]
    assert s["slowest_incidents"] == exp["slowest_incidents"]
    assert s["hour_heatmap"]["cells"] == exp["hour_heatmap_cells"]
    assert s["time_of_day_all_zones"] == exp["time_of_day_all_zones"]


@pytest.mark.parametrize("scenario", SCENARIOS)
@pytest.mark.parametrize("window", [14, 7])
def test_analysis_equals_qc(loaded, prepared, scenario, window):
    for zone in ZONES:
        a = get_analysis(scenario, zone, str(window))
        exp = expected_analysis(prepared[scenario], zone, window)
        assert a["summary"] == exp["summary"], zone
        assert a["daily_p_chart"] == exp["daily_p_chart"], zone
        assert a["stages"] == exp["stages"], zone
        assert a["time_of_day"]["bands"] == exp["bands"], zone
        assert a["slowest_incidents"] == exp["slowest_incidents"], zone


def test_prepared_equals_raw_spot_check(raw, prepared):
    """The comparison above uses qc.prepare; confirm it matches the raw table for one zone."""
    df = raw["recovery"]
    assert norm(qc.zone_summary(df, "C", baseline_end=BASELINE_END)) == \
        norm(qc.zone_summary(prepared["recovery"], "C", baseline_end=BASELINE_END))
    assert norm(qc.late_rate_by_band(df, "C", baseline_end=BASELINE_END, monitoring_start=MON7)) == \
        norm(qc.late_rate_by_band(prepared["recovery"], "C", baseline_end=BASELINE_END,
                                  monitoring_start=MON7))


# =====================================================================
# 3. Known answers through the API
# =====================================================================
def test_recovery_zone_c_flag_days(loaded):
    a = get_analysis("recovery", "C")
    days = [p["date"] for p in a["daily_p_chart"]["points"] if p["deterioration_flag"] is True]
    assert days == OCT(1, 6)
    zc = next(z for z in get_summary("recovery")["zones"] if z["zone_id"] == "C")
    assert zc["deterioration_flag"] is True and zc["deterioration_days"] == 6
    assert (zc["first_flag_date"], zc["last_flag_date"]) == ("2026-10-01", "2026-10-06")
    for z in get_summary("recovery")["zones"]:
        if z["zone_id"] != "C":
            assert z["deterioration_flag"] is False, z


def test_normal_no_flags(loaded):
    s = get_summary("normal")
    assert [z["deterioration_flag"] for z in s["zones"]] == [False] * 6
    assert band_flags(s["time_of_day_all_zones"]) == {}


@pytest.mark.parametrize("scenario", SCENARIOS)
@pytest.mark.parametrize("window", ["14", "7"])
def test_band_flags(loaded, scenario, window):
    s = get_summary(scenario, window)
    assert band_flags(s["time_of_day_all_zones"]) == EXPECTED_BAND_FLAGS[scenario]
    for z in ZONES:
        bands = get_analysis(scenario, z, window)["time_of_day"]["bands"]
        assert bands == s["time_of_day_all_zones"][z]


def test_morning_tail_zone_d(loaded):
    a = get_analysis("morning_tail", "D")
    band = next(b for b in a["time_of_day"]["bands"] if b["band"] == "morning_rush")
    assert band["status"] == "ok" and band["flag"] is True
    assert (band["baseline_late"], band["baseline_n"], band["monitoring_late"], band["n_band"]) == \
        (50, 280, 98, 264)
    assert band["p_band"] == pytest.approx(0.371, abs=0.0005)
    assert band["ucl"] == pytest.approx(0.2871, abs=0.00005)
    assert band["z"] == pytest.approx(5.046, abs=0.0005)
    assert band["p_band"] > band["ucl"]
    assert [round(s["response_min"], 1) for s in a["slowest_incidents"]] == [41.6, 40.7, 40.6, 37.0, 35.6]
    for s in a["slowest_incidents"]:
        assert s["minutes_over_target"] == pytest.approx(s["response_min"] - 12.0)
    # no daily flags in morning_tail
    assert [z["deterioration_flag"] for z in get_summary("morning_tail")["zones"]] == [False] * 6


# =====================================================================
# 5. Errors
# =====================================================================
def test_unknown_zone(loaded):
    r = client.get("/zones/Z/analysis", params={"dataset_id": "normal"})
    assert r.status_code == 404 and r.json() == {"error": "unknown zone"}
    r = client.get("/api/zones/a/analysis", params={"dataset_id": "normal"})
    assert r.status_code == 404 and r.json() == {"error": "unknown zone"}


def test_no_dataset_loaded(fresh_state):
    for path in ["/zones/summary", "/zones/A/analysis", "/api/zones/summary"]:
        r = client.get(path)
        assert r.status_code == 409 and r.json() == {"error": "no dataset loaded"}, path


def test_unknown_dataset_id(loaded):
    r = client.get("/zones/summary", params={"dataset_id": "upload-doesnotexist"})
    assert r.status_code == 409 and "error" in r.json()
    r = client.get("/zones/A/analysis", params={"dataset_id": "nope"})
    assert r.status_code == 409 and "error" in r.json()


def test_scenario_reloads_on_demand(fresh_state):
    """A known scenario id still works after a restart (empty store)."""
    assert get_summary("normal")["dataset_id"] == "normal"


@pytest.mark.parametrize("body", [{"scenario": "bogus"}, {"scenario": None}, {}, {"name": "normal"},
                                  ["normal"], "normal"])
def test_bad_scenario(body):
    r = client.post("/datasets/load", json=body)
    errs = assert_errors(r)
    assert errs[0]["field"] == "scenario"


def test_bad_json_body():
    r = client.post("/datasets/load", content=b"{not json", headers={"content-type": "application/json"})
    assert_errors(r)


@pytest.mark.parametrize("params", [{"window": "5"}, {"window": "abc"}, {"smooth": "2"},
                                    {"smooth": "5"}, {"window": "7", "smooth": "0"}])
def test_bad_window_smooth_summary(loaded, params):
    r = client.get("/zones/summary", params={"dataset_id": "normal", **params})
    errs = assert_errors(r)
    assert errs[0]["field"] in params


def test_bad_window_analysis(loaded):
    r = client.get("/zones/C/analysis", params={"dataset_id": "normal", "window": "5"})
    errs = assert_errors(r)
    assert errs[0]["field"] == "window"


def test_multipart_without_file_field():
    r = client.post("/datasets/load", files={"other": ("x.csv", b"a,b\n1,2\n", "text/csv")})
    errs = assert_errors(r)
    assert errs[0]["field"] == "file"


# =====================================================================
# 6. Uploads
# =====================================================================
@pytest.fixture(scope="module")
def small(raw):
    """First 6 rows of normal.csv as strings (data rows 2-7 in a spreadsheet). One day only, so a
    valid copy is rejected as too short; use it for row-level validation errors."""
    return pd.read_csv(DATA / "normal.csv", dtype=str, nrows=6)


@pytest.fixture(scope="module")
def month():
    """Two calls per local day from normal.csv: 28 days, 56 rows, long enough to upload."""
    df = pd.read_csv(DATA / "normal.csv", dtype=str)
    return df.groupby(df["unit_notified_at"].str[:10], sort=True).head(2).reset_index(drop=True)


def test_upload_valid_recovery(loaded):
    r = upload((DATA / "recovery.csv").read_bytes())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["dataset_id"].startswith("upload-") and body["source"] == "upload"
    assert {k: v for k, v in body.items() if k not in ("dataset_id", "source")} == \
        {k: v for k, v in loaded["recovery"].items() if k not in ("dataset_id", "source")}
    ds = body["dataset_id"]
    for window, smooth in [("14", "1"), ("7", "3")]:
        up = get_summary(ds, window, smooth)
        sc = get_summary("recovery", window, smooth)
        assert up["dataset_id"] == ds and up["scenario"] == "upload"
        for k in ("zones", "slowest_incidents", "hour_heatmap", "time_of_day_all_zones",
                  "baseline", "monitoring", "excluded", "settings", "units"):
            assert up[k] == sc[k], k
    for zone in ("C", "F"):
        up, sc = get_analysis(ds, zone, "7"), get_analysis("recovery", zone, "7")
        for k in ("summary", "daily_p_chart", "stages", "time_of_day", "slowest_incidents"):
            assert up[k] == sc[k], (zone, k)
    # the upload became the default dataset
    assert client.get("/zones/summary").json()["dataset_id"] == ds


def test_upload_with_bom_and_crlf(month):
    text = "﻿" + month.to_csv(index=False).replace("\n", "\r\n")
    r = upload(text.encode("utf-8"))
    assert r.status_code == 200, r.text
    assert r.json()["rows"] == 56


def test_upload_missing_column(small):
    errs = assert_errors(upload(csv_bytes(small.drop(columns=["on_scene_at"]))))
    assert errs == [{"row": None, "field": "on_scene_at", "reason": "missing column"}]


def test_upload_reversed_timestamp(small):
    bad = small.copy()
    bad.loc[1, "on_scene_at"] = bad.loc[1, "call_received_at"]  # data row index 1 -> row 3
    errs = assert_errors(upload(csv_bytes(bad)), [(3, "on_scene_at")])
    assert all(e["row"] == 3 for e in errs)


def test_upload_duplicate_id(small):
    bad = small.copy()
    bad.loc[3, "incident_id"] = bad.loc[0, "incident_id"]
    errs = assert_errors(upload(csv_bytes(bad)))
    assert errs == [{"row": 5, "field": "incident_id", "reason": f"duplicate id {small.loc[0, 'incident_id']}"}]


def test_upload_unknown_zone(small):
    bad = small.copy()
    bad.loc[2, "zone_id"] = "Z"
    errs = assert_errors(upload(csv_bytes(bad)))
    assert [(e["row"], e["field"]) for e in errs] == [(4, "zone_id")]
    assert "Z" in errs[0]["reason"]


def test_upload_missing_offset(small):
    bad = small.copy()
    bad.loc[0, "call_received_at"] = bad.loc[0, "call_received_at"][:-6]  # drop "-04:00"
    errs = assert_errors(upload(csv_bytes(bad)))
    assert {"row": 2, "field": "call_received_at", "reason": "missing timezone offset"} in errs


def test_upload_missing_timestamp(small):
    bad = small.copy()
    bad.loc[4, "unit_en_route_at"] = ""
    errs = assert_errors(upload(csv_bytes(bad)))
    assert {"row": 6, "field": "unit_en_route_at", "reason": "missing timestamp"} in errs


def test_upload_several_errors_all_listed(small):
    bad = small.copy()
    bad.loc[0, "zone_id"] = ""
    bad.loc[5, "on_scene_at"] = "not a time"
    errs = assert_errors(upload(csv_bytes(bad)), [(2, "zone_id"), (7, "on_scene_at")])
    assert len(errs) >= 2


@pytest.mark.parametrize("content", [b"", b"\n"])
def test_upload_empty(content):
    errs = assert_errors(upload(content))
    assert errs[0]["row"] is None


def test_upload_header_only(small):
    errs = assert_errors(upload(",".join(small.columns).encode() + b"\n"))
    assert errs[0]["row"] is None


def test_upload_not_utf8(small):
    text = small.to_csv(index=False).replace("DSP05", "DSPé")
    errs = assert_errors(upload(text.encode("latin-1") + b"\xff\xfe"))
    assert errs[0]["row"] is None and "UTF-8" in errs[0]["reason"]


def test_upload_nothing_loaded_on_error(small, fresh_state):
    bad = small.copy()
    bad.loc[2, "zone_id"] = "Z"
    assert_errors(upload(csv_bytes(bad)))
    assert api._datasets == {} and api._last_loaded["id"] is None
    assert client.get("/zones/summary").status_code == 409


def test_upload_low_priority_excluded(raw):
    df = pd.read_csv(DATA / "normal.csv", dtype=str)
    low_idx = [0, 1000, 5000, 9000, 16799]
    df.loc[low_idx, "priority"] = "low"
    r = upload(csv_bytes(df))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["excluded"]["count"] == 5
    assert sum(x["count"] for x in body["excluded"]["reasons"]) == 5
    assert body["rows"] == 16800 - 5  # rows = rows analysed
    s = get_summary(body["dataset_id"])
    assert s["excluded"] == body["excluded"]
    kept = raw["normal"].drop(index=low_idx).reset_index(drop=True)
    assert s["zones"] == norm([qc.zone_summary(kept, z, baseline_end=BASELINE_END) for z in ZONES])


def test_upload_all_low_priority(small):
    bad = small.copy()
    bad["priority"] = "low"
    assert_errors(upload(csv_bytes(bad)))


def _shift(df, days):
    """Shift every timestamp by `days` x 24 h; offsets re-written for America/New_York."""
    out = df.copy()
    for col in qc.TIMESTAMP_COLUMNS:
        t = pd.to_datetime(out[col], utc=True, format="ISO8601") + timedelta(days=days)
        local = t.dt.tz_convert(qc.TIMEZONE)
        out[col] = [x.isoformat() for x in local]
    return out


def test_upload_shifted_dates_identical_stats(raw, prepared):
    """normal.csv moved 35 days earlier (Aug 10 - Sep 6, all EDT, so local wall times are kept):
    baseline = its own first 14 local days and every statistic equals the unshifted file."""
    shifted = _shift(raw["normal"], -35)
    r = upload(csv_bytes(shifted))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["date_range"] == {"start": "2026-08-10", "end": "2026-09-06"}
    assert body["baseline"] == {"start": "2026-08-10", "end_exclusive": "2026-08-24T00:00:00-04:00",
                                "days": 14}
    ds = body["dataset_id"]
    for window, smooth in [("14", "1"), ("7", "3")]:
        up, sc = get_summary(ds, window, smooth), get_summary("normal", window, smooth)
        assert up["monitoring"] == {"start": "2026-08-24", "end": "2026-09-06", "days": 14}
        assert up["zones"] == sc["zones"]  # normal.csv has no flag dates to shift
        assert up["hour_heatmap"] == sc["hour_heatmap"]
        assert up["time_of_day_all_zones"] == sc["time_of_day_all_zones"]
        assert [s["response_min"] for s in up["slowest_incidents"]] == \
            [s["response_min"] for s in sc["slowest_incidents"]]
    for zone in ZONES:
        up, sc = get_analysis(ds, zone, "7"), get_analysis("normal", zone, "7")
        assert up["stages"] == sc["stages"]
        assert up["time_of_day"] == sc["time_of_day"]
        strip = lambda pts: [{k: v for k, v in p.items() if k != "date"} for p in pts]
        assert strip(up["daily_p_chart"]["points"]) == strip(sc["daily_p_chart"]["points"])
        assert up["daily_p_chart"]["points"][0]["date"] == "2026-08-10"


def test_upload_shifted_forward_across_dst(raw):
    """normal.csv moved 35 days later (Oct 19 - Nov 15, crosses the Nov 1 DST change): the
    baseline is the file's own first 14 local days, ending at local midnight Nov 2 (-05:00), and
    every number equals qc with that baseline_end. Local hours after Nov 1 move by one, so the
    numbers are not expected to equal the unshifted file."""
    shifted = _shift(raw["normal"], 35)
    r = upload(csv_bytes(shifted))
    assert r.status_code == 200, r.text
    body = r.json()
    end = "2026-11-02T00:00:00-05:00"
    assert body["baseline"] == {"start": "2026-10-19", "end_exclusive": end, "days": 14}
    s = get_summary(body["dataset_id"], "7", "1")
    assert s["monitoring"]["start"] == "2026-11-02" and s["monitoring"]["days"] == 14
    p = qc.prepare(shifted)
    assert s["zones"] == norm([qc.zone_summary(p, z, baseline_end=end) for z in ZONES])
    assert s["time_of_day_all_zones"] == norm(qc.bands_all_zones(p, baseline_end=end,
                                                                 monitoring_start="2026-11-09"))
    assert s["hour_heatmap"]["cells"] == norm(qc.late_rate_change_by_hour(
        p, baseline_end=end, monitoring_start="2026-11-09"))


def test_only_ten_uploads_kept(month, fresh_state):
    load("normal")
    ids = []
    for i in range(12):
        r = upload(csv_bytes(month))
        assert r.status_code == 200, r.text
        ids.append(r.json()["dataset_id"])
    assert len(set(ids)) == 12
    uploads = [k for k, v in api._datasets.items() if v.source == "upload"]
    assert uploads == ids[-10:]
    assert "normal" in api._datasets  # scenarios are not evicted
    for old in ids[:2]:
        r = client.get("/zones/summary", params={"dataset_id": old})
        assert r.status_code == 409
    assert get_summary(ids[-1])["dataset_id"] == ids[-1]


# =====================================================================
# 7. Scenario copies are byte-identical to data/
# =====================================================================
@pytest.mark.parametrize("scenario", SCENARIOS)
def test_scenario_data_identical(scenario):
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    assert sha(api.SCENARIO_DIR / f"{scenario}.csv") == sha(DATA / f"{scenario}.csv")


# =====================================================================
# 8. Static front end
# =====================================================================
def test_root_serves_built_ui_or_api_info():
    r = client.get("/")
    assert r.status_code == 200
    if (api.DIST / "index.html").is_file():
        assert "text/html" in r.headers["content-type"]
        assert "Open the dashboard" in r.text
    else:
        assert r.json()["name"] == "ResponseWatch API"


# =====================================================================
# Known quirks in app/api.py (strict xfail: they pass once fixed, then drop the marker)
# =====================================================================
def test_get_by_id_does_not_change_default(month, fresh_state):
    r = upload(csv_bytes(month))
    ds = r.json()["dataset_id"]
    get_summary("recovery")  # not in the store yet, so it is reloaded on demand
    assert client.get("/zones/summary").json()["dataset_id"] == ds


def test_upload_without_monitoring_days_is_rejected(small, month, fresh_state):
    errs = assert_errors(upload(csv_bytes(small)))  # one day: nothing after the 14-day baseline
    assert errs[0]["field"] == "unit_notified_at" and "covers 1 day(s)" in errs[0]["reason"]
    first14 = month[month["unit_notified_at"].str[:10] < "2026-09-28"]  # exactly the baseline
    errs = assert_errors(upload(csv_bytes(first14)))
    assert "covers 14 day(s)" in errs[0]["reason"]
    assert client.get("/zones/summary").status_code == 409  # nothing was loaded
    r = upload(csv_bytes(month[month["unit_notified_at"].str[:10] <= "2026-09-28"]))  # 15 days
    assert r.status_code == 200, r.text
    assert get_summary(r.json()["dataset_id"])["monitoring"] == {
        "start": "2026-09-28", "end": "2026-09-28", "days": 1}


def test_duplicate_csv_headers_rejected(fresh_state):
    r = upload(b"incident_id,incident_id\na,b\n")
    assert r.status_code == 422
    assert "duplicate column" in r.json()["errors"][0]["reason"]


def test_csv_row_width_rejected(fresh_state):
    r = upload(b"incident_id,zone_id\na,A,unexpected\n")
    assert r.status_code == 422
    assert r.json()["errors"][0]["row"] == 2


def test_upload_limit(monkeypatch, fresh_state):
    monkeypatch.setattr(api, "MAX_UPLOAD_BYTES", 10)
    assert upload(b"a" * 11).status_code == 413


@pytest.mark.parametrize("route,expected", [("/", "Choose a starting point"), ("/app", '<div id="root">'), ("/guide", "Start in three steps")])
def test_integrated_pages(route, expected):
    r = client.get(route)
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert expected in r.text


def test_subpath_relative_navigation_and_assets():
    from urllib.parse import urljoin
    import re
    base = 'https://example.test/content/demo/'
    home = client.get('/').text
    links = re.findall(r'href="(app[^"]*)"', home)
    assert 'app?dataset=normal' in links
    assert all(urljoin(base, link).startswith(base+'app') for link in links)
    dashboard = client.get('/app').text
    for asset in re.findall(r'(?:src|href)="(\./assets/[^"]+)"', dashboard):
        assert urljoin(base+'app',asset).startswith(base+'assets/')
        assert client.get('/'+asset.removeprefix('./')).status_code == 200
    assert client.get('/api/health').status_code == 200
