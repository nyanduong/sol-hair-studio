import { createBookingSubmission, salonDate } from '../../../../../../shared/booking.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { isAppointmentCustomer } from '../appointment-presentation.js'
import { cancellationBlockReason } from './customer-cancellation.js'

export const rescheduleBlockReason = (appointment, now = Date.now()) =>
  cancellationBlockReason(appointment, now).replaceAll('hủy', 'đổi lịch')

const failure = (code, message, status = 409) => Object.assign(new Error(message), { code, status })
const sameSnapshot = (a, b) => a.totalPriceVnd === b.totalPriceVnd && a.totalDurationMinutes === b.totalDurationMinutes &&
  JSON.stringify(a.items) === JSON.stringify(b.items)

export function customerReschedulePayload(appointment, options, staffId, startAt, now = Date.now()) {
  const blocked = rescheduleBlockReason(appointment, now)
  if (blocked) throw failure('RESCHEDULE_CUTOFF', blocked)
  if (!options || options.appointmentId !== appointment.id || options.revision !== appointment.revision ||
      !options.stylists.some(staff => staff.staffId === staffId && staff.slots.some(slot => slot.startAt === startAt))) {
    throw failure('STALE_OPTIONS', 'Hãy tải lại giờ trống và chọn một khung giờ hợp lệ.')
  }
  const start = Date.parse(startAt)
  if (!Number.isFinite(start) || start < now + 1_800_000 || start > now + 604_800_000 ||
      start % 900_000 !== 0 || salonDate(new Date(start)) !== options.localDate) {
    throw failure('INVALID_RESCHEDULE_TIME', 'Giờ mới phải theo mốc 15 phút, trước ít nhất 30 phút và trong 7 ngày tới.')
  }
  if (staffId === appointment.staffId && startAt === appointment.startAt) {
    throw failure('RESCHEDULE_NO_CHANGE', 'Hãy chọn giờ hoặc stylist khác lịch hiện tại.', 400)
  }
  return { expectedRevision: appointment.revision, staffId, startAt }
}

export function rescheduleErrorMessage(error, pending = false) {
  if (pending) return 'Chưa xác định được kết quả. Kiểm tra và thử lại cùng yêu cầu; không đổi lựa chọn hoặc tạo yêu cầu mới.'
  if ([401, 403, 404].includes(error?.status)) return 'Phiên đăng nhập hoặc quyền xem lịch đã thay đổi. Vui lòng đăng nhập hoặc quay lại danh sách.'
  const messages = {
    RESCHEDULE_CUTOFF: 'Lịch cũ còn dưới 2 giờ theo giờ server, không thể đổi trực tuyến.',
    APPOINTMENT_REVISION_CONFLICT: 'Lịch đã được cập nhật. Tải lại lịch và giờ trống rồi xác nhận lại.',
    APPOINTMENT_STATE_CONFLICT: 'Trạng thái lịch đã thay đổi, không thể tiếp tục với lựa chọn cũ.',
    RESCHEDULE_NO_CHANGE: 'Hãy chọn giờ hoặc stylist khác lịch hiện tại.',
  }
  return messages[error?.code] ?? 'Không đổi được lịch. Hãy tải lại lịch và giờ trống trước khi xác nhận lại.'
}

// Tách request đọc mới nhất khỏi mutation: background chỉ hủy options, không bỏ intent đang gửi.
export function createCustomerReschedule({ accountId, appointmentId, readProfile, readDetail, readOptions, send, newKey, now = Date.now }) {
  const latest = createLatestRequest(), listeners = new Set()
  const initial = () => ({ kind: 'loading', appointment: null, options: null, localDate: salonDate(new Date(now())),
    staffId: null, startAt: null, confirming: false, pending: null, message: '' })
  let state = initial(), epoch = 0, busy = false, job, intentAppointment, intentDate, attempted = false
  let controller = new AbortController()
  const publish = next => { state = next; listeners.forEach(listener => listener()) }
  async function identity(signal) {
    const profile = await readProfile(signal), account = profile?.account ?? profile
    if (!isAppointmentCustomer(account) || (account?.accountId ?? account?.id) !== accountId || typeof accountId !== 'string') {
      throw failure('FORBIDDEN', 'Phiên khách hàng đã thay đổi.', 403)
    }
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
  }
  function checkAbort(signal) {
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
  }
  const matchingResult = (current, payload) => current.status === 'confirmed' &&
    current.revision === payload.expectedRevision + 1 && current.staffId === payload.staffId &&
    current.startAt === payload.startAt && sameSnapshot(current, intentAppointment)
  const success = () => publish({ ...state, kind: 'success', options: null, startAt: null,
    confirming: false, pending: null, message: 'Đổi lịch thành công theo xác nhận của server.' })
  const makeManager = () => createBookingSubmission(async (payload, key, signal) => {
    await identity(signal)
    const current = await readDetail(appointmentId, signal)
    checkAbort(signal)
    if (attempted && matchingResult(current, payload)) return current
    if (current.revision !== payload.expectedRevision) throw failure('APPOINTMENT_REVISION_CONFLICT', 'Revision đã thay đổi.')
    if (current.status !== 'confirmed') throw failure('APPOINTMENT_STATE_CONFLICT', 'Trạng thái đã thay đổi.')
    if (!attempted) {
      const options = await readOptions(appointmentId, intentDate, signal)
      checkAbort(signal)
      customerReschedulePayload(current, options, payload.staffId, payload.startAt, now())
    }
    attempted = true
    const result = await send(payload, key, signal)
    if (!matchingResult(result, payload)) throw new Error('Kết quả đổi lịch chưa xác định hoặc snapshot không khớp.')
    return result
  }, newKey)
  let manager = makeManager()

  async function load(localDate = state.localDate, staffId = state.staffId) {
    if (busy) return job
    if (manager.getPending()) return verify()
    publish({ ...state, kind: 'loading', options: null, startAt: null, confirming: false, localDate, message: '' })
    const result = await latest.run(async signal => {
      await identity(signal)
      const appointment = await readDetail(appointmentId, signal)
      checkAbort(signal)
      const reason = rescheduleBlockReason(appointment, now())
      if (reason) throw failure('RESCHEDULE_CUTOFF', reason)
      const options = await readOptions(appointmentId, localDate, signal)
      checkAbort(signal)
      if (options.revision !== appointment.revision) throw failure('APPOINTMENT_REVISION_CONFLICT', 'Revision đã thay đổi.')
      return { appointment, options }
    })
    if (result.kind === 'ignored') return
    if (result.kind === 'error') {
      const denied = [401, 403, 404].includes(result.error.status)
      publish({ ...state, kind: denied ? 'denied' : 'error', options: null, startAt: null,
        appointment: denied ? null : state.appointment, error: result.error, message: rescheduleErrorMessage(result.error) })
      return
    }
    const { appointment, options } = result.value
    const chosen = options.stylists.find(staff => staff.staffId === (staffId ?? appointment.staffId)) ?? options.stylists[0]
    publish({ ...state, kind: 'ready', appointment, options, staffId: chosen?.staffId ?? null,
      startAt: null, confirming: false, error: null, pending: null })
  }

  // GET trước retry: chỉ đọc, không phát POST ngầm khi foreground.
  async function verify() {
    if (busy) return job
    const pending = manager.getPending()
    if (!pending) return load()
    const result = await latest.run(async signal => {
      await identity(signal)
      const current = await readDetail(appointmentId, signal)
      checkAbort(signal)
      return current
    })
    if (result.kind === 'ignored') return
    if (result.kind === 'error') {
      publish({ ...state, kind: 'uncertain', pending, message: rescheduleErrorMessage(result.error, true) })
    } else if (matchingResult(result.value, pending.payload)) {
      state = { ...state, appointment: result.value }
      manager = makeManager(); success()
    } else if (result.value.revision !== pending.payload.expectedRevision || result.value.status !== 'confirmed') {
      manager = makeManager()
      publish({ ...state, kind: 'rejected', appointment: result.value, options: null, pending: null,
        confirming: false, startAt: null, message: 'Lịch đã thay đổi. Tải lại và kiểm tra trước khi tạo yêu cầu khác.' })
    } else publish({ ...state, kind: 'uncertain', pending, confirming: true, message: rescheduleErrorMessage(null, true) })
  }

  function submit() {
    if (busy) return job
    if (!state.confirming || !['ready', 'uncertain'].includes(state.kind)) return Promise.resolve()
    const pending = manager.getPending()
    let payload
    try {
      payload = pending?.payload ?? customerReschedulePayload(state.appointment, state.options, state.staffId, state.startAt, now())
    } catch (error) {
      publish({ ...state, kind: 'rejected', confirming: false, options: null, startAt: null, message: error.message })
      return Promise.resolve()
    }
    if (!pending) {
      intentAppointment = JSON.parse(JSON.stringify(state.appointment))
      intentDate = state.localDate
      attempted = false
    }
    latest.cancel()
    const current = epoch
    busy = true
    publish({ ...state, kind: 'submitting', message: '' })
    job = manager.run(payload, controller.signal).then(value => {
      if (current !== epoch) return
      busy = false
      state = { ...state, appointment: value }
      success()
    }, error => {
      if (current !== epoch) return
      busy = false
      const pending = manager.getPending() ?? null
      publish({ ...state, kind: pending ? 'uncertain' : 'rejected', pending,
        options: null, confirming: Boolean(pending), message: rescheduleErrorMessage(error, pending) })
    })
    return job
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    load, verify, submit,
    chooseDate(localDate) { if (busy || manager.getPending()) return; return load(localDate) },
    chooseStaff(staffId) {
      if (busy || manager.getPending() || !state.options?.stylists.some(staff => staff.staffId === staffId)) return
      return load(state.localDate, staffId)
    },
    chooseSlot(startAt) {
      if (state.kind !== 'ready' || !state.options?.stylists.some(staff => staff.staffId === state.staffId && staff.slots.some(slot => slot.startAt === startAt))) return false
      publish({ ...state, startAt, confirming: false, message: '' }); return true
    },
    confirm() {
      if (state.kind !== 'ready') return false
      try { customerReschedulePayload(state.appointment, state.options, state.staffId, state.startAt, now()) }
      catch (error) { publish({ ...state, message: error.message }); return false }
      const staff = state.options.stylists.find(staff => staff.staffId === state.staffId)
      const slot = staff.slots.find(slot => slot.startAt === state.startAt)
      publish({ ...state, confirming: true, message: '', target: { displayName: staff.displayName, ...slot } }); return true
    },
    closeConfirmation() {
      if (busy || manager.getPending()) return false
      publish({ ...state, confirming: false }); return true
    },
    pause() {
      latest.cancel()
      if (!busy && !manager.getPending()) publish({ ...state, kind: 'loading', options: null, startAt: null, confirming: false })
    },
    cancel() {
      epoch += 1; latest.cancel(); controller.abort(); controller = new AbortController()
      busy = false; attempted = false; intentAppointment = undefined; manager = makeManager(); publish(initial())
    },
  }
}

export function bindRescheduleLifecycle(command, appState) {
  let previous = appState.currentState
  if (previous === 'active' || previous == null) void command.load()
  const subscription = appState.addEventListener('change', next => {
    if (next === 'active' && previous !== 'active') void command.load()
    else if (previous === 'active' && next !== 'active') command.pause()
    previous = next
  })
  return () => { subscription.remove(); command.pause() }
}
