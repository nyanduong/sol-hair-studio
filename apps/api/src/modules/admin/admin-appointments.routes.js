import { Router, urlencoded } from 'express'
import { requireAdminAuth } from './admin.middleware.js'
import {
    showOwnerAppointments,
    showOwnerAppointmentDetail,
    submitOwnerCancellation,
    showOwnerReschedule,
    submitOwnerReschedule,
    submitOwnerNoShow,
    submitOwnerStart,
    submitOwnerComplete,
    submitOwnerEta,
    showOwnerAudit,
    submitOwnerCorrectStart,
    submitOwnerCorrectComplete,
} from './admin-appointments.controller.js'
export const adminAppointmentsRouter = Router()

adminAppointmentsRouter.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    res.locals.appointmentDialog = req.get('X-Appointment-Dialog') === 'true'
    res.locals.ownerPersonal = req.query.view === 'mine'
    res.locals.ownerContext = Object.fromEntries(
        ['view', 'localDate', 'staffId', 'status']
            .filter(key => typeof req.query[key] === 'string')
            .map(key => [key, req.query[key]]),
    )
    res.locals.ownerUrl = (path, changes = {}) => {
        const query = new URLSearchParams()
        for (const key of ['view', 'localDate', 'staffId', 'status']) {
            if (typeof req.query[key] === 'string' && req.query[key]) {
                query.set(key, req.query[key])
            }
        }
        for (const [key, value] of Object.entries(changes)) {
            if (value === undefined || value === null || value === '') query.delete(key)
            else query.set(key, String(value))
        }
        return path + (query.size ? '?' + query.toString() : '')
    }
    next()
})

adminAppointmentsRouter.get('/appointments/setup', requireAdminAuth, (req, res) => {
    return res.render('admin/appointments/setup', {
        title: 'Sol Hair Studio',
        message: 'Express đã render EJS thành công.',
    })
})
adminAppointmentsRouter.get('/appointments', requireAdminAuth, showOwnerAppointments)
adminAppointmentsRouter.get('/appointments/:appointmentId', requireAdminAuth, showOwnerAppointmentDetail)
adminAppointmentsRouter.post('/appointments/:appointmentId/cancel', requireAdminAuth, urlencoded({ extended: false, limit: '10kb' }), submitOwnerCancellation)
adminAppointmentsRouter.get('/appointments/:appointmentId/reschedule', requireAdminAuth, showOwnerReschedule)
adminAppointmentsRouter.post('/appointments/:appointmentId/reschedule', requireAdminAuth, urlencoded({ extended: false, limit: '10kb' }), submitOwnerReschedule)
adminAppointmentsRouter.post('/appointments/:appointmentId/no-show', requireAdminAuth, urlencoded({ extended: false, limit: '10kb' }), submitOwnerNoShow)
adminAppointmentsRouter.post('/appointments/:appointmentId/start', requireAdminAuth, urlencoded({ extended: false, limit: '10kb' }), submitOwnerStart)
adminAppointmentsRouter.post('/appointments/:appointmentId/complete', requireAdminAuth, urlencoded({ extended: false, limit: '10kb' }), submitOwnerComplete)
adminAppointmentsRouter.post('/appointments/:appointmentId/eta', requireAdminAuth, urlencoded({ extended: false, limit: '10kb' }), submitOwnerEta)
adminAppointmentsRouter.get('/appointments/:appointmentId/audit', requireAdminAuth, showOwnerAudit)
adminAppointmentsRouter.post('/appointments/:appointmentId/correct-start', requireAdminAuth, urlencoded({ extended: false, limit: '10kb' }), submitOwnerCorrectStart)
adminAppointmentsRouter.post('/appointments/:appointmentId/correct-complete', requireAdminAuth, urlencoded({ extended: false, limit: '10kb' }), submitOwnerCorrectComplete)
