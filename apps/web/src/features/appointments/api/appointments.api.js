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

// Đọc đúng một lịch; scope Customer được Backend kiểm tra theo Bearer session.
export async function readCustomerAppointment(baseUrl, token, appointmentId, signal) {
  if (typeof appointmentId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(appointmentId)) {
    throw Object.assign(new Error('Đường dẫn lịch hẹn không hợp lệ.'), { status: 400, code: 'INVALID_APPOINTMENT_ID' })
  }
  const response = await requestJson('/api/appointments/' + encodeURIComponent(appointmentId), {
    baseUrl, headers: { Authorization: `Bearer ${token}` }, signal,
  })
  const data = response.data
  const validDate = value => typeof value === 'string' && Number.isFinite(new Date(value).getTime())
  if (!data || typeof data.id !== 'string' || data.id.toLowerCase() !== appointmentId.toLowerCase() ||
      'customerSnapshot' in data || 'customerId' in data ||
      !['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(data.status) ||
      !validDate(data.startAt) || !validDate(data.endAt) ||
      typeof data.staffNameSnapshot !== 'string' ||
      !Number.isSafeInteger(data.totalDurationMinutes) || data.totalDurationMinutes < 1 ||
      !Number.isSafeInteger(data.totalPriceVnd) || data.totalPriceVnd < 0 ||
      !Array.isArray(data.items) || !data.items.length || data.items.some(item =>
        !item || typeof item.serviceId !== 'string' || typeof item.name !== 'string' ||
        !Number.isSafeInteger(item.durationMinutes) || item.durationMinutes < 1 ||
        !Number.isSafeInteger(item.priceVnd) || item.priceVnd < 0)) {
    throw new Error('Không đọc được chi tiết lịch hẹn. Vui lòng thử lại.')
  }
  return data
}

export async function readRescheduleOptions(baseUrl, token, appointmentId, localDate, signal) {
  const response = await requestJson('/api/appointments/' + encodeURIComponent(appointmentId) +
    '/reschedule-options?' + new URLSearchParams({ localDate }), {
    baseUrl, headers: { Authorization: `Bearer ${token}` }, signal,
  })
  const data = response.data
  if (!data || data.appointmentId !== appointmentId || !Number.isSafeInteger(data.revision) ||
      !Array.isArray(data.stylists) || data.stylists.some(staff => !Array.isArray(staff.slots))) {
    throw new Error('Không đọc được giờ trống cho lịch hẹn.')
  }
  return data
}

export async function sendAppointmentCommand(baseUrl, token, appointmentId, operation, payload, key, signal) {
  if (!['cancel', 'reschedule'].includes(operation)) throw new Error('Thao tác không hợp lệ.')
  const allowed = operation === 'cancel' ? ['expectedRevision'] : ['expectedRevision', 'staffId', 'startAt']
  if (Object.keys(payload).some(field => !allowed.includes(field))) throw new Error('Không được đổi dịch vụ hoặc dữ liệu ngoài phạm vi.')
  const response = await requestJson('/api/appointments/' + encodeURIComponent(appointmentId) + '/' + operation, {
    baseUrl, method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key }, body: payload, signal,
  })
  if (!response.data || response.data.id !== appointmentId ||
      !Number.isSafeInteger(response.data.revision) ||
      response.data.status !== (operation === 'cancel' ? 'cancelled' : 'confirmed')) {
    throw new Error('Chưa xác định được kết quả thao tác. Hãy thử lại cùng yêu cầu.')
  }
  return response.data
}
