# Codebook: ResponseWatch incident data

Variable-by-variable reference for the three test datasets (`normal.csv`, `recovery.csv`,
`morning_tail.csv`) and for any CSV uploaded to the tool. All three files share these columns.
For what each file contains, how the data is generated and its limitations, see
[data/README.md](README.md). All records are synthetic.

## Variables (CSV columns)

One row is **one call and the single ambulance that responded to it**.

| Column | Type | Example | Meaning |
|---|---|---|---|
| `incident_id` | text, unique | `INC-20260914-B001` | Call ID: `INC-` + local date of `unit_notified_at` + zone + order of that call within the zone and day |
| `zone_id` | text, `A`-`F` | `B` | City zone the call came from (see [Zones](README.md#zones)) |
| `priority` | text | `high` | Call urgency. Every call in these files is `high` (see [Limitations](README.md#limitations-and-known-features)) |
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

**Required for upload:** `incident_id`, `zone_id` and the four timestamps. `priority` is optional
(if present, only `high` rows are analysed); `dispatcher_id` and `unit_id` are optional and never
used by the statistics.

## Derived variables (calculated by the tool, not stored)

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

## Time periods

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

## Source of each variable in real dispatch data

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
