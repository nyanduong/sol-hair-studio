import { AppointmentModel, APPOINTMENT_STATUSES, } from "./appointments.model.js";
import { StaffModel } from "../staff/staff.model.js";

// Đọc lịch theo customerId do service lấy từ identity.
export function findCustomerAppointments(customerId, {limit =20, cursor} = {}) {
    if(typeof customerId !=='string' || !/^[a-fA-F0-9]{24}$/.test(customerId)) {
        throw new TypeError('customerId must be a 24-character hexadecimal string')
    }
    if(!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new TypeError('limit must be an integer between 1 and 50')
    }
    const filter = { customerId }

    if (cursor !== undefined) {
        if(
            cursor === null ||
            typeof cursor !== 'object' ||
            Array.isArray(cursor) ||
            !(cursor.startAt instanceof Date) ||
            !Number.isFinite(cursor.startAt.getTime()) ||
            typeof cursor.id !== 'string' ||
            !/^[a-fA-F0-9]{24}$/.test(cursor.id)
        ) {
            throw new TypeError('cursor must contain a valid startAt Date and id')
        }

        filter.$or = [
            { startAt: { $lt: cursor.startAt } },
            {
                startAt: cursor.startAt,
                _id: { $lt: cursor.id },
            },
        ]
    }

    return AppointmentModel.find(filter)
    .sort({ startAt: -1, _id: -1 })
    .select({
        _id: 1,
        staffId: 1,
        staffNameSnapshot: 1,
        'items.serviceId': 1,
        'items.name': 1,
        'items.priceVnd': 1,
        'items.durationMinutes': 1,
        totalPriceVnd: 1,
        totalDurationMinutes: 1,
        startAt: 1,
        endAt: 1,
        timeZone: 1,
        localDate: 1,
        status: 1,
    })
    .limit(limit + 1)
    .lean()
}

export function findAppointmentStaffByAccountId(accountId) {
    if(typeof accountId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(accountId)) {
        throw new TypeError('accountId must be a 24-character hexadecimal string')
    }

    return StaffModel.findOne({ accountId })
    .select({
        _id: 1,
        isActive: 1,
    })
    .lean()
}


export function findStylistAppointments( staffId, { localDate, limit = 50, cursor} = {}) {
    if(typeof staffId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(staffId)) {
        throw new TypeError('staffId must be a 24-character hexadecimal string')
    }

    if ( typeof localDate !== 'string' ||!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
        throw new TypeError('localDate must be a valid YYYY-MM-DD date')
    }
    const date = new Date(`${localDate}T00:00:00.000Z`)

    if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== localDate) {
        throw new TypeError('localDate must be a valid YYYY-MM-DD date')
    }

    if(!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError('limit must be an integer between 1 and 100')
    }

    const filter = {
        staffId,
        localDate,
        status: {$in: ['confirmed', 'in_progress', 'completed']},
    }

    if(cursor !== undefined) {
        if(
            cursor === null ||
            typeof cursor !== 'object' ||
            Array.isArray(cursor) ||
            !(cursor.startAt instanceof Date) ||
            !Number.isFinite(cursor.startAt.getTime()) ||
            typeof cursor.id !== 'string' ||
            !/^[a-fA-F0-9]{24}$/.test(cursor.id)
        ) {
            throw new TypeError('cursor must contain a valid startAt Date and id')
        }

        filter.$or = [
            {startAt: {$gt: cursor.startAt}},
            {
                startAt: cursor.startAt,
                _id: {$gt: cursor.id},
            }
        ]
    }
    return AppointmentModel.find(filter)
    .sort({startAt: 1, _id: 1})
    .select({
        _id: 1,
        staffId: 1,
        staffNameSnapshot: 1,
        'customerSnapshot.displayName': 1,
        'customerSnapshot.phone': 1,
        'items.serviceId': 1,
        'items.name': 1,
        'items.priceVnd': 1,
        'items.durationMinutes': 1,
        totalPriceVnd: 1,
        totalDurationMinutes: 1,
        startAt: 1,
        endAt: 1,
        timeZone: 1,
        localDate: 1,
        status: 1,
    })
    .limit(limit + 1)
    .lean()
}

export function findOwnerAppointments({ localDate, staffId, status, limit = 50, cursor} = {}) {
    if(typeof localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
        throw new TypeError('localDate must be a valid YYYY-MM-DD date')
    }

    const date = new Date(`${localDate}T00:00:00.000Z`)

    if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== localDate) {
        throw new TypeError('localDate must be a valid YYYY-MM-DD date')
    }
    
    if(!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError('limit must be an integer between 1 and 100')
    }
    const filter = { localDate}
    if(staffId !== undefined) {
        if(typeof staffId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(staffId)) {
            throw new TypeError('staffId must be a 24-character hexadecimal string')
        }
        filter.staffId = staffId
    }

    if(status !== undefined) {
        if(typeof status !== 'string' || !APPOINTMENT_STATUSES.includes(status)) {
            throw new TypeError('status must be one of the following values: ' + APPOINTMENT_STATUSES.join(', '))
        }
        filter.status = status
    }
    if(cursor !== undefined) {
        if(
            cursor === null ||
            typeof cursor !== 'object' ||
            Array.isArray(cursor) ||
            !(cursor.startAt instanceof Date) ||
            !Number.isFinite(cursor.startAt.getTime()) ||
            typeof cursor.id !== 'string' ||
            !/^[a-fA-F0-9]{24}$/.test(cursor.id)
        ) {
            throw new TypeError('cursor must contain a valid startAt Date and id')
        }
        filter.$or = [
            {startAt: {$gt: cursor.startAt}},
            {
                startAt: cursor.startAt,
                _id: {$gt: cursor.id},
            }
        ]
    }

    return AppointmentModel.find(filter)
    .sort({startAt: 1, _id: 1})
    .select({
        _id: 1,
        customerId: 1,
        staffId: 1,
        staffNameSnapshot: 1,
        'customerSnapshot.displayName': 1,
        'customerSnapshot.phone': 1,
        'items.serviceId': 1,
        'items.name': 1,
        'items.priceVnd': 1,
        'items.durationMinutes': 1,
        totalPriceVnd: 1,
        totalDurationMinutes: 1,
        startAt: 1,
        endAt: 1,
        timeZone: 1,
        localDate: 1,
        status: 1,
    })
    .limit(limit + 1)
    .lean()
}