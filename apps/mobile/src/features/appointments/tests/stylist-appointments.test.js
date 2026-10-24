import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers'
import { salonDate } from '../../../../../../shared/booking.js'
import { getStylistAppointment, listStylistAppointments, stylistAppointmentDto } from '../api/stylist-appointments.api.js'
import { createStylistAppointmentReader } from '../hooks/stylist-appointments-reader.js'
import { bindAppointmentLifecycle } from '../hooks/customer-appointments-reader.js'
import { appointmentCardText, appointmentListDestination, isAppointmentStylist, moveAppointmentDay, validAppointmentDate } from '../appointment-presentation.js'

const accountId = 'aaaaaaaaaaaaaaaaaaaaaaaa', staffId = 'bbbbbbbbbbbbbbbbbbbbbbbb', otherStaff = 'cccccccccccccccccccccccc'
const id = '111111111111111111111111', date = '2026-10-24'
const stylist = { accountId, roles: ['stylist'], status: 'active' }
const staff = { staffId, accountId, isActive: true, displayName: 'An' }
const item = { id, staffId, staffNameSnapshot: 'An', status: 'confirmed',
  startAt: '2026-10-24T02:00:00.000Z', endAt: '2026-10-24T02:30:00.000Z', timeZone: 'Asia/Ho_Chi_Minh', localDate: date,
  items: [{ serviceId: 'cut', name: 'Cắt snapshot', priceVnd: 150000, durationMinutes: 30 }],
  totalPriceVnd: 150000, totalDurationMinutes: 30, customerSnapshot: { displayName: 'Khách A', phone: '+84901234567' } }
const detail = { ...item, revision: 4, confirmedAt: '2026-10-22T01:00:00.000Z' }
const row = n => ({ ...item, id: n.toString(16).padStart(24, '0') })
const page = (items = [item], cursor = null) => ({ items, pagination: { hasNextPage: Boolean(cursor), nextCursor: cursor } })
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
function setup(overrides = {}) {
  const readProfile = vi.fn().mockResolvedValue({ account: stylist }), readStaff = vi.fn().mockResolvedValue([staff])
  const readPage = vi.fn().mockResolvedValue(page())
  return createStylistAppointmentReader({ accountId, readProfile, readStaff, readPage, ...overrides })
}
function respond(data, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(status < 400 ? { data } : data), { status }))
  vi.stubGlobal('fetch', fetch); return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('Stylist Mobile read contract and field security', () => {
  it('uses role-scoped list with localDate/limit=50/cursor only, Bearer and AbortSignal', async () => {
    const fetch = respond(page()), abort = new AbortController()
    expect(await listStylistAppointments('http://10.0.2.2:4000', 'token', date, 'opaque+cursor', abort.signal)).toEqual(page())
    const [url, options] = fetch.mock.calls[0]
    expect(new URL(url).pathname).toBe('/api/appointments')
    expect([...new URL(url).searchParams]).toEqual([['localDate', date], ['limit', '50'], ['cursor', 'opaque+cursor']])
    expect(options.headers.get('Authorization')).toBe('Bearer token')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.body).toBeUndefined()
  })
  it('allows an empty 200 response without claiming missing permission', async () => {
    respond(page([]))
    expect(await listStylistAppointments('https://api.test', 'token', date)).toEqual(page([]))
  })
  it('detail reads exact ID, preserves revision/contact/snapshot and allowed actual timestamps/ETA', async () => {
    const data = { ...detail, status: 'in_progress', startedAt: detail.startAt, estimatedEndAt: '2026-10-24T03:00:00.000Z',
      affectedAppointments: [{ id: '222222222222222222222222', staffId, status: 'confirmed', startAt: item.startAt, endAt: item.endAt, reasons: ['staff_overlap'] }], ownerReviewRequired: true }
    const fetch = respond(data)
    const value = await getStylistAppointment('https://api.test', 'token', id)
    expect(fetch.mock.calls[0][0]).toBe('https://api.test/api/appointments/' + id)
    expect(value).toMatchObject({ revision: 4, customerSnapshot: item.customerSnapshot, items: item.items,
      startAt: item.startAt, endAt: item.endAt, startedAt: item.startAt, estimatedEndAt: data.estimatedEndAt })
    expect(value.affectedAppointments).toEqual(data.affectedAppointments)
    expect(value.ownerReviewRequired).toBe(true)
    expect(value).not.toHaveProperty('completedAt')
  })
  it('reads completed actual time without inventing ETA or payment data', () => {
    const data = stylistAppointmentDto({ ...detail, status: 'completed', startedAt: item.startAt, completedAt: item.endAt }, true)
    expect(data.completedAt).toBe(item.endAt)
    expect(data).not.toHaveProperty('estimatedEndAt')
    expect(JSON.stringify(data)).not.toContain('payment')
    expect(appointmentCardText(data).status).toBe('Đã hoàn tất')
  })
  it('strips nested email/account/catalog fields and all unknown metadata', () => {
    const data = stylistAppointmentDto({ ...detail, guard: 'private',
      customerSnapshot: { ...item.customerSnapshot, email: 'private', accountId: 'private' },
      items: item.items.map(service => ({ ...service, currentPrice: 999999, email: 'private' })) }, true)
    expect(data.customerSnapshot).toEqual(item.customerSnapshot)
    expect(data.items).toEqual(item.items)
    expect(JSON.stringify(data)).not.toContain('private')
    expect(data).not.toHaveProperty('guard')
  })
  it.each(['customerId', 'accountId', 'email', 'lastCommand', 'audit', 'events'])('rejects privileged root %s', field => {
    expect(() => stylistAppointmentDto({ ...detail, [field]: 'private' }, true)).toThrow()
  })
  it.each(['cancelled', 'no_show'])('does not accept status %s outside Stylist read scope', status => {
    expect(() => stylistAppointmentDto({ ...item, status })).toThrow()
  })
  it.each([401, 403, 404, 500])('keeps HTTP %s and business code for list/detail', async status => {
    respond({ code: 'APPOINTMENT_NOT_FOUND', message: 'server' }, status)
    await expect(listStylistAppointments('https://api.test', 'token', date)).rejects.toMatchObject({ status, code: 'APPOINTMENT_NOT_FOUND' })
    await expect(getStylistAppointment('https://api.test', 'token', id)).rejects.toMatchObject({ status })
  })
  it('rejects wrong appointment ID, wrong day and malformed pagination', async () => {
    respond({ ...detail, id: accountId })
    await expect(getStylistAppointment('https://api.test', 'token', id)).rejects.toThrow()
    respond(page([{ ...item, localDate: '2026-10-25' }]))
    await expect(listStylistAppointments('https://api.test', 'token', date)).rejects.toThrow('ngày')
    respond({ items: [], pagination: { hasNextPage: true, nextCursor: null } })
    await expect(listStylistAppointments('https://api.test', 'token', date)).rejects.toThrow('phân trang')
  })
  it.each(['bad', '2026-02-30'])('invalid date %s is rejected before network', async localDate => {
    const fetch = respond(page())
    await expect(listStylistAppointments('https://api.test', 'token', localDate)).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('Stylist scope, pagination and lifecycle', () => {
  it('starts loading and checks fresh account/Staff before every page, sorting ASC with equal-time ID tie-break', async () => {
    const readProfile = vi.fn().mockResolvedValue({ account: stylist }), readStaff = vi.fn().mockResolvedValue([staff])
    const readPage = vi.fn().mockResolvedValueOnce(page([row(3), row(1)], 'next')).mockResolvedValueOnce(page([row(3), row(2)]))
    const store = setup({ readProfile, readStaff, readPage })
    expect(store.getSnapshot()).toMatchObject({ kind: 'loading', items: [] })
    await store.load(); await store.loadMore()
    expect(store.getSnapshot().items.map(a => a.id)).toEqual([row(1).id, row(2).id, row(3).id])
    expect(readProfile).toHaveBeenCalledTimes(2)
    expect(readStaff).toHaveBeenCalledTimes(2)
    expect(readPage.mock.calls.map(call => call[0])).toEqual([null, 'next'])
  })
  it.each([null, { ...stylist, accountId: 'other' }, { ...stylist, roles: ['customer'] },
    { ...stylist, roles: ['owner', 'stylist'] }, { ...stylist, status: 'disabled' }])('denies foreign/non-Stylist account before Staff/list', async account => {
      const readStaff = vi.fn(), readPage = vi.fn(), store = setup({ readProfile: async () => ({ account }), readStaff, readPage })
      await store.load()
      expect(store.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
      expect(readStaff).not.toHaveBeenCalled()
      expect(readPage).not.toHaveBeenCalled()
    })
  it.each([[], [staff, staff], [{ ...staff, accountId: 'other' }], [{ ...staff, staffId: 'bad' }]])('denies ambiguous/foreign Staff %j', async profiles => {
    const readPage = vi.fn(), store = setup({ readStaff: async () => profiles, readPage })
    await store.load()
    expect(store.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
    expect(readPage).not.toHaveBeenCalled()
  })
  it('inactive Staff can still read history under active assigned account, matching Backend read rules', async () => {
    const store = setup({ readStaff: async () => [{ ...staff, isActive: false }] })
    await store.load()
    expect(store.getSnapshot().kind).toBe('success')
  })
  it('never publishes foreign Staff appointments or keeps earlier pages after an identity violation', async () => {
    const readPage = vi.fn().mockResolvedValueOnce(page([item], 'next')).mockResolvedValueOnce(page([{ ...item, staffId: otherStaff }]))
    const store = setup({ readPage })
    await store.load(); await store.loadMore()
    expect(store.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
  })
  it('Staff-link change between pages clears data before a new first-page read', async () => {
    const readStaff = vi.fn().mockResolvedValueOnce([staff]).mockResolvedValue([{ ...staff, staffId: otherStaff }])
    const readPage = vi.fn().mockResolvedValueOnce(page([item], 'next')).mockResolvedValue(page([{ ...item, staffId: otherStaff }]))
    const store = setup({ readStaff, readPage })
    await store.load(); await store.loadMore()
    expect(store.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
    await store.refresh()
    expect(store.getSnapshot().items[0].staffId).toBe(otherStaff)
  })
  it('detail denies a different Staff and validates bad deep params before any request', async () => {
    const foreign = setup({ appointmentId: id, readDetail: async () => ({ ...detail, staffId: otherStaff }) })
    await foreign.load()
    expect(foreign.getSnapshot()).toMatchObject({ kind: 'denied', appointment: null })
    const readProfile = vi.fn(), invalid = setup({ appointmentId: null, readProfile, readDetail: vi.fn() })
    await invalid.load()
    expect(invalid.getSnapshot().kind).toBe('invalid')
    expect(readProfile).not.toHaveBeenCalled()
  })
  it.each([[401, 'denied'], [403, 'denied'], [404, 'notFound'], [500, 'error']])('detail handles HTTP %s without retaining previous appointment', async (status, kind) => {
    const readDetail = vi.fn().mockResolvedValueOnce(detail).mockRejectedValueOnce(Object.assign(new Error('server'), { status }))
    const store = setup({ appointmentId: id, readDetail })
    await store.load(); await store.refresh()
    expect(store.getSnapshot()).toMatchObject({ kind, appointment: null })
  })
  it('error/retry and empty are distinct states', async () => {
    const store = setup({ readPage: vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(page([])) })
    await store.load(); expect(store.getSnapshot().kind).toBe('error')
    await store.retry(); expect(store.getSnapshot()).toMatchObject({ kind: 'success', items: [], hasNextPage: false })
  })
  it('repeated/invalid cursor requires restart; network page retry keeps cursor', async () => {
    const readPage = vi.fn().mockResolvedValueOnce(page([item], 'one')).mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(page([row(2)], 'one')).mockResolvedValueOnce(page([]))
    const store = setup({ readPage })
    await store.load(); await store.loadMore()
    expect(store.getSnapshot().retryMore).toBe(true)
    await store.retry()
    expect(readPage.mock.calls[2][0]).toBe('one')
    expect(store.getSnapshot().restartRequired).toBe(true)
    await store.retry()
    expect(readPage.mock.calls[3][0]).toBeNull()
  })
  it('rapid initial and pagination submissions deduplicate; pull refresh replaces pages', async () => {
    const wait = deferred(), readPage = vi.fn().mockReturnValueOnce(wait.promise).mockResolvedValue(page([row(2)]))
    const store = setup({ readPage })
    const first = store.load()
    expect(store.load()).toBe(first)
    wait.resolve(page([item], 'next')); await first
    const more = store.loadMore()
    expect(store.loadMore()).toBe(more)
    await more
    await store.refresh()
    expect(store.getSnapshot().items).toEqual([row(2)])
  })
  it('changing date drops old-day data immediately and late response cannot fill the new reader', async () => {
    const wait = deferred(), oldPage = vi.fn(() => wait.promise), old = setup({ readPage: oldPage })
    const job = old.load()
    await vi.waitFor(() => expect(oldPage).toHaveBeenCalled())
    old.cancel()
    const next = setup({ readPage: async () => page([{ ...row(2), localDate: '2026-10-25' }]) })
    await next.load()
    wait.resolve(page([item])); await job
    expect(old.getSnapshot().items).toEqual([])
    expect(next.getSnapshot().items[0].localDate).toBe('2026-10-25')
  })
  it('focus/foreground refresh and blur cleanup retain no stale customer contact', async () => {
    let change
    const remove = vi.fn(), app = { currentState: 'active', addEventListener: vi.fn((name, callback) => { change = callback; return { remove } }) }
    const readPage = vi.fn().mockResolvedValue(page()), store = setup({ readPage })
    const dispose = bindAppointmentLifecycle(store, app)
    await vi.waitFor(() => expect(store.getSnapshot().kind).toBe('success'))
    change('inactive')
    expect(store.getSnapshot().items).toEqual([])
    change('active')
    await vi.waitFor(() => expect(readPage).toHaveBeenCalledTimes(2))
    change('active'); expect(readPage).toHaveBeenCalledTimes(2)
    dispose(); expect(remove).toHaveBeenCalledOnce()
    expect(store.getSnapshot().items).toEqual([])
  })
  it('logout/account switch and detail ID change ignore a late old result', async () => {
    const wait = deferred(), readDetail = vi.fn(() => wait.promise), old = setup({ appointmentId: id, readDetail })
    const job = old.load()
    await vi.waitFor(() => expect(readDetail).toHaveBeenCalled())
    old.cancel()
    const nextId = row(2).id, next = setup({ appointmentId: nextId, readDetail: async () => ({ ...detail, id: nextId }) })
    await next.load()
    wait.resolve(detail); await job
    expect(old.getSnapshot().appointment).toBeNull()
    expect(next.getSnapshot().appointment.id).toBe(nextId)
    const other = setup({ accountId: 'other' })
    await other.load()
    expect(other.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
  })
})

describe('salon date and navigation policy', () => {
  it('Vietnam day and date controls do not shift at UTC midnight/year boundary', () => {
    expect(salonDate(new Date('2026-10-23T17:00:00.000Z'))).toBe('2026-10-24')
    expect(moveAppointmentDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(moveAppointmentDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(validAppointmentDate('2026-02-30')).toBe(false)
    expect(validAppointmentDate('bad')).toBe(false)
    expect(appointmentCardText({ ...item, startAt: '2026-10-23T17:00:00.000Z' }).date).toContain('24/10/2026')
  })
  it('Customer and Stylist route separately; mixed Customer+Stylist follows Stylist priority; Owner denied', () => {
    expect(isAppointmentStylist(stylist)).toBe(true)
    expect(appointmentListDestination(stylist)).toBe('StylistAppointments')
    expect(appointmentListDestination({ ...stylist, roles: ['customer', 'stylist'] })).toBe('StylistAppointments')
    expect(appointmentListDestination({ ...stylist, roles: ['customer'] })).toBe('CustomerAppointments')
    expect(appointmentListDestination({ ...stylist, roles: ['owner', 'stylist'] })).toBeNull()
    expect(appointmentListDestination({ ...stylist, status: 'disabled' })).toBeNull()
  })
  it('list → detail → back and Shifts remain independent native routes; duplicate detail taps reuse ID', () => {
    const router = StackRouter({ initialRouteName: 'StylistAppointments' })
    const options = { routeNames: ['StylistAppointments', 'StylistAppointmentDetail', 'StylistShifts', 'Booking', 'Profile', 'CustomerAppointments'],
      routeParamList: {}, routeGetIdList: { StylistAppointmentDetail: ({ params }) => params?.appointmentId } }
    let state = router.getInitialState(options)
    const action = CommonActions.navigate('StylistAppointmentDetail', { appointmentId: id })
    state = router.getStateForAction(state, action, options)
    state = router.getStateForAction(state, action, options)
    expect(state.routes).toHaveLength(2)
    expect(state.routes.at(-1).params.appointmentId).toBe(id)
    state = router.getStateForAction(state, StackActions.pop(), options)
    expect(state.routes[state.index].name).toBe('StylistAppointments')
    for (const route of ['StylistShifts', 'Booking', 'Profile', 'CustomerAppointments']) {
      expect(router.getStateForAction(state, CommonActions.navigate(route), options).routes.at(-1).name).toBe(route)
    }
  })
})
