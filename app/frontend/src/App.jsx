import React, { useEffect, useMemo, useState } from 'react'
import { createDataClient, SCENARIOS } from './api/client.js'
import { dateLabel, integer, minutes, percent, timeLabel, zoneType } from './format.js'
import { DailyPChart, BandChart, StageChart, stageShift, dailyPointStatus } from './Charts.jsx'
import { HourHeatmap } from './HourHeatmap.jsx'
import { initialFocus } from './focus.js'

function Icon({ name, size = 18 }) {
  const paths = {
    pulse: 'M2 12h4l3-8 5 16 3-8h5',
    info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    alert: 'm12 3 10 17H2L12 3zm0 6v5m0 3h.01',
    clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.info} /></svg>
}

export function StatusBadge({ value, kind = 'deterioration', status = 'ok', compact = false }) {
  const unavailable = { no_data: 'No data', insufficient_evidence: 'Not enough data', baseline_insufficient: 'Not enough baseline data' }
  if (value == null || (kind !== 'target' && status !== 'ok')) return <span className="badge unavailable">{unavailable[status] || 'Not available'}</span>
  const label = kind === 'target'
    ? value ? 'Above target' : 'Within target'
    : kind === 'band'
      ? value ? 'Worse than normal' : 'No new change'
      : value ? compact ? 'Signal' : 'Daily signal detected' : 'No daily signal'
  return <span className={`badge ${kind === 'target' ? value ? 'warning' : 'quiet' : value ? 'danger' : 'quiet'}`}>{value && <Icon name={kind === 'target' ? 'clock' : 'alert'} size={12} />}{label}</span>
}

export function ZoneOverview({ zones, bandsByZone = {}, selected, onSelect }) {
  const above = zones.filter((z) => z.above_service_target === true).length
  return <section className="panel zone-overview" aria-label="Zone overview">
    <div className="panel-heading"><div><h2>District overview</h2><span className="sample-note">Select a district · full monitoring period</span></div></div>
    <div className="table-scroll zone-table"><table><caption className="sr-only">Zone late rate, P90 and two independent change signals. Select a zone to inspect.</caption>
      <thead><tr><th>District</th><th className="numeric">Late calls</th><th>Attention</th></tr></thead>
      <tbody>{zones.map((z) => {
        const bands = Array.isArray(bandsByZone?.[z.zone_id]) ? bandsByZone[z.zone_id] : null
        const limited = bands?.some((b) => b.status !== 'ok' || b.flag == null)
        const flaggedBands = bands?.filter((b) => b.status === 'ok' && b.flag === true) || []
        const dailyChange = z.deterioration_flag === true
        const signal = dailyChange || flaggedBands.length > 0
        const unknown = z.deterioration_flag == null || z.above_service_target == null || !bands || bands.length < 5 || limited
        const changeLabel = signal ? 'Changed recently' : unknown ? 'Not enough data' : z.above_service_target ? 'Above target' : 'Within target'

        return <tr key={z.zone_id} className={selected === z.zone_id ? 'is-selected' : ''} onClick={() => onSelect(z.zone_id)}>
          <td><button className="zone-select" aria-pressed={selected === z.zone_id} aria-label={`Inspect zone ${z.zone_id}, ${zoneType(z.zone_type)}`} onClick={(event) => { event.stopPropagation(); onSelect(z.zone_id) }}><span className="zone-label"><span className="zone-letter">{z.zone_id}</span><span className="zone-profile">{zoneType(z.zone_type)}</span></span></button></td>
          <td className={`numeric ${z.above_service_target === true ? 'target-text' : ''}`}><span title={z.above_service_target == null ? 'Target status unavailable' : z.above_service_target ? 'Above service target' : 'Within service target'}>{percent(z.late_rate)}</span><span className="sr-only">{z.above_service_target == null ? 'Target status unavailable' : z.above_service_target ? 'Above service target' : 'Within service target'}</span></td>
          <td className="change-cell"><span className={signal ? 'signal-text' : z.above_service_target ? 'target-text' : ''}>{changeLabel}</span></td>
        </tr>
      })}</tbody></table></div>
    <div className="zone-footnote"><span>{above}/{zones.length} above target · target ≤10% late</span></div>
  </section>
}

export function SlowestTable({ incidents = [], showTimestamps = true, onSelectZone }) {
  if (!incidents.length) return <p className="empty-state">No completed incidents in this monitoring window.</p>
  return <div className="table-scroll"><table className={`incident-table ${showTimestamps ? 'show-timestamps' : ''}`}><caption className="sr-only">Five slowest completed responses, ordered by the statistics service and independent of zone flags.</caption>
    <thead><tr><th>Incident</th><th>Zone</th>{showTimestamps && <><th className="time-cell">Unit notified · ET</th><th className="time-cell">On scene · ET</th></>}<th className="numeric" title="Response time in minutes" aria-label="Response time in minutes">Time · min</th><th className="numeric" title="Minutes over the response target T" aria-label="Minutes over target T">Over · min</th></tr></thead>
    <tbody>{incidents.map((item) => <tr key={item.incident_id}><td>{onSelectZone ? <button className="incident-link" title={`Inspect zone ${item.zone_id}`} onClick={() => onSelectZone(item.zone_id)}>{item.incident_id}</button> : item.incident_id}</td><td>{item.zone_id}</td>{showTimestamps && <><td className="time-cell">{timeLabel(item.unit_notified_at)}</td><td className="time-cell">{timeLabel(item.on_scene_at)}</td></>}<td className="numeric">{showTimestamps ? minutes(item.response_min) : Number.isFinite(item.response_min) ? item.response_min.toFixed(1) : '—'}</td><td className="numeric over-time">{showTimestamps ? minutes(item.minutes_over_target) : Number.isFinite(item.minutes_over_target) ? `+${item.minutes_over_target.toFixed(1)}` : '—'}</td></tr>)}</tbody>
  </table></div>
}

export function dailyEvidenceLabel(point) {
  return dailyPointStatus(point)
}

export function DailyData({ points }) {
  return <div className="table-scroll daily-data"><table><caption className="sr-only">Daily cohort statistics, percentages formatted from supplied values</caption><thead><tr><th>Date</th><th>Phase</th><th>Calls</th><th>Late calls</th><th>Late rate</th><th>Baseline rate</th><th>Usual high</th><th>Usual low</th><th>Evidence</th></tr></thead><tbody>{points.map((p) => <tr key={p.date}><td>{dateLabel(p.date)}</td><td>{p.phase}</td><td>{integer(p.n)}</td><td>{integer(p.late)}</td><td>{percent(p.p)}</td><td>{percent(p.cl)}</td><td>{percent(p.ucl)}</td><td>{percent(p.lcl)}</td><td>{dailyEvidenceLabel(p)}</td></tr>)}</tbody></table></div>
}

function TimeBands({ analysis, showData }) {
  return <div className="band-content">{showData ? <div className="table-scroll band-data"><table><caption className="sr-only">Five pooled time-band comparisons for selected zone</caption><thead><tr><th>Local time band</th><th>Calls: before / now</th><th>Baseline</th><th>Monitoring</th><th>Usual high</th><th>Evidence</th></tr></thead><tbody>{analysis.time_of_day.bands.map((b) => <tr key={b.band}><td>{b.label}<small>{b.interval_local}</small></td><td>{b.baseline_n} / {b.n_band}</td><td>{percent(b.p0_band)}</td><td>{percent(b.p_band)}</td><td>{percent(b.ucl)}</td><td><StatusBadge kind="band" value={b.flag} status={b.status} compact /></td></tr>)}</tbody></table></div> : <><div className="chart-legend"><span><i className="legend-square neutral" />Baseline</span><span><i className="legend-square observation" />Monitoring</span><span><i className="legend-square flagged" />Worse than normal</span><span><i className="legend-line limit" />Usual high</span></div><div className="band-chart-area"><BandChart bands={analysis.time_of_day.bands} /></div></>}<p className="analysis-caption">Compare late calls before and now in five time bands. Red marks worse-than-usual periods; with 30 comparisons, some changes can occur by chance.</p></div>
}

export function largestStageShift(stages = []) {
  return stages.flatMap((stage) => [['median', 'median'], ['p90', '90% within']].map(([measure, label]) => ({ stage, measure, label, delta: stageShift(stage, measure) }))).filter((item) => item.delta != null).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null
}

export function StageEvidence({ stages = [], showData = false }) {
  const top = largestStageShift(stages)
  const readout = !top ? 'Stage durations unavailable.' : top.delta === 0 ? 'No stage changed by 0.1 min or more.' : <>Largest shift: <b>{top.stage.label} {top.label}</b> {top.stage[`baseline_${top.measure}_min`].toFixed(1)} → {top.stage[`monitoring_${top.measure}_min`].toFixed(1)} min <b className={top.delta > 0 ? 'signal-text' : ''}>({top.delta > 0 ? '+' : '−'}{Math.abs(top.delta).toFixed(1)})</b></>
  return <div className="stage-content"><div className="stage-intro"><h3>Which response stage changed?</h3><p>{readout}</p></div>{showData ? <StageTable stages={stages} /> : <><div className="chart-legend stage-legend"><span><i className="legend-dot baseline" />Baseline</span><span><i className="legend-dot monitoring" />Monitoring</span><span><i className="legend-shift longer" />Longer</span><span><i className="legend-shift shorter" />Shorter</span><span>Minutes · shared scale</span></div><div className="stage-chart-area"><StageChart stages={stages} /></div></>}<p className="analysis-caption">Grey = first 14 days; teal = monitoring. Typical is the middle call; “90% within” includes nine of ten calls. Stage times cannot be added. Longer stages suggest where to investigate, not a proven cause.</p></div>
}

export function StageTable({ stages = [] }) {
  const spans = { call_handling: 'Before the response clock', turnout: 'Notified → en route', travel: 'En route → on scene' }
  return <div className="table-scroll stage-data"><table className="stage-table"><caption className="sr-only">Separate stage medians and P90s, in minutes</caption><thead><tr><th rowSpan="2">Response stage</th><th colSpan="2" className="numeric">Typical · min</th><th colSpan="2" className="numeric">90% within · min</th><th rowSpan="2" className="numeric">90% time change</th></tr><tr><th className="numeric">Baseline</th><th className="numeric">Monitoring</th><th className="numeric">Baseline</th><th className="numeric">Monitoring</th></tr></thead><tbody>{stages.map((stage) => {
    const delta = stageShift(stage, 'p90')
    return <tr key={stage.stage}><td><strong>{stage.label}</strong><small>{spans[stage.stage]}</small></td><td className="numeric">{Number.isFinite(stage.baseline_median_min) ? stage.baseline_median_min.toFixed(1) : '—'}</td><td className="numeric stage-current">{Number.isFinite(stage.monitoring_median_min) ? stage.monitoring_median_min.toFixed(1) : '—'}</td><td className="numeric">{Number.isFinite(stage.baseline_p90_min) ? stage.baseline_p90_min.toFixed(1) : '—'}</td><td className="numeric monitoring">{Number.isFinite(stage.monitoring_p90_min) ? stage.monitoring_p90_min.toFixed(1) : '—'}</td><td className={`numeric stage-delta ${delta > 0 ? 'longer' : delta < 0 ? 'shorter' : ''}`}>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}<small>min · descriptive</small></td></tr>
  })}</tbody></table></div>
}

export function ScenarioPicker({ scenario, uploaded, onSelect }) {
  return <div className="scenario-picker" role="group" aria-label="Scenario selection"><span className="sr-only">Each scenario contains all six districts.</span>{SCENARIOS.map((item) => <button key={item.id} className="scenario-choice" aria-pressed={!uploaded && scenario === item.id} onClick={() => onSelect(item.id)}><strong>{item.label}</strong><span>{item.description}</span></button>)}{uploaded && <span className="uploaded-indicator">Uploaded CSV selected</span>}</div>
}

export function timeBandConclusion(bands, zone) {
  if (!Array.isArray(bands) || !bands.length) return 'Time-band evidence unavailable.'
  if (bands.length !== 5 || bands.some((b) => b.status !== 'ok' || b.flag == null)) return `Zone ${zone}: time-band evidence is incomplete; inspect the band data before drawing conclusions.`
  return `Zone ${zone}: no upper-limit signals in the five pooled bands for this window.`
}

function SourcePanel({ config, onApply, onUpload, source, fileName, busy }) {
  const [mode, setMode] = useState(config.mode)
  const [baseUrl, setBaseUrl] = useState(config.baseUrl)
  return <div className="methods-panel"><div className="methods-grid">
    <article><h3>Connect the dataset</h3><form className="connection-form" onSubmit={(event) => { event.preventDefault(); onApply({ mode, baseUrl: baseUrl.trim() || '/api' }) }}><label>Data mode<select value={mode} onChange={(e) => setMode(e.target.value)}><option value="demo">Precomputed preview</option><option value="api">Backend API</option></select></label><label>API base URL<input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="/api" disabled={mode === 'demo'} /></label><button className="primary-button" disabled={busy}>Apply and reload</button></form><p>API mode loads the selected scenario from the backend. Failed requests stay visible; preview data is never substituted.</p>
    {config.mode === 'api' && <label className="upload-control">Upload completed incidents<input type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files[0]; if (file) onUpload(file); e.target.value = '' }} disabled={busy} /></label>}
    {fileName && <p>Uploaded: <b>{fileName}</b></p>}</article>
    <article><h3>What the evidence means</h3><p><b>Above service target:</b> more than 10% of monitoring calls were late. <b>Daily signal:</b> a day was worse than the usual range estimated from the first 14 days. <b>Band signal:</b> a time band was worse than usual, allowing for uncertainty in both periods. These are separate questions.</p><p>Time-of-day views are exploratory, with 30 unadjusted band comparisons. Chance flags can occur. Hourly colors describe differences; they are not statistical alarms. Grey cells have missing or insufficient evidence.</p><p>Severe individual delays remain visible even when daily p charts show no signals. No chart establishes a cause or staff fault.</p></article>
    <article><h3>Scope and source</h3><p>Response time runs from unit notified to on scene; call handling happens before it. Late means more than 12 minutes. The target is at most 10% late. These are demo settings, not clinical standards. The first 14 days form the frozen baseline; all later days are monitoring (14 days in the built-in scenarios).</p><p>Each scenario contains all six districts. Dataset 1 is the reference month; Dataset 2 slows C then restores it; Dataset 3 adds severe travel delays in D at 06:00–10:00. Zones A/B are downtown, C/D residential, E/F outer. Complete, high-priority incidents only. No live dispatch feed.</p><p>{config.mode === 'demo' ? <>Precomputed from dev <code>{source?.latest_dev_ref?.slice(0, 7)}</code> · data <code>{source?.data_ref?.slice(0, 7)}</code> · statistics <code>{source?.stats_ref?.slice(0, 7)}</code>.</> : <>Responses supplied by <code>{config.baseUrl}</code>. Data revision: <code>{source?.data_ref?.slice(0, 7) || 'not supplied'}</code> · statistics: <code>{source?.stats_ref?.slice(0, 7) || 'not supplied'}</code>.</>}</p></article>
  </div></div>
}

function WhereWhen({ analysis, client, bundle, selectedZone, onSelectZone, windowDays, setWindowDays }) {
  const [smooth, setSmooth] = useState(1)
  const [display, setDisplay] = useState('hourly')
  const [hourly, setHourly] = useState(null)
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  const [selectedCell, setSelectedCell] = useState({ zone_id: selectedZone, hour: 8 })
  const [showData, setShowData] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setHourly(null); setError(null)
    client.getHourlyView(bundle, { windowDays, smooth, signal: controller.signal }).then((value) => { if (active) setHourly(value) }).catch((err) => { if (active && err.code !== 'ABORTED') setError(err) })
    return () => { active = false; controller.abort() }
  }, [client, bundle, windowDays, smooth, retry])
  const bandGroup = hourly?.time_of_day_all_zones?.[selectedZone]
  const bands = Array.isArray(bandGroup) ? bandGroup : null
  const rangeStart = windowDays === 14 ? bundle.summary.monitoring.start : (() => { const d = new Date(`${bundle.summary.monitoring.end}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 6); return [bundle.summary.monitoring.start, d.toISOString().slice(0, 10)].sort().at(-1) })()
  const bandFocus = bands?.filter((b) => b.status === 'ok' && b.flag === true).sort((a, b) => (b.p_band - b.p0_band) - (a.p_band - a.p0_band))[0]
  return <div className="where-content">
    <div className="where-toolbar"><div className="segmented" aria-label="Time-of-day display"><button aria-pressed={display === 'hourly'} onClick={() => { setDisplay('hourly'); setShowData(false) }}>Hourly pattern</button><button aria-pressed={display === 'clock'} onClick={() => { setDisplay('clock'); setShowData(false) }}>24-hour clock</button><button aria-pressed={display === 'bands'} onClick={() => setDisplay('bands')}>Band comparison</button></div><div className="time-controls"><label>Window<select aria-label="Time-of-day window" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}><option value="14">Full period ({bundle.summary.monitoring.days}d)</option><option value="7">Latest 7</option></select></label>{display !== 'bands' && <label>Hours<select aria-label="Hourly aggregation" value={smooth} onChange={(e) => setSmooth(Number(e.target.value))}><option value="1">Each hour</option><option value="3">3-hour groups</option></select></label>}{display === 'bands' && <button className="text-button" onClick={() => setShowData(!showData)}>{showData ? 'Show chart' : 'View data'}</button>}</div></div>
    <p className="time-scope">{dateLabel(rangeStart)}–{dateLabel(bundle.summary.monitoring.end)} · time-of-day views only · baseline unchanged{smooth === 3 && display !== 'bands' ? ' · circular 3-hour pooling' : ''}</p>
    {error ? <div className="inline-error" role="alert"><b>Time-of-day evidence could not be loaded.</b><p>{error.message}</p><button className="text-button" onClick={() => setRetry(retry + 1)}>Retry time-of-day view</button></div> : !hourly ? <p className="empty-state" role="status">Loading time-of-day evidence…</p> : display !== 'bands' ? hourly.hour_heatmap?.cells?.length ? <HourHeatmap variant={display === 'clock' ? 'clock' : 'grid'} data={hourly.hour_heatmap} bandsByZone={hourly.time_of_day_all_zones || {}} selectedZone={selectedZone} onSelectZone={onSelectZone} selectedCell={{ ...selectedCell, zone_id: selectedZone }} onSelectCell={(cell) => { setSelectedCell(cell); onSelectZone(cell.zone_id) }} /> : <p className="empty-state">Hourly evidence is unavailable from this data source. Daily and stage evidence remain available.</p> : bands ? <TimeBands analysis={{ ...analysis, time_of_day: { ...analysis.time_of_day, bands } }} showData={showData} /> : <p className="empty-state">Time-band evidence is unavailable from this data source.</p>}
    {hourly && <p className="where-conclusion">{bandFocus ? <><strong>Zone {selectedZone} · {bandFocus.label}:</strong> {percent(bandFocus.p_band)} late vs {percent(bandFocus.p0_band)} in the first 14 days. <span className="signal-text">Worse than usual in this time band.</span></> : timeBandConclusion(bands, selectedZone)} <span>Blue = fewer late calls; red = more. Black outlines mark a time band worse than usual.</span></p>}
  </div>
}

export function managerMessage(analysis, bands) {
  const z = analysis.summary
  const fullPeriod = `${dateLabel(analysis.monitoring.start)}–${dateLabel(analysis.monitoring.end)}`
  if (z.deterioration_flag === true) return {
    tone: 'danger', title: 'Response times worsened', value: String(z.deterioration_days), unit: 'days worse than usual',
    comparison: `${dateLabel(z.first_flag_date)}–${dateLabel(z.last_flag_date)} · compared with this zone’s first 14 days`,
    action: 'Review the affected dates, then compare travel and turnout times.', view: 'daily', scope: fullPeriod,
  }
  const band = bands?.filter(b => b.flag === true && b.status === 'ok').sort((a,b) => (b.p_band-b.p0_band)-(a.p_band-a.p0_band))[0]
  if (band) return {
    tone: 'danger', title: `${band.label} needs attention`, value: percent(band.p_band), unit: 'calls arrived late in this time band',
    comparison: `Previously ${percent(band.p0_band)} · first 14 days`,
    action: 'Review coverage and travel delays during this time band. Daily totals can hide the change.', view: 'where', band: true,
  }
  if (z.deterioration_flag == null || z.above_service_target == null || !bands || bands.length < 5 || bands.some(b => b.status !== 'ok' || b.flag == null)) return {
    tone: 'neutral', title: 'Not enough data to assess change', value: '—', unit: 'assessment incomplete',
    comparison: 'Some daily or time-band comparisons are unavailable.', action: 'Check data coverage before drawing a conclusion.', view: 'where', scope: fullPeriod,
  }
  return z.above_service_target === true ? {
    tone: 'warning', title: 'Consistently slow; no new deterioration detected', value: percent(z.late_rate), unit: 'calls arrived late · full period',
    comparison: `Target: at most ${percent(analysis.settings.q)} · previously ${percent(z.p0)}`,
    action: 'Review district coverage and station access; compare the response stages.', view: 'stages', scope: fullPeriod,
  } : {
    tone: 'quiet', title: 'No deterioration detected; target met', value: percent(z.late_rate), unit: 'calls arrived late · full period',
    comparison: `Target: at most ${percent(analysis.settings.q)} · previously ${percent(z.p0)}`,
    action: 'Continue monitoring. A stable rate does not rule out individual long waits.', view: 'daily', scope: fullPeriod,
  }
}

export function briefingAnswer(analysis, bands, question = 'changed') {
  const message = managerMessage(analysis, bands)
  const z = analysis.summary
  if (question === 'limits') return {
    text: message.tone === 'neutral' ? 'Some comparisons lack enough data. We cannot assess change reliably until coverage improves.' : 'These patterns do not prove a cause. We cannot tell whether traffic, staffing or dispatch decisions caused the delays; stable averages can still hide individual long waits.',
    link: 'Inspect supporting data', view: message.view,
  }
  if (question === 'check') return { text: message.action, link: message.view === 'stages' ? 'Compare response stages' : message.view === 'where' ? 'Inspect the time pattern' : 'Review the daily pattern', view: message.view }
  if (message.tone === 'neutral') return { text: message.comparison, link: 'Review available evidence', view: 'where' }
  if (z.deterioration_flag === true) return {
    text: `${z.deterioration_days} days were worse than this district’s usual range (${dateLabel(z.first_flag_date)}–${dateLabel(z.last_flag_date)}). Across the full monitoring period, ${percent(z.late_rate)} of calls were late, compared with ${percent(z.p0)} previously.`,
    link: 'See the affected days', view: 'daily',
  }
  const band = bands?.filter(b => b.flag === true && b.status === 'ok').sort((a,b) => (b.p_band-b.p0_band)-(a.p_band-a.p0_band))[0]
  if (band) return {
    text: `During ${band.interval_local}, ${percent(band.p_band)} of calls were late, compared with ${percent(band.p0_band)} in the first 14 days. Daily totals hide this time-specific change.`,
    link: 'See when delays increased', view: 'where',
  }
  return {
    text: z.above_service_target ? `${percent(z.late_rate)} of calls were late, compared with ${percent(z.p0)} previously. The service gap persists, but no new deterioration was detected; the data does not identify its cause.` : `${percent(z.late_rate)} of calls were late, within the ${percent(analysis.settings.q)} target. No new deterioration was detected in the available daily or time-band comparisons.`,
    link: z.above_service_target ? 'Compare response stages' : 'Review daily performance', view: message.view,
  }
}

export function ManagerInsight({ analysis, bundle, client, windowDays, onViewChange }) {
  const [question, setQuestion] = useState('changed')
  const [state, setState] = useState({ data: null, error: false })
  useEffect(() => {
    const controller = new AbortController()
    setState({ data: null, error: false })
    if (windowDays !== 14) client.getHourlyView(bundle, { windowDays, smooth: 1, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ data, error: false }) })
      .catch(() => { if (!controller.signal.aborted) setState({ data: null, error: true }) })
    return () => controller.abort()
  }, [bundle, client, windowDays])
  const id = analysis.summary.zone_id
  const bands = windowDays === 14 ? bundle.summary.time_of_day_all_zones?.[id] : state.data?.time_of_day_all_zones?.[id]
  const message = managerMessage(analysis, bands)
  const answer = briefingAnswer(analysis, bands, question)
  const title = message.tone === 'warning' ? 'Persistent service gap' : message.tone === 'quiet' ? 'Stable and within target' : message.title
  const loading = windowDays !== 14 && !state.data && !state.error
  const scope = message.band ? (windowDays === 7 ? 'Latest 7 monitoring days' : `${dateLabel(analysis.monitoring.start)}–${dateLabel(analysis.monitoring.end)}`) : message.scope
  return <section className={`panel outlier-panel insight-panel insight-${message.tone}`} aria-label="Response briefing">
    <div className="insight-heading"><h2>Response briefing</h2><span>Zone {id}</span></div>
    {loading ? <p className="insight-loading" role="status">Updating the briefing…</p> : <div className="insight-content">
      <h3>{title}</h3>
      <div className="briefing-questions" role="group" aria-label="Briefing questions">{[['changed', 'What changed?'], ['check', 'What to check?'], ['limits', 'Limits']].map(([key, label]) => <button key={key} aria-pressed={question === key} onClick={() => setQuestion(key)}>{label}</button>)}</div>
      <p className="briefing-answer" aria-live="polite">{answer.text}</p>
      <button className="insight-action" onClick={() => onViewChange(answer.view)}>{answer.link}<span aria-hidden="true"> ↗</span></button>
      <p className="insight-scope">{scope} · completed calls{windowDays === 7 && !message.band ? ' · time-band view: latest 7 days' : ''}<br />Based on validated statistics</p>
    </div>}
  </section>
}

export const analysisTabs = [['daily', 'Daily p chart'], ['where', 'Where & when'], ['stages', 'Why']]
function AnalysisPanel({ analysis, bundle, client, windowDays, setWindowDays, view, onViewChange, showMethods, onCloseMethods, selectedDate, onSelectDate, onSelectZone, sourceProps }) {
  const [showData, setShowData] = useState(false)
  const zone = analysis.summary
  const point = analysis.daily_p_chart.points.find((p) => p.date === selectedDate) || analysis.daily_p_chart.points.at(-1)
  function selectView(id) { setShowData(false); onViewChange(id) }
  function navigateTabs(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const current = analysisTabs.findIndex(([id]) => id === view)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? analysisTabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + analysisTabs.length) % analysisTabs.length
    selectView(analysisTabs[next][0]); event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus()
  }
  return <section className="panel analysis-panel" aria-label={`Zone ${zone.zone_id} analysis`}>
    <div className="analysis-heading"><div><h2>{showMethods ? 'Data source & interpretation' : <>Zone {zone.zone_id} <span className="heading-profile">/ {zoneType(zone.zone_type)}</span></>}</h2><span className="sample-note">{showMethods ? 'Connection, scope and statistical limits' : `${integer(zone.n)} monitoring incidents · ${integer(zone.baseline_n)} baseline`}</span></div><div className="zone-context">{showMethods ? <button className="text-button" onClick={onCloseMethods}>Back to evidence</button> : <><StatusBadge kind="target" value={zone.above_service_target} /><span>90% arrive within <b>{minutes(zone.p90_min)}</b></span></>}</div></div>
    {showMethods ? <SourcePanel {...sourceProps} source={bundle.provenance} /> : <>
      <div className="analysis-tabs" role="tablist" aria-label="Selected-zone analysis">{analysisTabs.map(([id, label]) => <button key={id} id={`tab-${id}`} role="tab" tabIndex={view === id ? 0 : -1} aria-selected={view === id} aria-controls={`analysis-${id}`} className="analysis-tab" onClick={() => selectView(id)} onKeyDown={navigateTabs}>{label}</button>)}{view !== 'where' && <button className="text-button data-toggle" onClick={() => setShowData(!showData)} aria-expanded={showData}>{showData ? 'Show chart' : view === 'daily' ? 'View daily data' : 'View stage data'}</button>}</div>
      <div className="analysis-body" id={`analysis-${view}`} role="tabpanel" tabIndex={0} aria-labelledby={`tab-${view}`}>
        {view === 'daily' ? <div className="daily-content"><div className="chart-legend"><span><i className="legend-line observation" />Daily late rate</span><span><i className="legend-line baseline" />Baseline {percent(zone.p0)}</span><span><i className="legend-line limit" />Usual range</span><span><i className="legend-line target" />Target {percent(analysis.settings.q)}</span><span><i className="legend-triangle" />Worse than normal</span></div>{showData ? <DailyData points={analysis.daily_p_chart.points} /> : <div className="daily-chart-area"><DailyPChart chart={analysis.daily_p_chart} q={analysis.settings.q} selectedDate={point?.date} onSelectDate={onSelectDate} /></div>}<div className="chart-readout" aria-live="polite">{point ? <><strong>{dateLabel(point.date)}</strong><span>{point.phase === 'baseline' ? 'Baseline' : 'Monitoring'}</span><span>{integer(point.late)} / {integer(point.n)} late</span><b>{percent(point.p)}</b><span className={point.deterioration_flag ? 'signal-text' : ''}>{dailyEvidenceLabel(point)}</span></> : 'No completed daily cohorts.'}</div></div> : view === 'where' ? <WhereWhen windowDays={windowDays} setWindowDays={setWindowDays} analysis={analysis} client={client} bundle={bundle} selectedZone={zone.zone_id} onSelectZone={onSelectZone} /> : <StageEvidence stages={analysis.stages} showData={showData} />}
      </div>
      {view === 'daily' && <p className="analysis-caption chart-explainer">Teal = this zone’s normal late rate from its first 14 days. Dashed lines = usual daily range. Red triangle = worse than normal. Dotted line = target: at most {percent(analysis.settings.q)} late.</p>}
      {view === 'daily' && <p className="analysis-caption">{zone.deterioration_flag === true ? <><span className="signal-text">{zone.deterioration_days} days worse than normal · {dateLabel(zone.first_flag_date)}–{dateLabel(zone.last_flag_date)}.</span> Check later days to see whether performance returned to usual.</> : zone.deterioration_flag === false ? 'No days worse than usual. Check time-of-day patterns and individual long calls too.' : 'Daily evidence unavailable; do not interpret this as normal.'}</p>}
    </>}
  </section>
}

export function LoadError({ error, onRetry, onSource }) {
  return <section className="panel error-panel" role="alert"><h2>Dataset could not be loaded</h2><p>{error.message}</p>{error.errors?.length > 0 && <div className="table-scroll validation-errors"><table><thead><tr><th>CSV row</th><th>Field</th><th>What to fix</th></tr></thead><tbody>{error.errors.map((item, i) => <tr key={i}><td>{item.row ?? '—'}</td><td>{item.field || '—'}</td><td>{item.reason}</td></tr>)}</tbody></table></div>}<div className="error-actions"><button className="primary-button" onClick={onRetry}>Retry loading</button><button className="text-button" onClick={onSource}>Change data source</button></div><p>API errors are shown directly. No preview data has been substituted.</p></section>
}

const initialConfig = { mode: import.meta.env.VITE_DATA_SOURCE === 'api' ? 'api' : 'demo', baseUrl: import.meta.env.VITE_API_BASE || '/api' }
export default function App() {
  const [scenario, setScenario] = useState('morning_tail')
  const [config, setConfig] = useState(initialConfig)
  const [file, setFile] = useState(null)
  const [bundle, setBundle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  const [selectedZone, setSelectedZone] = useState('D')
  const [view, setView] = useState('where')
  const [selectedDate, setSelectedDate] = useState('2026-10-11')
  const [showMethods, setShowMethods] = useState(false)
  const [windowDays, setWindowDays] = useState(14)
  const client = useMemo(() => createDataClient(config), [config])
  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setLoading(true); setError(null); setBundle(null)
    const operation = file ? client.uploadCsv(file, { signal: controller.signal }) : client.loadScenario(scenario, { signal: controller.signal })
    operation.then((value) => { if (current) { const focus = initialFocus(value.summary); setBundle(value); setWindowDays(14); setSelectedZone(focus.zone); setView(focus.view); setShowMethods(false); setLoading(false) } }).catch((err) => { if (current && err.code !== 'ABORTED') { setError(err); setShowMethods(false); setLoading(false) } })
    return () => { current = false; controller.abort() }
  }, [client, scenario, file, retry])
  const summary = bundle?.summary
  const analysis = bundle?.analyses[selectedZone]
  function selectZone(id) { setSelectedZone(id); setShowMethods(false) }
  function applyConfig(next) { setFile(null); setConfig(next) }
  const sourceProps = { config, onApply: applyConfig, onUpload: setFile, fileName: file?.name, busy: loading }
  return <div className="dashboard-shell">
    <a className="skip-link" href="#workspace">Skip to dashboard</a>
    <header className="appbar"><a className="wordmark" href="#workspace" aria-label="ResponseWatch dashboard"><span className="brand-symbol"><Icon name="pulse" size={23} /></span><span>Response<span className="brand-secondary">Watch</span></span></a><ScenarioPicker scenario={scenario} uploaded={Boolean(file)} onSelect={(id) => { setFile(null); setScenario(id); setRetry(retry + 1) }} /><span className="date-range">{summary ? `${dateLabel(summary.monitoring.start)} – ${dateLabel(summary.monitoring.end)}, ${summary.monitoring.end.slice(0, 4)}` : 'Historical monitoring'}<small>Monitoring · New York time</small></span><button className="source-button" aria-expanded={showMethods} onClick={() => setShowMethods(!showMethods)}>{config.mode === 'demo' ? 'Preview data' : 'API data'}<Icon name="info" size={15} /></button></header>
    <main id="workspace" className="workspace" tabIndex={-1} aria-busy={loading}>
      <h1 className="sr-only">Response quality</h1>
      {error ? showMethods ? <section className="panel error-panel source-error"><div className="panel-heading"><h2>Data source & interpretation</h2><button className="text-button" onClick={() => setShowMethods(false)}>Back to error</button></div><SourcePanel {...sourceProps} /></section> : <LoadError error={error} onRetry={() => setRetry(retry + 1)} onSource={() => setShowMethods(true)} /> : !bundle ? <div className="loading-layout" role="status">Loading {config.mode === 'api' ? 'from the statistics service' : 'precomputed evidence'}…</div> : <>
        <ZoneOverview zones={summary.zones} bandsByZone={summary.time_of_day_all_zones} selected={selectedZone} onSelect={selectZone} />
        <AnalysisPanel analysis={analysis} bundle={bundle} client={client} windowDays={windowDays} setWindowDays={setWindowDays} view={view} onViewChange={setView} showMethods={showMethods} onCloseMethods={() => setShowMethods(false)} selectedDate={selectedDate} onSelectDate={setSelectedDate} onSelectZone={selectZone} sourceProps={sourceProps} />
        <ManagerInsight key={`${bundle.datasetId || summary.dataset_id}-${selectedZone}`} analysis={analysis} bundle={bundle} client={client} windowDays={windowDays} onViewChange={setView} />
      </>}
    </main>
    <footer className="statusbar"><span>{file ? `CSV: ${file.name}` : 'Synthetic, historical incidents'} · {config.mode === 'demo' ? 'precomputed preview' : 'backend statistics'} · not a live dispatch feed</span><span>Late = response &gt; {summary?.settings.T_min ?? 12} min · target ≤ {percent(summary?.settings.q ?? .1)} late · demo settings</span></footer>
  </div>
}
