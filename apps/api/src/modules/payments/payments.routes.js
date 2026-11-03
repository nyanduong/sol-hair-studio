import { Router } from 'express'
import { requireAuth, requireRoles } from '../../middlewares/auth.js'
import { AppointmentError } from '../appointments/appointments.service.js'
import { readPayment, confirmPayment } from './payments.service.js'
export const paymentsRouter = Router()
const handle = operation => async (req, res, next) => {
  try { res.json({ status: 'success', data: await operation(req) }) }
  catch (error) {
    if (error instanceof AppointmentError) return res.status(error.status).json({ status: 'error', code: error.code, message: error.message })
    next(error)
  }
}
paymentsRouter.get('/appointments/:appointmentId/payment', requireAuth, requireRoles('owner', 'customer'), handle(req => readPayment(req.identity, req.params.appointmentId)))
paymentsRouter.post('/appointments/:appointmentId/payment/confirm', requireAuth, requireRoles('owner'), handle(req => confirmPayment(req.identity, req.params.appointmentId, req.body, req.get('Idempotency-Key'))))
