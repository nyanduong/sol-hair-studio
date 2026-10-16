import mongoose from 'mongoose'

export const CHALLENGE_PURPOSES = [
  'activate_customer',
  'activate_staff',
  'reset_password',
]

const authChallengeSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    purpose: {
      type: String,
      required: true,
      enum: CHALLENGE_PURPOSES,
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
      minlength: 20,
      maxlength: 255,
      select: false,
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
      minlength: 20,
      maxlength: 255,
      select: false,
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
    versionKey: false,
    collection: 'auth_challenges',
  },
)

authChallengeSchema.pre('validate', function () {
  const issued = this.issuedAt?.getTime()
  const expires = this.expiresAt?.getTime()
  if (Number.isFinite(issued) && Number.isFinite(expires) && expires - issued !== 300000) {
    this.invalidate('expiresAt', 'OTP must expire exactly 5 minutes after issue')
  }
  if (Number.isFinite(issued) && this.resendAvailableAt && this.resendAvailableAt.getTime() - issued !== 60000) {
    this.invalidate('resendAvailableAt', 'OTP resend cooldown must be 60 seconds')
  }
  for (const field of ['consumedAt', 'verifiedAt']) {
    if (this[field] && (this[field].getTime() < issued || this[field].getTime() >= expires)) {
      this.invalidate(field, 'OTP verification must occur within its validity window')
    }
  }
  if (Boolean(this.verifiedAt) !== Boolean(this.consumedAt) || (this.verifiedAt && this.failedAttempts >= 5)) {
    this.invalidate('verifiedAt', 'Successful verification must consume a non-exhausted OTP')
  }
  if (Boolean(this.grantDigest) !== Boolean(this.grantExpiresAt)) {
    this.invalidate('grantDigest', 'Password proof requires both digest and expiry')
  }
  if (this.grantDigest && (this.purpose === 'activate_customer' || !this.verifiedAt || this.grantExpiresAt <= this.verifiedAt || this.grantExpiresAt > this.expiresAt)) {
    this.invalidate('grantExpiresAt', 'Password proof requires verified staff/reset OTP and cannot outlive it')
  }
  if (this.grantConsumedAt && (!this.grantDigest || !this.verifiedAt || this.grantConsumedAt < this.verifiedAt || this.grantConsumedAt >= this.grantExpiresAt)) {
    this.invalidate('grantConsumedAt', 'Password proof can be consumed only during its validity window')
  }
})

authChallengeSchema.index(
  { accountId: 1, purpose: 1 },
  { unique: true },
)

export const AuthChallengeModel =
  mongoose.models.AuthChallenge ??
  mongoose.model('AuthChallenge', authChallengeSchema)

export { authChallengeSchema }
