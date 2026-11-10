/**
 * Author: Tô Thị Thảo Trang (Account: trangtttce191027)
 * Student ID: CE191027
 * Task ID / Use Case: SOL-038 - Mobile Appointment Management & Service
 * File Purpose: Module giao tiếp API lấy lịch sử dịch vụ đã hoàn tất của khách hàng theo ngữ cảnh cuộc hẹn được giao cho stylist.
 */
import { requestJson } from '../../../lib/http.js'
import { appointmentBaseDto } from './appointments.api.js'

/**
 * Kiểm tra tính hợp lệ của mã lịch hẹn ngữ cảnh.
 */
export function assertServiceHistoryContext(appointmentId) {
  if (typeof appointmentId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(appointmentId)) {
    throw Object.assign(new Error('Mã lịch hẹn không hợp lệ.'), { status: 400 })
  }
}

/**
 * Chuẩn hóa dữ liệu một bản ghi lịch sử dịch vụ đã hoàn tất của khách hàng.
 */
export function serviceHistoryDto(value) {
  const item = appointmentBaseDto(value)
  if (item.status !== 'completed' || typeof value.completedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.completedAt)) || new Date(value.completedAt).toISOString() !== value.completedAt ||
      ['phone', 'accountId', 'audit', 'events', 'revision'].some(field => field in value)) {
    throw new Error('Dữ liệu lịch sử dịch vụ không hợp lệ.')
  }
  return { ...item, completedAt: value.completedAt }
}

/**
 * Gọi API lấy danh sách lịch sử dịch vụ của khách hàng có phân trang cursor.
 */
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
