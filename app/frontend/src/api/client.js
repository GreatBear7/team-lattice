import fixtureSource from '../mocks/source.json'

export const SCENARIOS = [
  { id: 'normal', label: 'Dataset 1', description: 'Normal month · no new problems' },
  { id: 'recovery', label: 'Dataset 2', description: 'C travel slowdown Oct 1–6 · then fixed' },
  { id: 'morning_tail', label: 'Dataset 3', description: 'D 06:00–10:00 · a few 35–42 min waits' },
]

const ZONES = ['A', 'B', 'C', 'D', 'E', 'F']
const fixtureLoaders = {
  normal: () => import('../mocks/normal.json'),
  recovery: () => import('../mocks/recovery.json'),
  morning_tail: () => import('../mocks/morning_tail.json'),
}

export class DataError extends Error {
  constructor(message, { status = null, errors = [], code = 'DATA_ERROR', cause } = {}) {
    super(message, { cause })
    this.name = 'DataError'
    this.status = status
    this.errors = errors
    this.code = code
  }
}

function requireScenario(scenario) {
  if (typeof scenario !== 'string' || !Object.hasOwn(fixtureLoaders, scenario)) {
    throw new DataError('Unknown scenario. Select normal, recovery, or morning_tail.', { code: 'UNKNOWN_SCENARIO' })
  }
}

function requireZone(zoneId) {
  if (!ZONES.includes(zoneId)) {
    throw new DataError('Unknown zone. Select a district from A to F.', { code: 'UNKNOWN_ZONE' })
  }
}

function checkSignal(signal) {
  if (signal?.aborted) {
    throw new DataError('The data request was cancelled.', { code: 'ABORTED', cause: signal.reason })
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function invalidResponse(message, status = 200) {
  return new DataError(`Incomplete API response: ${message}`, { status, code: 'INVALID_RESPONSE' })
}

function validateMetadata(payload, context) {
  const { settings, baseline, monitoring } = payload
  if (!isRecord(settings) || !Number.isFinite(settings.T_min) || settings.T_min <= 0 || !Number.isFinite(settings.q) || settings.q < 0 || settings.q > 1) {
    throw invalidResponse(`${context} must contain settings with numeric T_min and q.`)
  }
  if (!isRecord(baseline) || typeof baseline.start !== 'string' || !baseline.start || typeof baseline.end_exclusive !== 'string' || !baseline.end_exclusive || !Number.isFinite(baseline.days) || baseline.days < 0) {
    throw invalidResponse(`${context} must contain baseline start, end_exclusive, and days.`)
  }
  if (!isRecord(monitoring) || typeof monitoring.start !== 'string' || !monitoring.start || typeof monitoring.end !== 'string' || !monitoring.end || !Number.isFinite(monitoring.days) || monitoring.days < 0) {
    throw invalidResponse(`${context} must contain monitoring start, end, and days.`)
  }
}

function validateRecordArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw invalidResponse(`${field} must be an array of objects.`)
  }
}

function validateSummary(summary) {
  if (!isRecord(summary) || !Array.isArray(summary.zones)) {
    throw invalidResponse('zones/summary must contain a zones array.')
  }
  validateMetadata(summary, 'zones/summary')
  const zoneIds = summary.zones.map((zone) => zone?.zone_id)
  if (zoneIds.length !== ZONES.length || new Set(zoneIds).size !== ZONES.length || zoneIds.some((id) => !ZONES.includes(id))) {
    throw invalidResponse('zones/summary must contain each zone A to F exactly once.')
  }
  validateRecordArray(summary.slowest_incidents, 'zones/summary.slowest_incidents')
  return summary
}

function validateAnalysis(analysis, zoneId) {
  if (!isRecord(analysis) || !isRecord(analysis.summary) || !Array.isArray(analysis.daily_p_chart?.points)) {
    throw invalidResponse(`zone ${zoneId} analysis must contain summary and daily_p_chart.points.`)
  }
  if (analysis.summary.zone_id !== zoneId || (analysis.zone_id !== undefined && analysis.zone_id !== zoneId)) {
    throw invalidResponse(`zone ${zoneId} analysis contains another zone's summary.`)
  }
  validateMetadata(analysis, `zone ${zoneId} analysis`)
  validateRecordArray(analysis.daily_p_chart.points, `zone ${zoneId} daily_p_chart.points`)
  validateRecordArray(analysis.stages, `zone ${zoneId} stages`)
  validateRecordArray(analysis.slowest_incidents, `zone ${zoneId} slowest_incidents`)
  if (analysis.time_of_day == null) return { ...analysis, time_of_day: { bands: [] } }
  if (!isRecord(analysis.time_of_day)) throw invalidResponse(`zone ${zoneId} time_of_day must be an object.`)
  if (analysis.time_of_day.bands == null) return { ...analysis, time_of_day: { ...analysis.time_of_day, bands: [] } }
  validateRecordArray(analysis.time_of_day.bands, `zone ${zoneId} time_of_day.bands`)
  return analysis
}

function validationErrors(payload) {
  const detail = payload?.detail
  const entries = Array.isArray(payload?.errors) ? payload.errors
    : Array.isArray(detail) ? detail
      : Array.isArray(detail?.errors) ? detail.errors
        : isRecord(detail) && (detail.reason || detail.msg) ? [detail]
          : []
  return entries.map((entry) => {
    if (!isRecord(entry)) return { row: null, field: null, reason: String(entry) }
    const location = Array.isArray(entry.loc) ? entry.loc : []
    const field = location.filter((part) => typeof part === 'string' && !['body', 'query', 'path'].includes(part)).at(-1)
    return {
      row: entry.row ?? entry.ctx?.row ?? null,
      field: entry.field ?? field ?? null,
      reason: entry.reason ?? entry.msg ?? entry.message ?? 'Invalid value.',
    }
  })
}

function serverMessage(payload, errors) {
  if (typeof payload?.error === 'string') return payload.error
  if (typeof payload?.message === 'string') return payload.message
  if (typeof payload?.detail === 'string') return payload.detail
  if (errors.length) return errors.map(({ row, field, reason }) => [row === null ? null : `row ${row}`, field, reason].filter(Boolean).join(': ')).join('; ')
  return 'The server could not complete the request.'
}

function hourlyFields(summary) {
  return {
    hour_heatmap: summary?.hour_heatmap ?? null,
    time_of_day_all_zones: summary?.time_of_day_all_zones ?? null,
  }
}

function serverProvenance(loaded, summary) {
  const provenance = { ...(summary.provenance ?? {}), ...(loaded.provenance ?? {}) }
  return {
    ...provenance,
    data_ref: provenance.data_ref ?? loaded.data_ref ?? null,
    stats_ref: provenance.stats_ref ?? loaded.stats_ref ?? null,
  }
}

// This boundary passes through precomputed/server statistics unchanged.
// Selecting API mode never falls back to demo fixtures after an error.
export function createDataClient({ mode = 'demo', baseUrl = '/api', fetchImpl = globalThis.fetch } = {}) {
  if (!['demo', 'api'].includes(mode)) {
    throw new DataError('Data mode must be demo or api.', { code: 'INVALID_MODE' })
  }
  if (typeof baseUrl !== 'string') {
    throw new DataError('The API base URL must be a string.', { code: 'INVALID_CONFIG' })
  }
  const base = baseUrl.replace(/\/+$/, '')

  async function request(path, { method = 'GET', body, headers, signal, context = 'API request failed' } = {}) {
    checkSignal(signal)
    if (typeof fetchImpl !== 'function') {
      throw new DataError('Fetch is unavailable. Use a browser with fetch support or provide fetchImpl.', { code: 'NETWORK_ERROR' })
    }
    let response
    try {
      response = await fetchImpl(`${base}${path}`, { method, signal, headers: { Accept: 'application/json', ...headers }, ...(body === undefined ? {} : { body }) })
      checkSignal(signal)
    } catch (cause) {
      if (cause instanceof DataError) throw cause
      if (signal?.aborted || cause?.name === 'AbortError') {
        throw new DataError('The data request was cancelled.', { code: 'ABORTED', cause })
      }
      throw new DataError(`${context}: ${cause?.message || 'Could not reach the server.'}`, { code: 'NETWORK_ERROR', cause })
    }
    let payload
    try {
      payload = await response.json()
    } catch (cause) {
      checkSignal(signal)
      if (response.ok) throw new DataError(`${context}: the server did not return valid JSON.`, { status: response.status, code: 'INVALID_RESPONSE', cause })
    }
    checkSignal(signal)
    if (!response.ok) {
      const errors = validationErrors(payload)
      throw new DataError(`${context} (HTTP ${response.status}): ${serverMessage(payload, errors)}`, { status: response.status, errors, code: 'HTTP_ERROR' })
    }
    return payload
  }

  async function health(signal) {
    const result = await request('/health', { signal, context: 'API health check failed' })
    if (result?.status !== 'ok') throw invalidResponse('health did not report status ok.')
  }

  async function loadApiDataset(requestOptions) {
    const { signal } = requestOptions
    await health(signal)
    const loaded = await request('/datasets/load', { ...requestOptions, method: 'POST', context: 'Dataset load failed' })
    if (!isRecord(loaded) || typeof loaded.dataset_id !== 'string' || !loaded.dataset_id.trim()) {
      throw invalidResponse('datasets/load must contain a nonempty dataset_id.')
    }
    const query = new URLSearchParams({ dataset_id: loaded.dataset_id })
    const [summary, ...analyses] = await Promise.all([
      request(`/zones/summary?${query}`, { signal, context: 'Zone summary failed' }).then(validateSummary),
      ...ZONES.map((zoneId) => request(`/zones/${zoneId}/analysis?${query}&window=14`, { signal, context: `Zone ${zoneId} analysis failed` }).then((analysis) => validateAnalysis(analysis, zoneId))),
    ])
    return {
      summary,
      analyses: Object.fromEntries(ZONES.map((zoneId, index) => [zoneId, analyses[index]])),
      provenance: serverProvenance(loaded, summary),
      dataset_id: loaded.dataset_id,
      dataset: loaded,
      source: 'api',
    }
  }

  async function loadScenario(scenario = 'recovery', { signal } = {}) {
    requireScenario(scenario)
    checkSignal(signal)
    if (mode === 'api') {
      return loadApiDataset({ signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario }) })
    }
    let fixture
    try {
      fixture = (await fixtureLoaders[scenario]()).default
    } catch (cause) {
      throw new DataError(`Demo fixture for ${scenario} could not be loaded.`, { code: 'FIXTURE_UNAVAILABLE', cause })
    }
    checkSignal(signal)
    return structuredClone({
      ...fixture,
      provenance: { ...fixtureSource, data_commit: fixtureSource.data_ref, stats_commit: fixtureSource.stats_ref },
      dataset_id: scenario,
      source: 'demo',
    })
  }

  async function uploadCsv(file, { signal } = {}) {
    if (mode !== 'api') {
      throw new DataError('CSV upload requires API mode and a running backend. Select API mode to upload a file.', { code: 'API_REQUIRED' })
    }
    checkSignal(signal)
    if (!(file instanceof Blob)) {
      throw new DataError('Choose a CSV file to upload.', { code: 'INVALID_FILE' })
    }
    const body = new FormData()
    body.append('file', file, file.name || 'upload.csv')
    return loadApiDataset({ signal, body })
  }

  async function getHourlyView(bundle, { windowDays = 14, smooth = 1, signal } = {}) {
    if (![14, 7].includes(windowDays) || ![1, 3].includes(smooth)) {
      throw new DataError('Hourly views support windowDays 14 or 7 and smooth 1 or 3.', { code: 'INVALID_VIEW' })
    }
    checkSignal(signal)
    if (!bundle || bundle.source !== mode || typeof bundle.dataset_id !== 'string' || !bundle.dataset_id) {
      throw new DataError('Load a dataset in the selected data mode before requesting an hourly view.', { code: 'DATASET_REQUIRED' })
    }
    if (mode === 'demo') return structuredClone(hourlyFields(bundle.hourly_views?.[`${windowDays}_${smooth}`]))
    const query = new URLSearchParams({ dataset_id: bundle.dataset_id, window: String(windowDays), smooth: String(smooth) })
    const summary = validateSummary(await request(`/zones/summary?${query}`, { signal, context: 'Hourly view failed' }))
    return hourlyFields(summary)
  }

  return { mode, loadScenario, uploadCsv, getHourlyView }
}

const demoClient = createDataClient()

export function getDashboard(scenario = 'recovery', options) {
  return demoClient.loadScenario(scenario, options)
}

export async function getZoneSummary(scenario = 'recovery', options) {
  return (await getDashboard(scenario, options)).summary
}

export async function getZoneAnalysis(zoneId, scenario = 'recovery', options) {
  requireZone(zoneId)
  return (await getDashboard(scenario, options)).analyses[zoneId]
}
