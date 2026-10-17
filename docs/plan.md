# Final_Plan / 当前唯一执行计划

- [中文版 Final_Plan](Final_Plan.md)
- [English Final_Plan](Final_Plan.en.md)

Use the two Final_Plan documents above for implementation. Earlier plan files are historical references, including the alternative titled Final Implementation Plan.

## Agreed scope

- Six core deliverables: reproducible synthetic data/codebook; tested statistics; CSV/scenario loading and zone summary; daily p charts; zone detail with slowest incidents, stages and pooled time bands; public deployment.
- Keep the daily zone chart as the primary flag and five pooled time bands as supporting detail. No new required inputs or fifth core API.
- Show five slowest completed incidents and `minutes_over_target=max(0,R-T)` independently of a zone flag; sort R descending, then incident ID lexicographically ascending.
- Empty metrics are null/No data, not zero. Warn for P90 when n<20; this is a UI convention, not a reliability guarantee.
- Demo baseline: 14 nonempty completed daily batches per zone/priority and at least five late and five non-late baseline records; otherwise `baseline_insufficient`. Band baselines also need at least five of each outcome.
- Keep R=unit notification to scene, T=12 minutes, strict R>T and p>UCL; no S=24 severity threshold. Numeric tests use `pytest.approx`; no tolerance in alert logic.
- Six zones, 28 days, 14 frozen baseline days, seed 5300, 100 incidents/zone/day, approximately 16,800 rows per CSV.
- Fixed functional profiles: A/B downtown (travel median 5, cap 8); C/D residential (6, 10); E/F outer/semi-rural (7.5, 12), all minutes, sigma=0.25 and rush multiplier 1.3. Derive type from zone_id, without new required inputs.
- Enable q=10%: display `above_service_target` separately from own-baseline `deterioration_flag`. Estimate frozen p0/p0_band per zone from realized data; never use a citywide shared baseline or promise stable zones have no false alarms.
- Proposal rates 10%/12%/23% are approximate references, not measured outcomes. Our hourly weights imply 8.4/25.6≈32.8% rush calls; A records actual zone rates and checks adequacy. C's fault injection is unchanged.
- Normal hourly volume and rush multipliers apply in the baseline too; time bands derive from local unit-notification time, pooled across days. Document exploratory-comparison limitations.
- Serve built React assets and four core APIs from one FastAPI production entry point. Preserve API error responses.
- Live replay/editing/timers, follow-up and maps remain optional after the deployed-core gate, reached no later than 2026-10-17 02:00 ET. Do not let them block deployment.
- Roles: A data; B statistics and tests; C frontend; D API, unified deployment and release. Fill actual team name and prompt number in SPEC before implementation.
- Targets: deploy 10-16 22:30; freeze 10-17 11:00; materials 12:00; submit 12:30 before the 13:00 deadline, all ET.

## References and superseded plans

- [First review](plan-review.md), commit `609bed9`.
- [Time-of-day proposal](time-of-day-proposal.md), commit `b1b86b5`.
- [Functional-zone profiles](zone-profiles-proposal.md), commit `6c9aa6f`; adopted in Final_Plan.
- [Historical Chinese plan](plan.zh-CN.md) / [historical English plan](plan.en.md).
- [Alternative Chinese proposal](ResponseWatch-plan.zh-CN.md) / [alternative English proposal](ResponseWatch-plan.en.md), commit `4832c3d`.

This is a documentation-only finalization under H-09. H-01 through H-08 are not completed by publishing the plan.
