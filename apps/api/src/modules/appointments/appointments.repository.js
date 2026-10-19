import { AppointmentModel, APPOINTMENT_STATUSES, } from "./appointments.model.js";
import { StaffModel } from "../staff/staff.model.js";

// Dùng chung truy vấn, giữ scope theo role.
const APPOINTMENT_LIST_FIELDS = {
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
}
const APPOINTMENT_CONTACT_FIELDS = {
    'customerSnapshot.displayName': 1,
    'customerSnapshot.phone': 1,
}

// Kiểm tra ngày dùng chung cho Stylist và Owner.
function assertLocalDate(localDate) {
    if (typeof localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
        throw new TypeError('localDate must be a valid YYYY-MM-DD date')
    }
    const date = new Date(localDate + 'T00:00:00.000Z')
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== localDate) {
        throw new TypeError('localDate must be a valid YYYY-MM-DD date')
    }
    }

    function assertObjectId(value, field) {
    if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) {
        throw new TypeError(field + ' must be a 24-character hexadecimal string')
    }
}


function applyAppointmentCursor(filter, cursor, direction) {
    if (cursor === undefined) return
    if (
        cursor === null || typeof cursor !== 'object' || Array.isArray(cursor) ||
        !(cursor.startAt instanceof Date) || !Number.isFinite(cursor.startAt.getTime()) ||
        typeof cursor.id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(cursor.id)
    ) {
        throw new TypeError('cursor must contain a valid startAt Date and id')
    }
    const operator = direction === 1 ? '$gt' : '$lt'
    filter.$or = [
        { startAt: { [operator]: cursor.startAt } },
        { startAt: cursor.startAt, _id: { [operator]: cursor.id } },
    ]
}

function findAppointmentPage(filter, limit, direction, fields, maxLimit) {
    if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
        throw new TypeError('limit must be an integer between 1 and ' + maxLimit)
    }
    return AppointmentModel.find(filter)
        .sort({ startAt: direction, _id: direction })
        .select(fields)
        .limit(limit + 1)
        .lean()
}


// Đọc lịch theo customerId do service lấy từ identity.
export function findCustomerAppointments(customerId, {limit =20, cursor} = {}) {
    assertObjectId(customerId, 'customerId')
    const filter = { customerId }

    applyAppointmentCursor(filter, cursor, -1)

    return findAppointmentPage(filter, limit, -1, { ...APPOINTMENT_LIST_FIELDS }, 50)
}

export function findAppointmentStaffByAccountId(accountId) {
    assertObjectId(accountId, 'accountId')

    return StaffModel.findOne({ accountId })
    .select({
        _id: 1,
        isActive: 1,
    })
    .lean()
}

export function findStylistAppointments( staffId, { localDate, limit = 50, cursor} = {}) {
    assertObjectId(staffId, 'staffId')

    assertLocalDate(localDate)

    const filter = {
        staffId,
        localDate,
        status: {$in: ['confirmed', 'in_progress', 'completed']},
    }

    applyAppointmentCursor(filter, cursor, 1)
    return findAppointmentPage(filter, limit, 1, { ...APPOINTMENT_LIST_FIELDS, ...APPOINTMENT_CONTACT_FIELDS }, 100)
}

export function findOwnerAppointments({ localDate, staffId, status, limit = 50, cursor} = {}) {
    assertLocalDate(localDate)

    const filter = { localDate}
    if(staffId !== undefined) {
        assertObjectId(staffId, 'staffId')
        filter.staffId = staffId
    }

    if(status !== undefined) {
        if(typeof status !== 'string' || !APPOINTMENT_STATUSES.includes(status)) {
            throw new TypeError('status must be one of the following values: ' + APPOINTMENT_STATUSES.join(', '))
        }
        filter.status = status
    }
    applyAppointmentCursor(filter, cursor, 1)

    return findAppointmentPage(filter, limit, 1, { ...APPOINTMENT_LIST_FIELDS, ...APPOINTMENT_CONTACT_FIELDS, customerId: 1 }, 100)
}

export function findAppointmentDetail(appointmentId, {role, customerId, staffId} = {}) {
    assertObjectId(appointmentId, 'appointmentId')
    const filter = { _id: appointmentId }
    const fields = {
        ...APPOINTMENT_LIST_FIELDS,
        revision: 1,
        confirmedAt: 1,
    }
    if(role === 'customer') {
        assertObjectId(customerId, 'customerId')
        filter.customerId = customerId
    } else if(role === 'stylist') {
        assertObjectId(staffId, 'staffId')
        filter.staffId = staffId
        filter.status = {$in: ['confirmed', 'in_progress', 'completed']}
        Object.assign(fields, APPOINTMENT_CONTACT_FIELDS)
    } else if(role === 'owner') {
        Object.assign(fields, APPOINTMENT_CONTACT_FIELDS, {
            customerId: 1,
        })
    } else {
        throw new TypeError('A supported appointment role is required')
    }
    return AppointmentModel.findOne(filter)
    .select(fields)
    .lean()
}
