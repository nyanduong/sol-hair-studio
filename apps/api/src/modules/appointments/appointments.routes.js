import {Router} from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.js";
import {  listAppointmentsController, } from "./appointments.controller.js";

export const appointmentsRouter = Router();

appointmentsRouter.get('/appointments', requireAuth,  requireRoles('customer', 'stylist', 'owner'), listAppointmentsController);