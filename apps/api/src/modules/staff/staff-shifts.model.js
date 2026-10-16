import mongoose from "mongoose";

export const STAFF_SHIFT_STATUSES = ["active", "cancelled"];
export const HO_CHI_MINH_OFFSET_MS = 7 * 60 * 60 * 1000;
export const MINUTE_MS = 60 * 1000;

// Chuyển mốc Date sang chuỗi ngày YYYY-MM-DD theo múi giờ Asia/Ho_Chi_Minh (UTC+07:00).
export function toHoChiMinhDate(dateInput) {
  const timeMs =
    dateInput instanceof Date ? dateInput.getTime() : Number(dateInput);
  if (!Number.isFinite(timeMs)) return null;
  return new Date(timeMs + HO_CHI_MINH_OFFSET_MS).toISOString().slice(0, 10);
}

// Kiểm tra chuỗi YYYY-MM-DD có phải ngày lịch hợp lệ hay không.
export function isValidLocalDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return false;
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

function isMinutePrecisionDate(val) {
  return (
    val instanceof Date &&
    !Number.isNaN(val.getTime()) &&
    val.getTime() % MINUTE_MS === 0
  );
}

// Lược đồ ca làm việc theo ngày thực tế (staff_shifts).
// Giữ lại document khi hủy (status = 'cancelled') để đối chiếu lịch sử.
const staffShiftSchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      validate: {
        validator(val) {
          return val !== null;
        },
        message: "staffId cannot be null",
      },
    },
    localDate: {
      type: String,
      required: true,
      trim: true,
      validate: [
        {
          validator(val) {
            return isValidLocalDateString(val);
          },
          message: "localDate must be a valid YYYY-MM-DD calendar date",
        },
        {
          validator(val) {
            if (!isValidLocalDateString(val)) return false;
            if (
              !(this.startAt instanceof Date) ||
              Number.isNaN(this.startAt.getTime())
            ) {
              return true;
            }
            return toHoChiMinhDate(this.startAt) === val;
          },
          message: "localDate must match startAt date in Asia/Ho_Chi_Minh",
        },
      ],
    },
    startAt: {
      type: Date,
      required: true,
      validate: {
        validator(val) {
          return isMinutePrecisionDate(val);
        },
        message: "startAt must be a valid Date with minute precision",
      },
    },
    endAt: {
      type: Date,
      required: true,
      validate: [
        {
          validator(val) {
            return isMinutePrecisionDate(val);
          },
          message: "endAt must be a valid Date with minute precision",
        },
        {
          validator(val) {
            if (
              !isMinutePrecisionDate(val) ||
              !isMinutePrecisionDate(this.startAt)
            ) {
              return true;
            }
            return val.getTime() > this.startAt.getTime();
          },
          message: "endAt must be greater than startAt",
        },
        {
          validator(val) {
            if (
              !isMinutePrecisionDate(val) ||
              !isMinutePrecisionDate(this.startAt)
            ) {
              return true;
            }
            if (val.getTime() <= this.startAt.getTime()) {
              return true;
            }
            const startLocal = toHoChiMinhDate(this.startAt);
            const lastMillisecondLocal = toHoChiMinhDate(val.getTime() - 1);
            return lastMillisecondLocal === startLocal;
          },
          message:
            "shift cannot cross local day boundary except right boundary 00:00 of the next day",
        },
      ],
    },
    status: {
      type: String,
      required: true,
      enum: STAFF_SHIFT_STATUSES,
      default: "active",
    },
  },
  { timestamps: true, versionKey: false, collection: "staff_shifts" },
);

// Index phục vụ đọc ca làm việc của nhân viên theo trạng thái và giờ bắt đầu.
staffShiftSchema.index({ staffId: 1, status: 1, startAt: 1 });

export const StaffShiftModel =
  mongoose.models.StaffShift ?? mongoose.model("StaffShift", staffShiftSchema);

export { staffShiftSchema };
