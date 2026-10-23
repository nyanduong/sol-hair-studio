import { requestJson } from '../../../lib/http.js'

const validActualTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value

const ownerAppointment = data => appointmentStaffDto(data, 'owner')

export function appointmentStaffDto(data, role = 'owner') {
  if (!data || typeof data.id !== 'string' || (role === 'owner' ? typeof data.customerId !== 'string' : 'customerId' in data) ||
      typeof data.customerSnapshot?.displayName !== 'string' || typeof data.customerSnapshot?.phone !== 'string' ||
      ['startedAt', 'completedAt', 'estimatedEndAt'].some(field => data[field] !== undefined && !validActualTime(data[field])) ||
      !Array.isArray(data.items) || !data.items.length ||
      !(role === 'owner' ? ['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'] : ['confirmed', 'in_progress', 'completed']).includes(data.status) ||
      ![data.startAt, data.endAt].every(value => typeof value === 'string' && Number.isFinite(Date.parse(value))) ||
      typeof data.staffNameSnapshot !== 'string' ||
      !Number.isSafeInteger(data.totalDurationMinutes) || !Number.isSafeInteger(data.totalPriceVnd) ||
      data.items.some(item => !item || typeof item.name !== 'string' || typeof item.serviceId !== 'string' ||
        !Number.isSafeInteger(item.durationMinutes) || !Number.isSafeInteger(item.priceVnd))) {
    throw new Error('Không đọc được dữ liệu lịch hẹn dành cho chủ tiệm.')
  }
  // Chỉ giữ DTO cần hiển thị; không giữ account/email, guard, receipt hoặc audit.
  return {
    ...(Number.isSafeInteger(data.revision) && data.revision >= 0 ? { revision: data.revision } : {}),
    ...Object.fromEntries(['startedAt', 'completedAt', ...(data.status === 'in_progress' ? ['estimatedEndAt'] : [])].filter(field => data[field] !== undefined).map(field => [field, data[field]])),
    ...(data.status === 'in_progress' && data.estimatedEndAt !== undefined ? appointmentEtaImpact(data, role) : {}),
    id: data.id, ...(role === 'owner' ? { customerId: data.customerId } : {}),
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
  if (!Number.isSafeInteger(response.data.revision) || response.data.revision < 0) throw new Error('Missing or invalid appointment revision.')
  return ownerAppointment(response.data)
}

export async function sendOwnerAppointmentCommand(baseUrl, token, id, operation, payload, key, signal) {
  if (!/^[a-fA-F0-9]{24}$/.test(id ?? '') || !['cancel', 'no-show', 'reschedule', 'start', 'complete'].includes(operation)) {
    throw new Error('Thao tác hoặc mã lịch không hợp lệ.')
  }
  const allowed = ['start', 'complete'].includes(operation) ? ['expectedRevision'] : operation === 'reschedule' ? ['expectedRevision', 'startAt', 'staffId', 'reason']
    : operation === 'cancel' ? ['expectedRevision', 'reason'] : ['expectedRevision', 'contactAttemptedAt']
  if (!payload || Object.keys(payload).some(field => !allowed.includes(field)) ||
      !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0) {
    throw new Error('Dữ liệu thao tác không hợp lệ.')
  }
  const response = await requestJson('/api/appointments/' + encodeURIComponent(id) + '/' + operation, {
    baseUrl, method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key },
    body: payload, signal,
  })
  const data = response.data
  const expectedStatus = { reschedule: 'confirmed', cancel: 'cancelled', 'no-show': 'no_show', start: 'in_progress', complete: 'completed' }[operation]
  if (data?.id !== id || data.status !== expectedStatus ||
      data.revision !== payload.expectedRevision + 1 ||
      (['start', 'complete'].includes(operation) && !validActualTime(data.startedAt)) ||
      (operation === 'complete' && (!validActualTime(data.completedAt) || Date.parse(data.completedAt) < Date.parse(data.startedAt)))) {
    throw new Error('Chưa xác định được kết quả. Hãy thử lại cùng yêu cầu.')
  }
  return { ...ownerAppointment(data), revision: data.revision }
}

// Dùng chung allowlist cảnh báo cho GET chi tiết và POST ETA.
function appointmentEtaImpact(data, role) {
  if (typeof data.ownerReviewRequired !== 'boolean' || !Array.isArray(data.affectedAppointments)) {
    throw new Error('Không đọc được cảnh báo ETA. Vui lòng tải lại lịch.')
  }
  const canonicalTime = validActualTime
  const seen = new Set()
  const affectedAppointments = data.affectedAppointments.map(item => {
    if (!item || !/^[a-fA-F0-9]{24}$/.test(item.id ?? '') || seen.has(item.id) || item.id === data.id ||
        !/^[a-fA-F0-9]{24}$/.test(item.staffId ?? '') ||
        (role === 'stylist' && item.staffId !== data.staffId) ||
        !['confirmed', 'in_progress'].includes(item.status) || !canonicalTime(item.startAt) || !canonicalTime(item.endAt) ||
        Date.parse(item.endAt) <= Date.parse(item.startAt) || !Array.isArray(item.reasons) || !item.reasons.length ||
        item.reasons.some(reason => !['staff_overlap', 'customer_overlap'].includes(reason))) {
      throw new Error('Không đọc được cảnh báo ETA. Hãy thử lại cùng yêu cầu.')
    }
    seen.add(item.id)
    return { id: item.id, staffId: item.staffId, status: item.status, startAt: item.startAt, endAt: item.endAt, reasons: [...item.reasons] }
  })
  if (affectedAppointments.length && !data.ownerReviewRequired) throw new Error('Cảnh báo ETA không hợp lệ.')
  return { affectedAppointments, ownerReviewRequired: data.ownerReviewRequired }
}
