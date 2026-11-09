import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { readPayment } from '../api/payments.api.js'
export function createPaymentReader(read) {
  const latest = createLatestRequest(), listeners = new Set()
  let state = { kind: 'loading' }
  const publish = next => { state = next; listeners.forEach(listener => listener()) }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    async load() {
      publish(state.kind === 'success' ? { ...state, refreshing: true } : { kind: 'loading' })
      const result = await latest.run(read)
      if (result.kind === 'ignored') return
      publish(result.kind === 'success' ? { kind: 'success', value: result.value } : { kind: 'error', error: result.error })
      return result.kind === 'success' ? result.value : null
    },
    cancel() { latest.cancel() },
  }
}
export function usePayment(token, appointmentId) {
  const reader = useMemo(() => createPaymentReader(signal => readPayment(apiBaseUrl, token, appointmentId, signal)), [token, appointmentId])
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
  useEffect(() => {
    void reader.load()
    const onFocus = () => { void reader.load() }
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void reader.load() }, 15000)
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); reader.cancel(); window.removeEventListener('focus', onFocus) }
  }, [reader])
  return { ...state, refresh: () => reader.load() }
}
