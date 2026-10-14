import mongoose from 'mongoose'

export const ACCOUNT_ROLES = ['customer', 'stylist', 'owner']
export const ACCOUNT_STATUSES = [
  'pending_verification',
  'pending_password',
  'active',
  'disabled',
]

const accountSchema = new mongoose.Schema(
  {
    emailNormalized: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      select: false,
      required: [
        function () {
          return this.status === 'active'
        },
        'passwordHash is required when status is active',
      ],
      validate: {
        validator(val) {
          return val !== null && (this.status !== 'active' || val.trim().length > 0)
        },
        message: 'passwordHash must be non-null and non-blank for active accounts',
      },
    },
    roles: {
      type: [String],
      required: true,
      validate: {
        validator(roles) {
          if (!Array.isArray(roles) || roles.length < 1 || roles.length > 3) {
            return false
          }
          return new Set(roles).size === roles.length && roles.every((role) => ACCOUNT_ROLES.includes(role))
        },
        message: 'roles must contain 1-3 distinct valid roles: customer, stylist, owner',
      },
    },
    status: {
      type: String,
      required: true,
      enum: ACCOUNT_STATUSES,
    },
    emailVerifiedAt: {
      type: Date,
      required: [
        function () {
          return this.status === 'active' || this.status === 'pending_password'
        },
        'emailVerifiedAt is required when status is active or pending_password',
      ],
      validate: {
        validator(val) {
          return val !== null
        },
        message: 'emailVerifiedAt cannot be null',
      },
    },
    authRevision: {
      type: Number,
      required: true,
      default: 0,
      validate: {
        validator(val) {
          return Number.isSafeInteger(val) && val >= 0
        },
        message: 'authRevision must be a non-negative safe integer',
      },
    },
  },
  { timestamps: true },
)

// A single shop has one owner; concurrent operator bootstrap cannot create two.
accountSchema.index({ roles: 1 }, { unique: true, partialFilterExpression: { roles: 'owner' }, name: 'single_owner' })

export const AccountModel =
  mongoose.models.Account ?? mongoose.model('Account', accountSchema)

export { accountSchema }
