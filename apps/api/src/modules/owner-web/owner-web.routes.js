import { Router, urlencoded } from 'express'
import { requireAuth, requireRoles } from '../../middlewares/auth.js'
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
} from './owner-web.controller.js'
export const ownerWebRouter = Router()

ownerWebRouter.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
})

ownerWebRouter.get('/setup', (req, res) => {
    return res.render('owner/setup', {
        title: 'Sol Hair Studio',
        message: 'Express đã render EJS thành công.',
    })
})
ownerWebRouter.get('/appointments',requireAuth,requireRoles('owner'),showOwnerAppointments)
ownerWebRouter.get('/appointments/:appointmentId', requireAuth, requireRoles('owner'), showOwnerAppointmentDetail)
ownerWebRouter.post('/appointments/:appointmentId/cancel', requireAuth, requireRoles('owner'), urlencoded({ extended: false, limit: '10kb' }), submitOwnerCancellation)
ownerWebRouter.get('/appointments/:appointmentId/reschedule', requireAuth, requireRoles('owner'), showOwnerReschedule,)
ownerWebRouter.post('/appointments/:appointmentId/reschedule', requireAuth, requireRoles('owner'), urlencoded({ extended: false, limit: '10kb' }), submitOwnerReschedule)
ownerWebRouter.post('/appointments/:appointmentId/no-show', requireAuth, requireRoles('owner'), urlencoded({ extended: false, limit: '10kb' }), submitOwnerNoShow)
ownerWebRouter.post( '/appointments/:appointmentId/start', requireAuth, requireRoles('owner'), urlencoded({ extended: false, limit: '10kb' }), submitOwnerStart,)
ownerWebRouter.post( '/appointments/:appointmentId/complete', requireAuth, requireRoles('owner'), urlencoded({ extended: false, limit: '10kb' }), submitOwnerComplete)
ownerWebRouter.post('/appointments/:appointmentId/eta', requireAuth, requireRoles('owner'), urlencoded({ extended: false, limit: '10kb' }), submitOwnerEta)
ownerWebRouter.get('/appointments/:appointmentId/audit',requireAuth,requireRoles('owner'),showOwnerAudit)