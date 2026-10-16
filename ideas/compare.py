"""Local check: does a mean-based chart catch what the p chart catches? (prototype, not the tool)"""
import math, sys
SIMDIR, GEN, REPO = sys.argv[1], sys.argv[2], sys.argv[3]
sys.argv = ["sim.py", GEN, REPO]
sys.path.insert(0, SIMDIR)
import sim  # noqa: E402  (server only starts under __main__)
from app import qc  # noqa: E402

ALL = list(sim.BAND_HOURS)
def c4(n): return math.sqrt(2 / (n - 1)) * math.exp(math.lgamma(n / 2) - math.lgamma((n - 1) / 2))

def xbar_flags(df, zone):
    """X-bar chart on daily mean R (n per day), limits from the frozen 14-day baseline:
    centre = mean of baseline daily means, sigma_hat = S-bar / c4(n), limits = centre +/- 3*sigma_hat/sqrt(n)."""
    d = qc.add_timing_components(df)
    d = d[d["zone_id"] == zone]
    g = d.groupby("local_date")["response_min"].agg(["mean", "std", "size"]).reset_index()
    base = g[g["local_date"].astype(str) < "2026-09-28"]
    n = int(base["size"].iloc[0]); centre = base["mean"].mean(); sig = base["std"].mean() / c4(n)
    ucl = centre + 3 * sig / math.sqrt(n)
    mon = g[g["local_date"].astype(str) >= "2026-09-28"]
    return [str(r.local_date) for r in mon.itertuples() if r.mean > ucl], centre, ucl, mon["mean"].max()

def citywide(df):
    d = qc.add_timing_components(df)
    b = d[d["local_date"].astype(str) < "2026-09-28"]["response_min"].mean()
    m = d[d["local_date"].astype(str) >= "2026-09-28"]["response_min"].mean()
    return b, m

SCEN = [
    ("hidden_tail: C, all day, 25% of calls +6-12 min, days 18-28", dict(zones=["C"], bands=ALL, start_day=18, end_day=28, prob=.25, lo=6, hi=12)),
    ("rare & severe: C, all day, 5% of calls +20-30 min, days 18-28", dict(zones=["C"], bands=ALL, start_day=18, end_day=28, prob=.05, lo=20, hi=30)),
    ("near threshold: C, all day, 30% of calls +3-5 min, days 18-28", dict(zones=["C"], bands=ALL, start_day=18, end_day=28, prob=.30, lo=3, hi=5)),
    ("evening rush only: E, 50% of calls +6-12 min, days 20-28", dict(zones=["E"], bands=["evening_rush"], start_day=20, end_day=28, prob=.5, lo=6, hi=12)),
    ("small: D, all day, 10% of calls +1-3 min, days 18-28", dict(zones=["D"], bands=ALL, start_day=18, end_day=28, prob=.10, lo=1, hi=3)),
]
print(f"{'scenario':64} | {'injected days':>4} | {'p chart':>7} | {'X-bar':>5} | citywide mean before -> after")
for name, p in SCEN:
    df, _, _ = sim.simulate(p)
    z = p["zones"][0]; inj = p["end_day"] - p["start_day"] + 1
    pc = qc.zone_summary(df, z)["deterioration_days"]
    xb, centre, ucl, mx = xbar_flags(df, z)
    b, m = citywide(df)
    bands = [b_["label"] for b_ in qc.late_rate_by_band(df, z) if b_["flag"]]
    print(f"{name:64} | {inj:>4} | {pc:>7} | {len(xb):>5} | {b:.2f} -> {m:.2f} min (+{m-b:.2f}, {100*(m-b)/b:+.1f}%)"
          f"   [X-bar centre {centre:.2f}, UCL {ucl:.2f}; bands flagged: {', '.join(bands) or 'none'}]")
# false alarms on normal data
df, _, _ = sim.simulate(dict(zones=[], bands=ALL, start_day=15, end_day=28, prob=.25, lo=6, hi=12))
print("normal.csv false alarms: p chart", {z: qc.zone_summary(df, z)["deterioration_days"] for z in "ABCDEF"},
      " X-bar", {z: len(xbar_flags(df, z)[0]) for z in "ABCDEF"})
