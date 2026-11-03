import mongoose from 'mongoose'

const serviceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    durationMinutes: {
      min: { type: Number, required: true, min: 1 },
      max: { type: Number, required: true, min: 1 },
    },
    priceVnd: { type: Number, required: true, min: 0 },
    // Optional for the legacy catalog; required by availability before booking.
    bookingDurationMinutes: {
      type: Number,
      validate: {
        validator(value) {
          if (value === undefined) return true
          if (!Number.isInteger(value) || value < 1 || value > 480) return false
          const update = typeof this?.getUpdate === 'function' ? this.getUpdate() : null
          const duration =
            this?.durationMinutes ||
            update?.durationMinutes ||
            update?.['$set']?.durationMinutes
          const min =
            duration?.min ??
            update?.['durationMinutes.min'] ??
            update?.['$set']?.['durationMinutes.min']
          const max =
            duration?.max ??
            update?.['durationMinutes.max'] ??
            update?.['$set']?.['durationMinutes.max']
          if (typeof min !== 'number' || typeof max !== 'number') {
            return true
          }
          return value >= min && value <= max
        },
        message: 'bookingDurationMinutes must be an integer within 1-480 and the display range',
      },
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
      match: /^https:\/\/res\.cloudinary\.com\//,
    },
    coverImageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Image',
    },
    images: {
      type: [
        {
          _id: false,
          imageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Image',
            required: true,
          },
          alt: {
            type: String,
            trim: true,
            maxlength: 200,
          },
        },
      ],
      default: undefined,
    },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export const ServiceModel = mongoose.models.Service ?? mongoose.model('Service', serviceSchema)

export { serviceSchema }
