import { findCustomerAppointments, findStylistAppointments, findAppointmentStaffByAccountId, findOwnerAppointments, findAppointmentDetail } from "./appointments.repository.js"
import { APPOINTMENT_STATUSES } from "./appointments.model.js"

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
function decodeAppointmentCursor(token) {
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
            typeof payload.startAt !== 'string' ||
            typeof payload.id !== 'string' ||
            !/^[a-fA-F0-9]{24}$/.test(payload.id)
        ) {
            throw new Error('Invalid cursor payload')
        }

        const startAt = new Date(payload.startAt)

        if ( !Number.isFinite(startAt.getTime()) ||  startAt.toISOString() !== payload.startAt) {
            throw new Error('Invalid cursor timestamp')
        }
        return {
            startAt,
            id: payload.id,
        }

    } catch {
        throw new AppointmentError('Cursor không hợp lệ.', {
            code: 'INVALID_CURSOR',
            status: 400,
        })
    }
}

// Validate và chuẩn hóa query params phân trang chung.
function parseAppointmentListQuery(query, allowedKeys, defaultLimit, maxLimit, withDate) {
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
        limit, cursor: decodeAppointmentCursor(query.cursor),
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
function buildAppointmentPage(appointments, limit, role) {
    const hasNextPage = appointments.length > limit
    const page = appointments.slice(0, limit)
    let nextCursor = null
    if (hasNextPage) {
        const last = page[page.length - 1]
        nextCursor = Buffer.from(JSON.stringify({
        startAt: last.startAt.toISOString(), id: String(last._id),
        }), 'utf8').toString('base64url')
    }
    return {
        items: page.map(appointment => toAppointmentListItem(appointment, role)),
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

