import { AppointmentError, listCustomerAppointments, parseCustomerAppointmentQuery } from "./appointments.service.js";

export async function listCustomerAppointmentsController(req, res, next) {

    res.set('Cache-Control', 'no-store')

    try {
        const options = parseCustomerAppointmentQuery(req.query);
        const result = await listCustomerAppointments(
            req.identity,
            options
        )
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