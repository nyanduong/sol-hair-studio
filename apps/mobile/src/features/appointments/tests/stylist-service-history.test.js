import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers'
import { listStylistServiceHistory, serviceHistoryDto } from '../api/stylist-service-history.api.js'
import { createStylistServiceHistoryReader } from '../hooks/stylist-service-history-reader.js'
import { bindAppointmentLifecycle } from '../hooks/customer-appointments-reader.js'
import { createStylistAppointmentReader } from '../hooks/stylist-appointments-reader.js'

const accountId = 'aaaaaaaaaaaaaaaaaaaaaaaa', staffId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const id = '111111111111111111111111', otherStaffId = 'cccccccccccccccccccccccc'
const profile = { account: { accountId, status: 'active', roles: ['stylist'] } }
const staff = { staffId, accountId }
const record = { id, staffId: otherStaffId, staffNameSnapshot: 'Stylist trước',
  status: 'completed', startAt: '2026-10-23T16:30:00.000Z', endAt: '2026-10-23T17:00:00.000Z',
  completedAt: '2026-10-23T17:05:00.000Z', timeZone: 'Asia/Ho_Chi_Minh', localDate: '2026-10-23',
  totalPriceVnd: 100000, totalDurationMinutes: 30,
  items: [{ serviceId: 'cut', name: 'Tên dịch vụ tại lúc đặt', priceVnd: 100000, durationMinutes: 30 }] }
const row = n => ({ ...record, id: n.toString(16).padStart(24, '0') })
const page = (items = [record], cursor = null) => ({ items,
  pagination: { hasNextPage: Boolean(cursor), nextCursor: cursor } })
const failure = status => Object.assign(new Error('Rejected'), { status, code: 'APPOINTMENT_NOT_FOUND' })
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
function setup(overrides = {}) {
  return createStylistServiceHistoryReader({ accountId, appointmentId: id,
    readProfile: vi.fn().mockResolvedValue(profile), readStaff: vi.fn().mockResolvedValue([staff]),
    readPage: vi.fn().mockResolvedValue(page()), ...overrides })
}
function respond(data, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(status < 400 ? { data } : data), { status }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('service history API and contact-free DTO', () => {
  it('uses only the context endpoint, limit=20, opaque cursor, Bearer and abort signal', async () => {
    const fetch = respond(page()), controller = new AbortController()
    const result = await listStylistServiceHistory('https://api.test', 'session', id, 'opaque+/=', controller.signal)
    const [url, options] = fetch.mock.calls[0]
    expect(new URL(url).pathname).toBe('/api/appointments/' + id + '/service-history')
    expect([...new URL(url).searchParams]).toEqual([['limit', '20'], ['cursor', 'opaque+/=']])
    expect(options.headers.get('Authorization')).toBe('Bearer session')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.body).toBeUndefined()
    expect(result.items).toEqual([serviceHistoryDto(record)])
    expect(result.pagination).toEqual(page().pagination)
  })
  it('keeps completed snapshot services from other staff without requiring contact data', () => {
    expect(serviceHistoryDto(record)).toEqual({
      id, staffId: otherStaffId, staffNameSnapshot: record.staffNameSnapshot, status: 'completed',
      startAt: record.startAt, endAt: record.endAt, completedAt: record.completedAt,
      totalPriceVnd: 100000, totalDurationMinutes: 30, items: record.items,
    })
  })
  it('allows an empty server page', async () => {
    respond(page([]))
    expect(await listStylistServiceHistory('https://api.test', 'session', id)).toEqual(page([]))
  })
  it('strips unknown root/nested fields instead of exposing catalog, contact or admin metadata', () => {
    const result = serviceHistoryDto({ ...record, secret: 'private',
      items: [{ ...record.items[0], email: 'private', currentPrice: 900000, notes: 'private' }] })
    expect(result.items).toEqual(record.items)
    expect(JSON.stringify(result)).not.toContain('private')
    expect(result).not.toHaveProperty('secret')
  })
  it.each(['confirmed', 'in_progress', 'cancelled', 'no_show'])('rejects %s, not a completed history record', status => {
    expect(() => serviceHistoryDto({ ...record, status })).toThrow()
  })
  it.each(['email', 'phone', 'customerId', 'customerSnapshot', 'actorId', 'accountId', 'audit', 'events', 'revision', 'lastCommand'])('rejects disallowed root %s', field => {
    expect(() => serviceHistoryDto({ ...record, [field]: 'private' })).toThrow()
  })
  it.each([undefined, 'bad', '2026-10-23T17:05:00+00:00'])('rejects invalid actual completion %s', completedAt => {
    expect(() => serviceHistoryDto({ ...record, completedAt })).toThrow()
  })
  it.each([null, undefined, 'bad', '../customers/private'])('rejects invalid context %s before network', async context => {
    const fetch = respond(page())
    await expect(listStylistServiceHistory('https://api.test', 'session', context)).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([401, 403, 404, 500])('preserves HTTP %s and business error code', async status => {
    respond({ code: 'APPOINTMENT_NOT_FOUND', message: 'Rejected' }, status)
    await expect(listStylistServiceHistory('https://api.test', 'session', id))
      .rejects.toMatchObject({ status, code: 'APPOINTMENT_NOT_FOUND' })
  })
  it.each([
    { items: null, pagination: page().pagination },
    { items: [], pagination: { hasNextPage: true, nextCursor: null } },
    { items: [], pagination: { hasNextPage: false, nextCursor: 'old' } },
    { items: [], pagination: {} },
  ])('rejects invalid pagination envelope %#', async data => {
    respond(data)
    await expect(listStylistServiceHistory('https://api.test', 'session', id)).rejects.toThrow()
  })
  it('keeps network failure retryable without manufacturing history', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network')))
    await expect(listStylistServiceHistory('https://api.test', 'session', id)).rejects.toThrow('Network')
  })
})

describe('history reader identity, pagination and lifecycle', () => {
  it('exposes loading until a scoped request completes, then completed history', async () => {
    const wait = deferred(), readPage = vi.fn(() => wait.promise), reader = setup({ readPage })
    expect(reader.getSnapshot()).toMatchObject({ kind: 'loading', items: [] })
    const job = reader.load()
    await vi.waitFor(() => expect(readPage).toHaveBeenCalledOnce())
    expect(readPage).toHaveBeenCalledWith(id, null, expect.any(AbortSignal))
    expect(reader.getSnapshot().items).toEqual([])
    wait.resolve(page()); await job
    expect(reader.getSnapshot()).toMatchObject({ kind: 'success', items: [record] })
  })
  it('reports genuine empty history separately from failures', async () => {
    const reader = setup({ readPage: async () => page([]) })
    await reader.load()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'success', items: [], hasNextPage: false })
  })
  it.each([['customer'], ['owner'], ['owner', 'stylist']])('does not issue history requests for roles %s', roles => {
    const readPage = vi.fn(), reader = setup({ readPage,
      readProfile: async () => ({ account: { ...profile.account, roles } }) })
    return reader.load().then(() => {
      expect(reader.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
      expect(readPage).not.toHaveBeenCalled()
    })
  })
  it('checks active identity and Staff account linkage before loading', async () => {
    const readPage = vi.fn()
    for (const overrides of [
      { readProfile: async () => ({ account: { ...profile.account, status: 'disabled' } }) },
      { readProfile: async () => ({ account: { ...profile.account, accountId: 'other' } }) },
      { readStaff: async () => [{ ...staff, accountId: 'other' }] },
      { readStaff: async () => [] },
    ]) {
      const reader = setup({ readPage, ...overrides }); await reader.load()
      expect(reader.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
    }
    expect(readPage).not.toHaveBeenCalled()
  })
  it('clears previous pages if Staff identity changes, without treating other staff history as unauthorized', async () => {
    const readStaff = vi.fn().mockResolvedValueOnce([staff]).mockResolvedValue([{ ...staff, staffId: otherStaffId }])
    const readPage = vi.fn().mockResolvedValue(page([record], 'next')), reader = setup({ readStaff, readPage })
    await reader.load()
    expect(reader.getSnapshot().items[0].staffId).toBe(otherStaffId)
    await reader.loadMore()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
    expect(readPage).toHaveBeenCalledOnce()
  })
  it('sorts by completedAt descending then ID descending, deduplicates pages and blocks duplicate loadMore', async () => {
    const older = { ...row(8), completedAt: '2026-10-22T17:05:00.000Z' }
    const readPage = vi.fn().mockResolvedValueOnce(page([row(1), row(3)], 'next'))
      .mockResolvedValueOnce(page([row(3), older, row(2)]))
    const reader = setup({ readPage }); await reader.load()
    await Promise.all([reader.loadMore(), reader.loadMore()])
    expect(reader.getSnapshot().items.map(item => item.id)).toEqual([row(3).id, row(2).id, row(1).id, older.id])
    expect(readPage).toHaveBeenCalledTimes(2)
    expect(readPage.mock.calls[1][1]).toBe('next')
  })
  it('detects repeated cursors and restarts instead of looping', async () => {
    const readPage = vi.fn().mockResolvedValue(page([record], 'same')), reader = setup({ readPage })
    await reader.load(); await reader.loadMore()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'error', restartRequired: true })
    await reader.retry()
    expect(readPage.mock.calls[2][1]).toBeNull()
  })
  it('retains loaded pages on a network page error and retries the same cursor', async () => {
    const readPage = vi.fn().mockResolvedValueOnce(page([row(1)], 'next'))
      .mockRejectedValueOnce(new Error('Network')).mockResolvedValueOnce(page([row(2)]))
    const reader = setup({ readPage }); await reader.load(); await reader.loadMore()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'error', items: [row(1)] })
    await reader.retry()
    expect(readPage.mock.calls[2][1]).toBe('next')
    expect(reader.getSnapshot().items).toHaveLength(2)
  })
  it.each([401, 403, 404])('clears data on HTTP %s, including loss of context assignment on later pages', async status => {
    const readPage = vi.fn().mockResolvedValueOnce(page([record], 'next')).mockRejectedValueOnce(failure(status))
    const reader = setup({ readPage }); await reader.load(); await reader.loadMore()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'denied', items: [], hasNextPage: false })
  })
  it('clears old records on refresh and replaces them with server results', async () => {
    const wait = deferred(), readPage = vi.fn().mockResolvedValueOnce(page()).mockImplementationOnce(() => wait.promise)
    const reader = setup({ readPage }); await reader.load()
    const job = reader.refresh()
    expect(reader.getSnapshot()).toMatchObject({ items: [], refreshing: true })
    wait.resolve(page([row(2)])); await job
    expect(reader.getSnapshot()).toMatchObject({ items: [row(2)], refreshing: false })
  })
  it('ignores late responses after logout/context switch and leaves the next appointment isolated', async () => {
    const wait = deferred(), readPage = vi.fn(() => wait.promise), old = setup({ readPage })
    const job = old.load()
    await vi.waitFor(() => expect(readPage).toHaveBeenCalled())
    old.cancel()
    const nextRead = vi.fn().mockResolvedValue(page([row(9)]))
    const next = setup({ appointmentId: row(9).id, readPage: nextRead }); await next.load()
    wait.resolve(page([record])); await job
    expect(old.getSnapshot().items).toEqual([])
    expect(nextRead).toHaveBeenCalledWith(row(9).id, null, expect.any(AbortSignal))
    expect(next.getSnapshot().items).toEqual([row(9)])
  })
  it('isolates separate account readers even when the previous request finishes late', async () => {
    const wait = deferred(), readPage = vi.fn(() => wait.promise), old = setup({ readPage })
    const job = old.load(); await vi.waitFor(() => expect(readPage).toHaveBeenCalled())
    old.cancel()
    const nextAccount = 'dddddddddddddddddddddddd'
    const next = setup({ accountId: nextAccount, readProfile: async () => ({ account: { ...profile.account, accountId: nextAccount } }),
      readStaff: async () => [{ ...staff, accountId: nextAccount }], readPage: async () => page([]) })
    await next.load(); wait.resolve(page()); await job
    expect(old.getSnapshot().items).toEqual([])
    expect(next.getSnapshot()).toMatchObject({ kind: 'success', items: [] })
  })
  it('does not call profile/Staff/history endpoints for invalid navigation params', async () => {
    const readProfile = vi.fn(), readPage = vi.fn(), reader = setup({ appointmentId: null, readProfile, readPage })
    await reader.load()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'error', items: [], error: { status: 400 } })
    expect(readProfile).not.toHaveBeenCalled(); expect(readPage).not.toHaveBeenCalled()
  })
  it('loads once per focus/foreground, cancels on background/blur and removes its subscription', async () => {
    let change
    const remove = vi.fn(), readPage = vi.fn().mockResolvedValue(page()), reader = setup({ readPage })
    const app = { currentState: 'active', addEventListener: vi.fn((event, callback) => { change = callback; return { remove } }) }
    const dispose = bindAppointmentLifecycle(reader, app)
    await vi.waitFor(() => expect(reader.getSnapshot().kind).toBe('success'))
    change('active'); expect(readPage).toHaveBeenCalledOnce()
    change('background'); expect(reader.getSnapshot().items).toEqual([])
    change('active'); await vi.waitFor(() => expect(readPage).toHaveBeenCalledTimes(2))
    dispose()
    expect(remove).toHaveBeenCalledOnce(); expect(reader.getSnapshot().items).toEqual([])
  })
  it('history failure does not cancel or clear the independently loaded serving appointment', async () => {
    const history = setup({ readPage: async () => { throw failure(404) } })
    const detail = createStylistAppointmentReader({ accountId, appointmentId: id,
      readProfile: async () => profile, readStaff: async () => [staff],
      readDetail: async () => ({ ...record, staffId, status: 'in_progress', revision: 4 }) })
    await detail.load(); await history.load()
    expect(history.getSnapshot().kind).toBe('denied')
    expect(detail.getSnapshot()).toMatchObject({ kind: 'success', appointment: { id, status: 'in_progress', revision: 4 } })
  })
  it('uses native history navigation with context ID, prevents duplicate screens and returns to detail', () => {
    const router = StackRouter({ initialRouteName: 'StylistAppointmentDetail' })
    const options = { routeNames: ['StylistAppointmentDetail', 'StylistServiceHistory', 'StylistShifts', 'Booking'],
      routeParamList: { StylistAppointmentDetail: { appointmentId: id } },
      routeGetIdList: { StylistServiceHistory: ({ params }) => params?.appointmentId } }
    let state = router.getInitialState(options)
    const action = CommonActions.navigate('StylistServiceHistory', { appointmentId: id })
    state = router.getStateForAction(state, action, options)
    state = router.getStateForAction(state, action, options)
    expect(state.routes).toHaveLength(2)
    expect(state.routes.at(-1).params).toEqual({ appointmentId: id })
    state = router.getStateForAction(state, StackActions.pop(), options)
    expect(state.routes[state.index]).toMatchObject({ name: 'StylistAppointmentDetail', params: { appointmentId: id } })
  })
})
