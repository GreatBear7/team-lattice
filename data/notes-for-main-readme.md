<!--
For D (H-07): a "Test data" section to paste into the main README.md. Links are written
relative to the repo root, so they work once pasted there (not from this file's location).
Numbers checked against data/*.csv and app/qc.py (h03-stats) on 2026-10-16.
-->

## Test data

Three synthetic datasets in [`data/`](data/), one month of fictional ambulance calls for a city
with six zones (A/B downtown, C/D residential, E/F outer). Each file has 16,800 calls
(6 zones × 28 days × 100 calls a day, Sep 14 – Oct 11, 2026). The first 14 days are the
baseline ("normal") and are identical in all three files; each file plants a different problem
in the last 14 days. Full codebook: [`data/README.md`](data/README.md).

| File | What happens | What the tool shows |
|---|---|---|
| `normal.csv` | Nothing goes wrong | No zone is flagged on any day |
| `recovery.csv` | Zone C: 25% of calls take 6–12 extra minutes to drive, Oct 1–6; fixed from Oct 7 | Zone C flagged on exactly Oct 1–6, then back in control |
| `morning_tail.csv` | Zone D: 25% of morning-rush calls (06:00–10:00) take 15–25 extra minutes, Oct 1–11 | Daily chart stays green; zone D's morning band is flagged (37.1% late vs a 28.7% limit) and its slowest calls take 36–42 minutes |

In all three, the citywide average response time barely moves (9.11 → 9.20 min). That is the
point of the prompt: a monthly average cannot see either problem.

**Each row** is one call: `incident_id`, `zone_id`, `priority`, four timestamps
(`call_received_at`, `unit_notified_at`, `unit_en_route_at`, `on_scene_at`), `dispatcher_id`
and `unit_id`. The tool derives three stage times from the timestamps (call handling, turnout,
travel). A call is **late** when ambulance notification to arrival takes more than 12 minutes,
a demonstration setting, not a clinical standard.

**Regenerate** (fixed seed, identical output every time):

```bash
python data/generate_data.py
```

**Using your own data:** upload a CSV with the same nine columns. Every column comes from a
911 center's computer-aided dispatch (CAD) system and matches the national EMS data standard
(NEMSIS eTimes); see the codebook for the mapping and data-quality checks.

**Limitations:** the data is synthetic; both planted problems are in travel time, so the
data does not test whether the tool can tell a dispatch delay from a crew delay; the
time-band view makes 30 unadjusted comparisons, so a chance flag is possible in other data
(none occurs in these three files). Details in
[`data/README.md`](data/README.md#limitations-and-known-features).

### Demo walkthrough (data side)

1. **`normal.csv`**: every zone is in control, so the tool raises no false daily alarms.
2. **`recovery.csv`**: zone C turns red on Oct 1, stays red through Oct 6 and is back in
   control from Oct 7. In the stage breakdown, travel is the only stage that changes: its
   median barely moves (6.9 → 7.2 min) but its 90th percentile reaches 16.5 min, while call
   handling and turnout stay at about 1.0 and 1.2 min.
3. **`morning_tail.csv`**: the daily chart shows nothing, but zone D's morning-rush band is
   red and the slowest-calls list shows calls of 36–42 minutes: the rare, severe delays a
   monthly average hides.
