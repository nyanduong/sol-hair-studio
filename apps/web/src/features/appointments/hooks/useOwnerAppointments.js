import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { getMe } from '../../auth/api/auth.api.js'
import { listStaff } from '../../staff/api/staff.api.js'
import { listOwnerAppointments, readOwnerAppointment } from '../api/owner-appointments.api.js'

export function isOwnerAccount(account) {
  return account?.status === 'active' && Array.isArray(account.roles) && account.roles.includes('owner')
}

// Bộ đọc riêng từng phiên/filter. Mọi request mới đều xác minh Owner thật.
export function createOwnerAppointmentReader({ readProfile, readData, paginated = false }) {
  const latest = createLatestRequest()
  const listeners = new Set()
  const initial = { kind: 'loading', items: [], hasNextPage: false, nextCursor: null }
  let state = initial
  let busy = false
  let generation = 0
  const consumed = new Set()
  const publish = value => { state = value; listeners.forEach(listener => listener()) }
  async function load(more = false) {
    if (more && (busy || !state.hasNextPage || consumed.has(state.nextCursor))) return
    if (!more) consumed.clear()
    const current = ++generation
    const cursor = more ? state.nextCursor : null
    busy = true
    publish(more ? { ...state, kind: 'loadingMore', error: null } : initial)
    const result = await latest.run(async signal => {
      const profile = await readProfile(signal)
      if (!isOwnerAccount(profile?.account ?? profile)) {
        throw Object.assign(new Error('Chỉ chủ tiệm được truy cập.'), { status: 403 })
      }
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      return readData(cursor, signal)
    })
    if (generation !== current || result.kind === 'ignored') return
    busy = false
    if (result.kind === 'error') {
      const denied = [401, 403].includes(result.error.status)
      const notFound = result.error.status === 404
      publish({ ...(denied || notFound ? initial : state),
        kind: denied ? 'denied' : notFound ? 'notFound' : 'error', error: result.error, retryMore: more })
      return
    }
    if (!paginated) { publish({ ...initial, kind: 'success', value: result.value }); return }
    const data = result.value
    const next = data.pagination.nextCursor
    if (data.pagination.hasNextPage && (next === cursor || consumed.has(next))) {
      publish({ ...state, kind: 'error', restartRequired: true, error: new Error('Cursor bị lặp. Vui lòng tải lại danh sách.') })
      return
    }
    if (more) consumed.add(cursor)
    else consumed.clear()
    const items = new Map((more ? state.items : []).map(item => [item.id, item]))
    for (const item of data.items) items.set(item.id, item)
    publish({ kind: 'success', items: [...items.values()], hasNextPage: data.pagination.hasNextPage, nextCursor: next })
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    load,
    retry() { return load(state.restartRequired ? false : Boolean(state.retryMore)) },
    cancel() { generation += 1; latest.cancel(); busy = false; consumed.clear(); publish(initial) },
  }
}

export function useOwnerAppointmentRead(token, kind, params) {
  const signature = JSON.stringify(params)
  const reader = useMemo(() => {
    const query = JSON.parse(signature)
    return createOwnerAppointmentReader({
      paginated: kind === 'list',
      readProfile: signal => getMe(apiBaseUrl, token, { signal }),
      readData: async (cursor, signal) => {
        if (kind === 'list') return listOwnerAppointments(apiBaseUrl, token, query, cursor, signal)
        if (kind === 'detail') return readOwnerAppointment(apiBaseUrl, token, query.id, signal)
        const staff = await listStaff(apiBaseUrl, token, { signal })
        if (!Array.isArray(staff)) throw new Error('Không đọc được danh sách stylist.')
        return staff.map(({ staffId, displayName, isActive }) => ({ staffId, displayName, isActive }))
      },
    })
  }, [token, kind, signature])
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
  useEffect(() => { void reader.load(); return () => reader.cancel() }, [reader])
  return { ...state, loadMore: () => reader.load(true), retry: () => reader.retry() }
}

export const ownerAppointmentStatuses = {
  confirmed: 'Đã xác nhận', in_progress: 'Đang phục vụ', completed: 'Đã hoàn tất',
  cancelled: 'Đã hủy', no_show: 'Không đến',
}
