import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { getMe } from '../../auth/api/auth.api.js'
import { listCustomerAppointments } from '../api/appointments.api.js'

export function isCustomerAccount(account) {
  return account?.status === 'active' && Array.isArray(account.roles) && account.roles.includes('customer') &&
    !account.roles.some(role => role === 'owner' || role === 'stylist')
}

export function createCustomerAppointmentList({ readProfile, readPage }) {
    const latest = createLatestRequest()
    const listeners = new Set()
    const initial = { kind: 'loading', items: [], hasNextPage: false, nextCursor: null }
    let state = initial
    let busy = false
    let generation = 0
    const consumed = new Set()
    const publish = next => { state = next; listeners.forEach(listener => listener()) }

    async function load(more = false) {
      if (busy || state.kind === 'denied' || (more && !state.hasNextPage)) return
      const cursor = more ? state.nextCursor : null
      if (more && consumed.has(cursor)) return
      const currentGeneration = ++generation
      busy = true
      publish({ ...state, kind: more ? 'loadingMore' : 'loading', error: null })
      const result = await latest.run(async signal => {
        // Kiểm tra role thật trước mỗi trang, kể cả khi cache Auth đã cũ.
        const profile = await readProfile(signal)
        if (!isCustomerAccount(profile?.account ?? profile)) {
          throw Object.assign(new Error('Trang này chỉ dành cho tài khoản khách hàng.'), { status: 403 })
        }
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        return readPage(cursor, signal)
      })
      if (currentGeneration !== generation || result.kind === 'ignored') return
      busy = false
      if (result.kind === 'error') {
        const denied = [401, 403].includes(result.error.status)
        publish({ ...(denied ? initial : state), kind: denied ? 'denied' : 'error',
          error: result.error, retryMore: more })
        return
      }
      const data = result.value
      const next = data.pagination.nextCursor
      // Cursor phải tiến lên; không lặp request vô hạn khi server trả lại cursor cũ.
      if (data.pagination.hasNextPage && (next === cursor || consumed.has(next))) {
        publish({ ...state, kind: 'error', error: new Error('Phân trang không hợp lệ. Vui lòng tải lại danh sách.'),
          restartRequired: true })
        return
      }
      if (more) consumed.add(cursor)
      else consumed.clear()
      const items = new Map((more ? state.items : []).map(item => [item.id, item]))
      for (const item of data.items) items.set(item.id, item)
      publish({ kind: 'success', items: [...items.values()],
        hasNextPage: data.pagination.hasNextPage, nextCursor: next })
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    load,
    retry() { return load(state.restartRequired ? false : Boolean(state.retryMore)) },
    cancel() {
      generation += 1
      latest.cancel()
      busy = false
      consumed.clear()
      publish(initial)
    },
  }
}

export function useCustomerAppointments(token) {
  const list = useMemo(() => createCustomerAppointmentList({
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readPage: (cursor, signal) => listCustomerAppointments(apiBaseUrl, token, cursor, signal),
  }), [token])
  const state = useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot)
  useEffect(() => {
    void list.load()
    return () => list.cancel()
  }, [list])
  return { ...state, loadMore: () => list.load(true), retry: () => list.retry() }
}
