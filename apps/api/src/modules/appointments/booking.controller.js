import { AppointmentError } from './appointments.service.js'
import { createBooking, lookupBookingCustomers } from './booking.service.js'

async function respond(req, res, next, operation, status) {
  res.set('Cache-Control', 'no-store')
  try {
    return res.status(status).json({ status: 'success', data: await operation() })
  } catch (error) {
    if (!(error instanceof AppointmentError)) return next(error)
    return res
      .status(error.status)
      .json({ status: 'error', code: error.code, message: error.message })
  }
}
export function createBookingController(req, res, next) {
  return respond(
    req,
    res,
    next,
    () => createBooking(req.identity, req.body, req.get('Idempotency-Key')),
    201,
  )
}
export function lookupBookingCustomersController(req, res, next) {
  return respond(req, res, next, () => lookupBookingCustomers(req.query), 200)
}
