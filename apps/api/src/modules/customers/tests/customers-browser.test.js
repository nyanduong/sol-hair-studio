import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
const source = readFileSync(new URL('../../../public/admin/customers-admin.js', import.meta.url), 'utf8')
function setup() {
  const dom = new Window()
  dom.document.body.innerHTML = `<script id="customer-config" type="application/json">{"token":"fixture"}</script><div id="summary"></div><p id="message"></p><form id="filters"><input name="q"><select name="type"><option value="all">All</option></select></form><table><tbody id="rows"></tbody></table><div id="pages"></div><dialog id="detail-dialog"><button id="close-detail"></button><div id="detail"></div></dialog><button id="add"></button><dialog id="editor"></dialog><form id="customer-form"><input name="displayName"><input name="phone"><button id="save"></button></form><h2 id="editor-title"></h2><p id="form-error"></p><button id="close-editor"></button>`
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { summary: { total: 0, account: 0 }, total: 0, items: [] } }) })
  const context = vm.createContext({ document: dom.document, fetch, AbortController, URLSearchParams, FormData: dom.FormData, Intl, Date })
  vm.runInContext(source, context)
  return { document: dom.document, fetch, context }
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
describe('Customer page interaction', () => {
  it('renders an honest empty state and retries after a failed request', async () => {
    const page = setup(); await flush()
    expect(page.document.querySelector('#message').textContent).toContain('Chưa có khách hàng')
    page.fetch.mockRejectedValueOnce(new Error('Tạm mất kết nối'))
    await vm.runInContext('load()', page.context)
    expect(page.document.querySelector('#message').textContent).toBe('Tạm mất kết nối')
    await vm.runInContext('load()', page.context)
    expect(page.document.querySelector('#message').textContent).toContain('Chưa có khách hàng')
  })
  it('escapes customer-provided names in the list', async () => {
    const page = setup(); await flush()
    page.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { summary: { total: 1, account: 0 }, total: 1, items: [{ id: '123456789012345678901234', displayName: '<img src=x onerror=alert(1)>', phone: '', hasAccount: false, visits: 0 }] } }) })
    await vm.runInContext('load()', page.context)
    expect(page.document.querySelector('#rows img')).toBeNull()
    expect(page.document.querySelector('#rows').textContent).toContain('<img src=x')
  })
  it('opens customer detail in a modal with initials and closes it', async () => {
    const page = setup(); await flush()
    const dialog = page.document.querySelector('#detail-dialog')
    dialog.showModal = () => { dialog.open = true }
    dialog.close = () => { dialog.open = false }
    page.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: '123456789012345678901234', displayName: 'Minh Anh', phone: '', hasAccount: false, visits: 0, totalSpentVnd: 0, history: [] } }) })
    await vm.runInContext("detail('123456789012345678901234')", page.context)
    expect(dialog.open).toBe(true)
    expect(page.document.querySelector('#detail').textContent).toContain('MA')
    expect(page.document.querySelector('#avatar-file').getAttribute('accept')).toBe('image/jpeg,image/png,image/webp')
    page.document.querySelector('#close-detail').click()
    expect(dialog.open).toBe(false)
  })

})
