import { Router } from "express";
import { requireAuth, requireRoles } from "../../middlewares/auth.js";
import { staffHandler } from "./staff.controller.js";
import * as staffService from "./staff.service.js";

// Khai báo các endpoint REST quản lý hồ sơ nhân viên và ca làm việc dưới /api/staff.
export const staffRouter = Router();

staffRouter.get(
  "/staff",
  requireAuth,
  requireRoles("owner", "stylist"),
  staffHandler(({ identity, query }) =>
    staffService.listStaff(identity, query),
  ),
);

staffRouter.post(
  "/staff",
  requireAuth,
  requireRoles("owner"),
  staffHandler(
    ({ identity, input }) => staffService.createStaff(identity, input),
    {
      status: 201,
      fields: ["email", "displayName", "serviceIds", "isActive"],
    },
  ),
);

staffRouter.get(
  "/staff/:staffId",
  requireAuth,
  requireRoles("owner", "stylist"),
  staffHandler(({ identity, params }) =>
    staffService.getStaffById(identity, params.staffId),
  ),
);

staffRouter.patch(
  "/staff/:staffId",
  requireAuth,
  requireRoles("owner"),
  staffHandler(
    ({ identity, params, input }) =>
      staffService.updateStaff(identity, params.staffId, input),
    {
      fields: ["displayName", "serviceIds", "isActive"],
    },
  ),
);

staffRouter.get(
  "/staff/:staffId/shifts",
  requireAuth,
  requireRoles("owner", "stylist"),
  staffHandler(({ identity, params, query }) =>
    staffService.listStaffShifts(identity, params.staffId, query),
  ),
);

staffRouter.post(
  "/staff/:staffId/shifts",
  requireAuth,
  requireRoles("owner"),
  staffHandler(
    ({ identity, params, input }) =>
      staffService.createStaffShift(identity, params.staffId, input),
    {
      status: 201,
      fields: ["localDate", "startAt", "endAt"],
    },
  ),
);

staffRouter.patch(
  "/staff/:staffId/shifts/:shiftId",
  requireAuth,
  requireRoles("owner"),
  staffHandler(
    ({ identity, params, input }) =>
      staffService.updateStaffShift(
        identity,
        params.staffId,
        params.shiftId,
        input,
      ),
    {
      fields: ["localDate", "startAt", "endAt", "status"],
    },
  ),
);

staffRouter.delete(
  "/staff/:staffId/shifts/:shiftId",
  requireAuth,
  requireRoles("owner"),
  staffHandler(({ identity, params }) =>
    staffService.cancelStaffShift(identity, params.staffId, params.shiftId),
  ),
);
