import mongoose from 'mongoose'

export const OTP_PURPOSES = [
  'activate_customer',
  'activate_staff',
  'reset_password',
]

const authOtpSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    purpose: {
      type: String,
      required: true,
      enum: OTP_PURPOSES,
    },
    generation: {
      type: Number,
      required: true,
      default: 1,
      validate: {
        validator(val) {
          return Number.isSafeInteger(val) && val >= 1
        },
        message: 'generation must be a safe integer >= 1',
      },
    },
    codeDigest: {
      type: String,
      required: true,
    },
    issuedAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    resendAvailableAt: {
      type: Date,
      required: true,
    },
    failedAttempts: {
      type: Number,
      required: true,
      default: 0,
      validate: {
        validator(val) {
          return Number.isSafeInteger(val) && val >= 0 && val <= 5
        },
        message: 'failedAttempts must be an integer between 0 and 5',
      },
    },
    consumedAt: {
      type: Date,
      validate: {
        validator(val) {
          return val !== null
        },
        message: 'consumedAt cannot be null',
      },
    },
    verifiedAt: {
      type: Date,
      validate: {
        validator(val) {
          return val !== null
        },
        message: 'verifiedAt cannot be null',
      },
    },
    grantDigest: {
      type: String,
      validate: {
        validator(val) {
          return val !== null
        },
        message: 'grantDigest cannot be null',
      },
    },
    grantExpiresAt: {
      type: Date,
      validate: {
        validator(val) {
          return val !== null
        },
        message: 'grantExpiresAt cannot be null',
      },
    },
    grantConsumedAt: {
      type: Date,
      validate: {
        validator(val) {
          return val !== null
        },
        message: 'grantConsumedAt cannot be null',
      },
    },
  },
  {
    timestamps: true,
    collection: 'auth_otps',
  },
)

authOtpSchema.index(
  { accountId: 1, purpose: 1 },
  { unique: true },
)

export const AuthOtpModel =
  mongoose.models.AuthOtp ??
  mongoose.model('AuthOtp', authOtpSchema)

export { authOtpSchema }
