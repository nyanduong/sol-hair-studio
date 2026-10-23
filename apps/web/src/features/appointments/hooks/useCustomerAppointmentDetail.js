import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { getMe } from '../../auth/api/auth.api.js'
import { readCustomerAppointment } from '../api/appointments.api.js'
import { isCustomerAccount } from './useCustomerAppointments.js'

// Mỗi bộ tải thuộc một phiên và một mã lịch; không giữ dữ liệu sau lỗi/đổi phiên.
export function createCustomerAppointmentDetail({ readProfile, readDetail }) {
  const latest = createLatestRequest()
  const listeners = new Set()
  const initial = { kind: 'loading' }
  let state = initial
  const publish = next => { state = next; listeners.forEach(listener => listener()) }
  async function load() {
    publish(initial)
    const result = await latest.run(async signal => {
      const profile = await readProfile(signal)
      if (!isCustomerAccount(profile?.account ?? profile)) {
        throw Object.assign(new Error('Trang này chỉ dành cho tài khoản khách hàng.'), { status: 403 })
      }
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      return readDetail(signal)
    })
    if (result.kind === 'ignored') return
    if (result.kind === 'success') {
      publish({ kind: 'success', value: result.value })
    } else {
      const status = result.error.status
      const kind = status === 404 ? 'notFound' : status === 400 ? 'invalid' :
        [401, 403].includes(status) ? 'denied' : 'error'
      publish({ kind, error: result.error })
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    load,
    cancel() { latest.cancel(); publish(initial) },
  }
}

export function useCustomerAppointmentDetail(token, appointmentId) {
  const detail = useMemo(() => createCustomerAppointmentDetail({
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readDetail: signal => readCustomerAppointment(apiBaseUrl, token, appointmentId, signal),
  }), [token, appointmentId])
  const state = useSyncExternalStore(detail.subscribe, detail.getSnapshot, detail.getSnapshot)
  useEffect(() => {
    void detail.load()
    return () => detail.cancel()
  }, [detail])
  return { ...state, retry: () => detail.load() }
}
