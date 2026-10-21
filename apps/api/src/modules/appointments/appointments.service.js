import { findAvailabilityCalendar } from '../availability/availability.repository.js'
import { AvailabilityError, assertAppointmentSlotAvailable, appointmentInterval } from '../availability/availability.service.js'
import { toHoChiMinhDate } from '../staff/staff-shifts.model.js'
import {
    findCustomerAppointments,
    findStylistAppointments,
    findAppointmentStaffByAccountId,
    findOwnerAppointments,
    findAppointmentDetail,
    findAppointmentCommandActor,
    findAppointmentForUpdate,
    lockAndBumpCustomerBookingRevision,
    persistCancelledAppointment,
    persistNoShowAppointment,
    persistRescheduledAppointment,
    persistStartedAppointment,
    persistCompletedAppointment,
    insertAppointmentEvent,
    findAppointmentCommandResources,
    findAppointmentServiceHistory,
} from "./appointments.repository.js"
import { APPOINTMENT_STATUSES } from "./appointments.model.js"
import { createHash } from 'node:crypto'
import {lockAndBumpStaffBookingRevision} from '../staff/staff.repository.js'
import mongoose from 'mongoose'


// Lỗi nghiệp vụ; controller sẽ chuyển thành HTTP response.
export class AppointmentError extends Error {
    constructor(message, { code = 'APPOINTMENT_ERROR', status = 400 } = {}) {
        super(message)
        this.name = 'AppointmentError'
        this.code = code
        this.status = status
    }
}

// Giải mã cursor phân trang (base64url -> startAt, id).
function decodeAppointmentCursor(token, timeField = 'startAt') {
    if(token === undefined) return undefined

    if(
        typeof token !== 'string' ||
        token.length === 0 ||
        token.length > 512 ||
        !/^[A-Za-z0-9_-]+$/.test(token)
    ) {
        throw new AppointmentError('Cursor Invalid', {
            code: 'INVALID_CURSOR',
            status: 400,
        })
    }

    try {
        const decoded = Buffer.from(token, 'base64url')
        if (decoded.toString('base64url') !== token) {
            throw new Error('Invalid cursor encoding')
        }

        const payload = JSON.parse(decoded.toString('utf8'))

        if (
            payload === null ||
            typeof payload !== 'object' ||
            Array.isArray(payload) ||
            Object.keys(payload).length !== 2 ||
            typeof payload[timeField] !== 'string' ||
            typeof payload.id !== 'string' ||
            !/^[a-fA-F0-9]{24}$/.test(payload.id)
        ) {
            throw new Error('Invalid cursor payload')
        }

        const timestamp = new Date(payload[timeField])

        if ( !Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== payload[timeField]) {
            throw new Error('Invalid cursor timestamp')
        }
        return {
            [timeField]: timestamp,
            id: payload.id,
        }

    } catch {
        throw new AppointmentError('Invalid cursor.', {
            code: 'INVALID_CURSOR',
            status: 400,
        })
    }
}

// Validate và chuẩn hóa query params phân trang chung.
function parseAppointmentListQuery(query, allowedKeys, defaultLimit, maxLimit, withDate, timeField = 'startAt') {
    if (Object.keys(query).some(key => !allowedKeys.includes(key))) {
        throw new AppointmentError('Query not supported', { code: 'INVALID_QUERY', status: 400 })
    }
    if (withDate) {
        const value = query.localDate
        const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(value + 'T00:00:00.000Z') : null
        if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new AppointmentError('localDate must be a valid YYYY-MM-DD date', {
            code: 'INVALID_LOCAL_DATE', status: 400,
        })
        }
    }
    let limit = defaultLimit
    if (query.limit !== undefined) {
        if (typeof query.limit !== 'string' || !/^[1-9]\d{0,2}$/.test(query.limit) || Number(query.limit) > maxLimit) {
        throw new AppointmentError('limit must be an integer between 1 and ' + maxLimit, {
            code: 'INVALID_LIMIT', status: 400,
        })
        }
        limit = Number(query.limit)
    }
    return {
        ...(withDate ? { localDate: query.localDate } : {}),
        limit, cursor: decodeAppointmentCursor(query.cursor, timeField),
    }
}

// Kiểm tra quyền vai trò của người dùng.
function requireAppointmentRole(identity, role) {
    if (!identity) {
        throw new AppointmentError('Need Login', { code: 'UNAUTHORIZED', status: 401 })
    }
    if (!Array.isArray(identity.roles) || !identity.roles.includes(role)) {
        throw new AppointmentError('You are not authorized to access this list', {
        code: 'FORBIDDEN', status: 403,
        })
    }
}

// Đóng gói danh sách thành response phân trang kèm nextCursor.
function buildAppointmentPage(appointments, limit, role, timeField = 'startAt') {
    const hasNextPage = appointments.length > limit
    const page = appointments.slice(0, limit)
    let nextCursor = null
    if (hasNextPage) {
        const last = page[page.length - 1]
        nextCursor = Buffer.from(JSON.stringify({
        [timeField]: last[timeField].toISOString(), id: String(last._id),
        }), 'utf8').toString('base64url')
    }
    return {
        items: page.map(appointment => timeField === 'completedAt'
          ? { ...toAppointmentListItem(appointment, 'customer'), completedAt: appointment.completedAt.toISOString() }
          : toAppointmentListItem(appointment, role)),
        pagination: { limit, hasNextPage, nextCursor },
    }
}

// Chuẩn hóa dữ liệu lịch hẹn trả về theo từng vai trò.
function toAppointmentListItem(appointment, role) {
    const item = {
        id: String(appointment._id),
        staffId: String(appointment.staffId),
        staffNameSnapshot: appointment.staffNameSnapshot,
        items: appointment.items.map(service => ({
        serviceId: service.serviceId, name: service.name,
        priceVnd: service.priceVnd, durationMinutes: service.durationMinutes,
        })),
        totalPriceVnd: appointment.totalPriceVnd,
        totalDurationMinutes: appointment.totalDurationMinutes,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        timeZone: appointment.timeZone,
        localDate: appointment.localDate,
        status: appointment.status,
    }
    if (role === 'stylist' || role === 'owner') {
        item.customerSnapshot = {
        displayName: appointment.customerSnapshot.displayName,
        phone: appointment.customerSnapshot.phone,
        }
    }
    if (role === 'owner') item.customerId = String(appointment.customerId)
    return item
}

// Validation body, allowlist và revision dùng chung.
function parseAppointmentCommandBody(body, allowedKeys) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new AppointmentError('Body must be a JSON object.', {
        code: 'INVALID_REQUEST_BODY',
        status: 400,
        })
    }

    if (Object.keys(body).some(key => !allowedKeys.includes(key))) {
        throw new AppointmentError('Body contains unsupported fields.', {
        code: 'INVALID_REQUEST_BODY',
        status: 400,
        })
    }

    if (
        !Number.isSafeInteger(body.expectedRevision) ||
        body.expectedRevision < 0
    ) {
        throw new AppointmentError('expectedRevision must be a non-negative integer.', {
        code: 'INVALID_REVISION',
        status: 400,
        })
    }

    return { expectedRevision: body.expectedRevision }
}

// Validate query params lấy danh sách lịch cho khách hàng.
export function parseCustomerAppointmentQuery(query = {}) {
    return parseAppointmentListQuery(query, ['limit', 'cursor'], 20, 50, false)
}

// Lấy danh sách lịch hẹn của khách hàng hiện tại.
export async function listCustomerAppointments(identity, {limit = 20, cursor} = {}) {
    requireAppointmentRole(identity, 'customer')

    if(!Number.isInteger(limit) || limit < 1 ||  limit > 50) {
        throw new AppointmentError('Limit must be an integer between 1 and 50', {
            code: 'INVALID_LIMIT',
            status: 400,
        })
    }
    // Không có hồ sơ vẫn trả cùng cấu trúc phân trang.
    if(identity.customerId === undefined) {
        return buildAppointmentPage([], limit, 'customer')
    }

    const appointments = await findCustomerAppointments(identity.customerId, {limit, cursor})

    return buildAppointmentPage(appointments, limit, 'customer')
}

// Validate query params lấy danh sách lịch cho stylist.
export function parseStylistAppointmentQuery(query = {}) {
    return parseAppointmentListQuery(query, ['localDate', 'limit', 'cursor'], 50, 100, true)
}

// Lấy danh sách lịch hẹn theo ngày của stylist.
export async function listStylistAppointments( identity, { localDate, limit = 50, cursor} = {} ) {
    requireAppointmentRole(identity, 'stylist')

    const staff = await findAppointmentStaffByAccountId(identity.accountId)

    if(!staff) {
        throw new AppointmentError('Staff not found', {
            code: 'STAFF_NOT_FOUND',
            status: 404,
        })
    }

    const appointments = await findStylistAppointments(
        String(staff._id),
        {
            localDate,
            limit,
            cursor,
        },
    )
    return buildAppointmentPage(appointments, limit, 'stylist')
}

// Validate query params lấy danh sách lịch cho chủ tiệm.
export function parseOwnerAppointmentQuery(query = {}) {
    const allowedKeys =['localDate', 'staffId', 'status', 'limit', 'cursor']
    const options = parseAppointmentListQuery(query, allowedKeys, 50, 100, true)

    if(query.staffId !== undefined) {
        if(typeof query.staffId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(query.staffId)) {
            throw new AppointmentError('staffId must be a 24-character hexadecimal string', {
                code: 'INVALID_STAFF_ID',
                status: 400,
            })
        }
        options.staffId = query.staffId
    }

    if(query.status !== undefined) {
        if(typeof query.status !== 'string' || !APPOINTMENT_STATUSES.includes(query.status)) {
            throw new AppointmentError('status must be one of the following values: ' + APPOINTMENT_STATUSES.join(', '), {
                code: 'INVALID_STATUS',
                status: 400,
            })
        }
        options.status = query.status
    }
    return options
}

// Lấy danh sách lịch hẹn toàn hệ thống theo bộ lọc cho owner.
export async function listOwnerAppointments(identity, { localDate, staffId, status, limit = 50, cursor} = {}) {
    requireAppointmentRole(identity, 'owner')
    const appointments = await findOwnerAppointments({
        localDate,
        staffId,
        status,
        limit,
        cursor,
    })
    return buildAppointmentPage(appointments, limit, 'owner')
}

// Điều hướng lấy danh sách lịch hẹn theo vai trò người dùng.
export async function listAppointments(identity, query = {}) {
    if(!identity) {
        throw new AppointmentError('Need Login', {
            code: 'UNAUTHORIZED',
            status: 401,
        })
    }
    const roles = Array.isArray(identity.roles) ? identity.roles : []

    if (roles.includes('owner')) {
        const options = parseOwnerAppointmentQuery(query)
        return listOwnerAppointments(identity, options)
    }

    if(roles.includes('stylist')) {
        const options = parseStylistAppointmentQuery(query)
        return listStylistAppointments(identity, options)
    }

    if(roles.includes('customer')) {
        const options = parseCustomerAppointmentQuery(query)
        return listCustomerAppointments(identity, options)
    }
    throw new AppointmentError('You are not authorized to access this list', {
        code: 'FORBIDDEN',
        status: 403,
    })
}

export async function getAppointmentDetail(identity, appointmentId) {
    if(!identity) {
        throw new AppointmentError('Need Login', {
            code: 'UNAUTHORIZED',
            status: 401,
        })
    }

    const roles = Array.isArray(identity.roles) ? identity.roles : []
    const role = ['owner', 'stylist', 'customer'].find(value => roles.includes(value))

    if(!role) {
        throw new AppointmentError('You are not authorized to access this list', {
            code: 'FORBIDDEN',
            status: 403,
        })
    }
    if( typeof appointmentId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(appointmentId)) {
        throw new AppointmentError('appointmentId must be a 24-character hexadecimal string', {
            code: 'INVALID_APPOINTMENT_ID',
            status: 400,
        })
    }
    const scope = { role }

    if(role === 'customer') {
        if(identity.customerId === undefined) {
            throw new AppointmentError('Customer not found', {
                code: 'APPOINTMENT_NOT_FOUND',
                status: 404,
            })
        }
        scope.customerId = identity.customerId
    } else if(role === 'stylist') {
        const staff = await findAppointmentStaffByAccountId(identity.accountId)
        if(!staff) {
            throw new AppointmentError('Staff not found', {
                code: 'STAFF_NOT_FOUND',
                status: 404,
            })
        }
        scope.staffId = String(staff._id)
    }
    const appointment = await findAppointmentDetail(appointmentId, scope)

    if(!appointment) {
        throw new AppointmentError('Appointment not found', {
            code: 'APPOINTMENT_NOT_FOUND',
            status: 404,
        })
    }
    return {
        ...toAppointmentListItem(appointment, role),
        revision: appointment.revision,
        confirmedAt: appointment.confirmedAt.toISOString(),
    }
}

export function parseCancelAppointmentInput(body) {
  const input = parseAppointmentCommandBody(body, ['expectedRevision', 'reason'])
  const reason = parseAppointmentCommandReason(body.reason)
  if (reason !== undefined) input.reason = reason
  return input
}

// Kiểm tra key của một thao tác; retry phải giữ nguyên key.
export function parseAppointmentCommandKey(value) {
    if (
        typeof value !== 'string' ||
        value.length < 16 ||
        value.length > 100 ||
        value.trim().length === 0
    ) {
        throw new AppointmentError('Key must contain between 16 and 100 characters.', {
        code: 'INVALID_COMMAND_KEY',
        status: 400,
        })
    }
    return value
}

// Hash intent đã validate, không đưa thời điểm server vào hash.
function hashAppointmentCommand(operation, appointmentId, input) {
    if (!['cancel', 'no_show', 'reschedule', 'start', 'complete'].includes(operation)) throw new TypeError('Unsupported appointment operation')
    const intent = { operation, appointmentId: appointmentId.toLowerCase(), expectedRevision: input.expectedRevision }
    if (operation === 'cancel') intent.reason = input.reason ?? null
    else if (operation === 'no_show') intent.contactAttemptedAt = input.contactAttemptedAt.toISOString()
    else if (operation === 'reschedule') {
        intent.startAt = input.startAt?.toISOString() ?? null
        intent.staffId = input.staffId ?? null
        intent.reason = input.reason ?? null
    }
    return createHash('sha256').update(JSON.stringify(intent), 'utf8').digest('hex')
}

function assertCustomerOwnerAppointmentAccess(identity, appointment) {
    if (!identity) {
        throw new AppointmentError('Need Login', {
        code: 'UNAUTHORIZED',
        status: 401,
        })
    }
    const roles = Array.isArray(identity.roles) ? identity.roles : []
    // Owner có quyền xử lý lịch toàn tiệm.
    if (roles.includes('owner')) {
        return 'owner'
    }
    // Stylist không có quyền hủy; Customer chỉ hủy lịch của mình.
    if (!roles.includes('customer')) {
        throw new AppointmentError('You are not authorized to manage this appointment', {
            code: 'FORBIDDEN',
            status: 403,
        })
    }
    if (
        identity.customerId === undefined ||
        String(appointment.customerId) !== identity.customerId
    ) {
        throw new AppointmentError('Appointment not found', {
        code: 'APPOINTMENT_NOT_FOUND',
        status: 404,
        })
    }
    return 'customer'
}

// Điều kiện chung cho lệnh mới chuyển khỏi confirmed.
function assertAppointmentStateCommand(appointment, expectedRevision, expectedStatus = 'confirmed') {
    if (appointment.revision !== expectedRevision) {
        throw new AppointmentError('The schedule has changed. Please reload!', {
            code: 'APPOINTMENT_REVISION_CONFLICT',
            status: 409,
        })
    }

    if (appointment.status !== expectedStatus || (expectedStatus === 'confirmed' && appointment.startedAt !== undefined)) {
        throw new AppointmentError('The status schedule is not permitted to operate.', {
            code: 'APPOINTMENT_STATE_CONFLICT',
            status: 409,
        })
    }

    if (
        !Number.isSafeInteger(appointment.revision) ||
        appointment.revision < 0 ||
        appointment.revision >= Number.MAX_SAFE_INTEGER
    ) {
        throw new AppointmentError('Revision has reached the safe integer limit.', {
            code: 'APPOINTMENT_REVISION_LIMIT',
            status: 409,
        })
    }
}

// Chỉ kiểm tra cho lệnh mới, sau khi đã xử lý trường hợp retry.
function assertAppointmentCanBeCancelled(appointment, role, input, now) {

    assertAppointmentStateCommand(appointment, input.expectedRevision)
    const remainingMs = appointment.startAt.getTime() - now.getTime()
    const cutoffMs = 2 * 60 * 60 * 1000

    // Đúng mốc 2 giờ vẫn được hủy.
    if (role === 'customer' && remainingMs < cutoffMs) {
        throw new AppointmentError('Cancellations are only permitted at least 2 hours before the scheduled appointment time!', {
            code: 'CANCELLATION_CUTOFF',
            status: 409,
        })
    }

    // Owner xử lý dưới mốc 2 giờ phải ghi lý do.
    if (role === 'owner' && remainingMs < cutoffMs && !input.reason) {
        throw new AppointmentError('A reason is required for cancellations made shortly before or after the scheduled appointment time!', {
            code: 'CANCELLATION_REASON_REQUIRED',
            status: 400,
        })
    }
}

// Chỉ nhận diện receipt lệnh gần nhất, sau khi đã kiểm quyền hiện tại.
function isAppointmentCommandReplay(appointment, { actorId, key, hash },){
    const previous = appointment.lastCommand

    if (!previous || String(previous.actorId) !== actorId || previous.key !== key) {
        return false
    }

    // Cùng actor/key nhưng intent khác là dùng lại key không hợp lệ.
    if (previous.hash !== hash) {
        throw new AppointmentError('Key has already been used for a different request.', {
        code: 'COMMAND_KEY_CONFLICT',
        status: 409,
        })
    }

    // Receipt phải còn khớp revision hiện tại.
    if (previous.resultRevision !== appointment.revision) {
        throw new AppointmentError('Unable to verify the previous command result.', {
        code: 'COMMAND_RECEIPT_CONFLICT',
        status: 409,
        })
    }

    return true
}

// Chỉ lấy các field audit được baseline cho phép.
function buildAppointmentEventSnapshot(appointment) {
    const fields = [
        'status',
        'startAt',
        'endAt',
        'occupiedFrom',
        'occupiedUntil',
        'startedAt',
        'completedAt',
        'estimatedEndAt',
        'staffId',
    ]
    const snapshot = {}

    for (const field of fields) {
        const value = appointment[field]

        // Field optional thiếu thì không đưa vào event.
        if (value === undefined) continue

        // Copy Date để snapshot trước không đổi theo document đang xử lý.
        snapshot[field] = value instanceof Date
        ? new Date(value.getTime())
        : value
    }

    return snapshot
}

// Customer first, then sorted and deduplicated old/target Staff guards.
async function loadGuardedAppointmentForCommand(identity, appointmentId, resources, session, operation, targetStaffId) {
    if (!['cancel', 'no_show', 'reschedule', 'start', 'complete'].includes(operation)) throw new TypeError('Unsupported appointment operation')
    const customerGuard = await lockAndBumpCustomerBookingRevision(String(resources.customerId), { session })
    if (customerGuard.status !== 'ok') throw new AppointmentError('Cannot retrieve the Customer guard!', { code: 'CUSTOMER_GUARD_CONFLICT', status: 409 })
    const staffIds = [...new Set([String(resources.staffId), ...(targetStaffId ? [targetStaffId] : [])])].sort()
    for (const staffId of staffIds) {
        const guard = await lockAndBumpStaffBookingRevision(staffId, session)
        if (guard.status !== 'ok') throw new AppointmentError('Cannot obtain the Staff guard!', { code: 'STAFF_GUARD_CONFLICT', status: 409 })
    }
    const actor = await findAppointmentCommandActor(identity.accountId, identity.authRevision, { session })
    if (!actor) throw new AppointmentError('The session is no longer valid!', { code: 'UNAUTHORIZED', status: 401 })
    const appointment = await findAppointmentForUpdate(appointmentId, { session })
    if (!appointment) throw new AppointmentError('Appointment not found', { code: 'APPOINTMENT_NOT_FOUND', status: 404 })
    let role
    if (operation === 'no_show') { requireAppointmentRole(actor, 'owner'); role = 'owner' }
    else if (operation === 'start' || operation === 'complete') {
        role = actor.roles.includes('owner') ? 'owner' : 'stylist'
        if (role === 'stylist') {
        requireAppointmentRole(actor, 'stylist')
        const staff = await findAppointmentStaffByAccountId(actor.accountId, { session })
        if (!staff || String(staff._id) !== String(appointment.staffId)) {
            throw new AppointmentError('Appointment not found', { code: 'APPOINTMENT_NOT_FOUND', status: 404 })
        }
        }
    } else role = assertCustomerOwnerAppointmentAccess(actor, appointment)
    if (String(appointment.customerId) !== String(resources.customerId) || String(appointment.staffId) !== String(resources.staffId)) {
        throw new AppointmentError('Appointment resources have changed.', { code: 'APPOINTMENT_RESOURCES_CHANGED', status: 409 })
    }
    return { appointment, actor, role }
}

// Xử lý một lần hủy bên trong transaction do caller mở.
// Guard, replay, CAS va audit dung chung cho huy/no-show.
// One guarded transaction pipeline for appointment commands.
async function executeAppointmentCommand(session, { identity, appointmentId, resources, input, key, hash, operation }) {
    const { appointment, actor, role } = await loadGuardedAppointmentForCommand(
        identity, appointmentId, resources, session, operation, operation === 'reschedule' ? input.staffId : undefined,
    )
    if (isAppointmentCommandReplay(appointment, { actorId: actor.accountId, key, hash })) return { appointment: appointment.toObject(), role }
    const now = new Date()
    const before = buildAppointmentEventSnapshot(appointment)
    const previousStaffId = String(appointment.staffId)
    if (operation === 'complete') {
        assertAppointmentStateCommand(appointment, input.expectedRevision, 'in_progress')
        if (!(appointment.startedAt instanceof Date) || appointment.startedAt > now) {
        throw new AppointmentError('Completion cannot precede actual start.', { code: 'INVALID_COMPLETION_TIME', status: 409 })
        }
        appointment.status = 'completed'
        appointment.completedAt = now
        appointment.occupiedFrom = appointment.startedAt
        appointment.occupiedUntil = new Date(now.getTime() + 10 * 60_000)
        appointment.estimatedEndAt = undefined
    } else if (operation === 'start') {
        assertAppointmentStateCommand(appointment, input.expectedRevision)
        await assertAppointmentCanStart(appointment, session, now)
        appointment.status = 'in_progress'
        appointment.startedAt = now
        appointment.occupiedFrom = new Date(Math.min(appointment.startAt.getTime(), now.getTime()))
        appointment.occupiedUntil = new Date(appointment.endAt.getTime() + 10 * 60_000)
    } else if (operation === 'reschedule') {
        const candidate = prepareAppointmentReschedule(appointment, role, input, now)
        let available
        try {
        available = await assertAppointmentSlotAvailable({
            staffId: candidate.staffId, customerId: String(appointment.customerId),
            serviceIds: appointment.items.map(item => item.serviceId), durationMinutes: appointment.totalDurationMinutes,
            startAt: candidate.startAt, owner: role === 'owner', excludeAppointmentId: String(appointment._id),
        }, { session, now })
        } catch (error) {
        if (error instanceof AvailabilityError) throw new AppointmentError(error.message, { code: error.code, status: error.status })
        throw error
        }
        Object.assign(appointment, candidate, { lastRescheduledAt: now })
        if (candidate.staffId !== previousStaffId) appointment.staffNameSnapshot = available.displayName
    } else if (operation === 'cancel') {
        assertAppointmentCanBeCancelled(appointment, role, input, now)
        appointment.status = 'cancelled'; appointment.cancelledAt = now
    } else {
        assertAppointmentCanBeMarkedNoShow(appointment, input, now)
        appointment.status = 'no_show'; appointment.noShowAt = now; appointment.contactAttemptedAt = input.contactAttemptedAt
    }
    appointment.revision = input.expectedRevision + 1
    appointment.lastCommand = { key, actorId: actor.accountId, hash, resultRevision: appointment.revision }
    const persist = operation === 'complete' ? persistCompletedAppointment : operation === 'start' ? persistStartedAppointment : operation === 'reschedule' ? persistRescheduledAppointment : operation === 'cancel' ? persistCancelledAppointment : persistNoShowAppointment
    const updated = await persist(appointment, { expectedRevision: input.expectedRevision, previousStaffId, session })
    if (!updated) throw new AppointmentError('Appointment has changed. Reload it before trying again.', { code: 'APPOINTMENT_REVISION_CONFLICT', status: 409 })
    await insertAppointmentEvent({
        appointmentId: updated._id, actorId: actor.accountId, revision: updated.revision,
        kind: operation === 'start' ? 'started' : operation === 'reschedule' ? 'rescheduled' : updated.status, occurredAt: now,
        before, after: buildAppointmentEventSnapshot(updated),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
    }, { session })
    return { appointment: updated, role }
}

// Chạy lệnh trong transaction; chỉ trả kết quả sau khi commit.
async function runAppointmentTransaction(operation) {
    try {
        return await mongoose.connection.transaction(operation, {
            readPreference: 'primary',
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            maxCommitTimeMS: 5000,
            timeoutMS: 15000,
        })
    } catch (error) {
        // Không báo thất bại chắc chắn khi kết quả commit chưa xác định.
        if (
            error?.hasErrorLabel?.('UnknownTransactionCommitResult') ||
            error?.name === 'MongoOperationTimeoutError'
        ) {
        throw new AppointmentError(
            'Result not yet confirmed. Please check your schedule and keep the same key when retrying!',
            {
                code: 'APPOINTMENT_COMMAND_RESULT_UNKNOWN',
                status: 503,
            },
        )
        }

        throw error
    }
}

// Hủy lịch theo quyền, có guard, CAS, receipt và audit.
export function cancelAppointment(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('cancel', identity, appointmentId, body, commandKey)
}

// No-show chi Owner; khong tu dong danh dau bang scheduler.
export function markAppointmentNoShow(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('no_show', identity, appointmentId, body, commandKey)
}

// Validate mot lan, retry tap tai nguyen huu han, DTO sau commit.
async function runAppointmentCommand(operation, identity, appointmentId, body, commandKey) {
    if (!['cancel', 'no_show', 'reschedule', 'start', 'complete'].includes(operation)) {
        throw new TypeError('Unsupported appointment operation')
    }
    if (!identity) {
        throw new AppointmentError('Need Login.', { code: 'UNAUTHORIZED', status: 401 })
    }
    if (operation === 'no_show') {
        requireAppointmentRole(identity, 'owner')
    } else {
        const roles = Array.isArray(identity.roles) ? identity.roles : []
        if (!roles.includes('owner') && !roles.includes(['start', 'complete'].includes(operation) ? 'stylist' : 'customer')) {
        throw new AppointmentError('No permission to perform this appointment operation.', {
            code: 'FORBIDDEN', status: 403,
        })
        }
    }
    if (typeof appointmentId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(appointmentId)) {
        throw new AppointmentError('The appointment code is invalid.', {
        code: 'INVALID_APPOINTMENT_ID', status: 400,
        })
    }
    const input = ['start', 'complete'].includes(operation) ? parseAppointmentCommandBody(body, ['expectedRevision'])
        : operation === 'reschedule' ? parseRescheduleAppointmentInput(body)
        : operation === 'cancel' ? parseCancelAppointmentInput(body) : parseNoShowAppointmentInput(body)
    const key = parseAppointmentCommandKey(commandKey)
    const hash = hashAppointmentCommand(operation, appointmentId, input)

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const resources = await findAppointmentCommandResources(appointmentId)
        if (!resources) {
            throw new AppointmentError('Appointment not found', {
                code: 'APPOINTMENT_NOT_FOUND', status: 404,
            })
        }

        let result
        try {
            result = await runAppointmentTransaction(session => executeAppointmentCommand(session, {
                identity, appointmentId, resources, input, key, hash, operation,
            }))
        } catch (error) {

            if (error instanceof AppointmentError && error.code === 'APPOINTMENT_RESOURCES_CHANGED' && attempt < 2) {
                continue
            }
            throw error
        }
        const { appointment, role } = result
        const response = {
            ...toAppointmentListItem(appointment, role),
            revision: appointment.revision,
            confirmedAt: appointment.confirmedAt.toISOString(),
        }
        if (operation === 'complete') {
            response.startedAt = appointment.startedAt.toISOString()
            response.completedAt = appointment.completedAt.toISOString()
        } else if (operation === 'start') {
            response.startedAt = appointment.startedAt.toISOString()
        } else if (operation === 'cancel') {
            response.cancelledAt = appointment.cancelledAt.toISOString()
        } else if (operation === 'reschedule') {
            response.lastRescheduledAt = appointment.lastRescheduledAt.toISOString()
        } else {
            response.noShowAt = appointment.noShowAt.toISOString()
            response.contactAttemptedAt = appointment.contactAttemptedAt.toISOString()
        }
        return response
    }
}

export function parseNoShowAppointmentInput(body) {
    const input = parseAppointmentCommandBody(body, ['expectedRevision', 'contactAttemptedAt'],)

    if (typeof body.contactAttemptedAt !== 'string') {
        throw new AppointmentError('The time at which the customer was contacted is required!', {
            code: 'INVALID_CONTACT_ATTEMPTED_AT',
            status: 400,
        })
    }

    const contactAttemptedAt = new Date(body.contactAttemptedAt)
    if (!Number.isFinite(contactAttemptedAt.getTime()) || contactAttemptedAt.toISOString() !== body.contactAttemptedAt) {
        throw new AppointmentError('contactAttemptedAt must be a valid ISO UTC value!', {
        code: 'INVALID_CONTACT_ATTEMPTED_AT',
        status: 400,
        })
    }
    return {
        ...input,
        contactAttemptedAt,
    }
}

// Chỉ gọi cho lệnh mới, sau kiểm quyền Owner và nhận diện replay.
function assertAppointmentCanBeMarkedNoShow(appointment, input, now) {
    assertAppointmentStateCommand(appointment, input.expectedRevision)

    // Đúng mốc 15 phút được phép ghi nhận.
    const earliestNoShowAt = appointment.startAt.getTime() + 15 * 60 * 1000

    if (now.getTime() < earliestNoShowAt) {
        throw new AppointmentError('It hasn’t been 15 minutes since the scheduled time yet!', {
            code: 'NO_SHOW_TOO_EARLY',
            status: 409,
        })
    }

    // Thời điểm liên hệ phải không sau thời điểm server ghi no-show.
    if (input.contactAttemptedAt.getTime() > now.getTime()) {
        throw new AppointmentError('The contact time cannot be in the future!', {
        code: 'INVALID_CONTACT_ATTEMPTED_AT',
        status: 400,
        })
    }
}

// Chi filter phan trang; khach va trang thai do ngu canh/backend quyet dinh.
export function parseAppointmentServiceHistoryQuery(query = {}) {
    return parseAppointmentListQuery(query, ['limit', 'cursor'], 20, 50, false, 'completedAt')
}

// Lich su completed cua khach, chi qua ngu canh lich duoc phep xem.
export async function getAppointmentServiceHistory(identity, appointmentId, query = {}) {
    if (!identity) {
        throw new AppointmentError('Need Login.', { code: 'UNAUTHORIZED', status: 401 })
    }
    const roles = Array.isArray(identity.roles) ? identity.roles : []
    const role = roles.includes('owner') ? 'owner' : roles.includes('stylist') ? 'stylist' : null
    if (!role) {
        throw new AppointmentError('Only Owner or assigned Stylist can view service history.', {
            code: 'FORBIDDEN', status: 403,
        })
    }
    if (typeof appointmentId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(appointmentId)) {
        throw new AppointmentError('The appointment code is invalid.', {
            code: 'INVALID_APPOINTMENT_ID', status: 400,
        })
    }
    const options = parseAppointmentServiceHistoryQuery(query)
    const scope = { role, ...options }
    if (role === 'stylist') {
        const staff = await findAppointmentStaffByAccountId(identity.accountId)
        if (!staff) {
            throw new AppointmentError('Staff not found', { code: 'STAFF_NOT_FOUND', status: 404 })
        }
        scope.staffId = String(staff._id)
    }
    const result = await findAppointmentServiceHistory(appointmentId, scope)
    if (!result) {
        throw new AppointmentError('Appointment not found', { code: 'APPOINTMENT_NOT_FOUND', status: 404 })
    }
    // DTO co ban khong chua email/phone, account hoac audit.
    return buildAppointmentPage(result.items, options.limit, role, 'completedAt')
}

// Shared reason validation; only late Owner changes require this field.
function parseAppointmentCommandReason(value) {
    if (value === undefined) return undefined
    if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new AppointmentError('reason must be a non-empty string up to 500 characters', { code: 'INVALID_REASON', status: 400 })
    return value.trim()
}

export function parseRescheduleAppointmentInput(body) {
    const input = parseAppointmentCommandBody(body, ['expectedRevision', 'startAt', 'staffId', 'reason'])
    if (body.startAt === undefined && body.staffId === undefined) throw new AppointmentError('Provide startAt or staffId to reschedule.', { code: 'RESCHEDULE_CHANGE_REQUIRED', status: 400 })
    if (body.startAt !== undefined) {
        const date = typeof body.startAt === 'string' ? new Date(body.startAt) : null
        if (!date || !Number.isFinite(date.getTime()) || date.toISOString() !== body.startAt) throw new AppointmentError('startAt must be a valid ISO UTC value.', { code: 'INVALID_START_AT', status: 400 })
        input.startAt = date
    }
    if (body.staffId !== undefined) {
        if (typeof body.staffId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(body.staffId)) throw new AppointmentError('staffId is invalid.', { code: 'INVALID_STAFF_ID', status: 400 })
        input.staffId = body.staffId.toLowerCase()
    }
    const reason = parseAppointmentCommandReason(body.reason)
    if (reason !== undefined) input.reason = reason
    return input
}

// Prepare from the guarded snapshot; availability is checked separately in the same session.
function prepareAppointmentReschedule(appointment, role, input, now) {
    assertAppointmentStateCommand(appointment, input.expectedRevision)
    const minute = 60_000
    const oldLead = appointment.startAt.getTime() - now.getTime()
    if (role === 'customer' && oldLead < 120 * minute) throw new AppointmentError('Rescheduling requires at least 2 hours before the old start.', { code: 'RESCHEDULE_CUTOFF', status: 409 })
    if (role === 'owner' && oldLead < 120 * minute && !input.reason) throw new AppointmentError('A reason is required for a late reschedule.', { code: 'RESCHEDULE_REASON_REQUIRED', status: 400 })
    const startAt = new Date((input.startAt ?? appointment.startAt).getTime())
    const staffId = input.staffId ?? String(appointment.staffId)
    if (startAt.getTime() === appointment.startAt.getTime() && staffId === String(appointment.staffId)) throw new AppointmentError('Time and Staff have not changed.', { code: 'RESCHEDULE_NO_CHANGE', status: 400 })
    if (startAt.getTime() % (15 * minute) !== 0) throw new AppointmentError('startAt must follow the 15-minute grid.', { code: 'INVALID_START_AT', status: 400 })
    if (startAt.getTime() < now.getTime() + (role === 'owner' ? 0 : 30 * minute)) throw new AppointmentError('The new start is before the permitted lead time.', { code: 'RESCHEDULE_LEAD_TIME', status: 409 })
    if (startAt.getTime() > now.getTime() + 168 * 60 * minute) throw new AppointmentError('The new start exceeds the 168-hour horizon.', { code: 'RESCHEDULE_HORIZON', status: 409 })
    const endAt = new Date(startAt.getTime() + appointment.totalDurationMinutes * minute)
    return {
        staffId, startAt, endAt, occupiedFrom: new Date(startAt.getTime()),
        occupiedUntil: new Date(endAt.getTime() + appointment.bufferAfterMinutes * minute),
        localDate: toHoChiMinhDate(startAt), timeZone: 'Asia/Ho_Chi_Minh',
    }
}

export function rescheduleAppointment(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('reschedule', identity, appointmentId, body, commandKey)
}

// Pressing Start attests that the customer is physically present.
export function startAppointment(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('start', identity, appointmentId, body, commandKey)
}

async function assertAppointmentCanStart(appointment, session, now) {
    const from = new Date(Math.min(appointment.startAt.getTime(), now.getTime()))
    // Include all future reservations when the planned end has already passed.
    const overdue = appointment.endAt <= now
    const until = overdue ? new Date('9999-12-31T23:59:59.999Z') : new Date(appointment.endAt.getTime() + 600_000)
    const calendar = await findAvailabilityCalendar([appointment.staffId], appointment.customerId, from, until, {
        session, excludeAppointmentId: String(appointment._id),
    })
    const shiftUntil = Math.max(appointment.endAt.getTime(), now.getTime()) + 600_000
    if (!calendar.shifts.some(shift => shift.startAt <= from && shift.endAt.getTime() >= shiftUntil)) {
        throw new AppointmentError('The serving interval must fit one active shift.', { code: 'START_OUTSIDE_SHIFT', status: 409 })
    }
    const candidate = { ...appointment.toObject(), status: 'in_progress', startedAt: now, occupiedFrom: from }
    const staffInterval = appointmentInterval(candidate, false, now)
    const customerInterval = appointmentInterval(candidate, true, now)
    const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1]
    if (calendar.timeOff.some(item => overlaps(staffInterval, [item.startAt.getTime(), item.endAt.getTime()]))) {
        throw new AppointmentError('The serving interval overlaps time off.', { code: 'START_TIME_OFF_CONFLICT', status: 409 })
    }
    if (calendar.appointments.some(item =>
        (String(item.staffId) === String(appointment.staffId) && overlaps(staffInterval, appointmentInterval(item, false, now))) ||
        (String(item.customerId) === String(appointment.customerId) && overlaps(customerInterval, appointmentInterval(item, true, now)))
    )) throw new AppointmentError('The serving interval conflicts with another appointment.', { code: 'START_APPOINTMENT_CONFLICT', status: 409 })
}

// Actual completion releases unused planned time only after ten minutes of cleanup.
export function completeAppointment(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('complete', identity, appointmentId, body, commandKey)
}
