import { createBookingSubmission } from '../../../../../../shared/booking.js'
import { readStylistSession } from './stylist-appointments-reader.js'
import { canUpdateStylistEta, defaultStylistEtaInput, stylistEtaPayload } from '../appointment-eta.js'

const conflict = (code, message, status = 409) => Object.assign(new Error(message), { status, code })
const sameSchedule = (a, b) => a.id === b.id && a.staffId === b.staffId && a.startAt === b.startAt && a.endAt === b.endAt &&
  a.staffNameSnapshot === b.staffNameSnapshot && a.confirmedAt === b.confirmedAt &&
  JSON.stringify(a.customerSnapshot) === JSON.stringify(b.customerSnapshot) && a.startedAt === b.startedAt && a.completedAt === b.completedAt && a.totalPriceVnd === b.totalPriceVnd &&
  a.totalDurationMinutes === b.totalDurationMinutes && JSON.stringify(a.items) === JSON.stringify(b.items)
const errorText = (error, pending) => pending ? 'Chưa xác định được kết quả. Kiểm tra và thử lại cùng yêu cầu, không đổi ETA hoặc tạo yêu cầu mới.'
  : [401, 403, 404].includes(error.status) ? 'Phiên hoặc quyền truy cập đã thay đổi, hoặc lịch không còn được giao cho bạn. Hãy tải lại lịch.'
    : error.code === 'INVALID_ETA' ? 'ETA phải ở tương lai và sau giờ kết thúc theo kế hoạch.'
      : error.status === 409 ? 'Lịch đã thay đổi. Tải lại và xác nhận lại trước khi cập nhật ETA.'
        : 'Không cập nhật được ETA. Hãy tải lại và kiểm tra.'

export function createStylistEtaCommand({ accountId, appointmentId, readProfile, readStaff, readDetail, send, newKey, onChanged, now = Date.now }) {
  const initial = { kind: 'idle', visible: false, confirming: false, appointment: null, date: '', time: '', pending: null, message: '' }
  const listeners = new Set()
  let state = initial, epoch = 0, busy = false, job, intent, attempted = false, controller = new AbortController()
  const publish = next => { state = next; listeners.forEach(listener => listener()) }
  const matches = (value, payload, captured) => sameSchedule(value, captured) && value.status === 'in_progress' &&
    value.revision === payload.expectedRevision + 1 && value.estimatedEndAt === payload.estimatedEndAt &&
    Array.isArray(value.affectedAppointments) && typeof value.ownerReviewRequired === 'boolean'
  const makeManager = () => createBookingSubmission(async (payload, key, signal) => {
    const captured = intent
    const session = await readStylistSession({ accountId, readProfile, readStaff }, signal)
    const current = await readDetail(appointmentId, signal)
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    if (current.staffId !== session.staffId) throw conflict('APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch được giao.', 404)
    if (attempted && matches(current, payload, captured)) return current
    if (current.revision !== payload.expectedRevision) throw conflict('APPOINTMENT_REVISION_CONFLICT', 'Revision đã thay đổi.')
    if (!canUpdateStylistEta(current) || !sameSchedule(current, captured)) throw conflict('APPOINTMENT_STATE_CONFLICT', 'Lịch đã thay đổi.')
    // Retry intent cũ được phép đối chiếu/replay kể cả khi ETA cũ đã qua.
    if (!attempted && (Date.parse(payload.estimatedEndAt) <= now() || Date.parse(payload.estimatedEndAt) <= Date.parse(current.endAt))) {
      throw conflict('INVALID_ETA', 'ETA không còn hợp lệ.', 400)
    }
    attempted = true
    const value = await send(payload, key, signal)
    if (!matches(value, payload, captured)) throw new Error('Kết quả ETA hoặc snapshot chưa xác định.')
    return value
  }, newKey)
  let manager = makeManager()
  function submit() {
    if (busy) return job
    if (!state.visible || !state.confirming || state.kind === 'rejected') return Promise.resolve()
    const pending = manager.getPending()
    let payload
    try { payload = pending?.payload ?? stylistEtaPayload(state.appointment, state.date, state.time, now()) }
    catch (error) { publish({ ...state, confirming: false, message: error.message }); return Promise.resolve() }
    if (!pending) { intent = JSON.parse(JSON.stringify(state.appointment)); attempted = false }
    const current = epoch
    busy = true
    publish({ ...state, kind: 'loading', message: '' })
    job = manager.run(payload, controller.signal).then(value => {
      if (current !== epoch) return
      busy = false
      publish({ ...initial, kind: 'success', message: 'Đã cập nhật giờ dự kiến xong. Hãy kiểm tra cảnh báo ảnh hưởng bên dưới.' })
      onChanged(value)
      return value
    }, error => {
      if (current !== epoch) return
      busy = false
      const pending = manager.getPending() ?? null
      publish({ ...state, kind: pending ? 'uncertain' : 'rejected', pending, error, message: errorText(error, pending) })
      if (!pending && error.status === 409) onChanged()
    })
    return job
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    open(appointment) {
      if (busy || manager.getPending() || appointment?.id !== appointmentId || !canUpdateStylistEta(appointment)) return false
      publish({ ...initial, visible: true, appointment: JSON.parse(JSON.stringify(appointment)), ...defaultStylistEtaInput(appointment, now()) })
      return true
    },
    edit(field, value) {
      if (!state.visible || busy || manager.getPending() || state.kind === 'rejected' || !['date', 'time'].includes(field)) return false
      publish({ ...state, [field]: value, confirming: false, message: '' }); return true
    },
    confirm() {
      if (!state.visible || busy || manager.getPending() || state.kind === 'rejected') return false
      try { stylistEtaPayload(state.appointment, state.date, state.time, now()) }
      catch (error) { publish({ ...state, message: error.message }); return false }
      publish({ ...state, confirming: true, message: '' }); return true
    },
    back() {
      if (busy || manager.getPending()) return false
      publish({ ...state, confirming: false }); return true
    },
    close() {
      if (busy || manager.getPending()) return false
      const rejected = state.kind === 'rejected'; publish(initial); if (rejected) onChanged(); return true
    },
    reload() { if (busy || manager.getPending()) return false; publish(initial); onChanged(); return true },
    submit,
    cancel() {
      epoch += 1; controller.abort(); controller = new AbortController()
      busy = false; intent = undefined; attempted = false; manager = makeManager(); publish(initial)
    },
  }
}
