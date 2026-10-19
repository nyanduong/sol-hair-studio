import mongoose from 'mongoose'

const customerSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: undefined,
      validate: {
        validator(val) {
          return val !== null
        },
        message: 'accountId cannot be null',
      },
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    phone: {
      type: String,
      trim: true,
      validate: [
        {
          validator(val) {
            return val !== null
          },
          message: 'phone cannot be null',
        },
        {
          validator(val) {
            if (val === undefined || val === null) return true
            return /^\+[1-9]\d{1,14}$/.test(val)
          },
          message: 'phone must follow E.164 format (e.g. +84901234567)',
        },
      ],
    },
    bookingRevision: {
      type: Number,
      required: true,
      default: 0,
      validate: {
        validator(val) {
          return Number.isSafeInteger(val) && val >= 0
        },
        message: 'bookingRevision must be a non-negative safe integer',
      },
    },
  },
  { timestamps: true, versionKey: false, collection: 'customers' },
)

customerSchema.index(
  { accountId: 1 },
  {
    unique: true,
    partialFilterExpression: { accountId: { $type: 'objectId' } },
  },
)

customerSchema.index({ phone: 1, _id: 1 })

export const CustomerModel =
  mongoose.models.Customer ?? mongoose.model('Customer', customerSchema)

export { customerSchema }
