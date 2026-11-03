import { requestJson } from '../../../lib/http.js'
import { appointmentStaffDto } from './owner-appointments.api.js'

export async function listStylistAppointments(baseUrl, token, localDate, cursor, signal) {
  const search = new URLSearchParams({ localDate, limit: '50' })
  if (cursor) search.set('cursor', cursor)
  const response = await requestJson('/api/appointments?' + search, { baseUrl, signal, headers: { Authorization: `Bearer ${token}` } })
  const data = response.data
  if (!Array.isArray(data?.items) || typeof data.pagination?.hasNextPage !== 'boolean' ||
      (data.pagination.hasNextPage && (typeof data.pagination.nextCursor !== 'string' || !data.pagination.nextCursor))) {
    throw new Error('Không đọc được phân trang lịch được giao.')
  }
  return { items: data.items.map(item => appointmentStaffDto(item, 'stylist')), pagination: data.pagination }
}

export async function readStylistAppointment(baseUrl, token, id, signal) {
  if (!/^[a-fA-F0-9]{24}$/.test(id ?? '')) throw Object.assign(new Error('Mã lịch không hợp lệ.'), { status: 400 })
  const response = await requestJson('/api/appointments/' + encodeURIComponent(id), { baseUrl, signal, headers: { Authorization: `Bearer ${token}` } })
  if (response.data?.id !== id || !Number.isSafeInteger(response.data.revision) || response.data.revision < 0) {
    throw new Error('Chi tiết hoặc revision lịch không hợp lệ.')
  }
  return appointmentStaffDto(response.data, 'stylist')
}

export async function sendStylistServiceCommand(baseUrl, token, id, operation, body, key, signal) {
  if (!['start', 'complete'].includes(operation) || !/^[a-fA-F0-9]{24}$/.test(id ?? '') ||
      !body || Object.keys(body).length !== 1 || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) {
    throw new Error('Thao tác phục vụ không hợp lệ.')
  }
  const response = await requestJson('/api/appointments/' + encodeURIComponent(id) + '/' + operation, {
    baseUrl, signal, method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key }, body,
  })
  const data = response.data
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
  if (data?.id !== id || data.status !== (operation === 'start' ? 'in_progress' : 'completed') ||
      data.revision !== body.expectedRevision + 1 || !validTime(data.startedAt) ||
      (operation === 'complete' && (!validTime(data.completedAt) || Date.parse(data.completedAt) < Date.parse(data.startedAt)))) {
    throw new Error('Chưa xác định được kết quả. Hãy thử lại cùng yêu cầu.')
  }
  return appointmentStaffDto(data, 'stylist')
}
