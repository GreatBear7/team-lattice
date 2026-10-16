import sys
argv = sys.argv[1:]; sys.argv = ["x"] + argv
src = open(argv[0] + "/compare50.py").read().split("res = {name")[0]
exec(compile(src, "compare50", "exec"))
BANDS = {"evening_rush": range(16, 20)}

def band_flag(draws, R, zone, band):
    m = (draws["zone_id"] == zone).to_numpy(); day = draws["day"].to_numpy(); hr = draws["hour"].to_numpy()
    inb = m & np.isin(hr, list(BANDS[band])); late = R > T
    b = inb & (day < 15); mo = inb & (day >= 15)
    bn, bl, n, d = int(b.sum()), int(late[b].sum()), int(mo.sum()), int(late[mo].sum())
    p0 = bl / bn
    ok = bl >= 5 and bn - bl >= 5 and qc._enough_expected(n, p0)
    return ok and d / n > qc.p_chart_limits(p0, n)["ucl"]

CANDS = [
    ("D evening 15% +15-25 d18-28", dict(zones=["D"], bands=["evening_rush"], start_day=18, end_day=28, prob=.15, lo=15, hi=25)),
    ("D evening 25% +15-25 d18-28", dict(zones=["D"], bands=["evening_rush"], start_day=18, end_day=28, prob=.25, lo=15, hi=25)),
    ("D evening 35% +10-20 d18-28", dict(zones=["D"], bands=["evening_rush"], start_day=18, end_day=28, prob=.35, lo=10, hi=20)),
    ("E evening 25% +15-25 d18-28", dict(zones=["E"], bands=["evening_rush"], start_day=18, end_day=28, prob=.25, lo=15, hi=25)),
]
for name, p in CANDS:
    stats = {"p": [], "x": [], "band": [], "p5300": None}
    for seed in list(range(1, 51)) + [5300]:
        gen.SEED = seed; draws = gen.base_draws(); sim.DRAWS, sim.N = draws, len(draws)
        day = draws["day"].to_numpy(); hour = draws["hour"].to_numpy()
        inc = sim.injection(seed, p["prob"], p["lo"], p["hi"])
        where = draws["zone_id"].isin(p["zones"]).to_numpy() & (day >= p["start_day"]) & (day <= p["end_day"]) & np.isin(hour, list(BANDS["evening_rush"]))
        R = response(draws, np.where(where, inc, 0.0))
        pf, xf = charts(draws, R, p["zones"][0]); inj = slice(p["start_day"] - 15, p["end_day"] - 14)
        bf = band_flag(draws, R, p["zones"][0], "evening_rush")
        others = sum(charts(draws, R, z)[0].sum() for z in "ABCDEF" if z != p["zones"][0])
        if seed == 5300:
            stats["p5300"] = (int(pf[inj].sum()), int(xf[inj].sum()), bf, int(others))
        else:
            stats["p"].append(pf[inj].mean()); stats["x"].append(xf[inj].mean()); stats["band"].append(bf)
    a = stats["p5300"]
    print(f"{name:30} 50 seeds: p chart {100*np.mean(stats['p']):3.0f}% of days | X-bar {100*np.mean(stats['x']):3.0f}% | evening band flagged {100*np.mean(stats['band']):3.0f}% of seeds"
          f"  || seed 5300: p {a[0]}/11 days, X-bar {a[1]}/11, band {a[2]}, other-zone p flags {a[3]}")
