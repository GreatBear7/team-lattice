"""Generate the three synthetic ResponseWatch datasets (task H-02).

Run from the repo root:

    python data/generate_data.py

Writes data/normal.csv, data/hidden_tail.csv, data/recovery.csv and
data/scenario_truth.json. Every parameter below follows docs/Final_Plan.en.md
section 4. All incidents, zones, dispatchers and units are fictional.

The three scenarios share every random draw. They differ only by the zone C
travel increment, which comes from its own random stream, so the baseline
(days 1-14) and all other zones are byte-identical across the three files.
"""

import json
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

SEED = 5300
TZ = ZoneInfo("America/New_York")
START = date(2026, 9, 14)
N_DAYS = 28
BASELINE_DAYS = 14  # days 1-14 are the frozen baseline
PER_ZONE_PER_DAY = 100
TARGET_MIN = 12  # late when response R > 12 minutes (used only for the printed summary)

# Fixed functional-zone profiles (Final_Plan 4.1): routine travel median, cap, rush multiplier.
ZONES = {
    "A": ("downtown", 5.0, 8.0, 1.3),
    "B": ("downtown", 5.0, 8.0, 1.3),
    "C": ("residential", 6.0, 10.0, 1.3),
    "D": ("residential", 6.0, 10.0, 1.3),
    "E": ("outer", 7.5, 12.0, 1.3),
    "F": ("outer", 7.5, 12.0, 1.3),
}
TRAVEL_SIGMA = 0.25
TRAVEL_FLOOR = 2.0

# Relative hourly weights for the unit-notification hour (Final_Plan 4.2); they sum to 25.6.
HOUR_WEIGHTS = np.array(
    [0.5] * 6            # 00-05 night
    + [1.0, 1.5, 1.5, 1.0]  # 06, 07, 08, 09 morning rush
    + [1.2] * 6          # 10-15 midday
    + [1.8] * 4          # 16-19 evening rush
    + [0.8] * 4          # 20-23 late evening
)
RUSH_HOURS = {7, 8, 16, 17, 18}  # [07:00, 09:00) and [16:00, 19:00)

ORDINARY_TAIL_P = 0.10
INJECT_P = 0.25
INCREMENT_RANGE = (6.0, 12.0)

INJECT_ZONE = "C"
INJECT_START_DAY = 18  # 1-based day number: 2026-10-01
RECOVERY_DAY = 24      # 1-based day number: 2026-10-07

N_DISPATCHERS = 8
UNITS_PER_ZONE = 4

OUT_DIR = Path(__file__).resolve().parent


def clipped_lognormal(rng, median, sigma, low, high, size):
    """LogNormal with the given median (mean of the log is log(median)), clipped to [low, high]."""
    return np.clip(rng.lognormal(mean=np.log(median), sigma=sigma, size=size), low, high)


def day_date(day_number):
    return START + timedelta(days=day_number - 1)


def base_draws():
    """One row per incident with every random draw that all scenarios share."""
    base_ss, inject_ss = np.random.SeedSequence(SEED).spawn(2)
    rng = np.random.default_rng(base_ss)
    irng = np.random.default_rng(inject_ss)

    zone_ids = list(ZONES)
    n = len(zone_ids) * N_DAYS * PER_ZONE_PER_DAY
    zone = np.repeat(zone_ids, N_DAYS * PER_ZONE_PER_DAY)
    day = np.tile(np.repeat(np.arange(1, N_DAYS + 1), PER_ZONE_PER_DAY), len(zone_ids))

    hour = rng.choice(24, size=n, p=HOUR_WEIGHTS / HOUR_WEIGHTS.sum())
    second_in_hour = rng.integers(0, 3600, size=n)
    handling = clipped_lognormal(rng, 1.0, 0.35, 0.2, 4.0, n)
    turnout = clipped_lognormal(rng, 1.2, 0.25, 0.3, 4.0, n)

    median = np.array([ZONES[z][1] for z in zone])
    cap = np.array([ZONES[z][2] for z in zone])
    rush_mult = np.array([ZONES[z][3] for z in zone])
    # Cap routine travel first, then apply the rush multiplier, then add increments.
    travel = np.clip(rng.lognormal(np.log(median), TRAVEL_SIGMA), TRAVEL_FLOOR, cap)
    travel = np.where(np.isin(hour, list(RUSH_HOURS)), travel * rush_mult, travel)
    tail = np.where(rng.random(n) < ORDINARY_TAIL_P, rng.uniform(*INCREMENT_RANGE, n), 0.0)

    dispatcher = rng.integers(1, N_DISPATCHERS + 1, size=n)
    unit = rng.integers(1, UNITS_PER_ZONE + 1, size=n)

    # Injection draws come from their own stream for every row, used or not.
    inject = np.where(irng.random(n) < INJECT_P, irng.uniform(*INCREMENT_RANGE, n), 0.0)

    return pd.DataFrame({
        "zone_id": zone, "day": day, "hour": hour, "second_in_hour": second_in_hour,
        "handling": handling, "turnout": turnout, "travel": travel + tail,
        "dispatcher": dispatcher, "unit": unit, "inject": inject,
    })


def build_scenario(draws, inject_days):
    """Turn shared draws into a scenario CSV; zone C gets `inject` minutes on `inject_days`."""
    d = draws
    hit = (d["zone_id"] == INJECT_ZONE) & d["day"].isin(inject_days)
    travel = d["travel"] + np.where(hit, d["inject"], 0.0)

    rows = []
    for i in range(len(d)):
        local_midnight = datetime.combine(day_date(int(d["day"].iat[i])), datetime.min.time(), TZ)
        notified = local_midnight + timedelta(hours=int(d["hour"].iat[i]),
                                              seconds=int(d["second_in_hour"].iat[i]))
        en_route = notified + timedelta(seconds=round(d["turnout"].iat[i] * 60))
        on_scene = en_route + timedelta(seconds=round(travel.iat[i] * 60))
        received = notified - timedelta(seconds=round(d["handling"].iat[i] * 60))
        zone = d["zone_id"].iat[i]
        rows.append({
            "zone_id": zone,
            "priority": "high",
            "call_received_at": received,
            "unit_notified_at": notified,
            "unit_en_route_at": en_route,
            "on_scene_at": on_scene,
            "dispatcher_id": f"DSP{int(d['dispatcher'].iat[i]):02d}",
            "unit_id": f"M{zone}{int(d['unit'].iat[i])}",
        })

    df = pd.DataFrame(rows).sort_values(["unit_notified_at", "zone_id"], kind="stable")
    # Stable IDs: zone + notification date + order within that zone-day.
    seq = df.groupby(["zone_id", df["unit_notified_at"].map(lambda t: t.date())]).cumcount() + 1
    df.insert(0, "incident_id", [
        f"INC-{t:%Y%m%d}-{z}{s:03d}" for t, z, s in zip(df["unit_notified_at"], df["zone_id"], seq)
    ])
    for col in ["call_received_at", "unit_notified_at", "unit_en_route_at", "on_scene_at"]:
        df[col] = df[col].map(lambda t: t.isoformat(timespec="seconds"))
    return df.reset_index(drop=True)


def main():
    draws = base_draws()
    all_days = range(1, N_DAYS + 1)
    scenarios = {
        "normal": [],
        "hidden_tail": [d for d in all_days if d >= INJECT_START_DAY],
        "recovery": [d for d in all_days if INJECT_START_DAY <= d < RECOVERY_DAY],
    }
    for name, inject_days in scenarios.items():
        df = build_scenario(draws, inject_days)
        df.to_csv(OUT_DIR / f"{name}.csv", index=False)
        print(f"wrote data/{name}.csv  ({len(df)} rows)")

    truth = {
        "_note": "Answer key for tests and the demo only. Statistical code must never read this file.",
        "seed": SEED,
        "timezone": "America/New_York",
        "dates": {"start": str(START), "end": str(day_date(N_DAYS)),
                  "baseline": [str(START), str(day_date(BASELINE_DAYS))],
                  "baseline_end_exclusive": f"{day_date(BASELINE_DAYS + 1)}T00:00:00-04:00",
                  "monitoring": [str(day_date(BASELINE_DAYS + 1)), str(day_date(N_DAYS))]},
        "incidents_per_zone_per_day": PER_ZONE_PER_DAY,
        "zone_profiles": {z: {"type": t, "travel_median_min": m, "travel_cap_min": c, "rush_multiplier": r}
                          for z, (t, m, c, r) in ZONES.items()},
        "scenarios": {
            "normal": {"affected_zones": [], "injection": None},
            "hidden_tail": {"affected_zones": [INJECT_ZONE],
                            "injection": {"from": str(day_date(INJECT_START_DAY)), "to": str(day_date(N_DAYS)),
                                          "probability": INJECT_P, "extra_travel_min": list(INCREMENT_RANGE)}},
            "recovery": {"affected_zones": [INJECT_ZONE],
                         "injection": {"from": str(day_date(INJECT_START_DAY)),
                                       "to": str(day_date(RECOVERY_DAY - 1)),
                                       "probability": INJECT_P, "extra_travel_min": list(INCREMENT_RANGE)}},
        },
    }
    (OUT_DIR / "scenario_truth.json").write_text(json.dumps(truth, indent=2) + "\n")
    print("wrote data/scenario_truth.json")


if __name__ == "__main__":
    main()
