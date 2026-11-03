import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../../../../public/js/admin-appointments.js', import.meta.url), 'utf8')
const id = '000000000000000000000123'
const formHtml = `<section data-appointment-response="${id}" data-command-state="form"><span data-command-reference>SOL-23456789</span>
  <form data-reschedule-date-form action="/admin/appointments/${id}/reschedule" method="get"><input type="date" name="localDate" value="2026-11-01" min="2026-11-01" max="2026-11-08"></form>
  <form data-reschedule-form data-current-staff="staff-a"><input type="radio" name="stylistMode" value="current" checked><input type="radio" name="stylistMode" value="other">
  <label data-staff-select-label><select name="staffId"><option value="staff-a">An</option><option value="staff-b">Bình</option></select></label>
  <fieldset data-slot-staff="staff-a"><input type="radio" name="startAt" value="2026-11-01T09:00:00Z"></fieldset>
  <textarea name="reason">Giữ lý do đang nhập</textarea><input type="checkbox" name="customerAgreementConfirmed"><p data-selection-summary></p><button type="submit">Xác nhận</button></form></section>`
function setup() {
  const dom = new Window({ url: `http://localhost:4000/admin/appointments/${id}` })
  dom.document.body.innerHTML = `<article data-appointment-detail="${id}"></article><dialog open><div data-dialog-content>${formHtml}</div></dialog>`
  const window = { location: { href: dom.location.href, origin: dom.location.origin, assign: vi.fn() }, setTimeout: vi.fn(() => 1), clearTimeout() {}, setInterval() {}, addEventListener() {} }
  const fetch = vi.fn()
  const context = vm.createContext({ document: dom.document, window, fetch, URL, URLSearchParams, FormData: dom.FormData, AbortController, Intl, DOMParser: dom.DOMParser })
  vm.runInContext(source, context)
  const dialog = dom.document.querySelector('dialog')
  const content = dom.document.querySelector('[data-dialog-content]')
  const state = { appointmentId: id, referenceCode: 'SOL-23456789', content, close: {}, busy: false, pending: false, command: null, reader: null }
  vm.runInContext('dialogs', context).set(dialog, state)
  const request = vm.runInContext('requestAction', context)
  return { dom, fetch, content, state, request: href => request(dialog, href) }
}

describe('Admin reschedule form recovery', () => {
  it('keeps date controls and reason after an unsuccessful options read, blocks old slots and recovers', async () => {
    const page = setup()
    page.fetch.mockResolvedValueOnce({ok:false,redirected:false,text:async()=>`<section data-appointment-response="${id}" data-command-state="error"><p role="alert">Không tải được giờ trống</p></section>`})
    await page.request(`/admin/appointments/${id}/reschedule?localDate=2026-11-02`)
    expect(page.content.querySelector('[data-reschedule-date-form]')).not.toBeNull()
    expect(page.content.querySelector('[name="reason"]').value).toBe('Giữ lý do đang nhập')
    expect(page.content.querySelector('[name="startAt"]').disabled).toBe(true)
    expect(page.content.querySelector('[data-dialog-message]').textContent).toContain('Không tải được giờ trống')
    page.fetch.mockResolvedValueOnce({ok:true,redirected:false,text:async()=>formHtml})
    await page.request(`/admin/appointments/${id}/reschedule?localDate=2026-11-01`)
    expect(page.content.querySelector('[name="startAt"]').disabled).toBe(false)
    expect(page.content.querySelector('[name="reason"]').value).toBe('Giữ lý do đang nhập')
    expect(page.content.querySelector('[data-dialog-message]')).toBeNull()
    expect(page.state.pending).toBe(false)
  })
  it('rejects an out-of-range day before fetching and restores the loaded date', () => {
    const page = setup()
    const date = page.content.querySelector('[name="localDate"]')
    date.value = '2026-11-09'
    date.dispatchEvent(new page.dom.Event('change', {bubbles:true}))
    expect(page.fetch).not.toHaveBeenCalled()
    expect(date.value).toBe('2026-11-01')
    expect(page.content.querySelector('[data-dialog-message]').textContent).toContain('tối đa 7 ngày')
  })
})
