"""Integration test on the teammate CSVs. Skipped when the files are not there.

Set RW_DATA_DIR to the folder holding normal.csv, hidden_tail.csv and recovery.csv
(default: <repo>/data).
"""
import os
from pathlib import Path

import pandas as pd
import pytest

from app import qc

DATA_DIR = Path(os.environ.get("RW_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
FILES = ["normal.csv", "hidden_tail.csv", "recovery.csv"]
P0 = {"A": 0.084, "B": 0.094, "C": 0.131, "D": 0.141, "E": 0.238, "F": 0.256}
OCT = lambda a, b: [f"2026-10-{d:02d}" for d in range(a, b + 1)]
EXPECTED_FLAGS = {"normal.csv": {}, "hidden_tail.csv": {"C": OCT(1, 11)}, "recovery.csv": {"C": OCT(1, 6)}}


@pytest.fixture(scope="module")
def results():
    missing = [f for f in FILES if not (DATA_DIR / f).exists()]
    if missing:
        pytest.skip(f"data files not found in {DATA_DIR}: {missing}")
    out = {}
    for f in FILES:
        df = pd.read_csv(DATA_DIR / f)
        assert qc.validate_incidents(df) == []
        out[f] = {z: qc.daily_p_chart(df, zone_id=z) for z in P0}
    return out


@pytest.mark.parametrize("name", FILES)
def test_baseline_p0_per_zone(results, name):
    for zone, p0 in P0.items():
        assert results[name][zone]["p0"] == pytest.approx(p0, abs=0.0005)
        assert results[name][zone]["status"] == "ok"


@pytest.mark.parametrize("name", FILES)
def test_flagged_days(results, name):
    flagged = {}
    for zone, chart in results[name].items():
        days = [p["date"] for p in chart["points"] if p["deterioration_flag"] is True]
        if days:
            flagged[zone] = days
    assert flagged == EXPECTED_FLAGS[name]


# Time-band flags on the teammate data. Computed independently twice (a standalone draft and
# app.qc) with identical results. normal.csv's zone C evening_rush flag (p 0.183 vs UCL 0.175)
# is a chance flag: 30 unadjusted comparisons, so about one is expected under no change.
EXPECTED_BAND_FLAGS = {
    "normal.csv": {"C": ["evening_rush"]},
    "hidden_tail.csv": {"C": ["night", "morning_rush", "midday", "evening_rush", "late_evening"]},
    "recovery.csv": {"C": ["midday", "evening_rush"]},
}


@pytest.mark.parametrize("name", FILES)
def test_band_flags(name):
    missing = [f for f in FILES if not (DATA_DIR / f).exists()]
    if missing:
        pytest.skip(f"data files not found in {DATA_DIR}: {missing}")
    df = pd.read_csv(DATA_DIR / name)
    flagged = {}
    for zone in P0:
        bands = qc.late_rate_by_band(df, zone)
        assert {b["status"] for b in bands} == {"ok"}
        keys = [b["band"] for b in bands if b["flag"] is True]
        if keys:
            flagged[zone] = keys
    assert flagged == EXPECTED_BAND_FLAGS[name]
