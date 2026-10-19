import { AppointmentError, listAppointments } from "./appointments.service.js";

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
        if(error instanceof AppointmentError) {
            return res.status(error.status).json({
                status: 'error',
                code: error.code,
                message: error.message
            })
        }
        return next(error)
    }
}
