# Data codebook: synthetic ambulance response logs

Three test datasets for ResponseWatch, the team-lattice tool for Prompt 2 (Health Systems:
Emergency Response). Each file is one month of **fictional** ambulance calls for a city with six
zones. The files are identical except for the problem planted in the last two weeks, so each one
demonstrates one behaviour of the tool.

All data is synthetic. There are no real patients, dispatchers, ambulances, addresses or traffic
data. The numbers are designed to look like field data; they are not empirical findings about
real EMS systems.

## Files

| File | What it is |
|---|---|
| `normal.csv` | A normal month: no planted problem. Shows the tool raises no false daily alarms. |
| `recovery.csv` | Zone C gets slower all day from Oct 1, and is fixed from Oct 7. Shows the tool finds a problem and confirms the fix. |
| `morning_tail.csv` | Zone D has rare but severe delays, only in morning rush (06:00-10:00), from Oct 1. Shows the "fatal outliers" that daily rates and averages hide. |
| `generate_data.py` | The script that creates all three CSVs and `scenario_truth.json`. |
| `scenario_truth.json` | The answer key: seed, dates, zone profiles and each planted problem. **For tests and the demo only; the statistics must never read it.** |

Each CSV has **16,800 rows**: 6 zones × 28 days × 100 calls per zone per day, about 2.2 MB.

## Reproduce

From the repo root, with Python 3.10+ and `numpy` and `pandas`:

```bash
python data/generate_data.py
```

This rewrites the three CSVs and `scenario_truth.json`. The seed is fixed (`5300`), so the output
is identical byte for byte on every run.

## Columns

One row is **one call and the single ambulance that responded to it**.

| Column | Type | Example | Meaning |
|---|---|---|---|
| `incident_id` | text, unique | `INC-20260914-B001` | Call ID: `INC-` + local date of `unit_notified_at` + zone + order of that call within the zone and day |
| `zone_id` | text, `A`-`F` | `B` | City zone the call came from (see [Zones](#zones)) |
| `priority` | text | `high` | Call urgency. Every call in these files is `high` (see [Limitations](#limitations)) |
| `call_received_at` | timestamp | `2026-09-14T00:03:50-04:00` | ① The 911 call is answered |
| `unit_notified_at` | timestamp | `2026-09-14T00:04:42-04:00` | ② The dispatcher assigns an ambulance and notifies its crew |
| `unit_en_route_at` | timestamp | `2026-09-14T00:05:59-04:00` | ③ The ambulance starts driving |
| `on_scene_at` | timestamp | `2026-09-14T00:12:25-04:00` | ④ The ambulance arrives at the patient |
| `dispatcher_id` | text | `DSP05` | Fictional dispatcher who handled the call (`DSP01`-`DSP08`). For context only; the tool never ranks dispatchers |
| `unit_id` | text | `MB2` | Fictional ambulance: `M` (medic unit) + zone + number 1-4 |

**Timestamps** are ISO 8601 with a timezone offset: `2026-09-14` date, `T` separator,
`00:03:50` local time, `-04:00` = New York daylight time (UTC−4). The offset is required: the tool
converts to America/New_York before assigning days and time-of-day bands, and real data that
crosses a daylight-saving change (for example 2026-11-01) cannot be read correctly without it.
In these files every timestamp happens to be `-04:00`. Timestamps are whole seconds.

There are no missing values, no duplicate IDs, and every row's four timestamps are in order
(① < ② < ③ < ④).

## What the tool calculates from each row

None of these are stored in the CSV; the tool derives them, so a user never computes them.

| Quantity | Formula | Normal-month median (90th percentile) |
|---|---|---|
| Call handling | ② − ① = `unit_notified_at − call_received_at` | 1.0 min (1.6) |
| Turnout | ③ − ② = `unit_en_route_at − unit_notified_at` | 1.2 min (1.7) |
| Travel | ④ − ③ = `on_scene_at − unit_en_route_at` | 6.9 min (13.0) |
| **Response time R** | ④ − ② = turnout + travel | **8.2 min (14.2)** |
| Total wait | ④ − ① = all three stages | 9.3 min (15.3) |

- **Late** means **R > 12 minutes** (exactly 12 is not late). Twelve minutes is a demonstration
  setting, not a clinical or national standard.
- R starts when the ambulance is notified, following the team plan and the usual EMS convention
  of timing dispatch separately. Call handling is therefore **not** part of the 12 minutes; it is
  reported as its own stage and in the total wait.
- **Day** = the New York date of `unit_notified_at`. **Time band** = the New York hour of
  `unit_notified_at`: night [00:00, 06:00), morning rush [06:00, 10:00), midday [10:00, 16:00),
  evening rush [16:00, 20:00), late evening [20:00, 24:00).

Worked example, the first row above: call handling 52 s, turnout 1 min 17 s, travel 6 min 26 s,
so R = 7 min 43 s, not late; total wait 8 min 35 s.

## Time period

| Period | Dates (2026) | Days | Use |
|---|---|---|---|
| Baseline | Sep 14 - Sep 27 | 1-14 | "Normal" for each zone; the tool freezes its limits here |
| Monitoring | Sep 28 - Oct 11 | 15-28 | Checked against the baseline |

The baseline ends at `2026-09-28T00:00:00-04:00` (exclusive). It is identical in all three files.

## Zones

| Zone | Type | Routine travel median / cap (min) | Baseline: % late | Mean R | P90 R |
|---|---|---|---|---|---|
| A | downtown | 5 / 8 | 8.4% (118 / 1,400) | 7.7 min | 11.1 min |
| B | downtown | 5 / 8 | 9.4% (131 / 1,400) | 7.8 min | 11.5 min |
| C | residential | 6 / 10 | 13.1% (184 / 1,400) | 9.0 min | 13.8 min |
| D | residential | 6 / 10 | 14.1% (198 / 1,400) | 9.0 min | 14.0 min |
| E | outer / semi-rural | 7.5 / 12 | 23.8% (333 / 1,400) | 10.6 min | 16.2 min |
| F | outer / semi-rural | 7.5 / 12 | 25.6% (358 / 1,400) | 10.7 min | 15.9 min |

Baseline figures are **realized** from the files, not targets. P90 uses linear interpolation.
E and F are slower because they are farther out; that is their normal, not a planted problem.

**Enough data for the statistics.** With 100 calls a day, the daily expected late count n·p0 is
8.4 (A) to 25.6 (F) and n·(1−p0) is 74 to 92, all above the minimum of 5 the p chart needs. Every
zone × time band has at least 151 baseline calls and at least 13 late ones:

| Baseline calls / late | Night | Morning rush | Midday | Evening rush | Late evening |
|---|---|---|---|---|---|
| A | 159 / 13 | 244 / 24 | 401 / 33 | 391 / 33 | 205 / 15 |
| B | 157 / 15 | 303 / 22 | 394 / 33 | 371 / 41 | 175 / 20 |
| C | 175 / 22 | 283 / 53 | 403 / 39 | 376 / 47 | 163 / 23 |
| D | 151 / 17 | 280 / 50 | 368 / 34 | 413 / 77 | 188 / 20 |
| E | 166 / 28 | 276 / 79 | 388 / 72 | 387 / 124 | 183 / 30 |
| F | 158 / 30 | 280 / 97 | 409 / 60 | 363 / 128 | 190 / 43 |

## How the data is generated

For every call, in this order (all durations in minutes; `LogNormal(median, sigma)` means the log
of the value is normal with mean `log(median)` and standard deviation `sigma`; `clip` caps a value
at the given bounds):

1. **Notification hour**, drawn with relative weights per local hour (sum 25.6), then a random
   minute and second:

   | Hours | 00-05 | 06 | 07-08 | 09 | 10-15 | 16-19 | 20-23 |
   |---|---|---|---|---|---|---|---|
   | Weight per hour | 0.5 | 1.0 | 1.5 | 1.0 | 1.2 | 1.8 | 0.8 |

2. **Call handling** = `clip(LogNormal(1.0, 0.35), 0.2, 4.0)`.
3. **Turnout** = `clip(LogNormal(1.2, 0.25), 0.3, 4.0)`.
4. **Travel** = `clip(LogNormal(zone median, 0.25), 2.0, zone cap)`, then × **1.3 in rush
   hours** (notifications 07:00-09:00 and 16:00-19:00), then **+ Uniform(6, 12) on 10% of calls**
   (the ordinary long tail, in every zone and every file).
5. **Planted problem** (only in `recovery.csv` and `morning_tail.csv`, see below): extra travel
   minutes on some calls.
6. **Timestamps**: `unit_notified_at` from step 1; the others by adding or subtracting the stage
   durations, rounded to whole seconds.
7. **Dispatcher and unit**: drawn at random (8 dispatchers; 4 units per zone).

Steps 1-4 and 7 use one random stream; planted problems use a separate stream. So the baseline,
and every zone a scenario does not touch, are byte-identical across the three files.

## Scenarios

| | `normal.csv` | `recovery.csv` | `morning_tail.csv` |
|---|---|---|---|
| Problem zone | none | C (residential) | D (residential) |
| When | - | Oct 1-6 (days 18-23), all day; fixed from Oct 7 | Oct 1-11 (days 18-28), 06:00-10:00 only |
| Which calls | - | 25% of zone C calls | 25% of zone D morning-rush calls (64 calls) |
| Extra travel | - | Uniform(6, 12) min | Uniform(15, 25) min |
| Kind of problem | - | many calls a bit slower | a few calls much slower |
| Zone's late rate, monitoring | C 14.2%, D 12.1% | **C 23.7%** | **D 15.9%** |
| Longest response in the file | 27.9 min | 31.8 min | **41.6 min** |
| Citywide average R | 9.11 min | 9.20 min | 9.19 min |
| What catches it (with `app/qc.py`) | nothing: no zone has a flagged day | daily p chart: zone C on exactly Oct 1-6, then back in control | time-band view (zone D morning rush 37.1% late vs limit 24.9%) and the slowest-calls list (35.6-41.6 min); the daily p chart never flags D |

The citywide average barely moves in any file (9.11 → 9.20 min). That is the prompt's point: a
monthly average cannot see either problem.

## Limitations and known features

- **One chance flag.** Zone C's evening-rush band is flagged in `normal.csv` and
  `morning_tail.csv` (18.3% late vs a limit of 17.5%). It appears with no planted problem, so it
  is chance: the tool makes
  30 zone × band comparisons with no multiple-comparison correction, so about one chance flag is
  expected. We kept it rather than changing the seed to hide it.
- **Most zones sit above the 10% service target even in a normal month** (all except A). This
  follows from the agreed travel profiles; "above target" and "worse than its own normal" are
  separate labels for this reason.
- **Both planted problems are in travel.** The data can show *where* and *when*, and the stage
  breakdown can show that travel is the slow stage, but no file plants a dispatch (call-handling)
  or crew (turnout) problem, so the tool's ability to tell causes apart is not demonstrated.
- **A slow dispatcher would not make a zone late.** R starts at `unit_notified_at`, so a
  call-handling delay shows only in the stage breakdown and the total wait.
- **Travel does not prove traffic.** Longer travel can mean traffic, distance, or ambulances
  waiting in the wrong place; these files contain no GPS, distance or road data.
- **Calls are independent.** There is no queue: an ambulance can be "on two calls at once", and a
  busy zone never borrows a unit from a neighbour. Each zone's units serve only that zone.
- **One priority level.** Real data has several, each with its own target; the `priority` column
  keeps the format ready for that.
- **Dispatcher and unit IDs are random labels** with no effect on times.
- **No cancelled calls, missing timestamps or duplicates.** The tool's upload validation is
  tested with separate small fixtures, not with these files.

## Collecting this data for real

Every column already exists in a 911 center's computer-aided dispatch (CAD) system; no one has
to type anything new. They correspond to the national EMS data standard (NEMSIS v3.5, eTimes):

| Column | Typical CAD event | NEMSIS element |
|---|---|---|
| `call_received_at` | call answered at the 911 center (PSAP) | eTimes.01 PSAP Call Date/Time |
| `unit_notified_at` | unit assigned / crew alerted | eTimes.03 Unit Notified by Dispatch Date/Time |
| `unit_en_route_at` | crew presses "en route" | eTimes.05 Unit En Route Date/Time |
| `on_scene_at` | crew presses "on scene" (or vehicle GPS arrival) | eTimes.06 Unit Arrived on Scene Date/Time |
| `zone_id` | the agency's response district, from the call address via the CAD's GIS map | - |
| `priority` | the call's dispatch priority or determinant code | - |
| `dispatcher_id`, `unit_id` | CAD user and unit identifiers | - |

Before a real export is analysed:

- Export **all four timestamps with timezone offsets** (or in UTC), so the daylight-saving
  change in November is handled.
- Map addresses to **the agency's own districts**; boundaries differ between agencies.
- Decide how to treat **cancelled calls, calls with several ambulances, and priority changes**;
  this prototype assumes one completed high-priority response per row.
- Check that crews press **en route / on scene** at the right moment; button-press timing is the
  main source of error in turnout and travel times, and GPS arrival is more reliable where it exists.
- Pseudonymise dispatcher and crew IDs; the tool is for finding process problems, not for ranking
  people.

**What we would collect next, to answer "why".** Timestamps say when and which stage, not the
reason. A one-tap **`delay_reason`** field logged by the crew or dispatcher on late calls
(traffic / no unit available / address or access problem / other) would let the tool show causes
directly. Vehicle GPS tracks (distance driven, starting location) would separate distance from
traffic.
