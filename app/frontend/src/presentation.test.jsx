import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StatusBadge, SlowestTable, ZoneOverview, StageTable, StageEvidence, largestStageShift, ScenarioPicker, timeBandConclusion, DailyData, dailyEvidenceLabel } from './App.jsx'
import { DailyPChart, BandChart, StageChart, stageShift, nearestDateIndex } from './Charts.jsx'
import { getDashboard, getZoneAnalysis } from './api/client.js'
import { percent, minutes } from './format.js'
import { initialFocus } from './focus.js'
import { HourHeatmap, cellTone, clockArc } from './HourHeatmap.jsx'
import { LoadError } from './App.jsx'

describe('precomputed dashboard evidence', () => {
  it('keeps unavailable values distinct from real zero and false', () => {
    expect(percent(null)).toBe('—')
    expect(minutes(undefined)).toBe('—')
    expect(percent(0)).toBe('0.0%')
    const html = renderToStaticMarkup(<StatusBadge value={null} status="insufficient_evidence" />)
    expect(html).toContain('Insufficient evidence')
    expect(html).not.toContain('No daily signal')
  })

  it('has three complete scenarios with reconciled daily and pooled counts', async () => {
    for (const scenario of ['normal', 'morning_tail', 'recovery']) {
      const { summary, analyses } = await getDashboard(scenario)
      expect(summary.mock).toBe(true)
      expect(summary.zones).toHaveLength(6)
      expect(summary.zones.reduce((n, z) => n + z.n, 0)).toBe(8400)
      for (const zone of summary.zones) {
        const a = analyses[zone.zone_id]
        expect(a.summary).toEqual(zone)
        expect(a.daily_p_chart.points).toHaveLength(28)
        const monitoring = a.daily_p_chart.points.filter((p) => p.phase === 'monitoring')
        expect(monitoring.reduce((n, p) => n + p.late, 0)).toBe(zone.late)
        expect(a.time_of_day.bands.reduce((n, b) => n + b.monitoring_late, 0)).toBe(zone.late)
        expect(a.time_of_day.bands.reduce((n, b) => n + b.baseline_late, 0)).toBe(zone.baseline_late)
        expect(a.time_of_day.bands.reduce((n, b) => n + b.n_band, 0)).toBe(zone.n)
      }
    }
  })

  it('preserves a frozen baseline and the deterioration/recovery story', async () => {
    const normal = await getDashboard('normal')
    const hidden = await getDashboard('morning_tail')
    const recovery = await getDashboard('recovery')
    expect(normal.summary.zones.every((z) => z.deterioration_flag === false)).toBe(true)
    expect(hidden.analyses.D.summary.deterioration_days).toBe(0)
    expect(hidden.analyses.D.time_of_day.bands.find((b) => b.band === 'morning_rush').flag).toBe(true)
    expect(recovery.analyses.C.summary.deterioration_days).toBe(6)
    expect(recovery.analyses.C.daily_p_chart.points.at(-1).deterioration_flag).toBe(false)
    for (const id of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const baseline = normal.analyses[id].daily_p_chart.points.filter((p) => p.phase === 'baseline')
      expect(hidden.analyses[id].daily_p_chart.points.filter((p) => p.phase === 'baseline')).toEqual(baseline)
      expect(recovery.analyses[id].daily_p_chart.points.filter((p) => p.phase === 'baseline')).toEqual(baseline)
    }
  })

  it('retains chronic target failure without obsolete pre-H11 band alarms', async () => {
    const normal = await getDashboard('normal')
    expect(normal.analyses.E.summary.above_service_target).toBe(true)
    expect(normal.analyses.E.summary.deterioration_flag).toBe(false)
    expect(normal.analyses.C.time_of_day.bands.find((b) => b.band === 'evening_rush').flag).toBe(false)
    expect(Object.values(normal.summary.time_of_day_all_zones).flat().every((b) => b.flag === false)).toBe(true)
    expect(normal.analyses.C.summary.deterioration_flag).toBe(false)
  })

  it('draws supplied evidence and offers meaningful empty states', async () => {
    const a = await getZoneAnalysis('C')
    const daily = renderToStaticMarkup(<DailyPChart chart={a.daily_p_chart} q={.1} />)
    expect(daily).toContain('Baseline reference')
    expect(daily).toContain('Above upper control limit')
    expect(renderToStaticMarkup(<BandChart bands={a.time_of_day.bands} />)).toContain('PM rush')
    expect(renderToStaticMarkup(<StageChart stages={a.stages} />)).toContain('Travel')
    expect(renderToStaticMarkup(<DailyPChart chart={{points: []}} />)).toContain('No completed observations')
    expect(renderToStaticMarkup(<SlowestTable incidents={[]} />)).toContain('No completed incidents')
  })

  it('preserves supplied incident order, offsets and immutable fixtures', async () => {
    const bundle = await getDashboard('morning_tail')
    const items = bundle.summary.slowest_incidents
    const html = renderToStaticMarkup(<SlowestTable incidents={items} />)
    expect(html.indexOf(items[0].incident_id)).toBeLessThan(html.indexOf(items[1].incident_id))
    expect(html).toContain(minutes(items[0].minutes_over_target))
    bundle.analyses.C.summary.late_rate = 99
    expect((await getZoneAnalysis('C')).summary.late_rate).toBeLessThan(1)
    await expect(getDashboard('evening_tail')).rejects.toThrow('Unknown scenario')
    await expect(getZoneAnalysis('Z')).rejects.toThrow('Unknown zone')
  })
  it('keeps all six districts directly selectable in the simplified overview', async () => {
    const { summary } = await getDashboard('recovery')
    const html = renderToStaticMarkup(<ZoneOverview zones={summary.zones} bandsByZone={summary.time_of_day_all_zones} selected="C" onSelect={() => {}} />)
    expect((html.match(/aria-label="Inspect zone /g) || []).length).toBe(6)
    expect(html).toContain('Six response districts')
    expect(html).toContain('6 daily')
    expect(html).toContain('Above service target')
    expect(html).toContain('Within service target')
  })

  it('reveals incident timestamps without hiding severe records', async () => {
    const { summary } = await getDashboard('morning_tail')
    const compact = renderToStaticMarkup(<SlowestTable incidents={summary.slowest_incidents} showTimestamps={false} />)
    const expanded = renderToStaticMarkup(<SlowestTable incidents={summary.slowest_incidents} showTimestamps />)
    expect(compact).not.toContain('Unit notified')
    expect(expanded).toContain('Unit notified')
    for (const incident of summary.slowest_incidents) {
      expect(compact).toContain(incident.incident_id)
      expect(expanded).toContain(incident.incident_id)
    }
  })

  it('keeps all three stage summaries available as separate measures', async () => {
    const analysis = await getZoneAnalysis('C')
    const html = renderToStaticMarkup(<StageTable stages={analysis.stages} />)
    expect(html).toContain('Call handling / assignment')
    expect(html).toContain('Turnout')
    expect(html).toContain('Travel')
    expect(html).toContain('P90 · min')
    expect(html).toContain(analysis.stages[2].baseline_p90_min.toFixed(1))
    const chart = renderToStaticMarkup(<StageEvidence stages={analysis.stages} />)
    expect(chart).toContain('Stage medians do not add')
    expect(chart).toContain(analysis.stages[2].monitoring_p90_min.toFixed(1))
    expect(renderToStaticMarkup(<StageEvidence stages={analysis.stages} showData />)).toContain('P90 · min')
  })

  it('reports the largest descriptive stage shift from supplied values', async () => {
    const recovery = (await getDashboard('recovery')).analyses.C.stages
    const top = largestStageShift(recovery)
    expect(top.stage.stage).toBe('travel')
    expect(top.measure).toBe('p90')
    expect(top.delta).toBe(Math.round((recovery[2].monitoring_p90_min - recovery[2].baseline_p90_min) * 10) / 10)
    expect(stageShift({ baseline_median_min: 1.02, monitoring_median_min: 1.0 }, 'median')).toBe(0)
    expect(stageShift({ baseline_median_min: null, monitoring_median_min: 1.0 }, 'median')).toBeNull()
    expect(largestStageShift([])).toBeNull()
  })

  it('never describes unavailable daily flags as no signal', async () => {
    const { summary } = await getDashboard('normal')
    summary.zones[0].deterioration_flag = null
    summary.zones[0].status = 'insufficient_evidence'
    const overview = renderToStaticMarkup(<ZoneOverview zones={summary.zones} bandsByZone={summary.time_of_day_all_zones} selected="A" />)
    expect(overview).toContain('Daily: unavailable')
    const point = { date: '2026-10-01', phase: 'monitoring', n: 100, late: 10, p: .1, cl: .1, ucl: .2, lcl: 0, status: 'ok', deterioration_flag: null }
    const table = renderToStaticMarkup(<DailyData points={[point]} />)
    expect(table).toContain('Evidence unavailable')
    expect(table).not.toContain('No upper-limit signal')
    expect(dailyEvidenceLabel(point)).toBe('Evidence unavailable')
    expect(dailyEvidenceLabel({ ...point, deterioration_flag: false })).toBe('No upper-limit signal')
    expect(dailyEvidenceLabel({ ...point, phase: 'baseline' })).toBe('Baseline observation')
  })

  it('opens supplied daily or strongest exploratory band evidence without scenario-truth labels', async () => {
    const morning = await getDashboard('morning_tail')
    const recovery = await getDashboard('recovery')
    expect(initialFocus(morning.summary)).toMatchObject({ zone: 'D', view: 'where' })
    expect(initialFocus(recovery.summary)).toMatchObject({ zone: 'C', view: 'daily' })
    expect(morning.summary.zones.every((z) => z.deterioration_flag === false)).toBe(true)
    const custom = structuredClone(morning.summary)
    custom.time_of_day_all_zones = {}
    custom.slowest_incidents = [{ zone_id: 'F', response_min: 38 }]
    expect(initialFocus(custom).zone).toBe('F')
  })

  it('keeps local time-window changes separate from frozen full-period evidence', async () => {
    const bundle = await getDashboard('morning_tail')
    for (const window of [14, 7]) for (const smooth of [1, 3]) {
      const h = bundle.hourly_views[`${window}_${smooth}`].hour_heatmap
      expect(h.cells).toHaveLength(144)
      expect(h.cells.filter((c) => c.status === 'insufficient_evidence')).toHaveLength(smooth === 1 ? 44 : 0)
      expect(h.cells.reduce((n, c) => n + c.monitoring_n, 0)).toBe((window === 14 ? 8400 : 4200) * smooth)
      expect(h.cells.reduce((n, c) => n + c.baseline_n, 0)).toBe(8400 * smooth)
    }
    expect(bundle.summary.zones.reduce((n, z) => n + z.n, 0)).toBe(8400)
    expect(bundle.summary.monitoring.days).toBe(14)
    expect(bundle.provenance.latest_dev_ref).toMatch(/^88890e4/)
    expect(bundle.provenance.stats_ref).toMatch(/^149cfbb/)
  })

  it('renders descriptive heatmap values and masks supplied unavailable cells', async () => {
    const { summary } = await getDashboard('morning_tail')
    const html = renderToStaticMarkup(<HourHeatmap data={summary.hour_heatmap} bandsByZone={summary.time_of_day_all_zones} selectedZone="D" selectedCell={{ zone_id: 'D', hour: 8 }} />)
    expect((html.match(/class="hour-cell/g) || [])).toHaveLength(144)
    expect(html).toContain('+22.5 pp')
    expect(html).toContain('Insufficient evidence')
    expect(html).toContain('Zone D, 06:00–10:00: supplied time-band signal.')
    expect((html.match(/tabindex="0"/g) || [])).toHaveLength(1)
    expect(cellTone({ status: 'insufficient_evidence', change_pts: 0 })).toBe(cellTone({ status: 'no_data', change_pts: null }))
    expect(cellTone({ status: 'ok', change_pts: 0 })).not.toBe(cellTone({ status: 'no_data', change_pts: null }))
    expect(cellTone({ status: 'ok', change_pts: 100 })).toBe(cellTone({ status: 'ok', change_pts: 25 }))
  })

  it('shows actionable row and field validation errors without substituting fixtures', () => {
    const html = renderToStaticMarkup(<LoadError error={{ message: 'Invalid completed incidents', errors: [{ row: 4, field: 'on_scene_at', reason: 'Must follow unit notification' }] }} />)
    expect(html).toContain('CSV row')
    expect(html).toContain('on_scene_at')
    expect(html).toContain('Must follow unit notification')
    expect(html).toContain('No preview data has been substituted')
    expect(html).toContain('Change data source')
  })

  it('never reports absent hourly/band service fields as zero signals', async () => {
    const { summary } = await getDashboard('normal')
    delete summary.time_of_day_all_zones
    const zone = renderToStaticMarkup(<ZoneOverview zones={summary.zones} selected="A" />)
    expect(zone).toContain('Bands: unavailable')
  })

  it('offers three direct explained scenario choices, never a zone-only dataset', () => {
    const html = renderToStaticMarkup(<ScenarioPicker scenario="recovery" onSelect={() => {}} />)
    expect(html).not.toContain('<select')
    expect((html.match(/class="scenario-choice"/g) || [])).toHaveLength(3)
    expect(html).toContain('All zones · C worsens, then recovers')
    expect(html).toContain('All zones · D morning delays')
    expect((html.match(/aria-pressed="true"/g) || [])).toHaveLength(1)
  })

  it('finds the nearest date throughout the plot including gaps and edge clamping', () => {
    expect(nearestDateIndex(44, 44, 540, 28)).toBe(0)
    expect(nearestDateIndex(54, 44, 540, 28)).toBe(1)
    expect(nearestDateIndex(314, 44, 540, 28)).toBe(14)
    expect(nearestDateIndex(-100, 44, 540, 28)).toBe(0)
    expect(nearestDateIndex(1000, 44, 540, 28)).toBe(27)
    expect(nearestDateIndex(12, 44, 0, 1)).toBe(0)
    expect(nearestDateIndex(12, 44, 500, 0)).toBeNull()
  })

  it('draws the clock from the same cells and H11 band evidence as the grid', async () => {
    const { summary } = await getDashboard('morning_tail')
    const html = renderToStaticMarkup(<HourHeatmap variant="clock" data={summary.hour_heatmap} bandsByZone={summary.time_of_day_all_zones} selectedZone="D" selectedCell={{ zone_id: 'D', hour: 8 }} />)
    expect(html).toContain('24-hour clock of late-rate changes by zone')
    expect((html.match(/class="hour-cell/g) || [])).toHaveLength(144)
    expect(html).toContain('Outer to inner')
    expect(html).toContain('Zone D, 06:00–10:00: supplied time-band signal.')
    expect(html).not.toContain('Zone C, 16:00–20:00: supplied time-band signal.')
    expect(html).toContain('+22.5 pp')
    expect(clockArc(0, 1, 30, 50, 100, 100)).toMatch(/^M100,50A50,50/)
    expect(clockArc(23, 24, 30, 50, 100, 100)).not.toMatch(/NaN|undefined/)
  })

  it('does not reassure when some pooled band evidence is unavailable', () => {
    expect(timeBandConclusion(null, 'A')).toBe('Time-band evidence unavailable.')
    expect(timeBandConclusion([{ status: 'no_data', flag: null }], 'A')).toContain('incomplete')
    expect(timeBandConclusion(Array.from({length:5}, () => ({ status: 'ok', flag: false })), 'A')).toContain('no upper-limit signals')
  })

  it('uses H11 pooled comparison limits for both time windows', async () => {
    const bundle = await getDashboard('morning_tail')
    for (const window of [14, 7]) {
      const all = bundle.hourly_views[`${window}_1`].time_of_day_all_zones
      const flags = Object.entries(all).flatMap(([zone, bands]) => bands.filter((b) => b.flag).map((b) => `${zone}:${b.band}`))
      expect(flags).toEqual(['D:morning_rush'])
      const band = all.D.find((b) => b.band === 'morning_rush')
      expect(band.z).toBeGreaterThan(3)
      expect(band.ucl).toBeGreaterThan(.28)
    }
  })

})
