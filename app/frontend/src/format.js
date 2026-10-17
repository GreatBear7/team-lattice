export const percent = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—'
export const minutes = (value) => Number.isFinite(value) ? `${value.toFixed(1)} min` : '—'
export const integer = (value) => Number.isFinite(value) ? value.toLocaleString('en-US') : '—'

export function dateLabel(value) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value)
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric',
  }).format(date)
}

export function timeLabel(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date)
}

export const zoneType = (value) => ({ downtown: 'Downtown', residential: 'Residential', outer: 'Outer / semi-rural' })[value] || 'Unknown type'
