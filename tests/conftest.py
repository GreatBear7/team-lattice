"""Shared test setup. Puts the repo root on sys.path so `from app.qc import ...` works."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

EDT = timezone(timedelta(hours=-4))  # New York in September and October 2026


def iso(dt):
    """datetime -> ISO 8601 string with offset, like 2026-09-14T12:00:00-04:00."""
    return dt.isoformat()


def make_row(incident_id, zone, notified, response_min, call_wait=1.0, turnout=2.0):
    """One incident row. notified is a timezone-aware datetime; times are in minutes."""
    call = notified - timedelta(minutes=call_wait)
    en_route = notified + timedelta(minutes=turnout)
    on_scene = notified + timedelta(minutes=response_min)
    return {
        "incident_id": incident_id,
        "zone_id": zone,
        "priority": "high",
        "call_received_at": iso(call),
        "unit_notified_at": iso(notified),
        "unit_en_route_at": iso(en_route),
        "on_scene_at": iso(on_scene),
        "dispatcher_id": "DSP01",
        "unit_id": "U1",
    }


def make_batch(zone, day, n, late, prefix=None):
    """n incidents on local date `day` (a date); `late` of them take 15 min, the rest 5 min."""
    rows = []
    start = datetime(day.year, day.month, day.day, 12, 0, tzinfo=EDT)
    for i in range(n):
        r = 15.0 if i < late else 5.0
        notified = start + timedelta(seconds=i)
        rows.append(make_row(f"{prefix or zone}-{day.isoformat()}-{i:04d}", zone, notified, r))
    return rows


@pytest.fixture
def batch():
    return make_batch


@pytest.fixture
def frame():
    """Turn a list of row dicts into a DataFrame."""
    return lambda rows: pd.DataFrame(rows)
