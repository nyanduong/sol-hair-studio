import { requestJson } from '../../../lib/http.js'
import { appointmentBaseDto } from './appointments.api.js'
import { validAppointmentDate } from '../appointment-presentation.js'

const validId = value => typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value)
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value

// Chỉ giữ DTO cần đọc; không giữ email, receipt, cảnh báo của lịch khác hoặc audit.
export function stylistAppointmentDto(data, detail = false) {
  if (!data || ['customerId', 'accountId', 'email', 'lastCommand', 'audit', 'events'].some(field => field in data) ||
      !['confirmed', 'in_progress', 'completed'].includes(data.status) ||
      typeof data.customerSnapshot?.displayName !== 'string' || typeof data.customerSnapshot?.phone !== 'string' ||
      !/^\+[1-9]\d{1,14}$/.test(data.customerSnapshot.phone) ||
      data.timeZone !== 'Asia/Ho_Chi_Minh' || !validAppointmentDate(data.localDate) ||
      (detail && (!Number.isSafeInteger(data.revision) || data.revision < 0 || !validTime(data.confirmedAt))) ||
      ['startedAt', 'completedAt', 'estimatedEndAt'].some(field => data[field] !== undefined && !validTime(data[field]))) {
    throw new Error('Dữ liệu lịch được giao không hợp lệ.')
  }
  const base = appointmentBaseDto(Object.fromEntries(
    ['id', 'staffId', 'staffNameSnapshot', 'status', 'startAt', 'endAt', 'totalDurationMinutes', 'totalPriceVnd', 'items'].map(field => [field, data[field]])))
  return { ...base, localDate: data.localDate, timeZone: data.timeZone,
    customerSnapshot: { displayName: data.customerSnapshot.displayName, phone: data.customerSnapshot.phone },
    ...(detail ? { revision: data.revision, confirmedAt: data.confirmedAt } : {}),
    ...(detail && ['in_progress', 'completed'].includes(data.status) && data.startedAt ? { startedAt: data.startedAt } : {}),
    ...(detail && data.status === 'completed' && data.completedAt ? { completedAt: data.completedAt } : {}),
    ...(detail && data.status === 'in_progress' && data.estimatedEndAt ? { estimatedEndAt: data.estimatedEndAt } : {}) }
}

export async function listStylistAppointments(baseUrl, token, localDate, cursor, signal) {
  if (!validAppointmentDate(localDate)) throw Object.assign(new Error('Ngày không hợp lệ.'), { status: 400 })
  const query = new URLSearchParams({ localDate, limit: '50' })
  if (cursor) query.set('cursor', cursor)
  const response = await requestJson('/api/appointments?' + query, { baseUrl, signal, headers: { Authorization: 'Bearer ' + token } })
  const data = response.data
  if (!Array.isArray(data?.items) || typeof data.pagination?.hasNextPage !== 'boolean' ||
      (data.pagination.hasNextPage ? typeof data.pagination.nextCursor !== 'string' || !data.pagination.nextCursor : data.pagination.nextCursor !== null)) {
    throw new Error('Không đọc được phân trang lịch được giao.')
  }
  const items = data.items.map(item => stylistAppointmentDto(item))
  if (items.some(item => item.localDate !== localDate)) throw new Error('Lịch trả về không đúng ngày được chọn.')
  return { items, pagination: { hasNextPage: data.pagination.hasNextPage, nextCursor: data.pagination.nextCursor } }
}

export async function getStylistAppointment(baseUrl, token, id, signal) {
  if (!validId(id)) throw Object.assign(new Error('Mã lịch không hợp lệ.'), { status: 400 })
  const response = await requestJson('/api/appointments/' + encodeURIComponent(id), {
    baseUrl, signal, headers: { Authorization: 'Bearer ' + token },
  })
  if (response.data?.id?.toLowerCase() !== id.toLowerCase()) throw new Error('Chi tiết không khớp lịch được chọn.')
  return stylistAppointmentDto(response.data, true)
}

export async function sendStylistServiceCommand(baseUrl, token, id, operation, payload, key, signal) {
  if (!['start', 'complete'].includes(operation) || !validId(id) || !payload ||
      Object.keys(payload).length !== 1 || !Object.hasOwn(payload, 'expectedRevision') || !Number.isSafeInteger(payload.expectedRevision) ||
      payload.expectedRevision < 0 || payload.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      typeof key !== 'string' || key.length < 16 || key.length > 100) {
    throw Object.assign(new Error('Yêu cầu phục vụ không hợp lệ.'), { status: 400 })
  }
  const response = await requestJson('/api/appointments/' + encodeURIComponent(id) + '/' + operation, {
    baseUrl, signal, method: 'POST', body: payload,
    headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': key },
  })
  const data = response.data
  if (!data || data.id !== id || data.revision !== payload.expectedRevision + 1 ||
      data.status !== (operation === 'start' ? 'in_progress' : 'completed') || !validTime(data.startedAt) ||
      (operation === 'complete' && (!validTime(data.completedAt) || Date.parse(data.completedAt) < Date.parse(data.startedAt)))) {
    throw new Error('Chưa xác định được kết quả phục vụ. Hãy kiểm tra và thử lại cùng yêu cầu.')
  }
  return stylistAppointmentDto(data, true)
}
