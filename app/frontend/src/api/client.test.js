import { describe, expect, it, vi } from 'vitest'
import normalFixture from '../mocks/normal.json'
import fixtureSource from '../mocks/source.json'
import { createDataClient, DataError, getDashboard, getZoneAnalysis, getZoneSummary, SCENARIOS } from './client'

const zoneIds = ['A', 'B', 'C', 'D', 'E', 'F']
const makeMetadata = () => ({
  settings: { ...normalFixture.summary.settings },
  baseline: { ...normalFixture.summary.baseline },
  monitoring: { ...normalFixture.summary.monitoring },
  slowest_incidents: [],
})
const makeSummary = () => ({
  ...makeMetadata(),
  zones: zoneIds.map((zone_id) => ({ zone_id, late_rate: 0.123456789012345, p90_min: null, deterioration_flag: null, status: 'insufficient_evidence' })),
})
const makeAnalysis = (zoneId) => ({
  ...makeMetadata(),
  summary: makeSummary().zones.find((zone) => zone.zone_id === zoneId),
  daily_p_chart: { points: [{ date: '2026-10-01', p: 0.123456789012345, ucl: null, deterioration_flag: null }] },
  stages: [],
  time_of_day: { bands: [] },
})
const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(payload) })

function makeFetch({ datasetId = 'dataset 42/#', summary = makeSummary(), analyses, loaded = {} } = {}) {
  return vi.fn(async (url) => {
    const { pathname } = new URL(url, 'http://localhost')
    if (pathname.endsWith('/health')) return response({ status: 'ok', version: '0.1.0' })
    if (pathname.endsWith('/datasets/load')) return response({ dataset_id: datasetId, source: 'scenario', rows: 16800, ...loaded })
    if (pathname.endsWith('/zones/summary')) return response(summary)
    const zone = pathname.match(/\/zones\/([A-F])\/analysis$/)?.[1]
    if (zone) return response(analyses?.[zone] ?? makeAnalysis(zone))
    throw new Error(`Unexpected request: ${url}`)
  })
}

describe('demo mode', () => {
  it('exposes only the three supported scenarios', () => {
    expect(SCENARIOS.map(({ id }) => id)).toEqual(['normal', 'recovery', 'morning_tail'])
  })

  it('clones the precomputed fixture, retains provenance, and never uses fetch', async () => {
    const fetchImpl = vi.fn()
    const client = createDataClient({ fetchImpl })
    const first = await client.loadScenario('normal')
    expect(first.summary).toEqual(normalFixture.summary)
    expect(first.analyses).toEqual(normalFixture.analyses)
    expect(first.hourly_views).toEqual(normalFixture.hourly_views)
    expect(first).toMatchObject({ source: 'demo', dataset_id: 'normal', provenance: { data_ref: fixtureSource.data_ref, stats_ref: fixtureSource.stats_ref } })
    first.summary.zones[0].late_rate = -1
    first.analyses.A.summary.late_rate = -1
    const second = await client.loadScenario('normal')
    expect(second.summary).toEqual(normalFixture.summary)
    expect(second.analyses).toEqual(normalFixture.analyses)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps the legacy read wrappers usable', async () => {
    expect((await getDashboard('normal')).source).toBe('demo')
    expect(await getZoneSummary('normal')).toEqual(normalFixture.summary)
    expect(await getZoneAnalysis('D', 'normal')).toEqual(normalFixture.analyses.D)
    await expect(getZoneAnalysis('G', 'normal')).rejects.toMatchObject({ code: 'UNKNOWN_ZONE' })
  })

  it('selects the exact precomputed window and smoothing without deriving statistics', async () => {
    const hourly_views = Object.fromEntries(['14_1', '7_1', '14_3', '7_3'].map((key) => [key, {
      hour_heatmap: { cells: [{ change_pts: 0, status: 'insufficient_evidence' }], key },
      time_of_day_all_zones: { D: [{ flag: null, key }] },
    }]))
    const bundle = { source: 'demo', dataset_id: 'normal', hourly_views }
    const client = createDataClient()
    for (const windowDays of [14, 7]) {
      for (const smooth of [1, 3]) {
        const result = await client.getHourlyView(bundle, { windowDays, smooth })
        expect(result).toEqual(hourly_views[`${windowDays}_${smooth}`])
        expect(result).not.toBe(hourly_views[`${windowDays}_${smooth}`])
      }
    }
  })

  it('returns null hourly fields when a precomputed view is absent', async () => {
    const client = createDataClient()
    expect(await client.getHourlyView({ source: 'demo', dataset_id: 'normal' }, { windowDays: 7, smooth: 3 }))
      .toEqual({ hour_heatmap: null, time_of_day_all_zones: null })
  })

  it('requires API mode for uploads instead of calculating statistics in the browser', async () => {
    const fetchImpl = vi.fn()
    await expect(createDataClient({ fetchImpl }).uploadCsv(new Blob(['a,b\n1,2']))).rejects.toMatchObject({ code: 'API_REQUIRED', status: null, errors: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('API mode', () => {
  it('uses all four endpoint types, encodes dataset ids, and preserves unrounded values and nulls', async () => {
    const fetchImpl = makeFetch()
    const signal = new AbortController().signal
    const bundle = await createDataClient({ mode: 'api', fetchImpl }).loadScenario('morning_tail', { signal })
    expect(fetchImpl).toHaveBeenCalledTimes(9)
    expect(fetchImpl.mock.calls[0]).toEqual(['/api/health', expect.objectContaining({ method: 'GET', signal })])
    expect(fetchImpl.mock.calls[1]).toEqual(['/api/datasets/load', expect.objectContaining({ method: 'POST', signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: 'morning_tail' }) })])
    const readCalls = fetchImpl.mock.calls.slice(2)
    expect(readCalls.map(([url]) => new URL(url, 'http://localhost').pathname)).toEqual(['/api/zones/summary', ...zoneIds.map((id) => `/api/zones/${id}/analysis`)])
    for (const [url, options] of readCalls) {
      const parsed = new URL(url, 'http://localhost')
      expect(parsed.searchParams.get('dataset_id')).toBe('dataset 42/#')
      if (parsed.pathname.endsWith('/analysis')) expect(parsed.searchParams.get('window')).toBe('14')
      expect(options).toMatchObject({ method: 'GET', signal })
    }
    expect(bundle).toMatchObject({ source: 'api', dataset_id: 'dataset 42/#', provenance: { data_ref: null, stats_ref: null } })
    expect(bundle.summary).toEqual(makeSummary())
    for (const zoneId of zoneIds) expect(bundle.analyses[zoneId]).toEqual(makeAnalysis(zoneId))
  })

  it('fetches the summary and all six analyses concurrently after loading the dataset', async () => {
    const normalFetch = makeFetch()
    const readers = []
    const fetchImpl = vi.fn((url, options) => {
      if (!url.includes('/zones/')) return normalFetch(url, options)
      return new Promise((resolve) => readers.push(() => resolve(normalFetch(url, options))))
    })
    const pending = createDataClient({ mode: 'api', fetchImpl }).loadScenario('normal')
    await vi.waitFor(() => expect(readers).toHaveLength(7))
    readers.forEach((resolve) => resolve())
    expect((await pending).analyses.F).toEqual(makeAnalysis('F'))
  })

  it('supports an absolute API base with a trailing slash', async () => {
    const fetchImpl = makeFetch()
    await createDataClient({ mode: 'api', baseUrl: 'http://127.0.0.1:8000/', fetchImpl }).loadScenario('normal')
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:8000/health')
    expect(fetchImpl.mock.calls.every(([url]) => url.startsWith('http://127.0.0.1:8000/'))).toBe(true)
  })

  it('uploads multipart data with field file and lets fetch set its content type', async () => {
    const fetchImpl = makeFetch({ datasetId: 'uploaded.csv', loaded: { source: 'upload', provenance: { data_ref: 'server-data', stats_ref: 'server-stats' } } })
    const file = Object.assign(new Blob(['incident_id,zone_id\nINC-1,A'], { type: 'text/csv' }), { name: 'calls.csv' })
    const signal = new AbortController().signal
    const bundle = await createDataClient({ mode: 'api', fetchImpl }).uploadCsv(file, { signal })
    const [, options] = fetchImpl.mock.calls[1]
    expect(options.body).toBeInstanceOf(FormData)
    expect([...options.body.keys()]).toEqual(['file'])
    expect(options.body.get('file').name).toBe('calls.csv')
    expect(await options.body.get('file').text()).toBe('incident_id,zone_id\nINC-1,A')
    expect(options.headers).toEqual({ Accept: 'application/json' })
    expect(fetchImpl.mock.calls.every(([, request]) => request.signal === signal)).toBe(true)
    expect(bundle).toMatchObject({ source: 'api', dataset_id: 'uploaded.csv', provenance: { data_ref: 'server-data', stats_ref: 'server-stats' } })
  })

  it('requests hourly fields from the same loaded dataset and passes through their status', async () => {
    const hour_heatmap = { cells: [{ zone_id: 'D', hour: 5, change_pts: 0, status: 'insufficient_evidence' }] }
    const time_of_day_all_zones = { D: [{ flag: null, status: 'insufficient_evidence' }] }
    const fetchImpl = makeFetch({ summary: { ...makeSummary(), hour_heatmap, time_of_day_all_zones } })
    const signal = new AbortController().signal
    const client = createDataClient({ mode: 'api', fetchImpl })
    const bundle = await client.loadScenario('recovery')
    expect(await client.getHourlyView(bundle, { windowDays: 7, smooth: 3, signal })).toEqual({ hour_heatmap, time_of_day_all_zones })
    const [url, options] = fetchImpl.mock.calls.at(-1)
    expect(new URL(url, 'http://localhost').searchParams).toEqual(new URLSearchParams({ dataset_id: bundle.dataset_id, window: '7', smooth: '3' }))
    expect(options.signal).toBe(signal)
  })

  it('allows a core-only server and returns missing H-10 fields as null', async () => {
    const client = createDataClient({ mode: 'api', fetchImpl: makeFetch() })
    const bundle = await client.loadScenario('normal')
    expect(bundle.analyses.A.time_of_day).toEqual({ bands: [] })
    expect(await client.getHourlyView(bundle)).toEqual({ hour_heatmap: null, time_of_day_all_zones: null })
  })

  it('normalizes absent older-server time bands without fabricating numbers', async () => {
    const analysis = makeAnalysis('A')
    delete analysis.time_of_day
    const client = createDataClient({ mode: 'api', fetchImpl: makeFetch({ analyses: { A: analysis } }) })
    const bundle = await client.loadScenario('normal')
    expect(bundle.analyses.A.time_of_day).toEqual({ bands: [] })
    expect(bundle.analyses.A.daily_p_chart).toEqual(analysis.daily_p_chart)
    expect(analysis.time_of_day).toBeUndefined()
  })
})

describe('errors and cancellation', () => {
  it.each(['demo', 'api'])('rejects a removed or unknown scenario locally in %s mode', async (mode) => {
    const fetchImpl = vi.fn()
    const client = createDataClient({ mode, fetchImpl })
    for (const scenario of ['hidden_tail', 'unknown', '__proto__']) {
      await expect(client.loadScenario(scenario)).rejects.toMatchObject({ name: 'DataError', code: 'UNKNOWN_SCENARIO', errors: [] })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([404, 503])('reports a missing or failed health endpoint with HTTP %i and stops loading', async (status) => {
    const fetchImpl = vi.fn(async () => response({ error: 'service unavailable' }, status))
    await expect(createDataClient({ mode: 'api', fetchImpl }).loadScenario('normal')).rejects.toMatchObject({ name: 'DataError', status, code: 'HTTP_ERROR', message: expect.stringContaining(`health check failed (HTTP ${status})`) })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('requires health to explicitly report status ok before loading a dataset', async () => {
    const fetchImpl = vi.fn(async () => response({ version: '0.1.0' }))
    await expect(createDataClient({ mode: 'api', fetchImpl }).loadScenario('normal')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', message: expect.stringContaining('health') })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not substitute demo fixtures when the network is unavailable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const pending = createDataClient({ mode: 'api', fetchImpl }).loadScenario('normal')
    await expect(pending).rejects.toBeInstanceOf(DataError)
    await expect(pending).rejects.toMatchObject({ status: null, code: 'NETWORK_ERROR', message: expect.stringContaining('Failed to fetch') })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each([404, 409])('preserves HTTP %i analysis failures without a fixture fallback', async (status) => {
    const workingFetch = makeFetch()
    const fetchImpl = vi.fn((url, options) => url.includes('/zones/C/analysis') ? response({ error: status === 404 ? 'unknown zone' : 'no dataset loaded' }, status) : workingFetch(url, options))
    await expect(createDataClient({ mode: 'api', fetchImpl }).loadScenario('recovery')).rejects.toMatchObject({ status, code: 'HTTP_ERROR', message: expect.stringContaining(`HTTP ${status}`) })
  })

  it.each([
    [{ errors: [{ row: 17, field: 'on_scene_at', reason: 'missing timestamp' }] }, [{ row: 17, field: 'on_scene_at', reason: 'missing timestamp' }]],
    [{ detail: [{ loc: ['body', 'file'], msg: 'Field required', type: 'missing' }] }, [{ row: null, field: 'file', reason: 'Field required' }]],
    [{ detail: { errors: [{ row: 42, field: 'unit_en_route_at', reason: 'earlier than unit_notified_at' }] } }, [{ row: 42, field: 'unit_en_route_at', reason: 'earlier than unit_notified_at' }]],
  ])('normalizes upload validation details from %j', async (payload, errors) => {
    const workingFetch = makeFetch()
    const fetchImpl = vi.fn((url, options) => url.endsWith('/datasets/load') ? response(payload, 422) : workingFetch(url, options))
    await expect(createDataClient({ mode: 'api', fetchImpl }).uploadCsv(new Blob(['invalid csv']))).rejects.toMatchObject({ name: 'DataError', status: 422, errors })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('retains a FastAPI string detail in the error message', async () => {
    const workingFetch = makeFetch()
    const fetchImpl = vi.fn((url, options) => url.endsWith('/datasets/load') ? response({ detail: 'CSV has no rows' }, 422) : workingFetch(url, options))
    await expect(createDataClient({ mode: 'api', fetchImpl }).loadScenario('normal')).rejects.toMatchObject({ status: 422, errors: [], message: expect.stringContaining('CSV has no rows') })
  })

  it.each([
    ['missing dataset id', { loaded: { dataset_id: null } }, 'dataset_id'],
    ['missing summary zones', { summary: {} }, 'zones array'],
    ['missing analysis points', { analyses: { A: { summary: { zone_id: 'A' }, daily_p_chart: {} } } }, 'daily_p_chart.points'],
    ['wrong analysis zone', { analyses: { A: makeAnalysis('B') } }, "another zone's summary"],
  ])('rejects incomplete core JSON: %s', async (_, options, expectedMessage) => {
    await expect(createDataClient({ mode: 'api', fetchImpl: makeFetch(options) }).loadScenario('normal')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', message: expect.stringContaining(expectedMessage) })
  })

  it.each([
    ['settings', (summary) => { delete summary.settings }, 'settings'],
    ['baseline', (summary) => { delete summary.baseline }, 'baseline'],
    ['monitoring', (summary) => { delete summary.monitoring }, 'monitoring'],
    ['duplicate zone', (summary) => { summary.zones[1].zone_id = 'A' }, 'each zone A to F exactly once'],
    ['unknown zone', (summary) => { summary.zones[0].zone_id = 'G' }, 'each zone A to F exactly once'],
    ['missing zone', (summary) => { summary.zones.pop() }, 'each zone A to F exactly once'],
    ['incidents', (summary) => { delete summary.slowest_incidents }, 'slowest_incidents'],
  ])('rejects a malformed real summary fixture: %s', async (_, corrupt, expectedMessage) => {
    const summary = structuredClone(normalFixture.summary)
    corrupt(summary)
    await expect(createDataClient({ mode: 'api', fetchImpl: makeFetch({ summary }) }).loadScenario('normal')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', message: expect.stringContaining(expectedMessage) })
  })

  it.each([
    ['settings', (analysis) => { delete analysis.settings }, 'settings'],
    ['zone id', (analysis) => { delete analysis.summary.zone_id }, "another zone's summary"],
    ['stages', (analysis) => { delete analysis.stages }, 'stages'],
    ['incidents', (analysis) => { delete analysis.slowest_incidents }, 'slowest_incidents'],
    ['bands', (analysis) => { analysis.time_of_day.bands = {} }, 'time_of_day.bands'],
    ['daily null point', (analysis) => { analysis.daily_p_chart.points = [null] }, 'daily_p_chart.points'],
  ])('rejects a malformed real analysis fixture: %s', async (_, corrupt, expectedMessage) => {
    const analysis = structuredClone(normalFixture.analyses.A)
    corrupt(analysis)
    await expect(createDataClient({ mode: 'api', fetchImpl: makeFetch({ analyses: { A: analysis } }) }).loadScenario('normal')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', message: expect.stringContaining(expectedMessage) })
  })

  it('rejects successful responses that do not contain JSON', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') } }))
    await expect(createDataClient({ mode: 'api', fetchImpl }).loadScenario('normal')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200, message: expect.stringContaining('valid JSON') })
  })

  it.each(['demo', 'api'])('honors an already aborted signal in %s mode', async (mode) => {
    const fetchImpl = vi.fn()
    const controller = new AbortController()
    controller.abort()
    await expect(createDataClient({ mode, fetchImpl }).loadScenario('normal', { signal: controller.signal })).rejects.toMatchObject({ name: 'DataError', code: 'ABORTED', status: null })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('propagates the signal and wraps a fetch AbortError without retrying', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async (_url, options) => {
      expect(options.signal).toBe(controller.signal)
      controller.abort()
      throw new DOMException('The operation was aborted.', 'AbortError')
    })
    await expect(createDataClient({ mode: 'api', fetchImpl }).loadScenario('normal', { signal: controller.signal })).rejects.toMatchObject({ name: 'DataError', code: 'ABORTED' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('checks cancellation after reading a response before proceeding', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => { controller.abort(); return { status: 'ok' } } }))
    await expect(createDataClient({ mode: 'api', fetchImpl }).loadScenario('normal', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid hourly arguments, absent bundles, and bundles from another mode locally', async () => {
    const fetchImpl = vi.fn()
    const client = createDataClient({ mode: 'api', fetchImpl })
    await expect(client.getHourlyView({ source: 'api', dataset_id: 'x' }, { windowDays: 28 })).rejects.toMatchObject({ code: 'INVALID_VIEW' })
    await expect(client.getHourlyView({ source: 'api', dataset_id: 'x' }, { smooth: 2 })).rejects.toMatchObject({ code: 'INVALID_VIEW' })
    await expect(client.getHourlyView(null)).rejects.toMatchObject({ code: 'DATASET_REQUIRED' })
    await expect(client.getHourlyView({ source: 'demo', dataset_id: 'normal' })).rejects.toMatchObject({ code: 'DATASET_REQUIRED' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
