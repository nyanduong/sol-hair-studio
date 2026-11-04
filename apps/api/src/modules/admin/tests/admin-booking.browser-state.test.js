import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { randomUUID } from 'node:crypto'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import ejs from 'ejs'

const script = readFileSync(new URL('../../../../public/js/admin-booking.js', import.meta.url), 'utf8')
const template = new URL('../../../views/admin/appointments/appointment-create.ejs', import.meta.url)
const customer = { id: 'customer-1', displayName: 'Test customer', phone: '+84901234567' }
const availability = { totalPriceVnd: 100000, totalDurationMinutes: 30, stylists: [{ staffId: 'staff-1', displayName: 'Stylist A', slots: [{ startAt: '2026-11-04T03:00:00.000Z' }] }] }
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
async function setup() {
  const dom = new Window({ url: 'http://localhost:4000/admin/appointments/new' })
  dom.document.body.innerHTML = await ejs.renderFile(template.pathname.replace(/^\/(\w:)/, '$1'), { title: 'New', apiToken: 'test-token', identity: { email: 'owner@example.test' } })
  const fetch = vi.fn(async path => ({ ok: true, json: async () => ({ data: path.includes('/services/manage') ? [{ id: 'cut', name: 'Cut', isActive: true, bookingDurationMinutes: 30, priceVnd: 100000 }] : path.includes('/customers?') ? { items: [customer, { ...customer, id: 'customer-2' }] } : availability }) }))
  const window = { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(), addEventListener: vi.fn() }
  vm.runInNewContext(script, { document: dom.document, window, fetch, AbortController, URLSearchParams, crypto: { randomUUID } })
  await flush()
  const q = selector => dom.document.querySelector(selector)
  const change = (selector, value) => { const element = q(selector); element.value = value; element.dispatchEvent(new dom.Event('change', { bubbles: true })) }
  async function prepare() {
    q('#customer-phone').value = '0901234567'; q('#find-customer').click(); await flush()
    q('#customer-results button').click()
    q('[name="serviceIds"]').click()
    q('#find-slots').click(); await flush()
    q('[name="slot"]').click(); q('#booking-agreed').click()
  }
  const submit = () => q('#owner-booking-form').dispatchEvent(new dom.Event('submit', { bubbles: true, cancelable: true }))
  return { dom, q, fetch, change, prepare, submit, window }
}

describe('Owner booking client', () => {
  it('requires explicit customer selection even when multiple records share one phone', async () => {
    const page = await setup()
    page.q('#customer-phone').value = '0901234567'; page.q('#find-customer').click(); await flush()
    expect(page.q('#customer-results').children).toHaveLength(2)
    expect(page.q('#booking-summary').textContent).not.toContain(customer.displayName)
    page.q('#customer-results button').click()
    expect(page.q('#booking-summary').textContent).toContain(customer.displayName)
  })

  it('locks an ambiguous write and retries exactly the same intent/key, then links to the receipt', async () => {
    const page = await setup(); await page.prepare()
    page.fetch.mockRejectedValueOnce(new TypeError('offline'))
    page.submit(); await flush()
    const first = page.fetch.mock.calls.at(-1)
    expect(JSON.parse(first[1].body)).toEqual({ serviceIds: ['cut'], staffId: 'staff-1', bookingMode: 'owner_scheduled', startAt: '2026-11-04T03:00:00.000Z', customerId: 'customer-1' })
    expect(page.q('#booking-fields').disabled).toBe(true)
    expect(page.q('#booking-agreed').disabled).toBe(true)
    expect(page.q('#create-booking').textContent).toContain('Thử lại cùng yêu cầu')
    page.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'saved-appointment', referenceCode: 'SOL-23456789' } }) })
    page.submit(); await flush()
    const second = page.fetch.mock.calls.at(-1)
    expect(second[1].headers['Idempotency-Key']).toBe(first[1].headers['Idempotency-Key'])
    expect(second[1].body).toBe(first[1].body)
    expect(page.q('#booking-result').getAttribute('href')).toBe('/admin/appointments/saved-appointment')
    expect(page.q('#create-booking').hidden).toBe(true)
  })

  it('invalidates stale availability and clears the selection after a definitive conflict', async () => {
    const page = await setup(); await page.prepare()
    page.fetch.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ message: 'Giờ đã có người đặt' }) })
    page.submit(); await flush()
    expect(page.q('#booking-fields').disabled).toBe(false)
    expect(page.q('#create-booking').disabled).toBe(true)
    let resolve
    page.fetch.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    page.q('#find-slots').click()
    page.change('#booking-date', '2026-11-05')
    resolve({ ok: true, json: async () => ({ data: availability }) }); await flush()
    expect(page.q('[name="slot"]')).toBeNull()
    expect(page.q('#create-booking').disabled).toBe(true)
  })
})
