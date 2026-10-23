import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers'
import { getCustomerRescheduleOptions, rescheduleCustomerAppointment } from '../api/appointments.api.js'
import { bindRescheduleLifecycle, createCustomerReschedule, customerReschedulePayload, rescheduleBlockReason } from '../hooks/customer-reschedule.js'

const id = '111111111111111111111111', accountId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const staffId = 'bbbbbbbbbbbbbbbbbbbbbbbb', otherStaff = 'cccccccccccccccccccccccc'
const now = Date.parse('2026-10-23T02:00:00.000Z'), date = '2026-10-23'
const customer = { accountId, status: 'active', roles: ['customer'] }
const item = { id, staffId, staffNameSnapshot: 'An', status: 'confirmed', revision: 7,
  startAt: '2026-10-24T02:00:00.000Z', endAt: '2026-10-24T02:30:00.000Z',
  totalDurationMinutes: 30, totalPriceVnd: 150000,
  items: [{ serviceId: 'cut', name: 'Snapshot cũ', priceVnd: 150000, durationMinutes: 30 }] }
const slot = { startAt: '2026-10-23T04:00:00.000Z', endAt: '2026-10-23T04:30:00.000Z', occupiedUntil: '2026-10-23T04:40:00.000Z' }
const options = { appointmentId: id, revision: 7, generatedAt: new Date(now).toISOString(), localDate: date,
  timeZone: 'Asia/Ho_Chi_Minh', stylists: [{ staffId, displayName: 'An', slots: [slot] }, { staffId: otherStaff, displayName: 'Bình', slots: [slot] }] }
const result = { ...item, ...slot, revision: 8, lastRescheduledAt: new Date(now).toISOString() }
const key = '00000000-0000-4000-8000-000000000001'
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function setup(overrides = {}) {
  const readProfile = vi.fn().mockResolvedValue({ account: customer })
  const readDetail = vi.fn().mockResolvedValue(item), readOptions = vi.fn().mockResolvedValue(options)
  const send = vi.fn().mockImplementation(async payload => ({ ...result, staffId: payload.staffId, startAt: payload.startAt }))
  const newKey = vi.fn(() => key)
  const command = createCustomerReschedule({ accountId, appointmentId: id, readProfile, readDetail, readOptions, send, newKey,
    now: () => now, ...overrides })
  return { command, readProfile, readDetail, readOptions, send, newKey, ...overrides }
}
async function select(command) {
  await command.load(); expect(command.chooseSlot(slot.startAt)).toBe(true); expect(command.confirm()).toBe(true)
}
function respond(data, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(status < 400 ? { data } : data), { status }))
  vi.stubGlobal('fetch', fetch); return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('Mobile reschedule HTTP contract', () => {
  it('uses only localDate on appointment-specific options, Bearer and caller signal', async () => {
    const fetch = respond(options), controller = new AbortController()
    expect(await getCustomerRescheduleOptions('http://10.0.2.2:4000', 'token', id, date, controller.signal)).toEqual(options)
    const [url, request] = fetch.mock.calls[0]
    expect(new URL(url).pathname).toBe('/api/appointments/' + id + '/reschedule-options')
    expect([...new URL(url).searchParams]).toEqual([['localDate', date]])
    expect(request.headers.get('Authorization')).toBe('Bearer token')
    expect(request.signal).toBeInstanceOf(AbortSignal)
  })
  it('allows empty stylist/slots and strips fields outside option DTO', async () => {
    respond({ ...options, secret: 'private', stylists: [{ ...options.stylists[0], slots: [], email: 'private' }] })
    const data = await getCustomerRescheduleOptions('https://api.test', 'token', id, date)
    expect(data.stylists[0].slots).toEqual([])
    expect(JSON.stringify(data)).not.toContain('private')
    respond({ ...options, stylists: [] })
    expect((await getCustomerRescheduleOptions('https://api.test', 'token', id, date)).stylists).toEqual([])
  })
  it.each(['bad', '2026-02-30'])('rejects invalid date %s without network', async localDate => {
    const fetch = respond(options)
    await expect(getCustomerRescheduleOptions('https://api.test', 'token', id, localDate)).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{ revision: -1 }, { appointmentId: accountId }, { localDate: '2026-10-24' },
    { generatedAt: 'bad' }, { timeZone: 'UTC' }, { stylists: [{ staffId, displayName: 'An', slots: [{ ...slot, occupiedUntil: slot.endAt }] }] }])(
    'rejects malformed options %j', async change => {
      respond({ ...options, ...change })
      await expect(getCustomerRescheduleOptions('https://api.test', 'token', id, date)).rejects.toThrow()
    })
  it('POSTs expectedRevision/staffId/startAt only; never creates appointment or changes services', async () => {
    const fetch = respond(result), payload = { expectedRevision: 7, staffId, startAt: slot.startAt }
    const data = await rescheduleCustomerAppointment('https://api.test', 'token', id, payload, key)
    expect(fetch.mock.calls[0][0]).toBe('https://api.test/api/appointments/' + id + '/reschedule')
    const request = fetch.mock.calls[0][1]
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body)).toEqual(payload)
    expect(request.headers.get('Idempotency-Key')).toBe(key)
    expect(request.headers.get('Authorization')).toBe('Bearer token')
    expect(data.items).toEqual(item.items)
    expect(data.totalPriceVnd).toBe(150000)
  })
  it.each([401, 403, 404, 409, 503])('preserves HTTP %s business errors', async status => {
    respond({ code: 'RESCHEDULE_CONFLICT', message: 'server' }, status)
    await expect(rescheduleCustomerAppointment('https://api.test', 'token', id,
      { expectedRevision: 7, staffId, startAt: slot.startAt }, key)).rejects.toMatchObject({ status, code: 'RESCHEDULE_CONFLICT' })
  })
  it('rejects service fields before sending and malformed successful response remains uncertain', async () => {
    const fetch = respond(result), payload = { expectedRevision: 7, staffId, startAt: slot.startAt }
    await expect(rescheduleCustomerAppointment('https://api.test', 'token', id, { ...payload, items: [] }, key)).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
    respond({ ...result, revision: 7 })
    await expect(rescheduleCustomerAppointment('https://api.test', 'token', id, payload, key)).rejects.toThrow('kết quả')
  })
})

describe('eligibility and selection', () => {
  it.each([7_200_001, 7_200_000])('allows cutoff %s ms including equality', difference => {
    expect(rescheduleBlockReason({ ...item, startAt: new Date(now + difference).toISOString() }, now)).toBe('')
  })
  it.each([7_199_999, 0, -1])('blocks below cutoff %s ms', difference => {
    expect(rescheduleBlockReason({ ...item, startAt: new Date(now + difference).toISOString() }, now)).toContain('2 giờ')
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('blocks %s', async status => {
    const { command, send } = setup({ readDetail: async () => ({ ...item, status }) })
    await command.load(); command.chooseSlot(slot.startAt); command.confirm(); await command.submit()
    expect(command.getSnapshot().kind).toBe('error')
    expect(send).not.toHaveBeenCalled()
  })
  it('requires an offered slot, same revision and actual change; body does not contain snapshot fields', () => {
    expect(customerReschedulePayload(item, options, otherStaff, slot.startAt, now)).toEqual({
      expectedRevision: 7, staffId: otherStaff, startAt: slot.startAt,
    })
    expect(() => customerReschedulePayload(item, options, staffId, '2026-10-23T05:00:00.000Z', now)).toThrow('giờ')
    expect(() => customerReschedulePayload(item, { ...options, revision: 8 }, staffId, slot.startAt, now)).toThrow('giờ')
    const oldOptions = { ...options, localDate: '2026-10-24', stylists: [{ staffId, slots: [{ startAt: item.startAt }] }] }
    expect(() => customerReschedulePayload(item, oldOptions, staffId, item.startAt, now)).toThrow('khác')
  })
  it.each([29, 60 * 168 + 1])('rejects offered slots outside lead-time/horizon (%s minutes)', minutes => {
    const startAt = new Date(now + minutes * 60000).toISOString()
    expect(() => customerReschedulePayload(item, { ...options, stylists: [{ staffId, slots: [{ startAt }] }] }, staffId, startAt, now)).toThrow()
  })
})

describe('options concurrency and request lifecycle', () => {
  it('keeps current stylist or switches to another, refetching options on each stylist change', async () => {
    const { command, readOptions, send } = setup()
    await select(command)
    expect(command.getSnapshot().staffId).toBe(staffId)
    expect(command.closeConfirmation()).toBe(true)
    await command.chooseStaff(otherStaff)
    expect(command.getSnapshot().startAt).toBeNull()
    expect(readOptions).toHaveBeenCalledTimes(2)
    command.chooseSlot(slot.startAt); command.confirm(); await command.submit()
    expect(send.mock.calls[0][0].staffId).toBe(otherStaff)
    expect(command.getSnapshot().kind).toBe('success')
  })
  it('late old-day options cannot overwrite newer day; changing date clears selection', async () => {
    const wait = deferred(), readOptions = vi.fn().mockReturnValueOnce(wait.promise).mockResolvedValueOnce({ ...options, localDate: '2026-10-24' })
    const { command } = setup({ readOptions })
    const old = command.load()
    await vi.waitFor(() => expect(readOptions).toHaveBeenCalledOnce())
    await command.chooseDate('2026-10-24')
    wait.resolve(options); await old
    expect(command.getSnapshot()).toMatchObject({ localDate: '2026-10-24', startAt: null })
    expect(command.getSnapshot().options.localDate).toBe('2026-10-24')
    expect(readOptions.mock.calls[0][2].aborted).toBe(true)
  })
  it('ignores old options after pause and reloads on focus/foreground without POST', async () => {
    let change
    const remove = vi.fn(), app = { currentState: 'active', addEventListener: vi.fn((name, callback) => { change = callback; return { remove } }) }
    const { command, readOptions, send } = setup()
    const dispose = bindRescheduleLifecycle(command, app)
    await vi.waitFor(() => expect(command.getSnapshot().kind).toBe('ready'))
    command.chooseSlot(slot.startAt)
    change('background')
    expect(command.getSnapshot().options).toBeNull()
    expect(command.getSnapshot().startAt).toBeNull()
    change('active')
    await vi.waitFor(() => expect(readOptions).toHaveBeenCalledTimes(2))
    change('active')
    expect(readOptions).toHaveBeenCalledTimes(2)
    expect(send).not.toHaveBeenCalled()
    dispose(); expect(remove).toHaveBeenCalledOnce()
  })
  it('valid empty options remain ready; unavailable selection cannot be confirmed', async () => {
    const { command } = setup({ readOptions: async () => ({ ...options, stylists: [] }) })
    await command.load()
    expect(command.getSnapshot().kind).toBe('ready')
    expect(command.confirm()).toBe(false)
    expect(command.chooseSlot(slot.startAt)).toBe(false)
  })
  it('options failure supports explicit retry and revision mismatch blocks selection', async () => {
    const readOptions = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(options)
    const { command } = setup({ readOptions })
    await command.load(); expect(command.getSnapshot().kind).toBe('error')
    await command.load(); expect(command.getSnapshot().kind).toBe('ready')
    readOptions.mockResolvedValueOnce({ ...options, revision: 8 })
    await command.load()
    expect(command.getSnapshot()).toMatchObject({ kind: 'error', options: null })
  })
})

describe('mutation idempotency, refresh and isolation', () => {
  it('confirmation alone never sends; success updates detail model and drops options', async () => {
    const { command, send } = setup()
    await select(command)
    expect(send).not.toHaveBeenCalled()
    command.closeConfirmation()
    await command.submit()
    expect(send).not.toHaveBeenCalled()
    command.confirm(); await command.submit()
    expect(command.getSnapshot()).toMatchObject({ kind: 'success', confirming: false, options: null,
      appointment: { revision: 8, startAt: slot.startAt, items: item.items, totalPriceVnd: item.totalPriceVnd } })
  })
  it('deduplicates submit, locks selection/modal while submitting and checks fresh options before POST', async () => {
    const wait = deferred(), send = vi.fn(() => wait.promise)
    const { command, newKey, readOptions } = setup({ send })
    await select(command)
    const first = command.submit(), second = command.submit()
    expect(first).toBe(second)
    expect(command.closeConfirmation()).toBe(false)
    command.chooseDate('2026-10-24')
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(readOptions).toHaveBeenCalledTimes(2)
    expect(newKey).toHaveBeenCalledOnce()
    wait.resolve(result); await first
    expect(command.getSnapshot().kind).toBe('success')
  })
  it('rejects a selected slot removed by the fresh preflight options, without POST', async () => {
    const readOptions = vi.fn().mockResolvedValueOnce(options).mockResolvedValueOnce({ ...options, stylists: [] })
    const { command, send } = setup({ readOptions })
    await select(command); await command.submit()
    expect(send).not.toHaveBeenCalled()
    expect(command.getSnapshot()).toMatchObject({ kind: 'rejected', options: null })
  })
  it('rechecks cutoff at submit and rejects a snapshot changed unexpectedly by the response', async () => {
    let clock = now
    const first = setup({ now: () => clock })
    await select(first.command)
    clock = Date.parse(item.startAt) - 7_200_000 + 1
    await first.command.submit()
    expect(first.send).not.toHaveBeenCalled()
    const second = setup({ send: async () => ({ ...result, totalPriceVnd: 900000 }) })
    await select(second.command); await second.command.submit()
    expect(second.command.getSnapshot().kind).toBe('uncertain')
  })
  it.each([new Error('network'), Object.assign(new Error('timeout'), { status: 408 }),
    Object.assign(new Error('unknown commit'), { status: 503, code: 'APPOINTMENT_COMMAND_RESULT_UNKNOWN' })])(
    'retries same key/payload after unknown result, rechecking server first', async error => {
      const send = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(result)
      const { command, newKey, readDetail } = setup({ send })
      await select(command); await command.submit()
      const pending = command.getSnapshot().pending
      expect(pending.payload).toEqual({ expectedRevision: 7, staffId, startAt: slot.startAt })
      expect(command.closeConfirmation()).toBe(false)
      command.chooseDate('2026-10-24')
      await command.submit()
      expect(newKey).toHaveBeenCalledOnce()
      expect(send.mock.calls.map(call => call.slice(0, 2))).toEqual([[pending.payload, key], [pending.payload, key]])
      expect(readDetail).toHaveBeenCalledTimes(3)
    })
  it('foreground verifies a lost successful response with GET and never sends another POST', async () => {
    const readDetail = vi.fn().mockResolvedValueOnce(item).mockResolvedValueOnce(item).mockResolvedValueOnce(result)
    const send = vi.fn().mockRejectedValue(new Error('response lost'))
    const { command } = setup({ readDetail, send })
    await select(command); await command.submit()
    command.pause(); await command.load()
    expect(command.getSnapshot()).toMatchObject({ kind: 'success', pending: null, appointment: { startAt: slot.startAt } })
    expect(send).toHaveBeenCalledOnce()
  })
  it('failed verification keeps original intent; changed server revision requires explicit reload', async () => {
    const readDetail = vi.fn().mockResolvedValueOnce(item).mockResolvedValueOnce(item)
      .mockRejectedValueOnce(new Error('GET failed')).mockResolvedValueOnce({ ...item, revision: 8 })
    const { command, send } = setup({ readDetail, send: vi.fn().mockRejectedValue(new Error('network')) })
    await select(command); await command.submit()
    const pending = command.getSnapshot().pending
    await command.verify()
    expect(command.getSnapshot().pending).toEqual(pending)
    await command.verify()
    expect(command.getSnapshot()).toMatchObject({ kind: 'rejected', pending: null, options: null })
    expect(send).toHaveBeenCalledOnce()
  })
  it.each([401, 403, 404, 409, 400])('definite HTTP %s requires review, not automatic POST/revision change', async status => {
    const { command, send } = setup({ send: vi.fn().mockRejectedValue(Object.assign(new Error('server'), { status })) })
    await select(command); await command.submit()
    expect(command.getSnapshot()).toMatchObject({ kind: 'rejected', pending: null, options: null })
    await command.submit(); expect(send).toHaveBeenCalledOnce()
    await command.load()
    expect(command.getSnapshot().startAt).toBeNull()
    expect(send).toHaveBeenCalledOnce()
  })
  it.each([null, { ...customer, accountId: 'other' }, { ...customer, roles: ['owner', 'customer'] },
    { ...customer, roles: ['stylist', 'customer'] }, { ...customer, status: 'disabled' }])('denies foreign identity/role before reads', async account => {
      const { command, readDetail, send } = setup({ readProfile: async () => ({ account }) })
      await command.load()
      expect(command.getSnapshot()).toMatchObject({ kind: 'denied', appointment: null, options: null })
      expect(readDetail).not.toHaveBeenCalled()
      expect(send).not.toHaveBeenCalled()
    })
  it('logout/account switch aborts command and ignores late POST without exposing previous state', async () => {
    const wait = deferred(), send = vi.fn(() => wait.promise)
    const { command } = setup({ send })
    await select(command); const job = command.submit()
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    command.cancel()
    const next = setup({ accountId: 'new-account' })
    wait.resolve(result); await job
    expect(send.mock.calls[0][2].aborted).toBe(true)
    expect(command.getSnapshot()).toMatchObject({ kind: 'loading', appointment: null, options: null, pending: null })
    await next.command.load()
    expect(next.command.getSnapshot().kind).toBe('denied')
  })
})

describe('native navigation regression', () => {
  it('Detail → Reschedule → Back deduplicates same ID and keeps Booking/Shifts routes', () => {
    const router = StackRouter({ initialRouteName: 'CustomerAppointmentDetail' })
    const config = { routeNames: ['CustomerAppointmentDetail', 'CustomerAppointmentReschedule', 'Booking', 'StylistShifts'],
      routeParamList: { CustomerAppointmentDetail: { appointmentId: id } },
      routeGetIdList: { CustomerAppointmentReschedule: ({ params }) => params?.appointmentId } }
    let state = router.getInitialState(config)
    const action = CommonActions.navigate('CustomerAppointmentReschedule', { appointmentId: id })
    state = router.getStateForAction(state, action, config)
    state = router.getStateForAction(state, action, config)
    expect(state.routes).toHaveLength(2)
    expect(state.routes.at(-1).params.appointmentId).toBe(id)
    state = router.getStateForAction(state, StackActions.pop(), config)
    expect(state.routes[state.index].name).toBe('CustomerAppointmentDetail')
    expect(router.getStateForAction(state, CommonActions.navigate('Booking'), config).routes.at(-1).name).toBe('Booking')
    expect(router.getStateForAction(state, CommonActions.navigate('StylistShifts'), config).routes.at(-1).name).toBe('StylistShifts')
  })
})

describe('reschedule refreshed data', () => {
  it('changes calendar day using only freshly returned slots and preserves original snapshots', async () => {
    const newSlot = { startAt: '2026-10-25T03:00:00.000Z', endAt: '2026-10-25T03:30:00.000Z', occupiedUntil: '2026-10-25T03:40:00.000Z' }
    const readOptions = vi.fn().mockImplementation(async (id, day) => ({
      ...options, localDate: day, stylists: [{ staffId, displayName: 'An', slots: day === date ? [slot] : [newSlot] }],
    }))
    const source = JSON.stringify(item)
    const { command, send } = setup({ readOptions, send: vi.fn(async payload => ({
      ...result, ...newSlot, staffId: payload.staffId, startAt: payload.startAt,
    })) })
    await command.load(); command.chooseSlot(slot.startAt)
    await command.chooseDate('2026-10-25')
    expect(command.chooseSlot(slot.startAt)).toBe(false)
    command.chooseSlot(newSlot.startAt); command.confirm(); await command.submit()
    expect(send.mock.calls[0][0]).toEqual({ expectedRevision: 7, staffId, startAt: newSlot.startAt })
    expect(command.getSnapshot().appointment.items).toEqual(item.items)
    expect(JSON.stringify(item)).toBe(source)
  })
  it('revoked identity after options were loaded prevents POST', async () => {
    const readProfile = vi.fn().mockResolvedValueOnce({ account: customer }).mockResolvedValueOnce({ account: { ...customer, accountId: 'other' } })
    const { command, send } = setup({ readProfile })
    await select(command); await command.submit()
    expect(send).not.toHaveBeenCalled()
    expect(command.getSnapshot().kind).toBe('rejected')
  })
  it('returning to detail/list reloads updated server fields instead of previously loaded appointment', async () => {
    const { createCustomerAppointmentDetailReader } = await import('../hooks/customer-appointment-detail-reader.js')
    const { createCustomerAppointmentsReader } = await import('../hooks/customer-appointments-reader.js')
    let server = item
    const detail = createCustomerAppointmentDetailReader({ accountId, appointmentId: id,
      readProfile: async () => ({ account: customer }), readDetail: async () => server })
    const list = createCustomerAppointmentsReader({ accountId, readProfile: async () => ({ account: customer }),
      readPage: async () => ({ items: [server], pagination: { hasNextPage: false, nextCursor: null } }) })
    await detail.load(); await list.load()
    detail.cancel(); list.cancel()
    const { command } = setup({ send: async () => { server = result; return server } })
    await select(command); await command.submit()
    await detail.load(); await list.load()
    expect(detail.getSnapshot().appointment).toMatchObject({ revision: 8, startAt: slot.startAt })
    expect(list.getSnapshot().items[0].startAt).toBe(slot.startAt)
  })
})
