import { AppointmentModel } from "./appointments.model.js";

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
