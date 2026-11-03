import mongoose from 'mongoose'
import { AppointmentModel } from '../appointments/appointments.model.js'
import { CustomerModel } from '../customers/customers.model.js'
import { AppointmentError } from '../appointments/appointments.service.js'
import { salonDate } from '../../../../../shared/booking.js'
const fail = (message, status, code) => { throw new AppointmentError(message, { status, code }) }
async function scopedAppointment(identity, appointmentId) {
  if (!/^[a-f\d]{24}$/i.test(appointmentId)) fail('Mã lịch hẹn không hợp lệ.', 400, 'INVALID_APPOINTMENT_ID')
  const filter = { _id: appointmentId }
  if (!identity.roles.includes('owner')) {
    if (!identity.roles.includes('customer') || identity.roles.includes('stylist')) fail('Không có quyền xem thanh toán.', 403, 'FORBIDDEN')
    const customer = await CustomerModel.findOne({ accountId: identity.accountId }).select('_id').lean()
    if (!customer) fail('Không tìm thấy lịch hẹn.', 404, 'APPOINTMENT_NOT_FOUND')
    filter.customerId = customer._id
  }
  const row = await AppointmentModel.findOne(filter).select('status revision totalPriceVnd referenceCode payment').lean()
  if (!row) fail('Không tìm thấy lịch hẹn.', 404, 'APPOINTMENT_NOT_FOUND')
  return row
}
function dto(row, owner) {
  return {
    appointmentId: String(row._id), revision: row.revision, appointmentStatus: row.status,
    status: row.payment ? 'paid' : 'unpaid', amountVnd: row.payment?.amountVnd ?? row.totalPriceVnd,
    transferContent: row.referenceCode || String(row._id),
    qrPath: row.status === 'completed' && !row.payment ? '/admin-assets/qr/qr-code.jpg' : null,
    receivedAt: row.payment?.receivedAt?.toISOString() ?? null,
    ...(owner && row.payment ? { receivedByAccountId: String(row.payment.receivedByAccountId) } : {}),
  }
}
export async function readPayment(identity, appointmentId) {
  return dto(await scopedAppointment(identity, appointmentId), identity.roles.includes('owner'))
}
export async function confirmPayment(identity, appointmentId, body, key) {
  if (!identity.roles.includes('owner')) fail('Chỉ tài khoản chủ tiệm được xác nhận đã nhận tiền.', 403, 'FORBIDDEN')
  if (!body || Object.keys(body).some(field => !['expectedRevision', 'receivedConfirmed'].includes(field)) ||
      !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.receivedConfirmed !== true) fail('Cần tải lại lịch và xác nhận đã kiểm tra tiền vào tài khoản.', 400, 'INVALID_PAYMENT_CONFIRMATION')
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(key)) fail('Thiếu mã yêu cầu hợp lệ.', 400, 'INVALID_IDEMPOTENCY_KEY')
  const row = await scopedAppointment(identity, appointmentId)
  if (row.payment) {
    if (row.payment.commandKey === key && String(row.payment.receivedByAccountId) === identity.accountId) return dto(row, true)
    fail('Lịch đã được xác nhận thanh toán. Vui lòng tải lại.', 409, 'PAYMENT_ALREADY_RECEIVED')
  }
  if (row.status !== 'completed' || row.revision !== body.expectedRevision) fail('Chỉ thu tiền cho lịch đã hoàn tất và còn đúng phiên bản. Vui lòng tải lại.', 409, 'PAYMENT_NOT_READY')
  const now = new Date()
  const updated = await AppointmentModel.findOneAndUpdate({
    _id: row._id, status: 'completed', revision: body.expectedRevision, payment: { $exists: false }, totalPriceVnd: row.totalPriceVnd,
  }, { $set: { payment: { amountVnd: row.totalPriceVnd, receivedAt: now, receivedLocalDate: salonDate(now), receivedByAccountId: new mongoose.Types.ObjectId(identity.accountId), receivedByRole: 'owner', commandKey: key } } }, { returnDocument: 'after', runValidators: true }).lean()
  if (!updated) {
    const latest = await scopedAppointment(identity, appointmentId)
    if (latest.payment?.commandKey === key && String(latest.payment.receivedByAccountId) === identity.accountId) return dto(latest, true)
    fail('Lịch đã thay đổi hoặc đã được thu tiền. Vui lòng tải lại.', 409, 'PAYMENT_CONFLICT')
  }
  return dto(updated, true)
}
