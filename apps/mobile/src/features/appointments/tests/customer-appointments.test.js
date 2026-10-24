import { afterEach, describe, expect, it, vi } from 'vitest'
import { listCustomerAppointments } from '../api/appointments.api.js'
import { createCustomerAppointmentsReader, bindAppointmentLifecycle } from '../hooks/customer-appointments-reader.js'
import { appointmentCardText, customerAppointmentTab, isAppointmentCustomer, appointmentListDestination } from '../appointment-presentation.js'

const accountId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const customer = { accountId, roles: ['customer'], status: 'active' }
const item = { id: '111111111111111111111111', staffId: 'bbbbbbbbbbbbbbbbbbbbbbbb', staffNameSnapshot: 'Stylist An',
  status: 'confirmed', startAt: '2026-10-23T17:15:00.000Z', endAt: '2026-10-23T18:00:00.000Z',
  totalDurationMinutes: 45, totalPriceVnd: 300000,
  items: [{ serviceId: 'cut', name: 'Cắt snapshot', durationMinutes: 30, priceVnd: 200000 },
    { serviceId: 'wash', name: 'Gội đầu', durationMinutes: 15, priceVnd: 100000 }] }
const row = (n, status = 'confirmed') => ({ ...item, id: n.toString(16).padStart(24, '0'), status })
const page = (items = [item], nextCursor = null) => ({ items, pagination: { hasNextPage: Boolean(nextCursor), nextCursor } })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const reader = readPage => createCustomerAppointmentsReader({ accountId, readProfile: async () => ({ account: customer }), readPage })
function respond(data, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(status < 400 ? { data } : data), { status }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('Customer Mobile appointment API', () => {
  it('uses actual Customer endpoint with only limit/cursor, configured device URL and Bearer session', async () => {
    const fetch = respond(page())
    await listCustomerAppointments('http://10.0.2.2:4000/', 'customer-token', 'opaque+cursor')
    const [url, options] = fetch.mock.calls[0]
    const query = new URL(url).searchParams
    expect(new URL(url).pathname).toBe('/api/appointments')
    expect([...query.keys()]).toEqual(['limit', 'cursor'])
    expect(query.get('limit')).toBe('20')
    expect(query.get('cursor')).toBe('opaque+cursor')
    expect(options.headers.get('Authorization')).toBe('Bearer customer-token')
    expect(options.method).toBeUndefined()
    expect(options.body).toBeUndefined()
  })
  it('allows an empty page and passes AbortSignal through the existing HTTP helper', async () => {
    const fetch = respond(page([])), controller = new AbortController()
    expect(await listCustomerAppointments('https://api.test', 'token', null, controller.signal)).toEqual(page([]))
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
  it('keeps every service snapshot and strips unknown root/nested fields', async () => {
    respond(page([{ ...item, secret: 'hidden', items: item.items.map(service => ({ ...service, secret: 'hidden' })) }]))
    const data = await listCustomerAppointments('https://api.test', 'token')
    expect(data.items[0].items).toEqual(item.items)
    expect(JSON.stringify(data)).not.toContain('hidden')
  })
  it.each(['customerId', 'customerSnapshot', 'email', 'actorId', 'lastCommand', 'affectedAppointments'])('rejects unexpected privileged DTO field %s', async field => {
    respond(page([{ ...item, [field]: 'private' }]))
    await expect(listCustomerAppointments('https://api.test', 'token')).rejects.toThrow('khách hàng')
  })
  it.each([
    { items: null, pagination: { hasNextPage: false, nextCursor: null } },
    { items: [], pagination: { hasNextPage: true, nextCursor: null } },
    { items: [], pagination: { hasNextPage: false, nextCursor: 'stale' } },
    page([{ ...item, status: 'paid' }]), page([{ ...item, id: 'bad' }]),
    page([{ ...item, items: [] }]), page([{ ...item, startAt: 'bad' }]),
    page([{ ...item, totalDurationMinutes: -1 }]),
  ])('rejects malformed data without claiming empty/success', async data => {
    respond(data)
    await expect(listCustomerAppointments('https://api.test', 'token')).rejects.toThrow()
  })
  it.each([400, 401, 403, 404, 503])('preserves HTTP %s and business error metadata', async status => {
    respond({ code: 'INVALID_CURSOR', message: 'Synthetic error' }, status)
    await expect(listCustomerAppointments('https://api.test', 'token')).rejects.toMatchObject({ status, code: 'INVALID_CURSOR' })
  })
})

describe('Customer list identity and lifecycle', () => {
  it('checks fresh identity before reading each page, including when phone is shared', async () => {
    const profile = vi.fn().mockResolvedValue({ account: customer, customer: { phone: '+84900000000' } })
    const readPage = vi.fn().mockResolvedValueOnce(page([row(3)], 'next')).mockResolvedValueOnce(page([row(2)]))
    const store = createCustomerAppointmentsReader({ accountId, readProfile: profile, readPage })
    await store.load(); await store.loadMore()
    expect(profile).toHaveBeenCalledTimes(2)
    expect(readPage.mock.calls.map(args => args[0])).toEqual([null, 'next'])
    expect(store.getSnapshot().items.map(item => item.id)).toEqual([row(3).id, row(2).id])
  })
  it.each([
    null, { ...customer, status: 'disabled' }, { ...customer, roles: ['stylist'] },
    { ...customer, roles: ['owner', 'customer'] }, { ...customer, roles: ['stylist', 'customer'] },
    { ...customer, accountId: 'another-account' },
  ])('blocks stale/foreign/non-Customer identities before list API', async account => {
    const readPage = vi.fn()
    const store = createCustomerAppointmentsReader({ accountId, readProfile: async () => account, readPage })
    await store.load()
    expect(store.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
    expect(readPage).not.toHaveBeenCalled()
  })
  it('removes prior pages when permissions are revoked during pagination', async () => {
    const profile = vi.fn().mockResolvedValueOnce(customer).mockResolvedValueOnce({ ...customer, roles: ['owner'] })
    const readPage = vi.fn().mockResolvedValue(page([item], 'next'))
    const store = createCustomerAppointmentsReader({ accountId, readProfile: profile, readPage })
    await store.load(); await store.loadMore()
    expect(store.getSnapshot()).toMatchObject({ kind: 'denied', items: [], hasNextPage: false })
    expect(readPage).toHaveBeenCalledOnce()
  })
  it('reports loading/empty, network error and successful retry', async () => {
    const pending = deferred()
    const read = vi.fn().mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([]))
    const store = reader(read)
    const first = store.load()
    expect(store.getSnapshot()).toMatchObject({ kind: 'loading', items: [] })
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
    pending.resolve(page([])); await first
    expect(store.getSnapshot().kind).toBe('success')
    await store.refresh(); expect(store.getSnapshot().kind).toBe('error')
    await store.retry(); expect(store.getSnapshot()).toMatchObject({ kind: 'success', items: [] })
  })
  it('deduplicates initial/load-more requests, rows and duplicate start timestamps using ID ordering', async () => {
    const pending = deferred()
    const read = vi.fn().mockResolvedValueOnce(page([row(3), row(2)], 'next')).mockReturnValueOnce(pending.promise)
    const store = reader(read)
    await Promise.all([store.load(), store.load()])
    const first = store.loadMore(), duplicate = store.loadMore()
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    pending.resolve(page([row(2), row(1)])); await Promise.all([first, duplicate])
    expect(store.getSnapshot().items.map(item => item.id)).toEqual([row(3).id, row(2).id, row(1).id])
    await store.loadMore(); expect(read).toHaveBeenCalledTimes(2)
  })
  it('rejects a repeated cursor and restarts from page one on retry', async () => {
    const read = vi.fn().mockResolvedValueOnce(page([row(3)], 'same')).mockResolvedValueOnce(page([row(2)], 'same')).mockResolvedValueOnce(page([row(1)]))
    const store = reader(read)
    await store.load(); await store.loadMore()
    expect(store.getSnapshot()).toMatchObject({ kind: 'error', restartRequired: true })
    await store.loadMore(); expect(read).toHaveBeenCalledTimes(2)
    await store.retry()
    expect(read.mock.calls[2][0]).toBeNull()
    expect(store.getSnapshot().items).toEqual([row(1)])
  })
  it('retries a failed page at the original cursor and restarts invalid server cursors', async () => {
    const read = vi.fn().mockResolvedValueOnce(page([row(3)], 'next')).mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(Object.assign(new Error('invalid cursor'), { status: 400, code: 'INVALID_CURSOR' })).mockResolvedValueOnce(page([row(1)]))
    const store = reader(read)
    await store.load(); await store.loadMore()
    expect(store.getSnapshot()).toMatchObject({ kind: 'error', items: [row(3)], retryMore: true })
    await store.retry()
    expect(store.getSnapshot().restartRequired).toBe(true)
    await store.retry()
    expect(read.mock.calls.map(args => args[0])).toEqual([null, 'next', 'next', null])
  })
  it('pull refresh aborts pending pagination, resets cursor and ignores a late page', async () => {
    const old = deferred()
    const read = vi.fn().mockResolvedValueOnce(page([row(3)], 'next')).mockReturnValueOnce(old.promise).mockResolvedValueOnce(page([row(5)]))
    const store = reader(read)
    await store.load(); const pagination = store.loadMore()
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    const refresh = store.refresh()
    expect(store.getSnapshot().refreshing).toBe(true)
    expect(read.mock.calls[1][1].aborted).toBe(true)
    await refresh; old.resolve(page([row(2)])); await pagination
    expect(store.getSnapshot().items).toEqual([row(5)])
    expect(store.getSnapshot().nextCursor).toBeNull()
  })
  it('deduplicates simultaneous refresh requests and replaces the previous loaded pages', async () => {
    const pending = deferred(), read = vi.fn().mockResolvedValueOnce(page([row(3)], 'next')).mockReturnValueOnce(pending.promise)
    const store = reader(read)
    await store.load()
    const first = store.refresh(), second = store.refresh()
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    pending.resolve(page([])); await Promise.all([first, second])
    expect(store.getSnapshot().items).toEqual([])
  })
  it('logout/cancel clears data and ignores a previous account response', async () => {
    const pending = deferred(), oldRead = vi.fn().mockReturnValueOnce(pending.promise)
    const oldStore = reader(oldRead), job = oldStore.load()
    await vi.waitFor(() => expect(oldRead).toHaveBeenCalledOnce())
    oldStore.cancel()
    const nextStore = createCustomerAppointmentsReader({ accountId: 'new', readProfile: async () => ({ ...customer, accountId: 'new' }), readPage: async () => page([row(8)]) })
    await nextStore.load(); pending.resolve(page([row(1)])); await job
    expect(oldStore.getSnapshot()).toMatchObject({ kind: 'loading', items: [] })
    expect(nextStore.getSnapshot().items).toEqual([row(8)])
  })
  it('focus/blur and foreground/background subscribe, refresh and dispose without duplicate loads', async () => {
    const read = vi.fn().mockResolvedValue(page([item]))
    const store = reader(read)
    let change
    const remove = vi.fn(), appState = { currentState: 'active', addEventListener: vi.fn((_event, callback) => { change = callback; return { remove } }) }
    const dispose = bindAppointmentLifecycle(store, appState)
    await vi.waitFor(() => expect(store.getSnapshot().kind).toBe('success'))
    change('active'); expect(read).toHaveBeenCalledOnce()
    change('background'); expect(store.getSnapshot().items).toEqual([])
    change('active')
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    dispose(); expect(remove).toHaveBeenCalledOnce()
    expect(store.getSnapshot().items).toEqual([])
    const returnToScreen = bindAppointmentLifecycle(store, appState)
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3))
    returnToScreen()
  })
})

describe('Upcoming/History, presentation and navigation policy', () => {
  it('classifies by status rather than date and never hides an overdue in-progress appointment', () => {
    const items = [row(1, 'confirmed'), row(2, 'in_progress'), row(3, 'completed'), row(4, 'cancelled'), row(5, 'no_show')]
    const state = { kind: 'success', items, hasNextPage: false }
    expect(customerAppointmentTab(state, 'upcoming').items.map(item => item.status)).toEqual(['confirmed', 'in_progress'])
    expect(customerAppointmentTab(state, 'history').items.map(item => item.status)).toEqual(['completed', 'cancelled', 'no_show'])
    expect(customerAppointmentTab(state, 'history').counts).toEqual({ upcoming: 2, history: 3 })
  })
  it('does not claim empty/history counts when remaining pages can contain those statuses', () => {
    for (const kind of ['success', 'loadingMore', 'error']) {
      const view = customerAppointmentTab({ kind, items: [item], hasNextPage: true }, 'history')
      expect(view).toMatchObject({ items: [], counts: null, empty: false, incomplete: true })
    }
    expect(customerAppointmentTab({ kind: 'success', items: [], hasNextPage: false }, 'history').empty).toBe(true)
  })
  it('does not report empty when a fresh load failed, and shows later history after load-more', () => {
    expect(customerAppointmentTab({ kind: 'error', items: [], hasNextPage: false }, 'history').empty).toBe(false)
    const view = customerAppointmentTab({ kind: 'success', items: [item, row(2, 'cancelled')], hasNextPage: false }, 'history')
    expect(view.items).toHaveLength(1)
    expect(view.empty).toBe(false)
  })
  it('formats Vietnam date across UTC midnight, all services, duration and snapshot price', () => {
    const text = appointmentCardText(item)
    expect(text.date).toContain('24/10/2026')
    expect(text.time).toBe('00:15 – 01:00')
    expect(text.services).toBe('Cắt snapshot · Gội đầu')
    expect(text.duration).toBe('45 phút')
    expect(text.price).toContain('300.000')
    expect(JSON.stringify(text)).not.toContain('Thanh toán')
  })
  it('routes each role to its appointment list while Shifts remains a separate route', () => {
    expect(isAppointmentCustomer(customer)).toBe(true)
    expect(appointmentListDestination(customer)).toBe('CustomerAppointments')
    expect(appointmentListDestination({ ...customer, roles: ['stylist'] })).toBe('StylistAppointments')
    expect(appointmentListDestination({ ...customer, roles: ['customer', 'stylist'] })).toBe('StylistAppointments')
    expect(appointmentListDestination({ ...customer, roles: ['owner'] })).toBeNull()
    expect(appointmentListDestination({ ...customer, roles: ['customer', 'owner'] })).toBeNull()
    expect(appointmentListDestination({ ...customer, status: 'disabled' })).toBeNull()
    expect(appointmentListDestination(null)).toBeNull()
  })
})
