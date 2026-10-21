import mongoose from 'mongoose'
import { ServiceModel } from '../services/services.model.js'
import { StaffModel } from '../staff/staff.model.js'
import { StaffShiftModel } from '../staff/staff-shifts.model.js'
import { AccountModel } from '../auth/accounts.model.js'
import { AppointmentModel } from '../appointments/appointments.model.js'

export function findBookingServices(serviceIds, session = null) {
  return ServiceModel.find({ id: { $in: serviceIds }, isActive: true })
    .select('id name priceVnd durationMinutes bookingDurationMinutes -_id')
    .session(session)
    .lean()
}

export async function findEligibleStaff(serviceIds, staffId, session = null) {
  const staff = await StaffModel.find({
    isActive: true,
    serviceIds: { $all: serviceIds },
    ...(staffId ? { _id: staffId } : {}),
  })
    .select('_id accountId displayName')
    .sort({ _id: 1 })
    .session(session)
    .lean()
  const accounts = await AccountModel.find({
    _id: { $in: staff.map((item) => item.accountId) },
    status: 'active',
    roles: { $in: ['owner', 'stylist'] },
  })
    .select('_id')
    .session(session)
    .lean()
  const activeIds = new Set(accounts.map((item) => String(item._id)))
  return staff.filter((item) => activeIds.has(String(item.accountId)))
}

export async function findAvailabilityCalendar(staffIds, customerId, from, until, session = null) {
  // Sequential reads also work inside a transaction; session operations must not run in parallel.
  const shifts = await StaffShiftModel.find({
    staffId: { $in: staffIds },
    status: 'active',
    startAt: { $lt: until },
    endAt: { $gt: from },
  })
    .select('staffId startAt endAt -_id')
    .session(session)
    .lean()
  const timeOff = await mongoose.connection.db
    .collection('staff_time_off')
    .find(
      {
        staffId: { $in: staffIds },
        startAt: { $lt: until },
        endAt: { $gt: from },
      },
      { projection: { staffId: 1, startAt: 1, endAt: 1, _id: 0 }, ...(session ? { session } : {}) },
    )
    .toArray()
  const appointments = await AppointmentModel.find({
    $and: [
      { $or: [{ staffId: { $in: staffIds } }, ...(customerId ? [{ customerId }] : [])] },
      {
        $or: [
          {
            status: { $in: ['confirmed', 'completed'] },
            occupiedFrom: { $lt: until },
            occupiedUntil: { $gt: from },
          },
          // An overdue service remains busy even if its stored occupiedUntil is in the past.
          { status: 'in_progress', occupiedFrom: { $lt: until } },
        ],
      },
    ],
  })
    .select(
      'staffId customerId status startAt endAt startedAt completedAt estimatedEndAt occupiedFrom occupiedUntil -_id',
    )
    .session(session)
    .lean()
  return { shifts, timeOff, appointments }
}
