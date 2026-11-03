import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendStylistServiceCommand } from '../api/stylist-appointments.api.js'
import { createStylistServiceCommand, stylistServiceOperation, stylistServicePayload } from '../hooks/stylist-service-command.js'
import { createStylistAppointmentReader } from '../hooks/stylist-appointments-reader.js'

const accountId = 'aaaaaaaaaaaaaaaaaaaaaaaa', staffId = 'bbbbbbbbbbbbbbbbbbbbbbbb', id = '111111111111111111111111'
const account = { accountId, roles: ['stylist'], status: 'active' }
const staff = { staffId, accountId, isActive: true }
const appointment = { id, staffId, staffNameSnapshot: 'An', status: 'confirmed', revision: 4,
  startAt: '2026-10-24T03:00:00.000Z', endAt: '2026-10-24T03:30:00.000Z',
  localDate: '2026-10-24', timeZone: 'Asia/Ho_Chi_Minh', confirmedAt: '2026-10-23T01:00:00.000Z',
  customerSnapshot: { displayName: 'Khách A', phone: '+84901234567' },
  items: [{ serviceId: 'cut', name: 'Cắt snapshot', priceVnd: 150000, durationMinutes: 30 }],
  totalPriceVnd: 150000, totalDurationMinutes: 30 }
const started = { ...appointment, status: 'in_progress', revision: 5, startedAt: '2026-10-24T02:30:00.000Z' }
const completed = { ...started, status: 'completed', revision: 6, completedAt: '2026-10-24T02:50:00.000Z' }
const key = '00000000-0000-4000-8000-000000000001'
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
function setup(overrides = {}) {
  const readProfile = vi.fn().mockResolvedValue({ account }), readStaff = vi.fn().mockResolvedValue([staff])
  const readDetail = vi.fn().mockResolvedValue(appointment), send = vi.fn().mockResolvedValue(started)
  const newKey = vi.fn(() => key), onChanged = vi.fn()
  const command = createStylistServiceCommand({ accountId, appointmentId: id, readProfile, readStaff, readDetail, send, newKey, onChanged, ...overrides })
  return { command, readProfile, readStaff, readDetail, send, newKey, onChanged, ...overrides }
}
function open(command, value = appointment, operation = 'start') {
  expect(command.open(value, operation)).toBe(true)
  command.attest(true)
}
function respond(data, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(status < 400 ? { data } : data), { status }))
  vi.stubGlobal('fetch', fetch); return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('Stylist service actual HTTP contract', () => {
  it.each([['start', appointment, started], ['complete', started, completed]])('%s sends only revision with Bearer/key and accepts actual server timestamps', async (operation, original, result) => {
    const fetch = respond(result), controller = new AbortController()
    const value = await sendStylistServiceCommand('http://10.0.2.2:4000', 'token', id, operation,
      { expectedRevision: original.revision }, key, controller.signal)
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('http://10.0.2.2:4000/api/appointments/' + id + '/' + operation)
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body)).toEqual({ expectedRevision: original.revision })
    expect(request.headers.get('Authorization')).toBe('Bearer token')
    expect(request.headers.get('Idempotency-Key')).toBe(key)
    expect(request.headers.get('Content-Type')).toBe('application/json')
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(value.startedAt).toBe(started.startedAt)
    if (operation === 'complete') expect(value.completedAt).toBe(completed.completedAt)
    expect(value.items).toEqual(appointment.items)
    expect(value.startAt).toBe(appointment.startAt)
  })
  it.each(['cancel', 'no-show', 'eta', 'correct-start', 'correct-complete'])('does not expose operation %s in Stylist service helper', async operation => {
    const fetch = respond(started)
    await expect(sendStylistServiceCommand('https://api.test', 'token', id, operation, { expectedRevision: 4 }, key)).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{ expectedRevision: -1 }, { expectedRevision: 4, status: 'in_progress' }, { expectedRevision: 4, customerArrived: true },
    { expectedRevision: 4, completedAt: completed.completedAt }, { expectedRevision: Number.MAX_SAFE_INTEGER }])(
    'rejects invalid or unapproved body %j', async payload => {
      const fetch = respond(started)
      await expect(sendStylistServiceCommand('https://api.test', 'token', id, 'start', payload, key)).rejects.toMatchObject({ status: 400 })
      expect(fetch).not.toHaveBeenCalled()
    })
  it.each([{ revision: 4 }, { status: 'completed' }, { startedAt: undefined }, { id: accountId }])('malformed successful Start %j remains uncertain', async change => {
    respond({ ...started, ...change })
    await expect(sendStylistServiceCommand('https://api.test', 'token', id, 'start', { expectedRevision: 4 }, key)).rejects.toThrow('kết quả')
  })
  it('requires completedAt >= startedAt and removes persisted ETA from completed DTO', async () => {
    respond({ ...completed, completedAt: '2026-10-24T01:00:00.000Z' })
    await expect(sendStylistServiceCommand('https://api.test', 'token', id, 'complete', { expectedRevision: 5 }, key)).rejects.toThrow('kết quả')
    respond({ ...completed, estimatedEndAt: '2026-10-24T04:00:00.000Z' })
    const value = await sendStylistServiceCommand('https://api.test', 'token', id, 'complete', { expectedRevision: 5 }, key)
    expect(value).not.toHaveProperty('estimatedEndAt')
    expect(value).not.toHaveProperty('payment')
  })
  it.each([401, 403, 404, 409, 400, 408, 503])('preserves HTTP %s error metadata', async status => {
    respond({ code: 'APPOINTMENT_REVISION_CONFLICT', message: 'server' }, status)
    await expect(sendStylistServiceCommand('https://api.test', 'token', id, 'start', { expectedRevision: 4 }, key))
      .rejects.toMatchObject({ status, code: 'APPOINTMENT_REVISION_CONFLICT' })
  })
})

describe('confirmation and service state', () => {
  it('Start requires presence confirmation; opening and closing modal alone never sends', async () => {
    const { command, send } = setup()
    expect(command.getSnapshot().visible).toBe(false)
    command.open(appointment, 'start')
    expect(command.getSnapshot()).toMatchObject({ visible: true, attested: false })
    await command.submit()
    expect(command.getSnapshot().message).toContain('khách đã đến')
    expect(send).not.toHaveBeenCalled()
    expect(command.close()).toBe(true)
    expect(command.getSnapshot().visible).toBe(false)
    open(command); await command.submit()
    expect(send).toHaveBeenCalledOnce()
  })
  it('Complete requires explicit finished confirmation and cannot run before Start', async () => {
    const { command, send } = setup({ readDetail: async () => started, send: vi.fn().mockResolvedValue(completed) })
    expect(command.open(appointment, 'complete')).toBe(false)
    expect(command.open(started, 'complete')).toBe(true)
    await command.submit()
    expect(command.getSnapshot().message).toContain('phục vụ xong')
    expect(send).not.toHaveBeenCalled()
    command.attest(true); await command.submit()
    expect(command.getSnapshot()).toMatchObject({ kind: 'success', visible: false })
    expect(command.getSnapshot().message).toContain('không đồng nghĩa đã thanh toán')
  })
  it.each(['completed', 'cancelled', 'no_show'])('terminal state %s has no action or mutable intent', status => {
    const { command } = setup()
    expect(stylistServiceOperation({ ...appointment, status })).toBeNull()
    expect(command.open({ ...appointment, status }, 'start')).toBe(false)
    expect(command.open({ ...appointment, status }, 'complete')).toBe(false)
  })
  it('early Start adds no client cutoff/grid/lead-time rules or timestamps', async () => {
    const { command, send } = setup()
    open(command); await command.submit()
    expect(send.mock.calls[0].slice(0, 3)).toEqual(['start', { expectedRevision: 4 }, key])
    expect(Date.parse(started.startedAt)).toBeLessThan(Date.parse(appointment.startAt))
    expect(stylistServicePayload(appointment, 'start', true)).toEqual({ expectedRevision: 4 })
  })
  it('success is published only after response; double-submit shares one job and locks modal', async () => {
    const wait = deferred(), { command, send, onChanged, newKey } = setup({ send: vi.fn(() => wait.promise) })
    open(command)
    const first = command.submit()
    expect(command.submit()).toBe(first)
    expect(command.close()).toBe(false)
    expect(command.attest(false)).toBe(false)
    expect(command.open(started, 'complete')).toBe(false)
    expect(command.reload()).toBe(false)
    expect(command.getSnapshot()).toMatchObject({ kind: 'loading', appointment: { status: 'confirmed' } })
    expect(onChanged).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    wait.resolve(started); await first
    expect(command.getSnapshot()).toMatchObject({ kind: 'success', pending: null, visible: false })
    expect(onChanged).toHaveBeenCalledOnce()
    expect(newKey).toHaveBeenCalledOnce()
  })
  it('Start then Complete creates separate keys and uses freshly read revisions', async () => {
    const readDetail = vi.fn().mockResolvedValueOnce(appointment).mockResolvedValueOnce(started)
    const send = vi.fn().mockResolvedValueOnce(started).mockResolvedValueOnce(completed)
    const newKey = vi.fn().mockReturnValueOnce(key).mockReturnValueOnce(key.slice(0, -1) + '2')
    const { command, onChanged } = setup({ readDetail, send, newKey })
    open(command); await command.submit()
    open(command, started, 'complete'); await command.submit()
    expect(send.mock.calls.map(call => call.slice(0, 3))).toEqual([
      ['start', { expectedRevision: 4 }, key], ['complete', { expectedRevision: 5 }, key.slice(0, -1) + '2'],
    ])
    expect(onChanged).toHaveBeenCalledTimes(2)
  })
})

describe('permission, conflicts and safe retries', () => {
  it.each([null, { ...account, roles: ['customer'] }, { ...account, roles: ['owner', 'stylist'] },
    { ...account, accountId: 'other' }, { ...account, status: 'disabled' }])('fresh role/identity %j blocks before POST', async profile => {
      const { command, readDetail, send } = setup({ readProfile: async () => ({ account: profile }) })
      open(command); await command.submit()
      expect(send).not.toHaveBeenCalled()
      expect(readDetail).not.toHaveBeenCalled()
      expect(command.getSnapshot()).toMatchObject({ kind: 'rejected', pending: null })
    })
  it('different assigned Staff never sends even when route ID is known', async () => {
    const { command, send } = setup({ readDetail: async () => ({ ...appointment, staffId: accountId }) })
    open(command); await command.submit()
    expect(send).not.toHaveBeenCalled()
    expect(command.getSnapshot().error.status).toBe(404)
  })
  it('preflight revision mismatch refreshes but never sends a command with new revision automatically', async () => {
    const { command, send, onChanged } = setup({ readDetail: async () => ({ ...appointment, revision: 9 }) })
    open(command); await command.submit()
    expect(command.getSnapshot()).toMatchObject({ kind: 'rejected', pending: null })
    expect(send).not.toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalledOnce()
    await command.submit()
    expect(send).not.toHaveBeenCalled()
  })
  it.each(['START_OUTSIDE_SHIFT', 'START_TIME_OFF_CONFLICT', 'START_APPOINTMENT_CONFLICT', 'APPOINTMENT_REVISION_CONFLICT',
    'APPOINTMENT_STATE_CONFLICT', 'COMMAND_KEY_CONFLICT', 'INVALID_COMPLETION_TIME'])('handles Backend 409 %s and requires review', async code => {
      const { command, send, onChanged } = setup({ send: vi.fn().mockRejectedValue(Object.assign(new Error('server'), { status: 409, code })) })
      open(command); await command.submit()
      expect(command.getSnapshot()).toMatchObject({ kind: 'rejected', pending: null, error: { code } })
      expect(command.getSnapshot().message).toBeTruthy()
      expect(onChanged).toHaveBeenCalledOnce()
      await command.submit()
      expect(send).toHaveBeenCalledOnce()
      expect(command.reload()).toBe(true)
    })
  it.each([401, 403, 404, 400])('handles definite HTTP %s without pretending success', async status => {
    const { command, send } = setup({ send: vi.fn().mockRejectedValue(Object.assign(new Error('server'), { status })) })
    open(command); await command.submit()
    expect(command.getSnapshot()).toMatchObject({ kind: 'rejected', pending: null })
    await command.submit()
    expect(send).toHaveBeenCalledOnce()
  })
  it.each([new Error('network'), Object.assign(new Error('timeout'), { status: 408 }),
    Object.assign(new Error('unknown commit'), { status: 503, code: 'APPOINTMENT_COMMAND_RESULT_UNKNOWN' })])(
    'keeps original key/body after uncertain error and checks server before replay', async error => {
      const send = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(started)
      const { command, newKey, readDetail } = setup({ send })
      open(command); await command.submit()
      const pending = command.getSnapshot().pending
      expect(pending.payload).toEqual({ expectedRevision: 4 })
      expect(command.close()).toBe(false)
      expect(command.attest(false)).toBe(false)
      await command.submit()
      expect(newKey).toHaveBeenCalledOnce()
      expect(readDetail).toHaveBeenCalledTimes(2)
      expect(send.mock.calls.map(call => call.slice(0, 3))).toEqual([
        ['start', pending.payload, key], ['start', pending.payload, key],
      ])
    })
  it.each([['start', appointment, started], ['complete', started, completed]])('lost %s response is reconciled with GET, not another POST', async (operation, before, after) => {
    const readDetail = vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after)
    const send = vi.fn().mockRejectedValue(new Error('response lost'))
    const { command, onChanged } = setup({ readDetail, send })
    open(command, before, operation); await command.submit(); await command.submit()
    expect(send).toHaveBeenCalledOnce()
    expect(command.getSnapshot()).toMatchObject({ kind: 'success', pending: null })
    expect(onChanged).toHaveBeenCalledOnce()
  })
  it('verification GET failure retains pending intent; changed server revision stops further POSTs', async () => {
    const readDetail = vi.fn().mockResolvedValueOnce(appointment).mockRejectedValueOnce(new Error('GET failed'))
      .mockResolvedValueOnce({ ...appointment, revision: 9 })
    const { command, send } = setup({ readDetail, send: vi.fn().mockRejectedValue(new Error('network')) })
    open(command); await command.submit()
    const pending = command.getSnapshot().pending
    await command.submit()
    expect(command.getSnapshot().pending).toEqual(pending)
    await command.submit()
    expect(command.getSnapshot()).toMatchObject({ kind: 'rejected', pending: null })
    expect(send).toHaveBeenCalledOnce()
  })
  it('a malformed successful snapshot is uncertain rather than an optimistic success', async () => {
    const { command, onChanged } = setup({ send: async () => ({ ...started, totalPriceVnd: 999999 }) })
    open(command); await command.submit()
    expect(command.getSnapshot().kind).toBe('uncertain')
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('refresh and account isolation', () => {
  it('refreshes Detail/List readers to actual server state after Start and Complete', async () => {
    let server = appointment
    const config = { accountId, readProfile: async () => ({ account }), readStaff: async () => [staff] }
    const detail = createStylistAppointmentReader({ ...config, appointmentId: id, readDetail: async () => server })
    const list = createStylistAppointmentReader({ ...config, readPage: async () => ({
      items: [server], pagination: { hasNextPage: false, nextCursor: null },
    }) })
    await detail.load(); await list.load()
    const { command } = setup({ readDetail: async () => server,
      send: async operation => { server = operation === 'start' ? started : completed; return server },
      onChanged: () => detail.refresh() })
    open(command); await command.submit()
    await vi.waitFor(() => expect(detail.getSnapshot().appointment?.startedAt).toBe(started.startedAt))
    list.cancel(); await list.load()
    expect(list.getSnapshot().items[0].status).toBe('in_progress')
    open(command, detail.getSnapshot().appointment, 'complete'); await command.submit()
    await vi.waitFor(() => expect(detail.getSnapshot().appointment?.completedAt).toBe(completed.completedAt))
    list.cancel(); await list.load()
    expect(list.getSnapshot().items[0].status).toBe('completed')
  })
  it('logout/account or appointment switch aborts pending POST and ignores late success', async () => {
    const wait = deferred(), { command, send, onChanged } = setup({ send: vi.fn(() => wait.promise) })
    open(command); const job = command.submit()
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    command.cancel()
    const next = setup({ accountId: 'another-account' })
    wait.resolve(started); await job
    expect(send.mock.calls[0][3].aborted).toBe(true)
    expect(command.getSnapshot()).toMatchObject({ kind: 'idle', visible: false, appointment: null, pending: null })
    expect(onChanged).not.toHaveBeenCalled()
    expect(next.command.getSnapshot().kind).toBe('idle')
  })
  it('logout during preflight prevents POST even if profile resolves late', async () => {
    const wait = deferred(), readProfile = vi.fn(() => wait.promise)
    const { command, send } = setup({ readProfile })
    open(command); const job = command.submit()
    await vi.waitFor(() => expect(readProfile).toHaveBeenCalled())
    command.cancel(); wait.resolve({ account }); await job
    expect(send).not.toHaveBeenCalled()
  })
})
