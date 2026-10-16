import mongoose from "mongoose";
import { AccountModel } from "../auth/accounts.model.js";
import { createStaffAccount } from "../auth/auth.service.js";
import {
  appointmentRepository,
  getAppointmentCoverageRange,
  toConflictAppointmentDto,
} from "./appointments.repository.js";
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_SERVICE_ID_LENGTH,
  MAX_STAFF_SERVICES,
  StaffModel,
} from "./staff.model.js";
import {
  findActiveShiftsByStaffId,
  findExistingServiceIds,
  findOverlappingActiveShifts,
  lockAndBumpStaffBookingRevision,
} from "./staff.repository.js";
import {
  MINUTE_MS,
  STAFF_SHIFT_STATUSES,
  StaffShiftModel,
  isValidLocalDateString,
  toHoChiMinhDate,
} from "./staff-shifts.model.js";

export class StaffError extends Error {
  constructor(message, { code = "STAFF_ERROR", status = 400, conflicts } = {}) {
    super(message);
    this.name = "StaffError";
    this.code = code;
    this.status = status;
    if (conflicts !== undefined) {
      this.conflicts = conflicts;
    }
  }
}

function fail(code, message, status = 400, extra = {}) {
  throw new StaffError(message, { code, status, ...extra });
}

// Chuyển đổi document Staff sang DTO allowlist, không làm lộ trường nội bộ hoặc dữ liệu nhạy cảm.
export function staffDto(staff) {
  return {
    staffId: String(staff._id),
    accountId: String(staff.accountId),
    displayName: staff.displayName,
    isActive: staff.isActive,
    serviceIds: [...(staff.serviceIds || [])],
    bookingRevision: staff.bookingRevision,
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt,
  };
}

// Chuyển đổi document StaffShift sang DTO allowlist nhất quán.
export function shiftDto(shift) {
  return {
    shiftId: String(shift._id),
    staffId: String(shift.staffId),
    localDate: shift.localDate,
    startAt: shift.startAt,
    endAt: shift.endAt,
    status: shift.status,
    createdAt: shift.createdAt,
    updatedAt: shift.updatedAt,
  };
}

function validateObjectId(
  value,
  code = "INVALID_OBJECT_ID",
  message = "ID không đúng định dạng ObjectId.",
) {
  if (value instanceof mongoose.Types.ObjectId) {
    return String(value);
  }
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) {
    fail(code, message, 400);
  }
  return value.toLowerCase();
}

function validateEmail(email) {
  if (
    typeof email !== "string" ||
    email.trim().length === 0 ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    fail(
      "INVALID_EMAIL",
      "Email không đúng định dạng hoặc vượt quá 254 ký tự.",
      400,
    );
  }
  return email.trim().toLowerCase();
}

function validateDisplayName(displayName) {
  if (
    typeof displayName !== "string" ||
    displayName.trim().length === 0 ||
    displayName.trim().length > MAX_DISPLAY_NAME_LENGTH
  ) {
    fail(
      "INVALID_DISPLAY_NAME",
      "Tên hiển thị không được để trống và tối đa 120 ký tự.",
      400,
    );
  }
  return displayName.trim();
}

function validateIsActive(isActive) {
  if (typeof isActive !== "boolean") {
    fail(
      "INVALID_IS_ACTIVE",
      "Trạng thái hoạt động (isActive) phải là kiểu boolean.",
      400,
    );
  }
  return isActive;
}

function validateServiceIds(serviceIds) {
  if (!Array.isArray(serviceIds) || serviceIds.length > MAX_STAFF_SERVICES) {
    fail(
      "INVALID_SERVICE_IDS",
      "Danh sách dịch vụ (serviceIds) phải là mảng từ 0 đến 50 phần tử.",
      400,
    );
  }
  for (const id of serviceIds) {
    if (
      typeof id !== "string" ||
      id.trim().length === 0 ||
      id.trim().length > MAX_SERVICE_ID_LENGTH ||
      id !== id.trim()
    ) {
      fail(
        "INVALID_SERVICE_IDS",
        "Mỗi mã dịch vụ phải là chuỗi hợp lệ và không chứa khoảng trắng thừa.",
        400,
      );
    }
  }
  if (new Set(serviceIds).size !== serviceIds.length) {
    fail(
      "INVALID_SERVICE_IDS",
      "Danh sách dịch vụ (serviceIds) không được chứa phần tử trùng lặp.",
      400,
    );
  }
  return [...serviceIds];
}

function parseMinuteDate(value, fieldName) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      fail(
        "INVALID_SHIFT_TIME",
        `Trường ${fieldName} không phải ngày giờ hợp lệ.`,
        400,
      );
    }
    if (value.getTime() % MINUTE_MS !== 0) {
      fail(
        "INVALID_SHIFT_TIME",
        `Trường ${fieldName} phải có độ chính xác theo phút (giây và mili-giây bằng 0).`,
        400,
      );
    }
    return new Date(value.getTime());
  }
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value.trim(),
    )
  ) {
    fail(
      "INVALID_SHIFT_TIME",
      `Trường ${fieldName} phải là chuỗi thời gian ISO 8601 hợp lệ.`,
      400,
    );
  }
  const timeMs = Date.parse(value.trim());
  if (!Number.isFinite(timeMs)) {
    fail(
      "INVALID_SHIFT_TIME",
      `Trường ${fieldName} không phải ngày giờ hợp lệ.`,
      400,
    );
  }
  if (timeMs % MINUTE_MS !== 0) {
    fail(
      "INVALID_SHIFT_TIME",
      `Trường ${fieldName} phải có độ chính xác theo phút (giây và mili-giây bằng 0).`,
      400,
    );
  }
  return new Date(timeMs);
}

// Kiểm tra toàn bộ ràng buộc thời gian của một ca làm việc theo múi giờ Asia/Ho_Chi_Minh.
function validateShiftWindow({ localDate, startAt, endAt }) {
  if (!isValidLocalDateString(localDate)) {
    fail(
      "INVALID_LOCAL_DATE",
      "Ngày làm việc (localDate) phải có định dạng YYYY-MM-DD hợp lệ.",
      400,
    );
  }
  const startDate = parseMinuteDate(startAt, "startAt");
  const endDate = parseMinuteDate(endAt, "endAt");

  if (endDate.getTime() <= startDate.getTime()) {
    fail(
      "INVALID_SHIFT_TIME",
      "Giờ kết thúc (endAt) phải lớn hơn giờ bắt đầu (startAt).",
      400,
    );
  }

  const startLocalDate = toHoChiMinhDate(startDate);
  if (localDate !== startLocalDate) {
    fail(
      "INVALID_LOCAL_DATE",
      "Trường localDate phải khớp với ngày của startAt theo múi giờ Asia/Ho_Chi_Minh.",
      400,
    );
  }

  const endBoundaryLocalDate = toHoChiMinhDate(endDate.getTime() - 1);
  if (endBoundaryLocalDate !== localDate) {
    fail(
      "INVALID_SHIFT_TIME",
      "Ca làm việc không được vượt quá ngày địa phương trừ đúng biên phải 00:00 của ngày kế tiếp.",
      400,
    );
  }

  return {
    localDate,
    startAt: startDate,
    endAt: endDate,
  };
}

function validateShiftStatus(status) {
  if (typeof status !== "string" || !STAFF_SHIFT_STATUSES.includes(status)) {
    fail(
      "INVALID_SHIFT_STATUS",
      "Trạng thái ca làm việc chỉ chấp nhận active hoặc cancelled.",
      400,
    );
  }
  return status;
}

function requireAuthenticatedIdentity(identity) {
  if (!identity || !identity.accountId || !Array.isArray(identity.roles)) {
    fail("UNAUTHORIZED", "Cần đăng nhập.", 401);
  }
}

function requireOwnerRole(identity) {
  requireAuthenticatedIdentity(identity);
  if (!identity.roles.includes("owner")) {
    fail("FORBIDDEN", "Chỉ chủ tiệm mới có quyền thực hiện thao tác này.", 403);
  }
}

function requireStaffReadRole(identity) {
  requireAuthenticatedIdentity(identity);
  if (!identity.roles.some((role) => role === "owner" || role === "stylist")) {
    fail("FORBIDDEN", "Không có quyền truy cập dữ liệu nhân sự nội bộ.", 403);
  }
}

async function verifyActiveOwnerInSession(identity, session) {
  requireOwnerRole(identity);
  const filter = {
    _id: identity.accountId,
    status: "active",
    roles: "owner",
    ...(identity.authRevision !== undefined
      ? { authRevision: identity.authRevision }
      : {}),
  };
  const owner = await AccountModel.findOne(filter).session(session).lean();
  if (!owner) {
    fail(
      "FORBIDDEN",
      "Chỉ chủ tiệm đang hoạt động mới có quyền thực hiện thao tác này.",
      403,
    );
  }
}

async function ensureServiceIdsExist(serviceIds, { session } = {}) {
  if (serviceIds.length === 0) return;
  const existingIds = await findExistingServiceIds(serviceIds, { session });
  if (existingIds.length !== serviceIds.length) {
    fail(
      "INVALID_SERVICE_IDS",
      "Một hoặc nhiều mã dịch vụ không tồn tại trong hệ thống.",
      400,
    );
  }
}

async function runInTransaction(callback) {
  try {
    return await mongoose.connection.transaction(callback, {
      readPreference: "primary",
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: 5000,
    });
  } catch (error) {
    if (error instanceof StaffError) {
      throw error;
    }
    if (error?.code === 11000) {
      fail(
        "STAFF_ALREADY_EXISTS",
        "Hồ sơ nhân viên cho tài khoản này đã tồn tại.",
        409,
      );
    }
    throw error;
  }
}

async function acquireStaffGuardOrFail(staffId, session) {
  const guardResult = await lockAndBumpStaffBookingRevision(staffId, session);
  if (guardResult.status === "not_found") {
    fail("STAFF_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên.", 404);
  }
  if (guardResult.status === "limit_exceeded") {
    fail(
      "BOOKING_REVISION_LIMIT",
      "Đã đạt giới hạn bookingRevision an toàn của nhân viên.",
      409,
    );
  }
  if (guardResult.status === "conflict" || !guardResult.staff) {
    fail(
      "STAFF_CONFLICT",
      "Hồ sơ nhân viên đang có cập nhật đồng thời. Vui lòng thử lại.",
      409,
    );
  }
  return guardResult.staff;
}

// Chủ tiệm tạo tài khoản stylist qua auth service rồi khởi tạo staff profile liên kết với accountId.
export async function createStaff(identity, input = {}) {
  requireOwnerRole(identity);
  const email = validateEmail(input.email);
  const displayName = validateDisplayName(input.displayName);
  const isActive =
    input.isActive === undefined ? true : validateIsActive(input.isActive);
  const serviceIds =
    input.serviceIds === undefined ? [] : validateServiceIds(input.serviceIds);

  await ensureServiceIdsExist(serviceIds);

  const account = await createStaffAccount({
    actorId: identity.accountId,
    actorRevision: identity.authRevision,
    email,
    ip: input.ip,
  });

  try {
    const staff = await StaffModel.create({
      accountId: account.accountId,
      displayName,
      isActive,
      serviceIds,
      bookingRevision: 0,
    });
    return staffDto(staff);
  } catch (error) {
    if (error?.code === 11000) {
      fail(
        "STAFF_ALREADY_EXISTS",
        "Hồ sơ nhân viên cho tài khoản này đã tồn tại.",
        409,
      );
    }
    throw error;
  }
}

// Danh sách hồ sơ nhân viên: chủ tiệm xem toàn bộ; stylist chỉ thấy hồ sơ của chính mình.
export async function listStaff(identity, query = {}) {
  requireStaffReadRole(identity);

  const allowedQueryKeys = ["isActive", "serviceId"];
  for (const key of Object.keys(query)) {
    if (!allowedQueryKeys.includes(key)) {
      fail("INVALID_QUERY", `Tham số truy vấn không hợp lệ: ${key}.`, 400);
    }
  }

  const filter = {};
  if (query.isActive !== undefined) {
    if (query.isActive !== "true" && query.isActive !== "false") {
      fail(
        "INVALID_QUERY",
        "Tham số isActive chỉ chấp nhận true hoặc false.",
        400,
      );
    }
    filter.isActive = query.isActive === "true";
  }
  if (query.serviceId !== undefined) {
    if (
      typeof query.serviceId !== "string" ||
      query.serviceId.trim().length === 0 ||
      query.serviceId.trim().length > MAX_SERVICE_ID_LENGTH
    ) {
      fail("INVALID_QUERY", "Tham số serviceId không hợp lệ.", 400);
    }
    filter.serviceIds = query.serviceId.trim();
  }

  if (!identity.roles.includes("owner")) {
    filter.accountId = identity.accountId;
  }

  const docs = await StaffModel.find(filter)
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  return docs.map(staffDto);
}

// Xem chi tiết hồ sơ nhân viên: owner xem mọi hồ sơ; stylist chỉ được xem hồ sơ có accountId của chính mình.
export async function getStaffById(identity, staffId) {
  requireStaffReadRole(identity);
  const validStaffId = validateObjectId(
    staffId,
    "INVALID_STAFF_ID",
    "Mã nhân viên không hợp lệ.",
  );

  const staff = await StaffModel.findById(validStaffId).lean();
  if (!identity.roles.includes("owner")) {
    if (!staff || String(staff.accountId) !== String(identity.accountId)) {
      fail("FORBIDDEN", "Stylist chỉ được xem hồ sơ của chính mình.", 403);
    }
    return staffDto(staff);
  }

  if (!staff) {
    fail("STAFF_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên.", 404);
  }
  return staffDto(staff);
}

// Chủ tiệm cập nhật hồ sơ nhân viên (displayName, serviceIds, isActive).
// Dùng bookingRevision guard (BR-04). Bỏ serviceIds không bị chặn bởi lịch cũ; đặt isActive=false bị chặn nếu còn lịch hiệu lực.
export async function updateStaff(identity, staffId, input = {}) {
  requireOwnerRole(identity);
  const validStaffId = validateObjectId(
    staffId,
    "INVALID_STAFF_ID",
    "Mã nhân viên không hợp lệ.",
  );

  const hasDisplayName = input.displayName !== undefined;
  const hasServiceIds = input.serviceIds !== undefined;
  const hasIsActive = input.isActive !== undefined;

  if (!hasDisplayName && !hasServiceIds && !hasIsActive) {
    fail(
      "INVALID_UPDATE",
      "Cần cung cấp ít nhất một trường cập nhật hợp lệ (displayName, serviceIds, isActive).",
      400,
    );
  }

  const updates = {};
  if (hasDisplayName) {
    updates.displayName = validateDisplayName(input.displayName);
  }
  if (hasServiceIds) {
    updates.serviceIds = validateServiceIds(input.serviceIds);
  }
  if (hasIsActive) {
    updates.isActive = validateIsActive(input.isActive);
  }

  return runInTransaction(async (session) => {
    await verifyActiveOwnerInSession(identity, session);

    if (hasServiceIds) {
      await ensureServiceIdsExist(updates.serviceIds, { session });
    }

    await acquireStaffGuardOrFail(validStaffId, session);

    if (hasIsActive && updates.isActive === false) {
      const effectiveAppointments =
        await appointmentRepository.findEffectiveByStaffId({
          staffId: validStaffId,
          session,
        });
      if (effectiveAppointments.length > 0) {
        fail(
          "APPOINTMENT_CONFLICT",
          "Không thể ngừng hoạt động nhân viên khi còn lịch hẹn confirmed hoặc in_progress chưa kết thúc.",
          409,
          { conflicts: effectiveAppointments.map(toConflictAppointmentDto) },
        );
      }
    }

    const updated = await StaffModel.findByIdAndUpdate(
      validStaffId,
      { $set: updates },
      { returnDocument: "after", session, runValidators: true },
    );
    if (!updated) {
      fail("STAFF_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên.", 404);
    }

    return staffDto(updated);
  });
}

// Đọc danh sách ca làm của nhân viên: owner xem mọi nhân viên; stylist chỉ đọc ca của chính mình.
export async function listStaffShifts(identity, staffId, query = {}) {
  requireStaffReadRole(identity);
  const validStaffId = validateObjectId(
    staffId,
    "INVALID_STAFF_ID",
    "Mã nhân viên không hợp lệ.",
  );

  const allowedQueryKeys = ["localDate", "fromDate", "toDate", "status"];
  for (const key of Object.keys(query)) {
    if (!allowedQueryKeys.includes(key)) {
      fail("INVALID_QUERY", `Tham số truy vấn không hợp lệ: ${key}.`, 400);
    }
  }

  const filter = { staffId: validStaffId };
  if (query.status !== undefined) {
    filter.status = validateShiftStatus(query.status);
  }
  if (query.localDate !== undefined) {
    if (!isValidLocalDateString(query.localDate)) {
      fail(
        "INVALID_LOCAL_DATE",
        "Tham số localDate phải có định dạng YYYY-MM-DD hợp lệ.",
        400,
      );
    }
    filter.localDate = query.localDate;
  }
  if (query.fromDate !== undefined || query.toDate !== undefined) {
    if (query.localDate !== undefined) {
      fail(
        "INVALID_QUERY",
        "Không dùng đồng thời localDate với khoảng fromDate/toDate.",
        400,
      );
    }
    const range = {};
    if (query.fromDate !== undefined) {
      if (!isValidLocalDateString(query.fromDate)) {
        fail(
          "INVALID_LOCAL_DATE",
          "Tham số fromDate phải có định dạng YYYY-MM-DD hợp lệ.",
          400,
        );
      }
      range.$gte = query.fromDate;
    }
    if (query.toDate !== undefined) {
      if (!isValidLocalDateString(query.toDate)) {
        fail(
          "INVALID_LOCAL_DATE",
          "Tham số toDate phải có định dạng YYYY-MM-DD hợp lệ.",
          400,
        );
      }
      range.$lte = query.toDate;
    }
    if (range.$gte && range.$lte && range.$gte > range.$lte) {
      fail("INVALID_QUERY", "Tham số fromDate không được lớn hơn toDate.", 400);
    }
    filter.localDate = range;
  }

  const staff = await StaffModel.findById(validStaffId).lean();
  if (!identity.roles.includes("owner")) {
    if (!staff || String(staff.accountId) !== String(identity.accountId)) {
      fail(
        "FORBIDDEN",
        "Stylist chỉ được xem ca làm việc của chính mình.",
        403,
      );
    }
  } else if (!staff) {
    fail("STAFF_NOT_FOUND", "Không tìm thấy hồ sơ nhân viên.", 404);
  }

  const shifts = await StaffShiftModel.find(filter)
    .sort({ startAt: 1, _id: 1 })
    .lean();
  return shifts.map(shiftDto);
}

// Chủ tiệm tạo ca làm mới cho nhân viên dưới guard bookingRevision và kiểm tra chống chồng ca active [startAt, endAt).
export async function createStaffShift(identity, staffId, input = {}) {
  requireOwnerRole(identity);
  const validStaffId = validateObjectId(
    staffId,
    "INVALID_STAFF_ID",
    "Mã nhân viên không hợp lệ.",
  );
  const { localDate, startAt, endAt } = validateShiftWindow({
    localDate: input.localDate,
    startAt: input.startAt,
    endAt: input.endAt,
  });

  return runInTransaction(async (session) => {
    await verifyActiveOwnerInSession(identity, session);
    await acquireStaffGuardOrFail(validStaffId, session);

    const overlapping = await findOverlappingActiveShifts({
      staffId: validStaffId,
      startAt,
      endAt,
      session,
    });
    if (overlapping.length > 0) {
      fail(
        "SHIFT_OVERLAP",
        "Ca làm việc bị chồng với một ca đang hoạt động khác của nhân viên này.",
        409,
      );
    }

    const [createdShift] = await StaffShiftModel.create(
      [
        {
          staffId: validStaffId,
          localDate,
          startAt,
          endAt,
          status: "active",
        },
      ],
      { session },
    );

    return shiftDto(createdShift);
  });
}

// Kiểm tra xem tập ca active sau khi sửa/hủy có làm lịch hẹn hiệu lực (confirmed, in_progress) mất coverage hay không.
function findUncoveredEffectiveAppointments({
  effectiveAppointments,
  existingShift,
  nextLocalDate,
  resultingActiveShifts,
}) {
  const oldStartMs = new Date(existingShift.startAt).getTime();
  const oldEndMs = new Date(existingShift.endAt).getTime();
  const affectedDates = new Set([existingShift.localDate, nextLocalDate]);

  return effectiveAppointments.filter((appointment) => {
    const { fromMs, untilMs } = getAppointmentCoverageRange(appointment);
    if (!Number.isFinite(fromMs) || !Number.isFinite(untilMs)) {
      return false;
    }
    const apptLocalDate = appointment.localDate ?? toHoChiMinhDate(fromMs);
    const overlapsOldShift = fromMs < oldEndMs && untilMs > oldStartMs;
    const onAffectedDate = affectedDates.has(apptLocalDate);

    if (!overlapsOldShift && !onAffectedDate) {
      return false;
    }

    const isCovered = resultingActiveShifts.some((shift) => {
      const shiftStartMs = new Date(shift.startAt).getTime();
      const shiftEndMs = new Date(shift.endAt).getTime();
      return shiftStartMs <= fromMs && shiftEndMs >= untilMs;
    });

    return !isCovered;
  });
}

// Chủ tiệm cập nhật hoặc hủy ca làm việc.
// Đọc lại lịch hẹn hiệu lực dưới guard bookingRevision; nếu có lịch bị mất coverage thì không lưu và trả danh sách xung đột.
export async function updateStaffShift(identity, staffId, shiftId, input = {}) {
  requireOwnerRole(identity);
  const validStaffId = validateObjectId(
    staffId,
    "INVALID_STAFF_ID",
    "Mã nhân viên không hợp lệ.",
  );
  const validShiftId = validateObjectId(
    shiftId,
    "INVALID_SHIFT_ID",
    "Mã ca làm việc không hợp lệ.",
  );

  const hasLocalDate = input.localDate !== undefined;
  const hasStartAt = input.startAt !== undefined;
  const hasEndAt = input.endAt !== undefined;
  const hasStatus = input.status !== undefined;

  if (!hasLocalDate && !hasStartAt && !hasEndAt && !hasStatus) {
    fail(
      "INVALID_UPDATE",
      "Cần cung cấp ít nhất một trường cập nhật hợp lệ (localDate, startAt, endAt, status).",
      400,
    );
  }

  const requestedStatus = hasStatus
    ? validateShiftStatus(input.status)
    : undefined;

  return runInTransaction(async (session) => {
    await verifyActiveOwnerInSession(identity, session);
    await acquireStaffGuardOrFail(validStaffId, session);

    const existingShift = await StaffShiftModel.findOne({
      _id: validShiftId,
      staffId: validStaffId,
    }).session(session);

    if (!existingShift) {
      fail(
        "SHIFT_NOT_FOUND",
        "Không tìm thấy ca làm việc của nhân viên này.",
        404,
      );
    }

    const nextStatus = requestedStatus ?? existingShift.status;
    const mergedStartAt = hasStartAt ? input.startAt : existingShift.startAt;
    const mergedEndAt = hasEndAt ? input.endAt : existingShift.endAt;
    const mergedLocalDate = hasLocalDate
      ? input.localDate
      : existingShift.localDate;

    const {
      localDate: nextLocalDate,
      startAt: nextStartAt,
      endAt: nextEndAt,
    } = validateShiftWindow({
      localDate: mergedLocalDate,
      startAt: mergedStartAt,
      endAt: mergedEndAt,
    });

    if (nextStatus === "active") {
      const overlapping = await findOverlappingActiveShifts({
        staffId: validStaffId,
        startAt: nextStartAt,
        endAt: nextEndAt,
        excludeShiftId: existingShift._id,
        session,
      });
      if (overlapping.length > 0) {
        fail(
          "SHIFT_OVERLAP",
          "Ca làm việc sau khi sửa bị chồng với một ca đang hoạt động khác.",
          409,
        );
      }
    }

    if (existingShift.status === "active") {
      const activeShifts = await findActiveShiftsByStaffId(validStaffId, {
        session,
      });
      const otherActiveShifts = activeShifts.filter(
        (shift) => String(shift._id) !== String(existingShift._id),
      );
      const resultingActiveShifts =
        nextStatus === "active"
          ? [
              ...otherActiveShifts,
              {
                _id: existingShift._id,
                staffId: validStaffId,
                localDate: nextLocalDate,
                startAt: nextStartAt,
                endAt: nextEndAt,
                status: "active",
              },
            ]
          : otherActiveShifts;

      const effectiveAppointments =
        await appointmentRepository.findEffectiveByStaffId({
          staffId: validStaffId,
          session,
        });

      const uncovered = findUncoveredEffectiveAppointments({
        effectiveAppointments,
        existingShift,
        nextLocalDate,
        resultingActiveShifts,
      });

      if (uncovered.length > 0) {
        fail(
          "APPOINTMENT_CONFLICT",
          "Không thể sửa hoặc hủy ca làm việc vì có lịch hẹn hiệu lực nằm ngoài khoảng ca sau thay đổi.",
          409,
          { conflicts: uncovered.map(toConflictAppointmentDto) },
        );
      }
    }

    const updatedShift = await StaffShiftModel.findByIdAndUpdate(
      existingShift._id,
      {
        $set: {
          localDate: nextLocalDate,
          startAt: nextStartAt,
          endAt: nextEndAt,
          status: nextStatus,
        },
      },
      { returnDocument: "after", session, runValidators: true },
    );

    return shiftDto(updatedShift);
  });
}

// Hủy ca làm việc (chuyển status sang cancelled, giữ lại document lịch sử, kiểm tra lịch hẹn bị ảnh hưởng).
export async function cancelStaffShift(identity, staffId, shiftId) {
  return updateStaffShift(identity, staffId, shiftId, { status: "cancelled" });
}
