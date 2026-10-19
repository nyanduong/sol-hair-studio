import {Router} from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.js";
import {  listAppointmentsController, getAppointmentDetailController} from "./appointments.controller.js";

export const appointmentsRouter = Router();

appointmentsRouter.get('/appointments', requireAuth,  requireRoles('customer', 'stylist', 'owner'), listAppointmentsController);
appointmentsRouter.get('/appointments/:appointmentId', requireAuth,  requireRoles('customer', 'stylist', 'owner'), getAppointmentDetailController);