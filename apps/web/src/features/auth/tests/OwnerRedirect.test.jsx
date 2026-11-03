// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OwnerRedirect from '../components/OwnerRedirect.jsx'
import { AuthContext } from '../context/auth-context.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root
afterEach(async () => {
  if (root) await act(async () => root.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function render(auth) {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(
    <AuthContext.Provider value={auth}>
      <OwnerRedirect><p>Customer content</p></OwnerRedirect>
    </AuthContext.Provider>,
  ))
  return container
}

describe('Owner workspace boundary', () => {
  it.each(['owner', 'customer-owner'])('hides every customer route and submits the %s session to dashboard handoff', async role => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    const page = await render({ isAuthenticated: true, token: 'fixture.token.value', account: { roles: role === 'owner' ? ['owner'] : ['customer', 'owner'] } })
    expect(page.textContent).not.toContain('Customer content')
    expect(submit).toHaveBeenCalledOnce()
    const form = page.querySelector('form')
    expect(form.method).toBe('post')
    expect(form.action).toBe('http://localhost:4000/admin/session')
    expect(form.action).not.toContain('token')
    expect(form.elements.token.value).toBe('fixture.token.value')
  })

  it.each([null, 'customer', 'stylist'])('preserves the customer site for %s', async role => {
    const page = await render({ isAuthenticated: Boolean(role), account: role && { roles: [role] } })
    expect(page.textContent).toContain('Customer content')
    expect(page.querySelector('form')).toBeNull()
  })

  it('waits for server validation of a restored owner session before posting', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    const page = await render({ isAuthenticated: true, isSessionChecking: true, token: 'stale.token.value', account: { roles: ['owner'] } })
    expect(submit).not.toHaveBeenCalled()
    expect(page.textContent).not.toContain('Customer content')
  })
})
