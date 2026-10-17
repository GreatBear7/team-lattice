import React, { useEffect, useMemo, useState } from 'react'
import { createDataClient, SCENARIOS } from './api/client.js'
import { dateLabel, integer, minutes, percent, timeLabel, zoneType } from './format.js'
import { DailyPChart, BandChart, StageChart, stageShift } from './Charts.jsx'
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
  const unavailable = { no_data: 'No data', insufficient_evidence: 'Insufficient evidence', baseline_insufficient: 'Baseline insufficient' }
  if (value == null || (kind !== 'target' && status !== 'ok')) return <span className="badge unavailable">{unavailable[status] || 'Not available'}</span>
  const label = kind === 'target'
    ? value ? 'Above target' : 'Within target'
    : kind === 'band'
      ? value ? 'Above band UCL' : 'No band signal'
      : value ? compact ? 'Signal' : 'Daily signal detected' : 'No daily signal'
  return <span className={`badge ${kind === 'target' ? value ? 'warning' : 'quiet' : value ? 'danger' : 'quiet'}`}>{value && <Icon name={kind === 'target' ? 'clock' : 'alert'} size={12} />}{label}</span>
}

export function ZoneOverview({ zones, bandsByZone = {}, selected, onSelect }) {
  const above = zones.filter((z) => z.above_service_target === true).length
  return <section className="panel zone-overview" aria-label="Zone overview">
    <div className="panel-heading"><div><h2>Six response districts</h2><span className="sample-note">Full monitoring window · P90 in minutes</span></div></div>
    <div className="table-scroll zone-table"><table><caption className="sr-only">Zone late rate, P90 and two independent change signals. Select a zone to inspect.</caption>
      <thead><tr><th>Zone</th><th className="numeric">Late</th><th className="numeric">P90</th><th>Change</th></tr></thead>
      <tbody>{zones.map((z) => {
        const bands = Array.isArray(bandsByZone?.[z.zone_id]) ? bandsByZone[z.zone_id] : null
        const limited = bands?.some((b) => b.status !== 'ok' || b.flag == null)
        const flagged = bands?.filter((b) => b.status === 'ok' && b.flag === true).length
        return <tr key={z.zone_id} className={selected === z.zone_id ? 'is-selected' : ''} onClick={() => onSelect(z.zone_id)}>
          <td><button className="zone-select" aria-pressed={selected === z.zone_id} aria-label={`Inspect zone ${z.zone_id}, ${zoneType(z.zone_type)}`} onClick={(event) => { event.stopPropagation(); onSelect(z.zone_id) }}><span className="zone-label"><span className="zone-letter">{z.zone_id}</span><span className="zone-profile">{zoneType(z.zone_type)}</span></span></button></td>
          <td className={`numeric ${z.above_service_target === true ? 'target-text' : ''}`}><span title={z.above_service_target == null ? 'Target status unavailable' : z.above_service_target ? 'Above service target' : 'Within service target'}>{percent(z.late_rate)}</span><span className="sr-only">{z.above_service_target == null ? 'Target status unavailable' : z.above_service_target ? 'Above service target' : 'Within service target'}</span></td>
          <td className="numeric">{Number.isFinite(z.p90_min) ? z.p90_min.toFixed(1) : '—'}{z.p90_warning && <span title="Small sample, unstable P90">*</span>}</td>
          <td className="change-cell"><span className={z.deterioration_flag === true ? 'signal-text' : ''}>{z.deterioration_flag == null ? 'Daily: unavailable' : z.deterioration_flag ? `${z.deterioration_days} daily` : 'No daily'}</span><small className={flagged ? 'signal-text' : ''}>{bands ? `${flagged} band${flagged === 1 ? '' : 's'}${limited ? ' · limited' : ''}` : 'Bands: unavailable'}</small></td>
        </tr>
      })}</tbody></table></div>
    <div className="zone-footnote"><b>{above}/{zones.length} zones above service target</b><span>Amber: above q. Change: versus own baseline.</span></div>
  </section>
}

export function SlowestTable({ incidents = [], showTimestamps = true, onSelectZone }) {
  if (!incidents.length) return <p className="empty-state">No completed incidents in this monitoring window.</p>
  return <div className="table-scroll"><table className={`incident-table ${showTimestamps ? 'show-timestamps' : ''}`}><caption className="sr-only">Five slowest completed responses, ordered by the statistics service and independent of zone flags.</caption>
    <thead><tr><th>Incident</th><th>Zone</th>{showTimestamps && <><th className="time-cell">Unit notified · ET</th><th className="time-cell">On scene · ET</th></>}<th className="numeric">Response · min</th><th className="numeric">Over T · min</th></tr></thead>
    <tbody>{incidents.map((item) => <tr key={item.incident_id}><td>{onSelectZone ? <button className="incident-link" title={`Inspect zone ${item.zone_id}`} onClick={() => onSelectZone(item.zone_id)}>{item.incident_id}</button> : item.incident_id}</td><td>{item.zone_id}</td>{showTimestamps && <><td className="time-cell">{timeLabel(item.unit_notified_at)}</td><td className="time-cell">{timeLabel(item.on_scene_at)}</td></>}<td className="numeric">{showTimestamps ? minutes(item.response_min) : Number.isFinite(item.response_min) ? item.response_min.toFixed(1) : '—'}</td><td className="numeric over-time">{showTimestamps ? minutes(item.minutes_over_target) : Number.isFinite(item.minutes_over_target) ? `+${item.minutes_over_target.toFixed(1)}` : '—'}</td></tr>)}</tbody>
  </table></div>
}

export function dailyEvidenceLabel(point) {
  if (point.phase === 'baseline') return 'Baseline observation'
  if (point.status === 'no_data') return 'No data'
  if (point.status === 'baseline_insufficient') return 'Baseline insufficient'
  if (point.status !== 'ok' || point.deterioration_flag == null) return 'Evidence unavailable'
  return point.deterioration_flag === true ? 'Above UCL' : 'No upper-limit signal'
}

export function DailyData({ points }) {
  return <div className="table-scroll daily-data"><table><caption className="sr-only">Daily cohort statistics, percentages formatted from supplied values</caption><thead><tr><th>Date</th><th>Phase</th><th>n</th><th>Late</th><th>p</th><th>CL</th><th>UCL</th><th>LCL</th><th>Evidence</th></tr></thead><tbody>{points.map((p) => <tr key={p.date}><td>{dateLabel(p.date)}</td><td>{p.phase}</td><td>{integer(p.n)}</td><td>{integer(p.late)}</td><td>{percent(p.p)}</td><td>{percent(p.cl)}</td><td>{percent(p.ucl)}</td><td>{percent(p.lcl)}</td><td>{dailyEvidenceLabel(p)}</td></tr>)}</tbody></table></div>
}

function TimeBands({ analysis, showData }) {
  return <div className="band-content">{showData ? <div className="table-scroll band-data"><table><caption className="sr-only">Five pooled time-band comparisons for selected zone</caption><thead><tr><th>Local time band</th><th>n₀ / n</th><th>Baseline</th><th>Monitoring</th><th>UCL</th><th>Evidence</th></tr></thead><tbody>{analysis.time_of_day.bands.map((b) => <tr key={b.band}><td>{b.label}<small>{b.interval_local}</small></td><td>{b.baseline_n} / {b.n_band}</td><td>{percent(b.p0_band)}</td><td>{percent(b.p_band)}</td><td>{percent(b.ucl)}</td><td><StatusBadge kind="band" value={b.flag} status={b.status} compact /></td></tr>)}</tbody></table></div> : <><div className="chart-legend"><span><i className="legend-square neutral" />Baseline</span><span><i className="legend-square observation" />Monitoring</span><span><i className="legend-square flagged" />Above band UCL</span><span><i className="legend-line limit" />Band UCL</span></div><div className="band-chart-area"><BandChart bands={analysis.time_of_day.bands} /></div></>}<p className="analysis-caption">Exploratory: 30 unadjusted comparisons across the city. Chance flags can occur.</p></div>
}

export function largestStageShift(stages = []) {
  return stages.flatMap((stage) => [['median', 'median'], ['p90', 'P90']].map(([measure, label]) => ({ stage, measure, label, delta: stageShift(stage, measure) }))).filter((item) => item.delta != null).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null
}

export function StageEvidence({ stages = [], showData = false }) {
  const top = largestStageShift(stages)
  const readout = !top ? 'Stage durations unavailable.' : top.delta === 0 ? 'No stage median or P90 moved by 0.1 min or more.' : <>Largest shift: <b>{top.stage.label} {top.label}</b> {top.stage[`baseline_${top.measure}_min`].toFixed(1)} → {top.stage[`monitoring_${top.measure}_min`].toFixed(1)} min <b className={top.delta > 0 ? 'signal-text' : ''}>({top.delta > 0 ? '+' : '−'}{Math.abs(top.delta).toFixed(1)})</b></>
  return <div className="stage-content"><div className="stage-intro"><h3>Which response stage changed?</h3><p>{readout}</p></div>{showData ? <StageTable stages={stages} /> : <><div className="chart-legend stage-legend"><span><i className="legend-dot baseline" />Baseline</span><span><i className="legend-dot monitoring" />Monitoring</span><span><i className="legend-shift longer" />Longer</span><span><i className="legend-shift shorter" />Shorter</span><span>Minutes · shared scale</span></div><div className="stage-chart-area"><StageChart stages={stages} /></div></>}<p className="analysis-caption">Call handling precedes R. Response R = turnout + travel. Stage medians do not add to a median total; changes are descriptive, not statistical signals. Changes use unrounded values; displayed durations are rounded. Durations do not establish a cause.</p></div>
}

export function StageTable({ stages = [] }) {
  const spans = { call_handling: 'Before the response clock', turnout: 'Notified → en route', travel: 'En route → on scene' }
  return <div className="table-scroll stage-data"><table className="stage-table"><caption className="sr-only">Separate stage medians and P90s, in minutes</caption><thead><tr><th rowSpan="2">Response stage</th><th colSpan="2" className="numeric">Median · min</th><th colSpan="2" className="numeric">P90 · min</th><th rowSpan="2" className="numeric">P90 change</th></tr><tr><th className="numeric">Baseline</th><th className="numeric">Monitoring</th><th className="numeric">Baseline</th><th className="numeric">Monitoring</th></tr></thead><tbody>{stages.map((stage) => {
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
    <article><h3>What the evidence means</h3><p><b>Above service target:</b> monitoring late rate exceeds q. <b>Daily signal:</b> a day exceeds its frozen-baseline UCL. <b>Band signal:</b> a pooled two-proportion comparison exceeds its upper limit (z &gt; 3), including baseline sampling uncertainty. These are separate questions.</p><p>Time-of-day views are exploratory, with 30 unadjusted band comparisons. Chance flags can occur. Hourly colors describe differences; they are not statistical alarms. Grey cells have missing or insufficient evidence.</p><p>Severe individual delays remain visible even when daily p charts show no signals. No chart establishes a cause or staff fault.</p></article>
    <article><h3>Scope and source</h3><p>R runs from unit notified to on scene; call handling precedes R. Late means R &gt; 12 minutes. Allowed late rate q = 10%. These are demo settings, not clinical standards. The first 14 days form the frozen baseline; all later days are monitoring (14 days in the built-in scenarios).</p><p>Each scenario contains all six districts. Normal is the reference scenario; Recovery changes C then restores it; Morning tail adds concentrated severe travel delays in D at 06:00–10:00. Zones A/B are downtown, C/D residential, E/F outer. Complete, high-priority incidents only. No live dispatch feed.</p><p>{config.mode === 'demo' ? <>Precomputed from dev <code>{source?.latest_dev_ref?.slice(0, 7)}</code> · data <code>{source?.data_ref?.slice(0, 7)}</code> · statistics <code>{source?.stats_ref?.slice(0, 7)}</code>.</> : <>Responses supplied by <code>{config.baseUrl}</code>. Data revision: <code>{source?.data_ref?.slice(0, 7) || 'not supplied'}</code> · statistics: <code>{source?.stats_ref?.slice(0, 7) || 'not supplied'}</code>.</>}</p></article>
  </div></div>
}

function WhereWhen({ analysis, client, bundle, selectedZone, onSelectZone }) {
  const [windowDays, setWindowDays] = useState(14)
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
    <div className="where-toolbar"><div className="segmented" aria-label="Time-of-day display"><button aria-pressed={display === 'hourly'} onClick={() => { setDisplay('hourly'); setShowData(false) }}>Hourly pattern</button><button aria-pressed={display === 'clock'} onClick={() => { setDisplay('clock'); setShowData(false) }}>24-hour clock</button><button aria-pressed={display === 'bands'} onClick={() => setDisplay('bands')}>Band comparison</button></div><div className="time-controls"><label>Window<select aria-label="Time-of-day window" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}><option value="14">Full period ({bundle.summary.monitoring.days}d)</option><option value="7">Latest 7</option></select></label>{display !== 'bands' && <label>Hours<select aria-label="Hourly aggregation" value={smooth} onChange={(e) => setSmooth(Number(e.target.value))}><option value="1">Raw 1h</option><option value="3">Pooled 3h</option></select></label>}{display === 'bands' && <button className="text-button" onClick={() => setShowData(!showData)}>{showData ? 'Show chart' : 'View data'}</button>}</div></div>
    <p className="time-scope">{dateLabel(rangeStart)}–{dateLabel(bundle.summary.monitoring.end)} · time-of-day views only · baseline unchanged{smooth === 3 && display !== 'bands' ? ' · circular 3-hour pooling' : ''}</p>
    {error ? <div className="inline-error" role="alert"><b>Time-of-day evidence could not be loaded.</b><p>{error.message}</p><button className="text-button" onClick={() => setRetry(retry + 1)}>Retry time-of-day view</button></div> : !hourly ? <p className="empty-state" role="status">Loading time-of-day evidence…</p> : display !== 'bands' ? hourly.hour_heatmap?.cells?.length ? <HourHeatmap variant={display === 'clock' ? 'clock' : 'grid'} data={hourly.hour_heatmap} bandsByZone={hourly.time_of_day_all_zones || {}} selectedZone={selectedZone} onSelectZone={onSelectZone} selectedCell={{ ...selectedCell, zone_id: selectedZone }} onSelectCell={(cell) => { setSelectedCell(cell); onSelectZone(cell.zone_id) }} /> : <p className="empty-state">Hourly evidence is unavailable from this data source. Daily and stage evidence remain available.</p> : bands ? <TimeBands analysis={{ ...analysis, time_of_day: { ...analysis.time_of_day, bands } }} showData={showData} /> : <p className="empty-state">Time-band evidence is unavailable from this data source.</p>}
    {hourly && <p className="where-conclusion">{bandFocus ? <><strong>Zone {selectedZone} · {bandFocus.label}:</strong> {percent(bandFocus.p_band)} late vs {percent(bandFocus.p0_band)} baseline; UCL {percent(bandFocus.ucl)}. <span className="signal-text">Exploratory band signal.</span></> : timeBandConclusion(bands, selectedZone)} <span>Colors show change, black outlines mark supplied band signals.</span></p>}
  </div>
}

const analysisTabs = [['where', 'Where & when'], ['daily', 'Daily p chart'], ['stages', 'Delay stages']]
function AnalysisPanel({ analysis, bundle, client, view, onViewChange, showMethods, onCloseMethods, selectedDate, onSelectDate, onSelectZone, sourceProps }) {
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
    <div className="analysis-heading"><div><h2>{showMethods ? 'Data source & interpretation' : <>Zone {zone.zone_id} <span className="heading-profile">/ {zoneType(zone.zone_type)}</span></>}</h2><span className="sample-note">{showMethods ? 'Connection, scope and statistical limits' : `${integer(zone.n)} monitoring incidents · ${integer(zone.baseline_n)} baseline`}</span></div><div className="zone-context">{showMethods ? <button className="text-button" onClick={onCloseMethods}>Back to evidence</button> : <><StatusBadge kind="target" value={zone.above_service_target} /><span>P90 <b>{minutes(zone.p90_min)}</b></span></>}</div></div>
    {showMethods ? <SourcePanel {...sourceProps} source={bundle.provenance} /> : <>
      <div className="analysis-tabs" role="tablist" aria-label="Selected-zone analysis">{analysisTabs.map(([id, label]) => <button key={id} id={`tab-${id}`} role="tab" tabIndex={view === id ? 0 : -1} aria-selected={view === id} aria-controls={`analysis-${id}`} className="analysis-tab" onClick={() => selectView(id)} onKeyDown={navigateTabs}>{label}</button>)}{view !== 'where' && <button className="text-button data-toggle" onClick={() => setShowData(!showData)} aria-expanded={showData}>{showData ? 'Show chart' : view === 'daily' ? 'View daily data' : 'View stage data'}</button>}</div>
      <div className="analysis-body" id={`analysis-${view}`} role="tabpanel" tabIndex={0} aria-labelledby={`tab-${view}`}>
        {view === 'daily' ? <div className="daily-content"><div className="chart-legend"><span><i className="legend-line observation" />Daily late rate</span><span><i className="legend-line baseline" />p₀ {percent(zone.p0)}</span><span><i className="legend-line limit" />3σ limits</span><span><i className="legend-line target" />q {percent(analysis.settings.q)}</span><span><i className="legend-triangle" />Above UCL</span></div>{showData ? <DailyData points={analysis.daily_p_chart.points} /> : <div className="daily-chart-area"><DailyPChart chart={analysis.daily_p_chart} q={analysis.settings.q} selectedDate={point?.date} onSelectDate={onSelectDate} /></div>}<div className="chart-readout" aria-live="polite">{point ? <><strong>{dateLabel(point.date)}</strong><span>{point.phase === 'baseline' ? 'Baseline' : 'Monitoring'}</span><span>{integer(point.late)} / {integer(point.n)} late</span><b>{percent(point.p)}</b><span className={point.deterioration_flag ? 'signal-text' : ''}>{dailyEvidenceLabel(point)}</span></> : 'No completed daily cohorts.'}</div></div> : view === 'where' ? <WhereWhen analysis={analysis} client={client} bundle={bundle} selectedZone={zone.zone_id} onSelectZone={onSelectZone} /> : <StageEvidence stages={analysis.stages} showData={showData} />}
      </div>
      {view !== 'where' && <p className="analysis-caption">{zone.deterioration_flag === true ? <><span className="signal-text">{zone.deterioration_days} flagged days · {dateLabel(zone.first_flag_date)}–{dateLabel(zone.last_flag_date)}.</span> Historical signal; inspect later days to assess recovery.</> : zone.deterioration_flag === false ? 'No daily upper-limit violations. This does not rule out concentrated time-band or individual severe delays.' : 'Daily evidence unavailable; do not interpret this as normal.'}</p>}
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
  const [incidentScope, setIncidentScope] = useState('all')
  const [timestamps, setTimestamps] = useState(false)
  const client = useMemo(() => createDataClient(config), [config])
  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setLoading(true); setError(null); setBundle(null)
    const operation = file ? client.uploadCsv(file, { signal: controller.signal }) : client.loadScenario(scenario, { signal: controller.signal })
    operation.then((value) => { if (current) { const focus = initialFocus(value.summary); setBundle(value); setSelectedZone(focus.zone); setView(focus.view); setShowMethods(false); setLoading(false) } }).catch((err) => { if (current && err.code !== 'ABORTED') { setError(err); setShowMethods(false); setLoading(false) } })
    return () => { current = false; controller.abort() }
  }, [client, scenario, file, retry])
  const summary = bundle?.summary
  const analysis = bundle?.analyses[selectedZone]
  function selectZone(id) { setSelectedZone(id); setShowMethods(false) }
  function applyConfig(next) { setFile(null); setConfig(next) }
  const sourceProps = { config, onApply: applyConfig, onUpload: setFile, fileName: file?.name, busy: loading }
  return <div className="dashboard-shell">
    <a className="skip-link" href="#workspace">Skip to dashboard</a>
    <header className="appbar"><a className="wordmark" href="#workspace" aria-label="ResponseWatch dashboard"><span className="brand-symbol"><Icon name="pulse" size={23} /></span><span>Response<span className="brand-secondary">Watch</span></span></a><ScenarioPicker scenario={scenario} uploaded={Boolean(file)} onSelect={(id) => { setFile(null); setScenario(id); setRetry(retry + 1) }} /><span className="date-range">{summary ? `${dateLabel(summary.monitoring.start)} – ${dateLabel(summary.monitoring.end)}, ${summary.monitoring.end.slice(0, 4)}` : 'Historical monitoring'}<small>Monitoring · New York time</small></span><nav className="page-links" aria-label="Pages"><a href="./">Home</a><a href="guide">Guide</a></nav><button className="source-button" aria-expanded={showMethods} onClick={() => setShowMethods(!showMethods)}>{config.mode === 'demo' ? 'Preview data' : 'API data'}<Icon name="info" size={15} /></button></header>
    <main id="workspace" className="workspace" tabIndex={-1} aria-busy={loading}>
      <h1 className="sr-only">Response quality</h1>
      {error ? showMethods ? <section className="panel error-panel source-error"><div className="panel-heading"><h2>Data source & interpretation</h2><button className="text-button" onClick={() => setShowMethods(false)}>Back to error</button></div><SourcePanel {...sourceProps} /></section> : <LoadError error={error} onRetry={() => setRetry(retry + 1)} onSource={() => setShowMethods(true)} /> : !bundle ? <div className="loading-layout" role="status">Loading {config.mode === 'api' ? 'from the statistics service' : 'precomputed evidence'}…</div> : <>
        <ZoneOverview zones={summary.zones} bandsByZone={summary.time_of_day_all_zones} selected={selectedZone} onSelect={selectZone} />
        <AnalysisPanel analysis={analysis} bundle={bundle} client={client} view={view} onViewChange={setView} showMethods={showMethods} onCloseMethods={() => setShowMethods(false)} selectedDate={selectedDate} onSelectDate={setSelectedDate} onSelectZone={selectZone} sourceProps={sourceProps} />
        <section className="panel outlier-panel" aria-label="Longest completed responses"><div className="panel-heading"><div><h2>Severe individual delays</h2><span className="sample-note">Five longest completed responses · full monitoring window</span></div><div className="incident-controls"><div className="segmented incident-scope-toggle" role="group" aria-label="Incident scope"><button aria-pressed={incidentScope === 'all'} onClick={() => setIncidentScope('all')}>All zones</button><button aria-pressed={incidentScope === 'selected'} onClick={() => setIncidentScope('selected')}>Zone {selectedZone}</button></div><button className="text-button" onClick={() => setTimestamps(!timestamps)} aria-expanded={timestamps}>{timestamps ? 'Hide timestamps' : 'Show timestamps'}</button></div></div><SlowestTable incidents={incidentScope === 'all' ? summary.slowest_incidents : analysis.slowest_incidents} showTimestamps={timestamps} onSelectZone={selectZone} /></section>
      </>}
    </main>
    <footer className="statusbar"><span>{file ? `CSV: ${file.name}` : 'Synthetic, historical incidents'} · {config.mode === 'demo' ? 'precomputed preview' : 'backend statistics'} · not a live dispatch feed</span><span>Late: R &gt; {summary?.settings.T_min ?? 12} min · q {percent(summary?.settings.q ?? .1)} · demo targets</span></footer>
  </div>
}
