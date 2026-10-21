import { requestJson } from '../../../lib/http.js'


export async function listCustomerAppointments(baseUrl, token, cursor, signal) {
    const search = new URLSearchParams({ limit: '20' })
    if (cursor) search.set('cursor', cursor)
    const response = await requestJson('/api/appointments?' + search, {
      baseUrl, headers: { Authorization: `Bearer ${token}` }, signal,
    })
    const data = response.data
    if (!Array.isArray(data?.items) || typeof data.pagination?.hasNextPage !== 'boolean' ||
        (data.pagination.hasNextPage && (typeof data.pagination.nextCursor !== 'string' || !data.pagination.nextCursor)) ||
        data.items.some(item => !item || typeof item.id !== 'string' || !Array.isArray(item.items) ||
          'customerSnapshot' in item || 'customerId' in item)) {
      throw new Error('Không đọc được danh sách lịch hẹn. Vui lòng thử lại.')
    }
    return data
}
