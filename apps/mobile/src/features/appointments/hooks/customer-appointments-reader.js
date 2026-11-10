/**
 * Author: Tô Thị Thảo Trang (Account: trangtttce191027)
 * Student ID: CE191027
 * Task ID / Use Case: SOL-038 - Mobile Appointment Management & Service
 * File Purpose: Bộ đọc danh sách lịch hẹn hỗ trợ phân trang cursor, khử trùng lặp và đồng bộ vòng đời ứng dụng.
 */
import { createLatestRequest } from '../../../lib/latest-request.js'
import { isAppointmentCustomer } from '../appointment-presentation.js'

/**
 * Khởi tạo state store đọc danh sách lịch hẹn với phân trang cursor, khử trùng lặp và bảo vệ phiên.
 */
export function createAppointmentListReader({ accountId, readProfile, readPage, authorize, compareAppointments }) {
  const latest = createLatestRequest()
  const listeners = new Set(), consumed = new Set()
  const initial = { kind: 'loading', items: [], hasNextPage: false, nextCursor: null, refreshing: false }
  let state = initial, generation = 0, busy = false, mode, job
  const publish = value => { state = value; listeners.forEach(listener => listener()) }

  function load(more = false, force = false) {
    if (busy && (!force || mode === 'refresh')) return job
    if (more && (!state.hasNextPage || consumed.has(state.nextCursor) || state.kind === 'denied' || state.kind === 'error')) return
    const previous = state
    const cursor = more ? state.nextCursor : null
    const current = ++generation
    if (!more) consumed.clear()
    busy = true
    mode = force ? 'refresh' : more ? 'more' : 'initial'
    publish(more ? { ...state, kind: 'loadingMore', error: null }
      : { ...initial, refreshing: force })
    job = latest.run(async signal => {
      const profile = await readProfile(signal)
      const account = profile?.account ?? profile
      if (!authorize(account) || typeof accountId !== 'string' ||
          (account?.accountId ?? account?.id) !== accountId) {
        throw Object.assign(new Error('Phiên khách hàng đã thay đổi. Vui lòng đăng nhập lại.'), { status: 403 })
      }
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      return readPage(cursor, signal)
    }).then(result => {
      if (current !== generation || result.kind === 'ignored') return
      busy = false
      if (result.kind === 'error') {
        const denied = [401, 403, 404].includes(result.error.status)
        publish({ ...(denied || !more ? initial : previous), kind: denied ? 'denied' : 'error',
          error: result.error, refreshing: false, retryMore: more && !denied,
          restartRequired: more && result.error.code === 'INVALID_CURSOR' })
        return
      }
      const { items, pagination } = result.value
      if (pagination.hasNextPage && (pagination.nextCursor === cursor || consumed.has(pagination.nextCursor))) {
        publish({ ...previous, kind: 'error', refreshing: false, restartRequired: true,
          error: new Error('Phân trang bị lặp. Hãy tải lại danh sách.') })
        return
      }
      if (more) consumed.add(cursor)
      const combined = new Map((more ? previous.items : []).map(item => [item.id, item]))
      for (const item of items) combined.set(item.id, item)
      const sorted = [...combined.values()].sort(compareAppointments)
      publish({ kind: 'success', items: sorted, ...pagination, refreshing: false })
    })
    return job
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    load: () => load(),
    loadMore: () => load(true),
    refresh: () => load(false, true),
    retry() {
      if (state.retryMore && !state.restartRequired) { state = { ...state, kind: 'success' }; return load(true) }
      return load(false, true)
    },
    cancel() { generation += 1; latest.cancel(); busy = false; mode = undefined; consumed.clear(); publish(initial) },
  }
}

/**
 * Lắng nghe sự kiện AppState để tự động tải lại dữ liệu khi active và hủy request khi background.
 */
export function bindAppointmentLifecycle(reader, appState) {
  let previous = appState.currentState
  if (previous === 'active' || previous == null) void reader.load()
  const subscription = appState.addEventListener('change', next => {
    if (next === 'active' && previous !== 'active') void reader.load()
    else if (previous === 'active' && next !== 'active') reader.cancel()
    previous = next
  })
  return () => { subscription.remove(); reader.cancel() }
}

/**
 * Khởi tạo reader danh sách lịch hẹn chuyên biệt cho khách hàng.
 */
export function createCustomerAppointmentsReader(options) {
  return createAppointmentListReader({ ...options, authorize: isAppointmentCustomer,
    compareAppointments: (a, b) => Date.parse(b.startAt) - Date.parse(a.startAt) || b.id.localeCompare(a.id) })
}
