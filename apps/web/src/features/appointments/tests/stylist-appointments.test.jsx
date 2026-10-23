import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/context/auth-context.js'
import AppRoutes from '../../../routes/AppRoutes.jsx'
import OwnerAppointmentsView from '../components/OwnerAppointmentsView.jsx'
import { OwnerServiceDialog } from '../components/OwnerAppointmentService.jsx'
import { isStylistAccount, createStylistAppointmentReader, useStylistAppointments } from '../hooks/useStylistAppointments.js'
import { createOwnerAppointmentCommand, ownerServicePayload } from '../hooks/useOwnerAppointmentCommand.js'
import { listStylistAppointments, readStylistAppointment, sendStylistServiceCommand } from '../api/stylist-appointments.api.js'

vi.mock('../hooks/useStylistAppointments.js', async original => ({ ...await original(), useStylistAppointments: vi.fn() }))
const stylist = { accountId: 'stylist-a', roles: ['stylist'], status: 'active' }
const item = {
  id: '1234567890abcdef12345678', revision: 3, staffId: 'aaaaaaaaaaaaaaaaaaaaaaaa', staffNameSnapshot: 'Stylist An',
  customerSnapshot: { displayName: 'Khách A', phone: '+84901234567' }, status: 'confirmed',
  startAt: '2026-10-23T03:00:00.000Z', endAt: '2026-10-23T04:00:00.000Z',
  totalDurationMinutes: 60, totalPriceVnd: 150000,
  items: [{ serviceId: 'cut', name: 'Cắt tóc snapshot', durationMinutes: 40, priceVnd: 100000 },
    { serviceId: 'wash', name: 'Gội đầu', durationMinutes: 20, priceVnd: 50000 }],
}
const startedAt = '2026-10-23T02:55:00.000Z'
const completedAt = '2026-10-23T03:40:00.000Z'
const result = operation => ({ ...item, revision: 4, status: operation === 'start' ? 'in_progress' : 'completed',
  startedAt, ...(operation === 'complete' ? { completedAt } : {}) })
const page = (items = [item], nextCursor = null) => ({ items, pagination: { hasNextPage: Boolean(nextCursor), nextCursor } })
function response(data, status = 200) { return { ok: status === 200, status, json: async () => status === 200 ? { data } : data } }
function respond(data, status = 200) { const fetch = vi.fn().mockResolvedValue(response(data, status)); vi.stubGlobal('fetch', fetch); return fetch }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function route(url = '/nhan-vien/lich-hen', account = stylist) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><AuthContext.Provider value={{
    account, token: account ? 'fixture-token' : null, isAuthenticated: Boolean(account), openLoginModal() {}, logout() {},
  }}><AppRoutes /></AuthContext.Provider></MemoryRouter>)
}
const callbacks = { retry() {}, loadMore() {} }
let viewState
beforeEach(() => {
  viewState = null
  vi.mocked(useStylistAppointments).mockImplementation((_token, id) => viewState ?? { kind: 'success', ...(id ? { value: item } : { items: [item], hasNextPage: false }), ...callbacks })
})
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Stylist API contracts and contact allowlist', () => {
  it('sends only supported day/cursor/limit fields and Bearer authorization', async () => {
    const fetch = respond(page())
    await listStylistAppointments('https://api.example.test', 'token', '2026-10-23', 'opaque+/=')
    const [url, request] = fetch.mock.calls[0]
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ localDate: '2026-10-23', limit: '50', cursor: 'opaque+/=' })
    expect(request.headers.get('Authorization')).toBe('Bearer token')
    expect(request.body).toBeUndefined()
  })
  it('reads scoped detail and preserves server actual timestamps after a reload', async () => {
    const fetch = respond({ ...result('complete'), email: 'private', accountId: 'private', lastCommand: { key: 'private' } })
    const data = await readStylistAppointment('https://api.example.test', 'token', item.id)
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/api/appointments/' + item.id)
    expect(data).toMatchObject({ startedAt, completedAt, customerSnapshot: item.customerSnapshot })
    for (const field of ['customerId', 'accountId', 'email', 'lastCommand']) expect(data).not.toHaveProperty(field)
  })
  it.each([{ ...item, customerId: 'owner-only' }, { ...item, customerSnapshot: undefined }, { ...item, status: 'cancelled' }, { ...item, status: 'no_show' }])(
    'fails closed on privileged or unsupported DTOs', async value => {
      respond(value)
      await expect(readStylistAppointment('https://api.example.test', 'token', item.id)).rejects.toThrow()
    })
  it.each([401, 403, 404, 409, 503])('preserves HTTP %s from scoped requests including IDOR denial', async status => {
    respond({ code: 'APPOINTMENT_NOT_FOUND' }, status)
    await expect(readStylistAppointment('https://api.example.test', 'token', item.id)).rejects.toMatchObject({ status, code: 'APPOINTMENT_NOT_FOUND' })
  })
  it('does not send invalid IDs', async () => {
    const fetch = respond(item)
    await expect(readStylistAppointment('https://api.example.test', 'token', '../other')).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('Stylist identity, pagination and request lifecycle', () => {
  it('uses Stylist priority over Customer while reserving Owner sessions for Owner pages', () => {
    expect(isStylistAccount(stylist)).toBe(true)
    expect(isStylistAccount({ ...stylist, roles: ['customer', 'stylist'] })).toBe(true)
    expect(isStylistAccount({ ...stylist, roles: ['owner', 'stylist'] })).toBe(false)
  })
  it.each([null, { roles: ['customer'], status: 'active' }, { roles: ['owner'], status: 'active' }, { roles: ['stylist'], status: 'disabled' }])(
    'rechecks current role and blocks reads despite stale cached permissions', async profile => {
      const read = vi.fn()
      const reader = createStylistAppointmentReader({ readProfile: async () => profile, readData: read, paginated: true })
      await reader.load()
      expect(reader.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
      expect(read).not.toHaveBeenCalled()
    })
  it('handles loading, no assigned appointments, error and retry', async () => {
    const pending = deferred()
    const read = vi.fn().mockImplementationOnce(() => pending.promise).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([]))
    const reader = createStylistAppointmentReader({ readProfile: async () => stylist, readData: read, paginated: true })
    const first = reader.load()
    expect(reader.getSnapshot().kind).toBe('loading')
    pending.resolve(page([])); await first
    expect(reader.getSnapshot()).toMatchObject({ kind: 'success', items: [] })
    await reader.load(); expect(reader.getSnapshot().kind).toBe('error')
    await reader.retry(); expect(reader.getSnapshot().kind).toBe('success')
  })
  it('deduplicates load-more and rows, preserves cursor and rejects a duplicate cursor', async () => {
    const read = vi.fn().mockResolvedValueOnce(page([item], 'c1'))
      .mockResolvedValueOnce(page([item, { ...item, id: 'next' }], 'c2'))
      .mockResolvedValueOnce(page([], 'c2'))
    const reader = createStylistAppointmentReader({ readProfile: async () => stylist, readData: read, paginated: true })
    await reader.load()
    const more = reader.load(true); await reader.load(true); await more
    expect(read.mock.calls.map(([cursor]) => cursor)).toEqual([null, 'c1'])
    expect(reader.getSnapshot().items).toHaveLength(2)
    await reader.load(true)
    expect(reader.getSnapshot()).toMatchObject({ kind: 'error', restartRequired: true })
  })
  it('discards responses from a previous day/account and clears data on revocation', async () => {
    const pending = deferred(), read = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(page([]))
      .mockRejectedValueOnce(Object.assign(new Error('revoked'), { status: 401 }))
    const reader = createStylistAppointmentReader({ readProfile: async () => stylist, readData: read, paginated: true })
    const old = reader.load()
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
    await reader.load(); pending.resolve(page()); await old
    expect(reader.getSnapshot().items).toEqual([])
    await reader.load(); expect(reader.getSnapshot()).toMatchObject({ kind: 'denied', items: [] })
    reader.cancel(); expect(reader.getSnapshot().items).toEqual([])
  })
})

describe('Stylist service commands reuse the SOL-036 lifecycle', () => {
  function command(operation, profile = stylist) {
    return createOwnerAppointmentCommand({ authorize: isStylistAccount, readProfile: async () => profile,
      verify: (_profile, signal) => readStylistAppointment('https://api.example.test', 'token', item.id, signal),
      send: (body, key, signal) => sendStylistServiceCommand('https://api.example.test', 'token', item.id, operation, body, key, signal),
    }, () => 'stylist-service-key')
  }
  it.each(['start', 'complete'])('%s verifies scoped detail, deduplicates requests and sends revision only', async operation => {
    const value = result(operation)
    const fetch = vi.fn(async (_url, request) => response(request.method === 'POST' ? value : { ...item, status: operation === 'start' ? 'confirmed' : 'in_progress' }))
    vi.stubGlobal('fetch', fetch)
    const manager = command(operation)
    const body = ownerServicePayload({ ...item, status: operation === 'start' ? 'confirmed' : 'in_progress' }, operation, true)
    const first = manager.run(body)
    expect(manager.run(body)).toBe(first)
    await expect(first).resolves.toMatchObject(value)
    expect(fetch).toHaveBeenCalledTimes(2)
    const [url, request] = fetch.mock.calls[1]
    expect(url).toContain('/' + operation)
    expect(JSON.parse(request.body)).toEqual({ expectedRevision: 3 })
    expect(request.headers.get('Idempotency-Key')).toBe('stylist-service-key')
  })
  it('blocks a different Stylist appointment before POST and rejects Owner/Customer current identities', async () => {
    const fetch = respond({ code: 'APPOINTMENT_NOT_FOUND' }, 404)
    await expect(command('start').run({ expectedRevision: 3 })).rejects.toMatchObject({ status: 404 })
    expect(fetch.mock.calls.every(([, request]) => request.method !== 'POST')).toBe(true)
    for (const roles of [['owner'], ['customer']]) {
      fetch.mockClear()
      await expect(command('start', { ...stylist, roles }).run({ expectedRevision: 3 })).rejects.toMatchObject({ status: 403 })
      expect(fetch).not.toHaveBeenCalled()
    }
  })
  it.each(['START_APPOINTMENT_CONFLICT', 'START_OUTSIDE_SHIFT', 'APPOINTMENT_REVISION_CONFLICT', 'APPOINTMENT_STATE_CONFLICT'])(
    'preserves backend rejection %s and never claims success', async code => {
      const fetch = vi.fn(async (_url, request) => request.method === 'POST' ? response({ code }, 409) : response(item))
      vi.stubGlobal('fetch', fetch)
      const manager = command('start')
      await expect(manager.run({ expectedRevision: 3 })).rejects.toMatchObject({ status: 409, code, uncertain: false })
      expect(manager.getPending()).toBeUndefined()
    })
  it.each(['start', 'complete'])('%s retains original key/body after uncertain network failure and rechecks authorization', async operation => {
    let posts = 0
    const fetch = vi.fn(async (_url, request) => {
      if (request.method !== 'POST') return response(item)
      if (++posts === 1) throw new TypeError('offline')
      return response(result(operation))
    })
    vi.stubGlobal('fetch', fetch)
    const manager = command(operation)
    await expect(manager.run({ expectedRevision: 3 })).rejects.toMatchObject({ uncertain: true })
    await expect(manager.run({ expectedRevision: 4 })).rejects.toThrow()
    await manager.run({ expectedRevision: 3 })
    const requests = fetch.mock.calls.filter(([, request]) => request.method === 'POST')
    expect(requests[0][1].body).toBe(requests[1][1].body)
    expect(requests[0][1].headers.get('Idempotency-Key')).toBe(requests[1][1].headers.get('Idempotency-Key'))
  })
  it('rejects management operations and extra payload fields before a request', async () => {
    const fetch = respond(item)
    for (const operation of ['cancel', 'no-show', 'reschedule', 'eta']) {
      await expect(sendStylistServiceCommand('https://api.example.test', 'token', item.id, operation, { expectedRevision: 3 }, 'key')).rejects.toThrow()
    }
    await expect(sendStylistServiceCommand('https://api.example.test', 'token', item.id, 'start', { expectedRevision: 3, checkIn: true }, 'key')).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('retains malformed success as an unknown outcome', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, request) => response(request.method === 'POST' ? { ...result('start'), startedAt: undefined } : item)))
    const manager = command('start')
    await expect(manager.run({ expectedRevision: 3 })).rejects.toMatchObject({ uncertain: true })
    expect(manager.getPending()).toBeDefined()
  })
  it('reloads detail after completion and ignores the previous confirmed read', async () => {
    const old = deferred(), read = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValueOnce(result('complete'))
    const reader = createStylistAppointmentReader({ readProfile: async () => stylist, readData: read })
    const job = reader.load()
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
    await reader.load(); old.resolve(item); await job
    expect(reader.getSnapshot().value).toMatchObject({ status: 'completed', startedAt, completedAt, revision: 4 })
  })
})

describe('Stylist routes, navigation and reused UI', () => {
  it('defaults to salon today, shows assigned cards and no unsupported filters or Owner links', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-22T19:00:00.000Z')
    const html = route()
    expect(html).toContain('value="2026-10-23"')
    expect(html).toContain('/nhan-vien/lich-hen/' + item.id)
    for (const text of ['Khách A', 'Stylist An', 'Cắt tóc snapshot', 'Gội đầu', '60 phút']) expect(html).toContain(text)
    expect(html).not.toContain('Lịch toàn salon')
    expect(html).not.toContain('Lịch salon')
    expect(html).not.toContain('Tất cả trạng thái')
    expect(html).not.toContain('Tất cả stylist')
  })
  it('supports direct detail, contact and date-preserving back navigation', () => {
    const html = route('/nhan-vien/lich-hen/' + item.id + '?localDate=2026-10-24')
    for (const text of ['Chi tiết lịch được giao', '+84901234567', 'Bắt đầu phục vụ', '/nhan-vien/lich-hen?localDate=2026-10-24']) expect(html).toContain(text)
    for (const text of ['>Hủy lịch', '>Đổi lịch', '>Đánh dấu không đến', 'Thanh toán']) expect(html).not.toContain(text)
  })
  it.each(['confirmed', 'in_progress', 'completed'])('only exposes proper service action for %s', status => {
    viewState = { kind: 'success', value: { ...item, status, ...(status === 'completed' ? { startedAt, completedAt } : {}) }, ...callbacks }
    const html = route('/nhan-vien/lich-hen/' + item.id)
    expect(html.includes('>Bắt đầu phục vụ</button>')).toBe(status === 'confirmed')
    expect(html.includes('>Hoàn tất phục vụ</button>')).toBe(status === 'in_progress')
    expect(html).not.toContain('>Đổi lịch</button>')
  })
  it('gates logged-out, inactive, Customer and Owner sessions', () => {
    expect(route('/nhan-vien/lich-hen', null)).toContain('Đăng nhập để xem lịch')
    for (const account of [{ ...stylist, roles: ['owner'] }, { ...stylist, roles: ['customer'] }, { ...stylist, status: 'disabled' }]) {
      expect(route('/nhan-vien/lich-hen', account)).toContain('chỉ dành cho Stylist')
    }
  })
  it('keeps detail loading/not-found/denied/error states free of private data', () => {
    for (const [kind, text] of [['loading', 'Đang tải lịch hẹn'], ['notFound', 'Không tìm thấy lịch'], ['denied', 'không có quyền'], ['error', 'Thử lại']]) {
      viewState = { kind, error: { status: kind === 'denied' ? 403 : 503 }, ...callbacks }
      const html = route('/nhan-vien/lich-hen/' + item.id)
      expect(html).toContain(text)
      expect(html).not.toContain('Khách A')
    }
  })
  it('uses shared empty/loading-more/error UI and service-confirmation dialog', () => {
    const render = state => renderToStaticMarkup(<MemoryRouter><OwnerAppointmentsView audience="stylist" basePath="/nhan-vien/lich-hen" state={{ items: [], ...callbacks, ...state }} /></MemoryRouter>)
    expect(render({ kind: 'success' })).toContain('Không có lịch hẹn phù hợp')
    expect(render({ kind: 'loadingMore', hasNextPage: true })).toContain('Đang tải thêm')
    expect(render({ kind: 'error' })).toContain('Thử lại')
    const html = renderToStaticMarkup(<OwnerServiceDialog appointment={item} operation="start" command={{ kind: 'idle' }}
      confirmed={false} onConfirmed={() => {}} onConfirm={() => {}} onClose={() => {}} />)
    expect(html).toContain('khách đã đến')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Xác nhận bắt đầu<\/button>/)
  })
})
