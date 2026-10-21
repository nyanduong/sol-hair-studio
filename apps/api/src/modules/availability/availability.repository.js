import mongoose from 'mongoose'
import { ServiceModel } from '../services/services.model.js'
import { StaffModel } from '../staff/staff.model.js'
import { StaffShiftModel } from '../staff/staff-shifts.model.js'
import { AccountModel } from '../auth/accounts.model.js'
import { AppointmentModel } from '../appointments/appointments.model.js'

export function findBookingServices(serviceIds, { session } = {}) {
  return ServiceModel.find({ id: { $in: serviceIds }, isActive: true })
    .select('id name priceVnd durationMinutes bookingDurationMinutes -_id')
    .session(session ?? null)
    .lean()
}

export async function findEligibleStaff(serviceIds, staffId, { session } = {}) {
  const staff = await StaffModel.find({
    isActive: true,
    serviceIds: { $all: serviceIds },
    ...(staffId ? { _id: staffId } : {}),
  })
    .select('_id accountId displayName')
    .sort({ _id: 1 })
    .session(session ?? null)
    .lean()
  const accounts = await AccountModel.find({
    _id: { $in: staff.map(item => item.accountId) },
    status: 'active',
    roles: { $in: ['owner', 'stylist'] },
  })
    .select('_id')
    .session(session ?? null)
    .lean()
  const activeIds = new Set(accounts.map(item => String(item._id)))
  return staff.filter(item => activeIds.has(String(item.accountId)))
}

// Read API van doc song song; writer doc tuan tu trong cung session.
export async function findAvailabilityCalendar(
  staffIds, customerId, from, until, { session, excludeAppointmentId } = {},
) {
  const appointmentFilter = {
    ...(excludeAppointmentId ? { _id: { $ne: excludeAppointmentId } } : {}),
    $and: [
      { $or: [{ staffId: { $in: staffIds } }, ...(customerId ? [{ customerId }] : [])] },
      { $or: [
        { status: { $in: ['confirmed', 'completed'] }, occupiedFrom: { $lt: until }, occupiedUntil: { $gt: from } },
        // Overdue in-progress remains busy even beyond its stored end.
        { status: 'in_progress', occupiedFrom: { $lt: until } },
      ] },
    ],
  }
  const readShifts = () => StaffShiftModel.find({
    staffId: { $in: staffIds }, status: 'active', startAt: { $lt: until }, endAt: { $gt: from },
  }).select('staffId startAt endAt -_id').session(session ?? null).lean()
  const readTimeOff = () => mongoose.connection.db.collection('staff_time_off').find({
    staffId: { $in: staffIds }, startAt: { $lt: until }, endAt: { $gt: from },
  }, {
    projection: { staffId: 1, startAt: 1, endAt: 1, _id: 0 },
    ...(session ? { session } : {}),
  }).toArray()
  const readAppointments = () => AppointmentModel.find(appointmentFilter)
    .select('staffId customerId status startAt endAt startedAt completedAt estimatedEndAt occupiedFrom occupiedUntil -_id')
    .session(session ?? null).lean()
  if (session) {
    const shifts = await readShifts()
    const timeOff = await readTimeOff()
    const appointments = await readAppointments()
    return { shifts, timeOff, appointments }
  }
  const [shifts, timeOff, appointments] = await Promise.all([
    readShifts(), readTimeOff(), readAppointments(),
  ])
  return { shifts, timeOff, appointments }
}
