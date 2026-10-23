import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/context/auth-context.js'
import AppRoutes from '../../../routes/AppRoutes.jsx'
import OwnerAppointmentManagement from '../components/OwnerAppointmentManagement.jsx'
import { assertOwnerAssignedAppointment, resolveOwnerStaff, readOwnerAppointmentScope, createOwnerAppointmentReader, useOwnerAppointmentRead } from '../hooks/useOwnerAppointments.js'
import { createOwnerAppointmentCommand } from '../hooks/useOwnerAppointmentCommand.js'

vi.mock('../hooks/useOwnerAppointments.js', async original => ({
  ...await original(), useOwnerAppointmentRead: vi.fn(),
}))
const accountId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const staffId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const otherStaff = 'cccccccccccccccccccccccc'
const owner = { accountId, roles: ['owner'], status: 'active' }
const people = [
  { accountId, staffId, displayName: 'Owner stylist', isActive: true },
  { accountId: 'dddddddddddddddddddddddd', staffId: otherStaff, displayName: 'Owner stylist', isActive: true },
]
const item = {
  id: '1234567890abcdef12345678', revision: 3, staffId, status: 'confirmed',
  customerId: 'customer-a', customerSnapshot: { displayName: 'Khách A', phone: '+84901234567' },
  staffNameSnapshot: 'Owner stylist', startAt: '2026-10-23T03:00:00.000Z', endAt: '2026-10-23T03:30:00.000Z',
  items: [{ serviceId: 'cut', name: 'Cắt tóc', durationMinutes: 30, priceVnd: 100000 }],
  totalDurationMinutes: 30, totalPriceVnd: 100000,
}
const page = (items = [item], nextCursor = null) => ({ items, pagination: { hasNextPage: Boolean(nextCursor), nextCursor } })
const read = (kind = 'list', query = {}, cursor, signal, profile = owner) => readOwnerAppointmentScope({
  baseUrl: 'https://api.example.test', token: 'owner-token', kind,
  query: { localDate: '2026-10-23', mineStaffId: staffId, ...query }, cursor, signal, profile,
})
function respond(staff = people, appointments = page()) {
  const fetch = vi.fn(async url => ({ ok: true, json: async () => ({ data: url.includes('/api/staff') ? staff : appointments }) }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
function route(url = '/quan-ly/lich-hen', account = owner) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><AuthContext.Provider value={{
    account, token: account ? 'owner-token' : null, isAuthenticated: Boolean(account), openLoginModal() {}, logout() {},
  }}><AppRoutes /></AuthContext.Provider></MemoryRouter>)
}
const callbacks = { retry() {}, loadMore() {} }
let profileState
beforeEach(() => {
  profileState = { kind: 'success', value: resolveOwnerStaff(people, accountId), ...callbacks }
  vi.mocked(useOwnerAppointmentRead).mockImplementation((_token, kind, params) => {
    if (kind === 'my-staff') return profileState
    if (kind === 'staff') return { kind: 'success', value: [], ...callbacks }
    if (kind === 'detail') return { kind: 'success', value: { ...item, staffId: params.mineStaffId ?? otherStaff }, ...callbacks }
    return { kind: 'success', items: [], hasNextPage: false, ...callbacks }
  })
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('Owner Staff identity and scoped HTTP reads', () => {
  it('matches accountId instead of identical names and does not require a stylist role', async () => {
    expect(resolveOwnerStaff(people, accountId)).toEqual({ staffId, displayName: 'Owner stylist', isActive: true })
    respond()
    expect(await read('my-staff', {})).toEqual({ staffId, displayName: 'Owner stylist', isActive: true })
    expect(owner.roles).toEqual(['owner'])
  })
  it('returns no profile without matching accountId, refusing guessed or duplicate mappings', () => {
    expect(resolveOwnerStaff(people, 'missing-account')).toBeNull()
    expect(resolveOwnerStaff([{ ...people[0], accountId: 'other', email: 'owner@example.test' }], accountId)).toBeNull()
    expect(() => resolveOwnerStaff([people[0], people[0]], accountId)).toThrow()
    expect(() => resolveOwnerStaff([{ ...people[0], staffId: 'bad' }], accountId)).toThrow()
    expect(() => resolveOwnerStaff(people, undefined)).toThrow()
  })
  it('filters on the server with the actual Staff ID, ignoring a forged URL Staff filter', async () => {
    const fetch = respond()
    const result = await read('list', { staffId: otherStaff, status: 'confirmed' }, 'opaque-cursor')
    expect(result.items).toHaveLength(1)
    const [url, options] = fetch.mock.calls[1]
    const query = new URL(url).searchParams
    expect(query.get('staffId')).toBe(staffId)
    expect(query.get('localDate')).toBe('2026-10-23')
    expect(query.get('status')).toBe('confirmed')
    expect(query.get('cursor')).toBe('opaque-cursor')
    expect(query.has('mineStaffId')).toBe(false)
    expect(options.headers.get('Authorization')).toBe('Bearer owner-token')
  })
  it('keeps all-salon filters unchanged and skips personal profile lookup there', async () => {
    const fetch = respond(people, page([{ ...item, staffId: otherStaff }]))
    const result = await readOwnerAppointmentScope({ baseUrl: 'https://api.example.test', token: 'token',
      kind: 'list', query: { localDate: '2026-10-23', staffId: otherStaff }, profile: owner })
    expect(result.items[0].staffId).toBe(otherStaff)
    expect(fetch).toHaveBeenCalledOnce()
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('staffId')).toBe(otherStaff)
  })
  it('supports an empty assigned list and never falls back to all appointments without a Staff profile', async () => {
    respond(people, page([]))
    expect((await read()).items).toEqual([])
    const fetch = respond([])
    expect(await read('my-staff')).toBeNull()
    await expect(read()).rejects.toMatchObject({ status: 403 })
    expect(fetch.mock.calls.every(([url]) => url.endsWith('/api/staff'))).toBe(true)
  })
  it('fails closed when the Backend page or detail contains another Stylist assignment', async () => {
    respond(people, page([{ ...item, staffId: otherStaff }]))
    await expect(read()).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_ASSIGNED' })
    respond(people, { ...item, staffId: otherStaff })
    await expect(read('detail', { id: item.id })).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_ASSIGNED' })
    expect(() => assertOwnerAssignedAppointment(item, undefined)).toThrow()
  })
  it.each([{ roles: ['customer'], status: 'active' }, { roles: ['owner'], status: 'disabled' }])('does not read data after invalid current role', async profile => {
    const fetch = respond()
    await expect(read('list', {}, undefined, undefined, profile)).rejects.toMatchObject({ status: 403 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rechecks the linked Staff on every paginated request', async () => {
    const fetch = respond(people, page([item], 'next'))
    const reader = createOwnerAppointmentReader({ paginated: true, readProfile: async () => owner,
      readData: (cursor, signal, profile) => read('list', {}, cursor, signal, profile) })
    await reader.load()
    fetch.mockImplementation(async url => ({ ok: true, json: async () => ({ data: url.includes('/api/staff') ? [] : page() }) }))
    await reader.load(true)
    expect(reader.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
    expect(fetch.mock.calls.filter(([url]) => url.includes('/api/appointments'))).toHaveLength(1)
  })
  it('revalidates assignment before Start/Complete/retry and blocks reassignment before POST', async () => {
    const fetch = respond(people, item), send = vi.fn().mockRejectedValueOnce(new TypeError('offline'))
    const command = createOwnerAppointmentCommand({ readProfile: async () => owner,
      verify: (profile, signal) => read('detail', { id: item.id }, undefined, signal, profile), send }, () => 'same-service-key')
    await expect(command.run({ expectedRevision: 3 })).rejects.toMatchObject({ uncertain: true })
    expect(send).toHaveBeenCalledOnce()
    fetch.mockImplementation(async url => ({ ok: true, json: async () => ({ data: url.includes('/api/staff') ? people : { ...item, staffId: otherStaff } }) }))
    await expect(command.run({ expectedRevision: 3 })).rejects.toMatchObject({ status: 403 })
    expect(send).toHaveBeenCalledOnce()
  })
  it('drops late personal responses when changing account/tab/filter', async () => {
    let resolveOld
    const old = new Promise(resolve => { resolveOld = resolve })
    const reader = createOwnerAppointmentReader({ readProfile: async () => owner, readData: () => old, paginated: true })
    const job = reader.load()
    reader.cancel()
    const next = createOwnerAppointmentReader({ readProfile: async () => ({ ...owner, accountId: 'new-owner' }), readData: async () => page([]), paginated: true })
    await next.load(); resolveOld(page()); await job
    expect(reader.getSnapshot().items).toEqual([])
    expect(next.getSnapshot().items).toEqual([])
  })
})

describe('Owner salon and personal tab UX', () => {
  it('renders two scopes and preserves date/status/Staff filters in navigation', () => {
    const html = route('/quan-ly/lich-hen?localDate=2026-10-24&status=confirmed&staffId=' + otherStaff)
    expect(html).toContain('Lịch toàn salon')
    expect(html).toContain('Lịch của tôi')
    expect(html).toContain('view=mine')
    expect(html).toContain('localDate=2026-10-24')
    expect(html).toContain('status=confirmed')
    expect(html).toContain('Tất cả stylist')
  })
  it('locks personal scope and removes the selectable Stylist filter', () => {
    const html = route('/quan-ly/lich-hen?view=mine&localDate=2026-10-24&staffId=' + otherStaff)
    expect(html).not.toContain('Tất cả stylist')
    expect(html).toContain('Lịch được giao cho Owner stylist')
    expect(html).toContain('Không có lịch hẹn phù hợp')
    const query = vi.mocked(useOwnerAppointmentRead).mock.calls.find(([, kind]) => kind === 'list')[2]
    expect(query).toMatchObject({ staffId, mineStaffId: staffId, localDate: '2026-10-24' })
  })
  it('keeps personal detail links/back navigation scoped and shows personal Start', () => {
    const html = route('/quan-ly/lich-hen/' + item.id + '?view=mine&localDate=2026-10-24')
    expect(html).toContain('view=mine')
    expect(html).toContain('>Bắt đầu phục vụ</button>')
    expect(html).toContain('/quan-ly/lich-hen?localDate=2026-10-24')
  })
  it('does not expose Start/Complete in all-salon detail, retaining management commands', () => {
    const html = route('/quan-ly/lich-hen/' + item.id)
    expect(html).toContain('>Đổi lịch</button>')
    expect(html).toContain('>Hủy lịch</button>')
    expect(html).not.toContain('>Bắt đầu phục vụ</button>')
    expect(html).not.toContain('>Hoàn tất phục vụ</button>')
  })
  it('separates missing profile, lookup error and loading from an empty appointment list', () => {
    for (const [state, text] of [[{ kind: 'loading' }, 'Đang xác định hồ sơ'], [{ kind: 'error' }, 'Không xác định được hồ sơ'], [{ kind: 'success', value: null }, 'chưa có hồ sơ stylist']]) {
      profileState = { ...state, ...callbacks }
      const html = route('/quan-ly/lich-hen?view=mine')
      expect(html).toContain(text)
      expect(html).not.toContain('Không có lịch hẹn phù hợp')
      expect(vi.mocked(useOwnerAppointmentRead).mock.calls.filter(([, kind]) => kind === 'list')).toHaveLength(0)
      vi.clearAllMocks()
    }
  })
  it('keeps login/Owner role gates for both tabs', () => {
    expect(route('/quan-ly/lich-hen?view=mine', null)).toContain('Đăng nhập để xem lịch')
    expect(route('/quan-ly/lich-hen?view=mine', { ...owner, roles: ['stylist'] })).toContain('chỉ dành cho Owner')
  })
  it.each(['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'])('shows service commands for assigned %s only in personal scope', status => {
    const personal = renderToStaticMarkup(<OwnerAppointmentManagement token="fixture" appointment={{ ...item, status }} personalStaffId={staffId} />)
    expect(personal.includes('>Bắt đầu phục vụ</button>')).toBe(status === 'confirmed')
    expect(personal.includes('>Hoàn tất phục vụ</button>')).toBe(status === 'in_progress')
    const wrong = renderToStaticMarkup(<OwnerAppointmentManagement token="fixture" appointment={{ ...item, status, staffId: otherStaff }} personalStaffId={staffId} />)
    expect(wrong).not.toContain('>Bắt đầu phục vụ</button>')
    expect(wrong).not.toContain('>Hoàn tất phục vụ</button>')
  })
})
