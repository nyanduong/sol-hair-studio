import { Router } from 'express'
import { adminRouter } from '../modules/admin/admin.routes.js'
import { appointmentsRouter } from '../modules/appointments/appointments.routes.js'
import { authRouter } from '../modules/auth/auth.routes.js'
import { availabilityRouter } from '../modules/availability/availability.routes.js'
import { healthRouter } from '../modules/health/health.routes.js'
import { servicesRouter } from '../modules/services/services.routes.js'
import { staffRouter } from '../modules/staff/staff.routes.js'

export const apiRouter = Router()

apiRouter.use(adminRouter)
apiRouter.use('/api', healthRouter)
apiRouter.use('/api', servicesRouter)
apiRouter.use('/api', authRouter)
apiRouter.use('/api', staffRouter)
apiRouter.use('/api', appointmentsRouter)
apiRouter.use('/api', availabilityRouter)
