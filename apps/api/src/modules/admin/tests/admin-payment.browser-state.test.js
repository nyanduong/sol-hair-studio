import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ejs from 'ejs'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../../../public/admin/payment-admin.js', import.meta.url), 'utf8')
const template = readFileSync(new URL('../../../views/admin/payment.ejs', import.meta.url), 'utf8')
const receipt = { status: 'unpaid', appointmentStatus: 'completed', amountVnd: 450000, revision: 2, transferContent: 'SOL-TEST1234' }

function setup(data = receipt, failure = false) {
  const window = new Window({ url: 'http://localhost:4000/admin/appointments/test?view=mine&embedded=1&collect=1#payment' })
  window.document.body.innerHTML = ejs.render(template, { appointmentId: 'test', token: 'synthetic-token' })
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  const fetch = failure ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data }) })
  vm.runInContext(source, vm.createContext({ window, document: window.document, fetch, URL, AbortController,
    crypto: { randomUUID: () => 'synthetic-idempotency-key' }, setTimeout, clearTimeout, Intl }))
  return { window, fetch, el: id => window.document.getElementById(id) }
}

describe('Completion to QR collection', () => {
  it('reads current payment, automatically opens QR, and keeps waiting visible after dismissal without writing a receipt', async () => {
    const page = setup()
    await vi.waitFor(() => expect(page.el('payment-dialog').hasAttribute('open')).toBe(true))
    expect(page.window.location.search).not.toContain('collect=')
    expect(page.window.location.search).toContain('embedded=1')
    expect(page.el('payment-summary').textContent).toContain('Chờ thu tiền')
    expect(page.el('payment-summary').className).toContain('bg-amber-50')
    expect(page.el('payment-attest').checked).toBe(false)
    page.el('payment-close').click()
    expect(page.el('payment-dialog').hasAttribute('open')).toBe(false)
    expect(page.el('payment-summary').textContent).toContain('Chưa xác nhận nhận tiền')
    expect(page.fetch).toHaveBeenCalledTimes(1)
    expect(page.fetch.mock.calls[0][1].method).toBe('GET')
  })

  it('does not request another transfer if the receipt is already recorded', async () => {
    const page = setup({ ...receipt, status: 'paid', receivedAt: '2026-11-03T04:00:00Z' })
    await vi.waitFor(() => expect(page.el('payment-summary').textContent).toContain('Đã thanh toán'))
    expect(page.el('payment-dialog').hasAttribute('open')).toBe(false)
    expect(page.el('payment-open').hidden).toBe(true)
    expect(page.el('payment-summary').textContent).not.toContain('Chờ thu tiền')
  })

  it('does not open QR or claim payment is outstanding when the read fails', async () => {
    const page = setup(receipt, true)
    await vi.waitFor(() => expect(page.el('payment-summary').textContent).toContain('Chưa đọc được'))
    expect(page.el('payment-dialog').hasAttribute('open')).toBe(false)
    expect(page.el('payment-open').hidden).toBe(true)
  })
})
