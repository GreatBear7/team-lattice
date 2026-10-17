"""Tests for H-10: hourly heatmap / clock cells, the monitoring window, all-zone bands and stage P90s.

Known answers from ideas/heatmap/README.md (Kaushik's spec) and Final_Plan 5.4.
"""
import os
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import pytest

from app import qc
from conftest import EDT, make_row

TOL = dict(rel=1e-12, abs=1e-12)
BASE_DAYS = [date(2026, 9, 14) + timedelta(days=i) for i in range(14)]
MON_DAYS = [date(2026, 9, 28) + timedelta(days=i) for i in range(14)]
DATA_DIR = Path(os.environ.get("RW_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))


def calls(zone, days, hour, n, late, start=0):
    """n calls at local `hour`, spread over `days`; the first `late` take 15 min, the rest 5."""
    rows = []
    for i in range(n):
        d = days[i % len(days)]
        t = datetime(d.year, d.month, d.day, hour, (i // len(days)) % 60, i % 60, tzinfo=EDT)
        rows.append(make_row(f"{zone}{hour:02d}-{start + i:05d}", zone, t, 15.0 if i < late else 5.0))
    return rows


def cell(cells, zone, hour):
    return next(c for c in cells if c["zone_id"] == zone and c["hour"] == hour)


# ---- known answer and statuses (spec section 2) ------------------------------
def test_known_answer_change_in_points():
    df = pd.DataFrame(calls("A", BASE_DAYS, 8, 50, 10) + calls("A", MON_DAYS, 8, 40, 20, start=50))
    c = cell(qc.late_rate_change_by_hour(df), "A", 8)
    assert c["p_baseline"] == pytest.approx(0.20, **TOL)
    assert c["p_monitoring"] == pytest.approx(0.50, **TOL)
    assert c["change_pts"] == pytest.approx(30.0, **TOL)
    assert (c["baseline_n"], c["baseline_late"], c["monitoring_n"], c["monitoring_late"]) == (50, 10, 40, 20)
    assert c["status"] == "ok"


def test_too_few_late_in_baseline_keeps_numbers_but_is_insufficient():
    df = pd.DataFrame(calls("A", BASE_DAYS, 8, 10, 2) + calls("A", MON_DAYS, 8, 10, 5, start=10))
    c = cell(qc.late_rate_change_by_hour(df), "A", 8)
    assert c["change_pts"] == pytest.approx(30.0, **TOL)
    assert c["status"] == "insufficient_evidence"


def test_empty_side_is_no_data_never_zero():
    df = pd.DataFrame(calls("A", BASE_DAYS, 8, 50, 10))  # no monitoring calls at all
    c = cell(qc.late_rate_change_by_hour(df), "A", 8)
    assert c["status"] == "no_data"
    assert c["p_monitoring"] is None and c["change_pts"] is None
    assert c["p_baseline"] == pytest.approx(0.20, **TOL)
    other = cell(qc.late_rate_change_by_hour(df), "A", 3)  # an hour with no calls on either side
    assert other["status"] == "no_data" and other["p_baseline"] is None and other["change_pts"] is None


def test_hour_boundaries_and_utc_conversion():
    times = ["2026-10-01T05:59:59-04:00", "2026-10-01T06:00:00-04:00", "2026-10-01T23:59:59-04:00",
             "2026-10-01T10:00:00Z"]  # the last one is 06:00 local
    rows = []
    for i, t in enumerate(times):
        r = make_row(f"X{i}", "A", pd.Timestamp(t).to_pydatetime(), 5.0)
        rows.append(r)
    cells = qc.late_rate_change_by_hour(pd.DataFrame(rows))
    counts = {c["hour"]: c["monitoring_n"] for c in cells if c["monitoring_n"]}
    assert counts == {5: 1, 6: 2, 23: 1}


def test_shape_and_order():
    rows = []
    for z in "BA":
        rows += calls(z, BASE_DAYS, 12, 20, 5) + calls(z, MON_DAYS, 12, 20, 5, start=20)
    cells = qc.late_rate_change_by_hour(pd.DataFrame(rows))
    assert len(cells) == 144  # always the fixed A-F grid, so the front end draws 6 x 24
    assert [(c["zone_id"], c["hour"]) for c in cells] == [(z, h) for z in "ABCDEF" for h in range(24)]
    assert all(c["status"] == "no_data" for c in cells if c["zone_id"] in "CDEF")
    assert qc.late_rate_change_by_hour(pd.DataFrame(columns=list(rows[0]))) == []


# ---- smoothing for the clock --------------------------------------------------
def test_smoothing_pools_counts_of_neighbouring_hours_and_wraps_midnight():
    rows = (calls("A", BASE_DAYS, 23, 20, 4) + calls("A", BASE_DAYS, 0, 30, 6, start=20)
            + calls("A", BASE_DAYS, 1, 10, 2, start=50)
            + calls("A", MON_DAYS, 23, 20, 10, start=60) + calls("A", MON_DAYS, 0, 30, 6, start=80)
            + calls("A", MON_DAYS, 1, 10, 4, start=110))
    c = cell(qc.late_rate_change_by_hour(pd.DataFrame(rows), smooth_hours=3), "A", 0)
    assert (c["baseline_n"], c["baseline_late"]) == (60, 12)        # hours 23, 0 and 1 pooled
    assert (c["monitoring_n"], c["monitoring_late"]) == (60, 20)
    assert c["change_pts"] == pytest.approx(100 * (20 / 60 - 12 / 60), **TOL)
    assert c["smooth_hours"] == 3
    raw = cell(qc.late_rate_change_by_hour(pd.DataFrame(rows)), "A", 0)
    assert (raw["baseline_n"], raw["monitoring_n"], raw["smooth_hours"]) == (30, 30, 1)


@pytest.mark.parametrize("bad", [0, 2, 24, -1, 1.5])
def test_smoothing_must_be_odd_between_1_and_23(bad):
    df = pd.DataFrame(calls("A", BASE_DAYS, 8, 10, 2))
    with pytest.raises(ValueError):
        qc.late_rate_change_by_hour(df, smooth_hours=bad)


# ---- monitoring window (7 / 14 day toggle) ----------------------------------
def test_monitoring_window_drops_early_monitoring_days_only():
    rows = calls("A", BASE_DAYS, 8, 50, 10) + calls("A", MON_DAYS[:7], 8, 35, 0, start=50) \
        + calls("A", MON_DAYS[7:], 8, 35, 35, start=85)
    df = pd.DataFrame(rows)
    full = cell(qc.late_rate_change_by_hour(df), "A", 8)
    last7 = cell(qc.late_rate_change_by_hour(df, monitoring_start="2026-10-05"), "A", 8)
    assert (full["monitoring_n"], full["monitoring_late"]) == (70, 35)
    assert (last7["monitoring_n"], last7["monitoring_late"]) == (35, 35)
    assert (last7["baseline_n"], last7["baseline_late"]) == (50, 10)   # baseline untouched


def test_monitoring_window_inside_baseline_is_rejected():
    df = pd.DataFrame(calls("A", BASE_DAYS, 8, 50, 10))
    with pytest.raises(ValueError):
        qc.late_rate_change_by_hour(df, monitoring_start="2026-09-20")
    with pytest.raises(ValueError):
        qc.late_rate_by_band(df, "A", monitoring_start="2026-09-20")


def test_bands_all_zones_matches_single_zone_calls():
    rows = []
    for z in "CA":
        rows += calls(z, BASE_DAYS, 12, 100, 20) + calls(z, MON_DAYS, 12, 100, 40, start=100)
    df = pd.DataFrame(rows)
    allz = qc.bands_all_zones(df)
    assert list(allz) == ["A", "C"]
    assert allz["C"] == qc.late_rate_by_band(df, "C")
    assert qc.bands_all_zones(pd.DataFrame(columns=list(rows[0]))) == {}


# ---- stage summary P90s ----------------------------------------------------------
def test_stage_summary_reports_baseline_and_monitoring_p90():
    rows = calls("A", BASE_DAYS, 12, 10, 0) + calls("A", MON_DAYS, 12, 10, 2, start=10)
    travel = {s["stage"]: s for s in qc.stage_summary(pd.DataFrame(rows), "A")}["travel"]
    # make_row: turnout 2 min, so travel = 3 min on time and 13 min late
    assert travel["baseline_p90_min"] == pytest.approx(3.0, **TOL)
    # monitoring travel sorted: eight 3s then 13, 13; h = 9 * 0.9 = 8.1 lies between two 13s
    assert travel["monitoring_p90_min"] == pytest.approx(13.0, **TOL)
    assert travel["baseline_median_min"] == pytest.approx(3.0, **TOL)


# ---- integration on the H-02 CSVs ---------------------------------------------------
def _load(name):
    path = DATA_DIR / name
    if not path.exists():
        pytest.skip(f"{path} not found")
    return pd.read_csv(path)


def test_morning_tail_zone_d_hours_06_to_09():
    cells = qc.late_rate_change_by_hour(_load("morning_tail.csv"))
    assert len(cells) == 144
    expected = {5: (4, 30, 4, 32, -0.8, "insufficient_evidence"), 6: (9, 59, 17, 53, 16.8, "ok"),
                7: (16, 81, 27, 77, 15.3, "ok"), 8: (14, 85, 30, 77, 22.5, "ok"),
                9: (11, 55, 24, 57, 22.1, "ok"), 10: (4, 66, 4, 52, 1.6, "insufficient_evidence")}
    for hour, (bl, bn, ml, mn, change, status) in expected.items():
        c = cell(cells, "D", hour)
        assert (c["baseline_late"], c["baseline_n"], c["monitoring_late"], c["monitoring_n"]) == (bl, bn, ml, mn)
        assert round(c["change_pts"], 1) == change and c["status"] == status
    assert sum(c["status"] == "insufficient_evidence" for c in cells) == 44


def test_only_the_planted_cells_differ_between_normal_and_morning_tail():
    normal = qc.late_rate_change_by_hour(_load("normal.csv"))
    tail = qc.late_rate_change_by_hour(_load("morning_tail.csv"))
    differ = [(a["zone_id"], a["hour"]) for a, b in zip(normal, tail) if a != b]
    assert differ == [("D", 6), ("D", 7), ("D", 8), ("D", 9)]


def test_last_7_days_band_flags():
    expected = {"normal.csv": {}, "recovery.csv": {"C": ["midday", "evening_rush"]},
                "morning_tail.csv": {"D": ["morning_rush"]}}
    for name, want in expected.items():
        allz = qc.bands_all_zones(_load(name), monitoring_start="2026-10-05")
        got = {z: [b["band"] for b in bands if b["flag"] is True] for z, bands in allz.items()}
        assert {z: v for z, v in got.items() if v} == want
        assert all(b["status"] == "ok" for bands in allz.values() for b in bands)


def test_numeric_zone_ids_are_counted_not_lost():
    rows = calls("A", BASE_DAYS, 8, 10, 5) + calls("A", MON_DAYS, 8, 10, 5, start=10)
    for r in rows:
        r["zone_id"] = 1
    c = cell(qc.late_rate_change_by_hour(pd.DataFrame(rows)), "1", 8)
    assert (c["baseline_n"], c["monitoring_n"]) == (10, 10)


# ---- prepare once (speed): identical results, raw or prepared ---------------------
def _all_outputs(df):
    out = {}
    for z in "ABCDEF":
        out[z] = (qc.zone_summary(df, z), qc.daily_p_chart(df, z), qc.late_rate_by_band(df, z),
                  qc.stage_summary(df, z), qc.slowest_incidents(df, zone_id=z),
                  qc.late_rate_by_band(df, z, monitoring_start="2026-10-05"))
    out["hours"] = qc.late_rate_change_by_hour(df)
    out["hours3"] = qc.late_rate_change_by_hour(df, smooth_hours=3)
    out["bands"] = qc.bands_all_zones(df)
    return out


def test_prepared_table_gives_identical_results_on_fixture():
    rows = []
    for z in "CA":
        rows += calls(z, BASE_DAYS, 8, 100, 20) + calls(z, MON_DAYS, 17, 100, 40, start=100)
    df = pd.DataFrame(rows)
    assert _all_outputs(qc.prepare(df)) == _all_outputs(df)


def test_prepare_rejects_invalid_rows_and_is_not_mutated():
    rows = calls("A", BASE_DAYS, 8, 20, 5)
    bad = pd.DataFrame(rows); bad.loc[0, "on_scene_at"] = None
    with pytest.raises(ValueError):
        qc.prepare(bad)
    prepared = qc.prepare(pd.DataFrame(rows)); cols = list(prepared.columns)
    qc.daily_p_chart(prepared, "A"); qc.late_rate_change_by_hour(prepared)
    assert list(prepared.columns) == cols  # functions work on copies


def test_prepared_table_gives_identical_results_on_data():
    df = _load("recovery.csv")
    assert _all_outputs(qc.prepare(df)) == _all_outputs(df)
