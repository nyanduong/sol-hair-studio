import { validAppointmentDate } from './appointment-presentation.js'

const canonical = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const id = value => typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value)
export const formatEtaTime = value => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value))

export function stylistEtaImpact(data) {
  if (!Array.isArray(data.affectedAppointments) || typeof data.ownerReviewRequired !== 'boolean') throw new Error('Không đọc được cảnh báo ETA.')
  const seen = new Set()
  const affectedAppointments = data.affectedAppointments.map(item => {
    if (!item || !id(item.id) || item.id === data.id || seen.has(item.id) || item.staffId !== data.staffId ||
        !['confirmed', 'in_progress'].includes(item.status) || !canonical(item.startAt) || !canonical(item.endAt) ||
        Date.parse(item.endAt) <= Date.parse(item.startAt) || !Array.isArray(item.reasons) || !item.reasons.length ||
        item.reasons.some(reason => !['staff_overlap', 'customer_overlap'].includes(reason))) throw new Error('Cảnh báo ETA ngoài phạm vi Stylist hoặc không hợp lệ.')
    seen.add(item.id)
    return { id: item.id, staffId: item.staffId, status: item.status, startAt: item.startAt, endAt: item.endAt, reasons: [...item.reasons] }
  })
  if (affectedAppointments.length && !data.ownerReviewRequired) throw new Error('Cảnh báo ETA không nhất quán.')
  return { affectedAppointments, ownerReviewRequired: data.ownerReviewRequired }
}

export function canUpdateStylistEta(appointment) {
  return appointment?.status === 'in_progress' && Number.isSafeInteger(appointment.revision) &&
    appointment.revision >= 0 && appointment.revision < Number.MAX_SAFE_INTEGER
}

export function etaInputToIso(date, time) {
  if (!validAppointmentDate(date) || typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)) {
    throw new Error('Nhập ngày YYYY-MM-DD và giờ HH:mm hoặc HH:mm:ss hợp lệ theo giờ Việt Nam.')
  }
  return new Date(date + 'T' + time + (time.length === 5 ? ':00' : '') + '+07:00').toISOString()
}

export function stylistEtaPayload(appointment, date, time, now = Date.now()) {
  if (!canUpdateStylistEta(appointment)) throw new Error('Chỉ cập nhật ETA cho lịch đang phục vụ có revision hợp lệ.')
  const estimatedEndAt = etaInputToIso(date, time), eta = Date.parse(estimatedEndAt)
  if (!Number.isFinite(Date.parse(appointment.endAt)) || eta <= now || eta <= Date.parse(appointment.endAt) ||
      !Number.isFinite(new Date(eta + 600_000).getTime())) throw new Error('ETA phải ở tương lai và sau giờ kết thúc theo kế hoạch.')
  return { expectedRevision: appointment.revision, estimatedEndAt }
}

export function defaultStylistEtaInput(appointment, now = Date.now()) {
  const old = Date.parse(appointment.estimatedEndAt)
  const base = Number.isFinite(old) && old > Math.max(now, Date.parse(appointment.endAt)) + 1000
    ? old : Math.ceil((Math.max(now, Date.parse(appointment.endAt)) + 900_000) / 60_000) * 60_000
  const local = new Date(base + 25_200_000).toISOString()
  return { date: local.slice(0, 10), time: local.slice(11, 19) }
}

// GET mới có ưu tiên, kể cả cùng revision: impact có thể đổi khi lịch khác đổi.
export function selectStylistEtaSummary(detailState, result, appointmentId) {
  if (detailState.kind === 'success') {
    const current = detailState.appointment
    if (current?.id !== appointmentId || current.status !== 'in_progress') return null
    if (!result || current.revision >= result.revision) return current
    return result.id === appointmentId ? result : current
  }
  if (['loading', 'error'].includes(detailState.kind) && result?.id === appointmentId) return result
  return null
}
