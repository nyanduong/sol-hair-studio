import { findAvailabilityCalendar, findEligibleStaff } from '../availability/availability.repository.js'
import { AvailabilityError, assertAppointmentSlotAvailable, appointmentInterval, parseAvailabilityQuery, calculateStaffSlots } from '../availability/availability.service.js'
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
    persistAppointmentEta,
    persistCorrectedStartAppointment,
    persistCorrectedCompleteAppointment,
    findAppointmentConflictCandidates,
    insertAppointmentEvent,
    findAppointmentCommandResources,
    findAppointmentServiceHistory,
} from "./appointments.repository.js"
import { APPOINTMENT_STATUSES } from "./appointments.model.js"
import { createHash } from 'node:crypto'
import {lockAndBumpStaffBookingRevision} from '../staff/staff.repository.js'
import mongoose from 'mongoose'


// Lỗi nghiệp vụ kèm mã lỗi và HTTP status.
export class AppointmentError extends Error {
    constructor(message, { code = 'APPOINTMENT_ERROR', status = 400, details } = {}) {
        super(message)
        this.name = 'AppointmentError'
        this.code = code
        this.status = status
        if (details !== undefined) this.details = details
    }
}

// Giải mã và kiểm tra cursor phân trang
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

// Kiểm tra bộ lọc, ngày và giới hạn phân trang.
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

// Kiểm tra đăng nhập và vai trò được phép.
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

// Đóng gói danh sách và tạo cursor cho trang tiếp theo.
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

// Chỉ trả các trường người dùng được phép xem.
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

// Kiểm tra body, các trường được nhận và expectedRevision.
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

// Kiểm tra body, các trường được nhận và expectedRevision.
export function parseCustomerAppointmentQuery(query = {}) {
    return parseAppointmentListQuery(query, ['limit', 'cursor'], 20, 50, false)
}

// Lấy danh sách lịch của chính khách đang đăng nhập.
export async function listCustomerAppointments(identity, {limit = 20, cursor} = {}) {
    requireAppointmentRole(identity, 'customer')

    if(!Number.isInteger(limit) || limit < 1 ||  limit > 50) {
        throw new AppointmentError('Limit must be an integer between 1 and 50', {
            code: 'INVALID_LIMIT',
            status: 400,
        })
    }

    if(identity.customerId === undefined) {
        return buildAppointmentPage([], limit, 'customer')
    }

    const appointments = await findCustomerAppointments(identity.customerId, {limit, cursor})

    return buildAppointmentPage(appointments, limit, 'customer')
}

// Kiểm tra ngày và phân trang cho lịch Stylist.
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

// Kiểm tra bộ lọc ngày, Stylist và trạng thái của Owner.
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

// Lấy lịch toàn tiệm theo bộ lọc của Owner.
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

// Kiểm tra quyền và trả chi tiết một lịch hẹn.
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

// Kiểm tra dữ liệu yêu cầu hủy lịch.
export function parseCancelAppointmentInput(body) {
    const input = parseAppointmentCommandBody(body, ['expectedRevision', 'reason'])
    const reason = parseAppointmentCommandReason(body.reason)
    if (reason !== undefined) input.reason = reason
    return input
}

// Kiểm tra key dùng để nhận diện request gửi lại
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

// Tạo mã băm để nhận biết nội dung request có thay đổi.
function hashAppointmentCommand(operation, appointmentId, input) {
    if (!['cancel', 'no_show', 'reschedule', 'start', 'complete', 'eta', 'correct_start', 'correct_complete'].includes(operation)) throw new TypeError('Unsupported appointment operation')
    const intent = { operation, appointmentId: appointmentId.toLowerCase(), expectedRevision: input.expectedRevision }
    if (operation === 'cancel') intent.reason = input.reason ?? null
    else if (operation === 'no_show') intent.contactAttemptedAt = input.contactAttemptedAt.toISOString()
    else if (operation === 'correct_start') { intent.reason = input.reason; intent.serviceNotStarted = input.serviceNotStarted }
    else if (operation === 'correct_complete') {
        intent.reason = input.reason; intent.serviceNotCompleted = input.serviceNotCompleted
        intent.estimatedEndAt = input.estimatedEndAt?.toISOString() ?? null
    }
    else if (operation === 'eta') intent.estimatedEndAt = input.estimatedEndAt.toISOString()
    else if (operation === 'reschedule') {
        intent.startAt = input.startAt?.toISOString() ?? null
        intent.staffId = input.staffId ?? null
        intent.reason = input.reason ?? null
    }
    return createHash('sha256').update(JSON.stringify(intent), 'utf8').digest('hex')
}

// Cho Owner quản lý mọi lịch, Customer chỉ lịch của mình
function assertCustomerOwnerAppointmentAccess(identity, appointment) {
    if (!identity) {
        throw new AppointmentError('Need Login', {
        code: 'UNAUTHORIZED',
        status: 401,
        })
    }
    const roles = Array.isArray(identity.roles) ? identity.roles : []
    
    if (roles.includes('owner')) {
        return 'owner'
    }

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

    if (role === 'customer' && remainingMs < cutoffMs) {
        throw new AppointmentError('Cancellations are only permitted at least 2 hours before the scheduled appointment time!', {
            code: 'CANCELLATION_CUTOFF',
            status: 409,
        })
    }

    if (role === 'owner' && remainingMs < cutoffMs && !input.reason) {
        throw new AppointmentError('A reason is required for cancellations made shortly before or after the scheduled appointment time!', {
            code: 'CANCELLATION_REASON_REQUIRED',
            status: 400,
        })
    }
}

// Nhận diện request đã xử lý để không thực hiện hai lần.
function isAppointmentCommandReplay(appointment, { actorId, key, hash },){
    const previous = appointment.lastCommand

    if (!previous || String(previous.actorId) !== actorId || previous.key !== key) {
        return false
    }

    if (previous.hash !== hash) {
        throw new AppointmentError('Key has already been used for a different request.', {
        code: 'COMMAND_KEY_CONFLICT',
        status: 409,
        })
    }

    if (previous.resultRevision !== appointment.revision) {
        throw new AppointmentError('Unable to verify the previous command result.', {
        code: 'COMMAND_RECEIPT_CONFLICT',
        status: 409,
        })
    }

    return true
}

// Lấy các trường cần lưu vào lịch sử trước và sau thay đổi.
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


        if (value === undefined) continue

        snapshot[field] = value instanceof Date
        ? new Date(value.getTime())
        : value
    }

    return snapshot
}

// Lấy guard, đọc lại người thao tác và kiểm tra quyền trên lịch.
async function loadGuardedAppointmentForCommand(identity, appointmentId, resources, session, operation, targetStaffId) {
    if (!['cancel', 'no_show', 'reschedule', 'start', 'complete', 'eta', 'correct_start', 'correct_complete'].includes(operation)) throw new TypeError('Unsupported appointment operation')
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
    if (['no_show', 'correct_start', 'correct_complete'].includes(operation)) { requireAppointmentRole(actor, 'owner'); role = 'owner' }
    else if (['start', 'complete', 'eta'].includes(operation)) {
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

// Xử lý thao tác, cập nhật lịch và ghi event trong transaction.
async function executeAppointmentCommand(session, { identity, appointmentId, resources, input, key, hash, operation }) {
    const { appointment, actor, role } = await loadGuardedAppointmentForCommand(
        identity, appointmentId, resources, session, operation, operation === 'reschedule' ? input.staffId : undefined,
    )
    if (isAppointmentCommandReplay(appointment, { actorId: actor.accountId, key, hash })) {
        return { appointment: appointment.toObject(), role,
            ...(operation === 'eta' ? { impact: await buildAppointmentEtaImpact(appointment, role, session, new Date()) } : {}),
        }
    }
    const now = new Date()
    const before = buildAppointmentEventSnapshot(appointment)
    const previousStaffId = String(appointment.staffId)
    const previousStartedAt = appointment.startedAt
    const previousCompletedAt = appointment.completedAt
    if (operation === 'correct_complete') {
        assertAppointmentStateCommand(appointment, input.expectedRevision, 'completed')
        if (appointment.endAt <= now && input.estimatedEndAt === undefined) {
            throw new AppointmentError('A future ETA is required to reopen service whose planned end has passed.', { code: 'CORRECTION_ETA_REQUIRED', status: 400 })
        }
        if (input.estimatedEndAt !== undefined && (input.estimatedEndAt <= now || input.estimatedEndAt <= appointment.endAt)) {
            throw new AppointmentError('ETA must be in the future and after the planned end.', { code: 'INVALID_ETA', status: 400 })
        }
        const candidate = { ...appointment.toObject(), status: 'in_progress', completedAt: undefined,
            estimatedEndAt: input.estimatedEndAt,
            occupiedFrom: new Date(Math.min(appointment.startAt.getTime(), appointment.startedAt.getTime())),
            occupiedUntil: new Date(Math.max(appointment.endAt.getTime(), input.estimatedEndAt?.getTime() ?? appointment.endAt.getTime()) + 600_000),
        }
        await assertCorrectionCanRestoreInterval(candidate, session, now)
        Object.assign(appointment, { status: candidate.status, completedAt: undefined,
            estimatedEndAt: candidate.estimatedEndAt, occupiedFrom: candidate.occupiedFrom, occupiedUntil: candidate.occupiedUntil })
    } else if (operation === 'correct_start') {
        assertAppointmentStateCommand(appointment, input.expectedRevision, 'in_progress')
        await assertCorrectionCanRestoreInterval({ ...appointment.toObject(), status: 'confirmed',
            occupiedFrom: appointment.startAt, occupiedUntil: new Date(appointment.endAt.getTime() + 600_000) }, session, now)
        appointment.status = 'confirmed'
        appointment.startedAt = undefined
        appointment.completedAt = undefined
        appointment.estimatedEndAt = undefined
        appointment.occupiedFrom = appointment.startAt
        appointment.occupiedUntil = new Date(appointment.endAt.getTime() + 600_000)
    } else if (operation === 'eta') {
        assertAppointmentStateCommand(appointment, input.expectedRevision, 'in_progress')
        if (input.estimatedEndAt <= now || input.estimatedEndAt <= appointment.endAt) {
            throw new AppointmentError('ETA must be in the future and after the planned end.', { code: 'INVALID_ETA', status: 400 })
        }
        appointment.estimatedEndAt = input.estimatedEndAt
        appointment.occupiedFrom = new Date(Math.min(appointment.startAt.getTime(), appointment.startedAt.getTime()))
        appointment.occupiedUntil = new Date(Math.max(appointment.endAt.getTime(), input.estimatedEndAt.getTime()) + 600_000)
    } else if (operation === 'complete') {
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
    const persist = operation === 'correct_complete' ? persistCorrectedCompleteAppointment : operation === 'correct_start' ? persistCorrectedStartAppointment : operation === 'eta' ? persistAppointmentEta : operation === 'complete' ? persistCompletedAppointment : operation === 'start' ? persistStartedAppointment : operation === 'reschedule' ? persistRescheduledAppointment : operation === 'cancel' ? persistCancelledAppointment : persistNoShowAppointment
    const updated = await persist(appointment, { expectedRevision: input.expectedRevision, previousStaffId, previousStartedAt, previousCompletedAt, session })
    if (!updated) throw new AppointmentError('Appointment has changed. Reload it before trying again.', { code: 'APPOINTMENT_REVISION_CONFLICT', status: 409 })
    await insertAppointmentEvent({
        appointmentId: updated._id, actorId: actor.accountId, revision: updated.revision,
        kind: ['correct_start', 'correct_complete'].includes(operation) ? 'corrected' : operation === 'eta' ? 'eta_updated' : operation === 'start' ? 'started' : operation === 'reschedule' ? 'rescheduled' : updated.status, occurredAt: now,
        before, after: buildAppointmentEventSnapshot(updated),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
    }, { session })
    return { appointment: updated, role,
        ...(operation === 'eta' ? { impact: await buildAppointmentEtaImpact(updated, role, session, now) } : {}),
    }
}

// Chạy transaction để các thay đổi cùng thành công hoặc rollback.
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

// Thực hiện hủy lịch theo quyền và cutoff.
export function cancelAppointment(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('cancel', identity, appointmentId, body, commandKey)
}

// Thực hiện đánh dấu khách không đến theo quyền Owner.
export function markAppointmentNoShow(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('no_show', identity, appointmentId, body, commandKey)
}

// Kiểm tra request, chạy transaction và trả kết quả thao tác.
async function runAppointmentCommand(operation, identity, appointmentId, body, commandKey) {
    if (!['cancel', 'no_show', 'reschedule', 'start', 'complete', 'eta', 'correct_start', 'correct_complete'].includes(operation)) {
        throw new TypeError('Unsupported appointment operation')
    }
    if (!identity) {
        throw new AppointmentError('Need Login.', { code: 'UNAUTHORIZED', status: 401 })
    }
    if (['no_show', 'correct_start', 'correct_complete'].includes(operation)) {
        requireAppointmentRole(identity, 'owner')
    } else {
        const roles = Array.isArray(identity.roles) ? identity.roles : []
        if (!roles.includes('owner') && !roles.includes(['start', 'complete', 'eta'].includes(operation) ? 'stylist' : 'customer')) {
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
    const input = ['correct_start', 'correct_complete'].includes(operation) ? parseOwnerCorrectionInput(body, operation)
        : operation === 'eta' ? parseAppointmentEtaInput(body)
        : ['start', 'complete'].includes(operation) ? parseAppointmentCommandBody(body, ['expectedRevision'])
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
        if (operation === 'correct_complete') {
            response.startedAt = appointment.startedAt.toISOString()
            if (appointment.estimatedEndAt !== undefined) response.estimatedEndAt = appointment.estimatedEndAt.toISOString()
            response.occupiedFrom = appointment.occupiedFrom.toISOString()
            response.occupiedUntil = appointment.occupiedUntil.toISOString()
        } else if (operation === 'correct_start') {
            response.occupiedFrom = appointment.occupiedFrom.toISOString()
            response.occupiedUntil = appointment.occupiedUntil.toISOString()
        } else if (operation === 'eta') {
            response.startedAt = appointment.startedAt.toISOString()
            response.estimatedEndAt = appointment.estimatedEndAt.toISOString()
            response.occupiedUntil = appointment.occupiedUntil.toISOString()
            Object.assign(response, result.impact)
        } else if (operation === 'complete') {
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

// Kiểm tra revision và thời điểm đã liên hệ khách.
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

// Kiểm tra mốc trễ 15 phút và thời gian liên hệ khách.
function assertAppointmentCanBeMarkedNoShow(appointment, input, now) {
    assertAppointmentStateCommand(appointment, input.expectedRevision)

    const earliestNoShowAt = appointment.startAt.getTime() + 15 * 60 * 1000

    if (now.getTime() < earliestNoShowAt) {
        throw new AppointmentError('It hasn’t been 15 minutes since the scheduled time yet!', {
            code: 'NO_SHOW_TOO_EARLY',
            status: 409,
        })
    }

    if (input.contactAttemptedAt.getTime() > now.getTime()) {
        throw new AppointmentError('The contact time cannot be in the future!', {
        code: 'INVALID_CONTACT_ATTEMPTED_AT',
        status: 400,
        })
    }
}

// Kiểm tra phân trang lịch sử dịch vụ.
export function parseAppointmentServiceHistoryQuery(query = {}) {
    return parseAppointmentListQuery(query, ['limit', 'cursor'], 20, 50, false, 'completedAt')
}

// Lấy lịch sử dịch vụ hoàn tất qua lịch hẹn được phép xem.
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

    return buildAppointmentPage(result.items, options.limit, role, 'completedAt')
}

// Chuẩn hóa và kiểm tra lý do thao tác.
function parseAppointmentCommandReason(value) {
    if (value === undefined) return undefined
    if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new AppointmentError('reason must be a non-empty string up to 500 characters', { code: 'INVALID_REASON', status: 400 })
    return value.trim()
}

// Kiểm tra giờ mới, Stylist mới và lý do đổi lịch.
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

// Kiểm tra giới hạn đổi lịch và tính lại các mốc thời gian.
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

// Thực hiện đổi giờ hoặc Stylist, giữ nguyên snapshot dịch vụ.
export function rescheduleAppointment(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('reschedule', identity, appointmentId, body, commandKey)
}

// Bắt đầu phục vụ và ghi giờ bắt đầu thực tế.
export function startAppointment(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('start', identity, appointmentId, body, commandKey)
}

// Kiểm tra ca, nghỉ và lịch trùng trước khi bắt đầu.
async function assertAppointmentCanStart(appointment, session, now) {
    const from = new Date(Math.min(appointment.startAt.getTime(), now.getTime()))

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

// Hoàn tất phục vụ và giữ thêm 10 phút dọn.
export function completeAppointment(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('complete', identity, appointmentId, body, commandKey)
}

// Cập nhật ETA và trả cảnh báo lịch bị ảnh hưởng.
export function updateAppointmentEta(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('eta', identity, appointmentId, body, commandKey)
}

// Kiểm tra định dạng ETA và khả năng tính thêm thời gian dọn.
function parseAppointmentEtaInput(body) {
    const input = parseAppointmentCommandBody(body, ['expectedRevision', 'estimatedEndAt'])
    const value = body.estimatedEndAt
    const eta = typeof value === 'string' ? new Date(value) : null
    if (!eta || !Number.isFinite(eta.getTime()) || !Number.isFinite(new Date(eta.getTime() + 600_000).getTime()) || eta.toISOString() !== value) {
        throw new AppointmentError('estimatedEndAt must be a canonical UTC ISO timestamp.', { code: 'INVALID_ETA', status: 400 })
    }
    return { ...input, estimatedEndAt: eta }
}

// Tìm lịch bị ETA ảnh hưởng và lọc thông tin theo quyền.
async function buildAppointmentEtaImpact(appointment, role, session, now) {
    const staffInterval = appointmentInterval(appointment, false, now)
    const customerInterval = appointmentInterval(appointment, true, now)
    const until = Number.isFinite(staffInterval[1]) ? new Date(staffInterval[1]) : new Date(8_640_000_000_000_000)
    const candidates = await findAppointmentConflictCandidates(appointment, until, { session })
    const overlaps = (a, b) => Math.max(a[0], b[0], now.getTime()) < Math.min(a[1], b[1])
    const affected = []
    let ownerReviewRequired = false
    for (const item of candidates) {
        const sameStaff = String(item.staffId) === String(appointment.staffId)
        const reasons = []
        if (sameStaff && overlaps(staffInterval, appointmentInterval(item, false, now))) reasons.push('staff_overlap')
        if (String(item.customerId) === String(appointment.customerId) && overlaps(customerInterval, appointmentInterval(item, true, now))) reasons.push('customer_overlap')
        if (!reasons.length) continue
        ownerReviewRequired = true
        // A Stylist cannot inspect appointments assigned to another Staff.
        if (role !== 'owner' && !sameStaff) continue
        affected.push({ id: String(item._id), staffId: String(item.staffId), status: item.status,
            startAt: item.startAt.toISOString(), endAt: item.endAt.toISOString(), reasons })
    }
    return { affectedAppointments: affected, ownerReviewRequired }
}

// Owner sửa nhầm bắt đầu, đưa lịch về confirmed.
export function correctAppointmentStart(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('correct_start', identity, appointmentId, body, commandKey)
}

// Kiểm tra lý do, xác nhận sửa nhầm và ETA nếu được cung cấp.
function parseOwnerCorrectionInput(body, operation) {
    const correctingComplete = operation === 'correct_complete'
    const confirmation = correctingComplete ? 'serviceNotCompleted' : 'serviceNotStarted'
    const input = parseAppointmentCommandBody(body, ['expectedRevision', 'reason', confirmation, ...(correctingComplete ? ['estimatedEndAt'] : [])])
    const reason = parseAppointmentCommandReason(body.reason)
    if (!reason) throw new AppointmentError('A reason is required to correct an accidental service action.', { code: 'CORRECTION_REASON_REQUIRED', status: 400 })
    if (body[confirmation] !== true) throw new AppointmentError(
        correctingComplete ? 'Owner must confirm that completion was accidental and service is still in progress.' : 'Owner must confirm that service has not actually started.',
        { code: correctingComplete ? 'SERVICE_NOT_COMPLETED_CONFIRMATION_REQUIRED' : 'SERVICE_NOT_STARTED_CONFIRMATION_REQUIRED', status: 400 },
    )
    return { ...input, reason, [confirmation]: true,
        ...(correctingComplete && body.estimatedEndAt !== undefined ? { estimatedEndAt: parseAppointmentEtaInput({ expectedRevision: input.expectedRevision, estimatedEndAt: body.estimatedEndAt }).estimatedEndAt } : {}),
    }
}

// Kiểm tra ca, nghỉ và xung đột trước khi khôi phục khoảng giữ.
async function assertCorrectionCanRestoreInterval(appointment, session, now) {
    const staffInterval = appointmentInterval(appointment, false, now)
    const customerInterval = appointmentInterval(appointment, true, now)
    const from = new Date(staffInterval[0])
    const until = new Date(staffInterval[1])
    const calendar = await findAvailabilityCalendar([appointment.staffId], appointment.customerId, from, until, {
        session, excludeAppointmentId: String(appointment._id),
    })
    const shiftConflict = !calendar.shifts.some(shift => shift.startAt <= from && shift.endAt >= until)
    const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1]
    const timeOffConflicts = calendar.timeOff.filter(item => overlaps(staffInterval, [item.startAt.getTime(), item.endAt.getTime()]))
        .map(item => ({ startAt: item.startAt.toISOString(), endAt: item.endAt.toISOString() }))
    const conflicts = []

    if (calendar.appointments.length) {
        const candidates = await findAppointmentConflictCandidates(appointment, until, { session, includeCompleted: true })
        for (const item of candidates) {
            const reasons = []
            if (String(item.staffId) === String(appointment.staffId) && overlaps(staffInterval, appointmentInterval(item, false, now))) reasons.push('staff_overlap')
            if (String(item.customerId) === String(appointment.customerId) && overlaps(customerInterval, appointmentInterval(item, true, now))) reasons.push('customer_overlap')
            if (reasons.length) conflicts.push({ id: String(item._id), staffId: String(item.staffId), status: item.status,
                startAt: item.startAt.toISOString(), endAt: item.endAt.toISOString(), reasons })
        }
    }
    if (shiftConflict || timeOffConflicts.length || conflicts.length) {
        throw new AppointmentError('The original reservation cannot be restored until conflicts are resolved.', {
            code: 'CORRECTION_CONFLICT', status: 409,
            details: { shiftConflict, timeOffConflicts, conflictingAppointments: conflicts },
        })
    }
}

// Owner sửa nhầm hoàn tất, đưa lịch về in_progress.
export function correctAppointmentCompletion(identity, appointmentId, body, commandKey) {
    return runAppointmentCommand('correct_complete', identity, appointmentId, body, commandKey)
}

export async function getCustomerRescheduleOptions(identity, appointmentId, query = {}, now = new Date()) {
    requireAppointmentRole(identity, 'customer')
    if (identity.roles.some(role => ['owner', 'stylist'].includes(role))) {
        throw new AppointmentError('Customer session required.', { code: 'FORBIDDEN', status: 403 })
    }
    const appointment = await getAppointmentDetail(identity, appointmentId)
    if (appointment.status !== 'confirmed') {
        throw new AppointmentError('Appointment is not confirmed.', { code: 'APPOINTMENT_STATE_CONFLICT', status: 409 })
    }
    if (new Date(appointment.startAt).getTime() - now.getTime() < 7_200_000) {
        throw new AppointmentError('Rescheduling cutoff reached.', { code: 'RESCHEDULE_CUTOFF', status: 409 })
    }
    if (Object.keys(query).some(key => key !== 'localDate')) {
        throw new AppointmentError('Unsupported reschedule options query.', { code: 'INVALID_QUERY', status: 400 })
    }
    try {
        const options = parseAvailabilityQuery({
            localDate: query.localDate, serviceIds: appointment.items.map(item => item.serviceId).join(','),
        }, identity, now)
        const staff = await findEligibleStaff(options.serviceIds)
        const calendar = staff.length ? await findAvailabilityCalendar(
            staff.map(item => item._id), identity.customerId, options.from, options.until,
            { excludeAppointmentId: appointmentId },
        ) : { shifts: [], timeOff: [], appointments: [] }
        return {
            appointmentId: appointment.id,
            items:appointment.items.map(item=>({
                serviceId: item.serviceId,
                name: item.name,
                priceVnd: item.priceVnd,
                durationMinutes: item.durationMinutes,
            })),
            revision: appointment.revision,
            generatedAt: now.toISOString(),
            localDate: options.localDate,
            timeZone: appointment.timeZone,
            stylists: staff.map(item => ({
                staffId: String(item._id), displayName: item.displayName,
                slots: calculateStaffSlots(item._id, options, calendar, appointment.totalDurationMinutes, now),
            })),
        }
    } catch (error) {
        if (error instanceof AvailabilityError) {
            throw new AppointmentError(error.message, { code: error.code, status: error.status })
        }
        throw error
    }
}
