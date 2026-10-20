import {Router} from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.js";
import {
    listAppointmentsController,
    getAppointmentDetailController,
    getAppointmentServiceHistoryController,
    cancelAppointmentController,
    markAppointmentNoShowController,
} from "./appointments.controller.js";

export const appointmentsRouter = Router();

appointmentsRouter.get('/appointments', requireAuth,  requireRoles('customer', 'stylist', 'owner'), listAppointmentsController);
appointmentsRouter.get('/appointments/:appointmentId', requireAuth,  requireRoles('customer', 'stylist', 'owner'), getAppointmentDetailController);
appointmentsRouter.post('/appointments/:appointmentId/cancel', requireAuth,  requireRoles('customer', 'owner'), cancelAppointmentController);
appointmentsRouter.post('/appointments/:appointmentId/no-show', requireAuth, requireRoles('owner'), markAppointmentNoShowController,)

// Stylist theo lich duoc giao; Owner co quyen toan tiem.
appointmentsRouter.get(
  '/appointments/:appointmentId/service-history',
  requireAuth,
  requireRoles('stylist', 'owner'),
  getAppointmentServiceHistoryController,
)
