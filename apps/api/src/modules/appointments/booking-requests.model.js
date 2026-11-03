import mongoose from 'mongoose'

const schema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Account' },
    key: { type: String, required: true, minlength: 16, maxlength: 100 },
    requestHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Appointment' },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'booking_requests', versionKey: false, autoCreate: false, autoIndex: false },
)
schema.index({ actorId: 1, key: 1 }, { unique: true })
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const BookingRequestModel =
  mongoose.models.BookingRequest ?? mongoose.model('BookingRequest', schema)
