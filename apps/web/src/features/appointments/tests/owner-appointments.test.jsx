import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/context/auth-context.js'
import LegacyAppointmentsFixture from './legacy-owner-page.fixture.jsx'
import OwnerAppointmentsView from '../components/OwnerAppointmentsView.jsx'
import { createOwnerAppointmentReader } from '../hooks/useOwnerAppointments.js'
import { listOwnerAppointments, readOwnerAppointment } from '../api/owner-appointments.api.js'

const id = '1234567890abcdef12345678'
const owner = { accountId: 'owner-a', roles: ['owner'], status: 'active' }
const item = {
  id, revision: 3, customerId: 'customer-a', customerSnapshot: { displayName: 'Khách A', phone: '+84901234567' },
  staffId: 'staff-a', staffNameSnapshot: 'Stylist An', status: 'confirmed',
  startAt: '2026-10-23T02:00:00.000Z', endAt: '2026-10-23T03:00:00.000Z',
  totalDurationMinutes: 60, totalPriceVnd: 150000,
  items: [{ serviceId: 'cut', name: 'Cắt tóc snapshot', priceVnd: 100000, durationMinutes: 40 },
    { serviceId: 'wash', name: 'Gội đầu', priceVnd: 50000, durationMinutes: 20 }],
}
const page = (ids, cursor = null) => ({ items: ids.map(value => ({ ...item, id: value })),
  pagination: { hasNextPage: cursor !== null, nextCursor: cursor } })
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function setup(readData = vi.fn().mockResolvedValue(page([])), readProfile = vi.fn().mockResolvedValue(owner), paginated = true) {
  return { reader: createOwnerAppointmentReader({ readData, readProfile, paginated }), readData, readProfile }
}
function respond(data, status = 200) {
  const fetch = vi.fn().mockResolvedValue({ ok: status === 200, status, json: async () => status === 200 ? { data } : { code: 'FIXTURE_ERROR' } })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
function route(account = owner, path = '/quan-ly/lich-hen') {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>
    <AuthContext.Provider value={{ account, token: account ? 'fixture-token' : null, isAuthenticated: Boolean(account), openLoginModal() {}, logout() {} }}>
      <LegacyAppointmentsFixture />
    </AuthContext.Provider>
  </MemoryRouter>)
}
function view(state, detailed = false) {
  return renderToStaticMarkup(<MemoryRouter><OwnerAppointmentsView state={{ items: [], retry() {}, ...state }} detailed={detailed} search="?localDate=2026-10-23" /></MemoryRouter>)
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Owner API read contract', () => {
  it('sends day/staff/status/cursor to the existing list API with limit 50', async () => {
    const fetch = respond(page([id], 'next'))
    await listOwnerAppointments('https://api.example.test', 'owner-token',
      { localDate: '2026-10-23', staffId: 'stylist-a', status: 'confirmed', customerId: 'ignored' }, 'opaque+/=')
    const [url, request] = fetch.mock.calls[0]
    const query = new URL(url).searchParams
    expect(new URL(url).pathname).toBe('/api/appointments')
    expect(Object.fromEntries(query)).toEqual({ localDate: '2026-10-23', limit: '50', staffId: 'stylist-a', status: 'confirmed', cursor: 'opaque+/=' })
    expect(request.headers.get('Authorization')).toBe('Bearer owner-token')
    expect(request.body).toBeUndefined()
  })
  it('omits empty optional filters and first-page cursor', async () => {
    const fetch = respond(page([]))
    await listOwnerAppointments('https://api.example.test', 'token', { localDate: '2026-10-23', staffId: '', status: '' })
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/api/appointments?localDate=2026-10-23&limit=50')
  })
  it('uses the existing detail endpoint and allowlists data', async () => {
    const fetch = respond({ ...item, accountId: 'secret-account', email: 'private@example.test', lastCommand: {} })
    const result = await readOwnerAppointment('https://api.example.test', 'token', id)
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/api/appointments/' + id)
    expect(result.customerSnapshot).toEqual(item.customerSnapshot)
    expect(result).not.toHaveProperty('accountId')
    expect(result).not.toHaveProperty('email')
    expect(result).not.toHaveProperty('lastCommand')
  })
  it('rejects invalid IDs before requesting', async () => {
    const fetch = respond(item)
    await expect(readOwnerAppointment('https://api.example.test', 'token', '../invalid')).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects a mismatched detail or Customer/Stylist DTO', async () => {
    respond({ ...item, id: 'wrong-id' })
    await expect(readOwnerAppointment('https://api.example.test', 'token', id)).rejects.toThrow()
    respond({ ...item, customerId: undefined })
    await expect(readOwnerAppointment('https://api.example.test', 'token', id)).rejects.toThrow()
  })
  it.each([400, 401, 403, 404, 503])('preserves HTTP %s', async status => {
    respond(null, status)
    await expect(listOwnerAppointments('https://api.example.test', 'token', { localDate: '2026-10-23' })).rejects.toMatchObject({ status, code: 'FIXTURE_ERROR' })
  })
})

describe('Owner request lifecycle', () => {
  it('handles loading, empty, error and retry', async () => {
    const pending = deferred()
    const { reader } = setup(vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(page([id])))
    const first = reader.load()
    expect(reader.getSnapshot().kind).toBe('loading')
    pending.resolve(page([])); await first
    expect(reader.getSnapshot()).toMatchObject({ kind: 'success', items: [] })
    const failed = setup(vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([id])))
    await failed.reader.load()
    expect(failed.reader.getSnapshot().kind).toBe('error')
    await failed.reader.retry()
    expect(failed.reader.getSnapshot()).toMatchObject({ kind: 'success', items: [{ id }] })
  })
  it('deduplicates load-more clicks and rows while keeping backend order', async () => {
    const pending = deferred()
    const data = vi.fn().mockResolvedValueOnce(page(['a', 'b'], 'c1')).mockImplementationOnce(() => pending.promise)
    const { reader } = setup(data)
    await reader.load()
    const more = reader.load(true)
    await reader.load(true)
    expect(reader.getSnapshot().kind).toBe('loadingMore')
    pending.resolve(page(['b', 'c'])); await more
    expect(reader.getSnapshot().items.map(x => x.id)).toEqual(['a', 'b', 'c'])
    expect(data).toHaveBeenCalledTimes(2)
    expect(data.mock.calls[1][0]).toBe('c1')
  })
  it('retains loaded rows and retries the same cursor on load-more failure', async () => {
    const data = vi.fn().mockResolvedValueOnce(page(['a'], 'c1')).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page(['b']))
    const { reader } = setup(data)
    await reader.load(); await reader.load(true)
    expect(reader.getSnapshot()).toMatchObject({ kind: 'error', items: [{ id: 'a' }] })
    await reader.retry()
    expect(data.mock.calls.map(x => x[0])).toEqual([null, 'c1', 'c1'])
    expect(reader.getSnapshot().items.map(x => x.id)).toEqual(['a', 'b'])
  })
  it('rejects cursor cycles and resets history when restarting', async () => {
    const data = vi.fn().mockResolvedValueOnce(page(['a'], 'c1')).mockResolvedValueOnce(page(['b'], 'c2'))
      .mockResolvedValueOnce(page(['c'], 'c1')).mockResolvedValueOnce(page(['a'], 'c1'))
    const { reader } = setup(data)
    await reader.load(); await reader.load(true); await reader.load(true)
    expect(reader.getSnapshot()).toMatchObject({ kind: 'error', restartRequired: true })
    await reader.retry()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'success', nextCursor: 'c1' })
    expect(data.mock.calls[3][0]).toBeNull()
  })
  it('does not let an earlier filter/day response replace the newest result', async () => {
    const pending = deferred()
    const data = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(page(['new-day']))
    const { reader } = setup(data)
    const old = reader.load()
    await vi.waitFor(() => expect(data).toHaveBeenCalledOnce())
    await reader.load()
    pending.resolve(page(['old-day'])); await old
    expect(reader.getSnapshot().items.map(x => x.id)).toEqual(['new-day'])
    expect(data.mock.calls[0][1].aborted).toBe(true)
  })
  it('clears private data and ignores an old account response after cancellation', async () => {
    const pending = deferred()
    const old = setup(vi.fn(() => pending.promise))
    const request = old.reader.load()
    await vi.waitFor(() => expect(old.readData).toHaveBeenCalledOnce())
    old.reader.cancel()
    const next = setup(vi.fn().mockResolvedValue(page(['new-owner'])))
    await next.reader.load()
    pending.resolve(page(['old-owner'])); await request
    expect(old.reader.getSnapshot().items).toEqual([])
    expect(next.reader.getSnapshot().items.map(x => x.id)).toEqual(['new-owner'])
  })
  it('does not request private data if cancelled during auth verification', async () => {
    const pending = deferred()
    const { reader, readData } = setup(undefined, () => pending.promise)
    const request = reader.load(); reader.cancel(); pending.resolve(owner); await request
    expect(readData).not.toHaveBeenCalled()
  })
  it.each([
    { roles: ['customer'], status: 'active' }, { roles: ['stylist'], status: 'active' },
    { roles: ['owner'], status: 'disabled' }, { roles: [], status: 'active' }, null,
  ])('denies non-owner identities despite cached UI permissions', async profile => {
    const { reader, readData } = setup(undefined, async () => profile)
    await reader.load()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
    expect(readData).not.toHaveBeenCalled()
  })
  it.each([401, 403])('clears rows after HTTP %s on the next page', async status => {
    const { reader } = setup(vi.fn().mockResolvedValueOnce(page(['private'], 'next'))
      .mockRejectedValueOnce(Object.assign(new Error('denied'), { status })))
    await reader.load(); await reader.load(true)
    expect(reader.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
  })
  it('supports detail success and safe 404 without list pagination', async () => {
    const { reader } = setup(vi.fn().mockResolvedValueOnce(item).mockRejectedValueOnce(Object.assign(new Error('missing'), { status: 404 })), undefined, false)
    await reader.load()
    expect(reader.getSnapshot().value).toEqual(item)
    await reader.load()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'notFound' })
    expect(reader.getSnapshot().value).toBeUndefined()
  })
})

describe('Owner routes and read-only views', () => {
  it('requires sign-in on both list and direct detail URLs', () => {
    for (const path of ['/quan-ly/lich-hen', '/quan-ly/lich-hen/' + id]) {
      const html = route(null, path)
      expect(html).toContain('Đăng nhập để xem lịch')
      expect(html).not.toContain('Bộ lọc lịch hẹn')
    }
  })
  it.each([
    { roles: ['customer'], status: 'active' }, { roles: ['stylist'], status: 'active' },
    { roles: ['owner'], status: 'disabled' },
  ])('does not mount Owner data for unauthorized accounts', account => {
    const html = route(account)
    expect(html).toContain('chỉ dành cho Owner')
    expect(html).not.toContain('Bộ lọc lịch hẹn')
  })
  it('defaults to the salon date and renders all status filters and Owner header links', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-22T19:30:00.000Z')
    const html = route()
    expect(html).toContain('value="2026-10-23"')
    expect(html).toContain('Tất cả stylist')
    for (const status of ['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']) expect(html).toContain('value="' + status + '"')
    expect(html).toContain('Lịch salon')
  })
  it('preserves day/staff/status filters in URL inputs', () => {
    const html = route(owner, '/quan-ly/lich-hen?localDate=2026-10-24&staffId=staff-a&status=completed')
    expect(html).toContain('value="2026-10-24"')
    expect(html).toContain('value="staff-a" selected=""')
    expect(html).toContain('value="completed" selected=""')
  })
  it('renders all required fields and a scoped detail link with the selected day', () => {
    const html = view({ kind: 'success', items: [item] })
    for (const value of ['09:00', 'Khách A', '+84901234567', 'Stylist An', 'Cắt tóc snapshot', 'Gội đầu', '60 phút', 'Đã xác nhận']) expect(html).toContain(value)
    expect(html).toContain('href="/quan-ly/lich-hen/' + id + '?localDate=2026-10-23"')
  })
  it('renders Owner detail with Customer contact and snapshot values, without commands or payments', () => {
    const html = view({ kind: 'success', value: item }, true)
    for (const value of [id, 'Khách A', '150.000', '40 phút', '20 phút']) expect(html).toContain(value)
    for (const value of ['Hủy lịch', 'Đổi lịch', 'Bắt đầu', 'Hoàn tất phục vụ', 'Thanh toán']) expect(html).not.toContain(value)
    expect(route(owner, '/quan-ly/lich-hen/' + id + '?localDate=2026-10-24')).toContain('/quan-ly/lich-hen?localDate=2026-10-24')
  })
  it('shows loading, empty, error/retry and load-more states', () => {
    expect(view({ kind: 'loading' })).toContain('Đang tải lịch hẹn')
    expect(view({ kind: 'success' })).toContain('Không có lịch hẹn phù hợp')
    expect(view({ kind: 'error', error: new Error('offline') })).toContain('Thử lại')
    const html = view({ kind: 'loadingMore', items: [item], hasNextPage: true })
    expect(html).toContain('Đang tải thêm')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('Không có lịch hẹn phù hợp')
  })
})
