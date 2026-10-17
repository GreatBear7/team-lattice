import React, { useEffect, useId, useRef, useState } from 'react'
import './heatmap.css'

const ZONES = ['A', 'B', 'C', 'D', 'E', 'F']
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const BANDS = [
  { key: 'night', start: 0, end: 6 },
  { key: 'morning_rush', start: 6, end: 10 },
  { key: 'midday', start: 10, end: 16 },
  { key: 'evening_rush', start: 16, end: 20 },
  { key: 'late_evening', start: 20, end: 24 },
]
const SCALE_LIMIT = 25
const COLORS = { blue: '#2863c5', neutral: '#f5f7f9', red: '#bd4135', unavailable: '#e5eaee' }
const finite = Number.isFinite
const keyOf = (zone, hour) => `${zone}:${hour}`
const hourLabel = hour => `${String(hour).padStart(2, '0')}:00`
const interval = (hour, smooth = 1) => smooth === 3 ? `${hourLabel((hour + 23) % 24)}–${hourLabel((hour + 2) % 24)} pooled (center ${hourLabel(hour)})` : `${hourLabel(hour)}–${hourLabel(hour + 1)}`
const rate = value => finite(value) ? `${(value * 100).toFixed(1)}%` : 'Not available'
const count = value => finite(value) ? new Intl.NumberFormat('en-US').format(value) : 'Not available'
const change = value => finite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)} points` : 'Change not available'

function statusLabel(status) {
  if (status === 'ok') return 'Descriptive hourly comparison'
  if (status === 'insufficient_evidence') return 'Not enough data'
  if (status === 'no_data') return 'No data for one or both periods'
  if (status === 'baseline_insufficient') return 'Not enough baseline data'
  return 'Evidence unavailable'
}

function blend(start, end, amount) {
  const a = start.slice(1).match(/.{2}/g).map(value => parseInt(value, 16))
  const b = end.slice(1).match(/.{2}/g).map(value => parseInt(value, 16))
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`
}

/** change_pts is already in percentage points. Only available cells receive a scale color. */
export function cellTone(cell) {
  if (cell?.status !== 'ok' || !finite(cell.change_pts)) return COLORS.unavailable
  const value = Math.max(-SCALE_LIMIT, Math.min(SCALE_LIMIT, cell.change_pts))
  return blend(COLORS.neutral, value < 0 ? COLORS.blue : COLORS.red, Math.abs(value) / SCALE_LIMIT)
}

export function clockArc(startHour, endHour, inner, outer, cx, cy) {
  const point = (hour, radius) => { const a = hour / 24 * Math.PI * 2 - Math.PI / 2; return `${cx + Math.cos(a) * radius},${cy + Math.sin(a) * radius}` }
  const large = endHour - startHour > 12 ? 1 : 0
  return `M${point(startHour, outer)}A${outer},${outer} 0 ${large} 1 ${point(endHour, outer)}L${point(endHour, inner)}A${inner},${inner} 0 ${large} 0 ${point(startHour, inner)}Z`
}

function describeCell(cell) {
  return `Zone ${cell.zone_id}, ${interval(cell.hour, cell.smooth_hours)} local time. Baseline ${rate(cell.p_baseline)}, n ${count(cell.baseline_n)}. Monitoring ${rate(cell.p_monitoring)}, n ${count(cell.monitoring_n)}. ${change(cell.change_pts)}. ${statusLabel(cell.status)}. Color is descriptive, with no per-hour statistical flag.`
}

function unavailableCell(zone, hour) {
  return { zone_id: zone, hour, status: 'no_data', baseline_n: null, monitoring_n: null, p_baseline: null, p_monitoring: null, change_pts: null }
}

function useMeasuredPlot(contentKey) {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 800, height: 252 })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const bounds = element.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const width = Math.round(bounds.width), height = Math.round(bounds.height)
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height })
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [contentKey])
  return [ref, size]
}

function Hatch({ id }) {
  return <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse"><path d="M-1 1 1-1M0 6 6 0M5 7 7 5" fill="none" stroke="#758594" strokeOpacity=".3" strokeWidth=".9" /></pattern>
}

/**
 * data is the API's hour_heatmap object; bandsByZone is time_of_day_all_zones.
 * selectedCell is { zone_id, hour }; onSelectCell receives the supplied cell.
 */
export function HourHeatmap({ variant = 'grid', data, bandsByZone = {}, selectedZone, onSelectZone, selectedCell, onSelectCell }) {
  const id = useId().replace(/:/g, '')
  const descriptionId = `${id}-description`
  const instructionId = `${id}-instructions`
  const hatchId = `${id}-hatch`
  const gradientId = `${id}-scale`
  const legendHatchId = `${id}-legend-hatch`
  const cells = Array.isArray(data?.cells) ? data.cells : []
  const cellMap = new Map()
  cells.forEach(cell => {
    if (ZONES.includes(cell?.zone_id) && Number.isInteger(cell.hour) && cell.hour >= 0 && cell.hour < 24) {
      cellMap.set(keyOf(cell.zone_id, cell.hour), cell)
    }
  })
  const suppliedSelection = ZONES.includes(selectedCell?.zone_id) && Number.isInteger(selectedCell?.hour) && selectedCell.hour >= 0 && selectedCell.hour < 24
    ? keyOf(selectedCell.zone_id, selectedCell.hour) : null
  const [localSelection, setLocalSelection] = useState(null)
  const [rovingKey, setRovingKey] = useState(() => suppliedSelection || keyOf(ZONES.includes(selectedZone) ? selectedZone : 'A', 0))
  const [hoveredKey, setHoveredKey] = useState(null)
  const [focusedKey, setFocusedKey] = useState(null)
  const cellRefs = useRef(new Map())
  const [plotRef, size] = useMeasuredPlot(`${variant}-${cellMap.size ? 'populated' : 'empty'}`)

  useEffect(() => {
    if (suppliedSelection) setRovingKey(suppliedSelection)
    else if (ZONES.includes(selectedZone)) setRovingKey(keyOf(selectedZone, 0))
  }, [suppliedSelection, selectedZone])

  const getCell = key => {
    if (!key) return null
    const [zone, hour] = key.split(':')
    return cellMap.get(key) || unavailableCell(zone, Number(hour))
  }
  const selectedKey = suppliedSelection || localSelection
  const chosenCell = getCell(selectedKey)
  const activeCell = getCell(hoveredKey || focusedKey)
  const selectCell = cell => {
    const key = keyOf(cell.zone_id, cell.hour)
    setRovingKey(key)
    setLocalSelection(key)
    onSelectZone?.(cell.zone_id)
    onSelectCell?.(cell)
  }
  const moveFocus = (event, zoneIndex, hour) => {
    let nextZone = zoneIndex, nextHour = hour
    if (event.key === 'ArrowLeft') nextHour = Math.max(0, hour - 1)
    else if (event.key === 'ArrowRight') nextHour = Math.min(23, hour + 1)
    else if (event.key === 'ArrowUp') nextZone = Math.max(0, zoneIndex - 1)
    else if (event.key === 'ArrowDown') nextZone = Math.min(5, zoneIndex + 1)
    else if (event.key === 'Home') { nextHour = 0; if (event.ctrlKey) nextZone = 0 }
    else if (event.key === 'End') { nextHour = 23; if (event.ctrlKey) nextZone = 5 }
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectCell(getCell(keyOf(ZONES[zoneIndex], hour)))
      return
    } else return
    event.preventDefault()
    const key = keyOf(ZONES[nextZone], nextHour)
    setRovingKey(key)
    const element = cellRefs.current.get(key)
    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  if (!cellMap.size) return <div className="hour-empty" role="status"><strong>No hourly comparisons available.</strong><span>Hourly evidence will appear after completed baseline and monitoring records are available.</span></div>

  const isClock = variant === 'clock'
  const w = size.width, h = size.height
  const cx = w / 2, cy = h / 2
  const outerRadius = Math.max(85, Math.min(w / 2 - 38, h / 2 - 34))
  const ringWidth = (outerRadius - 38) / 6
  const ringOuter = row => outerRadius - row * ringWidth
  const ringInner = row => ringOuter(row) - ringWidth + 3
  const margin = { left: 46, right: 12, top: 27, bottom: 28 }
  const gap = 2, rowGap = 6
  const plotWidth = w - margin.left - margin.right
  const plotHeight = h - margin.top - margin.bottom
  const step = plotWidth / 24
  const rowStep = (plotHeight + rowGap) / 6
  const cellWidth = step - gap, cellHeight = rowStep - rowGap
  const x = hour => margin.left + hour * step
  const y = row => margin.top + row * rowStep
  const signalBands = ZONES.flatMap((zone, row) => {
    const bands = Array.isArray(bandsByZone?.[zone]) ? bandsByZone[zone] : []
    return BANDS.flatMap(band => {
      const supplied = bands.find(item => item.band === band.key)
      return supplied?.flag === true && supplied.status === 'ok' ? [{ ...band, zone, row }] : []
    })
  })

  return <div className={`hour-heatmap ${isClock ? 'hour-clock' : ''}`}>
    <div className="hour-legend" aria-label="Heatmap legend">
      <div className="hour-color-legend"><span>Late-rate change · percentage points</span><svg className="hour-scale" viewBox="0 0 154 32" width="154" height="32" role="img" aria-label="Blue is minus 25 percentage points or less; pale is zero; red is plus 25 percentage points or more."><defs><linearGradient id={gradientId}><stop offset="0%" stopColor={COLORS.blue} /><stop offset="50%" stopColor={COLORS.neutral} /><stop offset="100%" stopColor={COLORS.red} /></linearGradient></defs><rect x="1" y="1" width="152" height="9" fill={`url(#${gradientId})`} stroke="#cad4dc" /><text x="1" y="28" textAnchor="start">−25</text><text x="77" y="28" textAnchor="middle">0</text><text x="153" y="28" textAnchor="end">+25</text></svg></div>
      <span className="hour-legend-item"><svg width="20" height="13" viewBox="0 0 20 13" aria-hidden="true"><rect x="1.5" y="1.5" width="17" height="10" fill="none" stroke="#17242e" strokeWidth="1.8" /></svg>Black outline = worse than usual</span>
      <span className="hour-legend-item"><svg width="20" height="13" viewBox="0 0 20 13" aria-hidden="true"><defs><Hatch id={legendHatchId} /></defs><rect x="0" y="0" width="20" height="13" fill={COLORS.unavailable} /><rect x="0" y="0" width="20" height="13" fill={`url(#${legendHatchId})`} /></svg>Gray hatch = not enough data</span><span className="hour-selection-key">Teal outline = selected district</span>
    </div>
    <div className="hour-plot-scroll">
      <div className="hour-plot-frame" ref={plotRef}>
        <svg className="hour-plot" viewBox={`0 0 ${w} ${h}`} role="group" aria-label={isClock ? "24-hour clock of late-rate changes by zone" : "Hourly late-rate changes by zone"} aria-describedby={`${descriptionId} ${instructionId}`}>
          <desc id={descriptionId}>Six zones A through F and 24 local hours in America/New_York. Color shows monitoring late rate minus frozen baseline in percentage points on a fixed minus 25 to plus 25 scale. Values beyond the scale use the end colors. Gray hatching means insufficient, missing, or unavailable evidence. Black rectangles show only supplied flagged time bands with status ok, never per-hour statistical significance. {data.metric || ''}</desc>
          <defs><Hatch id={hatchId} /></defs>
          {isClock ? <g aria-hidden="true">
            {[0,3,6,9,12,15,18,21].map(hour => { const a = hour / 24 * Math.PI * 2 - Math.PI / 2; return <text key={hour} x={cx + Math.cos(a) * (outerRadius + 22)} y={cy + Math.sin(a) * (outerRadius + 22) + 4} textAnchor="middle" className="hour-axis-label">{String(hour).padStart(2,'0')}</text> })}
            {ZONES.map((zone,row) => zone === selectedZone && <g key={zone}><circle cx={cx} cy={cy} r={ringOuter(row) + 1} fill="none" stroke="#087d77" strokeWidth="2" /><circle cx={cx} cy={cy} r={ringInner(row) - 1} fill="none" stroke="#087d77" strokeWidth="2" /></g>)}
            <text x={cx} y={cy - 3} textAnchor="middle" className="clock-center-zone">{selectedZone || 'A–F'}</text><text x={cx} y={cy + 15} textAnchor="middle" className="hour-axis-label">district</text>
          </g> : <>
          <g aria-hidden="true">
            <text x="10" y="16" className="hour-axis-label">Zone</text>
            {BANDS.map(band => <text key={band.key} x={x((band.start + band.end) / 2) - gap / 2} y="16" textAnchor="middle" className="hour-band-label">{String(band.start).padStart(2, '0')}–{String(band.end).padStart(2, '0')}</text>)}
            {ZONES.map((zone, row) => <g key={zone}>
              {selectedZone === zone && <><rect className="hour-zone-wash" x="1" y={y(row) - 2} width={w - 2} height={cellHeight + 4} rx="3" stroke="#087d77" strokeWidth="1.6" /><rect className="hour-selected-zone-label" x="9" y={y(row) + cellHeight / 2 - 11} width="27" height="22" rx="4" fill="#087d77" /></>}
              <text x="23" y={y(row) + cellHeight / 2 + 4} textAnchor="middle" className={`hour-zone-label${selectedZone === zone ? ' is-selected' : ''}`}>{zone}</text>
            </g>)}
            {HOURS.map(hour => <g key={hour}><line x1={x(hour) + cellWidth / 2} y1={h - margin.bottom + 4} x2={x(hour) + cellWidth / 2} y2={h - margin.bottom + 8} className="hour-axis-tick" />{hour % 3 === 0 && <text x={x(hour) + cellWidth / 2} y={h - 5} textAnchor="middle" className="hour-axis-label">{String(hour).padStart(2, '0')}</text>}</g>)}
          </g>
          </>}
          {ZONES.map((zone, row) => HOURS.map(hour => {
            const key = keyOf(zone, hour)
            const cell = getCell(key)
            const available = cell.status === 'ok' && finite(cell.change_pts)
            const description = describeCell(cell)
            const Shape = isClock ? 'path' : 'rect'
            const geometry = isClock ? { d: clockArc(hour + .035, hour + .965, ringInner(row), ringOuter(row), cx, cy) } : { x: x(hour), y: y(row), width: cellWidth, height: cellHeight }
            return <g key={key}>
              <title>{description}</title>
              <Shape
                ref={element => { if (element) cellRefs.current.set(key, element); else cellRefs.current.delete(key) }}
                className={`hour-cell${selectedKey === key ? ' is-selected' : ''}`}
                {...geometry}
                fill={cellTone(cell)} role="button" tabIndex={rovingKey === key ? 0 : -1}
                aria-label={description} aria-pressed={selectedKey === key}
                onMouseEnter={() => setHoveredKey(key)} onMouseLeave={() => setHoveredKey(null)}
                onFocus={() => { setFocusedKey(key); setRovingKey(key) }} onBlur={() => setFocusedKey(null)}
                onClick={() => { selectCell(cell); cellRefs.current.get(key)?.focus({ preventScroll: true }) }}
                onKeyDown={event => moveFocus(event, row, hour)}
              />
              {!available && <Shape {...geometry} fill={`url(#${hatchId})`} pointerEvents="none" aria-hidden="true" />}
            </g>
          }))}
          <g className="hour-band-outlines" pointerEvents="none" aria-label="Time-band statistical signals">
            {signalBands.map(band => <g key={`${band.zone}-${band.key}`}><title>{`Zone ${band.zone}, ${hourLabel(band.start)}–${hourLabel(band.end)}: supplied time-band signal.`}</title>{isClock ? <path d={clockArc(band.start, band.end, ringInner(band.row) - 1, ringOuter(band.row) + 1, cx, cy)} fill="none" stroke="#17242e" strokeWidth="1.8" /> : <rect x={x(band.start) - .5} y={y(band.row) - 1} width={step * (band.end - band.start) - gap + 1} height={cellHeight + 2} fill="none" stroke="#17242e" strokeWidth="1.8" />}</g>)}
          </g>
        </svg>
      </div>
    </div>
    {isClock && <div className="clock-zone-key" role="group" aria-label="Clock rings"><span>Outer to inner</span>{ZONES.map(zone => <button key={zone} aria-pressed={selectedZone === zone} onClick={() => onSelectZone?.(zone)} aria-label={`Select clock ring ${zone}`}>{zone}</button>)}</div>}
    {activeCell && <div className="hour-tooltip" aria-hidden="true"><strong>Zone {activeCell.zone_id} · {interval(activeCell.hour, activeCell.smooth_hours)}</strong><span>Baseline {rate(activeCell.p_baseline)} · calls {count(activeCell.baseline_n)}</span><span>Monitoring {rate(activeCell.p_monitoring)} · calls {count(activeCell.monitoring_n)}</span><span>{change(activeCell.change_pts)} · {statusLabel(activeCell.status)}</span></div>}
    <div className="hour-readout" aria-live="polite" aria-atomic="true">
      {chosenCell ? <><div className="hour-readout-heading"><strong>Zone {chosenCell.zone_id} · {interval(chosenCell.hour, chosenCell.smooth_hours)}</strong><b>{change(chosenCell.change_pts)}</b><span>{statusLabel(chosenCell.status)}</span></div><div className="hour-readout-values"><span>Baseline calls: {count(chosenCell.baseline_n)} · {rate(chosenCell.p_baseline)}</span><span>Monitoring calls: {count(chosenCell.monitoring_n)} · {rate(chosenCell.p_monitoring)}</span><span>America/New_York · end hour exclusive</span></div></> : <><strong>Select a cell to inspect its hourly comparison.</strong><span>Baseline and monitoring rates, counts, change and evidence status appear here.</span></>}
    </div>
    <div className="hour-chart-notes"><p>Colors compare late-call rates with the first 14 days; each point means one extra late call per 100. Colors alone are not alerts.</p><p id={instructionId}>Arrow keys move focus. Enter or Space selects a cell and its zone. Local hours; band end times are exclusive.</p></div>
  </div>
}

export default HourHeatmap
