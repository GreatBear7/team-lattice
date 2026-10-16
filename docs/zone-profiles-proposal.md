# Proposal: give each zone its own travel profile

Proposed change to [`plan.en.md`](plan.en.md) (commit `ab9844f`). This is for the team to discuss, not
a decision. Nothing in the plan, `SPEC.md` or `CONTRACT.yaml` changes until we agree.

## Why

Today all six zones A-F use identical generator settings; only zone C differs, and only in the
planted scenarios. Real cities differ by zone (distance to stations, traffic), and with identical
zones the demo cannot show the difference the plan's separate labels are built for:

- **Above service target** (p > q): a zone that is chronically slow.
- **Worse than its own baseline** (p > UCL): a zone where something changed.

## Proposal

Per-zone travel parameters in `data/generate_data.py`. Same code, same seed, a small table.
Call handling and turnout stay the same for every zone (they depend on the dispatcher and crew,
not the location). Zone C's planted deterioration is unchanged.

| Zone | Type (fictional) | Routine travel median | Travel cap | Rush multiplier |
|---|---|---|---|---|
| A, B | Downtown | 5 min | 8 min | x1.3 (option: x1.5, heavier traffic) |
| C, D | Residential | 6 min (current plan value) | 10 min | x1.3 |
| E, F | Outer / semi-rural | 7.5 min | 12 min | x1.3 (option: x1.1, light traffic) |

## Expected baseline late rates (T = 12 min)

Rough simulation of the plan's model (100,000 draws per row; turnout as planned, ~25% of calls at
rush hour with x1.3 travel, 10% ordinary tail of Uniform(6,12) extra minutes):

| Routine travel median (cap) | Late rate |
|---|---|
| 5 min (8) | about 10% |
| 6 min (10), current plan | about 12% |
| 7.5 min (12) | about 23% |
| 8.5 min (14), not proposed | about 34% |

This is an approximation; A's generator will land slightly differently. Record the realized
per-zone baseline rates in the codebook. At 100 incidents/zone/day, every zone has n*p0 >= 5 and
n*(1-p0) >= 5.

## What the demo can then show

- Zones E and F: about 23% late every day, so **above service target (q = 10%) but not worse than
  baseline**. A chronic coverage problem.
- Zone C in `hidden_tail.csv`: **worse than baseline**. Something changed; investigate.
- Two different problems, two different fixes. This is why the plan keeps the labels separate.

## Impact on the plan

- No change to statistics, endpoints, roles or timeline. Each zone already has its own frozen p0.
- Changes only A's generator parameters, so agree **before H-02 starts**.
- Codebook: describe each zone type and say these are invented demo settings, not real EMS data.
- Codebook line for real collection: CAD assigns each address to its response district
  (first-due station area), so `zone_id` costs the dispatcher nothing to log.
