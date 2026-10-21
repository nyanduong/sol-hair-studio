import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookingPayload } from '../../../../../../shared/booking.js'
import { createBooking, readBookingData, updateBookingProfile } from '../api/booking.api.js'

afterEach(() => vi.unstubAllGlobals())
function stub(data, status = 200) {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}
describe('native booking API contract', () => {
  it('uses the configured device base URL and encodes the selected services/date', async () => {
    const fetch = stub({ data: { stylists: [] } })
    await readBookingData('https://device-api.example.test/', 'synthetic-session', 'availability', {
      serviceIds: ['cut', 'spa'],
      localDate: '2026-10-22',
      mode: 'scheduled',
    })
    expect(fetch.mock.calls[0][0]).toBe(
      'https://device-api.example.test/api/availability?serviceIds=cut%2Cspa&localDate=2026-10-22&mode=scheduled',
    )
    expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer synthetic-session')
  })
  it('sends customer intent, not owner identity, totals or guest details', async () => {
    const fetch = stub({ data: { id: 'synthetic-appointment' } }, 201)
    const payload = bookingPayload({
      serviceIds: ['cut'],
      staffId: 'stylist-1',
      startAt: '2026-10-22T03:00:00.000Z',
      owner: false,
      customerId: 'someone-else',
      guestCustomer: { displayName: 'Other' },
      totalPriceVnd: 1,
    })
    await createBooking('https://device-api.example.test', 'session', payload, 'native-same-key')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      serviceIds: ['cut'],
      staffId: 'stylist-1',
      startAt: '2026-10-22T03:00:00.000Z',
      bookingMode: 'customer',
    })
    expect(fetch.mock.calls[0][1].headers.get('Idempotency-Key')).toBe('native-same-key')
  })
  it('updates contact through the M1 endpoint instead of duplicating profile logic', async () => {
    const fetch = stub({ data: { customer: { displayName: 'Khách mẫu', phone: '+84901234567' } } })
    await updateBookingProfile('https://device-api.example.test', 'session', {
      displayName: 'Khách mẫu',
      phone: '+84901234567',
    })
    expect(fetch.mock.calls[0][0]).toBe('https://device-api.example.test/api/auth/me')
    expect(fetch.mock.calls[0][1].method).toBe('PATCH')
  })
  it('keeps HTTP failure metadata so the common retry manager can distinguish ambiguity', async () => {
    stub({ code: 'DATABASE_UNAVAILABLE', message: 'DB unavailable' }, 503)
    await expect(
      createBooking('https://device-api.example.test', 'session', {}, 'same-key'),
    ).rejects.toMatchObject({ status: 503, code: 'DATABASE_UNAVAILABLE' })
  })
  it('does not announce success without a returned appointment id', async () => {
    stub({ data: {} }, 200)
    await expect(
      createBooking('https://device-api.example.test', 'session', {}, 'same-key'),
    ).rejects.toThrow('mã lịch')
  })
})
