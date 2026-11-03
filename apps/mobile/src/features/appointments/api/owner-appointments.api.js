import { requestJson } from '../../../lib/http.js'

export function parseOwnerAppointmentDto(data) {
  if (!data || typeof data.id !== 'string') {
    throw new Error('Dữ liệu lịch hẹn không hợp lệ.')
  }

  return {
    id: data.id,
    customerId: data.customerId,
    customerSnapshot: {
      displayName: data.customerSnapshot?.displayName || 'Khách vãng lai',
      phone: data.customerSnapshot?.phone || '',
    },
    staffId: data.staffId,
    staffNameSnapshot: data.staffNameSnapshot || 'Chưa chỉ định',
    items: Array.isArray(data.items)
      ? data.items.map((i) => ({
          serviceId: i.serviceId,
          name: i.name,
          priceVnd: Number(i.priceVnd) || 0,
          durationMinutes: Number(i.durationMinutes) || 0,
        }))
      : [],
    startAt: data.startAt,
    endAt: data.endAt,
    status: data.status,
    totalDurationMinutes: Number(data.totalDurationMinutes) || 0,
    totalPriceVnd: Number(data.totalPriceVnd) || 0,
    revision: Number(data.revision) || 0,
    startedAt: data.startedAt,
    completedAt: data.completedAt,
    localDate: data.localDate,
  }
}

export async function listOwnerAppointments(baseUrl, token, filters = {}, cursor = null, signal = null) {
  const search = new URLSearchParams({ limit: '50' })
  if (filters.localDate) search.set('localDate', filters.localDate)
  if (filters.staffId) search.set('staffId', filters.staffId)
  if (filters.status) search.set('status', filters.status)
  if (cursor) search.set('cursor', cursor)

  const response = await requestJson('/api/appointments?' + search, {
    baseUrl,
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })

  const data = response.data
  const items = Array.isArray(data?.items) ? data.items.map(parseOwnerAppointmentDto) : []

  return {
    items,
    pagination: data?.pagination || { hasNextPage: false, nextCursor: null },
  }
}

