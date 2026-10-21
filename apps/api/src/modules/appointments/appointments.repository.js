import mongoose from 'mongoose'
import { AppointmentModel, APPOINTMENT_STATUSES, } from "./appointments.model.js";
import { StaffModel } from "../staff/staff.model.js";
import { AppointmentEventModel} from "./appointment-events.model.js";
import { CustomerModel } from "../customers/customers.model.js";
import { AccountModel } from '../auth/accounts.model.js'

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


function applyAppointmentCursor(filter, cursor, direction, timeField = 'startAt') {
    if (cursor === undefined) return
    if (
        cursor === null || typeof cursor !== 'object' || Array.isArray(cursor) ||
        !(cursor[timeField] instanceof Date) || !Number.isFinite(cursor[timeField].getTime()) ||
        typeof cursor.id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(cursor.id)
    ) {
        throw new TypeError('cursor must contain a valid ' + timeField + ' Date and id')
    }
    const operator = direction === 1 ? '$gt' : '$lt'
    filter.$or = [
        { [timeField]: { [operator]: cursor[timeField] } },
        { [timeField]: cursor[timeField], _id: { [operator]: new mongoose.Types.ObjectId(cursor.id) } },
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

export function findAppointmentStaffByAccountId(accountId, { session } = {}) {
    assertObjectId(accountId, 'accountId')

    return StaffModel.findOne({ accountId })
    .session(session ?? null)
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


export async function insertAppointmentEvent(event, { session} = {}) {
    if(!session || !session.inTransaction()) {
        throw new TypeError('An active transaction session is required')
    }
    // Truyền dạng mảng để create nhận options session rõ ràng.
    const [createdEvent] = await AppointmentEventModel.create(
        [event],
        { session },
    )

    return createdEvent
}




// Pre-read chỉ xác định Customer/Staff cần lấy guard.
export function findAppointmentCommandResources(appointmentId) {
    assertObjectId(appointmentId, 'appointmentId')

    return AppointmentModel.findById(appointmentId)
        .select({
        _id: 1,
        customerId: 1,
        staffId: 1,
        })
        .lean()
}

export function findAppointmentForUpdate(appointmentId, { session } = {} ) {
    assertObjectId(appointmentId, 'appointmentId')
    if(!session || !session.inTransaction()) {
        throw new TypeError('An active transaction session is required')
    }
    return AppointmentModel.findById(appointmentId)
    .session(session)
}

// Helper nội bộ chỉ phục vụ hai chuyển trạng thái từ confirmed.
async function persistClosedAppointment(appointment,{ expectedRevision, session },targetStatus,) {
    if (!session || !session.inTransaction()) {
        throw new TypeError('An active transaction session is required')
    }

    if (
        !(appointment instanceof AppointmentModel) ||
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 ||
        expectedRevision >= Number.MAX_SAFE_INTEGER ||
        appointment.status !== targetStatus ||
        appointment.revision !== expectedRevision + 1
    ) {
        throw new TypeError('A valid appointment transition document is required')
    }

    // Chạy document validators và hook trước khi ghi bằng query.
    await appointment.validate()

    // Chỉ ghi field của thao tác, không spread toàn document.
    const changes = {
        status: appointment.status,
        revision: appointment.revision,
        lastCommand: appointment.lastCommand.toObject(),
    }

    if (targetStatus === 'cancelled') {
        changes.cancelledAt = appointment.cancelledAt
    } else {
        changes.noShowAt = appointment.noShowAt
        changes.contactAttemptedAt = appointment.contactAttemptedAt
    }

    return AppointmentModel.findOneAndUpdate(
        {
            _id: appointment._id,
            customerId: appointment.customerId,
            staffId: appointment.staffId,
            revision: expectedRevision,
            status: 'confirmed',
            startedAt: { $exists: false },
        },
        {
            $set: changes,
        },
        {
            session,
            returnDocument: 'after',
            runValidators: true,
        },
    ).lean()
}

// Ghi hủy lịch khi phiên bản và trạng thái cũ vẫn còn đúng.
export function persistCancelledAppointment(appointment, options = {}) {
    return persistClosedAppointment(appointment, options, 'cancelled')
}

export async function findAppointmentCommandActor(accountId, authRevision, { session } = {}) {
    assertObjectId(accountId, 'accountId')
    if(!session || !session.inTransaction()) {
        throw new TypeError('An active transaction session is required')
    }

    if(!Number.isSafeInteger(authRevision) || authRevision < 0) {
        throw new TypeError('authRevision must be a non-negative safe integer')
    }

    // Chỉ nhận tài khoản active và phiên vẫn khớp Auth.
    const account = await AccountModel.findOne({
        _id: accountId,
        status: 'active',
        authRevision,
    })
    .select({ _id: 1, roles: 1, authRevision: 1 })
    .session(session)
    .lean()

    if (!account) return null

    // Không dùng customerId cũ từ đầu request để quyết định quyền ghi.
    const customer = await CustomerModel.findOne({
        accountId: account._id,
    })
    .select({ _id: 1 })
    .session(session)
    .lean()

    return {
        accountId: String(account._id),
        roles: account.roles,
        authRevision: account.authRevision,
        ...(customer ? { customerId: String(customer._id) } : {}),
    }
}

// Khóa và tăng số revision đặt lịch của khách hàng trong transaction.
export async function lockAndBumpCustomerBookingRevision(customerId, { session } = {}) {
    assertObjectId(customerId, 'customerId')
    if(!session || !session.inTransaction()) {
        throw new TypeError('An active transaction session is required')
    }
    const customer = await CustomerModel.findById(customerId)
        .select({ _id: 1, bookingRevision: 1 })
        .session(session)
        .lean()
    if(!customer) {
        return { status: 'not_found', customer: null }
    }
    if(!Number.isSafeInteger(customer.bookingRevision) || customer.bookingRevision < 0 || customer.bookingRevision >= Number.MAX_SAFE_INTEGER) {
        return { status: 'limit_exceeded', customer }
    }
    const updated = await CustomerModel.findOneAndUpdate(
        {
            _id: customer._id,
            bookingRevision: customer.bookingRevision,
        },
        {
            $inc: { bookingRevision: 1 },
        },
        {
            session,
            returnDocument: 'after',
            runValidators: true,
        }
    )
    .select({ _id: 1, bookingRevision: 1})
    .lean()

    if(!updated) {
        return { status: 'conflict', customer: null }
    }
    return { status: 'ok', customer: updated }
}

// Writer no-show dùng cùng CAS nhưng có field ghi riêng.
export function persistNoShowAppointment(appointment, options = {}) {
    return persistClosedAppointment(appointment, options, 'no_show')
}
// Kiem ngu canh va lay lich su trong cung query; khong nhan customerId tu client.
export async function findAppointmentServiceHistory(appointmentId,{ role, staffId, limit = 20, cursor } = {}) {
    assertObjectId(appointmentId, 'appointmentId')
    if (role !== 'owner' && role !== 'stylist') {
        throw new TypeError('An owner or stylist scope is required')
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new TypeError('limit must be an integer between 1 and 50')
    }
    const context = { _id: new mongoose.Types.ObjectId(appointmentId) }
    if (role === 'stylist') {
        assertObjectId(staffId, 'staffId')
        context.staffId = new mongoose.Types.ObjectId(staffId)
        context.status = { $in: ['confirmed', 'in_progress', 'completed'] }
    }
    const historyFilter = {
        status: 'completed',
        $expr: { $eq: ['$customerId', '$$contextCustomerId'] },
    }
    applyAppointmentCursor(historyFilter, cursor, -1, 'completedAt')
    const [result] = await AppointmentModel.aggregate([
        { $match: context },
        { $lookup: {
        from: AppointmentModel.collection.name,
        let: { contextCustomerId: '$customerId' },
        pipeline: [
            { $match: historyFilter },
            { $sort: { completedAt: -1, _id: -1 } },
            { $limit: limit + 1 },
            { $project: { ...APPOINTMENT_LIST_FIELDS, completedAt: 1 } },
        ],
        as: 'items',
        } },
        { $project: { _id: 0, items: 1 } },
    ])
    return result ?? null
}

// CAS doi lich: giu customer/snapshot va so Staff cu truoc khi ghi Staff moi.
export async function persistRescheduledAppointment(appointment, { expectedRevision, previousStaffId, session } = {},) {
    if (!session?.inTransaction()) throw new TypeError('An active transaction session is required')
    assertObjectId(previousStaffId, 'previousStaffId')
    if (
        !(appointment instanceof AppointmentModel) || appointment.status !== 'confirmed' ||
        !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
        expectedRevision >= Number.MAX_SAFE_INTEGER || appointment.revision !== expectedRevision + 1
    ) throw new TypeError('A valid reschedule document is required')
    await appointment.validate()
    return AppointmentModel.findOneAndUpdate({
        _id: appointment._id, customerId: appointment.customerId, staffId: previousStaffId,
        revision: expectedRevision, status: 'confirmed', startedAt: { $exists: false },
    }, { $set: {
        staffId: appointment.staffId,
        staffNameSnapshot: appointment.staffNameSnapshot,
        startAt: appointment.startAt, endAt: appointment.endAt,
        occupiedFrom: appointment.occupiedFrom, occupiedUntil: appointment.occupiedUntil,
        localDate: appointment.localDate, timeZone: appointment.timeZone,
        lastRescheduledAt: appointment.lastRescheduledAt,
        revision: appointment.revision, lastCommand: appointment.lastCommand.toObject(),
    } }, { session, returnDocument: 'after', runValidators: true }).lean()
}

// Shared lifecycle CAS writer; planned times and snapshots are never updated.
async function persistLifecycleAppointment(appointment, { expectedRevision, session, previousStartedAt }, operation) {
    if (!session?.inTransaction()) throw new TypeError('An active transaction session is required')
    if (!['start', 'complete', 'eta', 'correct_start'].includes(operation)) throw new TypeError('Unsupported lifecycle operation')
    const completing = operation === 'complete'
    const updatingEta = operation === 'eta'
    const correctingStart = operation === 'correct_start'
    const sourceInProgress = completing || updatingEta || correctingStart
    const targetStatus = correctingStart ? 'confirmed' : completing ? 'completed' : 'in_progress'
    if (correctingStart && (!(previousStartedAt instanceof Date) || !Number.isFinite(previousStartedAt.getTime()))) throw new TypeError('Previous actual start is required')
    if (!(appointment instanceof AppointmentModel) || appointment.status !== targetStatus ||
        !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER ||
        appointment.revision !== expectedRevision + 1) throw new TypeError('A valid lifecycle transition is required')
    await appointment.validate()
    const changes = {
        status: appointment.status,
        ...(!correctingStart ? { startedAt: appointment.startedAt } : {}),
        occupiedFrom: appointment.occupiedFrom, occupiedUntil: appointment.occupiedUntil,
        revision: appointment.revision, lastCommand: appointment.lastCommand.toObject(),
        ...(completing ? { completedAt: appointment.completedAt } : {}),
        ...(updatingEta ? { estimatedEndAt: appointment.estimatedEndAt } : {}),
    }
    return AppointmentModel.findOneAndUpdate({
        _id: appointment._id, customerId: appointment.customerId, staffId: appointment.staffId,
        revision: expectedRevision, status: sourceInProgress ? 'in_progress' : 'confirmed',
        startedAt: sourceInProgress ? (correctingStart ? previousStartedAt : appointment.startedAt) : { $exists: false },
        ...(sourceInProgress ? { completedAt: { $exists: false } } : {}),
    }, {
        $set: changes,
        ...(correctingStart ? { $unset: { startedAt: 1, completedAt: 1, estimatedEndAt: 1 } } : completing ? { $unset: { estimatedEndAt: 1 } } : {}),
    }, { session, returnDocument: 'after', runValidators: true }).lean()
}

export function persistStartedAppointment(appointment, options) {
    return persistLifecycleAppointment(appointment, options, 'start')
}

export function persistCompletedAppointment(appointment, options) {
    return persistLifecycleAppointment(appointment, options, 'complete')
}

export function persistAppointmentEta(appointment, options) {
    return persistLifecycleAppointment(appointment, options, 'eta')
}

// Read-only warnings under the same guards/session; never update affected appointments.
export function findAppointmentConflictCandidates(appointment, until, { session, includeCompleted = false } = {}) {
    if (!session?.inTransaction()) throw new TypeError('An active transaction session is required')
    return AppointmentModel.find({
        _id: { $ne: appointment._id }, status: { $in: ['confirmed', 'in_progress', ...(includeCompleted ? ['completed'] : [])] },
        occupiedFrom: { $lt: until },
        $or: [{ staffId: appointment.staffId }, { customerId: appointment.customerId }],
    }).select('_id staffId customerId status startAt endAt startedAt completedAt estimatedEndAt occupiedFrom occupiedUntil')
        .sort({ startAt: 1, _id: 1 }).session(session).lean()
}

export function persistCorrectedStartAppointment(appointment, options) {
    return persistLifecycleAppointment(appointment, options, 'correct_start')
}
