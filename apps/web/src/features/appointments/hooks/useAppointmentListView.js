import { useEffect, useState } from 'react'

const TWO_HOURS = 2 * 60 * 60 * 1000
const UPCOMING = new Set(['confirmed', 'in_progress'])
const HISTORY = new Set(['completed', 'cancelled', 'no_show'])

export function getAppointmentTabView(state, tab) {
  const upcoming = state.items.filter(item => UPCOMING.has(item.status))
  const history = state.items.filter(item => HISTORY.has(item.status))
  // Chỉ có tổng chính xác và kết luận rỗng sau trang cuối thành công.
  const complete = state.kind === 'success' && !state.hasNextPage
  const items = tab === 'upcoming' ? upcoming : history
  return {
    items,
    counts: complete ? { upcoming: upcoming.length, history: history.length } : {},
    empty: complete && items.length === 0,
    incomplete: Boolean(state.hasNextPage) && state.kind !== 'loading',
  }
}

export function isAppointmentCutoffReached(appointment, now) {
  return appointment.status === 'confirmed' &&
    new Date(appointment.startAt).getTime() - now < TWO_HOURS
}

// Cập nhật đúng lúc vượt mốc 2h, và đồng bộ lại khi quay về tab trình duyệt.
export function watchAppointmentCutoffs(items, update) {
  let timer
  const thresholds = items.filter(item => item.status === 'confirmed')
    .map(item => new Date(item.startAt).getTime() - TWO_HOURS + 1)
    .filter(Number.isFinite)
  function tick() {
    clearTimeout(timer)
    const now = Date.now()
    update(now)
    const next = Math.min(...thresholds.filter(value => value > now), now + 60_000)
    timer = setTimeout(tick, Math.max(1, next - now))
  }
  timer = setTimeout(tick, 0)
  window.addEventListener('focus', tick)
  document.addEventListener('visibilitychange', tick)
  return () => {
    clearTimeout(timer)
    window.removeEventListener('focus', tick)
    document.removeEventListener('visibilitychange', tick)
  }
}

export function useAppointmentListView(state, tab) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => watchAppointmentCutoffs(state.items, setNow), [state.items])
  return { ...getAppointmentTabView(state, tab), now }
}
