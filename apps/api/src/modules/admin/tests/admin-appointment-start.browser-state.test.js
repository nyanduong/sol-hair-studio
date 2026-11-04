import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const actionSource = readFileSync(new URL('../../../../public/js/admin-appointments.js', import.meta.url), 'utf8')
const listSource = readFileSync(new URL('../../../../public/js/admin-appointment-list.js', import.meta.url), 'utf8')
const id = '000000000000000000000123'
const path = '/admin/appointments/' + id
const windows = []
afterEach(() => { for (const dom of windows.splice(0)) dom.happyDOM.abort() })

function detailHtml({ hasStart = true } = {}) {
  return `<article data-appointment-detail="${id}" data-appointment-reference="SOL-TEST1234">
    <header data-appointment-heading hidden><div><p>LỊCH SALON / CHI TIẾT</p><h2>Lịch hẹn SOL-TEST1234</h2></div><span>Đã xác nhận</span></header>
    <p data-detail-only>Giá và thanh toán chỉ nằm trong Chi tiết</p>
    <a data-open-reschedule href="${path}/reschedule?localDate=2026-11-05&embedded=1">Đổi lịch</a>
    <details data-owner-panel data-ready-at="0"><summary>Hủy lịch</summary><div data-panel-content>
      <form method="post" action="${path}/cancel?localDate=2026-11-05&embedded=1">
      <input name="expectedRevision" value="7"><input name="commandKey" value="original-cancel-key">
      <label>Lý do <span data-cancel-reason-label></span><textarea name="reason" data-require-after="0"></textarea></label>
      <button data-close-panel type="button" hidden>Quay lại</button><button type="submit">Xác nhận hủy</button></form>
    </div></details>
    ${hasStart ? `<details data-owner-panel data-ready-at="0"><summary>Bắt đầu phục vụ</summary><div data-panel-content>
      <p>Chỉ xác nhận khi khách đã đến.</p><form method="post" action="${path}/start?localDate=2026-11-05&embedded=1">
      <input name="expectedRevision" value="7"><input name="commandKey" value="original-start-key">
      <input type="checkbox" name="serviceConfirmed" value="true" required><button data-close-panel type="button" hidden>Quay lại</button>
      <button type="submit">Xác nhận bắt đầu phục vụ</button></form></div></details>` : ''}
  </article>`
}

function rescheduleHtml(revision = 9) {
  return `<section data-appointment-response="${id}" data-command-state="form"><h2>Đổi lịch hẹn</h2>
    <form id="appointment-reschedule-${id}" data-reschedule-form data-current-staff="staff-a" method="post" action="${path}/reschedule?embedded=1">
    <input name="expectedRevision" value="${revision}"><input name="commandKey" value="original-reschedule-key">
    <input type="radio" name="stylistMode" value="current"><input type="radio" name="stylistMode" value="other">
    <label data-staff-select-label><select name="staffId"><option value="staff-a">Current</option><option value="staff-b">Other</option></select></label>
    <fieldset data-slot-staff="staff-a"><input type="radio" name="startAt" value="2099-11-05T02:00:00.000Z"></fieldset>
    <fieldset data-slot-staff="staff-b"><input type="radio" name="startAt" value="2099-11-05T03:00:00.000Z"></fieldset>
    </form><textarea name="reason" form="appointment-reschedule-${id}" required></textarea>
    <input type="checkbox" name="customerAgreementConfirmed" form="appointment-reschedule-${id}" value="true" required>
    <p data-selection-summary></p>
    <div data-reschedule-actions><a data-close-action href="${path}">Quay lại</a>
    <button type="submit" name="rescheduleSubmit" data-reschedule-submit form="appointment-reschedule-${id}">Xác nhận đổi lịch</button></div></section>`
}

function setup({ embedded = false } = {}) {
  const dom = new Window({ url: 'http://localhost:4000/admin/appointments' })
  windows.push(dom)
  dom.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  dom.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new dom.Event('close')) }
  dom.HTMLElement.prototype.scrollIntoView = vi.fn()
  dom.document.body.innerHTML = embedded ? detailHtml() : `
    <button data-refresh-appointments>Tải lại</button><time data-list-updated>08:00</time><p data-list-message></p><a data-list-login hidden></a>
    <section data-owner-appointments-list><a data-schedule-action="start" href="${path}?localDate=2026-11-05#start">Bắt đầu</a>
    <a data-schedule-detail href="${path}?localDate=2026-11-05">Chi tiết</a></section>
    <dialog data-schedule-dialog><div data-schedule-heading></div><button data-schedule-close>Đóng</button>
    <p data-schedule-dialog-message></p><iframe data-schedule-frame></iframe></dialog>`
  const frame = dom.document.querySelector('iframe')
  if (frame) Object.defineProperty(frame, 'src', { writable: true, value: '' })
  const window = {
    location: { href: 'http://localhost:4000' + (embedded ? path + '?embedded=1' : '/admin/appointments'), origin: 'http://localhost:4000', hash: '', assign: vi.fn() },
    setInterval: vi.fn(), setTimeout, clearTimeout, addEventListener: vi.fn(),
  }
  window.parent = embedded ? { postMessage: vi.fn() } : window
  const fetch = vi.fn()
  const context = vm.createContext({ document: dom.document, window, fetch, URL, URLSearchParams, AbortController,
    DOMParser: dom.DOMParser, CustomEvent: dom.CustomEvent, FormData: dom.FormData, Intl })
  vm.runInContext(actionSource, context)
  if (!embedded) vm.runInContext(listSource, context)
  const response = (html, ok = true) => ({ ok, redirected: false, text: async () => html })
  return { dom, document: dom.document, window, fetch, context, response, frame }
}

async function openAction(page, operation = 'start') {
  page.fetch.mockResolvedValueOnce(page.response(operation === 'reschedule' ? rescheduleHtml() : detailHtml()))
  page.document.querySelector('[data-schedule-action]').dataset.scheduleAction = operation
  page.document.querySelector('[data-schedule-action]').click()
  await vi.waitFor(() => expect(page.document.querySelector('[data-appointment-action-dialog] form')).not.toBeNull())
  return page.document.querySelector('[data-appointment-action-dialog]')
}

describe('Admin standalone appointment actions and detail heading', () => {
  it('opens only the Start dialog, keeping the detail iframe blank and using the current server revision/key', async () => {
    const page = setup()
    const dialog = await openAction(page)
    expect(page.document.querySelectorAll('dialog[open]')).toHaveLength(1)
    expect(page.document.querySelector('[data-schedule-dialog]').open).toBe(false)
    expect(page.frame.src).toBe('')
    expect(dialog.textContent).toContain('Bắt đầu phục vụ')
    expect(dialog.querySelector('[data-detail-only]')).toBeNull()
    expect(dialog.querySelector('[name="expectedRevision"]').value).toBe('7')
    expect(dialog.querySelector('[name="commandKey"]').value).toBe('original-start-key')
    expect(page.fetch.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' })
    page.document.querySelector('[data-close-panel]').click()
    expect(page.document.querySelectorAll('dialog[open]')).toHaveLength(0)
  })

  it('does not let a late form load reopen a closed Start dialog', async () => {
    const page = setup()
    let finish
    page.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    page.document.querySelector('[data-schedule-action]').click()
    const signal = page.fetch.mock.calls[0][1].signal
    page.document.querySelector('[aria-label="Đóng hộp thoại"]').click()
    expect(signal.aborted).toBe(true)
    finish(page.response(detailHtml()))
    await Promise.resolve()
    await Promise.resolve()
    expect(page.document.querySelector('[data-appointment-action-dialog]')).toBeNull()
  })

  it('shows a failed/changed-state GET without offering a Start submit', async () => {
    const page = setup()
    page.fetch.mockResolvedValueOnce(page.response(detailHtml({ hasStart: false })))
    page.document.querySelector('[data-schedule-action]').click()
    await vi.waitFor(() => expect(page.document.querySelector('[data-dialog-message]')).not.toBeNull())
    expect(page.document.querySelector('[data-appointment-action-dialog] form')).toBeNull()
    expect(page.document.querySelector('[data-dialog-message]').textContent).toContain('không còn đủ điều kiện')
    expect(page.document.querySelector('[data-schedule-dialog]').open).toBe(false)
  })

  it.each(['start', 'cancel', 'reschedule'])('%s prevents double submit/closing an unresolved command and retries the original payload/key', async operation => {
    const page = setup()
    const dialog = await openAction(page, operation)
    const form = dialog.querySelector('form')
    form.reportValidity = () => true
    if (operation === 'start') form.querySelector('[name="serviceConfirmed"]').checked = true
    if (operation === 'cancel') form.querySelector('[name="reason"]').value = 'Customer requested cancellation'
    if (operation === 'reschedule') {
      const slot = form.querySelector('[name="startAt"]')
      slot.checked = true
      slot.dispatchEvent(new page.dom.Event('change'))
      form.elements.namedItem('reason').value = 'Customer agreed to another time'
      const agreement = form.elements.namedItem('customerAgreementConfirmed')
      agreement.checked = true
      agreement.dispatchEvent(new page.dom.Event('change'))
    }
    let finish
    page.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    if (operation === 'reschedule') {
      const confirm = dialog.querySelector('[data-reschedule-submit]')
      expect(confirm.form).toBe(form)
      confirm.click()
      confirm.click()
    } else {
      form.dispatchEvent(new page.dom.Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new page.dom.Event('submit', { bubbles: true, cancelable: true }))
    }
    expect(page.fetch).toHaveBeenCalledTimes(2) // One GET, one POST.
    const body = page.fetch.mock.calls[1][1].body
    if (operation === 'reschedule') {
      expect(new URLSearchParams(body).get('reason')).toBe('Customer agreed to another time')
      expect(new URLSearchParams(body).get('customerAgreementConfirmed')).toBe('true')
    }
    expect(body).toContain(`expectedRevision=${operation === 'reschedule' ? 9 : 7}&commandKey=original-${operation}-key`)
    expect(new URL(page.fetch.mock.calls[1][0]).pathname).toBe(path + '/' + operation)
    finish(Promise.reject(new Error('offline')))
    await vi.waitFor(() => expect(dialog.querySelector('[data-retry-command]')).not.toBeNull())
    dialog.querySelector('[data-close-panel], [data-close-action]').click()
    expect(dialog.open).toBe(true)
    page.fetch.mockResolvedValueOnce(page.response(`<section data-appointment-response="${id}" data-command-state="success"></section>`))
    page.fetch.mockResolvedValueOnce(page.response('<time data-list-updated>09:00</time><section data-owner-appointments-list>Đang phục vụ</section>'))
    dialog.querySelector('[data-retry-command]').click()
    await vi.waitFor(() => expect(page.document.querySelector('[data-owner-appointments-list]').textContent).toContain('Đang phục vụ'))
    expect(page.fetch.mock.calls[2][1].body).toBe(body)
    expect(page.document.querySelectorAll('dialog[open]')).toHaveLength(0)
    expect(page.window.location.assign).not.toHaveBeenCalled()
  })

  it('copies the appointment reference and status to the single outer detail heading', () => {
    const page = setup()
    const inner = new page.dom.DOMParser().parseFromString(detailHtml(), 'text/html')
    Object.defineProperty(page.frame, 'contentDocument', { value: inner })
    page.document.querySelector('[data-schedule-detail]').click()
    page.fetch.mockResolvedValueOnce(page.response('<time data-list-updated>09:00</time><section data-owner-appointments-list>Current</section>'))
    page.frame.dispatchEvent(new page.dom.Event('load'))
    expect(page.document.querySelector('#schedule-dialog-title').textContent).toBe('Lịch hẹn SOL-TEST1234')
    expect(page.document.querySelector('[data-schedule-heading]').textContent).toContain('LỊCH SALON / CHI TIẾT')
    expect(page.document.querySelector('[data-schedule-heading]').textContent).toContain('Đã xác nhận')
    expect(inner.querySelector('[data-appointment-heading]').hidden).toBe(true)
  })

  it.each(['start', 'cancel', 'reschedule'])('closes the detail before opening %s, accepting messages only from its own iframe', async operation => {
    const page = setup()
    page.document.querySelector('[data-schedule-detail]').click()
    const onMessage = page.window.addEventListener.mock.calls.find(([name]) => name === 'message')[1]
    const event = { origin: page.window.location.origin, source: page.frame.contentWindow, data: { type: 'sol-owner-action', href: 'http://localhost:4000' + path, operation } }
    onMessage({ ...event, origin: 'https://example.test' })
    onMessage({ ...event, source: {} })
    expect(page.document.querySelector('[data-schedule-dialog]').open).toBe(true)
    expect(page.document.querySelector('[data-appointment-action-dialog]')).toBeNull()
    page.fetch.mockResolvedValueOnce(page.response('<time data-list-updated>09:00</time><section data-owner-appointments-list>Current</section>'))
    page.fetch.mockResolvedValueOnce(page.response(operation === 'reschedule' ? rescheduleHtml() : detailHtml()))
    onMessage(event)
    await vi.waitFor(() => expect(page.document.querySelector('[data-appointment-action-dialog] form')).not.toBeNull())
    expect(page.document.querySelector('[data-schedule-dialog]').open).toBe(false)
    expect(page.document.querySelectorAll('dialog[open]')).toHaveLength(1)
  })

  it.each(['start', 'cancel', 'reschedule'])('delegates the embedded detail %s to its parent instead of opening another dialog', operation => {
    const page = setup({ embedded: true })
    page.document.querySelector(operation === 'reschedule' ? '[data-open-reschedule]' : `[data-service-operation="${operation}"]`).click()
    expect(page.window.parent.postMessage).toHaveBeenCalledWith({ type: 'sol-owner-action', href: page.window.location.href, operation }, page.window.location.origin)
    expect(page.document.querySelector('dialog[open]')).toBeNull()
  })

  it('updates required cancellation reason inside the standalone dialog and closes without a POST', async () => {
    const page = setup()
    const dialog = await openAction(page, 'cancel')
    expect(dialog.querySelector('[name="reason"]').required).toBe(true)
    expect(dialog.querySelector('[data-cancel-reason-label]').textContent).toContain('bắt buộc')
    dialog.querySelector('[data-close-panel]').click()
    expect(page.fetch).toHaveBeenCalledTimes(1)
    expect(page.document.querySelectorAll('dialog[open]')).toHaveLength(0)
  })

  it('loads reschedule through the existing HTML endpoint and initializes stylist/slot agreement validation', async () => {
    const page = setup()
    const dialog = await openAction(page, 'reschedule')
    expect(new URL(page.fetch.mock.calls[0][0]).pathname).toBe(path + '/reschedule')
    expect(page.fetch.mock.calls[0][1].headers['X-Appointment-Dialog']).toBe('true')
    expect(dialog.querySelector('[type="submit"]').disabled).toBe(true)
    expect(dialog.querySelector('[data-slot-staff="staff-b"]').disabled).toBe(true)
    const other = dialog.querySelector('[name="stylistMode"][value="other"]')
    other.checked = true
    other.dispatchEvent(new page.dom.Event('change'))
    expect(dialog.querySelector('[name="staffId"]').value).toBe('staff-b')
    expect(dialog.querySelector('[data-slot-staff="staff-a"]').disabled).toBe(true)
    expect(dialog.querySelector('[data-slot-staff="staff-b"]').disabled).toBe(false)
    expect(page.document.querySelector('[data-schedule-dialog]').open).toBe(false)
    expect(page.document.querySelectorAll('dialog[open]')).toHaveLength(1)
  })

  it('validates external reason/agreement and resets consent when the reason changes', async () => {
    const page = setup()
    const dialog = await openAction(page, 'reschedule')
    const form = dialog.querySelector('[data-reschedule-form]')
    const reason = dialog.querySelector('[name="reason"]')
    const agreement = dialog.querySelector('[name="customerAgreementConfirmed"]')
    const confirm = dialog.querySelector('[data-reschedule-submit]')
    expect(reason.closest('form')).toBeNull()
    expect(agreement.closest('form')).toBeNull()
    expect(reason.form).toBe(form)
    expect(agreement.form).toBe(form)
    const slot = form.querySelector('[name="startAt"]')
    slot.checked = true
    slot.dispatchEvent(new page.dom.Event('change'))
    agreement.checked = true
    agreement.dispatchEvent(new page.dom.Event('change'))
    expect(confirm.disabled).toBe(true) // Missing reason.
    reason.value = 'Customer agreed'
    reason.dispatchEvent(new page.dom.Event('input'))
    expect(agreement.checked).toBe(false)
    agreement.checked = true
    agreement.dispatchEvent(new page.dom.Event('change'))
    expect(confirm.disabled).toBe(false)
    reason.value = 'Updated reason'
    reason.dispatchEvent(new page.dom.Event('input'))
    expect(agreement.checked).toBe(false)
    expect(confirm.disabled).toBe(true)
    expect(page.fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves the external reason across option reloads but requires fresh slot/consent', async () => {
    const page = setup()
    const dialog = await openAction(page, 'reschedule')
    dialog.querySelector('[name="reason"]').value = 'Keep this reason'
    dialog.querySelector('[name="customerAgreementConfirmed"]').checked = true
    page.fetch.mockResolvedValueOnce(page.response(rescheduleHtml(10)))
    const request = vm.runInContext('requestAction', page.context)
    await request(dialog, path + '/reschedule?localDate=2099-11-06')
    const form = dialog.querySelector('[data-reschedule-form]')
    expect(form.elements.namedItem('reason').value).toBe('Keep this reason')
    expect(form.elements.namedItem('expectedRevision').value).toBe('10')
    expect(form.elements.namedItem('customerAgreementConfirmed').checked).toBe(false)
    expect(dialog.querySelector('[name="startAt"]:checked')).toBeNull()
    expect(dialog.querySelector('[data-reschedule-submit]').disabled).toBe(true)
  })
})
