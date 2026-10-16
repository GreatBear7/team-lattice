"""Local-only charts of app.qc results on the H-02 CSVs (not part of the repo)."""
import sys
from datetime import date
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import pandas as pd
sys.path.insert(0, "/Users/saptarshi/Documents/GitHub/team-lattice")
from app import qc

DATA, OUT = sys.argv[1], sys.argv[2]
INK, INK2, GRID, SURF = "#0b0b0b", "#52514e", "#e6e5e1", "#fcfcfb"
BLUE, LIMIT, RED, BASE = "#2a78d6", "#8a8984", "#d03b3b", "#b9b8b2"
plt.rcParams.update({"font.size": 9, "axes.edgecolor": GRID, "axes.labelcolor": INK2,
                     "xtick.color": INK2, "ytick.color": INK2, "figure.facecolor": SURF,
                     "axes.facecolor": SURF, "axes.spines.top": False, "axes.spines.right": False})
SCEN = {"normal": "normal.csv — no planted change",
        "hidden_tail": "hidden_tail.csv — zone C worse from Oct 1 (day 18)",
        "recovery": "recovery.csv — zone C worse Oct 1-6, recovers from Oct 7"}
frames = {k: pd.read_csv(f"{DATA}/{k}.csv") for k in SCEN}

for key, title in SCEN.items():
    df = frames[key]
    fig, axes = plt.subplots(2, 3, figsize=(13, 6.6), sharex=True, sharey=True)
    for ax, z in zip(axes.flat, "ABCDEF"):
        ch = qc.daily_p_chart(df, z); s = qc.zone_summary(df, z)
        pts = pd.DataFrame(ch["points"]); pts["d"] = pd.to_datetime(pts["date"])
        ax.axvspan(pts["d"].iloc[0], pd.Timestamp("2026-09-27 23:59"), color="#f0efec", lw=0)
        ax.step(pts["d"], pts["ucl"], where="mid", color=LIMIT, lw=1, ls="--")
        ax.step(pts["d"], pts["lcl"], where="mid", color=LIMIT, lw=1, ls="--")
        ax.axhline(ch["p0"], color=LIMIT, lw=1)
        ax.axhline(0.10, color=INK2, lw=0.8, ls=":")
        ax.plot(pts["d"], pts["p"], color=BLUE, lw=2, marker="o", ms=3.5)
        fl = pts[pts["deterioration_flag"] == True]
        ax.scatter(fl["d"], fl["p"], s=60, marker="X", color=RED, zorder=5, edgecolor=SURF, lw=1)
        labels = []
        if s["above_service_target"]: labels.append("above 10% target")
        if s["deterioration_flag"]: labels.append(f"WORSE than baseline ({s['deterioration_days']} days)")
        ax.set_title(f"Zone {z} · {s['zone_type']} · p0={ch['p0']:.3f}", loc="left", color=INK, fontsize=10)
        ax.text(0.01, 0.97, "\n".join(labels) or "within target, stable", transform=ax.transAxes,
                va="top", fontsize=8, color=RED if s["deterioration_flag"] else INK2)
        ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
        ax.grid(axis="y", color=GRID, lw=0.6)
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d")); ax.xaxis.set_major_locator(mdates.DayLocator(interval=7))
    fig.suptitle(f"Daily share of late responses (R > 12 min) per zone — {title}", x=0.01, ha="left", color=INK, fontsize=12)
    fig.text(0.01, 0.005, "Blue: daily late rate.  Solid gray: baseline p0 (frozen, Sep 14-27, shaded).  Dashed: 3-sigma limits.  "
             "Dotted: 10% service target.  Red X: day above its own UCL (flagged).", fontsize=8, color=INK2)
    fig.tight_layout(rect=(0, 0.03, 1, 0.95)); fig.savefig(f"{OUT}/pchart_{key}.png", dpi=130); plt.close(fig)

fig, axes = plt.subplots(1, 3, figsize=(13, 4.2), sharey=True)
for ax, key in zip(axes, SCEN):
    bands = qc.late_rate_by_band(frames[key], "C")
    x = range(len(bands)); w = 0.38
    ax.bar([i - w / 2 for i in x], [b["p0_band"] for b in bands], w, color=BASE, label="baseline (Sep 14-27)")
    cols = [RED if b["flag"] else BLUE for b in bands]
    ax.bar([i + w / 2 for i in x], [b["p_band"] for b in bands], w, color=cols, label="monitoring (Sep 28-Oct 11)")
    for i, b in zip(x, bands):
        ax.plot([i + w / 2 - w / 2, i + w / 2 + w / 2], [b["ucl"]] * 2, color=INK, lw=1.5)
        if b["flag"]: ax.text(i + w / 2, b["p_band"] + 0.01, "flagged", ha="center", fontsize=7.5, color=RED)
    ax.set_xticks(list(x)); ax.set_xticklabels([b["label"].replace(" ", "\n") for b in bands])
    ax.set_title(SCEN[key].split(" — ")[0], loc="left", color=INK, fontsize=10)
    ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0)); ax.grid(axis="y", color=GRID, lw=0.6)
axes[0].legend(frameon=False, fontsize=8, loc="upper left")
fig.suptitle("Zone C late rate by time of day: monitoring vs its own baseline (black tick = UCL; red = above UCL)", x=0.01, ha="left", color=INK, fontsize=12)
fig.text(0.01, 0.005, "Exploratory: 6 zones x 5 bands = 30 unadjusted comparisons, so ~1 chance flag is expected (normal.csv evening rush).", fontsize=8, color=INK2)
fig.tight_layout(rect=(0, 0.04, 1, 0.93)); fig.savefig(f"{OUT}/bands_zoneC.png", dpi=130); plt.close(fig)

rows = []
for key in SCEN:
    for z in "ABCDEF":
        s = qc.zone_summary(frames[key], z)
        rows.append({"file": key, "zone": z, "type": s["zone_type"], "late_rate": round(s["late_rate"], 3),
                     "p90_min": round(s["p90_min"], 1), "p0": round(s["p0"], 3),
                     "above_target": s["above_service_target"], "worse_than_baseline": s["deterioration_flag"],
                     "flag_days": s["deterioration_days"]})
print(pd.DataFrame(rows).to_string(index=False))
