"""Known-answer and degenerate-case tests for app/qc.py (Final_Plan.en.md section 6)."""
from datetime import date, datetime, timedelta

import pytest

from app import qc
from tests.conftest import EDT, make_batch, make_row

APPROX = dict(rel=1e-12, abs=1e-12)
BASE_DAYS = [date(2026, 9, 14) + timedelta(days=i) for i in range(14)]
MON_DAYS = [date(2026, 9, 28) + timedelta(days=i) for i in range(14)]


def zone_rows(zone, base_late, mon_late, n=100, base_days=BASE_DAYS, mon_days=MON_DAYS):
    """Rows for one zone: base_late/mon_late are late counts per day (int or list)."""
    rows = []
    for days, late in ((base_days, base_late), (mon_days, mon_late)):
        for k, d in enumerate(days):
            rows += make_batch(zone, d, n, late[k] if isinstance(late, list) else late)
    return rows


# ---------- p chart limits: known answers ----------
def test_p_chart_limits_known_answer():
    r = qc.p_chart_limits(0.10, 100)
    assert r["cl"] == pytest.approx(0.10, **APPROX)
    assert r["ucl"] == pytest.approx(0.19, **APPROX)
    assert r["lcl"] == pytest.approx(0.01, **APPROX)


def test_limits_clipped_to_0_1():
    r = qc.p_chart_limits(0.02, 10)  # raw LCL is negative
    assert r["lcl"] == 0.0
    r = qc.p_chart_limits(0.98, 10)  # raw UCL is above 1
    assert r["ucl"] == 1.0


def test_limits_bad_input_raises():
    with pytest.raises(ValueError):
        qc.p_chart_limits(0.1, 0)
    with pytest.raises(ValueError):
        qc.p_chart_limits(1.5, 100)


def test_batch_d20_flags_and_d19_does_not():
    hit = qc.evaluate_batch(20, 100, 0.10)
    assert hit["p"] == pytest.approx(0.20, **APPROX)
    assert hit["deterioration_flag"] is True
    miss = qc.evaluate_batch(19, 100, 0.10)
    assert miss["p"] == pytest.approx(0.19, **APPROX)
    assert miss["deterioration_flag"] is False  # equality is not a signal
    assert miss["status"] == "ok"


def test_independent_labels():
    e = qc.evaluate_batch(25, 100, 0.20, q=0.10)
    assert e["ucl"] == pytest.approx(0.32, **APPROX)
    assert e["above_service_target"] is True
    assert e["deterioration_flag"] is False
    c = qc.evaluate_batch(20, 100, 0.10, q=0.10)
    assert c["above_service_target"] is True  # 0.20 > 0.10
    assert c["deterioration_flag"] is True


def test_above_target_is_strict():
    assert qc.evaluate_batch(10, 100, 0.20)["above_service_target"] is False


def test_p0_zero_or_one_is_insufficient_not_error():
    for p0 in (0.0, 1.0):
        r = qc.evaluate_batch(5, 100, p0)
        assert r["status"] == "insufficient_evidence"
        assert r["deterioration_flag"] is None
        assert r["ucl"] is None and r["lcl"] is None


def test_small_expected_counts_are_insufficient():
    r = qc.evaluate_batch(2, 40, 0.10)  # n*p0 = 4 < 5
    assert r["status"] == "insufficient_evidence"
    assert r["deterioration_flag"] is None
    r = qc.evaluate_batch(30, 40, 0.90)  # n*(1-p0) = 4 < 5
    assert r["status"] == "insufficient_evidence"


def test_empty_batch_is_no_data():
    r = qc.evaluate_batch(0, 0, 0.10)
    assert r["status"] == "no_data"
    assert r["p"] is None and r["deterioration_flag"] is None


# ---------- weighted baseline ----------
def test_weighted_p0_not_unweighted_mean():
    assert qc.weighted_p0([1, 18], [10, 90]) == pytest.approx(0.19, **APPROX)
    assert qc.weighted_p0([], []) is None


# ---------- timing ----------
def test_timing_components_known_answer():
    t = lambda h, m: datetime(2026, 9, 14, h, m, tzinfo=EDT).isoformat()
    r = qc.timing_components(t(12, 0), t(12, 2), t(12, 4), t(12, 12))
    assert r == {"call_handling_min": 2.0, "turnout_min": 2.0, "travel_min": 8.0,
                 "response_min": 10.0, "total_wait_min": 12.0}


def test_timing_across_different_offsets():
    # same instant written in UTC and in New York
    r = qc.timing_components("2026-09-14T16:00:00Z", "2026-09-14T12:02:00-04:00",
                             "2026-09-14T16:04:00+00:00", "2026-09-14T12:12:00-04:00")
    assert r["response_min"] == 10.0 and r["call_handling_min"] == 2.0


# ---------- descriptive ----------
TAIL = [5, 5, 5, 5, 5, 5, 5, 5, 20, 20]


def test_tail_fixture():
    r = qc.describe_responses(TAIL, T=12)
    assert r["n"] == 10 and r["late"] == 2
    assert r["mean"] == pytest.approx(8.0, **APPROX)
    assert r["p90_min"] == pytest.approx(20.0, **APPROX)
    assert r["late_rate"] == pytest.approx(0.20, **APPROX)
    assert r["status"] == "ok"
    assert r["p90_warning"] == "small_sample"  # n=10 < 20


def test_exactly_T_is_not_late():
    r = qc.describe_responses([12, 12, 12.0001], T=12)
    assert r["late"] == 1


def test_p90_linear_interpolation():
    # n=5: h = 3.6 -> 4 + 0.6 * (5 - 4) = 4.6
    assert qc.percentile_linear([1, 2, 3, 4, 5], 0.9) == pytest.approx(4.6, **APPROX)


def test_empty_descriptive_is_no_data():
    r = qc.describe_responses([], T=12)
    assert r["status"] == "no_data" and r["n"] == 0
    assert r["late_rate"] is None and r["mean"] is None and r["p90_min"] is None
    assert r["p90_warning"] is None


def test_single_value_descriptive():
    r = qc.describe_responses([7.0])
    assert r["n"] == 1 and r["p90_min"] == 7.0 and r["late_rate"] == 0.0
    assert r["p90_warning"] == "small_sample"


def test_constant_responses():
    r = qc.describe_responses([9.0] * 25)
    assert r["mean"] == 9.0 and r["p90_min"] == 9.0 and r["late_rate"] == 0.0
    assert r["p90_warning"] is None  # n=25 >= 20


def test_warning_threshold_19_vs_20():
    assert qc.describe_responses([5.0] * 19)["p90_warning"] == "small_sample"
    assert qc.describe_responses([5.0] * 20)["p90_warning"] is None


def test_missing_value_in_descriptive_raises():
    with pytest.raises(ValueError):
        qc.describe_responses([5.0, float("nan")])


# ---------- validation ----------
def test_validation_clean_data_has_no_errors(frame):
    assert qc.validate_incidents(frame(make_batch("A", date(2026, 9, 14), 3, 1))) == []


def test_validation_reports_problems(frame):
    rows = make_batch("A", date(2026, 9, 14), 4, 0)
    rows[1]["incident_id"] = rows[0]["incident_id"]                     # duplicate
    rows[2]["on_scene_at"] = rows[2]["unit_en_route_at"][:11] + "00:00:00-04:00"  # reversed
    rows[3]["unit_en_route_at"] = None                                  # missing
    rows[0]["call_received_at"] = "2026-09-14T11:59:00"                 # no offset
    errs = qc.validate_incidents(frame(rows))
    found = {(e["row"], e["field"]) for e in errs}
    assert (3, "incident_id") in found      # row numbers = spreadsheet rows (header is row 1)
    assert (4, "on_scene_at") in found
    assert (5, "unit_en_route_at") in found
    assert (2, "call_received_at") in found
    reasons = " ".join(e["reason"] for e in errs)
    assert "duplicate" in reasons and "missing timezone offset" in reasons
    assert "missing" in reasons and "earlier than" in reasons


def test_other_functions_refuse_invalid_data(frame):
    rows = make_batch("A", date(2026, 9, 14), 2, 0)
    rows[0]["on_scene_at"] = None
    with pytest.raises(ValueError):
        qc.add_timing_components(frame(rows))


# ---------- slowest incidents ----------
def test_slowest_incidents_order_and_excess(frame):
    t0 = datetime(2026, 9, 29, 12, 0, tzinfo=EDT)
    mins = {"F": 8, "B": 20, "A": 20, "D": 12, "C": 5, "E": 25}
    rows = [make_row(k, "C", t0 + timedelta(minutes=i), v) for i, (k, v) in enumerate(mins.items())]
    out = qc.slowest_incidents(frame(rows), T=12)
    assert [o["incident_id"] for o in out] == ["E", "A", "B", "D", "F"]
    assert [o["minutes_over_target"] for o in out] == [13, 8, 8, 0, 0]
    assert out[0]["response_min"] == 25
    assert out[0]["zone_id"] == "C"
    assert out[0]["unit_notified_at"].endswith("-04:00")
    assert set(out[0]) == {"incident_id", "zone_id", "unit_notified_at", "on_scene_at",
                           "response_min", "minutes_over_target"}


def test_slowest_incidents_empty_and_short(frame):
    assert qc.slowest_incidents(frame([]), T=12) == []
    rows = make_batch("A", date(2026, 9, 29), 3, 1)
    assert len(qc.slowest_incidents(frame(rows))) == 3


# ---------- daily p chart ----------
def test_daily_chart_weighted_baseline_and_flags(frame):
    rows = zone_rows("C", 10, [10] * 3 + [20] + [10] * 10)  # monitoring day 4 has 20 late
    r = qc.daily_p_chart(frame(rows), zone_id="C")
    assert r["status"] == "ok" and r["baseline_days"] == 14
    assert r["p0"] == pytest.approx(0.10, **APPROX)
    pts = r["points"]
    assert len(pts) == 28
    assert pts[0]["phase"] == "baseline" and pts[0]["deterioration_flag"] is None
    assert pts[0]["cl"] == pytest.approx(0.10, **APPROX)  # limits drawn on baseline days too
    mon = pts[14:]
    assert [p["deterioration_flag"] for p in mon] == [False] * 3 + [True] + [False] * 10
    assert mon[3]["date"] == "2026-10-01"
    assert mon[3]["ucl"] == pytest.approx(0.19, **APPROX)
    assert mon[3]["above_service_target"] is True
    assert mon[0]["above_service_target"] is False  # p = 0.10 is not > q


def test_daily_chart_p0_is_weighted_by_batch_size(frame):
    rows = make_batch("A", BASE_DAYS[0], 10, 1) + make_batch("A", BASE_DAYS[1], 90, 18)
    for d in BASE_DAYS[2:]:
        rows += make_batch("A", d, 100, 19)  # 14 baseline days in total
    r = qc.daily_p_chart(frame(rows))
    assert r["baseline_n"] == 10 + 90 + 12 * 100
    assert r["baseline_late"] == 1 + 18 + 12 * 19
    assert r["p0"] == pytest.approx(r["baseline_late"] / r["baseline_n"], **APPROX)


def test_daily_chart_uses_local_date(frame):
    # 03:30 UTC on 09-28 is 23:30 on 09-27 in New York: a baseline day
    row = make_row("X", "A", datetime.fromisoformat("2026-09-28T03:30:00+00:00"), 5)
    r = qc.daily_p_chart(frame([row]))
    assert r["points"][0]["date"] == "2026-09-27"
    assert r["points"][0]["phase"] == "baseline"


def test_daily_chart_13_baseline_days_is_baseline_insufficient(frame):
    rows = zone_rows("C", 10, 10, base_days=BASE_DAYS[:13])
    r = qc.daily_p_chart(frame(rows))
    assert r["status"] == "baseline_insufficient"
    # days with incidents are baseline_insufficient; the missing 14th baseline day is a no_data point
    assert all(p["status"] == "baseline_insufficient" for p in r["points"] if p["n"] > 0)
    assert [p["date"] for p in r["points"] if p["n"] == 0] == [BASE_DAYS[13].isoformat()]
    assert all(p["status"] == "no_data" for p in r["points"] if p["n"] == 0)
    assert all(p["deterioration_flag"] is None and p["ucl"] is None for p in r["points"])


def test_daily_chart_needs_five_late_and_five_nonlate(frame):
    assert qc.daily_p_chart(frame(zone_rows("A", 0, 0)))["status"] == "baseline_insufficient"
    r = qc.daily_p_chart(frame(zone_rows("A", 100, 100)))
    assert r["status"] == "baseline_insufficient"  # p0 = 1, no non-late incidents
    assert r["p0"] == 1.0
    assert all(p["ucl"] is None for p in r["points"])


def test_daily_chart_empty(frame):
    r = qc.daily_p_chart(frame([]))
    assert r["status"] == "no_data" and r["points"] == [] and r["p0"] is None


def test_daily_chart_monitoring_day_with_small_n_is_insufficient(frame):
    rows = zone_rows("C", 10, 10, mon_days=MON_DAYS[:1], n=100)
    rows = [r for r in rows if not r["incident_id"].startswith("C-2026-09-28")]
    rows += make_batch("C", MON_DAYS[0], 20, 15)  # n*p0 = 2 < 5, even with p = 0.75
    r = qc.daily_p_chart(frame(rows))
    last = r["points"][-1]
    assert last["status"] == "insufficient_evidence"
    assert last["deterioration_flag"] is None


# ---------- zone summary ----------
def test_zone_summary_flagged_zone(frame):
    rows = zone_rows("C", 10, [10] * 3 + [30] * 11)
    s = qc.zone_summary(frame(rows), "C")
    assert s["zone_id"] == "C" and s["status"] == "ok"
    assert s["n"] == 1400 and s["late"] == 30 + 330
    assert s["late_rate"] == pytest.approx(360 / 1400, **APPROX)
    assert s["baseline_n"] == 1400 and s["baseline_late"] == 140
    assert s["p0"] == pytest.approx(0.10, **APPROX)
    assert s["above_service_target"] is True
    assert s["deterioration_flag"] is True
    assert s["deterioration_days"] == 11
    assert s["first_flag_date"] == "2026-10-01" and s["last_flag_date"] == "2026-10-11"
    assert s["p90_warning"] is None


def test_zone_summary_chronically_slow_zone_not_flagged(frame):
    s = qc.zone_summary(frame(zone_rows("E", 24, 24)), "E")
    assert s["above_service_target"] is True
    assert s["deterioration_flag"] is False
    assert s["first_flag_date"] is None and s["deterioration_days"] == 0


def test_zone_summary_baseline_insufficient_keeps_descriptives(frame):
    s = qc.zone_summary(frame(zone_rows("C", 10, 30, base_days=BASE_DAYS[:13])), "C")
    assert s["status"] == "baseline_insufficient"
    assert s["deterioration_flag"] is None  # unknown, not False
    assert s["above_service_target"] is True
    assert s["n"] == 1400 and s["late_rate"] == pytest.approx(0.30, **APPROX)


def test_zone_summary_no_data(frame):
    s = qc.zone_summary(frame(zone_rows("A", 10, 10)), "B")  # zone B has no rows
    assert s["status"] == "no_data"
    assert s["n"] == 0 and s["late_rate"] is None and s["p90_min"] is None
    assert s["above_service_target"] is None and s["deterioration_flag"] is None


# ---------- stage summary ----------
def test_stage_summary(frame):
    rows = []
    for day, tr in ((date(2026, 9, 20), 1.0), (date(2026, 10, 2), 3.0)):
        for i in range(5):
            rows.append(make_row(f"{day}-{i}", "C", datetime(day.year, day.month, day.day, 9, i, tzinfo=EDT),
                                 response_min=2.0 + 5.0, call_wait=1.0 + 0.5 * i, turnout=tr))
    out = qc.stage_summary(frame(rows), zone_id="C")
    assert [s["stage"] for s in out] == ["call_handling", "turnout", "travel"]
    turnout = out[1]
    assert turnout["baseline_median_min"] == pytest.approx(1.0, **APPROX)
    assert turnout["monitoring_median_min"] == pytest.approx(3.0, **APPROX)
    assert out[0]["monitoring_p90_min"] == pytest.approx(qc.percentile_linear([1, 1.5, 2, 2.5, 3], 0.9), **APPROX)


def test_stage_summary_empty_is_none(frame):
    out = qc.stage_summary(frame([]))
    assert len(out) == 3 and all(s["baseline_median_min"] is None and s["monitoring_p90_min"] is None for s in out)


# ---------- review fixes ----------
def test_slowest_incidents_ignore_baseline(frame):
    base = make_row("BASE", "C", datetime(2026, 9, 15, 12, 0, tzinfo=EDT), 40)
    mon = make_row("MON", "C", datetime(2026, 10, 2, 12, 0, tzinfo=EDT), 20)
    assert [o["incident_id"] for o in qc.slowest_incidents(frame([base, mon]))] == ["MON"]


def test_zone_summary_has_zone_type(frame):
    s = qc.zone_summary(frame(zone_rows("C", 10, 10)), "C")
    assert s["zone_type"] == "residential"
    assert qc.ZONE_TYPES == {"A": "downtown", "B": "downtown", "C": "residential",
                             "D": "residential", "E": "outer", "F": "outer"}


def test_day_without_incidents_is_a_no_data_point(frame):
    rows = zone_rows("C", 10, 10) + zone_rows("A", 10, 10)
    gap = MON_DAYS[3].isoformat()
    rows = [r for r in rows if not (r["zone_id"] == "C" and r["unit_notified_at"].startswith(gap))]
    chart = qc.daily_p_chart(frame(rows), zone_id="C")
    assert len(chart["points"]) == len(BASE_DAYS) + len(MON_DAYS)
    point = next(p for p in chart["points"] if p["date"] == gap)
    assert point["n"] == 0 and point["status"] == "no_data"
    assert point["p"] is None and point["ucl"] is None and point["deterioration_flag"] is None


def test_expected_count_exactly_five_is_enough():
    # p0 = 1260/1400 = 0.9, n = 50: n*(1-p0) is 4.999999999999999 in floating point, exactly 5 in fact
    point = qc.evaluate_batch(45, 50, 1260 / 1400)
    assert point["status"] == "ok"
