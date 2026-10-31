import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Outlet } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppRoutes from '../../../routes/AppRoutes.jsx'
import SiteHeader from '../../home/components/SiteHeader.jsx'

vi.mock('../../../layouts/MainLayout.jsx', () => ({ default: () => <Outlet /> }))
vi.mock('../pages/CustomerAppointmentsPage.jsx', () => ({ default: () => <p>Customer appointment list</p> }))
vi.mock('../pages/CustomerAppointmentDetailPage.jsx', () => ({ default: () => <p>Customer appointment detail</p> }))
vi.mock('../pages/StylistAppointmentsPage.jsx', () => ({ default: () => <p>Stylist appointments</p> }))
vi.mock('../../auth/hooks/useAuth.js', () => ({
  useAuth: () => ({
    isAuthenticated: true, token: null,
    account: { accountId: 'owner', status: 'active', roles: ['owner'] },
    openLoginModal() {}, logout() {},
  }),
}))
vi.mock('../../auth/components/UserNav.jsx', () => ({ default: () => <span>Owner</span> }))

afterEach(() => vi.restoreAllMocks())

function renderRoute(path) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>)
}

describe('Owner appointment UI has moved to Admin EJS', () => {
  it.each(['/quan-ly/lich-hen', '/quan-ly/lich-hen/000000000000000000000123'])(
    'does not mount a React Owner workspace at %s', path => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(renderRoute(path)).toBe('')
      expect(warning).toHaveBeenCalled()
    },
  )

  it('removes Owner appointment links from desktop and mobile navigation', () => {
    const html = renderToStaticMarkup(<MemoryRouter><SiteHeader /></MemoryRouter>)
    expect(html).not.toContain('/quan-ly/lich-hen')
    expect(html).toContain('/admin/services')
  })

  it.each([
    ['/lich-cua-toi', 'Customer appointment list'],
    ['/lich-cua-toi/000000000000000000000123', 'Customer appointment detail'],
    ['/nhan-vien/lich-hen', 'Stylist appointments'],
    ['/nhan-vien/lich-hen/000000000000000000000123', 'Stylist appointments'],
  ])('preserves the existing route %s', (path, content) => {
    expect(renderRoute(path)).toContain(content)
  })
})
