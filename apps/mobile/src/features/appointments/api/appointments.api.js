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
  const items = data.items.map(customerAppointmentItem)
  return { items, pagination: { hasNextPage: data.pagination.hasNextPage, nextCursor: data.pagination.nextCursor } }
}

function customerAppointmentItem(item) {
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
}

export async function getCustomerAppointment(baseUrl, token, appointmentId, signal) {
  if (!validId(appointmentId)) throw Object.assign(new Error('Mã lịch hẹn không hợp lệ.'), { status: 400 })
  const response = await requestJson('/api/appointments/' + encodeURIComponent(appointmentId), {
    baseUrl, signal, headers: { Authorization: 'Bearer ' + token },
  })
  const data = response.data
  const item = customerAppointmentItem(data)
  if (item.id.toLowerCase() !== appointmentId.toLowerCase() ||
      !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !validTime(data.confirmedAt) || data.timeZone !== 'Asia/Ho_Chi_Minh' ||
      typeof data.localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.localDate) ||
      ['startedAt', 'completedAt'].some(field => data[field] !== undefined && !validTime(data[field]))) {
    throw new Error('Dữ liệu chi tiết lịch hẹn không hợp lệ.')
  }
  return { ...item, revision: data.revision, confirmedAt: data.confirmedAt,
    timeZone: data.timeZone, localDate: data.localDate,
    ...(['in_progress', 'completed'].includes(item.status) && data.startedAt ? { startedAt: data.startedAt } : {}),
    ...(item.status === 'completed' && data.completedAt ? { completedAt: data.completedAt } : {}) }
}

export async function cancelCustomerAppointment(baseUrl, token, appointmentId, payload, key, signal) {
  if (!validId(appointmentId) || !payload || Object.keys(payload).some(field => field !== 'expectedRevision') ||
      !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0 ||
      typeof key !== 'string' || key.length < 16 || key.length > 100) {
    throw Object.assign(new Error('Yêu cầu hủy lịch không hợp lệ.'), { status: 400 })
  }
  const response = await requestJson('/api/appointments/' + encodeURIComponent(appointmentId) + '/cancel', {
    baseUrl, signal, method: 'POST', body: payload,
    headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': key },
  })
  const data = response.data
  if (!data || data.id !== appointmentId || data.status !== 'cancelled' ||
      data.revision !== payload.expectedRevision + 1 || !validTime(data.cancelledAt)) {
    // HTTP 200 với DTO hỏng vẫn là kết quả chưa rõ, phải giữ lại intent/key.
    throw new Error('Chưa xác định được kết quả hủy lịch. Hãy kiểm tra và thử lại cùng yêu cầu.')
  }
  return { ...customerAppointmentItem(data), revision: data.revision, cancelledAt: data.cancelledAt }
}

export async function getCustomerRescheduleOptions(baseUrl, token, appointmentId, localDate, signal) {
  if (!validId(appointmentId) || typeof localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(localDate) ||
      !Number.isFinite(Date.parse(localDate)) || new Date(localDate).toISOString().slice(0, 10) !== localDate) {
    throw Object.assign(new Error('Ngày hoặc mã lịch không hợp lệ.'), { status: 400 })
  }
  const response = await requestJson('/api/appointments/' + encodeURIComponent(appointmentId) +
    '/reschedule-options?' + new URLSearchParams({ localDate }), {
    baseUrl, signal, headers: { Authorization: 'Bearer ' + token },
  })
  const data = response.data
  if (!data || data.appointmentId !== appointmentId || data.localDate !== localDate ||
      data.timeZone !== 'Asia/Ho_Chi_Minh' || !validTime(data.generatedAt) ||
      !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !Array.isArray(data.stylists) || data.stylists.some(staff =>
        !validId(staff.staffId) || typeof staff.displayName !== 'string' || !Array.isArray(staff.slots) ||
        staff.slots.some(slot => !validTime(slot.startAt) || !validTime(slot.endAt) || !validTime(slot.occupiedUntil) ||
          Date.parse(slot.endAt) <= Date.parse(slot.startAt) ||
          Date.parse(slot.occupiedUntil) !== Date.parse(slot.endAt) + 600_000))) {
    throw new Error('Không đọc được giờ trống cho lịch hẹn.')
  }
  return { appointmentId: data.appointmentId, revision: data.revision, generatedAt: data.generatedAt,
    localDate: data.localDate, timeZone: data.timeZone,
    stylists: data.stylists.map(staff => ({ staffId: staff.staffId, displayName: staff.displayName,
      slots: staff.slots.map(({ startAt, endAt, occupiedUntil }) => ({ startAt, endAt, occupiedUntil })) })) }
}

export async function rescheduleCustomerAppointment(baseUrl, token, appointmentId, payload, key, signal) {
  if (!validId(appointmentId) || !payload ||
      Object.keys(payload).some(field => !['expectedRevision', 'staffId', 'startAt'].includes(field)) ||
      !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0 ||
      !validId(payload.staffId) || !validTime(payload.startAt) ||
      typeof key !== 'string' || key.length < 16 || key.length > 100) {
    throw Object.assign(new Error('Yêu cầu đổi lịch không hợp lệ.'), { status: 400 })
  }
  const response = await requestJson('/api/appointments/' + encodeURIComponent(appointmentId) + '/reschedule', {
    baseUrl, signal, method: 'POST', body: payload,
    headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': key },
  })
  const data = response.data
  if (!data || data.id !== appointmentId || data.status !== 'confirmed' ||
      data.revision !== payload.expectedRevision + 1 || data.staffId !== payload.staffId ||
      data.startAt !== payload.startAt || !validTime(data.lastRescheduledAt)) {
    throw new Error('Chưa xác định được kết quả đổi lịch. Hãy kiểm tra và thử lại cùng yêu cầu.')
  }
  return { ...customerAppointmentItem(data), revision: data.revision, lastRescheduledAt: data.lastRescheduledAt }
}
