"""Integration test on the teammate CSVs. Skipped when the files are not there.

Set RW_DATA_DIR to the folder holding normal.csv, recovery.csv and morning_tail.csv
(default: <repo>/data).
"""
import os
from pathlib import Path

import pandas as pd
import pytest

from app import qc

DATA_DIR = Path(os.environ.get("RW_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
FILES = ["normal.csv", "recovery.csv", "morning_tail.csv"]
P0 = {"A": 0.084, "B": 0.094, "C": 0.131, "D": 0.141, "E": 0.238, "F": 0.256}
OCT = lambda a, b: [f"2026-10-{d:02d}" for d in range(a, b + 1)]
# morning_tail.csv: zone D gets +15-25 min travel on 25% of morning-rush calls, days 18-28. The daily
# p chart does not flag it (few calls, so the late share barely moves); the time-band view does.
EXPECTED_FLAGS = {"normal.csv": {}, "recovery.csv": {"C": OCT(1, 6)}, "morning_tail.csv": {}}


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


# Time-band flags on the teammate data (two-proportion z > 3, H-11), checked against an
# independent recomputation from the CSVs. The old rule (baseline treated as exact) also flagged
# zone C evening_rush in normal.csv and morning_tail.csv (0.183 vs 0.125, z 3.50); with the
# baseline's own error counted it is z 2.23, within chance. No planted problem is lost:
# recovery C midday z 5.03, evening_rush z 5.80; morning_tail D morning_rush z 5.05.
EXPECTED_BAND_FLAGS = {
    "normal.csv": {},
    "recovery.csv": {"C": ["midday", "evening_rush"]},
    "morning_tail.csv": {"D": ["morning_rush"]},
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


def test_morning_tail_zone_d_band_and_slowest():
    """morning_tail.csv: D's morning-rush band is flagged (98/264 = 0.371 vs baseline 50/280,
    UCL 0.287, z 5.05) and D's five slowest
    monitoring incidents are the injected severe ones (all in morning rush, 35-42 min)."""
    path = DATA_DIR / "morning_tail.csv"
    if not path.exists():
        pytest.skip(f"{path} not found")
    df = pd.read_csv(path)
    band = next(b for b in qc.late_rate_by_band(df, "D") if b["band"] == "morning_rush")
    assert band["status"] == "ok" and band["flag"] is True
    assert band["p_band"] == pytest.approx(0.371, abs=0.0005)
    assert (band["baseline_late"], band["baseline_n"], band["monitoring_late"], band["n_band"]) == (50, 280, 98, 264)
    assert band["ucl"] == pytest.approx(0.2871, abs=0.00005)
    assert band["z"] == pytest.approx(5.046, abs=0.0005)
    slow = qc.slowest_incidents(df, zone_id="D")
    assert [round(s["response_min"], 1) for s in slow] == [41.6, 40.7, 40.6, 37.0, 35.6]
    assert all(6 <= int(s["unit_notified_at"][11:13]) < 10 for s in slow)
