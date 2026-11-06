import { AppointmentModel } from '../../src/modules/appointments/appointments.model.js'
import { AppointmentEventModel } from '../../src/modules/appointments/appointment-events.model.js'
import { generateBookingReference } from '../../src/modules/appointments/booking-reference.js'
import { toHoChiMinhDate } from '../../src/modules/staff/staff-shifts.model.js'

// Called only by the isolated acceptance harness (or its temporary-DB test).
// A historical confirmed fixture avoids waiting 15 real minutes to inspect no-show UI.
// It is synthetic setup, not evidence that a live customer booked in the past.
export async function seedLifecycleAcceptanceData(fixture, now = new Date()) {
  const startAt = new Date(now.getTime() - 20 * 60_000)
  const endAt = new Date(startAt.getTime() + 30 * 60_000)
  const confirmedAt = new Date(startAt.getTime() - 60 * 60_000)
  const row = await AppointmentModel.create({
    referenceCode: generateBookingReference(),
    customerId: fixture.actors.mobile.customerId,
    staffId: fixture.staffIds[1],
    createdByAccountId: fixture.actors.owner.accountId,
    bookingMode: 'owner_scheduled',
    customerSnapshot: { displayName: 'SOL039 No-show fixture', phone: '+84900000034' },
    staffNameSnapshot: 'SOL034 Stylist B',
    items: [{ serviceId: 'accept-cut', name: 'SOL034 Cut', priceVnd: 100000, durationMinutes: 30 }],
    totalPriceVnd: 100000, totalDurationMinutes: 30, bufferAfterMinutes: 10,
    startAt, endAt, occupiedFrom: startAt,
    occupiedUntil: new Date(endAt.getTime() + 10 * 60_000),
    timeZone: 'Asia/Ho_Chi_Minh', localDate: toHoChiMinhDate(startAt),
    status: 'confirmed', revision: 0, confirmedAt,
  })
  await AppointmentEventModel.create({
    appointmentId: row._id, actorId: fixture.actors.owner.accountId,
    kind: 'created', revision: 0, occurredAt: confirmedAt,
    before: {}, after: { status: row.status, staffId: row.staffId, startAt, endAt,
      occupiedFrom: row.occupiedFrom, occupiedUntil: row.occupiedUntil },
  })
  return { noShowId: String(row._id) }
}
