import { Router } from 'express'
import { authRouter } from '../modules/auth/auth.routes.js'
import { healthRouter } from '../modules/health/health.routes.js'
import { servicesRouter } from '../modules/services/services.routes.js'

export const apiRouter = Router()

apiRouter.use('/api', healthRouter)
apiRouter.use('/api', servicesRouter)
apiRouter.use('/api', authRouter)
