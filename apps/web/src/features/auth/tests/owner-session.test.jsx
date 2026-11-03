// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthContext.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { getMe } from '../api/auth.api.js'
import OwnerRedirect from '../components/OwnerRedirect.jsx'

vi.mock('../api/auth.api.js', () => ({
  getMe: vi.fn(), loginUser: vi.fn(), logoutUser: vi.fn(),
  activateCustomer: vi.fn(), registerCustomer: vi.fn(), resendActivationOtp: vi.fn(),
  requestPasswordResetOtp: vi.fn(), verifyPasswordResetOtp: vi.fn(), completePasswordReset: vi.fn(),
}))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root
function Content() {
  const { isAuthenticated } = useAuth()
  return <p>{isAuthenticated ? 'Customer session' : 'Shared login'}</p>
}
afterEach(async () => {
  if (root) await act(async () => root.unmount())
  root = null
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
async function mount() {
  localStorage.setItem('sol_auth_token', 'old.owner.token')
  localStorage.setItem('sol_auth_account', JSON.stringify({ roles: ['owner'] }))
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<AuthProvider><OwnerRedirect><Content /></OwnerRedirect></AuthProvider>))
  return container
}
describe('restored owner sessions', () => {
  it('clears the stale React session after EJS logout rather than redirecting back to dashboard', async () => {
    window.history.replaceState(null, '', '/login?logout=1')
    const page = await mount()
    expect(page.textContent).toBe('Shared login')
    expect(localStorage.getItem('sol_auth_token')).toBeNull()
  })
  it('clears an expired session before any admin handoff', async () => {
    vi.mocked(getMe).mockRejectedValue({ status: 401 })
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    const page = await mount()
    expect(page.textContent).toBe('Shared login')
    expect(submit).not.toHaveBeenCalled()
    expect(localStorage.getItem('sol_auth_token')).toBeNull()
  })
  it('uses the server role instead of a stale stored owner role', async () => {
    vi.mocked(getMe).mockResolvedValue({ accountId: 'customer', roles: ['customer'] })
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    const page = await mount()
    expect(page.textContent).toBe('Customer session')
    expect(submit).not.toHaveBeenCalled()
  })
})
