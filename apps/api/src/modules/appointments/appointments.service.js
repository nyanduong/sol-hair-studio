
import { findCustomerAppointments, findStylistAppointments, findAppointmentStaffByAccountId, findOwnerAppointments } from "./appointments.repository.js"
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

// Giải mã cursor dùng chung cho các danh sách lịch.
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

    } catch (error) {
        throw new AppointmentError('Cursor không hợp lệ.', {
            code: 'INVALID_CURSOR',
            status: 400,
        })
    }
}

export function parseCustomerAppointmentQuery(query = {} ) {
    const allowedKeys =['limit', 'cursor']

    if(Object.keys(query).some(key => !allowedKeys.includes(key))) {
        throw new AppointmentError('Query not supported', {
            code: "INVALID_QUERY",
            status: 400,
        })
    }

    let limit = 20
    if(query.limit !== undefined) {
        if(
            typeof query.limit !== 'string' ||
            !/^[1-9]\d?$/.test(query.limit) ||
            Number(query.limit) > 50
        ) {
            throw new AppointmentError('limit must be an integer between 1 and 50', {
                code: 'INVALID_LIMIT',
                status: 400,
            })
        }
        limit = Number(query.limit)
    }

    return {
        limit,
        cursor: decodeAppointmentCursor(query.cursor),
    }
}

// Đọc lịch theo Customer trong identity đã được xác thực.
export async function listCustomerAppointments(identity, {limit = 20, cursor} = {}) {
    if(!identity) {
        throw new AppointmentError('Need Login', {
            code: 'UNAUTHORIZED',
            status: 401,
        })
    }

    if(!Array.isArray(identity.roles) || !identity.roles.includes('customer')) {
        throw new AppointmentError('You are not authorized to access this list', {
            code: 'FORBIDDEN',
            status: 403,
        })
    }

    if(!Number.isInteger(limit) || limit < 1 ||  limit > 50) {
        throw new AppointmentError('Limit must be an integer between 1 and 50', {
            code: 'INVALID_LIMIT',
            status: 400,
        })
    }
    // Không có hồ sơ vẫn trả cùng cấu trúc phân trang.
    if(identity.customerId === undefined) {
        return buildCustomerAppointmentPage([], limit)
    }

    const apppointments = await findCustomerAppointments(identity.customerId, {limit, cursor})
    
    return buildCustomerAppointmentPage(apppointments, limit)
}

// Allowlist dữ liệu trả cho Customer, không spread document.
function toCustomerAppointmentListItem(appoinment) {
    return {
        id: String(appoinment._id),
        staffId: String(appoinment.staffId),
        staffNameSnapshot: appoinment.staffNameSnapshot,
        items: appoinment.items.map(item => ({
            serviceId: item.serviceId,
            name: item.name,
            priceVnd: item.priceVnd,
            durationMinutes: item.durationMinutes,
        })),
        totalPriceVnd: appoinment.totalPriceVnd,
        totalDurationMinutes: appoinment.totalDurationMinutes,
        startAt: appoinment.startAt.toISOString(),
        endAt: appoinment.endAt.toISOString(),
        timeZone: appoinment.timeZone,
        localDate: appoinment.localDate,
        status: appoinment.status,
    }
}

function buildCustomerAppointmentPage(appointments, limit) {
    const hasNextPage = appointments.length > limit
    const page = appointments.slice(0, limit)

    let nextCursor = null
    if(hasNextPage) {
        const lastAppointment = page[page.length - 1]

        nextCursor = Buffer.from(
            JSON.stringify({
                startAt: lastAppointment.startAt.toISOString(),
                id: String(lastAppointment._id)
            }),
            'utf8'
        ).toString('base64url')
    }

    return {
        items: page.map(toCustomerAppointmentListItem),
        pagination: {
            limit,
            hasNextPage,
            nextCursor,
        }
    }
}


export function parseStylistAppointmentQuery(query = {} ) {
    const allowedKeys =['localDate', 'limit', 'cursor']

    if(Object.keys(query).some(key => !allowedKeys.includes(key))) {
        throw new AppointmentError('Query not supported', {
            code: 'INVALID_QUERY',
            status: 400,
        })
    }
    const { localDate } = query

    if(typeof localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
        throw new AppointmentError('localDate must be a valid YYYY-MM-DD date', {
            code: 'INVALID_LOCAL_DATE',
            status: 400,
        })
    }
    const date = new Date(`${localDate}T00:00:00.000Z`)

    if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== localDate) {
        throw new AppointmentError('localDate must be a valid YYYY-MM-DD date', {
            code: 'INVALID_LOCAL_DATE',
            status: 400,
        })
    }

    let limit = 50

    if(query.limit !== undefined) {
        if(
            typeof query.limit !== 'string' ||
            !/^[1-9]\d{0,2}$/.test(query.limit) ||
            Number(query.limit) > 100
        ) {
            throw new AppointmentError('limit must be an integer between 1 and 100', {
                code: 'INVALID_LIMIT',
                status: 400,
            })
        }
        limit = Number(query.limit)
    }

    return {
        localDate,
        limit,
        cursor: decodeAppointmentCursor(query.cursor)
    }
}

export async function listStylistAppointments( identity, { localDate, limit = 50, cursor} = {} ) {
    if(!identity) {
        throw new AppointmentError('Need Login', {
            code: 'UNAUTHORIZED',
            status: 401,
        })
    }

    if(!Array.isArray(identity.roles) || !identity.roles.includes('stylist')) {
        throw new AppointmentError('You are not authorized to access this list', {
            code: 'FORBIDDEN',
            status: 403,
        })
    }

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
    return buildStylistAppointmentPage(appointments, limit)
}

function toStylistAppointmentListItem(appointment) {
    return {
        id: String(appointment._id),
        staffId: String(appointment.staffId),
        staffNameSnapshot: appointment.staffNameSnapshot,
        customerSnapshot: {
            displayName: appointment.customerSnapshot.displayName,
            phone: appointment.customerSnapshot.phone,
        },
        items: appointment.items.map(item => ({
            serviceId: item.serviceId,
            name: item.name,
            priceVnd: item.priceVnd,
            durationMinutes: item.durationMinutes,
        })),
        totalPriceVnd: appointment.totalPriceVnd,
        totalDurationMinutes: appointment.totalDurationMinutes,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        timeZone: appointment.timeZone,
        localDate: appointment.localDate,
        status: appointment.status,
    }
}

function buildStylistAppointmentPage(appointments, limit) {
    const hasNextPage = appointments.length > limit
    const page = appointments.slice(0, limit)

    let nextCursor = null
    if(hasNextPage) {
        const lastAppointment = page[page.length - 1]
        nextCursor = Buffer.from(
        JSON.stringify({
            startAt: lastAppointment.startAt.toISOString(),
            id: String(lastAppointment._id),
        }),
        'utf8',
        ).toString('base64url')
    }

    return {
        items: page.map(toStylistAppointmentListItem),
        pagination: {
            limit,
            hasNextPage,
            nextCursor,
        },
    }
}

export function parseOwnerAppointmentQuery(query = {}) {
    const allowedKeys =['localDate', 'staffId', 'status', 'limit', 'cursor']
    if(Object.keys(query).some(key => !allowedKeys.includes(key))) {
        throw new AppointmentError('Query not supported', {
            code: 'INVALID_QUERY',
            status: 400,
        })
    }
    const options = parseStylistAppointmentQuery({
        localDate: query.localDate,
        limit: query.limit,
        cursor: query.cursor,
    })

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

function toOwnerAppointmentListItem(appointment) {
    return {
        id: String(appointment._id),
        customerId: String(appointment.customerId),
        staffId: String(appointment.staffId),
        staffNameSnapshot: appointment.staffNameSnapshot,
        customerSnapshot: {
            displayName: appointment.customerSnapshot.displayName,
            phone: appointment.customerSnapshot.phone,
        },
        items: appointment.items.map(item => ({
            serviceId: item.serviceId,
            name: item.name,
            priceVnd: item.priceVnd,
            durationMinutes: item.durationMinutes,
        })),
        totalPriceVnd: appointment.totalPriceVnd,
        totalDurationMinutes: appointment.totalDurationMinutes,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        timeZone: appointment.timeZone,
        localDate: appointment.localDate,
        status: appointment.status,
    }
}

function buildOwnerAppointmentPage(appointments, limit) {
    const hasNextPage = appointments.length > limit
    const page = appointments.slice(0, limit)

    let nextCursor = null
    if(hasNextPage) {
        const lastAppointment = page[page.length - 1]
        nextCursor = Buffer.from(
        JSON.stringify({
            startAt: lastAppointment.startAt.toISOString(),
            id: String(lastAppointment._id),
        }),
        'utf8',
        ).toString('base64url')
    }
    return {
        items: page.map(toOwnerAppointmentListItem),
        pagination: {
            limit,
            hasNextPage,
            nextCursor,
        },
    }
}


export async function listOwnerAppointments(identity, { localDate, staffId, status, limit = 50, cursor} = {}) {
    if(!identity) {
        throw new AppointmentError('Need Login', {
            code: 'UNAUTHORIZED',
            status: 401,
        })
    }

    if(!Array.isArray(identity.roles) || !identity.roles.includes('owner')) {
        throw new AppointmentError('You are not authorized to access this list', {
            code: 'FORBIDDEN',
            status: 403,
        })
    }
    const appointments = await findOwnerAppointments({
        localDate,
        staffId,
        status,
        limit,
        cursor,
    })
    return buildOwnerAppointmentPage(appointments, limit)
}

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
