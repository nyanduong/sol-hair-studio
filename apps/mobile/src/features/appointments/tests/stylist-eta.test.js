import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateStylistEta } from '../api/stylist-eta.api.js'
import { stylistAppointmentDto } from '../api/stylist-appointments.api.js'
import { canUpdateStylistEta, defaultStylistEtaInput, etaInputToIso, formatEtaTime, selectStylistEtaSummary, stylistEtaImpact, stylistEtaPayload } from '../appointment-eta.js'
import { createStylistEtaCommand } from '../hooks/stylist-eta-command.js'
import { createStylistAppointmentReader } from '../hooks/stylist-appointments-reader.js'

const id = '111111111111111111111111', accountId = 'aaaaaaaaaaaaaaaaaaaaaaaa', staffId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const account = { accountId, roles: ['stylist'], status: 'active' }, staff = { accountId, staffId, isActive: true }
const now = Date.parse('2026-10-23T16:00:00.000Z')
const appointment = { id, staffId, staffNameSnapshot: 'An', status: 'in_progress', revision: 5,
  startAt: '2026-10-23T15:00:00.000Z', endAt: '2026-10-23T16:30:00.000Z', startedAt: '2026-10-23T15:00:01.000Z',
  localDate: '2026-10-23', timeZone: 'Asia/Ho_Chi_Minh', confirmedAt: '2026-10-22T01:00:00.000Z',
  customerSnapshot: { displayName: 'Khách A', phone: '+84901234567' },
  items: [{ serviceId: 'cut', name: 'Snapshot cũ', priceVnd: 150000, durationMinutes: 90 }],
  totalDurationMinutes: 90, totalPriceVnd: 150000 }
const eta = '2026-10-23T17:15:30.000Z'
const warning = { id: '222222222222222222222222', staffId, status: 'confirmed',
  startAt: '2026-10-23T17:00:00.000Z', endAt: '2026-10-23T17:30:00.000Z', reasons: ['staff_overlap', 'customer_overlap'] }
const result = { ...appointment, revision: 6, estimatedEndAt: eta, occupiedUntil: '2026-10-23T17:25:30.000Z',
  affectedAppointments: [warning], ownerReviewRequired: true }
const payload = { expectedRevision: 5, estimatedEndAt: eta }, key = '00000000-0000-4000-8000-000000000001'
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
function setup(overrides = {}) {
  const readProfile = vi.fn().mockResolvedValue({ account }), readStaff = vi.fn().mockResolvedValue([staff])
  const readDetail = vi.fn().mockResolvedValue(appointment), send = vi.fn().mockResolvedValue(result)
  const newKey = vi.fn(() => key), onChanged = vi.fn()
  const command = createStylistEtaCommand({ accountId, appointmentId: id, readProfile, readStaff, readDetail, send, newKey, onChanged, now: () => now, ...overrides })
  return { command, readDetail, send, newKey, onChanged, ...overrides }
}
function choose(command) {
  expect(command.open(appointment)).toBe(true)
  command.edit('date', '2026-10-24'); command.edit('time', '00:15:30')
  expect(command.confirm()).toBe(true)
}
function respond(data, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(status < 400 ? { data } : data), { status }))
  vi.stubGlobal('fetch', fetch); return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('ETA input and Vietnam time', () => {
  it('converts a next-day Vietnam input to exact UTC ISO without applying a booking grid', () => {
    expect(etaInputToIso('2026-10-24', '00:15:30')).toBe(eta)
    expect(stylistEtaPayload(appointment, '2026-10-24', '00:15:30', now)).toEqual(payload)
    expect(formatEtaTime(eta)).toContain('24/10/2026')
    expect(formatEtaTime(eta)).toContain('00:15:30')
  })
  it.each([['2026-10-23', '22:00'], ['2026-10-23', '23:00'], ['2026-10-23', '23:30']])('rejects past/now/planned-end equality %s %s', (date, time) => {
    expect(() => stylistEtaPayload(appointment, date, time, now)).toThrow()
  })
  it.each([['2026-02-30', '12:00'], ['bad', '12:00'], ['2026-10-24', '24:00'], ['2026-10-24', '12:60'], ['2026-10-24', '1:00']])(
    'rejects invalid date/time %s %s', (date, time) => expect(() => etaInputToIso(date, time)).toThrow())
  it.each(['confirmed', 'completed', 'cancelled', 'no_show'])('does not allow ETA for %s', status => {
    expect(canUpdateStylistEta({ ...appointment, status })).toBe(false)
    expect(() => stylistEtaPayload({ ...appointment, status }, '2026-10-24', '00:15:30', now)).toThrow()
  })
  it('allows an estimate earlier than prior ETA and beyond booking horizon, without a new scheduled lead-time', () => {
    expect(stylistEtaPayload({ ...appointment, estimatedEndAt: '2026-10-25T00:00:00.000Z' }, '2026-10-24', '00:15:30', now)).toEqual(payload)
    expect(stylistEtaPayload(appointment, '2026-11-24', '00:15:30', now).estimatedEndAt).toBe('2026-11-23T17:15:30.000Z')
  })
  it('defaults to a future estimate after planned end even across midnight; does not truncate into the past', () => {
    const input = defaultStylistEtaInput(appointment, now)
    expect(Date.parse(etaInputToIso(input.date, input.time))).toBeGreaterThan(Date.parse(appointment.endAt))
    const nearlyPast = { ...appointment, estimatedEndAt: new Date(now + 500).toISOString(), endAt: new Date(now - 1000).toISOString() }
    const next = defaultStylistEtaInput(nearlyPast, now)
    expect(Date.parse(etaInputToIso(next.date, next.time))).toBeGreaterThan(now)
  })
})

describe('ETA warnings and API security', () => {
  it('uses only ETA POST with actual body, Bearer/key, signal and ten-minute cleanup response', async () => {
    const fetch = respond(result), controller = new AbortController()
    const data = await updateStylistEta('http://10.0.2.2:4000', 'token', id, payload, key, controller.signal)
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('http://10.0.2.2:4000/api/appointments/' + id + '/eta')
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body)).toEqual(payload)
    expect(request.headers.get('Authorization')).toBe('Bearer token')
    expect(request.headers.get('Idempotency-Key')).toBe(key)
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(data.occupiedUntil).toBe(result.occupiedUntil)
    expect(data.affectedAppointments).toEqual([warning])
    expect(data.startAt).toBe(appointment.startAt); expect(data.endAt).toBe(appointment.endAt)
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('GET detail retains all permitted impact rows after reload and strips contact fields from warning rows', () => {
    const warnings = Array.from({ length: 35 }, (_, index) => ({ ...warning, id: (index + 100).toString(16).padStart(24, '0'), customerSnapshot: { phone: 'private' }, email: 'private' }))
    const data = stylistAppointmentDto({ ...result, affectedAppointments: warnings }, true)
    expect(data.affectedAppointments).toHaveLength(35)
    expect(JSON.stringify(data.affectedAppointments)).not.toContain('private')
    expect(data.estimatedEndAt).toBe(eta)
  })
  it('empty visible warnings with ownerReviewRequired=true is valid; does not invent hidden appointments/counts', () => {
    expect(stylistEtaImpact({ ...result, affectedAppointments: [] })).toEqual({ affectedAppointments: [], ownerReviewRequired: true })
  })
  it.each([
    [{ ...warning, staffId: accountId }], [{ ...warning, id }], [warning, warning],
    [{ ...warning, reasons: ['unknown'] }], [{ ...warning, status: 'completed' }], [{ ...warning, startAt: 'bad' }],
  ])('rejects foreign/invalid warning rows %j', warnings => {
    expect(() => stylistEtaImpact({ ...result, affectedAppointments: warnings })).toThrow()
  })
  it('does not accept missing warnings or inconsistent review flag as a complete success', async () => {
    respond({ ...result, affectedAppointments: undefined })
    await expect(updateStylistEta('https://api.test', 'token', id, payload, key)).rejects.toThrow()
    expect(() => stylistEtaImpact({ ...result, ownerReviewRequired: false })).toThrow()
  })
  it.each([{ revision: 5 }, { status: 'completed' }, { estimatedEndAt: appointment.endAt }, { occupiedUntil: eta }])('malformed 200 %j stays uncertain', async change => {
    respond({ ...result, ...change })
    await expect(updateStylistEta('https://api.test', 'token', id, payload, key)).rejects.toThrow()
  })
  it.each([401, 403, 404, 409, 400, 503])('preserves HTTP %s error contract', async status => {
    respond({ code: 'INVALID_ETA', message: 'server' }, status)
    await expect(updateStylistEta('https://api.test', 'token', id, payload, key)).rejects.toMatchObject({ status, code: 'INVALID_ETA' })
  })
  it('rejects client status/planned fields before sending', async () => {
    const fetch = respond(result)
    await expect(updateStylistEta('https://api.test', 'token', id, { ...payload, endAt: eta }, key)).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('ETA command confirmation/concurrency', () => {
  it('opening/editing does not send; confirmation is required and changing input clears confirmation', async () => {
    const { command, send } = setup()
    command.open(appointment); await command.submit()
    expect(send).not.toHaveBeenCalled()
    command.edit('time', 'bad')
    expect(command.confirm()).toBe(false)
    choose(command)
    command.edit('time', '00:16')
    expect(command.getSnapshot().confirming).toBe(false)
    await command.submit(); expect(send).not.toHaveBeenCalled()
    expect(command.close()).toBe(true)
  })
  it('publishes no optimistic ETA; double-submit shares one POST/key and locks editing/close', async () => {
    const wait = deferred(), { command, send, newKey, onChanged } = setup({ send: vi.fn(() => wait.promise) })
    choose(command)
    const job = command.submit()
    expect(command.submit()).toBe(job)
    expect(command.close()).toBe(false)
    expect(command.back()).toBe(false)
    expect(command.edit('time', '02:00')).toBe(false)
    expect(command.getSnapshot().appointment.estimatedEndAt).toBeUndefined()
    expect(onChanged).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    wait.resolve(result); await job
    expect(command.getSnapshot()).toMatchObject({ kind: 'success', pending: null })
    expect(newKey).toHaveBeenCalledOnce()
    expect(onChanged).toHaveBeenCalledWith(result)
  })
  it('past ETA is revalidated when confirming and before POST', async () => {
    let clock = now
    const { command, send } = setup({ now: () => clock })
    choose(command); clock = Date.parse(eta)
    await command.submit()
    expect(send).not.toHaveBeenCalled()
    expect(command.getSnapshot().confirming).toBe(false)
  })
  it.each([null, { ...account, roles: ['customer'] }, { ...account, roles: ['owner', 'stylist'] }, { ...account, accountId: 'other' }])(
    'fresh identity %j cannot POST ETA', async profile => {
      const { command, send } = setup({ readProfile: async () => ({ account: profile }) })
      choose(command); await command.submit()
      expect(send).not.toHaveBeenCalled()
      expect(command.getSnapshot().kind).toBe('rejected')
    })
  it('assignment mismatch blocks POST even for known appointment ID', async () => {
    const { command, send } = setup({ readDetail: async () => ({ ...appointment, staffId: accountId }) })
    choose(command); await command.submit()
    expect(send).not.toHaveBeenCalled()
    expect(command.getSnapshot().error.status).toBe(404)
  })
  it('revision conflict refreshes and requires review without changing revision automatically', async () => {
    const { command, send, onChanged } = setup({ readDetail: async () => ({ ...appointment, revision: 9 }) })
    choose(command); await command.submit()
    expect(command.getSnapshot()).toMatchObject({ kind: 'rejected', pending: null })
    expect(onChanged).toHaveBeenCalledOnce()
    await command.submit(); expect(send).not.toHaveBeenCalled()
  })
  it.each([401, 403, 404, 409, 400])('handles definite HTTP %s without auto-retry', async status => {
    const { command, send } = setup({ send: vi.fn().mockRejectedValue(Object.assign(new Error('server'), { status, code: 'INVALID_ETA' })) })
    choose(command); await command.submit()
    expect(command.getSnapshot()).toMatchObject({ kind: 'rejected', pending: null })
    await command.submit(); expect(send).toHaveBeenCalledOnce()
  })
  it.each([new Error('network'), Object.assign(new Error('timeout'), { status: 408 }), Object.assign(new Error('unknown'), { status: 503 })])(
    'unknown outcome keeps original ETA/payload/key; verifies GET before retry', async error => {
      const send = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(result)
      const { command, newKey, readDetail } = setup({ send })
      choose(command); await command.submit()
      expect(command.getSnapshot().pending.payload).toEqual(payload)
      expect(command.open(appointment)).toBe(false)
      await command.submit()
      expect(newKey).toHaveBeenCalledOnce()
      expect(readDetail).toHaveBeenCalledTimes(2)
      expect(send.mock.calls.map(call => call.slice(0, 2))).toEqual([[payload, key], [payload, key]])
    })
  it('lost successful response uses fresh GET warnings without another POST', async () => {
    const updatedImpact = { ...result, affectedAppointments: [], ownerReviewRequired: false }
    const readDetail = vi.fn().mockResolvedValueOnce(appointment).mockResolvedValueOnce(updatedImpact)
    const { command, send, onChanged } = setup({ readDetail, send: vi.fn().mockRejectedValue(new Error('response lost')) })
    choose(command); await command.submit(); await command.submit()
    expect(send).toHaveBeenCalledOnce()
    expect(onChanged).toHaveBeenCalledWith(updatedImpact)
  })
  it('pending replay remains possible after original ETA expires, without generating a new estimate', async () => {
    let clock = now
    const send = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(result)
    const { command, newKey } = setup({ send, now: () => clock })
    choose(command); await command.submit(); clock = Date.parse(eta) + 1000
    await command.submit()
    expect(newKey).toHaveBeenCalledOnce()
    expect(send.mock.calls[1][0]).toEqual(payload)
  })
  it('logout/account switch aborts and ignores a late POST result', async () => {
    const wait = deferred(), { command, send, onChanged } = setup({ send: vi.fn(() => wait.promise) })
    choose(command); const job = command.submit()
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    command.cancel()
    wait.resolve(result); await job
    expect(send.mock.calls[0][2].aborted).toBe(true)
    expect(command.getSnapshot()).toMatchObject({ kind: 'idle', appointment: null, pending: null })
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('ETA refresh and warning precedence', () => {
  it('prefers same-revision GET warnings, clears stale POST on completed/permission loss and isolates ID', () => {
    const newer = { ...result, affectedAppointments: [], ownerReviewRequired: false }
    expect(selectStylistEtaSummary({ kind: 'success', appointment: newer }, result, id)).toBe(newer)
    expect(selectStylistEtaSummary({ kind: 'success', appointment: { ...newer, status: 'completed' } }, result, id)).toBeNull()
    expect(selectStylistEtaSummary({ kind: 'denied' }, result, id)).toBeNull()
    expect(selectStylistEtaSummary({ kind: 'notFound' }, result, id)).toBeNull()
    expect(selectStylistEtaSummary({ kind: 'loading' }, result, accountId)).toBeNull()
    expect(selectStylistEtaSummary({ kind: 'loading' }, result, id)).toBe(result)
  })
  it('refreshes Detail/List using server ETA without changing planned times or other appointments', async () => {
    let server = appointment
    const config = { accountId, readProfile: async () => ({ account }), readStaff: async () => [staff] }
    const detail = createStylistAppointmentReader({ ...config, appointmentId: id, readDetail: async () => server })
    const list = createStylistAppointmentReader({ ...config, readPage: async () => ({
      items: [server], pagination: { hasNextPage: false, nextCursor: null },
    }) })
    await detail.load(); await list.load()
    const { command, send } = setup({ send: vi.fn(async () => { server = result; return server }), onChanged: () => detail.refresh() })
    const originalWarning = JSON.stringify(warning)
    choose(command); await command.submit()
    await vi.waitFor(() => expect(detail.getSnapshot().appointment?.estimatedEndAt).toBe(eta))
    list.cancel(); await list.load()
    expect(list.getSnapshot().items[0].startAt).toBe(appointment.startAt)
    expect(detail.getSnapshot().appointment.endAt).toBe(appointment.endAt)
    expect(detail.getSnapshot().appointment.completedAt).toBeUndefined()
    expect(JSON.stringify(warning)).toBe(originalWarning)
    expect(send).toHaveBeenCalledOnce()
  })
})
