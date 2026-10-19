import mongoose from "mongoose";
import { toHoChiMinhDate } from "./staff-shifts.model.js";

export const EFFECTIVE_APPOINTMENT_STATUSES = ["confirmed", "in_progress"];

let customAppointmentReader = null;

// Cho phép test hoặc module booking sau này gắn reader tùy chỉnh mà không nhân bản model/service booking.
export function setAppointmentReader(reader) {
  customAppointmentReader = reader;
}

export function resetAppointmentReader() {
  customAppointmentReader = null;
}

// Tính khoảng thời gian vận hành [fromMs, untilMs) mà một lịch hẹn hiệu lực đòi hỏi ca làm việc phải bao phủ.
// Theo BR-02: confirmed dùng [startAt, endAt + buffer], in_progress dùng [min(startAt, startedAt), max(endAt, estimatedEndAt) + buffer].
export function getAppointmentCoverageRange(appointment) {
  const startMs = appointment.startAt
    ? new Date(appointment.startAt).getTime()
    : undefined;
  const endMs = appointment.endAt
    ? new Date(appointment.endAt).getTime()
    : undefined;
  const occupiedFromMs = appointment.occupiedFrom
    ? new Date(appointment.occupiedFrom).getTime()
    : undefined;
  const occupiedUntilMs = appointment.occupiedUntil
    ? new Date(appointment.occupiedUntil).getTime()
    : undefined;
  const startedMs = appointment.startedAt
    ? new Date(appointment.startedAt).getTime()
    : undefined;
  const etaMs = appointment.estimatedEndAt
    ? new Date(appointment.estimatedEndAt).getTime()
    : undefined;
  const bufferMs =
    typeof appointment.bufferAfterMinutes === "number"
      ? appointment.bufferAfterMinutes * 60_000
      : 0;

  const fromCandidates = [
    startMs,
    occupiedFromMs,
    appointment.status === "in_progress" ? startedMs : undefined,
  ].filter((val) => Number.isFinite(val));

  const baseEndCandidates = [
    endMs,
    appointment.status === "in_progress" ? etaMs : undefined,
  ].filter((val) => Number.isFinite(val));
  const baseEndMs =
    baseEndCandidates.length > 0
      ? Math.max(...baseEndCandidates) + bufferMs
      : undefined;
  const untilCandidates = [occupiedUntilMs, baseEndMs].filter((val) =>
    Number.isFinite(val),
  );

  return {
    fromMs: Math.min(...fromCandidates),
    untilMs: Math.max(...untilCandidates),
  };
}

// Chuyển đổi appointment xung đột sang DTO allowlist an toàn cho chủ tiệm xử lý, không lộ dữ liệu nhạy cảm.
export function toConflictAppointmentDto(appointment) {
  const { fromMs, untilMs } = getAppointmentCoverageRange(appointment);
  const startAt = new Date(appointment.startAt ?? fromMs);
  const endAt = new Date(appointment.endAt ?? untilMs);

  return {
    appointmentId: String(
      appointment._id ?? appointment.appointmentId ?? appointment.id,
    ),
    staffId: String(appointment.staffId),
    status: appointment.status,
    localDate: appointment.localDate ?? toHoChiMinhDate(startAt),
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    occupiedFrom: new Date(fromMs).toISOString(),
    occupiedUntil: new Date(untilMs).toISOString(),
  };
}

// Đọc lại các lịch hẹn còn hiệu lực (confirmed, in_progress) của một nhân viên trong cùng session/transaction.
// Các trạng thái completed, cancelled, no_show không chặn việc sửa/hủy ca hoặc ngừng nhân viên.
export async function findEffectiveAppointmentsByStaffId({
  staffId,
  session,
} = {}) {
  if (customAppointmentReader) {
    const fn =
      typeof customAppointmentReader === "function"
        ? customAppointmentReader
        : customAppointmentReader.findEffectiveByStaffId;
    const docs = await fn({ staffId: String(staffId), session });
    return (docs || []).filter(
      (doc) =>
        String(doc.staffId) === String(staffId) &&
        EFFECTIVE_APPOINTMENT_STATUSES.includes(doc.status),
    );
  }

  if (!mongoose.connection?.db) {
    return [];
  }

  const objectId = new mongoose.Types.ObjectId(String(staffId));
  const docs = await mongoose.connection.db
    .collection("appointments")
    .find(
      {
        staffId: { $in: [objectId, String(staffId)] },
        status: { $in: EFFECTIVE_APPOINTMENT_STATUSES },
      },
      session ? { session } : undefined,
    )
    .sort({ startAt: 1, _id: 1 })
    .toArray();

  return docs;
}

export const appointmentRepository = {
  findEffectiveByStaffId: findEffectiveAppointmentsByStaffId,
};
