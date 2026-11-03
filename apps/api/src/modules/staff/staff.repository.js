import { ServiceModel } from '../services/services.model.js'
import { StaffModel } from './staff.model.js'
import { StaffShiftModel } from './staff-shifts.model.js'

// Kiểm tra danh sách serviceIds có tồn tại đầy đủ trong danh mục dịch vụ (services.id) hay không.
export async function findExistingServiceIds(serviceIds, { session } = {}) {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    return []
  }
  const query = ServiceModel.find({ id: { $in: serviceIds } }).select('id -_id')
  if (session) query.session(session)
  const docs = await query.lean()
  return docs.map((doc) => doc.id)
}

// Tăng bookingRevision nguyên tử trên hồ sơ nhân viên trong transaction để làm khóa đồng thời (BR-04).
export async function lockAndBumpStaffBookingRevision(staffId, session) {
  const existing = await StaffModel.findById(staffId).session(session)
  if (!existing) {
    return { status: 'not_found', staff: null }
  }
  if (
    !Number.isSafeInteger(existing.bookingRevision) ||
    existing.bookingRevision < 0 ||
    existing.bookingRevision >= Number.MAX_SAFE_INTEGER
  ) {
    return { status: 'limit_exceeded', staff: existing }
  }

  const updated = await StaffModel.findOneAndUpdate(
    {
      _id: existing._id,
      bookingRevision: {
        $eq: existing.bookingRevision,
        $lt: Number.MAX_SAFE_INTEGER,
      },
    },
    { $inc: { bookingRevision: 1 } },
    { returnDocument: 'after', session, runValidators: true },
  )

  if (!updated) {
    return { status: 'conflict', staff: null }
  }

  return { status: 'ok', staff: updated }
}

// Tìm các ca đang active của một nhân viên có giao với khoảng nửa mở [startAt, endAt).
export async function findOverlappingActiveShifts({
  staffId,
  startAt,
  endAt,
  excludeShiftId,
  session,
}) {
  const filter = {
    staffId,
    status: 'active',
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
  }
  if (excludeShiftId) {
    filter._id = { $ne: excludeShiftId }
  }
  const query = StaffShiftModel.find(filter).sort({ startAt: 1, _id: 1 })
  if (session) query.session(session)
  return query.lean()
}

// Đọc toàn bộ ca đang active của nhân viên trong session để kiểm tra độ phủ lịch hẹn.
export async function findActiveShiftsByStaffId(staffId, { session } = {}) {
  const query = StaffShiftModel.find({ staffId, status: 'active' }).sort({
    startAt: 1,
    _id: 1,
  })
  if (session) query.session(session)
  return query.lean()
}
