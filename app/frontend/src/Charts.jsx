import React, { useEffect, useId, useRef, useState } from 'react'
import { percent, minutes, integer, dateLabel } from './format.js'

const finite = Number.isFinite
const palette = { ink: '#24374b', muted: '#63758a', grid: '#e5ebef', blue: '#2863c5', red: '#c44638', teal: '#127d79', amber: '#a96b16', baseline: '#a6b3c0' }

function EmptyChart({ children = 'No completed observations available.' }) {
  return <div className="chart-empty" role="status">{children}</div>
}

function useMeasuredPlot(defaultWidth, defaultHeight, contentKey) {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight })
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

function paths(points, getValue, x, y) {
  let current = ''
  const result = []
  points.forEach((point, index) => {
    const value = getValue(point)
    if (finite(value)) current += `${current ? ' L' : 'M'}${x(index)},${y(value)}`
    else if (current) { result.push(current); current = '' }
  })
  if (current) result.push(current)
  return result
}

function pointDescription(point) {
  return dailyTooltipText(point)
}

export function dailyPointStatus(point) {
  if (point.phase === 'baseline') return 'Baseline day'
  if (point.status !== 'ok' || point.deterioration_flag == null) return 'Not enough data'
  return point.deterioration_flag ? 'Worse than normal' : 'Within usual range'
}

export function dailyTooltipText(point) {
  // Always use this day's API counts; never a zone total or pooled-hour count.
  return `${dateLabel(point.date)} · ${integer(point.late)} of ${integer(point.n)} calls late (${percent(point.p)}) · ${dailyPointStatus(point)}`
}

export function nearestDateIndex(localX, left, plotWidth, count) {
  if (count < 1) return null
  if (count === 1 || plotWidth <= 0) return 0
  return Math.max(0, Math.min(count - 1, Math.round((localX - left) / plotWidth * (count - 1))))
}

export function DailyPChart({ chart, q = .1, selectedDate, onSelectDate, compact = false }) {
  const descriptionId = useId()
  const [active, setActive] = useState(null)
  const [pointer, setPointer] = useState(null)
  const [plotRef, size] = useMeasuredPlot(800, compact ? 185 : 210, chart?.points?.length)
  const points = Array.isArray(chart?.points) ? chart.points : []
  if (!points.length) return <EmptyChart />

  const w = size.width, h = size.height
  const margin = { left: 44, right: 18, top: 25, bottom: 29 }
  const pw = w - margin.left - margin.right, ph = h - margin.top - margin.bottom
  const values = points.flatMap(point => [point.p, point.cl, point.ucl, point.lcl]).concat(q).filter(finite)
  const ymax = Math.min(1, Math.max(.2, Math.ceil(Math.max(...values, .1) * 1.12 * 10) / 10))
  const x = index => margin.left + (points.length === 1 ? pw / 2 : index * pw / (points.length - 1))
  const y = value => margin.top + ph * (1 - value / ymax)
  const step = points.length > 1 ? pw / (points.length - 1) : pw
  const monitoringIndex = points.findIndex(point => point.phase === 'monitoring')
  const boundary = monitoringIndex < 0 ? margin.left + pw : monitoringIndex === 0 ? margin.left : x(monitoringIndex) - step / 2
  const selectedIndex = points.findIndex(point => point.date === selectedDate)
  const activePoint = active == null ? null : points[active]
  function inspectPointer(event) {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || event.pointerType === 'touch') return
    const index = nearestDateIndex((event.clientX - bounds.left) * w / bounds.width, margin.left, pw, points.length)
    setActive(index)
    setPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
  }
  const ticks = Array.from({ length: 5 }, (_, index) => ymax * index / 4)
  const dateIndices = [...new Set([0, Math.round((points.length - 1) / 4), Math.round((points.length - 1) / 2), Math.round((points.length - 1) * .75), points.length - 1])]

  const tooltipWidth = Math.min(280, Math.max(160, w - 16))
  const anchorX = pointer?.x ?? (active == null ? 0 : x(active))
  const tooltipLeft = Math.max(8, Math.min(w - tooltipWidth - 8, anchorX - tooltipWidth / 2))
  return <div className={`daily-chart ${compact ? 'chart-compact' : ''}`}>
    <div className="chart-svg-wrap" ref={plotRef}>
      <svg className="chart-plot" viewBox={`0 0 ${w} ${h}`} role="group" aria-label="Daily late-rate p control chart" aria-describedby={descriptionId} onPointerMove={inspectPointer} onPointerLeave={() => { setActive(null); setPointer(null) }}>
        <desc id={descriptionId}>Daily late rates with frozen historical baseline and supplied upper and lower control limits. Baseline dates are shaded. Red triangles indicate monitoring days flagged by the statistical service. Move anywhere across the plot to inspect the nearest date, or focus a point and use arrow keys.</desc>
        <rect x={margin.left} y={margin.top} width={Math.max(0, boundary - margin.left)} height={ph} fill="#f0f4f7" />
        {selectedIndex >= 0 && <rect className="chart-date-selection" x={Math.max(margin.left, x(selectedIndex) - step / 2)} y={margin.top} width={Math.min(step, pw)} height={ph} fill="#dce9fa" opacity=".65" />}
        {ticks.map(value => <g key={value} aria-hidden="true"><line x1={margin.left} y1={y(value)} x2={w - margin.right} y2={y(value)} stroke={palette.grid} /><text x={margin.left - 9} y={y(value) + 4} textAnchor="end" className="chart-axis-label">{Math.round(value * 100)}%</text></g>)}
        <text x={margin.left + 8} y="16" className="chart-phase-label">BASELINE</text>
        {monitoringIndex >= 0 && <><line x1={boundary} y1={margin.top - 4} x2={boundary} y2={h - margin.bottom} stroke="#b0becb" strokeDasharray="3 4" /><text x={boundary + 8} y="16" className="chart-phase-label">MONITORING</text></>}
        {finite(q) && <line x1={margin.left} y1={y(q)} x2={w - margin.right} y2={y(q)} stroke="#7d8995" strokeDasharray="2 5" />}
        {['ucl', 'lcl'].map(key => paths(points, point => point[key], x, y).map((path, index) => <path key={`${key}-${index}`} d={path} fill="none" stroke={palette.amber} strokeWidth="1.3" strokeDasharray="6 4" />))}
        {paths(points, point => finite(point.cl) ? point.cl : chart.p0, x, y).map((path, index) => <path key={`cl-${index}`} d={path} fill="none" stroke={palette.teal} strokeWidth="1.6" />)}
        {paths(points, point => point.p, x, y).map((path, index) => <path key={`p-${index}`} d={path} fill="none" stroke={palette.blue} strokeWidth="1.7" strokeLinejoin="round" />)}
        {activePoint && <line className="chart-crosshair" x1={x(active)} x2={x(active)} y1={margin.top} y2={h - margin.bottom} stroke="#486579" strokeDasharray="3 3" pointerEvents="none" />}
        {points.map((point, index) => {
          const px = x(index), py = finite(point.p) ? y(point.p) : y(0)
          const isFlagged = point.deterioration_flag === true
          return <g key={point.date ?? index} className="chart-point" tabIndex={0} role="button" aria-label={`${pointDescription(point)} Select day.`} aria-pressed={selectedDate === point.date} onFocus={() => { setActive(index); setPointer(null) }} onBlur={() => setActive(null)} onClick={() => onSelectDate?.(point.date)} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = Math.max(0, Math.min(points.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1))); event.currentTarget.parentElement.querySelectorAll('.chart-point')[next]?.focus(); return } if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectDate?.(point.date) } }}>
            <title>{pointDescription(point)}</title>
            <circle cx={px} cy={py} r="11" fill="transparent" className="chart-point-hit" />
            {finite(point.p) ? isFlagged ? <path d={`M${px},${py - 5.4} L${px + 5.2},${py + 4.1} L${px - 5.2},${py + 4.1} Z`} fill={palette.red} stroke="#fff" strokeWidth="1.2" /> : <circle cx={px} cy={py} r={selectedDate === point.date ? 4.5 : 3.2} fill={palette.blue} stroke="#fff" strokeWidth="1.2" /> : <path d={`M${px - 3},${py - 3}l6,6m0,-6l-6,6`} stroke={palette.muted} />}
          </g>
        })}
        {dateIndices.map(index => <text key={index} x={x(index)} y={h - 9} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="chart-axis-label">{dateLabel(points[index].date)}</text>)}
      </svg>
    </div>
    <div className="chart-tooltip-lane" aria-label="Daily chart inspection">
      {!activePoint && <span className="chart-inspection-hint">Move across the chart to inspect a day · arrow keys also supported</span>}
      {activePoint && <div className="chart-tooltip" role="status" style={{ left: tooltipLeft, top: pointer ? Math.max(0, Math.min(10, pointer.y / Math.max(1, h) * 10)) : 0, width: tooltipWidth }}>{dailyTooltipText(activePoint)}</div>}
    </div>
  </div>
}

export function BandChart({ bands }) {
  const [plotRef, size] = useMeasuredPlot(450, 150, bands?.length)
  const rows = Array.isArray(bands) ? bands : []
  if (!rows.length) return <EmptyChart>No time-band comparisons available.</EmptyChart>
  const w = size.width, h = size.height, left = 34, right = 10, top = 20, bottom = 53
  const plotW = w - left - right, plotH = h - top - bottom
  const maxValue = Math.max(.1, ...rows.flatMap(row => [row.p0_band, row.p_band, row.ucl]).filter(finite))
  const ymax = Math.min(1, Math.max(.2, Math.ceil(maxValue * 1.15 * 10) / 10))
  const y = value => top + plotH * (1 - value / ymax)
  const unit = plotW / rows.length, barWidth = Math.min(24, unit * .23)
  return <div className="band-chart">
    <div className="chart-svg-wrap" ref={plotRef}><svg className="chart-plot" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Pooled late-rate comparison for five time bands">
      <desc>Paired baseline and monitoring late-rate bars use statistics supplied by the backend. Red monitoring bars indicate flagged comparisons. A label marks insufficient statistical evidence; it never means normal.</desc>
      {[0, ymax / 2, ymax].map(value => <g key={value}><line x1={left} y1={y(value)} x2={w - right} y2={y(value)} stroke={palette.grid} /><text x={left - 8} y={y(value) + 4} textAnchor="end" className="chart-axis-label">{Math.round(value * 100)}%</text></g>)}
      {rows.map((row, index) => {
        const cx = left + unit * (index + .5)
        const color = row.flag === true ? palette.red : palette.blue
        const label = ({ night: 'Night', morning_rush: 'AM rush', midday: 'Midday', evening_rush: 'PM rush', late_evening: 'Late eve' })[row.band] || row.label
        return <g key={row.band}>
          <title>{`${row.label} (${row.interval_local}): baseline ${percent(row.p0_band)} from ${integer(row.baseline_n)} calls; monitoring ${percent(row.p_band)} from ${integer(row.n_band)} calls. Upper limit ${percent(row.ucl)}. ${row.status === "ok" ? row.flag === true ? "Above upper limit." : "No upper-limit signal." : "Insufficient evidence."}`}</title>
          {finite(row.p0_band) && <rect x={cx - barWidth - 2} y={y(row.p0_band)} width={barWidth} height={Math.max(0, y(0) - y(row.p0_band))} fill={palette.baseline} rx="1" />}
          {finite(row.p_band) && <rect x={cx + 2} y={y(row.p_band)} width={barWidth} height={Math.max(0, y(0) - y(row.p_band))} fill={color} opacity={row.status === 'ok' ? 1 : .65} rx="1" />}
          {finite(row.ucl) && <line x1={cx - barWidth - 7} x2={cx + barWidth + 7} y1={y(row.ucl)} y2={y(row.ucl)} stroke={palette.amber} strokeWidth="1.6" strokeDasharray="4 3" />}
          {finite(row.p_band) && <text x={cx + 2 + barWidth / 2} y={Math.max(top + 8, y(row.p_band) - 7)} textAnchor="middle" className="chart-value-label" fill={color}>{percent(row.p_band)}</text>}
          <text x={cx} y={h - 35} textAnchor="middle" className="chart-category-label">{label}</text>
          <text x={cx} y={h - 19} textAnchor="middle" className="chart-axis-label">n={integer(row.n_band)}</text>
          {row.status !== 'ok' && <text x={cx} y={h - 3} textAnchor="middle" className="chart-caution-label">Limited</text>}
        </g>
      })}
    </svg></div>
  </div>
}

const stageNames = { call_handling: 'Call handling', turnout: 'Turnout', travel: 'Travel' }
const stageSpans = { call_handling: 'Call → unit notified', turnout: 'Notified → en route', travel: 'En route → on scene' }
const stageMeasures = [['median', 'Typical'], ['p90', '90% within']]

export function stageShift(row, measure) {
  const base = row[`baseline_${measure}_min`], current = row[`monitoring_${measure}_min`]
  return finite(base) && finite(current) ? Math.round((current - base) * 10) / 10 || 0 : null
}

function shiftLabel(delta) {
  if (delta == null) return '—'
  return delta === 0 ? '±0.0' : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}`
}

function shiftColor(delta) {
  return delta == null || delta === 0 ? palette.muted : delta > 0 ? palette.red : palette.blue
}

export function StageChart({ stages }) {
  const [plotRef, size] = useMeasuredPlot(720, 300, stages?.length)
  const rows = Array.isArray(stages) ? stages : []
  if (!rows.length) return <EmptyChart>No stage-duration summary available.</EmptyChart>
  const w = size.width, h = size.height
  const narrow = w < 560
  const left = narrow ? 84 : 210, right = narrow ? 50 : 84, top = 8, bottom = 28
  const pw = Math.max(40, w - left - right)
  const groupH = (h - top - bottom) / rows.length
  const maxValue = Math.max(1, ...rows.flatMap(row => [row.baseline_median_min, row.monitoring_median_min, row.baseline_p90_min, row.monitoring_p90_min]).filter(finite))
  const tickStep = maxValue > 12 ? 5 : maxValue > 6 ? 2 : 1
  const xmax = Math.ceil(maxValue * 1.08 / tickStep) * tickStep
  const ticks = Array.from({ length: xmax / tickStep + 1 }, (_, index) => index * tickStep)
  const x = value => left + value / xmax * pw
  return <div className="stage-chart">
    <div className="chart-svg-wrap" ref={plotRef}><svg className="chart-plot" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Baseline to monitoring change in median and P90 duration for each response stage">
      <desc>For each stage, a grey dot marks the baseline value and a teal dot the monitoring value, for the median and the P90 separately. The connecting line shows the descriptive change; it is not a statistical signal. Stage durations must not be added to infer a total response time and do not establish a cause.</desc>
      {ticks.map(value => <g key={value} aria-hidden="true"><line x1={x(value)} x2={x(value)} y1={top} y2={h - bottom} stroke={palette.grid} /><text x={x(value)} y={h - 9} textAnchor="middle" className="chart-axis-label">{value}{value === xmax ? ' min' : ''}</text></g>)}
      <text x={w - 4} y={top + 10} textAnchor="end" className="chart-phase-label">CHANGE</text>
      {rows.map((row, index) => {
        const y0 = top + groupH * index
        return <g key={row.stage}>
          {index > 0 && <line x1={0} x2={w} y1={y0} y2={y0} stroke="#edf1f4" />}
          <text x={0} y={narrow ? y0 + 18 : y0 + groupH / 2 - 5} className="stage-name-label">{stageNames[row.stage] || row.label}</text>
          {!narrow && <text x={0} y={y0 + groupH / 2 + 13} className="chart-axis-label">{stageSpans[row.stage] || ''}</text>}
          {stageMeasures.map(([measure, measureLabel], m) => {
            const cy = y0 + groupH * (narrow ? m === 0 ? .48 : .78 : m === 0 ? .36 : .68)
            const base = row[`baseline_${measure}_min`], current = row[`monitoring_${measure}_min`]
            const delta = stageShift(row, measure)
            const color = shiftColor(delta)
            const both = finite(base) && finite(current)
            const lowIsBase = both ? base <= current : true
            return <g key={measure}>
              <title>{`${row.label} ${measureLabel}: baseline ${minutes(base)}, monitoring ${minutes(current)} (${shiftLabel(delta)} min).`}</title>
              <text x={narrow ? 0 : left - 12} y={cy + 4} textAnchor={narrow ? 'start' : 'end'} className="stage-measure-label">{measureLabel}</text>
              <line x1={left} x2={left + pw} y1={cy} y2={cy} stroke="#f1f4f6" strokeWidth="6" strokeLinecap="round" />
              {both && <line x1={x(base)} x2={x(current)} y1={cy} y2={cy} stroke={color} strokeOpacity=".45" strokeWidth="4" strokeLinecap="round" />}
              {finite(base) && <><circle cx={x(base)} cy={cy} r="5" fill="#fff" stroke={palette.baseline} strokeWidth="2.2" /><text x={x(base) + (lowIsBase ? -9 : 9)} y={cy + 4} textAnchor={lowIsBase ? 'end' : 'start'} className="chart-axis-label">{base.toFixed(1)}</text></>}
              {finite(current) && <><circle cx={x(current)} cy={cy} r="5.5" fill={palette.teal} stroke="#fff" strokeWidth="1.5" /><text x={x(current) + (lowIsBase ? 9 : -9)} y={cy + 4} textAnchor={lowIsBase ? 'start' : 'end'} className="chart-value-label" fill={palette.teal}>{current.toFixed(1)}</text></>}
              <text x={w - 4} y={cy + 4} textAnchor="end" className="chart-value-label" fill={color}>{shiftLabel(delta)}</text>
            </g>
          })}
        </g>
      })}
    </svg></div>
  </div>
}
