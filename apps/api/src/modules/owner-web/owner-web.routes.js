import { Router, urlencoded } from 'express'
import { requireAuth, requireRoles } from '../../middlewares/auth.js'
import { showOwnerAppointments, showOwnerAppointmentDetail, submitOwnerCancellation,} from './owner-web.controller.js'
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