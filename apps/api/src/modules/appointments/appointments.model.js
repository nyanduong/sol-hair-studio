import mongoose from 'mongoose'

const { Schema } = mongoose
const MAX_INTEGER = Number.MAX_SAFE_INTEGER
const MINUTE_MS = 60_000

// Trạng thái lịch theo baseline SOL-016.
export const APPOINTMENT_STATUSES = [
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'no_show',
]

// Phân biệt khách tự đặt và chủ đặt hộ.
export const BOOKING_MODES = [
    'customer',
    'owner_scheduled',
    'owner_walkin',
]

// Khai báo số nguyên bắt buộc trong giới hạn cho phép.
function integerField(min, max) {
    return {
        type: Number,
        required: true,
        min,
        max,
        validate: {
        validator: Number.isSafeInteger,
        message: 'Value must be a safe integer',
        },
    }
}

// Ngày optional được thiếu, không lưu null.
function optionalDate() {
    return {
        type: Date,
        default: undefined,
        validate: {
        validator: value => value !== null,
            message: 'Optional date must be omitted instead of null',
        },
    }
}

// Kiểm tra ngày hợp lệ trước khi tính toán.
function isValidDate(value) {
    return value instanceof Date && Number.isFinite(value.getTime())
}

// Định dạng ngày theo múi giờ của salon.
const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
})

// Chuyển thời điểm thành ngày YYYY-MM-DD tại salon.
function toLocalDate(value) {
    const parts = Object.fromEntries(
        localDateFormatter.formatToParts(value)
        .map(part => [part.type, part.value]),
    )

    return `${parts.year}-${parts.month}-${parts.day}`
}

// Thông tin liên hệ của khách tại thời điểm đặt.
const customerSnapshotSchema = new Schema(
    {
        displayName: { type: String, required: true, trim: true, maxlength: 120 },
        phone: { type: String, required: true, trim: true, match: /^\+[1-9]\d{1,14}$/ },
    },
    { _id: false },
)
// Giữ tên, giá và thời lượng dịch vụ tại thời điểm đặt.
const appointmentItemSchema = new Schema(
    {
        serviceId: { type: String, required: true, trim: true, maxlength: 80, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
        name: { type: String, required: true, trim: true, maxlength: 120 },
        priceVnd: integerField(0, 100_000_000),
        durationMinutes: integerField(1, 480),
    },
    { _id: false },
)

// Receipt lệnh gần nhất, không thay thế lịch sử audit.
const lastCommandSchema = new Schema(
    {
        key: { type: String, required: true, minlength: 16, maxlength: 100 },
        actorId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
        hash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
        resultRevision: integerField(0, MAX_INTEGER),
    },
    { _id: false },
)

// Model lịch dùng chung cho Booking và Appointment Management.
const appointmentSchema = new Schema(
    {
        // Tham chiếu hồ sơ khách, nhân viên và người tạo lịch.
        customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
        staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
        createdByAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
        bookingMode: { type: String, required: true, enum: BOOKING_MODES },

        // Snapshot không tự đổi theo hồ sơ hoặc catalog.
        customerSnapshot: { type: customerSnapshotSchema, required: true },
        staffNameSnapshot: { type: String, required: true, trim: true, maxlength: 120 },
        items: {
            type: [appointmentItemSchema],
            required: true,
            default: undefined,
            validate: {
                validator(items) {
                return Array.isArray(items) && items.length >= 1 && items.length <= 5 &&
                    items.every(item => item != null) && new Set(items.map(item => item.serviceId)).size === items.length
                },
                message: 'items must contain 1-5 distinct service snapshots',
            },
        },

        // Tổng từ snapshot; service chịu trách nhiệm tính.
        totalPriceVnd: integerField(0, 500_000_000),
        totalDurationMinutes: integerField(1, 2400),
        bufferAfterMinutes: { type: Number, required: true, enum: [10] },

        // Giờ hẹn và khoảng giữ vận hành là hai nhóm riêng.
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true },
        occupiedFrom: { type: Date, required: true },
        occupiedUntil: { type: Date, required: true },

        // Ngày địa phương dùng để lọc lịch theo ngày tại salon.
        timeZone: { type: String, required: true, enum: ['Asia/Ho_Chi_Minh'] },
        localDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },

        // revision nghiệp vụ phục vụ kiểm soát cập nhật đồng thời.
        status: { type: String, required: true, enum: APPOINTMENT_STATUSES },
        revision: { ...integerField(0, MAX_INTEGER), default: 0 },

        // Các mốc thời gian tương ứng với trạng thái của lịch.
        confirmedAt: { type: Date, required: true },
        startedAt: optionalDate(),
        completedAt: optionalDate(),
        estimatedEndAt: optionalDate(),
        cancelledAt: optionalDate(),
        noShowAt: optionalDate(),
        contactAttemptedAt: optionalDate(),
        lastRescheduledAt: optionalDate(),

        // Sau lần cập nhật đầu tiên phải có receipt lệnh gần nhất.
        lastCommand: {
            type: lastCommandSchema,
            default: undefined,
            required() { return this.revision > 0 },
            validate: { validator: value => value !== null, message: 'lastCommand must be omitted instead of null' },
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'appointments',

        // Collection/index được triển khai có kiểm soát.
        autoCreate: false,
        autoIndex: false,
    },
)

// Kiểm tính nhất quán document; không kiểm quyền hoặc giờ trống.
appointmentSchema.pre('validate', function validateAppointment() {
    // Tránh tính tổng trên item null hoặc dữ liệu số không hợp lệ.
    const validItems = Array.isArray(this.items) && this.items.length > 0 &&
        this.items.every(item => item != null && Number.isSafeInteger(item.priceVnd) && Number.isSafeInteger(item.durationMinutes))

    // Tổng phải khớp các snapshot dịch vụ.
    if (validItems) {
        const totalPrice = this.items.reduce((sum, item) => sum + item.priceVnd, 0)
        const totalDuration = this.items.reduce((sum, item) => sum + item.durationMinutes, 0)

        if (this.totalPriceVnd !== totalPrice) {
        this.invalidate('totalPriceVnd', 'Total price must equal the sum of item snapshots')
        }
        if (this.totalDurationMinutes !== totalDuration) {
        this.invalidate('totalDurationMinutes', 'Total duration must equal the sum of item snapshots')
        }
    }

    // Ngày địa phương và giờ kết thúc phải khớp giờ hẹn.
    if (isValidDate(this.startAt)) {
        if (this.localDate !== toLocalDate(this.startAt)) {
        this.invalidate('localDate', 'localDate must match startAt in Asia/Ho_Chi_Minh')
        }

        if (isValidDate(this.endAt) && Number.isSafeInteger(this.totalDurationMinutes)) {
        const expectedEnd = this.startAt.getTime() + this.totalDurationMinutes * MINUTE_MS
        if (this.endAt.getTime() !== expectedEnd) {
            this.invalidate('endAt', 'endAt must equal startAt plus totalDurationMinutes')
        }
        }
    }

    // Enum validator sẽ báo lỗi nếu status không hợp lệ.
    if (!APPOINTMENT_STATUSES.includes(this.status)) return

    // Mỗi trạng thái chỉ có các mốc thời gian tương ứng.
    const requiredTimestamps = {
        confirmed: [],
        in_progress: ['startedAt'],
        completed: ['startedAt', 'completedAt'],
        cancelled: ['cancelledAt'],
        no_show: ['noShowAt', 'contactAttemptedAt'],
    }

    const expected = requiredTimestamps[this.status]

    for (const field of ['startedAt', 'completedAt', 'cancelledAt', 'noShowAt', 'contactAttemptedAt']) {
        if (expected.includes(field)) {
        if (!isValidDate(this[field])) {
            this.invalidate(field, `${field} is required for ${this.status}`)
        }
        } else if (this[field] !== undefined) {
        this.invalidate(field, `${field} must be absent for ${this.status}`)
        }
    }

    // ETA chỉ được lưu cho lịch đang phục vụ.
    if (this.estimatedEndAt !== undefined) {
        if (this.status !== 'in_progress') {
        this.invalidate('estimatedEndAt', 'ETA is only valid for in_progress')
        } else if (isValidDate(this.estimatedEndAt) && isValidDate(this.endAt) && this.estimatedEndAt <= this.endAt) {
        this.invalidate('estimatedEndAt', 'ETA must be after the planned end')
        }
    }

    // Thời điểm bắt đầu thực tế không trước lúc xác nhận lịch.
    if (isValidDate(this.startedAt) && isValidDate(this.confirmedAt) && this.startedAt < this.confirmedAt) {
        this.invalidate('startedAt', 'Actual start cannot precede confirmation')
    }

    // Hoàn tất không trước lúc bắt đầu phục vụ.
    if (isValidDate(this.completedAt) && isValidDate(this.startedAt) && this.completedAt < this.startedAt) {
        this.invalidate('completedAt', 'Completion cannot precede actual start')
    }

    // No-show chỉ được ghi nhận từ mốc giờ hẹn cộng 15 phút.
    if (isValidDate(this.noShowAt) && isValidDate(this.startAt) && this.noShowAt.getTime() < this.startAt.getTime() + 15 * MINUTE_MS) {
        this.invalidate('noShowAt', 'No-show cannot precede startAt plus 15 minutes')
    }

    // Mốc liên hệ không được sau lúc đánh dấu no-show.
    if (isValidDate(this.contactAttemptedAt) && isValidDate(this.noShowAt) && this.contactAttemptedAt > this.noShowAt) {
        this.invalidate('contactAttemptedAt', 'Contact cannot follow no-show')
    }

    // Receipt phải khớp phiên bản hiện tại của lịch.
    if (this.lastCommand && this.lastCommand.resultRevision !== this.revision) {
        this.invalidate('lastCommand.resultRevision', 'Command revision must match appointment revision')
    }

    // Khoảng giữ vận hành phải có độ dài dương.
    if (isValidDate(this.occupiedFrom) && isValidDate(this.occupiedUntil) && this.occupiedUntil <= this.occupiedFrom) {
        this.invalidate('occupiedUntil', 'Occupied interval must have positive length')
    }

    // Đối chiếu khoảng giữ theo trạng thái và actual/ETA.
    let expectedFrom
    let expectedUntil

    if (this.status === 'confirmed' && isValidDate(this.startAt) && isValidDate(this.endAt)) {
        expectedFrom = this.startAt.getTime()
        expectedUntil = this.endAt.getTime() + 10 * MINUTE_MS
    }

    if (this.status === 'in_progress' && isValidDate(this.startAt) && isValidDate(this.startedAt) && isValidDate(this.endAt)) {
        expectedFrom = Math.min(this.startAt.getTime(), this.startedAt.getTime())
        const targetEnd = isValidDate(this.estimatedEndAt) ? this.estimatedEndAt.getTime() : this.endAt.getTime()
        expectedUntil = Math.max(this.endAt.getTime(), targetEnd) + 10 * MINUTE_MS
    }

    if (this.status === 'completed' && isValidDate(this.startedAt) && isValidDate(this.completedAt)) {
        expectedFrom = this.startedAt.getTime()
        expectedUntil = this.completedAt.getTime() + 10 * MINUTE_MS
    }

    if (expectedFrom !== undefined && isValidDate(this.occupiedFrom) && this.occupiedFrom.getTime() !== expectedFrom) {
        this.invalidate('occupiedFrom', 'Occupied start does not match appointment state')
    }

    if (expectedUntil !== undefined && isValidDate(this.occupiedUntil) && this.occupiedUntil.getTime() !== expectedUntil) {
        this.invalidate('occupiedUntil', 'Occupied end does not match appointment state')
    }
})

// Index hỗ trợ truy vấn khoảng giữ.
appointmentSchema.index({ staffId: 1, status: 1, occupiedFrom: 1 })
appointmentSchema.index({ customerId: 1, status: 1, occupiedFrom: 1 })

// Index hỗ trợ danh sách khách và lịch theo ngày.
appointmentSchema.index({ customerId: 1, startAt: -1, _id: -1 })
appointmentSchema.index({ localDate: 1, startAt: 1, _id: 1 })
appointmentSchema.index({ staffId: 1, localDate: 1, startAt: 1, _id: 1 })

// Index hỗ trợ lịch sử dịch vụ đã hoàn tất.
appointmentSchema.index({
    customerId: 1,
    status: 1,
    completedAt: -1,
    _id: -1,
})

// Đăng ký một AppointmentModel dùng chung.
export const AppointmentModel =
    mongoose.models.Appointment ??
    mongoose.model('Appointment', appointmentSchema)

export { appointmentSchema }