import { requestJson } from '../../../lib/http.js'
import { appointmentStaffDto } from './owner-appointments.api.js'

// Chỉ nhận dữ liệu cảnh báo do Backend tính và giới hạn theo role.
export async function updateAppointmentEta(baseUrl, token, id, body, key, signal, actor = 'owner') {
  if (!['owner', 'stylist'].includes(actor) || !/^[a-fA-F0-9]{24}$/.test(id ?? '') ||
      !body || Object.keys(body).length !== 2 || !Number.isSafeInteger(body.expectedRevision) ||
      body.expectedRevision < 0 || body.expectedRevision >= Number.MAX_SAFE_INTEGER || !canonicalTime(body.estimatedEndAt)) {
    throw new Error('Dữ liệu cập nhật ETA không hợp lệ.')
  }
  const response = await requestJson('/api/appointments/' + encodeURIComponent(id) + '/eta', {
    baseUrl, signal, method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key }, body,
  })
  const data = response.data
  if (data?.id !== id || data.status !== 'in_progress' || data.revision !== body.expectedRevision + 1 ||
      data.estimatedEndAt !== body.estimatedEndAt || !canonicalTime(data.startedAt) ||
      !canonicalTime(data.occupiedUntil) || Date.parse(data.occupiedUntil) !== Date.parse(data.estimatedEndAt) + 600_000 ||
      typeof data.ownerReviewRequired !== 'boolean' || !Array.isArray(data.affectedAppointments)) {
    throw new Error('Chưa xác định được kết quả ETA. Hãy thử lại cùng yêu cầu.')
  }
  return { ...appointmentStaffDto(data, actor), estimatedEndAt: data.estimatedEndAt,
    occupiedUntil: data.occupiedUntil }
}

function canonicalTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

// datetime-local luôn được hiểu theo giờ salon, không theo múi giờ thiết bị.
export function appointmentEtaPayload(appointment, localTime, confirmed, now = Date.now()) {
  if (appointment.status !== 'in_progress') throw new Error('Chỉ cập nhật ETA cho lịch đang phục vụ.')
  if (!Number.isSafeInteger(appointment.revision) || appointment.revision < 0 || appointment.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Cần tải lại revision hợp lệ.')
  }
  if (typeof localTime !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localTime)) throw new Error('Chọn giờ dự kiến xong hợp lệ.')
  const eta = new Date(localTime + ':00+07:00')
  if (!Number.isFinite(eta.getTime()) || new Date(eta.getTime() + 25_200_000).toISOString().slice(0, 16) !== localTime ||
      !Number.isFinite(Date.parse(appointment.endAt)) || eta.getTime() <= now || eta.getTime() <= Date.parse(appointment.endAt)) {
    throw new Error('ETA phải ở tương lai và muộn hơn giờ kết thúc theo kế hoạch.')
  }
  if (confirmed !== true) throw new Error('Cần xác nhận giờ dự kiến xong trước khi lưu.')
  return { expectedRevision: appointment.revision, estimatedEndAt: eta.toISOString() }
}

// Ưu tiên cảnh báo GET mới tính; chỉ dùng POST khi GET còn chậm revision.
export function mergeAppointmentEta(state, result) {
  if (state.kind !== 'success' || !result || state.value?.id !== result.id) return state
  if (state.value.revision < result.revision) return { ...state, value: result }
  if (state.value.status !== 'in_progress' || state.value.revision !== result.revision || Array.isArray(state.value.affectedAppointments)) return state
  return { ...state, value: { ...state.value, estimatedEndAt: result.estimatedEndAt, occupiedUntil: result.occupiedUntil,
    affectedAppointments: result.affectedAppointments, ownerReviewRequired: result.ownerReviewRequired } }
}
