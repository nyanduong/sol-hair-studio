import { requestJson } from '../../../lib/http.js'

function ownerAppointment(data) {
  if (!data || typeof data.id !== 'string' || typeof data.customerId !== 'string' ||
      typeof data.customerSnapshot?.displayName !== 'string' || typeof data.customerSnapshot?.phone !== 'string' ||
      !Array.isArray(data.items) || !data.items.length ||
      !['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(data.status) ||
      ![data.startAt, data.endAt].every(value => typeof value === 'string' && Number.isFinite(Date.parse(value))) ||
      typeof data.staffNameSnapshot !== 'string' ||
      !Number.isSafeInteger(data.totalDurationMinutes) || !Number.isSafeInteger(data.totalPriceVnd) ||
      data.items.some(item => !item || typeof item.name !== 'string' || typeof item.serviceId !== 'string' ||
        !Number.isSafeInteger(item.durationMinutes) || !Number.isSafeInteger(item.priceVnd))) {
    throw new Error('Không đọc được dữ liệu lịch hẹn dành cho chủ tiệm.')
  }
  // Chỉ giữ DTO cần hiển thị; không giữ account/email, guard, receipt hoặc audit.
  return {
    id: data.id, customerId: data.customerId,
    customerSnapshot: { displayName: data.customerSnapshot.displayName, phone: data.customerSnapshot.phone },
    staffId: data.staffId, staffNameSnapshot: data.staffNameSnapshot,
    items: data.items.map(({ serviceId, name, priceVnd, durationMinutes }) => ({ serviceId, name, priceVnd, durationMinutes })),
    startAt: data.startAt, endAt: data.endAt, status: data.status,
    totalDurationMinutes: data.totalDurationMinutes, totalPriceVnd: data.totalPriceVnd,
  }
}

export async function listOwnerAppointments(baseUrl, token, filters, cursor, signal) {
  const search = new URLSearchParams({ localDate: filters.localDate, limit: '50' })
  if (filters.staffId) search.set('staffId', filters.staffId)
  if (filters.status) search.set('status', filters.status)
  if (cursor) search.set('cursor', cursor)
  const response = await requestJson('/api/appointments?' + search, {
    baseUrl, headers: { Authorization: `Bearer ${token}` }, signal,
  })
  const data = response.data
  if (!Array.isArray(data?.items) || typeof data.pagination?.hasNextPage !== 'boolean' ||
      (data.pagination.hasNextPage && (typeof data.pagination.nextCursor !== 'string' || !data.pagination.nextCursor))) {
    throw new Error('Không đọc được phân trang lịch hẹn.')
  }
  return { items: data.items.map(ownerAppointment), pagination: data.pagination }
}

export async function readOwnerAppointment(baseUrl, token, id, signal) {
  if (!/^[a-fA-F0-9]{24}$/.test(id ?? '')) {
    throw Object.assign(new Error('Mã lịch hẹn không hợp lệ.'), { status: 400 })
  }
  const response = await requestJson('/api/appointments/' + encodeURIComponent(id), {
    baseUrl, headers: { Authorization: `Bearer ${token}` }, signal,
  })
  if (response.data?.id?.toLowerCase() !== id.toLowerCase()) throw new Error('Sai mã lịch hẹn trong phản hồi.')
  return ownerAppointment(response.data)
}
