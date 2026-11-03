import { requestJson } from '../../../lib/http.js'
import { appointmentStaffDto } from './owner-appointments.api.js'
import { appointmentEtaPayload } from './appointment-eta.api.js'

const operations = { 'correct-start': ['in_progress', 'confirmed', 'serviceNotStarted'], 'correct-complete': ['completed', 'in_progress', 'serviceNotCompleted'] }
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value

export function correctionPayload(appointment, operation, fields, now = Date.now()) {
  const rule = operations[operation]
  if (!rule || appointment.status !== rule[0]) throw new Error('Trạng thái lịch không cho phép sửa nhầm.')
  if (!Number.isSafeInteger(appointment.revision) || appointment.revision < 0 || appointment.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Cần tải lại revision hợp lệ.')
  if (typeof fields.reason !== 'string' || !fields.reason.trim() || fields.reason.length > 500) throw new Error('Nhập lý do có nội dung, tối đa 500 ký tự.')
  if (fields.confirmed !== true) throw new Error('Cần xác nhận thao tác trước đó là nhầm và tình trạng phục vụ thực tế.')
  const body = { expectedRevision: appointment.revision, reason: fields.reason.trim(), [rule[2]]: true }
  if (operation === 'correct-complete') {
    if (!validTime(appointment.endAt)) throw new Error('Giờ kết thúc kế hoạch không hợp lệ.')
    if (fields.etaLocal) body.estimatedEndAt = appointmentEtaPayload({ ...appointment, status: 'in_progress' }, fields.etaLocal, true, now).estimatedEndAt
    else if (Date.parse(appointment.endAt) <= now) throw new Error('Giờ kế hoạch đã hết; cần nhập ETA tương lai để khôi phục phục vụ.')
  }
  return body
}

export async function sendOwnerCorrection(baseUrl, token, id, operation, body, key, signal, actor = 'owner') {
  const rule = operations[operation]
  const allowed = ['expectedRevision', 'reason', rule?.[2], ...(operation === 'correct-complete' ? ['estimatedEndAt'] : [])]
  if (!rule || !/^[a-fA-F0-9]{24}$/.test(id ?? '') || !body || Object.keys(body).some(field => !allowed.includes(field)) ||
      !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 500 || body[rule[2]] !== true ||
      (body.estimatedEndAt !== undefined && !validTime(body.estimatedEndAt))) throw new Error('Dữ liệu sửa nhầm không hợp lệ.')
  const response = await requestJson('/api/appointments/' + encodeURIComponent(id) + '/' + operation, {
    baseUrl, signal, method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key }, body,
  })
  const data = response.data
  if (data?.id !== id || data.status !== rule[1] || data.revision !== body.expectedRevision + 1 ||
      !validTime(data.occupiedFrom) || !validTime(data.occupiedUntil) ||
      (operation === 'correct-start' && ['startedAt', 'completedAt', 'estimatedEndAt'].some(field => data[field] !== undefined)) ||
      (operation === 'correct-complete' && (!validTime(data.startedAt) || data.completedAt !== undefined || data.estimatedEndAt !== body.estimatedEndAt))) {
    throw new Error('Chưa xác định được kết quả sửa nhầm. Hãy thử lại cùng yêu cầu.')
  }
  // Correction trả ETA nhưng chưa kèm impact; GET sau thành công đọc lại cảnh báo.
  const { estimatedEndAt, ...snapshot } = data
  return { ...appointmentStaffDto(snapshot, actor), ...(estimatedEndAt ? { estimatedEndAt } : {}) }
}

export function correctionConflicts(details) {
  if (!details || typeof details.shiftConflict !== 'boolean' || !Array.isArray(details.timeOffConflicts) || !Array.isArray(details.conflictingAppointments)) return null
  if (details.timeOffConflicts.some(item => !validTime(item?.startAt) || !validTime(item?.endAt)) ||
      details.conflictingAppointments.some(item => !/^[a-fA-F0-9]{24}$/.test(item?.id ?? '') ||
        !validTime(item.startAt) || !validTime(item.endAt) || !Array.isArray(item.reasons) ||
        item.reasons.some(reason => !['staff_overlap', 'customer_overlap'].includes(reason)))) return null
  return { shiftConflict: details.shiftConflict,
    timeOffConflicts: details.timeOffConflicts.map(({ startAt, endAt }) => ({ startAt, endAt })),
    conflictingAppointments: details.conflictingAppointments.map(({ id, startAt, endAt, reasons }) => ({ id, startAt, endAt, reasons })) }
}
