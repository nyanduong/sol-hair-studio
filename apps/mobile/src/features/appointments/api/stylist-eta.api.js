import { requestJson } from '../../../lib/http.js'
import { stylistAppointmentDto } from './stylist-appointments.api.js'

const canonical = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
export async function updateStylistEta(baseUrl, token, id, payload, key, signal) {
  if (typeof id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(id) || !payload || Object.keys(payload).length !== 2 ||
      Object.keys(payload).some(field => !['expectedRevision', 'estimatedEndAt'].includes(field)) ||
      !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0 ||
      payload.expectedRevision >= Number.MAX_SAFE_INTEGER || !canonical(payload.estimatedEndAt) ||
      typeof key !== 'string' || key.length < 16 || key.length > 100) throw Object.assign(new Error('Yêu cầu ETA không hợp lệ.'), { status: 400 })
  const response = await requestJson('/api/appointments/' + id + '/eta', {
    baseUrl, signal, method: 'POST', body: payload, headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': key },
  })
  const data = response.data
  if (!data || data.id !== id || data.status !== 'in_progress' || data.revision !== payload.expectedRevision + 1 ||
      data.estimatedEndAt !== payload.estimatedEndAt || !canonical(data.startedAt) || !canonical(data.occupiedUntil) ||
      Date.parse(data.occupiedUntil) !== Date.parse(data.estimatedEndAt) + 600_000) {
    throw new Error('Chưa xác định được kết quả ETA. Hãy kiểm tra và thử lại cùng yêu cầu.')
  }
  return { ...stylistAppointmentDto(data, true), occupiedUntil: data.occupiedUntil }
}
