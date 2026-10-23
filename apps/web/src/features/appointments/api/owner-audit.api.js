import { requestJson } from '../../../lib/http.js'

const id = value => typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value)
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const states = ['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']
export const auditActions = { created: 'Tạo lịch', rescheduled: 'Đổi lịch', cancelled: 'Hủy lịch', no_show: 'Không đến',
  started: 'Bắt đầu phục vụ', completed: 'Hoàn tất phục vụ', eta_updated: 'Cập nhật ETA', corrected: 'Sửa trạng thái bị nhầm' }

function auditSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Snapshot audit không hợp lệ.')
  const result = {}
  for (const field of ['status', 'staffId', 'startAt', 'endAt', 'occupiedFrom', 'occupiedUntil', 'startedAt', 'completedAt', 'estimatedEndAt']) {
    if (value[field] === undefined) continue
    if (field === 'status' ? !states.includes(value[field]) : field === 'staffId' ? !id(value[field]) : !time(value[field])) throw new Error('Snapshot audit không hợp lệ.')
    result[field] = value[field]
  }
  return result
}

export async function readOwnerAudit(baseUrl, token, appointmentId, cursor, signal) {
  if (!id(appointmentId)) throw Object.assign(new Error('Mã lịch không hợp lệ.'), { status: 400 })
  const search = new URLSearchParams({ limit: '20' })
  if (cursor) search.set('cursor', cursor)
  const response = await requestJson('/api/appointments/' + encodeURIComponent(appointmentId) + '/audit?' + search, {
    baseUrl, signal, headers: { Authorization: `Bearer ${token}` },
  })
  const data = response.data
  if (!Array.isArray(data?.items) || typeof data.pagination?.hasNextPage !== 'boolean' ||
      (data.pagination.hasNextPage && (typeof data.pagination.nextCursor !== 'string' || !data.pagination.nextCursor))) throw new Error('Phân trang audit không hợp lệ.')
  let previousRevision = Infinity
  const items = data.items.map(event => {
    if (!event || !id(event.id) || event.appointmentId !== appointmentId || !id(event.actorId) ||
        !Number.isSafeInteger(event.revision) || event.revision < 0 || event.revision >= previousRevision ||
        !Object.hasOwn(auditActions, event.kind) || !time(event.occurredAt) ||
        (event.reason !== undefined && (typeof event.reason !== 'string' || !event.reason.trim() || event.reason.length > 500))) throw new Error('Dữ liệu audit không hợp lệ.')
    previousRevision = event.revision
    return { id: event.id, appointmentId: event.appointmentId, actorId: event.actorId, revision: event.revision,
      kind: event.kind, occurredAt: event.occurredAt, before: auditSnapshot(event.before), after: auditSnapshot(event.after),
      ...(event.reason !== undefined ? { reason: event.reason } : {}) }
  })
  return { items, pagination: data.pagination }
}
