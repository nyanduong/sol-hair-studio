import { createLatestRequest } from '../../../lib/latest-request.js'
import { validAppointmentDate } from '../../appointments/appointment-presentation.js'

// Publish totals only after every page succeeds. Never display a partial total.
export async function readReportDay({ readPage, staffId, localDate }, signal) {
  const items = new Map(), cursors = new Set()
  let cursor = null
  do {
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    const page = await readPage(cursor, signal)
    for (const item of page.items) {
      if (item.staffId !== staffId || item.localDate !== localDate) throw Object.assign(new Error('Lịch không thuộc phiên hiện tại.'), { status: 403 })
      if (items.has(item.id)) throw new Error('Danh sách lịch đã thay đổi. Vui lòng tải lại báo cáo.')
      items.set(item.id, item)
    }
    if (!page.pagination.hasNextPage) break
    cursor = page.pagination.nextCursor
    if (!cursor || cursors.has(cursor)) throw new Error('Không thể đọc đủ lịch hẹn. Vui lòng tải lại.')
    cursors.add(cursor)
  } while (cursor !== null)
  return [...items.values()].sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id))
}

export function reportShifts(shifts, staffId, range) {
  if (!Array.isArray(shifts) || shifts.some(shift => !shift || shift.staffId !== staffId ||
    typeof shift.shiftId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(shift.shiftId) || !validAppointmentDate(shift.localDate) ||
    shift.localDate < range.fromDate || shift.localDate > range.toDate ||
    !['active', 'cancelled'].includes(shift.status) || !Number.isFinite(Date.parse(shift.startAt)) ||
    !Number.isFinite(Date.parse(shift.endAt)) || Date.parse(shift.endAt) <= Date.parse(shift.startAt))) {
    throw new Error('Không đọc được ca làm đúng tháng và hồ sơ của bạn.')
  }
  return shifts.filter(shift => shift.status === 'active').map(({ shiftId, localDate, startAt, endAt }) => ({ shiftId, localDate, startAt, endAt })).sort((a, b) => a.startAt.localeCompare(b.startAt))
}

export function createReportReader(readData) {
  const latest = createLatestRequest(), listeners = new Set()
  const initial = { kind: 'loading' }
  let state = initial
  const publish = value => { state = value; listeners.forEach(listener => listener()) }
  async function load() {
    publish(initial)
    const result = await latest.run(readData)
    if (result.kind === 'success') publish({ kind: 'success', data: result.value })
    if (result.kind === 'error') publish({ kind: [401, 403, 404].includes(result.error.status) ? 'denied' : 'error', error: result.error })
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    load,
    retry: load,
    cancel() { latest.cancel(); publish(initial) },
  }
}
