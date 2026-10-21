import {
    AppointmentError,
    listAppointments,
    getAppointmentDetail,
    getAppointmentServiceHistory,
    cancelAppointment,
    markAppointmentNoShow,
    rescheduleAppointment,
} from "./appointments.service.js";

function sendAppointmentError(error, res, next) {
    if (!(error instanceof AppointmentError)) {
        return next(error)
    }
    return res.status(error.status).json({
        status: 'error',
        code: error.code,
        message: error.message,
    })
}


export async function listAppointmentsController(req, res, next) {

    res.set('Cache-Control', 'no-store')

    try {
        const identity = req.identity
        const query = req.query
        const result = await listAppointments(identity, query)
        return res.status(200).json({
            status: 'success',
            data: result
        })
    } catch (error) {
        return sendAppointmentError(error, res, next)
    }
}

export async function getAppointmentDetailController(req, res, next) {
    res.set('Cache-Control', 'no-store')
    try {
        const identity = req.identity
        const appointmentId = req.params.appointmentId

        const result = await getAppointmentDetail(identity, appointmentId)
        return res.status(200).json({
            status: 'success',
            data: result
        })
    } catch (error) {
        return sendAppointmentError(error, res, next)
    }
}

export function cancelAppointmentController(req, res, next) {
    return appointmentCommandResponse(cancelAppointment, req, res, next)
}

export function markAppointmentNoShowController(req, res, next) {
    return appointmentCommandResponse(markAppointmentNoShow, req, res, next)
}

async function appointmentCommandResponse(operation, req, res, next) {
    res.set('Cache-Control', 'no-store')
    try {
        const identity = req.identity
        const appointmentId = req.params.appointmentId;
        const body = req.body;
        const result = await operation(identity, appointmentId, body, req.get('Idempotency-Key'))
        return res.status(200).json({ status: 'success', data: result })
    } catch (error) {
        return sendAppointmentError(error, res, next)
    }
}

// Lich su phuc vu chi doc, khong ghi appointment hay audit.
export async function getAppointmentServiceHistoryController(req, res, next) {
    res.set('Cache-Control', 'no-store')
    try {
        const data = await getAppointmentServiceHistory(req.identity, req.params.appointmentId, req.query)
        return res.status(200).json({ status: 'success', data })
    } catch (error) {
        return sendAppointmentError(error, res, next)
    }
}

export function rescheduleAppointmentController(req, res, next) {
    return appointmentCommandResponse(rescheduleAppointment, req, res, next)
}
