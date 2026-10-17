// Rank supplied evidence for a starting view; this is navigation, not a new alarm.
export function bandSignals(summary) {
  return Object.entries(summary.time_of_day_all_zones || {}).flatMap(([zone_id, bands]) =>
    (Array.isArray(bands) ? bands : []).filter((band) => band.status === 'ok' && band.flag === true).map((band) => ({ ...band, zone_id })))
    .sort((a, b) => (b.p_band - b.p0_band) - (a.p_band - a.p0_band))
}

export function initialFocus(summary) {
  const daily = summary.zones.filter((zone) => zone.deterioration_flag === true)
    .sort((a, b) => b.deterioration_days - a.deterioration_days)[0]
  if (daily) return { zone: daily.zone_id, view: 'daily', title: `Review Zone ${daily.zone_id}'s daily change`, detail: `${daily.deterioration_days} monitoring days above the frozen-baseline limit.` }
  const band = bandSignals(summary)[0]
  if (band) return { zone: band.zone_id, view: 'where', title: `Inspect Zone ${band.zone_id}'s ${band.label.toLowerCase()}`, detail: 'A pooled time-band signal warrants review, even without a daily signal.' }
  return { zone: summary.slowest_incidents[0]?.zone_id || summary.zones[0]?.zone_id || 'A', view: 'daily', title: 'Review response quality', detail: 'Start with severe individual delays and chronic target failures.' }
}
