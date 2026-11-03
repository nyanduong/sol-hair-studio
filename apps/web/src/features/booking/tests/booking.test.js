import { describe, expect, it, vi } from 'vitest'
import {
  bookingPayload,
  contactInput,
  createBookingSubmission,
  salonDate,
  slotTime,
} from '../../../../../../shared/booking.js'

const draft = {
  serviceIds: ['cut'],
  staffId: 'staff-1',
  startAt: '2026-10-22T03:00:00.000Z',
  owner: false,
  mode: 'scheduled',
}

describe('booking intent and retry safety', () => {
  it('uses server-owned totals and customer identity rather than values supplied by the UI', () => {
    expect(bookingPayload({ ...draft, customerId: 'someone-else', totalPriceVnd: 1 })).toEqual({
      serviceIds: ['cut'],
      staffId: 'staff-1',
      startAt: draft.startAt,
      bookingMode: 'customer',
    })
  })
  it('omits the walk-in preview timestamp so the server assigns the actual time', () => {
    expect(
      bookingPayload({ ...draft, owner: true, mode: 'owner_walkin', customerId: 'guest-id' }),
    ).toEqual({
      serviceIds: ['cut'],
      staffId: 'staff-1',
      bookingMode: 'owner_walkin',
      customerId: 'guest-id',
    })
  })
  it('requires explicit owner customer choice and accepts a distinct guest without phone matching', () => {
    expect(() => bookingPayload({ ...draft, owner: true })).toThrow('hồ sơ')
    const guest = contactInput('  Khách mẫu  ', '+84901234567')
    expect(bookingPayload({ ...draft, owner: true, guestCustomer: guest }).guestCustomer).toEqual(
      guest,
    )
  })
  it.each(
    [[], ['cut', 'cut'], ['a', 'b', 'c', 'd', 'e', 'f']].map((serviceIds) => ({ serviceIds })),
  )('rejects an invalid service selection %j', ({ serviceIds }) => {
    expect(() => bookingPayload({ ...draft, serviceIds })).toThrow()
  })
  it('shares one in-flight request for double clicks', async () => {
    let finish
    const send = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const key = vi.fn(() => 'synthetic-key-one')
    const manager = createBookingSubmission(send, key)
    const payload = bookingPayload(draft)
    const first = manager.run(payload)
    const second = manager.run(payload)
    expect(first).toBe(second)
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
    finish({ id: 'appointment-1' })
    await expect(first).resolves.toEqual({ id: 'appointment-1' })
    expect(key).toHaveBeenCalledTimes(1)
    expect(manager.getPending()).toBeUndefined()
  })
  it.each([undefined, 500, 503, 408])(
    'retains the original key and intent after ambiguous failure %s',
    async (status) => {
      const error = Object.assign(new Error('response lost'), { status })
      const send = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ id: 'original-appointment' })
      const manager = createBookingSubmission(send, () => 'same-key')
      const payload = bookingPayload(draft)
      await expect(manager.run(payload)).rejects.toMatchObject({ uncertain: true })
      payload.serviceIds.push('spa')
      await expect(manager.run(payload)).rejects.toThrow('yêu cầu trước')
      const pending = manager.getPending()
      expect(pending.payload.serviceIds).toEqual(['cut'])
      await expect(manager.run(pending.payload)).resolves.toEqual({ id: 'original-appointment' })
      expect(send.mock.calls.map((args) => args[1])).toEqual(['same-key', 'same-key'])
    },
  )
  it('allows a new key after a definite conflict and requires explicit fresh selection', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('slot taken'), { status: 409 }))
      .mockResolvedValueOnce({ id: 'new-booking' })
    const key = vi.fn().mockReturnValueOnce('key-one').mockReturnValueOnce('key-two')
    const manager = createBookingSubmission(send, key)
    await expect(manager.run(bookingPayload(draft))).rejects.toMatchObject({ uncertain: false })
    expect(manager.getPending()).toBeUndefined()
    await manager.run(bookingPayload({ ...draft, startAt: '2026-10-22T04:00:00.000Z' }))
    expect(send.mock.calls.map((args) => args[1])).toEqual(['key-one', 'key-two'])
  })
  it('uses the salon day and time across UTC midnight', () => {
    expect(salonDate(new Date('2026-10-20T17:00:00.000Z'))).toBe('2026-10-21')
    expect(slotTime('2026-10-21T03:30:00.000Z')).toBe('10:30')
  })
  it.each([
    ['0912345678', '+84912345678'],
    [' 0912 345 678 ', '+84912345678'],
    ['0912.345.678', '+84912345678'],
    ['+84 912-345-678', '+84912345678'],
    ['02812345678', '+842812345678'],
    ['+12025550123', '+12025550123'],
  ])('normalizes contact %s before sending it to the API', (input, expected) => {
    expect(contactInput(' Khách ', input)).toEqual({ displayName: 'Khách', phone: expected })
  })
  it.each([
    ['', '+84901234567'],
    ['a'.repeat(121), '+84901234567'],
    ['Khách', '097915866'],
    ['Khách', '+8497915866'],
    ['Khách', '091234567890'],
    ['Khách', '09abc45678'],
    ['Khách', '+840912345678'],
  ])('validates a contact before profile/guest submission', (name, phone) => {
    expect(() => contactInput(name, phone)).toThrow()
  })
})
