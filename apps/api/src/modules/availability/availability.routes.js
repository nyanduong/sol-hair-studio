import { Router } from 'express'
import { requireAuth, requireRoles } from '../../middlewares/auth.js'
import { getAvailabilityController } from './availability.controller.js'

export const availabilityRouter = Router()
availabilityRouter.get(
  '/availability',
  requireAuth,
  requireRoles('customer', 'owner'),
  getAvailabilityController,
)
