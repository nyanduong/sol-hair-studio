import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/context/auth-context.js'
import CustomerAppointmentsPage from '../pages/CustomerAppointmentsPage.jsx'
import CustomerAppointmentList from '../components/CustomerAppointmentList.jsx'
import AppRoutes from '../../../routes/AppRoutes.jsx'

function render(account, token = account ? 'token' : null, routes = false) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/lich-cua-toi']}>
      <AuthContext.Provider value={{ account, token, isAuthenticated: Boolean(account && token), openLoginModal() {}, logout() {} }}>
        {routes ? <AppRoutes /> : <CustomerAppointmentsPage />}
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
const customer = { id: 'customer', status: 'active', roles: ['customer'] }
const item = {
  id: '1', items: [{ name: 'Cắt tóc lúc đặt' }], staffNameSnapshot: 'Stylist An',
  startAt: '2026-10-24T07:00:00.000Z', endAt: '2026-10-24T08:00:00.000Z', status: 'confirmed',
}
function list(state) {
  return renderToStaticMarkup(<MemoryRouter><CustomerAppointmentList state={{ items: [], retry: vi.fn(), loadMore: vi.fn(), ...state }} onLogin={() => {}} /></MemoryRouter>)
}
describe('customer appointments Web', () => {
  it('registers the route and requires login', () => {
    const html = render(null, null, true)
    expect(html).toContain('Lịch hẹn của tôi')
    expect(html).toContain('Đăng nhập để xem lịch')
    expect(html).not.toContain('Danh sách lịch hẹn')
  })
  it.each([
    { status: 'active', roles: ['owner'] },
    { status: 'active', roles: ['stylist'] },
    { status: 'active', roles: ['customer', 'owner'] },
    { status: 'disabled', roles: ['customer'] },
  ])('does not mount private content for a non-customer session', account => {
    const html = render(account)
    expect(html).toContain('chỉ dành cho tài khoản khách hàng')
    expect(html).not.toContain('Danh sách lịch hẹn')
  })
  it('starts a Customer in loading state without preloaded private data', () => {
    expect(render(customer)).toContain('Đang tải lịch hẹn')
  })
  it('removes the private view when the session becomes anonymous', () => {
    expect(render(customer)).toContain('Danh sách lịch hẹn')
    expect(render(null)).not.toContain('Danh sách lịch hẹn')
  })
  it('renders loading, empty, error/retry and load-more progress', () => {
    expect(list({ kind: 'loading' })).toContain('aria-busy="true"')
    expect(list({ kind: 'success' })).toContain('Bạn chưa có lịch hẹn')
    expect(list({ kind: 'error', error: new Error('offline') })).toContain('Thử lại')
    const html = list({ kind: 'loadingMore', hasNextPage: true, items: [item] })
    expect(html).toContain('Đang tải thêm')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Stylist An')
  })
  it('uses snapshot data and Vietnam time and renders card actions', () => {
    const html = list({ kind: 'success', items: [item] })
    expect(html).toContain('Cắt tóc lúc đặt')
    expect(html).toContain('Stylist An')
    expect(html).toContain('14:00')
    expect(html).toContain('Đã xác nhận')
    expect(html).not.toContain('Upcoming')
    expect(html).toContain('Chi tiết')
    expect(html).not.toContain('Hủy lịch')
  })
  it('offers reauthentication on expiry instead of showing old rows', () => {
    const html = list({ kind: 'denied', items: [item], error: { status: 401 } })
    expect(html).toContain('Đăng nhập lại')
    expect(html).not.toContain('Stylist An')
  })
})
