---
name: ResponseWatch
description: Compact operational instruments for response quality.
colors:
  teal: '#087d77'
  red: '#bd4135'
  amber: '#94610f'
  ink: '#223440'
  muted: '#5b6c78'
  line: '#dce3e7'
  surface: '#fff'
  ground: '#f2f5f6'
  focus: '#1267ae'
  selected-surface: '#eaf5f3'
  selected-line: '#a2cec7'
  warning-surface: '#fff8e9'
  danger-surface: '#fff1ee'
  quiet-surface: '#f0f5f3'
  observation: '#2863c5'
  chart-signal: '#c44638'
  frozen-baseline: '#127d79'
  control-limit: '#a96b16'
  comparison: '#a6b3c0'
  chart-grid: '#e5ebef'
  chart-axis: '#627487'
  baseline-period: '#f0f4f7'
  selected-date: '#dce9fa'
  tooltip-surface: '#183247'
  tooltip-text: '#edf5fc'
  hourly-neutral: '#f5f7f9'
  hourly-unavailable: '#e5eaee'
  band-outline: '#17242e'
typography:
  title:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 14px
    fontWeight: 650
    letterSpacing: -.015em
    lineHeight: 18px
  body:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 13px
  label:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 12px
  chart-label:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 12px
    fontWeight: 400
  selected-zone:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 16px
    fontWeight: 650
    lineHeight: 21px
rounded:
  panel: 12px
  control: 5px
  tile: 6px
  tag: 4px
  bar: 1px
spacing:
  tight: 4px
  small: 8px
  compact: 10px
  panel: 12px
  comfortable: 16px
  section: 20px
  wide: 24px
  workspace: 14px
components:
  button-primary:
    backgroundColor: '{colors.teal}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: 8px 13px
  button-text:
    textColor: '#096e69'
    padding: 3px 0
  button-help:
    textColor: '{colors.muted}'
    rounded: '{rounded.control}'
    height: 30px
    width: 30px
  select:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: 0 27px 0 9px
    height: 30px
  panel:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.panel}'
  zone-row-selected:
    backgroundColor: '{colors.selected-surface}'
    textColor: '{colors.ink}'
  status-danger:
    backgroundColor: '{colors.danger-surface}'
    textColor: '#b1392e'
    rounded: '{rounded.tag}'
    padding: 3px 6px
  status-warning:
    backgroundColor: '{colors.warning-surface}'
    textColor: '#80570d'
    rounded: '{rounded.tag}'
    padding: 3px 6px
  chart-tooltip:
    backgroundColor: '{colors.tooltip-surface}'
    textColor: '{colors.tooltip-text}'
    rounded: '{rounded.tile}'
    padding: 10px 12px
  analysis-tab:
    textColor: '{colors.muted}'
    padding: 0 10px
  analysis-tab-active:
    textColor: '#066e69'
    padding: 0 10px
  scenario-choice:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.tile}'
    padding: 9px 12px
  scenario-choice-active:
    backgroundColor: '{colors.selected-surface}'
    textColor: '#066a65'
    rounded: '{rounded.tile}'
    padding: 9px 12px
  segmented-active:
    backgroundColor: '{colors.surface}'
    textColor: '#096e69'
    rounded: 3px
    padding: 5px 9px
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: 5px 8px
    height: 31px
  zone-select:
    textColor: '{colors.ink}'
    rounded: 3px
    width: 100%
---

# Design System: ResponseWatch

## Overview

**Creative North Star: "The Quality Engineer's Instrument Bench"**

A light professional workbench for interpreting response quality. Cool off-white ground, white instrument panels and navy ink create a calm, compact operational surface. Teal marks selection and purposeful controls; chart colors identify evidence and its statistical meaning.

The interface uses aligned figures, persistent panel locations and restrained borders so repeated comparisons remain easy to scan. English labels stay factual. Density serves the supervisor task; it does not justify shrinking the main evidence or hiding unavailable results.

**Key Characteristics:**

- Cool ground and white instrument panels.
- Compact controls with aligned, tabular figures.
- Teal selection and explicit statistical color roles.
- Data-drawn SVG charts with keyboard inspection.

Extracted from the current `app/frontend/src/styles.css`, `heatmap.css`, `Charts.jsx`, `HourHeatmap.jsx` and `App.jsx`. The supervisor-dashboard surface brief owns the approved three-panel composition.

## Colors

Cool neutrals support a small set of functional accents. Frontmatter remains the normative value source.

### Primary

- **Instrument Teal** anchors controls and the selected zone identity tile. The selected-zone wash and inset seam keep selection visible across its table row.
- **Observed Data Blue** identifies daily observations and monitoring time-band bars. **Frozen Baseline Teal** identifies the daily center line.
- **Keyboard Focus Blue** supports visible focus; selected dates use the pale blue plot wash.
- **Hourly Zero Change** is the midpoint of the hourly diverging scale. **Hourly Unavailable Evidence** carries gray hatching, while **Supplied Band Outline** frames flagged bands independently of cell color.

### Secondary

- **Interface Signal Coral** identifies explanatory UI signals. **Chart Signal Coral** identifies flagged triangles and monitoring bars. Preserve their distinct implemented contexts.
- **Signal Wash** supports the main evidence badge.

### Tertiary

- **Target Amber** identifies service-target failure. **Control Limit Amber** draws statistical limits, reinforced by dashed lines.
- **Caution Wash** supports target and synthetic-data labels.

### Neutral

- **Navy Ink** and **Slate Annotation** separate primary evidence from context.
- **Cool Workbench Ground**, **White Instrument Surface** and **Seam Gray** establish the panel hierarchy.
- **Historical Comparison Gray** marks baseline bars; the baseline-period wash marks historical dates.
- **Plot Grid Gray** and **Plot Annotation Slate** support the plots; **Inspection Navy** and **Inspection Paper** provide local tooltip contrast.

**The Meaning Before Color Rule.** Pair a signal color with a label, line style or marker shape. Target failure and a control-limit signal remain distinct.

## Typography

**Body and interface font:** the native system sans stack in the frontmatter. The hierarchy is compact and practical. Tabular numerals are enabled at the root, so tables, chart labels and summary values align consistently.

- **Title:** repeated panel headings.
- **Selected zone:** the analysis-panel heading.
- **Body:** default interface text and the exception summary.
- **Label / chart label:** controls, data tables and plot annotations.

Supporting metadata uses local (11px) treatments. Methods prose uses (12px), relaxed line-height (1.7) and a reading measure (65ch). These local treatments are not an invitation to shrink the primary data.

**The Tabular Evidence Rule.** Use tabular numerals in metrics, tables and plots so comparisons stay vertically aligned.

## Layout

Use flat tiled instruments and stable evidence positions. The current desktop shell has a direct scenario toolbar (86px), flexible workspace and footer (24px). There is no summary banner. A left rail (360px) places the district overview in the first row (308px) above the severe-incident table; the incident row takes the remainder with a minimum (230px). The selected-zone analysis occupies the flexible right column and spans both rows. Gaps and workspace padding are (14px).

At wide desktop sizes (1500px and above), the toolbar becomes (90px), left rail (380px), district row (338px), incident minimum (250px), and gaps (16px). Between (1100px) and (1199px), the rail contracts to (330px), with gaps and padding (12px). At (1099px) and below the document scrolls naturally, the toolbar wraps, and a (300px) rail uses a (350px) district row above an incident row of at least (275px). At (760px) and below, the selected-zone analysis, district overview and incidents stack in that order. Tables preserve their columns through local horizontal scrolling. The narrowest layout adjusts tab spacing at (390px); charts retain their independent (700px) adjustment.

The analysis panel shows one local view at a time: Where & when, Daily p chart or Delay stages. Time-of-day display, window and aggregation controls remain beside that instrument. Incident scope and timestamp expansion remain in the incident panel. The narrow clock reserves a plot of at least (330px); grid and clock sizes remain independent when switching modes.

## Elevation & Depth

Resting panels are white surfaces separated by thin seams. The selected zone row uses an inset outline. Chart inspection tooltips float above their plots. Active segmented buttons have a small local shadow; resting instrument panels stay flat.

### Shadow Vocabulary

- **Segmented selection:** (`0 1px 3px #22344020`) separates the active local control from its pale track.

- **Selected-zone inset:** (`inset 0 0 0 1px #a2cec7`) reinforces the selected table row.
- **Chart inspection:** (`0 5px 14px #18324724`) separates a transient tooltip from its plot.

**The Flat Instruments Rule.** Resting panels use a seam border. Reserve floating shadows for transient inspection and active segmented controls; district selection uses an inset outline.

## Shapes

Panels use the softly rounded panel token. Native selects, help controls and zone identity tiles use the control radius. The actual zone-selection button uses a smaller (3px) focus shape. Evidence badges use the tag radius; chart tooltips use the tile radius. Thin dividers and rectangular plots preserve precise alignment.

The interface uses inline SVG icons and data-drawn SVG plots. No shipping raster asset belongs to this system.

## Components

### Buttons

Text actions are compact teal labels with underline on hover. The help control is a square icon button, and the solid teal action retries a failed load. Controls use visible focus outlines (2px) with an offset (3px). Disabled controls reduce opacity (.55). Current controls change state immediately; do not inherit the previous transition timing.

### Inputs / Fields

The existing field primitive is a native select: white surface, muted thin border, compact control radius and the height recorded in frontmatter. Hover strengthens its border. Window and hourly aggregation use native selects. Data-source connection fields use white bordered inputs, the same compact control radius and visible keyboard focus. Disabled inputs use a pale gray surface. Preserve accessible labels and native keyboard behavior.

### Local Analysis Tabs

Where & when, Daily p chart and Delay stages share the selected-zone panel. Compact horizontal tabs use muted text, a teal bottom seam and teal ink for the selected state. Hover adds a subtle surface tint. Tab semantics, roving focus, arrow navigation, Home and End support keyboard use. Daily, time-band and stage views offer local chart/data toggles.

### Scenario and Scope Controls

Three direct scenario buttons carry a short name and explanatory second line. They use white surfaces, thin borders and the tile radius; the pressed scenario uses a pale teal wash, teal border and inset teal seam. They remain visible as a group when the toolbar wraps. Incident scope uses two direct segmented buttons, All zones and the selected zone, with an independent timestamp-expansion action. Selected local controls use white on a pale track, teal ink and a subtle shadow.

### Chips / State Badges

Badges distinguish target failure, daily signal, no signal and unavailable evidence in words. Main context badges use pale backgrounds and compact padding; zone-table states use plain colored text. The synthetic-data label uses a caution wash and thin border. State labels do not act as filters.

### Cards / Containers

Panels use a white surface, seam border and panel radius. Tables use sticky pale headers, thin row seams and right-aligned numeric columns. The top-five incident table remains visible independently of signals; its local controls change scope or expand timestamps inline.

### Zone Selection

Zones occupy table rows with columns for identity, late rate, P90 and change evidence. Clicking a row selects the zone; the identity cell contains an actual keyboard-focusable button. A selected row combines a pale teal wash, inset seam and solid teal identity tile. Selection and keyboard focus remain independently visible.

### Statistical Instruments

The daily p chart uses blue observations, a teal center line, amber dashed control limits, a dotted target and coral triangles for supplied flags. Historical dates are shaded; selected dates have a separate wash. Moving horizontally anywhere across the plot inspects the nearest date, with a dashed vertical crosshair and tooltip. Focusable points preserve keyboard inspection and date selection.

Time-band comparisons use gray baseline bars and blue monitoring bars, with coral monitoring bars for supplied flags and an amber dashed upper limit. Limited evidence remains labeled. Delay stages retain the paired-dot comparison chart and a rich three-row, six-column table: stage identity, baseline and monitoring median, baseline and monitoring P90, and descriptive P90 change. Grouped headers separate medians from P90. Pale teal monitoring cells, larger monitoring P90 figures and signed change values establish the hierarchy; longer changes use coral and shorter changes blue. Stage medians remain separate measures and are never presented as an additive median total.

The hourly grid and 24-hour concentric clock share six zones, 24 local hours, a fixed diverging scale (−25 to +25 percentage points), 7/14-day windows and raw 1-hour/circular pooled 3-hour controls. Blue indicates a lower late rate, neutral a zero change and coral a higher rate. Gray hatching preserves unavailable or limited evidence. Black outlines indicate only supplied, available five-band flags; color never implies per-hour significance. Teal row or ring outlines identify the selected district without changing quantitative fills. The clock has an outer-to-inner A–F key. Roving cell focus, arrow navigation and Enter/Space selection update the persistent readout. Band comparison remains a separate local view.

The reduced-motion media rule disables transitions and animation. Plot geometry follows supplied observations, and all analysis copy preserves missing-evidence and interpretation limits.

## Do's and Don'ts

### Do:

- Do use the existing semantic colors and distinguish interface colors from chart-series colors.
- Do keep textual state labels and keyboard-visible focus on interactive evidence.
- Do align comparable numbers and preserve units, unavailable states and chart explanations.
- Do let panels reflow and the page scroll on narrow screens.

### Don't:

- Don't turn amber target warnings into red control-limit signals.
- Don't show unavailable evidence as zero or as a reassuring normal state.
- Don't add decorative imagery or shadows to the data instrument panels.
- Don't replace real chart data with decorative sparklines or infer a cause from stage durations.

## Manager decision view

The left rail pairs a three-column District overview (district, late calls, attention) with an interactive Response briefing. The briefing explains rather than repeats the table: a short conclusion followed by What changed?, What to check?, or Limits; each answer can open its supporting chart. A compact headline number supports the conclusion (daily affected days or the relevant late rate), with its own unit; there is no external AI integration. Priorities: daily deterioration, then a flagged time band, then chronic target failure/stability; missing comparisons stay explicitly incomplete. Dataset and district selection update the briefing; the shared time-band window updates band conclusions only. Hovering a date never changes the manager conclusion. The briefing fits its content, its scope follows the answer without auto-pushed whitespace, and remaining rail height is allocated to the district rows. No scenario-specific hardcoded conclusions or new statistical alarms.

Daily inspection floats inside the plot with no reserved space or instruction text. Position candidates avoid the selected observation and prefer regions with fewer plotted marks/control lines. Pointer/date snapping and keyboard inspection remain available. Tooltip counts come only from the selected day’s API late/n values. The full chart height is restored.

Issue #7: operator labels use Dataset 1–3, plain-language captions, Daily p chart → Where & when → Why and “90% arrive within”. Technical details remain in documentation. Desktop verification is in scope; the user explicitly excluded mobile verification for this revision.

## First-use pages

The H12 home page preserves the teal identity and trace animation but reduces the first visit to purpose, one dashboard entry and three dataset links. The guide presents three start steps and four status explanations by default; CSV schema and the original worked statistical methods are retained in native disclosures. Repetitive FAQ/glossary tables and obsolete slowest-call instructions are removed. Dashboard navigation uses relative Home/Guide links and dataset query parameters, supporting deployment subpaths.
