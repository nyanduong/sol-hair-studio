import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Outlet } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppRoutes from '../../../routes/AppRoutes.jsx'
import SiteHeader from '../../home/components/SiteHeader.jsx'
import { useAuth } from '../../auth/hooks/useAuth.js'

vi.mock('../../../layouts/MainLayout.jsx', () => ({ default: () => <Outlet /> }))
vi.mock('../pages/CustomerAppointmentsPage.jsx', () => ({ default: () => <p>Customer appointment list</p> }))
vi.mock('../pages/CustomerAppointmentDetailPage.jsx', () => ({ default: () => <p>Customer appointment detail</p> }))
vi.mock('../pages/StylistAppointmentsPage.jsx', () => ({ default: () => <p>Stylist appointments</p> }))
vi.mock('../../auth/hooks/useAuth.js', () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true, token: null,
    account: { accountId: 'owner', status: 'active', roles: ['owner'] },
    openLoginModal() {}, logout() {},
  })),
}))
vi.mock('../../auth/components/UserNav.jsx', () => ({ default: () => <span>Owner</span> }))

afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: true, token: null,
    account: { accountId: 'owner', status: 'active', roles: ['owner'] },
    openLoginModal() {}, logout() {},
  })
})

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

  it('points both Owner menu links at Admin EJS rather than a React page', () => {
    const html = renderToStaticMarkup(<MemoryRouter><SiteHeader /></MemoryRouter>)
    expect(html).not.toContain('/quan-ly/lich-hen')
    expect(html).toContain('/admin/services')
    expect(html.match(/href="http:\/\/localhost:4000\/admin\/appointments"/g)).toHaveLength(2)
  })

  it('uses the same existing token handoff as the service management link', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true, token: 'fixture.token.value',
      account: { accountId: 'owner', status: 'active', roles: ['owner'] },
      openLoginModal() {}, logout() {},
    })
    const html = renderToStaticMarkup(<MemoryRouter><SiteHeader /></MemoryRouter>)
    expect(html).toContain('/admin/appointments?token=fixture.token.value')
    expect(html).toContain('/admin/services?token=fixture.token.value')
    expect(html).not.toContain('/quan-ly/lich-hen')
  })

  it.each(['customer', 'stylist'])('keeps %s navigation separate from Admin', role => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true, token: 'fixture.token.value',
      account: { accountId: role, status: 'active', roles: [role] },
      openLoginModal() {}, logout() {},
    })
    const html = renderToStaticMarkup(<MemoryRouter><SiteHeader /></MemoryRouter>)
    expect(html).not.toContain('/admin/appointments')
    expect(html).toContain(role === 'customer' ? '/lich-cua-toi' : '/nhan-vien/lich-hen')
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
