import { salonDate } from '../../../../../shared/booking.js'

export function bookingDateRange(now = new Date()) {
  return { min: salonDate(now), max: salonDate(new Date(now.getTime() + 7 * 86400000)) }
}

export function isBookingDateAllowed(value, range) {
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= range.min && value <= range.max &&
    new Date(time).toISOString().slice(0, 10) === value
}
