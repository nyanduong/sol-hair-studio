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
          return (
            value === undefined ||
            (Number.isInteger(value) &&
              value >= 1 &&
              value <= 480 &&
              value >= this.durationMinutes.min &&
              value <= this.durationMinutes.max)
          )
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
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export const ServiceModel = mongoose.models.Service ?? mongoose.model('Service', serviceSchema)

export { serviceSchema }
