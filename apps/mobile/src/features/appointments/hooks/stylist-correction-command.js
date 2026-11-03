import { createBookingSubmission } from '../../../../../../shared/booking.js'
import { readStylistSession } from './stylist-appointments-reader.js'
import { stylistCorrectionOperation, stylistCorrectionPayload } from '../api/stylist-corrections.api.js'

export function createStylistCorrectionCommand({ accountId, appointmentId, readProfile, readStaff, readDetail, send, newKey, onChanged }) {
  const initial = { visible: false, kind: 'idle', appointment: null, fields: { reason: '', date: '', time: '', confirmed: false }, pending: null, message: '' }
  let state = initial, controller = new AbortController(), epoch = 0, busy = false, job, operation
  const listeners = new Set()
  const publish = next => { state = next; listeners.forEach(listener => listener()) }
  const makeManager = () => createBookingSubmission(async (body, key, signal) => {
    const session = await readStylistSession({ accountId, readProfile, readStaff }, signal)
    const current = await readDetail(appointmentId, signal)
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    if (current.staffId !== session.staffId) throw Object.assign(new Error('Không tìm thấy lịch được giao.'), { status: 404 })
    return send(operation, body, key, signal)
  }, newKey)
  let manager = makeManager()
  function submit() {
    if (busy) return job
    if (!state.visible || state.kind === 'rejected') return Promise.resolve()
    let body
    try { body = manager.getPending()?.payload ?? stylistCorrectionPayload(state.appointment, state.fields) }
    catch (error) { publish({ ...state, message: error.message }); return Promise.resolve() }
    const current = epoch
    busy = true
    publish({ ...state, kind: 'loading', message: '' })
    job = manager.run(body, controller.signal).then(value => {
      if (epoch !== current) return
      busy = false
      publish({ ...initial, kind: 'success', message: 'Đã sửa thao tác nhầm. Lịch sử cũ được giữ nguyên.' })
      onChanged()
      return value
    }, error => {
      if (epoch !== current) return
      busy = false
      const pending = manager.getPending() ?? null
      const message = pending ? 'Chưa rõ kết quả. Thử lại cùng yêu cầu; không tạo thao tác khác.'
        : error.code === 'CORRECTION_CONFLICT' ? 'Không khôi phục được vì trùng ca, lịch nghỉ hoặc lịch hẹn. Nhờ Owner kiểm tra; không tự dời lịch khác.'
          : ['CORRECTION_ETA_REQUIRED', 'INVALID_ETA'].includes(error.code) ? 'Cần ETA ở tương lai và sau giờ kết thúc kế hoạch.'
            : [401, 403, 404].includes(error.status) ? 'Phiên, quyền hoặc phân công đã thay đổi. Hãy tải lại lịch.'
              : 'Không sửa được. Hãy tải lại lịch và kiểm tra lý do, xác nhận, trạng thái và revision.'
      publish({ ...state, kind: pending ? 'uncertain' : 'rejected', pending, message })
    })
    return job
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    open(appointment) {
      if (busy || manager.getPending() || appointment?.id !== appointmentId || !stylistCorrectionOperation(appointment)) return false
      operation = stylistCorrectionOperation(appointment)
      publish({ ...initial, visible: true, appointment: JSON.parse(JSON.stringify(appointment)) })
      return true
    },
    edit(patch) {
      if (busy || manager.getPending() || state.kind === 'rejected') return false
      publish({ ...state, fields: { ...state.fields, ...patch, confirmed: false }, message: '' })
      return true
    },
    attest(value) {
      if (busy || manager.getPending() || state.kind === 'rejected') return false
      publish({ ...state, fields: { ...state.fields, confirmed: value === true } })
      return true
    },
    close() {
      if (busy || manager.getPending()) return false
      const rejected = state.kind === 'rejected'
      publish(initial)
      if (rejected) onChanged()
      return true
    },
    reload() {
      if (busy || manager.getPending()) return false
      publish(initial)
      onChanged()
      return true
    },
    submit,
    cancel() {
      epoch += 1
      controller.abort()
      controller = new AbortController()
      busy = false
      manager = makeManager()
      publish(initial)
    },
  }
}
