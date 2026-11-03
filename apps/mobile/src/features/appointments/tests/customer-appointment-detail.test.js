import { afterEach, describe, expect, it, vi } from 'vitest'
import { StackRouter, StackActions, CommonActions } from '@react-navigation/routers'
import { getCustomerAppointment } from '../api/appointments.api.js'
import { createCustomerAppointmentDetailReader } from '../hooks/customer-appointment-detail-reader.js'
import { bindAppointmentLifecycle } from '../hooks/customer-appointments-reader.js'
import { appointmentCardText } from '../appointment-presentation.js'

const accountId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const id = '111111111111111111111111', secondId = '222222222222222222222222'
const customer = { accountId, roles: ['customer'], status: 'active' }
const item = { id, staffId: 'bbbbbbbbbbbbbbbbbbbbbbbb', staffNameSnapshot: 'An',
  status: 'confirmed', startAt: '2026-10-23T17:15:00.000Z', endAt: '2026-10-23T18:00:00.000Z',
  confirmedAt: '2026-10-20T00:00:00.000Z', revision: 7, timeZone: 'Asia/Ho_Chi_Minh', localDate: '2026-10-24',
  totalDurationMinutes: 45, totalPriceVnd: 300000,
  items: [{ serviceId: 'cut', name: 'Cắt snapshot', durationMinutes: 30, priceVnd: 200000 },
    { serviceId: 'wash', name: 'Gội snapshot', durationMinutes: 15, priceVnd: 100000 }] }
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
const reader = (readDetail = async () => item, overrides = {}) => createCustomerAppointmentDetailReader({
  accountId, appointmentId: id, readProfile: async () => ({ account: customer }), readDetail, ...overrides,
})
function respond(data = item, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(status < 400 ? { data } : data), { status }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('Customer Mobile detail API contract', () => {
  it('reads the exact ID through configured URL, Bearer and AbortSignal without request body', async () => {
    const fetch = respond(), controller = new AbortController()
    const data = await getCustomerAppointment('http://10.0.2.2:4000/', 'token', id, controller.signal)
    expect(fetch.mock.calls[0][0]).toBe('http://10.0.2.2:4000/api/appointments/' + id)
    expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer token')
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(fetch.mock.calls[0][1].body).toBeUndefined()
    expect(data.revision).toBe(7)
    expect(data.items).toEqual(item.items)
    expect(data.totalPriceVnd).toBe(300000)
  })
  it('keeps snapshots and ignores current catalog/ETA/internal fields', async () => {
    respond({ ...item, estimatedEndAt: '2026-10-23T20:00:00.000Z', occupiedUntil: 'private',
      items: item.items.map(service => ({ ...service, currentPrice: 999999 })) })
    const data = await getCustomerAppointment('https://api.test', 'token', id)
    expect(data.items).toEqual(item.items)
    expect(data).not.toHaveProperty('estimatedEndAt')
    expect(data).not.toHaveProperty('occupiedUntil')
    const text = appointmentCardText(data)
    expect(text.services).toBe('Cắt snapshot · Gội snapshot')
    expect(text.time).toBe('00:15 – 01:00')
    expect(text.date).toContain('24/10/2026')
  })
  it('keeps actual timestamps only when returned in a permitted state', async () => {
    respond({ ...item, status: 'completed', startedAt: item.startAt, completedAt: item.endAt })
    expect(await getCustomerAppointment('https://api.test', 'token', id)).toMatchObject({
      startedAt: item.startAt, completedAt: item.endAt,
    })
    respond(item)
    expect(await getCustomerAppointment('https://api.test', 'token', id)).not.toHaveProperty('startedAt')
  })
  it.each([null, '', 'bad', '../audit', 123])('rejects invalid ID %s before network', async value => {
    const fetch = respond()
    await expect(getCustomerAppointment('https://api.test', 'token', value)).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    { id: secondId }, { revision: -1 }, { revision: 1.5 }, { revision: undefined },
    { confirmedAt: 'bad' }, { timeZone: 'UTC' }, { localDate: undefined }, { completedAt: 'bad' },
    { customerId: accountId }, { customerSnapshot: { phone: 'private' } },
  ])('rejects mismatched or malformed/private DTO %j', async change => {
    respond({ ...item, ...change })
    await expect(getCustomerAppointment('https://api.test', 'token', id)).rejects.toThrow()
  })
  it.each([401, 403, 404, 500])('retains HTTP %s and error code', async status => {
    respond({ code: 'APPOINTMENT_NOT_FOUND', message: 'error' }, status)
    await expect(getCustomerAppointment('https://api.test', 'token', id)).rejects.toMatchObject({
      status, code: 'APPOINTMENT_NOT_FOUND',
    })
  })
})

describe('Customer detail lifecycle and isolation', () => {
  it('starts loading with no old data and publishes only resolved detail', async () => {
    const wait = deferred(), store = reader(() => wait.promise), update = vi.fn()
    const unsubscribe = store.subscribe(update)
    const job = store.load()
    expect(store.getSnapshot()).toEqual({ kind: 'loading', appointment: null })
    wait.resolve(item); await job
    expect(store.getSnapshot()).toEqual({ kind: 'success', appointment: item })
    expect(update).toHaveBeenCalled()
    unsubscribe()
  })
  it('deduplicates rapid requests and retries network failure without a fabricated result', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(item)
    const store = reader(read), job = store.load()
    expect(store.load()).toBe(job)
    await job
    expect(store.getSnapshot()).toMatchObject({ kind: 'error', appointment: null })
    await store.retry()
    expect(store.getSnapshot()).toMatchObject({ kind: 'success', appointment: item })
    expect(read).toHaveBeenCalledTimes(2)
  })
  it.each([[401, 'denied'], [403, 'denied'], [404, 'notFound'], [400, 'invalid']])('clears data on HTTP %s', async (status, kind) => {
    const store = reader(async () => { throw Object.assign(new Error('server'), { status }) })
    await store.load()
    expect(store.getSnapshot()).toMatchObject({ kind, appointment: null })
  })
  it.each([undefined, 'bad', { id }])('rejects invalid deep params before profile or detail %s', async appointmentId => {
    const readDetail = vi.fn(), readProfile = vi.fn()
    const store = reader(readDetail, { appointmentId, readProfile })
    await store.load()
    expect(store.getSnapshot().kind).toBe('invalid')
    expect(readProfile).not.toHaveBeenCalled()
    expect(readDetail).not.toHaveBeenCalled()
  })
  it.each([
    null, { ...customer, accountId: 'another-account' }, { ...customer, status: 'disabled' },
    { ...customer, roles: ['stylist', 'customer'] }, { ...customer, roles: ['owner', 'customer'] },
  ])('checks fresh Customer identity and denies foreign/changed roles', async account => {
    const read = vi.fn(), store = reader(read, { readProfile: async () => ({ account }) })
    await store.load()
    expect(store.getSnapshot()).toMatchObject({ kind: 'denied', appointment: null })
    expect(read).not.toHaveBeenCalled()
  })
  it('ignores late old-ID response after blur/change and keeps the new-ID reader isolated', async () => {
    const wait = deferred(), oldRead = vi.fn(() => wait.promise), old = reader(oldRead)
    const job = old.load()
    await vi.waitFor(() => expect(oldRead).toHaveBeenCalled())
    old.cancel()
    expect(oldRead.mock.calls[0][1].aborted).toBe(true)
    const next = reader(async appointmentId => ({ ...item, id: appointmentId }), { appointmentId: secondId })
    await next.load()
    wait.resolve(item); await job
    expect(old.getSnapshot().appointment).toBeNull()
    expect(next.getSnapshot().appointment.id).toBe(secondId)
  })
  it('logout/account switch discards pending old account and cannot populate the new account', async () => {
    const wait = deferred(), read = vi.fn(() => wait.promise), old = reader(read)
    const job = old.load()
    await vi.waitFor(() => expect(read).toHaveBeenCalled())
    old.cancel()
    const nextRead = vi.fn(), next = reader(nextRead, { accountId: 'new-account' })
    await next.load()
    wait.resolve(item); await job
    expect(old.getSnapshot().appointment).toBeNull()
    expect(next.getSnapshot().kind).toBe('denied')
    expect(nextRead).not.toHaveBeenCalled()
  })
  it('focus/foreground refetch, background/blur erase and unsubscribe; fresh revision is retained', async () => {
    let change
    const remove = vi.fn(), app = { currentState: 'active',
      addEventListener: vi.fn((event, callback) => { change = callback; return { remove } }) }
    const read = vi.fn().mockResolvedValueOnce(item).mockResolvedValueOnce({ ...item, revision: 8 })
    const store = reader(read), dispose = bindAppointmentLifecycle(store, app)
    await vi.waitFor(() => expect(store.getSnapshot().kind).toBe('success'))
    change('active'); expect(read).toHaveBeenCalledTimes(1)
    change('background'); expect(store.getSnapshot().appointment).toBeNull()
    change('active')
    await vi.waitFor(() => expect(store.getSnapshot().appointment?.revision).toBe(8))
    dispose()
    expect(remove).toHaveBeenCalledOnce()
    expect(store.getSnapshot().appointment).toBeNull()
    const disposeAgain = bindAppointmentLifecycle(store, app)
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3))
    disposeAgain()
  })
})

describe('native stack detail navigation', () => {
  it('List → matching Detail, rapid same-ID navigate deduplicates, Back restores List; existing routes remain', () => {
    const router = StackRouter({ initialRouteName: 'CustomerAppointments' })
    const options = { routeNames: ['Home', 'CustomerAppointments', 'CustomerAppointmentDetail', 'Booking', 'StylistShifts'],
      routeParamList: {}, routeGetIdList: { CustomerAppointmentDetail: ({ params }) => params?.appointmentId } }
    let state = router.getInitialState(options)
    const action = CommonActions.navigate('CustomerAppointmentDetail', { appointmentId: id })
    state = router.getStateForAction(state, action, options)
    expect(state.routes.at(-1).params.appointmentId).toBe(id)
    state = router.getStateForAction(state, action, options)
    expect(state.routes).toHaveLength(2)
    state = router.getStateForAction(state, StackActions.pop(), options)
    expect(state.routes[state.index].name).toBe('CustomerAppointments')
    expect(router.getStateForAction(state, CommonActions.navigate('Booking'), options).routes.at(-1).name).toBe('Booking')
    expect(router.getStateForAction(state, CommonActions.navigate('StylistShifts'), options).routes.at(-1).name).toBe('StylistShifts')
  })
})
