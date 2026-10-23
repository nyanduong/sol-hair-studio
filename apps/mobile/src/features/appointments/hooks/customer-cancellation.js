import { createBookingSubmission } from '../../../../../../shared/booking.js'
import { isAppointmentCustomer } from '../appointment-presentation.js'

export function cancellationBlockReason(appointment, now = Date.now()) {
  if (!appointment || appointment.status !== 'confirmed') return 'Chỉ có thể hủy lịch đang ở trạng thái đã xác nhận.'
  if (!Number.isSafeInteger(appointment.revision) || appointment.revision < 0) return 'Cần tải lại lịch trước khi hủy.'
  const start = Date.parse(appointment.startAt)
  if (!Number.isFinite(start) || start - now < 7_200_000) return 'Lịch còn dưới 2 giờ hoặc đã quá giờ. Vui lòng liên hệ salon.'
  return ''
}

export function cancellationErrorMessage(error, pending) {
  if (pending) return 'Chưa xác định được kết quả hủy. Kiểm tra trạng thái server và thử lại cùng yêu cầu; không tạo yêu cầu mới.'
  if ([401, 403, 404].includes(error?.status)) return 'Phiên đăng nhập hoặc quyền xem lịch đã thay đổi. Vui lòng đăng nhập hoặc tải lại lịch.'
  const messages = {
    CANCELLATION_CUTOFF: 'Lịch còn dưới 2 giờ theo giờ server, không thể hủy trực tuyến.',
    APPOINTMENT_REVISION_CONFLICT: 'Lịch đã được cập nhật. Hãy tải lại và xác nhận lại trước khi hủy.',
    APPOINTMENT_STATE_CONFLICT: 'Trạng thái lịch đã thay đổi. Hãy tải lại lịch.',
    COMMAND_KEY_CONFLICT: 'Yêu cầu cũ không còn phù hợp. Hãy tải lại lịch và kiểm tra.',
  }
  return messages[error?.code] ?? (error?.status === 409
    ? 'Lịch đã thay đổi hoặc đang được xử lý. Hãy tải lại trước khi xác nhận.'
    : 'Không hủy được lịch. Hãy tải lại và kiểm tra trước khi thử tiếp.')
}

// Một controller cho account/token/appointment; manager giữ nguyên intent khi chưa rõ kết quả.
export function createCustomerCancellation({ accountId, appointmentId, readProfile, readDetail, send, newKey, onChanged, now = Date.now }) {
  const listeners = new Set()
  const initial = { kind: 'idle', visible: false, appointment: null, pending: null }
  let state = initial, generation = 0, busy = false, job, attempted = false
  const publish = next => { state = next; listeners.forEach(listener => listener()) }
  const conflict = (code, message) => Object.assign(new Error(message), { status: 409, code })
  let controller = new AbortController()
  const makeManager = () => createBookingSubmission(async (payload, key, signal) => {
    const profile = await readProfile(signal), account = profile?.account ?? profile
    if (!isAppointmentCustomer(account) || typeof accountId !== 'string' ||
        (account?.accountId ?? account?.id) !== accountId) {
      throw Object.assign(new Error('Phiên khách hàng đã thay đổi.'), { status: 403 })
    }
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    const current = await readDetail(appointmentId, signal)
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    // GET xác nhận lịch đã hủy sau POST mất response; không phát POST/key mới.
    if (attempted && current.status === 'cancelled') return current
    if (current.revision !== payload.expectedRevision) throw conflict('APPOINTMENT_REVISION_CONFLICT', 'Revision đã thay đổi.')
    if (current.status !== 'confirmed') throw conflict('APPOINTMENT_STATE_CONFLICT', 'Trạng thái đã thay đổi.')
    const reason = cancellationBlockReason(current, now())
    if (reason && !attempted) throw conflict('CANCELLATION_CUTOFF', reason)
    attempted = true
    return send(payload, key, signal)
  }, newKey)
  let manager = makeManager()
  function submit() {
    if (busy) return job
    if (!state.visible || state.kind === 'rejected' || state.kind === 'success') return Promise.resolve()
    const pending = manager.getPending()
    if (!pending) {
      const reason = cancellationBlockReason(state.appointment, now())
      if (reason) {
        publish({ ...state, kind: 'rejected', message: reason })
        return Promise.resolve()
      }
    }
    const payload = pending?.payload ?? { expectedRevision: state.appointment.revision }
    const current = generation
    busy = true
    publish({ ...state, kind: 'loading', message: '', pending: pending ?? null })
    job = manager.run(payload, controller.signal).then(value => {
      if (current !== generation) return
      busy = false
      publish({ kind: 'success', visible: false, appointment: null, pending: null,
        message: 'Lịch hẹn đã được hủy theo xác nhận của server.' })
      onChanged()
      return value
    }, error => {
      if (current !== generation) return
      busy = false
      const pending = manager.getPending() ?? null
      publish({ ...state, kind: pending ? 'uncertain' : 'rejected', pending,
        error, message: cancellationErrorMessage(error, pending) })
      if (!pending && error.status === 409) onChanged()
    })
    return job
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    open(appointment) {
      if (busy || manager.getPending()) return false
      const reason = cancellationBlockReason(appointment, now())
      if (reason) return false
      attempted = false
      publish({ ...initial, visible: true, appointment: JSON.parse(JSON.stringify(appointment)) })
      return true
    },
    close() {
      if (busy || manager.getPending()) return false
      const rejected = state.kind === 'rejected'
      publish(initial)
      if (rejected) onChanged()
      return true
    },
    submit,
    reload() {
      if (busy || manager.getPending()) return false
      publish(initial); onChanged(); return true
    },
    cancel() {
      generation += 1; controller.abort(); controller = new AbortController()
      busy = false; attempted = false; manager = makeManager(); publish(initial)
    },
  }
}
