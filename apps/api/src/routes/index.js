import { Router } from 'express'
import { authRouter } from '../modules/auth/auth.routes.js'
import { healthRouter } from '../modules/health/health.routes.js'
import { servicesRouter } from '../modules/services/services.routes.js'
import { staffRouter } from '../modules/staff/staff.routes.js'
import { appointmentsRouter } from '../modules/appointments/appointments.routes.js'
import { availabilityRouter } from '../modules/availability/availability.routes.js'
export const apiRouter = Router()

apiRouter.use('/api', healthRouter)
apiRouter.use('/api', servicesRouter)
apiRouter.use('/api', authRouter)
apiRouter.use('/api', staffRouter)
apiRouter.use('/api', appointmentsRouter)
apiRouter.use('/api', availabilityRouter)
