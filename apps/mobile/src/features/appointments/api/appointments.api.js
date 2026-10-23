import { requestJson } from '../../../lib/http.js'

const validId = value => typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value)
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value

export async function listCustomerAppointments(baseUrl, token, cursor, signal) {
  const query = new URLSearchParams({ limit: '20' })
  if (cursor) query.set('cursor', cursor)
  const response = await requestJson('/api/appointments?' + query, {
    baseUrl, signal, headers: { Authorization: `Bearer ${token}` },
  })
  const data = response.data
  if (!Array.isArray(data?.items) || typeof data.pagination?.hasNextPage !== 'boolean' ||
      (data.pagination.hasNextPage ? typeof data.pagination.nextCursor !== 'string' || !data.pagination.nextCursor : data.pagination.nextCursor !== null)) {
    throw new Error('Không đọc được phân trang lịch hẹn.')
  }
  const items = data.items.map(item => {
    if (!item || !validId(item.id) || !validId(item.staffId) ||
        ['customerId', 'customerSnapshot', 'actorId', 'affectedAppointments', 'lastCommand', 'email'].some(field => field in item) ||
        !['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(item.status) ||
        !validTime(item.startAt) || !validTime(item.endAt) || Date.parse(item.endAt) <= Date.parse(item.startAt) ||
        typeof item.staffNameSnapshot !== 'string' ||
        !Number.isSafeInteger(item.totalDurationMinutes) || item.totalDurationMinutes < 1 ||
        !Number.isSafeInteger(item.totalPriceVnd) || item.totalPriceVnd < 0 ||
        !Array.isArray(item.items) || !item.items.length || item.items.some(service =>
          !service || typeof service.serviceId !== 'string' || typeof service.name !== 'string' ||
          !Number.isSafeInteger(service.priceVnd) || service.priceVnd < 0 ||
          !Number.isSafeInteger(service.durationMinutes) || service.durationMinutes < 1)) {
      throw new Error('Dữ liệu lịch hẹn khách hàng không hợp lệ.')
    }
    // Allowlist: không giữ field quản trị hoặc thông tin ngoài DTO Customer.
    return { id: item.id, staffId: item.staffId, staffNameSnapshot: item.staffNameSnapshot,
      status: item.status, startAt: item.startAt, endAt: item.endAt,
      totalDurationMinutes: item.totalDurationMinutes, totalPriceVnd: item.totalPriceVnd,
      items: item.items.map(({ serviceId, name, priceVnd, durationMinutes }) => ({ serviceId, name, priceVnd, durationMinutes })) }
  })
  return { items, pagination: { hasNextPage: data.pagination.hasNextPage, nextCursor: data.pagination.nextCursor } }
}
