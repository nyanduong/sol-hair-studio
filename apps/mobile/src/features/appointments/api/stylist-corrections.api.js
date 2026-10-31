import { requestJson } from '../../../lib/http.js'
import { stylistAppointmentDto } from './stylist-appointments.api.js'
import { etaInputToIso } from '../appointment-eta.js'

const rules = {
  'correct-start': ['in_progress', 'confirmed', 'serviceNotStarted'],
  'correct-complete': ['completed', 'in_progress', 'serviceNotCompleted'],
}
const canonical = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value

export function stylistCorrectionOperation(appointment) {
  if (!appointment || !Number.isSafeInteger(appointment.revision) || appointment.revision < 0 || appointment.revision >= Number.MAX_SAFE_INTEGER) return null
  return appointment.status === 'in_progress' ? 'correct-start' : appointment.status === 'completed' ? 'correct-complete' : null
}

export function stylistCorrectionPayload(appointment, fields, now = Date.now()) {
  const operation = stylistCorrectionOperation(appointment)
  if (!operation) throw new Error('Trạng thái lịch không cho phép sửa nhầm. Hãy tải lại lịch.')
  if (typeof fields.reason !== 'string' || !fields.reason.trim() || fields.reason.length > 500) throw new Error('Nhập lý do, tối đa 500 ký tự.')
  if (fields.confirmed !== true) throw new Error('Cần xác nhận thao tác trước đó là nhầm.')
  const body = { expectedRevision: appointment.revision, reason: fields.reason.trim(), [rules[operation][2]]: true }
  if (operation === 'correct-complete') {
    if (fields.date || fields.time) {
      const eta = etaInputToIso(fields.date, fields.time)
      if (Date.parse(eta) <= Math.max(now, Date.parse(appointment.endAt))) throw new Error('ETA phải ở tương lai và sau giờ kết thúc kế hoạch.')
      body.estimatedEndAt = eta
    } else if (Date.parse(appointment.endAt) <= now) throw new Error('Giờ kế hoạch đã hết; cần nhập ETA tương lai.')
  }
  return body
}

export async function sendStylistCorrection(baseUrl, token, id, operation, body, key, signal) {
  const rule = rules[operation]
  const allowed = ['expectedRevision', 'reason', rule?.[2], ...(operation === 'correct-complete' ? ['estimatedEndAt'] : [])]
  if (!rule || !/^[a-fA-F0-9]{24}$/.test(id ?? '') || !body || Object.keys(body).some(field => !allowed.includes(field)) ||
      !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 500 || body[rule[2]] !== true ||
      (body.estimatedEndAt !== undefined && !canonical(body.estimatedEndAt)) || typeof key !== 'string' || key.length < 16 || key.length > 100) {
    throw Object.assign(new Error('Yêu cầu sửa nhầm không hợp lệ.'), { status: 400 })
  }
  const response = await requestJson('/api/appointments/' + id + '/' + operation, {
    baseUrl, signal, method: 'POST', body, headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': key },
  })
  const value = response.data
  if (value?.id !== id || value.status !== rule[1] || value.revision !== body.expectedRevision + 1 ||
      !canonical(value.occupiedFrom) || !canonical(value.occupiedUntil) ||
      (operation === 'correct-start' && ['startedAt', 'completedAt', 'estimatedEndAt'].some(field => value[field] !== undefined)) ||
      (operation === 'correct-complete' && (!canonical(value.startedAt) || value.completedAt !== undefined || value.estimatedEndAt !== body.estimatedEndAt))) {
    throw new Error('Chưa xác định được kết quả sửa nhầm. Hãy thử lại cùng yêu cầu.')
  }
  // Response sửa nhầm chưa kèm impact; GET chi tiết sẽ tải lại cảnh báo ETA.
  const { estimatedEndAt, ...snapshot } = value
  return { ...stylistAppointmentDto(snapshot, true), ...(estimatedEndAt ? { estimatedEndAt } : {}) }
}
