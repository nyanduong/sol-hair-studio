import { Router } from 'express'
import { requireAuth, requireRoles } from '../../middlewares/auth.js'
import {
    listAppointmentsController,
    getCustomerRescheduleOptionsController,
    getAppointmentDetailController,
    getAppointmentServiceHistoryController,
    cancelAppointmentController,
    markAppointmentNoShowController,
    rescheduleAppointmentController,
    startAppointmentController,
    completeAppointmentController,
    updateAppointmentEtaController,
    correctAppointmentStartController,
    correctAppointmentCompletionController,
} from "./appointments.controller.js";

import { createBookingController, lookupBookingCustomersController } from './booking.controller.js'

export const appointmentsRouter = Router()

appointmentsRouter.post('/appointments', requireAuth, requireRoles('customer', 'owner'), createBookingController,)
appointmentsRouter.get( '/customers', requireAuth, requireRoles('owner'), lookupBookingCustomersController,)
appointmentsRouter.get('/appointments', requireAuth,  requireRoles('customer', 'stylist', 'owner'), listAppointmentsController);
appointmentsRouter.get('/appointments/:appointmentId', requireAuth,  requireRoles('customer', 'stylist', 'owner'), getAppointmentDetailController);
appointmentsRouter.post('/appointments/:appointmentId/cancel', requireAuth,  requireRoles('customer', 'owner'), cancelAppointmentController);
appointmentsRouter.post('/appointments/:appointmentId/no-show', requireAuth, requireRoles('owner'), markAppointmentNoShowController,)
appointmentsRouter.get('/appointments/:appointmentId/service-history', requireAuth, requireRoles('stylist', 'owner'),getAppointmentServiceHistoryController)
appointmentsRouter.get('/appointments/:appointmentId/reschedule-options', requireAuth, requireRoles('customer'), getCustomerRescheduleOptionsController)
appointmentsRouter.post('/appointments/:appointmentId/reschedule', requireAuth, requireRoles('customer', 'owner'), rescheduleAppointmentController)
appointmentsRouter.post('/appointments/:appointmentId/start', requireAuth, requireRoles('stylist', 'owner'), startAppointmentController)
appointmentsRouter.post('/appointments/:appointmentId/complete', requireAuth, requireRoles('stylist', 'owner'), completeAppointmentController)
appointmentsRouter.post('/appointments/:appointmentId/eta', requireAuth, requireRoles('stylist', 'owner'), updateAppointmentEtaController)
appointmentsRouter.post('/appointments/:appointmentId/correct-start', requireAuth, requireRoles('owner'), correctAppointmentStartController)
appointmentsRouter.post('/appointments/:appointmentId/correct-complete', requireAuth, requireRoles('owner'), correctAppointmentCompletionController)
