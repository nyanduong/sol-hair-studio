import {Router} from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.js";
import { listCustomerAppointmentsController } from "./appointments.controller.js";

export const appointmentsRouter = Router();

appointmentsRouter.get('/appointments', requireAuth, requireRoles('customer'), listCustomerAppointmentsController);