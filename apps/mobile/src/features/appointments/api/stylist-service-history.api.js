import { requestJson } from '../../../lib/http.js'
import { appointmentBaseDto } from './appointments.api.js'

export function assertServiceHistoryContext(appointmentId) {
  if (typeof appointmentId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(appointmentId)) {
    throw Object.assign(new Error('Mã lịch hẹn không hợp lệ.'), { status: 400 })
  }
}

// Lịch sử dùng snapshot không có thông tin liên hệ hay audit.
export function serviceHistoryDto(value) {
  const item = appointmentBaseDto(value)
  if (item.status !== 'completed' || typeof value.completedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.completedAt)) || new Date(value.completedAt).toISOString() !== value.completedAt ||
      ['phone', 'accountId', 'audit', 'events', 'revision'].some(field => field in value)) {
    throw new Error('Dữ liệu lịch sử dịch vụ không hợp lệ.')
  }
  return { ...item, completedAt: value.completedAt }
}

export async function listStylistServiceHistory(baseUrl, token, appointmentId, cursor, signal) {
  assertServiceHistoryContext(appointmentId)
  const query = new URLSearchParams({ limit: '20' })
  if (cursor) query.set('cursor', cursor)
  const response = await requestJson('/api/appointments/' + encodeURIComponent(appointmentId) + '/service-history?' + query, {
    baseUrl, signal, headers: { Authorization: 'Bearer ' + token },
  })
  const data = response.data
  if (!Array.isArray(data?.items) || typeof data.pagination?.hasNextPage !== 'boolean' ||
      (data.pagination.hasNextPage ? typeof data.pagination.nextCursor !== 'string' || !data.pagination.nextCursor : data.pagination.nextCursor !== null)) {
    throw new Error('Không đọc được phân trang lịch sử dịch vụ.')
  }
  return { items: data.items.map(serviceHistoryDto),
    pagination: { hasNextPage: data.pagination.hasNextPage, nextCursor: data.pagination.nextCursor } }
}
