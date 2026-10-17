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
  const signal = point.phase === 'baseline' ? 'Baseline reference' : point.status !== 'ok' || point.deterioration_flag == null ? 'Insufficient evidence' : point.deterioration_flag ? 'Above upper control limit' : 'No upper-limit signal'
  return `${dateLabel(point.date)}. ${point.phase}. Late ${integer(point.late)} of ${integer(point.n)}; ${percent(point.p)}. Upper limit ${percent(point.ucl)}. ${signal}.`
}

export function DailyPChart({ chart, q = .1, selectedDate, onSelectDate, compact = false }) {
  const descriptionId = useId()
  const [active, setActive] = useState(null)
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
  const ticks = Array.from({ length: 5 }, (_, index) => ymax * index / 4)
  const dateIndices = [...new Set([0, Math.round((points.length - 1) / 4), Math.round((points.length - 1) / 2), Math.round((points.length - 1) * .75), points.length - 1])]

  return <div className={`daily-chart ${compact ? 'chart-compact' : ''}`}>
    <div className="chart-svg-wrap" ref={plotRef}>
      <svg className="chart-plot" viewBox={`0 0 ${w} ${h}`} role="group" aria-label="Daily late-rate p control chart" aria-describedby={descriptionId}>
        <desc id={descriptionId}>Daily late rates with frozen historical baseline and supplied upper and lower control limits. Baseline dates are shaded. Red triangles indicate monitoring days flagged by the statistical service. Select an observation to inspect its values.</desc>
        <rect x={margin.left} y={margin.top} width={Math.max(0, boundary - margin.left)} height={ph} fill="#f0f4f7" />
        {selectedIndex >= 0 && <rect className="chart-date-selection" x={Math.max(margin.left, x(selectedIndex) - step / 2)} y={margin.top} width={Math.min(step, pw)} height={ph} fill="#dce9fa" opacity=".65" />}
        {ticks.map(value => <g key={value} aria-hidden="true"><line x1={margin.left} y1={y(value)} x2={w - margin.right} y2={y(value)} stroke={palette.grid} /><text x={margin.left - 9} y={y(value) + 4} textAnchor="end" className="chart-axis-label">{Math.round(value * 100)}%</text></g>)}
        <text x={margin.left + 8} y="16" className="chart-phase-label">BASELINE</text>
        {monitoringIndex >= 0 && <><line x1={boundary} y1={margin.top - 4} x2={boundary} y2={h - margin.bottom} stroke="#b0becb" strokeDasharray="3 4" /><text x={boundary + 8} y="16" className="chart-phase-label">MONITORING</text></>}
        {finite(q) && <line x1={margin.left} y1={y(q)} x2={w - margin.right} y2={y(q)} stroke="#7d8995" strokeDasharray="2 5" />}
        {['ucl', 'lcl'].map(key => paths(points, point => point[key], x, y).map((path, index) => <path key={`${key}-${index}`} d={path} fill="none" stroke={palette.amber} strokeWidth="1.3" strokeDasharray="6 4" />))}
        {paths(points, point => finite(point.cl) ? point.cl : chart.p0, x, y).map((path, index) => <path key={`cl-${index}`} d={path} fill="none" stroke={palette.teal} strokeWidth="1.6" />)}
        {paths(points, point => point.p, x, y).map((path, index) => <path key={`p-${index}`} d={path} fill="none" stroke={palette.blue} strokeWidth="1.7" strokeLinejoin="round" />)}
        {points.map((point, index) => {
          const px = x(index), py = finite(point.p) ? y(point.p) : y(0)
          const isFlagged = point.deterioration_flag === true
          return <g key={point.date ?? index} className="chart-point" tabIndex={0} role="button" aria-label={`${pointDescription(point)} Select day.`} aria-pressed={selectedDate === point.date} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onClick={() => onSelectDate?.(point.date)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectDate?.(point.date) } }}>
            <title>{pointDescription(point)}</title>
            <circle cx={px} cy={py} r="11" fill="transparent" className="chart-point-hit" />
            {finite(point.p) ? isFlagged ? <path d={`M${px},${py - 5.4} L${px + 5.2},${py + 4.1} L${px - 5.2},${py + 4.1} Z`} fill={palette.red} stroke="#fff" strokeWidth="1.2" /> : <circle cx={px} cy={py} r={selectedDate === point.date ? 4.5 : 3.2} fill={palette.blue} stroke="#fff" strokeWidth="1.2" /> : <path d={`M${px - 3},${py - 3}l6,6m0,-6l-6,6`} stroke={palette.muted} />}
          </g>
        })}
        {dateIndices.map(index => <text key={index} x={x(index)} y={h - 9} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="chart-axis-label">{dateLabel(points[index].date)}</text>)}
      </svg>
      {activePoint && <div className="chart-tooltip" role="status"><strong>{dateLabel(activePoint.date)} · {activePoint.phase}</strong><span>Late rate {percent(activePoint.p)} · {integer(activePoint.late)} / {integer(activePoint.n)} calls</span><span>UCL {percent(activePoint.ucl)} · LCL {percent(activePoint.lcl)}</span><span>{activePoint.status !== 'ok' ? 'Insufficient evidence' : activePoint.deterioration_flag === true ? 'Upper-limit signal' : activePoint.phase === 'baseline' ? 'Baseline observation' : 'No upper-limit signal'}</span></div>}
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

export function StageChart({ stages }) {
  const [plotRef, size] = useMeasuredPlot(340, 140, stages?.length)
  const rows = Array.isArray(stages) ? stages : []
  if (!rows.length) return <EmptyChart>No stage-duration summary available.</EmptyChart>
  const w = size.width, h = size.height, left = 90, right = 42, top = 7, bottom = 24
  const pw = w - left - right, rowH = (h - top - bottom) / rows.length
  const maxValue = Math.max(1, ...rows.flatMap(row => [row.baseline_median_min, row.monitoring_median_min]).filter(finite))
  const xmax = Math.ceil(maxValue * 1.18 / 2) * 2
  const x = value => left + value / xmax * pw
  return <div className="stage-chart">
    <div className="chart-svg-wrap" ref={plotRef}><svg className="chart-plot" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Baseline and monitoring median duration by response stage">
      <desc>Separate, unstacked bars compare stage medians. Component medians must not be added to infer a median total response time. Stage durations do not establish a cause.</desc>
      {[0, xmax / 2, xmax].map(value => <g key={value}><line x1={x(value)} x2={x(value)} y1={top - 6} y2={h - bottom} stroke={palette.grid} /><text x={x(value)} y={h - 8} textAnchor="middle" className="chart-axis-label">{value} min</text></g>)}
      {rows.map((row, index) => {
        const cy = top + rowH * (index + .5)
        const label = ({ call_handling: 'Call handling', turnout: 'Turnout', travel: 'Travel' })[row.stage] || row.label
        return <g key={row.stage}>
          <title>{`${row.label}: baseline median ${minutes(row.baseline_median_min)}; monitoring median ${minutes(row.monitoring_median_min)}; monitoring P90 ${minutes(row.monitoring_p90_min)}.`}</title>
          <text x={left - 11} y={cy + 4} textAnchor="end" className="chart-category-label">{label}</text>
          {finite(row.baseline_median_min) && <><rect x={left} y={cy - 13} width={Math.max(0, x(row.baseline_median_min) - left)} height="10" fill={palette.baseline} rx="1" /><text x={x(row.baseline_median_min) + 6} y={cy - 5} className="chart-axis-label">{row.baseline_median_min.toFixed(1)}</text></>}
          {finite(row.monitoring_median_min) && <><rect x={left} y={cy + 3} width={Math.max(0, x(row.monitoring_median_min) - left)} height="10" fill={palette.teal} rx="1" /><text x={x(row.monitoring_median_min) + 6} y={cy + 12} className="chart-value-label" fill={palette.teal}>{row.monitoring_median_min.toFixed(1)}</text></>}
        </g>
      })}
    </svg></div>
  </div>
}
