# Proposal: add time-of-day analysis to ResponseWatch

Proposed change to [`plan.en.md`](plan.en.md) (commit `19ef450`). This is for the team to discuss, not
a decision. Nothing in the plan, `SPEC.md` or `CONTRACT.yaml` changes until we agree.

## Why

Travel time depends on traffic, and traffic depends on time of day. The daily zone p chart tells
the supervisor **where** response got worse but not **when in the day**. A zone that is only late
in the evening rush looks merely "a bit worse" on a daily chart.

## Summary

Keep the **zone x day p chart** as the main flag, unchanged. Add time of day as a second,
pooled view in the zone detail. No new input: the time band is derived from `unit_notified_at`.

## Why not a zone x time-band x day chart?

With 5 bands, 100 incidents/zone/day gives about 20 incidents per point. At p0 around 0.10,
n*p0 = 2 < 5, so almost every point would show "insufficient evidence". Time of day must be
**pooled across days** to have enough data.

## Change 1: data generator (H-02, A)

- Call volume by hour: fewer calls at night, more in the day (an hourly weight profile).
- Rush-hour travel multiplier, e.g. x1.3 on routine travel during 07:00-09:00 and 16:00-19:00.
- Both patterns are in the baseline too, so they are normal variation, not a planted signal.
- Optional: in `hidden_tail.csv` and `recovery.csv`, concentrate zone C's extra delay in the
  evening rush (16:00-20:00). The daily chart then flags zone C, and the time-of-day view shows
  when. Check that the daily chart still detects it after this change (the planted effect is
  diluted across the day).
- Publish the hourly profile and multiplier in `generate_data.py` and in the codebook.

## Change 2: one more tested function (H-03, B)

`late_rate_by_band(df, T, baseline_end)` in `app/qc.py`:

- Bands (local time of `unit_notified_at`): night 00-06, morning rush 06-10, midday 10-16,
  evening rush 16-20, evening 20-24.
- For each zone and band:
  - `p0_band` = baseline late / baseline n (first 14 days, weighted, frozen)
  - `p_band` = pooled late rate over the monitoring period (days 15-28), with `n_band`
  - `UCL = min(1, p0_band + 3*sqrt(p0_band*(1-p0_band)/n_band))`, and LCL likewise clipped at 0
  - flag when `p_band > UCL` (strict, same rule as the daily chart)
  - "insufficient evidence" when `n_band*p0_band < 5`, `n_band*(1-p0_band) < 5`, or p0 is 0 or 1
- Expected sample size: about 1,400 monitoring incidents per zone, roughly 280 per band.

Known-answer test (by hand): p0 = 0.20, n = 400 gives sigma = sqrt(0.20*0.80/400) = 0.02, so
UCL = 0.20 + 0.06 = 0.26 and LCL = 0.14. p = 0.27 is flagged; p = 0.26 is not.
Use `pytest.approx` for the limits and test the boolean flag separately.

Degenerate tests: a band with no incidents (insufficient evidence, no division by zero),
p0_band = 0, an incident exactly at a band boundary (06:00 belongs to morning rush).

Caveat: 6 zones x 5 bands = 30 comparisons, so about one false flag is expected now and then
by chance. Say so in the UI and README.

## Change 3: front end (H-04, C)

One bar chart in the zone detail: late rate per time band, baseline vs monitoring, with the
UCL marked and flagged bands in red. How to read it: "In zone C, the evening rush is late far more
often than its own baseline."

The API can return this inside the existing `GET /zones/{id}/analysis`; no new endpoint.

## Stretch, only after the core passes the 02:00 gate

**Risk-adjusted p chart:** each day's expected late count is the sum of each call's baseline
`p0_band`; limits = expected +/- 3*sqrt(sum of p(1-p)). This stops a day with unusually many
rush-hour calls from being flagged unfairly. It is sound but harder to explain, so it is not core.

## Impact on the plan

- Adds one statistic, so B tests it (known answer and degenerate case) before C displays it.
- Changes A's generator, so agree on it **before H-02 starts**.
- Does not change the six-item core, the four endpoints, the timeline, or the dataset size.
- Strengthens "where **or why** these failures occur" in the prompt.
