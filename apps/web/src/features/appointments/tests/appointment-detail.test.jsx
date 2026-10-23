import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/context/auth-context.js'
import AppRoutes from '../../../routes/AppRoutes.jsx'
import CustomerAppointmentDetail from '../components/CustomerAppointmentDetail.jsx'
import CustomerAppointmentList from '../components/CustomerAppointmentList.jsx'
import { readCustomerAppointment } from '../api/appointments.api.js'
import { createCustomerAppointmentDetail } from '../hooks/useCustomerAppointmentDetail.js'

const id = '1234567890abcdef12345678'
const appointment = {
  id, status: 'confirmed', staffNameSnapshot: 'Stylist An',
  startAt: '2026-10-24T07:00:00.000Z', endAt: '2026-10-24T08:00:00.000Z',
  items: [
    { serviceId: 'cut', name: 'Cắt tóc lúc đặt', priceVnd: 100000, durationMinutes: 40 },
    { serviceId: 'wash', name: 'Gội đầu', priceVnd: 0, durationMinutes: 20 },
  ], totalPriceVnd: 100000, totalDurationMinutes: 60, revision: 3, confirmedAt: '2026-10-22T00:00:00.000Z',
}
const customer = { accountId: 'customer-a', roles: ['customer'], status: 'active' }
function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
function setup(readDetail = vi.fn().mockResolvedValue(appointment), readProfile = vi.fn().mockResolvedValue(customer)) {
  return { detail: createCustomerAppointmentDetail({ readDetail, readProfile }), readDetail, readProfile }
}
function renderState(state) {
  return renderToStaticMarkup(<CustomerAppointmentDetail state={{ retry() {}, ...state }} onLogin={() => {}} />)
}
function renderRoute(account = customer, token = account ? 'fixture-token' : null) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/lich-cua-toi/' + id]}>
      <AuthContext.Provider value={{ account, token, isAuthenticated: Boolean(account && token), openLoginModal() {}, logout() {} }}>
        <AppRoutes />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
afterEach(() => vi.unstubAllGlobals())

describe('detail HTTP contract', () => {
  it('uses the existing endpoint, Bearer session and abort signal', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: appointment }) })
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    await expect(readCustomerAppointment('https://api.example.test/', 'token-a', id, controller.signal)).resolves.toEqual(appointment)
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/appointments/' + id)
    expect(options.headers.get('Authorization')).toBe('Bearer token-a')
    expect(options.signal.aborted).toBe(false)
    expect(options.body).toBeUndefined()
  })
  it('forwards cancellation while the HTTP request is pending', async () => {
    const fetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    const pending = readCustomerAppointment('https://api.example.test', 'token', id, controller.signal)
    controller.abort()
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('rejects an invalid ID without sending a request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(readCustomerAppointment('https://api.example.test', 'token', '../other')).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([400, 401, 403, 404, 503])('preserves HTTP %s without inventing accessible data', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ code: 'APPOINTMENT_NOT_FOUND', message: 'fixture' }) }))
    await expect(readCustomerAppointment('https://api.example.test', 'token', id)).rejects.toMatchObject({ status, code: 'APPOINTMENT_NOT_FOUND' })
  })
  it.each([
    null, { ...appointment, id: 'other' }, { ...appointment, customerId: 'private' },
    { ...appointment, customerSnapshot: {} }, { ...appointment, startAt: 'invalid' },
    { ...appointment, items: [] }, { ...appointment, totalPriceVnd: -1 },
  ])('rejects malformed or privileged detail payloads', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: value }) }))
    await expect(readCustomerAppointment('https://api.example.test', 'token', id)).rejects.toThrow('Không đọc được')
  })
})

describe('detail request/session lifecycle', () => {
  it('shows loading, verifies current role then loads the detail', async () => {
    const pending = deferred()
    const { detail, readProfile } = setup(() => pending.promise)
    const notify = vi.fn()
    const unsubscribe = detail.subscribe(notify)
    const job = detail.load()
    expect(detail.getSnapshot()).toEqual({ kind: 'loading' })
    pending.resolve(appointment)
    await job
    expect(readProfile).toHaveBeenCalledOnce()
    expect(detail.getSnapshot()).toEqual({ kind: 'success', value: appointment })
    expect(notify).toHaveBeenCalled()
    unsubscribe()
  })
  it.each([[400, 'invalid'], [401, 'denied'], [403, 'denied'], [404, 'notFound'], [503, 'error']])('maps HTTP %s to %s', async (status, kind) => {
    const { detail } = setup(async () => { throw Object.assign(new Error('fixture'), { status }) })
    await detail.load()
    expect(detail.getSnapshot().kind).toBe(kind)
    expect(detail.getSnapshot().value).toBeUndefined()
  })
  it('retries a failed request and drops previous data when reloading', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(appointment)
      .mockRejectedValueOnce(Object.assign(new Error('revoked'), { status: 401 }))
    const { detail } = setup(read)
    await detail.load()
    expect(detail.getSnapshot().kind).toBe('error')
    await detail.load()
    expect(detail.getSnapshot().value).toEqual(appointment)
    await detail.load()
    expect(detail.getSnapshot()).toMatchObject({ kind: 'denied' })
    expect(detail.getSnapshot().value).toBeUndefined()
  })
  it.each([
    { roles: ['owner'], status: 'active' }, { roles: ['stylist'], status: 'active' },
    { roles: ['customer', 'owner'], status: 'active' }, { roles: ['customer'], status: 'disabled' }, null,
  ])('blocks incorrect roles even if the Auth cache previously showed Customer', async account => {
    const { detail, readDetail } = setup(undefined, async () => account)
    await detail.load()
    expect(detail.getSnapshot().kind).toBe('denied')
    expect(readDetail).not.toHaveBeenCalled()
  })
  it('ignores an older response after a newer load', async () => {
    const pending = deferred()
    const read = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValueOnce({ ...appointment, revision: 4 })
    const { detail } = setup(read)
    const old = detail.load()
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
    await detail.load()
    pending.resolve(appointment)
    await old
    expect(detail.getSnapshot().value.revision).toBe(4)
  })
  it('aborts on unmount and isolates account/appointment changes', async () => {
    const pending = deferred()
    const a = setup(vi.fn(() => pending.promise))
    const job = a.detail.load()
    await vi.waitFor(() => expect(a.readDetail).toHaveBeenCalledOnce())
    a.detail.cancel()
    expect(a.readDetail.mock.calls[0][0].aborted).toBe(true)
    const b = setup(async () => ({ ...appointment, id: 'abcdefabcdefabcdefabcdef' }))
    await b.detail.load()
    pending.resolve(appointment)
    await job
    expect(a.detail.getSnapshot().value).toBeUndefined()
    expect(b.detail.getSnapshot().value.id).toBe('abcdefabcdefabcdefabcdef')
  })
  it('does not request detail after cancellation during profile verification', async () => {
    const pending = deferred()
    const { detail, readDetail } = setup(undefined, () => pending.promise)
    const job = detail.load()
    detail.cancel()
    pending.resolve(customer)
    await job
    expect(readDetail).not.toHaveBeenCalled()
  })
})

describe('detail route and UI', () => {
  it('supports direct URLs and requires login without exposing a detail', () => {
    const html = renderRoute(null)
    expect(html).toContain('Chi tiết lịch hẹn')
    expect(html).toContain('Đăng nhập để xem lịch')
    expect(html).toContain('href="/lich-cua-toi"')
    expect(html).not.toContain('Thông tin lịch hẹn')
  })
  it('starts a Customer in loading and blocks other roles', () => {
    expect(renderRoute()).toContain('Đang tải chi tiết lịch hẹn')
    expect(renderRoute({ roles: ['owner'], status: 'active' })).toContain('chỉ dành cho tài khoản khách hàng')
    expect(renderRoute({ roles: ['stylist'], status: 'active' })).not.toContain('Đang tải chi tiết lịch hẹn')
  })
  it('renders all real snapshot fields, Vietnam time and zero prices', () => {
    const html = renderState({ kind: 'success', value: appointment })
    for (const value of [id, 'Đã xác nhận', '24/10/2026', '14:00', '15:00', 'Stylist An', 'Cắt tóc lúc đặt', 'Gội đầu', '40 phút', '20 phút', '60 phút', '100.000', '0', 'Tổng giá dự kiến']) {
      expect(html).toContain(value)
    }
    expect(html).not.toContain('Thanh toán')
    expect(html).not.toContain('Hủy lịch')
    expect(html).not.toContain('Đổi lịch')
    expect(html).not.toContain('Master Stylist')
  })
  it.each(['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'])('renders %s without a payment inference', status => {
    const html = renderState({ kind: 'success', value: { ...appointment, status } })
    expect(html).toContain('Thông tin lịch hẹn')
    expect(html).not.toContain('Thanh toán')
  })
  it('renders safe not-found/forbidden/invalid/error states and retry', () => {
    expect(renderState({ kind: 'notFound' })).toContain('Không tìm thấy lịch hẹn hoặc bạn không có quyền')
    expect(renderState({ kind: 'invalid' })).toContain('Đường dẫn lịch hẹn không hợp lệ')
    expect(renderState({ kind: 'denied', error: { status: 403 } })).toContain('không có quyền')
    expect(renderState({ kind: 'denied', error: { status: 401 } })).toContain('Đăng nhập lại')
    expect(renderState({ kind: 'error' })).toContain('Thử lại')
    expect(renderState({ kind: 'error' })).not.toContain('Stylist An')
  })
  it('connects the list detail action to the new route and leaves reschedule unchanged', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><CustomerAppointmentList state={{ kind: 'success', items: [appointment], hasNextPage: false }} onLogin={() => {}} /></MemoryRouter>,
    )
    expect(html).toContain('href="/lich-cua-toi/' + id + '"')
    expect(html).not.toContain('/booking?ref=')
    expect(html).toContain('Chi tiết')
  })
})
