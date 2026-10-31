import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../../../../public/js/admin-appointments.js', import.meta.url), 'utf8')
const id = '000000000000000000000123'

// Kiểm tra script thật với HTTP/DOM tối thiểu, không giả nhận là chạy trình duyệt.
function setup({ personalStaffId = '' } = {}) {
  const detail = { dataset: { personalStaffId } }
  const content = {
    querySelector: () => null, querySelectorAll: () => [],
    setAttribute() {}, removeAttribute() {}, append() {}, replaceChildren: vi.fn(),
  }
  const document = {
    querySelector: selector => selector === '[data-appointment-detail]' ? detail : null,
    querySelectorAll: () => [], addEventListener() {},
    createElement: () => ({ dataset: {}, setAttribute() {}, addEventListener() {} }), importNode: node => node,
  }
  const window = {
    location: { href: `http://localhost:4000/admin/appointments/${id}?view=mine&localDate=2026-10-31`, origin: 'http://localhost:4000', assign: vi.fn() },
    addEventListener() {}, setInterval() {}, setTimeout, clearTimeout,
  }
  const fetch = vi.fn()
  const context = vm.createContext({
    document, window, fetch, URL, URLSearchParams, AbortController, Intl,
    DOMParser: class { parseFromString(text) { return { querySelector: () => JSON.parse(text) } } },
  })
  vm.runInContext(source, context)
  const dialog = { open: true }
  const state = { appointmentId: id, content, close: {}, busy: false, pending: false, command: null, reader: null }
  vm.runInContext('dialogs', context).set(dialog, state)
  const request = vm.runInContext('requestAction', context)
  const response = (commandState, extra = {}) => ({
    ok: commandState === 'success', redirected: false,
    text: async () => JSON.stringify({ dataset: { appointmentResponse: id, commandState, ...extra } }),
  })
  return { request: (...args) => request(dialog, ...args), fetch, state, window, response }
}

describe('EJS appointment dialog request state', () => {
  it('rejects a different appointment or origin before sending a command', async () => {
    const page = setup()
    await page.request('/admin/appointments/another-id/cancel', 'POST', 'reason=test')
    await page.request(`https://example.test/admin/appointments/${id}/cancel`, 'POST', 'reason=test')
    expect(page.fetch).not.toHaveBeenCalled()
    expect(page.state.command).toBeNull()
  })

  it('keeps the original appointment URL, body, revision and key after an unknown network result', async () => {
    const page = setup()
    page.fetch.mockRejectedValueOnce(new Error('Connection lost'))
    const body = 'expectedRevision=2&commandKey=first-key&staffId=staff-a&startAt=original'
    await page.request(`/admin/appointments/${id}/reschedule`, 'POST', body)
    expect(page.state.pending).toBe(true)
    expect(page.state.close.disabled).toBe(true)
    page.fetch.mockResolvedValueOnce(page.response('success'))
    await page.request(`/admin/appointments/${id}/cancel`, 'POST', 'commandKey=another-key')
    expect(page.fetch.mock.calls[1][0].pathname).toBe(`/admin/appointments/${id}/reschedule`)
    expect(page.fetch.mock.calls[1][1].body).toBe(body)
    expect(page.state.pending).toBe(false)
    expect(page.window.location.assign).toHaveBeenCalledWith(page.window.location.href)
  })

  it('blocks loading new slot options while a command result is pending', async () => {
    const page = setup()
    page.fetch.mockResolvedValueOnce(page.response('pending'))
    await page.request(`/admin/appointments/${id}/eta`, 'POST', 'commandKey=eta-key')
    await page.request(`/admin/appointments/${id}/reschedule`)
    expect(page.fetch).toHaveBeenCalledTimes(1)
    expect(page.state.pending).toBe(true)
    expect(page.state.command.body).toBe('commandKey=eta-key')
  })

  it('refreshes the same detail after success, leaving mine only when the assigned Stylist changes', async () => {
    const page = setup({ personalStaffId: 'owner-staff' })
    page.fetch.mockResolvedValueOnce(page.response('success', { resultStaffId: 'other-staff' }))
    await page.request(`/admin/appointments/${id}/reschedule`, 'POST', 'commandKey=test-key')
    const target = new URL(page.window.location.assign.mock.calls[0][0])
    expect(target.pathname).toBe(`/admin/appointments/${id}`)
    expect(target.searchParams.has('view')).toBe(false)
    expect(target.searchParams.get('localDate')).toBe('2026-10-31')
    expect(page.fetch.mock.calls[0][1].credentials).toBe('same-origin')
    expect(page.fetch.mock.calls[0][1].headers['X-Appointment-Dialog']).toBe('true')
  })
})
