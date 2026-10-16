"""ResponseWatch statistics: plain functions, no web framework.

Method (docs/Final_Plan.en.md sections 3, 5.1-5.3):
    - Response time R = on_scene_at - unit_notified_at, in minutes. Late means R > T (T = 12).
    - Daily p chart per zone: p_i = d_i / n_i, centre line p0 = baseline late / baseline n
      (weighted), limits p0 +/- 3 * sqrt(p0 * (1 - p0) / n_i) clipped to [0, 1].
      Deterioration flag: p_i > UCL_i (strict), monitoring days only.
    - above_service_target: late_rate > q (q = 0.10). It is independent of the flag.

Conventions:
    - Times are minutes, rates are proportions 0-1.
    - None means "not available" (no data, insufficient evidence, not applicable). It is never
      0 and never False.
    - status is one of "ok", "insufficient_evidence", "baseline_insufficient", "no_data".
    - A day is the America/New_York date of unit_notified_at (timestamps are converted first).
    - P90 uses linear interpolation: sort, h = (n - 1) * 0.9, interpolate between neighbours.
"""
import math
from datetime import timedelta
import re

import pandas as pd

# ---------- settings (demo values, not clinical standards) ----------
TIMEZONE = "America/New_York"
DEFAULT_T = 12.0                       # minutes; late when R > T
DEFAULT_Q = 0.10                       # allowed late rate
DEFAULT_BASELINE_END = "2026-09-28T00:00:00-04:00"  # exclusive; first 14 days come before it
MIN_BASELINE_DAYS = 14
MIN_BASELINE_EACH = 5                  # at least 5 late and 5 non-late baseline incidents
MIN_EXPECTED = 5                       # n*p0 and n*(1-p0) must both be >= 5
SMALL_SAMPLE_N = 20                    # P90 warning below this n

ZONE_TYPES = {"A": "downtown", "B": "downtown", "C": "residential", "D": "residential",
              "E": "outer", "F": "outer"}  # fixed functional zones (Final_Plan 4.1)
TIMESTAMP_COLUMNS = ["call_received_at", "unit_notified_at", "unit_en_route_at", "on_scene_at"]
_OFFSET_AT_END = re.compile(r"(?:Z|[+-]\d{2}:?\d{2})$")


# =====================================================================
# 1. Small numeric helpers
# =====================================================================
def percentile_linear(values, fraction):
    """Percentile with linear interpolation. fraction=0.9 gives P90.

    Sorted values v[0..n-1]; h = (n - 1) * fraction; result = v[lo] + (h - lo) * (v[lo+1] - v[lo]).
    Returns None for an empty list. Raises ValueError for missing (NaN) values.
    """
    values = _clean_numbers(values)
    n = len(values)
    if n == 0:
        return None
    v = sorted(values)
    h = (n - 1) * fraction
    lo = int(math.floor(h))
    if lo >= n - 1:
        return float(v[-1])
    return float(v[lo] + (h - lo) * (v[lo + 1] - v[lo]))


def _clean_numbers(values):
    out = [float(x) for x in values]
    if any(math.isnan(x) for x in out):
        raise ValueError("missing (NaN) value in input; remove or fix it, it is never replaced by 0")
    return out


def median(values):
    """Median; None for an empty list."""
    values = _clean_numbers(values)
    if not values:
        return None
    v = sorted(values)
    n = len(v)
    mid = n // 2
    return float(v[mid]) if n % 2 else (v[mid - 1] + v[mid]) / 2


def describe_responses(responses, T=DEFAULT_T):
    """Descriptive statistics of response times (minutes).

    Returns n, late (R > T, strict), late_rate = late/n, mean, p90_min, p90_warning, status.
    n = 0 gives None values and status "no_data". p90_warning is "small_sample" when n < 20.
    """
    values = _clean_numbers(responses)
    n = len(values)
    if n == 0:
        return {"n": 0, "late": 0, "late_rate": None, "mean": None, "p90_min": None,
                "p90_warning": None, "status": "no_data"}
    late = sum(1 for x in values if x > T)
    return {
        "n": n,
        "late": late,
        "late_rate": late / n,
        "mean": sum(values) / n,
        "p90_min": percentile_linear(values, 0.9),
        "p90_warning": "small_sample" if n < SMALL_SAMPLE_N else None,
        "status": "ok",
    }


def weighted_p0(late_counts, batch_sizes):
    """Baseline proportion = total late / total incidents (NOT the mean of daily percentages)."""
    total = sum(batch_sizes)
    if total == 0:
        return None
    return sum(late_counts) / total


# =====================================================================
# 2. Timestamps, timing components, validation
# =====================================================================
def _to_utc(series):
    """Parse ISO 8601 strings into UTC timestamps. Unparseable or missing -> NaT."""
    return pd.to_datetime(series, utc=True, format="ISO8601", errors="coerce")


def timing_components(call_received_at, unit_notified_at, unit_en_route_at, on_scene_at):
    """Timing components in minutes for ONE incident, from four ISO 8601 strings with offset.

    call_handling = notified - call; turnout = en_route - notified; travel = on_scene - en_route;
    response R = on_scene - notified; total_wait = on_scene - call.
    """
    call, notified, en_route, on_scene = (
        pd.Timestamp(x) for x in (call_received_at, unit_notified_at, unit_en_route_at, on_scene_at)
    )
    minutes = lambda a, b: (b - a).total_seconds() / 60
    return {
        "call_handling_min": minutes(call, notified),
        "turnout_min": minutes(notified, en_route),
        "travel_min": minutes(en_route, on_scene),
        "response_min": minutes(notified, on_scene),
        "total_wait_min": minutes(call, on_scene),
    }


def validate_incidents(df):
    """Check an incident table. Returns a list of {"row", "field", "reason"}; [] means clean.

    "row" is the spreadsheet row of a CSV read with a header (first data row = 2).
    Checks: missing columns, missing zone/id, duplicate incident_id, missing or unparseable
    timestamps, timestamps without a timezone offset, and reversed order
    (call <= notified <= en route <= on scene). Nothing is repaired or imputed.
    """
    errors = []
    required = ["incident_id", "zone_id"] + TIMESTAMP_COLUMNS
    for col in required:
        if col not in df.columns:
            errors.append({"row": None, "field": col, "reason": "missing column"})
    if errors:
        return errors

    def row_no(i):
        return int(i) + 2

    pos = pd.RangeIndex(len(df))
    # ids and zones
    for col in ("incident_id", "zone_id"):
        s = df[col].reset_index(drop=True)
        blank = s.isna() | (s.astype(str).str.strip() == "")
        for i in pos[blank]:
            errors.append({"row": row_no(i), "field": col, "reason": f"missing {col}"})
    ids = df["incident_id"].reset_index(drop=True)
    dup = ids.notna() & ids.duplicated(keep="first")
    for i in pos[dup]:
        errors.append({"row": row_no(i), "field": "incident_id", "reason": f"duplicate id {ids[i]}"})

    # timestamps
    parsed = {}
    for col in TIMESTAMP_COLUMNS:
        raw = df[col].reset_index(drop=True)
        text = raw.astype("string").str.strip()
        missing = text.isna() | (text == "")
        has_offset = text.fillna("").str.contains(_OFFSET_AT_END)
        utc = _to_utc(text.where(~missing))
        bad = ~missing & utc.isna()
        no_offset = ~missing & ~bad & ~has_offset
        for i in pos[missing]:
            errors.append({"row": row_no(i), "field": col, "reason": "missing timestamp"})
        for i in pos[bad]:
            errors.append({"row": row_no(i), "field": col, "reason": "invalid timestamp"})
        for i in pos[no_offset]:
            errors.append({"row": row_no(i), "field": col, "reason": "missing timezone offset"})
        parsed[col] = utc.where(~(missing | bad | no_offset))

    # chronological order, only where both timestamps are usable
    for earlier, later in zip(TIMESTAMP_COLUMNS, TIMESTAMP_COLUMNS[1:]):
        reversed_ = parsed[later] < parsed[earlier]  # NaT compares False
        for i in pos[reversed_]:
            errors.append({"row": row_no(i), "field": later, "reason": f"earlier than {earlier}"})
    errors.sort(key=lambda e: (e["row"], e["field"]))
    return errors


def add_timing_components(df):
    """Return a copy of df with parsed UTC timestamps and derived columns.

    Added columns: call_handling_min, turnout_min, travel_min, response_min, total_wait_min,
    local_date (America/New_York date of unit_notified_at, a datetime.date).
    Raises ValueError if validate_incidents finds any problem (nothing is imputed).
    """
    if len(df) == 0:
        out = df.copy()
        for col in ["call_handling_min", "turnout_min", "travel_min", "response_min",
                    "total_wait_min", "local_date"]:
            out[col] = pd.Series(dtype="object")
        return out
    errors = validate_incidents(df)
    if errors:
        raise ValueError(f"{len(errors)} invalid row(s); first: {errors[0]}")
    out = df.copy()
    ts = {col: _to_utc(out[col]) for col in TIMESTAMP_COLUMNS}
    minutes = lambda a, b: (ts[b] - ts[a]).dt.total_seconds() / 60
    out["call_handling_min"] = minutes("call_received_at", "unit_notified_at")
    out["turnout_min"] = minutes("unit_notified_at", "unit_en_route_at")
    out["travel_min"] = minutes("unit_en_route_at", "on_scene_at")
    out["response_min"] = minutes("unit_notified_at", "on_scene_at")
    out["total_wait_min"] = minutes("call_received_at", "on_scene_at")
    out["notified_utc"] = ts["unit_notified_at"]
    out["on_scene_utc"] = ts["on_scene_at"]
    out["local_date"] = ts["unit_notified_at"].dt.tz_convert(TIMEZONE).dt.date
    return out


def _baseline_end_date(baseline_end):
    """Local date on which monitoring starts. baseline_end must be local midnight."""
    end = pd.Timestamp(baseline_end)
    if end.tzinfo is None:
        raise ValueError("baseline_end needs a timezone offset")
    local = end.tz_convert(TIMEZONE)
    if (local.hour, local.minute, local.second, local.microsecond) != (0, 0, 0, 0):
        raise ValueError("baseline_end must be local midnight in America/New_York")
    return local.date()


def _prepare(df, zone_id, baseline_end):
    """Timing columns, optional zone filter, and a 'phase' column (baseline / monitoring)."""
    d = add_timing_components(df)
    if zone_id is not None and len(d):
        d = d[d["zone_id"] == zone_id].copy()
    cut = _baseline_end_date(baseline_end)
    if len(d):
        d["phase"] = ["baseline" if x < cut else "monitoring" for x in d["local_date"]]
    else:
        d["phase"] = pd.Series(dtype="object")
    return d


# =====================================================================
# 3. p chart
# =====================================================================
def _enough_expected(n, p0):
    """n*p0 >= 5 and n*(1-p0) >= 5, rounded to 9 decimals so 4.999999999999999 counts as 5."""
    return round(n * p0, 9) >= MIN_EXPECTED and round(n * (1 - p0), 9) >= MIN_EXPECTED


def p_chart_limits(p0, n):
    """Centre line and 3-sigma limits for a batch of size n, clipped to [0, 1].

    UCL = min(1, p0 + 3 * sqrt(p0 * (1 - p0) / n)); LCL = max(0, p0 - 3 * sqrt(...)).
    Pure formula: callers decide whether the evidence is sufficient (see evaluate_batch).
    """
    if not 0 <= p0 <= 1:
        raise ValueError("p0 must be between 0 and 1")
    if n <= 0:
        raise ValueError("batch size n must be positive")
    half = 3 * math.sqrt(p0 * (1 - p0) / n)
    return {"cl": p0, "ucl": min(1.0, p0 + half), "lcl": max(0.0, p0 - half)}


def evaluate_batch(late, n, p0, q=DEFAULT_Q):
    """Judge one batch (one zone-day) against a frozen baseline proportion p0.

    Returns n, late, p, cl, ucl, lcl, deterioration_flag, above_service_target, status.
    - n = 0: status "no_data", everything else None.
    - p0 None/0/1, n*p0 < 5 or n*(1-p0) < 5: status "insufficient_evidence"; limits and flag None
      (the formula is not applied). above_service_target is still computed (it needs no limits).
    - otherwise flag = p > UCL (strict).
    """
    out = {"n": n, "late": late, "p": None, "cl": None, "ucl": None, "lcl": None,
           "deterioration_flag": None, "above_service_target": None, "status": "no_data"}
    if n == 0:
        return out
    p = late / n
    out["p"] = p
    out["above_service_target"] = p > q
    if p0 is None or p0 <= 0 or p0 >= 1 or not _enough_expected(n, p0):
        out["status"] = "insufficient_evidence"
        return out
    limits = p_chart_limits(p0, n)
    out.update(limits)
    out["deterioration_flag"] = p > limits["ucl"]
    out["status"] = "ok"
    return out


def daily_p_chart(df, zone_id=None, T=DEFAULT_T, q=DEFAULT_Q, baseline_end=DEFAULT_BASELINE_END):
    """Daily p chart for one zone (or the whole table if zone_id is None).

    Returns {"status", "p0", "baseline_n", "baseline_late", "baseline_days", "points": [...]}.
    Each point: date, phase, n, late, p, cl, ucl, lcl, deterioration_flag, above_service_target,
    status. One point per calendar day of the input table; a day with no incidents in this zone is
    an n = 0 "no_data" point. deterioration_flag is None on baseline days.

    status: "no_data" (no rows), "baseline_insufficient" (< 14 nonempty baseline days, or < 5 late,
    or < 5 non-late baseline incidents; then limits and flags are None), else "ok" (individual
    points may still be "insufficient_evidence").
    """
    d = _prepare(df, zone_id, baseline_end)
    if len(d) == 0:
        return {"status": "no_data", "p0": None, "baseline_n": 0, "baseline_late": 0,
                "baseline_days": 0, "points": []}
    d["is_late"] = d["response_min"] > T

    days = (d.groupby(["local_date", "phase"])["is_late"]
            .agg(n="size", late="sum").reset_index().sort_values("local_date"))
    base = days[days["phase"] == "baseline"]
    baseline_n = int(base["n"].sum())
    baseline_late = int(base["late"].sum())
    baseline_days = len(base)
    p0 = weighted_p0([baseline_late], [baseline_n])
    adequate = (baseline_days >= MIN_BASELINE_DAYS
                and baseline_late >= MIN_BASELINE_EACH
                and baseline_n - baseline_late >= MIN_BASELINE_EACH)

    # One point per calendar day of the whole table (all zones), so a day with no incidents in
    # this zone still appears, as n = 0 / "no_data", instead of silently disappearing.
    all_dates = _to_utc(df["unit_notified_at"]).dt.tz_convert(TIMEZONE).dt.date
    first, last = all_dates.min(), all_dates.max()
    cut = _baseline_end_date(baseline_end)
    by_date = {r.local_date: (int(r.n), int(r.late)) for r in days.itertuples()}
    points = []
    for i in range((last - first).days + 1):
        day = first + timedelta(days=i)
        n, late = by_date.get(day, (0, 0))
        phase = "baseline" if day < cut else "monitoring"
        if n == 0:
            point = evaluate_batch(0, 0, p0, q)  # status "no_data", everything None
        elif adequate:
            point = evaluate_batch(late, n, p0, q)
        else:
            point = evaluate_batch(late, n, None, q)  # gives p and above_service_target only
            point["status"] = "baseline_insufficient"
        if phase == "baseline":
            point["deterioration_flag"] = None
        points.append({"date": day.isoformat(), "phase": phase, **point})
    return {
        "status": "ok" if adequate else "baseline_insufficient",
        "p0": p0,
        "baseline_n": baseline_n,
        "baseline_late": baseline_late,
        "baseline_days": baseline_days,
        "points": points,
    }


def zone_summary(df, zone_id, T=DEFAULT_T, q=DEFAULT_Q, baseline_end=DEFAULT_BASELINE_END):
    """One zones[] item of the API contract: monitoring-window descriptives plus baseline labels.

    above_service_target = monitoring late_rate > q. deterioration_flag = any monitoring day
    flagged (None when the baseline is insufficient or no monitoring day could be judged).
    status: no_data, baseline_insufficient, insufficient_evidence (no monitoring day judged), ok.
    """
    d = _prepare(df, zone_id, baseline_end)
    chart = daily_p_chart(df, zone_id, T, q, baseline_end)
    mon = d[d["phase"] == "monitoring"] if len(d) else d
    desc = describe_responses(mon["response_min"].tolist(), T)

    flagged = [p for p in chart["points"] if p["phase"] == "monitoring" and p["deterioration_flag"]]
    judged = [p for p in chart["points"] if p["phase"] == "monitoring" and p["status"] == "ok"]

    if chart["status"] == "no_data":
        status, flag = "no_data", None
    elif chart["status"] == "baseline_insufficient":
        status, flag = "baseline_insufficient", None
    elif desc["n"] == 0:
        status, flag = "no_data", None
    elif not judged:
        status, flag = "insufficient_evidence", None
    else:
        status, flag = "ok", len(flagged) > 0

    return {
        "zone_id": zone_id,
        "zone_type": ZONE_TYPES.get(zone_id),
        "n": desc["n"],
        "late": desc["late"],
        "late_rate": desc["late_rate"],
        "p90_min": desc["p90_min"],
        "p90_warning": desc["p90_warning"],
        "baseline_n": chart["baseline_n"],
        "baseline_late": chart["baseline_late"],
        "p0": chart["p0"],
        "above_service_target": None if desc["n"] == 0 else desc["late_rate"] > q,
        "deterioration_flag": flag,
        "deterioration_days": len(flagged) if flag is not None else None,
        "first_flag_date": flagged[0]["date"] if flagged else None,
        "last_flag_date": flagged[-1]["date"] if flagged else None,
        "status": status,
    }


# =====================================================================
# 4. Slowest incidents and stage summary
# =====================================================================
def slowest_incidents(df, T=DEFAULT_T, zone_id=None, k=5, baseline_end=DEFAULT_BASELINE_END):
    """The k slowest monitoring-window incidents by R, ties by incident_id ascending. [] when empty.

    Only incidents on or after baseline_end (local date) count (Final_Plan 5.1: "in the selected
    monitoring interval"); baseline incidents are never listed.

    Each item: incident_id, zone_id, unit_notified_at, on_scene_at (America/New_York ISO strings),
    response_min, minutes_over_target = max(0, R - T). Independent of any control-chart flag.
    """
    d = _prepare(df, zone_id, baseline_end)
    if len(d):
        d = d[d["phase"] == "monitoring"]
    if len(d) == 0:
        return []
    d = d.assign(id_str=d["incident_id"].astype(str)).sort_values(
        ["response_min", "id_str"], ascending=[False, True]).head(k)
    out = []
    for r in d.itertuples():
        out.append({
            "incident_id": r.id_str,
            "zone_id": r.zone_id,
            "unit_notified_at": r.notified_utc.tz_convert(TIMEZONE).isoformat(),
            "on_scene_at": r.on_scene_utc.tz_convert(TIMEZONE).isoformat(),
            "response_min": float(r.response_min),
            "minutes_over_target": max(0.0, float(r.response_min) - T),
        })
    return out


STAGES = [
    ("call_handling", "Call handling / assignment", "call_received_at", "unit_notified_at", "call_handling_min"),
    ("turnout", "Turnout", "unit_notified_at", "unit_en_route_at", "turnout_min"),
    ("travel", "Travel", "unit_en_route_at", "on_scene_at", "travel_min"),
]


def stage_summary(df, zone_id=None, baseline_end=DEFAULT_BASELINE_END):
    """Per stage: baseline median, monitoring median and monitoring P90 (minutes; None if empty)."""
    d = _prepare(df, zone_id, baseline_end)
    out = []
    for key, label, start, end, col in STAGES:
        base = d.loc[d["phase"] == "baseline", col].tolist() if len(d) else []
        mon = d.loc[d["phase"] == "monitoring", col].tolist() if len(d) else []
        out.append({
            "stage": key, "label": label, "from": start, "to": end,
            "baseline_median_min": median(base),
            "monitoring_median_min": median(mon),
            "monitoring_p90_min": percentile_linear(mon, 0.9),
        })
    return out


# =====================================================================
# 6. Pooled time-of-day comparison (Final_Plan 5.4)
# =====================================================================
BANDS = [  # key, label, start hour, end hour (half-open, local America/New_York time)
    ("night", "Night", 0, 6),
    ("morning_rush", "Morning rush", 6, 10),
    ("midday", "Midday", 10, 16),
    ("evening_rush", "Evening rush", 16, 20),
    ("late_evening", "Late evening", 20, 24),
]


def band_of_hour(hour):
    """Band key for a local hour 0-23: [00,06) night, [06,10) morning_rush, ... [20,24) late_evening."""
    for key, _, start, end in BANDS:
        if start <= hour < end:
            return key
    raise ValueError(f"hour out of range: {hour}")


def _compare_band(key, label, start, end, baseline_n, baseline_late, n, late, zone_baseline_ok):
    """One time_of_day.bands[] item: pooled monitoring rate vs the band's frozen baseline."""
    p0 = baseline_late / baseline_n if baseline_n else None
    p = late / n if n else None
    item = {"band": key, "label": label, "interval_local": f"{start:02d}:00-{end:02d}:00",
            "baseline_n": baseline_n, "baseline_late": baseline_late, "p0_band": p0,
            "n_band": n, "monitoring_late": late, "p_band": p,
            "ucl": None, "lcl": None, "flag": None, "status": "insufficient_evidence"}
    if not zone_baseline_ok:
        item["status"] = "baseline_insufficient"
        return item
    if n == 0 and baseline_n == 0:
        item["status"] = "no_data"
        return item
    enough = (baseline_late >= MIN_BASELINE_EACH and baseline_n - baseline_late >= MIN_BASELINE_EACH
              and n > 0 and 0 < p0 < 1
              and _enough_expected(n, p0))
    if not enough:
        return item
    limits = p_chart_limits(p0, n)
    item.update(ucl=limits["ucl"], lcl=limits["lcl"], flag=p > limits["ucl"], status="ok")
    return item


def late_rate_by_band(df, zone_id, T=DEFAULT_T, baseline_end=DEFAULT_BASELINE_END):
    """Five time bands for one zone: pooled monitoring late rate vs that band's baseline p0.

    Same limit formula and strict p > UCL rule as the daily chart, with n = the band's pooled
    monitoring count. Exploratory: 6 zones x 5 bands = 30 unadjusted comparisons.
    The zone must first pass the 14-day baseline check (else every band is baseline_insufficient);
    each band then needs >= 5 late and >= 5 non-late baseline incidents and n*p0, n*(1-p0) >= 5.
    """
    d = _prepare(df, zone_id, baseline_end)
    if len(d) == 0:
        return [_compare_band(k, lab, s, e, 0, 0, 0, 0, True) for k, lab, s, e in BANDS]
    d["is_late"] = d["response_min"] > T
    d["band"] = [band_of_hour(h) for h in d["notified_utc"].dt.tz_convert(TIMEZONE).dt.hour]
    base = d[d["phase"] == "baseline"]
    zone_ok = (base["local_date"].nunique() >= MIN_BASELINE_DAYS
               and base["is_late"].sum() >= MIN_BASELINE_EACH
               and (~base["is_late"]).sum() >= MIN_BASELINE_EACH)
    out = []
    for key, label, start, end in BANDS:
        b = base[base["band"] == key]
        m = d[(d["phase"] == "monitoring") & (d["band"] == key)]
        out.append(_compare_band(key, label, start, end, len(b), int(b["is_late"].sum()),
                                 len(m), int(m["is_late"].sum()), zone_ok))
    return out
