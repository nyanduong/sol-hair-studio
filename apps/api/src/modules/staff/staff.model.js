import mongoose from "mongoose";

export const MAX_STAFF_SERVICES = 50;
export const MAX_DISPLAY_NAME_LENGTH = 120;
export const MAX_SERVICE_ID_LENGTH = 80;

// Lược đồ hồ sơ nhân viên (stylist hoặc chủ tiệm kiêm stylist) theo baseline SOL-016.
// Giữ bookingRevision làm khóa đồng thời (BR-04) cho mọi thao tác thay đổi availability.
const staffSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
      validate: {
        validator(val) {
          return val !== null;
        },
        message: "accountId cannot be null",
      },
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_DISPLAY_NAME_LENGTH,
      validate: {
        validator(val) {
          return (
            typeof val === "string" &&
            val.trim().length >= 1 &&
            val.trim().length <= MAX_DISPLAY_NAME_LENGTH
          );
        },
        message: "displayName must be a non-empty string up to 120 characters",
      },
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      validate: {
        validator(val) {
          return typeof val === "boolean";
        },
        message: "isActive must be a boolean",
      },
    },
    serviceIds: {
      type: [String],
      required: true,
      default: () => [],
      validate: {
        validator(ids) {
          if (!Array.isArray(ids) || ids.length > MAX_STAFF_SERVICES) {
            return false;
          }
          if (
            ids.some(
              (id) =>
                typeof id !== "string" ||
                id.trim().length === 0 ||
                id.trim().length > MAX_SERVICE_ID_LENGTH ||
                id !== id.trim(),
            )
          ) {
            return false;
          }
          return new Set(ids).size === ids.length;
        },
        message: "serviceIds must contain 0-50 distinct valid service IDs",
      },
    },
    bookingRevision: {
      type: Number,
      required: true,
      default: 0,
      validate: {
        validator(val) {
          return Number.isSafeInteger(val) && val >= 0;
        },
        message: "bookingRevision must be a non-negative safe integer",
      },
    },
  },
  { timestamps: true, versionKey: false, collection: "staff" },
);

// Index multikey phục vụ truy vấn nhân viên đang hoạt động theo năng lực dịch vụ.
staffSchema.index({ isActive: 1, serviceIds: 1 });

export const StaffModel =
  mongoose.models.Staff ?? mongoose.model("Staff", staffSchema);

export { staffSchema };
