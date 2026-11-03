import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../../../../public/js/admin-appointment-list.js', import.meta.url), 'utf8')
function setup({ withDialog = false } = {}) {
  const dom = new Window({ url: 'http://localhost:4000/admin/appointments?localDate=2026-11-01&q=QA' })
  dom.document.body.innerHTML = `<form data-owner-filters><input name="q" value="QA"></form>
    <button data-refresh-appointments>Tải lại</button><time data-list-updated datetime="2026-11-01T00:00:00Z">07:00</time>
    <p data-list-message></p><a data-list-login hidden></a>
    <section data-owner-appointments-list><a href="/admin/appointments/first">Original</a></section>`
  if (withDialog) {
    dom.document.body.insertAdjacentHTML('beforeend', `<a data-schedule-detail href="/admin/appointments/example?view=mine#start">Start</a>
      <dialog data-schedule-dialog><button data-schedule-close>Close</button><p data-schedule-dialog-message></p><iframe data-schedule-frame></iframe></dialog>`)
    dom.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
    dom.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new dom.Event('close')) }
    // Keep this unit test offline; the actual iframe GET is covered by integration/browser checks.
    Object.defineProperty(dom.document.querySelector('iframe'), 'src', { writable: true, value: '' })
  }
  const window = { location: dom.location, setInterval: vi.fn(), setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(), addEventListener: vi.fn() }
  const fetch = vi.fn()
  const context = vm.createContext({ document: dom.document, window, fetch, AbortController, URL, DOMParser: dom.DOMParser })
  vm.runInContext(source, context)
  const refresh = vm.runInContext('refreshOwnerAppointmentList', context)
  const response = text => ({ ok: true, redirected: false, text: async () => `<time data-list-updated datetime="2026-11-01T01:00:00Z">08:00</time><section data-owner-appointments-list>${text}</section>` })
  return { document: dom.document, fetch, window, refresh, response, dom }
}

describe('Admin appointment list refresh', () => {
  it('opens contextual detail without navigating the list and pauses refresh until the dialog closes', async () => {
    const page = setup({ withDialog: true })
    const trigger = page.document.querySelector('[data-schedule-detail]')
    trigger.click()
    const dialog = page.document.querySelector('dialog')
    expect(dialog.hasAttribute('open')).toBe(true)
    expect(page.document.querySelector('iframe').src).toContain('view=mine&embedded=1#start')
    await page.refresh()
    expect(page.fetch).not.toHaveBeenCalled()
    page.fetch.mockResolvedValueOnce(page.response('Updated after closing'))
    page.document.querySelector('[data-schedule-close]').click()
    await Promise.resolve()
    await Promise.resolve()
    expect(dialog.hasAttribute('open')).toBe(false)
    expect(page.document.querySelector('iframe').src).toBe('about:blank')
    expect(page.fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the detail open while a nested action or payment dialog is open', () => {
    const page = setup({ withDialog: true })
    const nested = new page.dom.DOMParser().parseFromString('<dialog open>Pending confirmation</dialog>', 'text/html')
    Object.defineProperty(page.document.querySelector('iframe'), 'contentDocument', { value: nested })
    page.document.querySelector('[data-schedule-detail]').click()
    page.document.querySelector('[data-schedule-close]').click()
    expect(page.document.querySelector('dialog').hasAttribute('open')).toBe(true)
    expect(page.document.querySelector('[data-schedule-dialog-message]').textContent).toContain('đang mở')
    expect(page.fetch).not.toHaveBeenCalled()
  })

  it('updates the current filtered page without replacing filters, and registers periodic/focus refresh', async () => {
    const page = setup()
    const search = page.document.querySelector('[name="q"]')
    search.value = 'unsent draft'
    page.fetch.mockResolvedValueOnce(page.response('New booking SOL-23456789'))
    await page.refresh(true)
    expect(page.fetch.mock.calls[0][0]).toContain('localDate=2026-11-01&q=QA')
    expect(page.fetch.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' })
    expect(page.document.querySelector('[data-owner-appointments-list]').textContent).toContain('New booking')
    expect(page.document.querySelector('[data-list-updated]').textContent).toBe('08:00')
    expect(page.document.querySelector('[name="q"]')).toBe(search)
    expect(search.value).toBe('unsent draft')
    expect(page.window.setInterval).toHaveBeenCalledWith(expect.any(Function), 30000)
    expect(page.window.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function))
  })
  it('does not refresh while typing, or apply a background response after typing begins', async () => {
    const page = setup()
    const search = page.document.querySelector('[name="q"]')
    search.focus()
    await page.refresh()
    expect(page.fetch).not.toHaveBeenCalled()
    search.blur()
    let finish
    page.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = page.refresh()
    search.focus()
    finish(page.response('Replaced'))
    await pending
    expect(page.document.querySelector('[data-owner-appointments-list]').textContent).toBe('Original')
  })
  it('ignores an older response after a second manual refresh', async () => {
    const page = setup()
    let finish
    page.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockResolvedValueOnce(page.response('Newest'))
    const first = page.refresh(true)
    await page.refresh(true)
    expect(page.fetch.mock.calls[0][1].signal.aborted).toBe(true)
    finish(page.response('Oldest'))
    await first
    expect(page.document.querySelector('[data-owner-appointments-list]').textContent).toBe('Newest')
  })
  it('retains the current list on network failure and shows a stale-data warning', async () => {
    const page = setup()
    page.fetch.mockRejectedValueOnce(new Error('offline'))
    await page.refresh(true)
    expect(page.document.querySelector('[data-owner-appointments-list]').textContent).toBe('Original')
    expect(page.document.querySelector('[data-list-message]').textContent).toContain('có thể đã cũ')
    expect(page.document.querySelector('[data-refresh-appointments]').disabled).toBe(false)
  })
  it('does not inject the login page on session expiry', async () => {
    const page = setup()
    page.fetch.mockResolvedValueOnce({ redirected: true, url: 'http://localhost:4000/admin/login' })
    await page.refresh(true)
    expect(page.document.querySelector('[data-list-login]').hidden).toBe(false)
    expect(page.document.querySelector('[data-list-message]').textContent).toContain('hết hạn')
  })
})
