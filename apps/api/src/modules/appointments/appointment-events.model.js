import mongoose from 'mongoose'
import { APPOINTMENT_STATUSES } from './appointments.model.js'

const { Schema } = mongoose

// Các loại event theo schema baseline.
export const APPOINTMENT_EVENT_KINDS = [
    'created',
    'rescheduled',
    'started',
    'completed',
    'cancelled',
    'no_show',
    'eta_updated',
    'corrected',
]

// Chỉ lưu các field được phép đối chiếu, không copy cả appointment.
const eventSnapshotSchema = new Schema(
    {
        status: {
            type: String,
            enum: APPOINTMENT_STATUSES,
        },
        startAt: Date,
        endAt: Date,
        occupiedFrom: Date,
        occupiedUntil: Date,
        startedAt: Date,
        completedAt: Date,
        estimatedEndAt: Date,
        staffId: {
            type: Schema.Types.ObjectId,
            ref: 'Staff',
        },
    },
    {
        _id: false,
        strict: 'throw',
        minimize: false,
    }
)

// Event được ghi cùng transaction với appointment và guard.
const appointmentEventSchema = new Schema(
    {
        appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true },
        actorId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
        revision: {
            type: Number,
            required: true,
            min: 0,
            validate: { validator: Number.isSafeInteger, message: 'revision must be a non-negative safe integer' },
        },
        kind: { type: String, required: true, enum: APPOINTMENT_EVENT_KINDS },
        occurredAt: { type: Date, required: true },
        before: { type: eventSnapshotSchema, required: true },
        after: { type: eventSnapshotSchema, required: true },
        reason: {
            type: String,
            trim: true,
            maxlength: 500,
            required() { return this.kind === 'corrected' },
            validate: {
                validator: value => value === undefined || (typeof value === 'string' && value.trim().length > 0),
                message: 'reason must be omitted or contain non-empty text',
            },
        },
    },
    {
        collection: 'appointment_events',
        timestamps: true,
        versionKey: false,
        minimize: false,
        autoCreate: false,
        autoIndex: false,
    },
)

// Một appointment chỉ có một event cho mỗi revision.
appointmentEventSchema.index(
    { appointmentId: 1, revision: 1 },
    { unique: true },
)
// Đăng ký một model audit dùng chung.
export const AppointmentEventModel =
    mongoose.models.AppointmentEvent ??
    mongoose.model('AppointmentEvent', appointmentEventSchema)

export { appointmentEventSchema }