import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBooking, readBookingData, updateBookingProfile } from '../api/booking.api.js'

afterEach(() => vi.unstubAllGlobals())
function stub(data, status = 200) {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}
describe('booking API handoff', () => {
  it('encodes IDs and owner filters, sends session and propagates abort', async () => {
    const fetch = stub({ stylists: [] })
    const controller = new AbortController()
    await readBookingData(
      'https://api.example.test/',
      'synthetic-token',
      'availability',
      { serviceIds: ['cut', 'spa'], localDate: '2026-10-22', customerId: 'customer-1' },
      controller.signal,
    )
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe(
      'https://api.example.test/api/availability?serviceIds=cut%2Cspa&localDate=2026-10-22&customerId=customer-1',
    )
    expect(options.headers.get('Authorization')).toBe('Bearer synthetic-token')
    expect(options.signal.aborted).toBe(false)
  })
  it('writes only the contact fields to the existing M1 profile endpoint', async () => {
    const fetch = stub({ customer: { displayName: 'Khách mẫu' } })
    await updateBookingProfile('https://api.example.test', 'token', {
      displayName: 'Khách mẫu',
      phone: '+84901234567',
    })
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/api/auth/me')
    expect(fetch.mock.calls[0][1].method).toBe('PATCH')
  })
  it('sends the same explicit idempotency key and rejects malformed successful responses', async () => {
    const fetch = stub({})
    await expect(
      createBooking('https://api.example.test', 'token', { bookingMode: 'customer' }, 'same-key'),
    ).rejects.toThrow('mã lịch')
    expect(fetch.mock.calls[0][1].headers.get('Idempotency-Key')).toBe('same-key')
    expect(fetch.mock.calls[0][1].method).toBe('POST')
  })
})
