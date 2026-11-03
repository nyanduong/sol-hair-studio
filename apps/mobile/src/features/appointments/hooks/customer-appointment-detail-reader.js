import { createLatestRequest } from '../../../lib/latest-request.js'
import { isAppointmentCustomer } from '../appointment-presentation.js'

export function createAppointmentDetailReader({ accountId, appointmentId, readProfile, readDetail, authorize }) {
  const latest = createLatestRequest(), listeners = new Set()
  const initial = { kind: 'loading', appointment: null }
  let state = initial, generation = 0, job, busy = false
  const publish = next => { state = next; listeners.forEach(listener => listener()) }
  function load(force = false) {
    if (busy && !force) return job
    const current = ++generation
    busy = true
    publish(initial)
    job = latest.run(async signal => {
      if (typeof appointmentId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(appointmentId)) {
        throw Object.assign(new Error('Mã lịch hẹn không hợp lệ.'), { status: 400 })
      }
      const profile = await readProfile(signal)
      const account = profile?.account ?? profile
      if (!authorize(account) || typeof accountId !== 'string' ||
          (account?.accountId ?? account?.id) !== accountId) {
        throw Object.assign(new Error('Phiên khách hàng đã thay đổi.'), { status: 403 })
      }
      if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
      return readDetail(appointmentId, signal)
    }).then(result => {
      if (current !== generation || result.kind === 'ignored') return
      busy = false
      if (result.kind === 'error') {
        const status = result.error.status
        publish({ appointment: null, error: result.error,
          kind: status === 404 ? 'notFound' : [401, 403].includes(status) ? 'denied' : status === 400 ? 'invalid' : 'error' })
      } else publish({ kind: 'success', appointment: result.value })
    })
    return job
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    load: () => load(), retry: () => load(), refresh: () => load(true),
    cancel() { generation += 1; latest.cancel(); busy = false; publish(initial) },
  }
}

export function createCustomerAppointmentDetailReader(options) {
  return createAppointmentDetailReader({ ...options, authorize: isAppointmentCustomer })
}
