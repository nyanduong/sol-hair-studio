import { expect, it } from 'vitest'
import { bookingDateRange, isBookingDateAllowed } from '../booking-date.js'

it('uses Vietnam dates across UTC midnight, month and year boundaries', () => {
  expect(bookingDateRange(new Date('2026-12-31T17:30:00Z'))).toEqual({min:'2027-01-01',max:'2027-01-08'})
})
it('accepts both boundary dates and rejects past, too distant and invalid dates', () => {
  const range = bookingDateRange(new Date('2026-11-01T08:00:00Z'))
  for (const date of ['2026-11-01','2026-11-08']) expect(isBookingDateAllowed(date,range)).toBe(true)
  for (const date of ['', '2026-10-31','2026-11-09','2026-11-31']) expect(isBookingDateAllowed(date,range)).toBe(false)
})

it('rejects malformed calendar days even when the text falls inside the permitted range', () => {
  expect(isBookingDateAllowed('2026-11-00', {min:'2026-10-29',max:'2026-11-05'})).toBe(false)
  expect(isBookingDateAllowed('2027-02-29', {min:'2027-02-25',max:'2027-03-04'})).toBe(false)
})
