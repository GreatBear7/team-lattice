"""50-seed detection study: p chart (app.qc formulas) vs daily X-bar vs citywide mean. Local prototype."""
import math, sys
SIMDIR, GEN, REPO, NSEEDS = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
sys.argv = ["sim.py", GEN, REPO]
sys.path.insert(0, SIMDIR)
import numpy as np
import sim  # noqa: E402
from app import qc  # noqa: E402
gen = sim.gen
ALL = list(sim.BAND_HOURS)
T = 12.0

def c4(n): return math.sqrt(2 / (n - 1)) * math.exp(math.lgamma(n / 2) - math.lgamma((n - 1) / 2))

def response(draws, inc):
    # exactly as the CSV timestamps: whole seconds for turnout and for travel
    t = np.round(draws["turnout"].to_numpy() * 60); tr = np.round((draws["travel"].to_numpy() + inc) * 60)
    return (t + tr) / 60

def charts(draws, R, zone):
    m = (draws["zone_id"] == zone).to_numpy(); day = draws["day"].to_numpy()[m]; r = R[m]
    late = np.array([(r[day == d] > T).sum() for d in range(1, 29)]); n = np.array([(day == d).sum() for d in range(1, 29)])
    mean = np.array([r[day == d].mean() for d in range(1, 29)]); sd = np.array([r[day == d].std(ddof=1) for d in range(1, 29)])
    p0 = qc.weighted_p0(late[:14].tolist(), n[:14].tolist())
    pflag = [bool(qc.evaluate_batch(int(late[i]), int(n[i]), p0)["deterioration_flag"]) for i in range(14, 28)]
    nb = int(n[0]); ucl = mean[:14].mean() + 3 * (sd[:14].mean() / c4(nb)) / math.sqrt(nb)
    xflag = [bool(mean[i] > ucl) for i in range(14, 28)]
    return np.array(pflag), np.array(xflag)

SCEN = [
    ("hidden_tail: C 25% +6-12, days 18-28", dict(zones=["C"], bands=ALL, start_day=18, end_day=28, prob=.25, lo=6, hi=12)),
    ("rare & severe: C 5% +20-30, days 18-28", dict(zones=["C"], bands=ALL, start_day=18, end_day=28, prob=.05, lo=20, hi=30)),
    ("near threshold: C 30% +3-5, days 18-28", dict(zones=["C"], bands=ALL, start_day=18, end_day=28, prob=.30, lo=3, hi=5)),
    ("evening rush only: E 50% +6-12, days 20-28", dict(zones=["E"], bands=["evening_rush"], start_day=20, end_day=28, prob=.5, lo=6, hi=12)),
    ("small: D 10% +1-3, days 18-28", dict(zones=["D"], bands=ALL, start_day=18, end_day=28, prob=.10, lo=1, hi=3)),
]
res = {name: {"p_day": [], "x_day": [], "p_any": [], "x_any": [], "city": []} for name, _ in SCEN}
fa = {"p": [], "x": []}
for seed in range(1, NSEEDS + 1):
    gen.SEED = seed
    draws = gen.base_draws()
    sim.DRAWS, sim.N = draws, len(draws)
    R0 = response(draws, 0.0)
    for z in "ABCDEF":  # false alarms on unchanged data: 14 monitoring days x 6 zones
        pf, xf = charts(draws, R0, z); fa["p"].append(pf.mean()); fa["x"].append(xf.mean())
    day = draws["day"].to_numpy(); hour = draws["hour"].to_numpy()
    for name, p in SCEN:
        inc = sim.injection(seed, p["prob"], p["lo"], p["hi"])
        hours = [h for b in p["bands"] for h in sim.BAND_HOURS[b]]
        where = draws["zone_id"].isin(p["zones"]).to_numpy() & (day >= p["start_day"]) & (day <= p["end_day"]) & np.isin(hour, hours)
        R = response(draws, np.where(where, inc, 0.0))
        pf, xf = charts(draws, R, p["zones"][0])
        inj = slice(p["start_day"] - 15, p["end_day"] - 14)
        r = res[name]
        r["p_day"].append(pf[inj].mean()); r["x_day"].append(xf[inj].mean())
        r["p_any"].append(pf[inj].any()); r["x_any"].append(xf[inj].any())
        r["city"].append(100 * (R[day >= 15].mean() / R[day < 15].mean() - 1))
print(f"{NSEEDS} seeds. 'days caught' = share of injected days flagged (mean over seeds); 'ever' = share of seeds with >=1 flagged injected day.")
print(f"{'scenario':44} | {'p chart: days caught / ever':>28} | {'X-bar: days caught / ever':>26} | citywide mean change")
for name, _ in SCEN:
    r = res[name]
    print(f"{name:44} | {100*np.mean(r['p_day']):>15.0f}% / {100*np.mean(r['p_any']):>4.0f}%     | {100*np.mean(r['x_day']):>13.0f}% / {100*np.mean(r['x_any']):>4.0f}%     | {np.mean(r['city']):+.1f}%  (range {min(r['city']):+.1f} to {max(r['city']):+.1f})")
print(f"false alarms on unchanged data (share of zone-days flagged): p chart {100*np.mean(fa['p']):.2f}%, X-bar {100*np.mean(fa['x']):.2f}%")
