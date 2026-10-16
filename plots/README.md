# Temporary plots (not part of the tool)

Static previews of `app/qc.py` (PR #1, branch `h03-stats`) run on the H-02 CSVs (branch `h02-data`),
for the team to look at before the front end exists. Delete this branch once C's charts are live.

- `pchart_normal.png`, `pchart_hidden_tail.png`, `pchart_recovery.png`: daily share of late calls
  (R > 12 min) per zone. Blue = daily late fraction; solid gray = frozen baseline p0 (Sep 14-27,
  shaded); dashed = 3-sigma limits; dotted = 10% service target; red X = day above its own UCL.
- `bands_zoneC.png`: zone C late fraction per time band, monitoring (Sep 28-Oct 11) vs baseline;
  black tick = UCL; red = above UCL. normal.csv's evening-rush flag is an expected chance flag
  (30 unadjusted comparisons).
- `make_charts.py`: the script that drew them (`python plots/make_charts.py <csv folder> <out folder>`,
  needs `app/qc.py`, pandas and matplotlib).
