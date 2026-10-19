
import { findCustomerAppointments } from "./appointments.repository.js"

// Lỗi nghiệp vụ; controller sẽ chuyển thành HTTP response.
export class AppointmentError extends Error {
    constructor(message, { code = 'APPOINTMENT_ERROR', status = 400 } = {}) {
        super(message)
        this.name = 'AppointmentError'
        this.code = code
        this.status = status
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
    if(query.cursor === undefined) {
        return { limit }
    }
    const token = query.cursor
    if(
        typeof token !== 'string' ||
        token.length === 0 ||
        token.length > 512 ||
        !/^[A-Za-z0-9_-]+$/.test(token)
    ) {
        throw new AppointmentError('Cursor invalid', {
            code: 'INVALID_CURSOR',
            status: 400,
        })
    }

    let cursor
    try {
        const decoded = Buffer.from(token, 'base64url')

        if (decoded.toString('base64url') !== token) {
            throw new Error('Invalid cursor encoding')
        }

        const payload = JSON.parse(decoded.toString('utf8'))

        if(
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

        if (!Number.isFinite(startAt.getTime()) ||startAt.toISOString() !== payload.startAt) {
            throw new Error('Invalid cursor timestamp')
        }

        cursor = {startAt, id: payload.id,}

    } catch (error) {
        // Chỉ bắt lỗi giải mã; không bắt và che lỗi truy vấn database.
        throw new AppointmentError('Cursor Invalid', {
            code: 'INVALID_CURSOR',
            status: 400,
        })
    }
    return { limit, cursor }
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


