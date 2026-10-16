"""Local what-if simulator: inject a delay with chosen zone / time band / days / size, then run app.qc.

Prototype only (not part of the tool). Reuses Kaushik's generator (read-only) and app/qc.py.
Run:  uv run --no-project --with pandas --with numpy --with matplotlib python sim.py <generate_data.py> <repo>
Then open http://127.0.0.1:8765
"""
import base64
import importlib.util
import io
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

GEN_PATH, REPO = Path(sys.argv[1]), Path(sys.argv[2])
sys.path.insert(0, str(REPO))
from app import qc  # noqa: E402

spec = importlib.util.spec_from_file_location("gen", GEN_PATH)
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

HERE = Path(__file__).resolve().parent
BAND_HOURS = {"night": range(0, 6), "morning_rush": range(6, 10), "midday": range(10, 16),
              "evening_rush": range(16, 20), "late_evening": range(20, 24)}
DRAWS = gen.base_draws()
N = len(DRAWS)


def injection(seed, prob, lo, hi):
    """Same construction as the generator's inject stream: U < prob, then lo + (hi-lo)*U2.

    With seed 5300, prob 0.25 and (6, 12) this reproduces Kaushik's injection draws exactly.
    """
    _, inject_ss = np.random.SeedSequence(seed).spawn(2)
    irng = np.random.default_rng(inject_ss)
    hit = irng.random(N) < prob
    inc = irng.uniform(lo, hi, N)
    return np.where(hit, inc, 0.0)


def simulate(p):
    zones, bands = p["zones"], p["bands"]
    days = range(int(p["start_day"]), int(p["end_day"]) + 1)
    hours = [h for b in bands for h in BAND_HOURS[b]]
    inc = injection(int(p.get("seed", gen.SEED)), float(p["prob"]), float(p["lo"]), float(p["hi"]))
    where = (DRAWS["zone_id"].isin(zones) & DRAWS["day"].isin(list(days))
             & DRAWS["hour"].isin(hours)).to_numpy()
    d = DRAWS.copy()
    d["travel"] = d["travel"] + np.where(where, inc, 0.0)
    d["inject"] = 0.0
    df = gen.build_scenario(d, [])  # travel already includes our increments
    return df, int(where.sum()), int((where & (inc > 0)).sum())


# ---------- charts (same style as the earlier local charts) ----------
INK, INK2, GRID, SURF = "#0b0b0b", "#52514e", "#e6e5e1", "#fcfcfb"
BLUE, LIMIT, RED, BASE = "#2a78d6", "#8a8984", "#d03b3b", "#b9b8b2"
plt.rcParams.update({"font.size": 9, "axes.edgecolor": GRID, "axes.labelcolor": INK2, "xtick.color": INK2,
                     "ytick.color": INK2, "figure.facecolor": SURF, "axes.facecolor": SURF,
                     "axes.spines.top": False, "axes.spines.right": False})


def png(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110)
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def pchart_png(charts, summaries, injected):
    fig, axes = plt.subplots(2, 3, figsize=(13, 6.4), sharex=True, sharey=True)
    for ax, z in zip(axes.flat, "ABCDEF"):
        ch, s = charts[z], summaries[z]
        pts = pd.DataFrame(ch["points"]); pts["d"] = pd.to_datetime(pts["date"])
        ax.axvspan(pts["d"].iloc[0], pd.Timestamp("2026-09-27 23:59"), color="#f0efec", lw=0)
        ax.step(pts["d"], pts["ucl"], where="mid", color=LIMIT, lw=1, ls="--")
        ax.step(pts["d"], pts["lcl"], where="mid", color=LIMIT, lw=1, ls="--")
        ax.axhline(ch["p0"], color=LIMIT, lw=1); ax.axhline(0.10, color=INK2, lw=0.8, ls=":")
        ax.plot(pts["d"], pts["p"], color=BLUE, lw=2, marker="o", ms=3.5)
        fl = pts[pts["deterioration_flag"] == True]  # noqa: E712
        ax.scatter(fl["d"], fl["p"], s=60, marker="X", color=RED, zorder=5, edgecolor=SURF, lw=1)
        tag = " · injected" if z in injected else ""
        ax.set_title(f"Zone {z} · {s['zone_type']}{tag}", loc="left", color=RED if z in injected else INK, fontsize=10)
        ax.text(0.01, 0.97, f"flagged days: {s['deterioration_days']}", transform=ax.transAxes, va="top",
                fontsize=8, color=RED if s["deterioration_flag"] else INK2)
        ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0))
        ax.grid(axis="y", color=GRID, lw=0.6)
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d")); ax.xaxis.set_major_locator(mdates.DayLocator(interval=7))
    fig.text(0.01, 0.005, "Blue: daily late fraction (R > 12 min). Gray: frozen baseline p0 (shaded Sep 14-27). "
             "Dashed: 3-sigma limits. Dotted: 10% target. Red X: flagged day.", fontsize=8, color=INK2)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    return png(fig)


def bands_png(bands_by_zone, zones):
    fig, axes = plt.subplots(1, len(zones), figsize=(4.4 * len(zones), 3.6), sharey=True, squeeze=False)
    for ax, z in zip(axes[0], zones):
        bands = bands_by_zone[z]; x = range(5); w = 0.38
        ax.bar([i - w / 2 for i in x], [b["p0_band"] or 0 for b in bands], w, color=BASE, label="baseline")
        ax.bar([i + w / 2 for i in x], [b["p_band"] or 0 for b in bands], w,
               color=[RED if b["flag"] else BLUE for b in bands], label="monitoring")
        for i, b in zip(x, bands):
            if b["ucl"] is not None:
                ax.plot([i, i + w], [b["ucl"]] * 2, color=INK, lw=1.5)
            if b["flag"]:
                ax.text(i + w / 2, (b["p_band"] or 0) + 0.01, "flagged", ha="center", fontsize=7.5, color=RED)
            elif b["status"] != "ok":
                ax.text(i + w / 2, 0.01, "insufficient", ha="center", fontsize=7, color=INK2, rotation=90)
        ax.set_xticks(list(x)); ax.set_xticklabels([b["label"].replace(" ", "\n") for b in bands])
        ax.set_title(f"Zone {z} by time of day", loc="left", color=INK, fontsize=10)
        ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0)); ax.grid(axis="y", color=GRID, lw=0.6)
    axes[0][0].legend(frameon=False, fontsize=8, loc="upper left")
    fig.tight_layout()
    return png(fig)


def run(p):
    df, n_eligible, n_hit = simulate(p)
    charts = {z: qc.daily_p_chart(df, z) for z in "ABCDEF"}
    summaries = {z: qc.zone_summary(df, z) for z in "ABCDEF"}
    bands = {z: qc.late_rate_by_band(df, z) for z in "ABCDEF"}
    show = p["zones"] or ["C"]
    table = []
    for z in "ABCDEF":
        s = summaries[z]
        table.append({
            "zone": z, "type": s["zone_type"], "injected": z in p["zones"],
            "late_rate": s["late_rate"], "p0": s["p0"], "p90": s["p90_min"],
            "above_target": s["above_service_target"], "flagged_days": s["deterioration_days"],
            "first_flag": s["first_flag_date"], "last_flag": s["last_flag_date"],
            "flagged_bands": [b["label"] for b in bands[z] if b["flag"]],
        })
    run.last_csv = df.to_csv(index=False)
    return {"eligible_calls": n_eligible, "affected_calls": n_hit, "table": table,
            "pchart": pchart_png(charts, summaries, set(p["zones"])),
            "bands": bands_png(bands, show)}


run.last_csv = ""


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        if self.path == "/":
            self._send(200, (HERE / "index.html").read_text(), "text/html; charset=utf-8")
        elif self.path == "/last.csv":
            self._send(200, run.last_csv, "text/csv")
        else:
            self._send(404, "not found", "text/plain")

    def do_POST(self):
        if self.path != "/run":
            return self._send(404, "not found", "text/plain")
        try:
            p = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            bad = validate(p)
            if bad:
                return self._send(422, json.dumps({"error": bad}), "application/json")
            self._send(200, json.dumps(run(p)), "application/json")
        except Exception as e:  # prototype: show the error in the page
            self._send(500, json.dumps({"error": f"{type(e).__name__}: {e}"}), "application/json")

    def log_message(self, *a):
        pass


def validate(p):
    if not set(p.get("zones", [])) <= set("ABCDEF"):
        return "zones must be A-F"
    if not p.get("bands") or not set(p["bands"]) <= set(BAND_HOURS):
        return "pick at least one time band"
    s, e = int(p["start_day"]), int(p["end_day"])
    if not (15 <= s <= e <= 28):
        return "days must satisfy 15 <= start <= end <= 28 (the monitoring period; the baseline is never changed)"
    if not (0 <= float(p["prob"]) <= 1):
        return "share of calls must be between 0 and 1"
    if not (0 <= float(p["lo"]) <= float(p["hi"]) <= 60):
        return "extra minutes must satisfy 0 <= min <= max <= 60"
    return None


if __name__ == "__main__":
    if "--selfcheck" in sys.argv:
        data = Path(sys.argv[sys.argv.index("--selfcheck") + 1])
        all_bands = list(BAND_HOURS)
        cases = {
            "normal.csv": dict(zones=[], bands=all_bands, start_day=15, end_day=28, prob=0.25, lo=6, hi=12),
            "hidden_tail.csv": dict(zones=["C"], bands=all_bands, start_day=18, end_day=28, prob=0.25, lo=6, hi=12),
            "recovery.csv": dict(zones=["C"], bands=all_bands, start_day=18, end_day=23, prob=0.25, lo=6, hi=12),
        }
        for name, params in cases.items():
            df, _, _ = simulate(params)
            same = df.to_csv(index=False) == (data / name).read_text()
            print(f"{name}: simulator output identical to Kaushik's file: {same}")
        sys.exit(0)
    print("ResponseWatch what-if simulator on http://127.0.0.1:8765  (Ctrl+C to stop)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
