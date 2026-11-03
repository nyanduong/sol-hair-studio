import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelCustomerAppointment } from '../api/appointments.api.js'
import { cancellationBlockReason, cancellationErrorMessage, createCustomerCancellation } from '../hooks/customer-cancellation.js'
import { createCustomerAppointmentDetailReader } from '../hooks/customer-appointment-detail-reader.js'
import { createCustomerAppointmentsReader } from '../hooks/customer-appointments-reader.js'
import { customerAppointmentTab } from '../appointment-presentation.js'

const accountId = 'aaaaaaaaaaaaaaaaaaaaaaaa', id = '111111111111111111111111'
const now = Date.parse('2026-10-24T00:00:00.000Z')
const customer = { accountId, roles: ['customer'], status: 'active' }
const item = { id, staffId: 'bbbbbbbbbbbbbbbbbbbbbbbb', staffNameSnapshot: 'An',
  status: 'confirmed', startAt: '2026-10-24T03:00:00.000Z', endAt: '2026-10-24T03:30:00.000Z',
  confirmedAt: '2026-10-20T00:00:00.000Z', revision: 7, timeZone: 'Asia/Ho_Chi_Minh', localDate: '2026-10-24',
  totalDurationMinutes: 30, totalPriceVnd: 200000,
  items: [{ serviceId: 'cut', name: 'Snapshot', durationMinutes: 30, priceVnd: 200000 }] }
const cancelled = { ...item, status: 'cancelled', revision: 8, cancelledAt: '2026-10-24T00:00:01.000Z' }
const key = '00000000-0000-4000-8000-000000000001'
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function setup(overrides = {}) {
  const send = vi.fn().mockResolvedValue(cancelled), changed = vi.fn(), newKey = vi.fn(() => key)
  const readProfile = vi.fn().mockResolvedValue({ account: customer }), readDetail = vi.fn().mockResolvedValue(item)
  const controller = createCustomerCancellation({ accountId, appointmentId: id, now: () => now,
    send, onChanged: changed, newKey, readProfile, readDetail, ...overrides })
  return { controller, send, changed, newKey, readProfile, readDetail }
}
function respond(data = cancelled, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(status < 400 ? { data } : data), { status }))
  vi.stubGlobal('fetch', fetch); return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('Customer Mobile cancellation eligibility', () => {
  it.each([7_200_001, 7_200_000])('permits confirmed at %s ms before start, including exact cutoff', difference => {
    expect(cancellationBlockReason({ ...item, startAt: new Date(now + difference).toISOString() }, now)).toBe('')
  })
  it.each([7_199_999, 0, -1])('blocks cutoff/past boundary %s', difference => {
    expect(cancellationBlockReason({ ...item, startAt: new Date(now + difference).toISOString() }, now)).toContain('2 giờ')
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('blocks status %s without sending', async status => {
    const { controller, send } = setup()
    expect(controller.open({ ...item, status })).toBe(false)
    await controller.submit()
    expect(send).not.toHaveBeenCalled()
  })
  it('rechecks the clock when confirming an already-open dialog', async () => {
    let clock = now
    const { controller, send } = setup({ now: () => clock })
    controller.open(item)
    clock = Date.parse(item.startAt) - 7_200_000 + 1
    await controller.submit()
    expect(controller.getSnapshot()).toMatchObject({ kind: 'rejected' })
    expect(send).not.toHaveBeenCalled()
  })
  it.each([undefined, -1, 1.5])('requires actual safe revision %s', revision => {
    expect(cancellationBlockReason({ ...item, revision }, now)).toContain('tải lại')
  })
})

describe('Customer cancel HTTP contract', () => {
  it('uses existing POST endpoint, JSON expectedRevision, Bearer and idempotency key only', async () => {
    const fetch = respond(), abort = new AbortController()
    const value = await cancelCustomerAppointment('http://10.0.2.2:4000', 'token', id, { expectedRevision: 7 }, key, abort.signal)
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('http://10.0.2.2:4000/api/appointments/' + id + '/cancel')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ expectedRevision: 7 })
    expect(options.headers.get('Authorization')).toBe('Bearer token')
    expect(options.headers.get('Idempotency-Key')).toBe(key)
    expect(options.headers.get('Content-Type')).toBe('application/json')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(value).toMatchObject({ id, status: 'cancelled', revision: 8 })
  })
  it.each([401, 403, 404, 409, 400, 408, 503])('keeps HTTP %s and error contract', async status => {
    respond({ code: 'CANCELLATION_CUTOFF', message: 'server' }, status)
    await expect(cancelCustomerAppointment('https://api.test', 'token', id, { expectedRevision: 7 }, key))
      .rejects.toMatchObject({ status, code: 'CANCELLATION_CUTOFF' })
  })
  it.each([{ expectedRevision: -1 }, { expectedRevision: 7, reason: 'extra' }, {}])('rejects invalid/unapproved payload %j before network', async payload => {
    const fetch = respond()
    await expect(cancelCustomerAppointment('https://api.test', 'token', id, payload, key)).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{ status: 'confirmed' }, { revision: 7 }, { cancelledAt: 'bad' }, { id: '222222222222222222222222' }])('does not claim success for malformed 200 %j', async change => {
    respond({ ...cancelled, ...change })
    await expect(cancelCustomerAppointment('https://api.test', 'token', id, { expectedRevision: 7 }, key)).rejects.toThrow('kết quả')
  })
})

describe('Cancellation confirmation and command lifecycle', () => {
  it('opens/closes confirmation without mutation; successful submit refreshes only after server response', async () => {
    const wait = deferred(), { controller, send, changed } = setup({ send: vi.fn(() => wait.promise) })
    expect(controller.getSnapshot().visible).toBe(false)
    expect(controller.open(item)).toBe(true)
    expect(controller.getSnapshot().appointment.items).toEqual(item.items)
    expect(controller.close()).toBe(true)
    expect(send).not.toHaveBeenCalled()
    controller.open(item)
    const job = controller.submit()
    expect(controller.getSnapshot().kind).toBe('loading')
    expect(changed).not.toHaveBeenCalled()
    expect(controller.close()).toBe(false)
    wait.resolve(cancelled); await job
    expect(controller.getSnapshot()).toMatchObject({ kind: 'success', visible: false, pending: null })
    expect(changed).toHaveBeenCalledOnce()
  })
  it('double-submit shares one POST/key and locks closing or replacing the intent', async () => {
    const wait = deferred(), send = vi.fn(() => wait.promise)
    const { controller, newKey } = setup({ send })
    controller.open(item)
    const first = controller.submit(), second = controller.submit()
    expect(first).toBe(second)
    expect(controller.open({ ...item, revision: 8 })).toBe(false)
    expect(controller.reload()).toBe(false)
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(newKey).toHaveBeenCalledOnce()
    wait.resolve(cancelled); await first
    expect(send.mock.calls[0][0]).toEqual({ expectedRevision: 7 })
  })
  it.each([new Error('network'), Object.assign(new Error('timeout'), { status: 408 }),
    Object.assign(new Error('unknown transaction'), { status: 503, code: 'APPOINTMENT_COMMAND_RESULT_UNKNOWN' })])(
    'retains exact key/payload on uncertain failure, rereads server before retry', async error => {
      const send = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(cancelled)
      const { controller, newKey, readDetail } = setup({ send })
      controller.open(item); await controller.submit()
      const pending = controller.getSnapshot().pending
      expect(pending.payload).toEqual({ expectedRevision: 7 })
      expect(controller.close()).toBe(false)
      expect(controller.open(item)).toBe(false)
      await controller.submit()
      expect(newKey).toHaveBeenCalledOnce()
      expect(readDetail).toHaveBeenCalledTimes(2)
      expect(send.mock.calls.map(call => call.slice(0, 2))).toEqual([
        [{ expectedRevision: 7 }, key], [{ expectedRevision: 7 }, key],
      ])
    })
  it('reconciles an already-cancelled server result after lost response without another POST', async () => {
    const send = vi.fn().mockRejectedValue(new Error('response lost'))
    const readDetail = vi.fn().mockResolvedValueOnce(item).mockResolvedValueOnce(cancelled)
    const { controller, changed } = setup({ send, readDetail })
    controller.open(item); await controller.submit(); await controller.submit()
    expect(send).toHaveBeenCalledOnce()
    expect(controller.getSnapshot().kind).toBe('success')
    expect(changed).toHaveBeenCalledOnce()
  })
  it('allows replay of the original pending intent after cutoff; never creates a fresh key', async () => {
    let clock = now
    const send = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(cancelled)
    const { controller, newKey } = setup({ send, now: () => clock })
    controller.open(item); await controller.submit()
    clock = Date.parse(item.startAt) - 1000
    await controller.submit()
    expect(send).toHaveBeenCalledTimes(2)
    expect(newKey).toHaveBeenCalledOnce()
  })
  it('does not lose intent if the verification GET fails, and does not send a second POST', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network'))
    const readDetail = vi.fn().mockResolvedValueOnce(item).mockRejectedValueOnce(new Error('GET failed'))
    const { controller } = setup({ send, readDetail })
    controller.open(item); await controller.submit()
    const old = controller.getSnapshot().pending
    await controller.submit()
    expect(controller.getSnapshot().pending).toEqual(old)
    expect(send).toHaveBeenCalledOnce()
  })
  it('preflight revision change blocks POST and reloads; no automatic retry with a new revision', async () => {
    const { controller, send, changed } = setup({ readDetail: async () => ({ ...item, revision: 8 }) })
    controller.open(item); await controller.submit()
    expect(controller.getSnapshot()).toMatchObject({ kind: 'rejected', pending: null })
    expect(send).not.toHaveBeenCalled()
    expect(changed).toHaveBeenCalledOnce()
    await controller.submit()
    expect(send).not.toHaveBeenCalled()
  })
  it.each([
    [409, 'APPOINTMENT_REVISION_CONFLICT'], [409, 'APPOINTMENT_STATE_CONFLICT'], [409, 'CANCELLATION_CUTOFF'],
    [409, 'COMMAND_KEY_CONFLICT'], [401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [404, 'APPOINTMENT_NOT_FOUND'], [400, 'INVALID_REVISION'],
  ])('handles definite %s %s without auto retry or false success', async (status, code) => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('server'), { status, code }))
    const { controller, changed } = setup({ send })
    controller.open(item); await controller.submit()
    expect(controller.getSnapshot()).toMatchObject({ kind: 'rejected', pending: null })
    expect(controller.getSnapshot().message).toBeTruthy()
    await controller.submit()
    expect(send).toHaveBeenCalledOnce()
    if (status === 409) expect(changed).toHaveBeenCalledOnce()
    expect(controller.reload()).toBe(true)
  })
  it.each([null, { ...customer, accountId: 'other' }, { ...customer, roles: ['stylist', 'customer'] },
    { ...customer, roles: ['owner', 'customer'] }, { ...customer, status: 'disabled' }])(
    'fresh identity denies changed account/role before detail or POST', async account => {
      const { controller, readDetail, send } = setup({ readProfile: async () => ({ account }) })
      controller.open(item); await controller.submit()
      expect(controller.getSnapshot().error.status).toBe(403)
      expect(readDetail).not.toHaveBeenCalled()
      expect(send).not.toHaveBeenCalled()
    })
  it('logout/account switch aborts and ignores late POST, preserving isolation', async () => {
    const wait = deferred(), send = vi.fn(() => wait.promise)
    const old = setup({ send })
    old.controller.open(item); const job = old.controller.submit()
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    old.controller.cancel()
    expect(send.mock.calls[0][2].aborted).toBe(true)
    const next = setup({ accountId: 'new-account' })
    wait.resolve(cancelled); await job
    expect(old.controller.getSnapshot()).toMatchObject({ kind: 'idle', appointment: null, pending: null })
    expect(old.changed).not.toHaveBeenCalled()
    expect(next.controller.getSnapshot().kind).toBe('idle')
    expect(next.send).not.toHaveBeenCalled()
  })
  it('logout during profile preflight prevents sending a mutation even if profile resolves late', async () => {
    const wait = deferred(), profile = vi.fn(() => wait.promise)
    const { controller, send } = setup({ readProfile: profile })
    controller.open(item); const job = controller.submit()
    await vi.waitFor(() => expect(profile).toHaveBeenCalledOnce())
    controller.cancel(); wait.resolve({ account: customer }); await job
    expect(send).not.toHaveBeenCalled()
  })
  it('provides safe uncertain feedback instead of treating a timeout as definite failure', () => {
    expect(cancellationErrorMessage(new Error('timeout'), { key })).toContain('cùng yêu cầu')
  })
})

describe('cancel integration with detail and list readers', () => {
  it('refresh replaces an in-flight old detail; returning list moves cancelled item from Upcoming to History', async () => {
    const oldRead = deferred(), readDetail = vi.fn().mockReturnValueOnce(oldRead.promise).mockResolvedValue(cancelled)
    const detail = createCustomerAppointmentDetailReader({
      accountId, appointmentId: id, readProfile: async () => ({ account: customer }), readDetail,
    })
    const oldJob = detail.load()
    await vi.waitFor(() => expect(readDetail).toHaveBeenCalledOnce())
    const { controller } = setup({ onChanged: () => detail.refresh() })
    controller.open(item); await controller.submit()
    await vi.waitFor(() => expect(detail.getSnapshot().appointment?.status).toBe('cancelled'))
    oldRead.resolve(item); await oldJob
    expect(detail.getSnapshot().appointment.revision).toBe(8)
    const readPage = vi.fn().mockResolvedValueOnce({ items: [item], pagination: { hasNextPage: false, nextCursor: null } })
      .mockResolvedValueOnce({ items: [cancelled], pagination: { hasNextPage: false, nextCursor: null } })
    const list = createCustomerAppointmentsReader({ accountId, readProfile: async () => ({ account: customer }), readPage })
    await list.load()
    expect(customerAppointmentTab(list.getSnapshot(), 'upcoming').items).toHaveLength(1)
    list.cancel(); await list.load()
    expect(customerAppointmentTab(list.getSnapshot(), 'upcoming').items).toHaveLength(0)
    expect(customerAppointmentTab(list.getSnapshot(), 'history').items[0].status).toBe('cancelled')
  })
})
