"""Tests for the pooled time-of-day comparison, late_rate_by_band (Final_Plan 5.4 and 6)."""
from datetime import date, datetime, timedelta, timezone

import pandas as pd
import pytest

import math

from app.qc import BANDS, band_of_hour, late_rate_by_band, two_proportion_test

TOL = dict(rel=1e-12, abs=1e-12)
ORDER = [key for key, _, _, _ in BANDS]
BASELINE_DAYS = [date(2026, 9, 14) + timedelta(days=i) for i in range(14)]
MONITOR_DAYS = [date(2026, 9, 28) + timedelta(days=i) for i in range(14)]
EDT = timezone(timedelta(hours=-4))


def incident(i, notified, late, zone="C"):
    """One valid incident; response 20 min if late else 5 min. notified: aware datetime."""
    r = 20 if late else 5
    return {"incident_id": f"I{i:05d}", "zone_id": zone, "priority": "high",
            "call_received_at": (notified - timedelta(minutes=1)).isoformat(),
            "unit_notified_at": notified.isoformat(),
            "unit_en_route_at": (notified + timedelta(minutes=1)).isoformat(),
            "on_scene_at": (notified + timedelta(minutes=r)).isoformat()}


def spread(days, n, late, hour, start=0):
    """n incidents at local `hour`, spread round-robin over `days`; the first `late` are late."""
    rows = []
    for i in range(n):
        d = days[i % len(days)]
        t = datetime(d.year, d.month, d.day, hour, (i // len(days)) % 60, i % 60, tzinfo=EDT)
        rows.append(incident(start + i, t, i < late))
    return rows


def build(base_late, base_n, mon_late, mon_n, hour=12):
    rows = spread(BASELINE_DAYS, base_n, base_late, hour)
    rows += spread(MONITOR_DAYS, mon_n, mon_late, hour, start=base_n)
    return pd.DataFrame(rows)


def band(result, key):
    return next(b for b in result if b["band"] == key)


def midday(df):
    return band(late_rate_by_band(df, "C"), "midday")


# ---- known answer (two-proportion z test, H-11) ------------------------------
# By hand: 120/600 vs 180/600 -> pooled 300/1200 = 0.25,
# SE = sqrt(0.25 * 0.75 * (1/600 + 1/600)) = sqrt(0.000625) = 0.025, z = (0.30 - 0.20) / 0.025 = 4.
def test_two_proportion_known_answer():
    t = two_proportion_test(600, 120, 600, 180)
    assert t["z"] == pytest.approx(4.0, **TOL)
    assert t["flag"] is True
    assert t["ucl"] == pytest.approx(0.2736345402717933, **TOL)
    assert t["lcl"] == pytest.approx(0.1352984622095963, **TOL)


def test_two_proportion_exact_boundary_is_not_a_flag():
    # 555/2400 vs 645/2400 -> pooled 0.25, SE = 0.0125, z = 0.0375 / 0.0125 = 3 exactly.
    # In floating point z is 2.9999999999999982; the integer rule decides, and z = 3 is not > 3.
    t = two_proportion_test(2400, 555, 2400, 645)
    assert t["z"] == pytest.approx(3.0, **TOL)
    assert t["flag"] is False
    assert t["ucl"] == pytest.approx(645 / 2400, **TOL)  # the limit line sits on the boundary rate
    assert not 645 / 2400 > t["ucl"]  # the drawn line agrees with the flag exactly (review finding)
    assert two_proportion_test(2400, 555, 2400, 646)["flag"] is True  # one more late call


def test_old_known_answer_no_longer_flags():
    # Old rule: 108/400 vs a baseline 80/400 treated as exact -> UCL 0.26, flag. With the
    # baseline's own error counted, z = 2.33: a 7-point rise on 400 calls each is within chance.
    t = two_proportion_test(400, 80, 400, 108)
    assert t["z"] == pytest.approx(2.33479303527988, rel=1e-12)
    assert t["flag"] is False


def test_known_answer_through_late_rate_by_band():
    r = midday(build(120, 600, 180, 600))
    assert r["p0_band"] == pytest.approx(0.20, **TOL)
    assert r["p_band"] == pytest.approx(0.30, **TOL)
    assert r["z"] == pytest.approx(4.0, **TOL)
    assert r["ucl"] == pytest.approx(0.2736345402717933, **TOL)
    assert r["flag"] is True and r["status"] == "ok"
    r = midday(build(555, 2400, 645, 2400))
    assert r["flag"] is False and r["status"] == "ok"


# ---- degenerate cases of the test itself ---------------------------------------
def test_no_change_gives_z_zero_and_no_flag():
    t = two_proportion_test(400, 80, 400, 80)
    assert t["z"] == 0.0 and t["flag"] is False


def test_improvement_is_never_a_flag():
    t = two_proportion_test(400, 200, 400, 20)  # far better than baseline: z very negative
    assert t["z"] < -3 and t["flag"] is False


@pytest.mark.parametrize("args", [(0, 0, 100, 10), (100, 10, 0, 0), (100, 0, 100, 0),
                                  (100, 100, 100, 100), (100, 101, 100, 10), (100, 10, 100, -1)])
def test_undefined_inputs_raise(args):
    with pytest.raises(ValueError):
        two_proportion_test(*args)


def test_flag_is_exactly_p_above_ucl_and_ucl_is_the_z3_point():
    for nb, xb, nm in [(376, 47, 399), (280, 50, 264), (403, 39, 400), (164, 20, 175), (50, 10, 20)]:
        ucl = two_proportion_test(nb, xb, nm, 0)["ucl"]
        for xm in range(nm + 1):
            t = two_proportion_test(nb, xb, nm, xm)
            assert t["ucl"] == pytest.approx(ucl, **TOL)  # the line does not depend on xm
            assert t["flag"] == (xm / nm > t["ucl"])  # exact, no tolerance
            pp = (xb + xm) / (nb + nm)
            assert t["z"] == pytest.approx((xm / nm - xb / nb)
                                           / math.sqrt(pp * (1 - pp) * (1 / nm + 1 / nb)), rel=1e-12)
        if ucl < 1:  # plugging the line back in gives z = 3
            L = xb + ucl * nm
            pp = L / (nb + nm)
            assert (ucl - xb / nb) / math.sqrt(pp * (1 - pp) * (1 / nm + 1 / nb)) == pytest.approx(3.0)


# ---- band assignment ---------------------------------------------------------
@pytest.mark.parametrize("hour,expected", [
    (0, "night"), (5, "night"), (6, "morning_rush"), (9, "morning_rush"), (10, "midday"),
    (15, "midday"), (16, "evening_rush"), (19, "evening_rush"), (20, "late_evening"),
    (23, "late_evening"),
])
def test_band_of_hour_half_open(hour, expected):
    assert band_of_hour(hour) == expected


def counts(t):
    """Which band (and phase) one incident notified at ISO time t lands in."""
    res = late_rate_by_band(pd.DataFrame([incident(0, pd.Timestamp(t).to_pydatetime(), False)]), "C")
    return [(b["band"], b["baseline_n"], b["n_band"]) for b in res if b["baseline_n"] + b["n_band"]]


def test_utc_converted_to_new_york_first():
    assert counts("2026-09-28T10:00:00Z") == [("morning_rush", 0, 1)]   # 06:00 local, monitoring
    assert counts("2026-09-28T03:30:00Z") == [("late_evening", 1, 0)]   # 23:30 on 09-27, baseline


def test_baseline_end_is_exclusive():
    assert counts("2026-09-28T00:00:00-04:00") == [("night", 0, 1)]
    assert counts("2026-09-27T23:59:00-04:00") == [("late_evening", 1, 0)]


def test_five_bands_in_order_with_labels():
    res = late_rate_by_band(build(20, 100, 20, 100), "C")
    assert [b["band"] for b in res] == ORDER
    assert [b["interval_local"] for b in res] == [
        "00:00-06:00", "06:00-10:00", "10:00-16:00", "16:00-20:00", "20:00-24:00"]
    night = band(res, "night")  # no incidents at all in this band
    assert night["status"] == "no_data"
    assert night["p0_band"] is None and night["p_band"] is None
    assert night["ucl"] is None and night["lcl"] is None and night["flag"] is None


# ---- insufficient evidence and degenerate cases ------------------------------
def assert_insufficient(r):
    assert r["status"] == "insufficient_evidence"
    assert r["ucl"] is None and r["lcl"] is None and r["z"] is None and r["flag"] is None


def test_empty_monitoring_band():
    df = pd.concat([build(20, 100, 20, 100), build(10, 50, 0, 0, hour=8)], ignore_index=True)
    df["incident_id"] = [f"X{i}" for i in range(len(df))]
    r = band(late_rate_by_band(df, "C"), "morning_rush")
    assert_insufficient(r)
    assert r["p_band"] is None and r["p0_band"] == pytest.approx(0.2, **TOL)


def test_empty_baseline_band():
    df = pd.concat([build(20, 100, 20, 100), build(0, 0, 10, 50, hour=8)], ignore_index=True)
    df["incident_id"] = [f"X{i}" for i in range(len(df))]
    r = band(late_rate_by_band(df, "C"), "morning_rush")
    assert_insufficient(r)
    assert r["p0_band"] is None and r["p_band"] == pytest.approx(0.2, **TOL)


@pytest.mark.parametrize("base_late,base_n", [(3, 100), (98, 100)])
def test_fewer_than_five_late_or_non_late_in_band_baseline(base_late, base_n):
    df = pd.concat([build(20, 100, 20, 100), build(base_late, base_n, 10, 100, hour=8)],
                   ignore_index=True)
    df["incident_id"] = [f"X{i}" for i in range(len(df))]
    assert_insufficient(band(late_rate_by_band(df, "C"), "morning_rush"))


def test_n_times_p0_below_five():
    # baseline 10/50 (p0 = 0.2) is fine, but monitoring n = 20 gives n*p0 = 4 < 5
    assert_insufficient(midday(build(10, 50, 5, 20)))


def test_p0_zero_or_one_never_divides_by_zero():
    assert midday(build(0, 100, 10, 100))["status"] == "baseline_insufficient"   # zone has no late
    assert midday(build(100, 100, 10, 100))["status"] == "baseline_insufficient"  # zone has no on-time


def test_zone_baseline_under_14_days_suppresses_all_bands():
    rows = spread(BASELINE_DAYS[:13], 130, 20, 12) + spread(MONITOR_DAYS, 100, 20, 12, start=130)
    res = late_rate_by_band(pd.DataFrame(rows), "C")
    assert {b["status"] for b in res} == {"baseline_insufficient"}
    assert all(b["flag"] is None for b in res)


def test_empty_data():
    res = late_rate_by_band(pd.DataFrame(columns=list(incident(0, datetime(2026, 9, 14, tzinfo=EDT),
                                                               False))), "C")
    assert [b["status"] for b in res] == ["no_data"] * 5


def test_invalid_rows_raise_instead_of_being_dropped():
    df = build(20, 100, 20, 100)
    df.loc[0, "on_scene_at"] = None
    with pytest.raises(ValueError):
        late_rate_by_band(df, "C")


# ---- a constructed deterioration in one band only ----------------------------
def test_only_the_deteriorated_band_is_flagged():
    parts = [build(20, 100, late, 100, hour=h)
             for h, late in [(3, 20), (8, 60), (12, 20), (17, 20), (22, 20)]]
    df = pd.concat(parts, ignore_index=True)
    df["incident_id"] = [f"X{i}" for i in range(len(df))]
    flags = {b["band"]: b["flag"] for b in late_rate_by_band(df, "C")}
    assert flags == {"night": False, "morning_rush": True, "midday": False,
                     "evening_rush": False, "late_evening": False}
