import { Router } from 'express'
import { authRouter } from '../modules/auth/auth.routes.js'
import { healthRouter } from '../modules/health/health.routes.js'
import { servicesRouter } from '../modules/services/services.routes.js'
import { staffRouter } from '../modules/staff/staff.routes.js'

export const apiRouter = Router()

apiRouter.use('/api', healthRouter)
apiRouter.use('/api', servicesRouter)
apiRouter.use('/api', authRouter)
apiRouter.use('/api', staffRouter)
