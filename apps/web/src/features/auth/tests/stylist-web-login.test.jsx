// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getAuthErrorMessage, getMe, loginUser, logoutUser } from '../api/auth.api.js'

vi.mock('../api/auth.api.js', async original => ({
  ...await original(), getMe: vi.fn(), loginUser: vi.fn(), logoutUser: vi.fn(),
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const notice = 'Vui lòng sử dụng ứng dụng Sol Hair Studio dành cho stylist'
let root, auth
function Probe() {
  const value = useAuth()
  useEffect(() => { auth = value }, [value])
  return <p>{value.isAuthenticated ? 'Signed in' : 'Signed out'}</p>
}
async function mount() {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>))
}
afterEach(async () => {
  if (root) await act(async () => root.unmount())
  root = null
  localStorage.clear()
  document.body.innerHTML = ''
  vi.resetAllMocks()
})

describe('stylist access on web', () => {
  it('keeps the login open, returns the exact notice and never persists a stylist-only token', async () => {
    vi.mocked(loginUser).mockResolvedValue({ token: 'stylist.token.fixture', account: { roles: ['stylist'] } })
    await mount()
    await act(async () => auth.openLoginModal())
    let error
    await act(async () => {
      try { await auth.login({ email: 'stylist@example.test', password: 'fixture-password' }) }
      catch (failure) { error = failure }
    })
    expect(getAuthErrorMessage(error)).toBe(notice)
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isModalOpen).toBe(true)
    expect(localStorage.getItem('sol_auth_token')).toBeNull()
    expect(localStorage.getItem('sol_auth_account')).toBeNull()
    expect(getMe).not.toHaveBeenCalled()
    expect(logoutUser).not.toHaveBeenCalled()
  })

  it.each([['customer'], ['owner'], ['stylist', 'customer'], ['stylist', 'owner']])(
    'preserves login for roles %j', async (...roles) => {
      const account = { accountId: 'fixture', roles }
      vi.mocked(loginUser).mockResolvedValue({ token: 'allowed.token.fixture', account })
      vi.mocked(getMe).mockResolvedValue(account)
      await mount()
      await act(async () => { await auth.login({ email: 'allowed@example.test', password: 'fixture-password' }) })
      expect(auth.isAuthenticated).toBe(true)
      expect(localStorage.getItem('sol_auth_token')).toBe('allowed.token.fixture')
      expect(logoutUser).not.toHaveBeenCalled()
    },
  )

  it('clears a legacy stylist web session and opens the common login with the notice', async () => {
    localStorage.setItem('sol_auth_token', 'legacy.stylist.token')
    localStorage.setItem('sol_auth_account', JSON.stringify({ roles: ['stylist'] }))
    vi.mocked(getMe).mockResolvedValue({ accountId: 'fixture', roles: ['stylist'] })
    await mount()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.promptNotice).toBe(notice)
    expect(auth.isModalOpen).toBe(true)
    expect(localStorage.getItem('sol_auth_token')).toBeNull()
    expect(logoutUser).not.toHaveBeenCalled()
  })
})
