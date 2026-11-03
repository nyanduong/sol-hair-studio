import { createBookingSubmission } from '../../../../../../shared/booking.js'
import { readStylistSession } from './stylist-appointments-reader.js'

const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const conflict = (code, message, status = 409) => Object.assign(new Error(message), { code, status })

export function stylistServiceOperation(appointment) {
  if (!appointment || !Number.isSafeInteger(appointment.revision) ||
      appointment.revision < 0 || appointment.revision >= Number.MAX_SAFE_INTEGER) return null
  return appointment.status === 'confirmed' ? 'start' : appointment.status === 'in_progress' ? 'complete' : null
}

export function stylistServicePayload(appointment, operation, attested) {
  if (!['start', 'complete'].includes(operation) || stylistServiceOperation(appointment) !== operation) {
    throw conflict('APPOINTMENT_STATE_CONFLICT', 'Trạng thái lịch không còn phù hợp. Hãy tải lại lịch.')
  }
  if (attested !== true) throw conflict('SERVICE_CONFIRMATION_REQUIRED',
    operation === 'start' ? 'Hãy xác nhận khách đã đến salon.' : 'Hãy xác nhận đã thực sự phục vụ xong.', 400)
  return { expectedRevision: appointment.revision }
}

export function stylistServiceErrorMessage(error, pending) {
  if (pending) return 'Chưa xác định được kết quả. Kiểm tra và thử lại cùng yêu cầu; không tạo thao tác khác.'
  if ([401, 403, 404].includes(error?.status)) return 'Phiên hoặc quyền truy cập đã thay đổi, hoặc lịch không còn được giao cho bạn. Hãy tải lại lịch.'
  const messages = {
    APPOINTMENT_REVISION_CONFLICT: 'Lịch đã được cập nhật. Tải lại và xác nhận lại trước khi thao tác.',
    APPOINTMENT_STATE_CONFLICT: 'Trạng thái lịch đã thay đổi. Hãy tải lại và kiểm tra.',
    START_OUTSIDE_SHIFT: 'Khoảng phục vụ và dọn dẹp không nằm trọn trong ca làm.',
    START_TIME_OFF_CONFLICT: 'Thời gian phục vụ trùng lịch nghỉ của bạn.',
    START_APPOINTMENT_CONFLICT: 'Khoảng phục vụ trùng lịch khác của stylist hoặc khách.',
    INVALID_COMPLETION_TIME: 'Thời gian hoàn tất chưa hợp lệ. Hãy tải lại lịch.',
    COMMAND_KEY_CONFLICT: 'Yêu cầu cũ không còn phù hợp. Hãy tải lại lịch trước khi xác nhận.',
  }
  return messages[error?.code] ?? 'Không thực hiện được thao tác. Hãy tải lại lịch và kiểm tra trước khi thử tiếp.'
}

function unchangedSchedule(a, b) {
  return a.id === b.id && a.staffId === b.staffId && a.startAt === b.startAt && a.endAt === b.endAt &&
    a.staffNameSnapshot === b.staffNameSnapshot && a.confirmedAt === b.confirmedAt && a.totalPriceVnd === b.totalPriceVnd && a.totalDurationMinutes === b.totalDurationMinutes &&
    JSON.stringify(a.items) === JSON.stringify(b.items) && JSON.stringify(a.customerSnapshot) === JSON.stringify(b.customerSnapshot)
}

export function createStylistServiceCommand({ accountId, appointmentId, readProfile, readStaff, readDetail, send, newKey, onChanged }) {
  const initial = { kind: 'idle', visible: false, appointment: null, operation: null, attested: false, pending: null, message: '' }
  const listeners = new Set()
  let state = initial, epoch = 0, busy = false, job, intent, attempted = false, controller = new AbortController()
  const publish = next => { state = next; listeners.forEach(listener => listener()) }
  function resultMatches(current, payload, intent) {
    return unchangedSchedule(current, intent.appointment) && current.revision === payload.expectedRevision + 1 &&
      current.status === (intent.operation === 'start' ? 'in_progress' : 'completed') && validTime(current.startedAt) &&
      (intent.operation === 'start' || (validTime(current.completedAt) &&
        (!intent.appointment.startedAt || current.startedAt === intent.appointment.startedAt)))
  }
  const makeManager = () => createBookingSubmission(async (payload, key, signal) => {
    const captured = intent
    const session = await readStylistSession({ accountId, readProfile, readStaff }, signal)
    const current = await readDetail(appointmentId, signal)
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    if (current.staffId !== session.staffId) throw conflict('APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch được giao.', 404)
    if (attempted && resultMatches(current, payload, captured)) return current
    if (current.revision !== payload.expectedRevision) throw conflict('APPOINTMENT_REVISION_CONFLICT', 'Revision đã thay đổi.')
    if (stylistServiceOperation(current) !== captured.operation || !unchangedSchedule(current, captured.appointment)) {
      throw conflict('APPOINTMENT_STATE_CONFLICT', 'Lịch đã thay đổi.')
    }
    attempted = true
    const value = await send(captured.operation, payload, key, signal)
    if (!resultMatches(value, payload, captured)) throw new Error('Kết quả phục vụ hoặc snapshot chưa xác định.')
    return value
  }, newKey)
  let manager = makeManager()

  function submit() {
    if (busy) return job
    if (!state.visible || state.kind === 'rejected') return Promise.resolve()
    const pending = manager.getPending()
    let payload
    try { payload = pending?.payload ?? stylistServicePayload(state.appointment, state.operation, state.attested) }
    catch (error) { publish({ ...state, message: error.message }); return Promise.resolve() }
    if (!pending) {
      intent = { operation: state.operation, appointment: JSON.parse(JSON.stringify(state.appointment)) }
      attempted = false
    }
    const current = epoch
    busy = true
    publish({ ...state, kind: 'loading', message: '' })
    job = manager.run(payload, controller.signal).then(value => {
      if (current !== epoch) return
      busy = false
      const message = intent.operation === 'start' ? 'Đã bắt đầu phục vụ theo xác nhận của server.'
        : 'Đã hoàn tất phục vụ. Stylist có 10 phút dọn dẹp; hoàn tất không đồng nghĩa đã thanh toán.'
      publish({ ...initial, kind: 'success', message })
      onChanged()
      return value
    }, error => {
      if (current !== epoch) return
      busy = false
      const pending = manager.getPending() ?? null
      publish({ ...state, kind: pending ? 'uncertain' : 'rejected', pending,
        error, message: stylistServiceErrorMessage(error, pending) })
      if (!pending && error.status === 409) onChanged()
    })
    return job
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    open(appointment, operation) {
      if (busy || manager.getPending() || appointment?.id !== appointmentId || stylistServiceOperation(appointment) !== operation) return false
      attempted = false
      publish({ ...initial, visible: true, operation, appointment: JSON.parse(JSON.stringify(appointment)) })
      return true
    },
    attest(value) {
      if (busy || manager.getPending() || !state.visible || state.kind === 'rejected') return false
      publish({ ...state, attested: value === true, message: '' }); return true
    },
    close() {
      if (busy || manager.getPending()) return false
      const rejected = state.kind === 'rejected'
      publish(initial); if (rejected) onChanged(); return true
    },
    reload() {
      if (busy || manager.getPending()) return false
      publish(initial); onChanged(); return true
    },
    submit,
    cancel() {
      epoch += 1; controller.abort(); controller = new AbortController()
      busy = false; intent = undefined; attempted = false; manager = makeManager(); publish(initial)
    },
  }
}
