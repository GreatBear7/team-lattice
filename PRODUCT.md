# ResponseWatch

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is an on-duty supervisor at a 911 dispatch center, explicitly selected by the team. They need to identify which city zone has deteriorated, distinguish it from chronic target failure, inspect when and which response stage changed, and review severe individual delays.

## Product Purpose

Expose response-time variation and severe delays hidden by monthly citywide averages, using zone-level quality-control analysis. This hackathon prototype demonstrates historical, fully completed synthetic cohorts; it is not a live dispatch feed.

## Operating Context

Four-person Cornell SYSEN 5300 hackathon team. A owns data, B statistics, C frontend, D backend and deployment. docs/Final_Plan.en.md is the adopted scope. temp-ideas contains proposals, not adopted scope. The user requested a compact dashboard with little page scrolling and meaningful Six Sigma charts.

## Capabilities and Constraints

Three reproducible synthetic CSVs: normal, recovery, morning_tail merged into dev f6a1e52. Six functional zones: A/B downtown, C/D residential, E/F outer. High priority, 14-day frozen baseline followed by 14 monitoring days. Demo T=12 minutes and allowed late rate q=10%, not clinical standards. Daily zone p chart is primary; five pooled time bands exploratory; stage medians and P90 descriptive; slowest five completed incidents remain visible independently of flags. Above-target and own-baseline deterioration are separate. Null is unavailable, never zero or normal. No frontend statistical formulas. B's tested functions supply precomputed mock fixtures. No live incident writes, dispatcher ranking, maps, database or causal diagnosis in this redesign. The adopted hourly heatmap compares six zones across 24 local hours, with 7/14-day views and raw/circular 3-hour pooling. Black outlines reflect supplied five-band signals; grey cells preserve limited evidence. X-bar/S remains outside the merged production statistics.

## Brand Commitments

Existing product name ResponseWatch. English operator interface. Calm, factual operational language.

## Evidence on Hand

Merged dev f6a1e52: data 9853338, statistics f8b0641; adopted bilingual Final_Plan; current API contract and generated fixtures verified against Git objects. Mock fixtures must disclose their synthetic nature and source revisions.

## Product Principles

- Put zone selection and its evidence together.
- Differentiate service acceptability, statistical change, and severity.
- Show timeframe and synthetic-data state without dominating the workspace.
- Never attribute delay to a person or cause without evidence.
- Preserve A/B/D ownership and make fixture-to-API replacement local.

## Current C H-04 Delivery

The main instrument occupies the right side; all six districts and the slowest five incidents remain visible in a left rail. A factual opening brief points to supplied daily or pooled-band evidence. Morning tail demonstrates why no daily signal does not mean no problem. Preview and API modes are explicit, with CSV upload and visible errors; no silent fallback. Backend service and deployment remain D’s responsibility.
