import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '../../auth/context/auth-context.js'
import BookingPage from '../pages/BookingPage.jsx'

function render(account) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AuthContext.Provider
        value={{
          token: account ? 'synthetic-token' : null,
          account,
          isAuthenticated: Boolean(account),
          openLoginModal() {},
        }}
      >
        <BookingPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}
describe('booking access gate', () => {
  it('requires sign-in before exposing a booking form', () => {
    const html = render(null)
    expect(html).toContain('Đăng nhập để đặt lịch')
    expect(html).not.toContain('Xác nhận đặt lịch')
  })
  it('does not expose owner booking to a stylist-only account', () => {
    expect(render({ roles: ['stylist'], email: 'synthetic@example.test' })).toContain(
      'không có quyền đặt lịch',
    )
  })
})
