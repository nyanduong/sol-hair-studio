import { MemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CustomerAppointmentList from '../components/CustomerAppointmentList.jsx'
import { createCustomerAppointmentList } from '../hooks/useCustomerAppointments.js'
import { getAppointmentTabView, isAppointmentCutoffReached, watchAppointmentCutoffs } from '../hooks/useAppointmentListView.js'

const NOW = new Date('2026-10-24T05:00:00.000Z')
const item = {
  id: 'a', startAt: '2026-10-24T07:00:00.000Z', endAt: '2026-10-24T08:00:00.000Z',
  status: 'confirmed', staffNameSnapshot: 'An', items: [{ name: 'Cắt tóc' }, { name: 'Gội đầu' }],
  totalDurationMinutes: 60, totalPriceVnd: 100000,
}
const state = (items = [], extra = {}) => ({ kind: 'success', items, hasNextPage: false, ...extra })
const render = value => renderToStaticMarkup(<MemoryRouter><CustomerAppointmentList state={value} onLogin={() => {}} /></MemoryRouter>)
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('tabs and incomplete pagination', () => {
  it('does not claim an empty upcoming tab or show incomplete totals while history fills the first page', () => {
    const value = state([{ ...item, status: 'completed' }], { hasNextPage: true })
    const view = getAppointmentTabView(value, 'upcoming')
    expect(view).toMatchObject({ items: [], counts: {}, empty: false, incomplete: true })
    const html = render(value)
    expect(html).toContain('Hãy xem thêm')
    expect(html).toContain('Xem thêm lịch hẹn')
    expect(html).not.toContain('Bạn chưa có lịch hẹn')
  })
  it('does not claim an empty history tab while later pages are still unknown', () => {
    const view = getAppointmentTabView(state([item], { hasNextPage: true }), 'history')
    expect(view).toMatchObject({ items: [], counts: {}, empty: false, incomplete: true })
  })
  it('shows exact counts and empty state only after the final successful page', () => {
    const value = state([{ ...item, status: 'completed' }])
    expect(getAppointmentTabView(value, 'upcoming')).toMatchObject({
      counts: { upcoming: 0, history: 1 }, empty: true, incomplete: false,
    })
    expect(render(value)).toContain('Bạn chưa có lịch hẹn trong mục này')
    expect(render(value)).not.toContain('Bạn chưa có lịch hẹn nào')
  })
  it.each(['loading', 'loadingMore', 'error'])('does not report empty or totals during %s', kind => {
    const value = state([], { kind, error: new Error('offline') })
    expect(getAppointmentTabView(value, 'history')).toMatchObject({ counts: {}, empty: false })
    expect(render(value)).not.toContain('Bạn chưa có lịch hẹn')
  })
  it('keeps confirmed appointments past their planned time in the active group', () => {
    const old = { ...item, startAt: '2020-01-01T00:00:00.000Z' }
    expect(getAppointmentTabView(state([old]), 'upcoming').items).toEqual([old])
  })
  it('combines later pages without duplicate rows and retains backend order in each tab', async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce({ items: [{ ...item, id: 'history', status: 'completed' }], pagination: { hasNextPage: true, nextCursor: 'c1' } })
      .mockResolvedValueOnce({ items: [{ ...item, id: 'history', status: 'completed' }, item], pagination: { hasNextPage: false, nextCursor: null } })
    const list = createCustomerAppointmentList({
      readProfile: async () => ({ status: 'active', roles: ['customer'] }), readPage,
    })
    await list.load()
    expect(getAppointmentTabView(list.getSnapshot(), 'upcoming').empty).toBe(false)
    expect(getAppointmentTabView(list.getSnapshot(), 'history').counts).toEqual({})
    await list.load(true)
    expect(readPage.mock.calls.map(args => args[0])).toEqual([null, 'c1'])
    expect(getAppointmentTabView(list.getSnapshot(), 'upcoming').items.map(x => x.id)).toEqual(['a'])
    expect(getAppointmentTabView(list.getSnapshot(), 'history').items.map(x => x.id)).toEqual(['history'])
    expect(getAppointmentTabView(list.getSnapshot(), 'history').counts).toEqual({ upcoming: 1, history: 1 })
  })
})

describe('service snapshots and cutoff display', () => {
  it('renders every service snapshot name without fetching the current catalog', () => {
    const html = render(state([item]))
    expect(html).toContain('Cắt tóc')
    expect(html).toContain('Gội đầu')
    expect(html).toContain('An')
  })
  it.each([
    ['more than two hours', -1, false],
    ['exactly two hours', 0, false],
    ['one millisecond below two hours', 1, true],
    ['at start', 7200000, true],
    ['past start', 7200001, true],
  ])('handles %s', (_label, offset, locked) => {
    const now = NOW.getTime() + offset
    expect(isAppointmentCutoffReached(item, now)).toBe(locked)
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const html = render(state([item]))
    expect(html.includes('href="/lich-cua-toi/a?action=reschedule"')).toBe(!locked)
    expect(html.includes('href="tel:19006828"')).toBe(locked)
    if (offset >= 7200000) expect(html).toContain('Lịch hẹn đã đến hoặc quá giờ.')
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('never permits reschedule for %s', status => {
    expect(isAppointmentCutoffReached({ ...item, status }, NOW.getTime())).toBe(false)
    const html = render(state([{ ...item, status }]))
    expect(html).not.toContain('action=reschedule')
  })
  it('updates at the exact cutoff boundary and clears timers/listeners when disposed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW.getTime() - 1)
    const windowEvents = new EventTarget()
    const documentEvents = new EventTarget()
    vi.stubGlobal('window', windowEvents)
    vi.stubGlobal('document', documentEvents)
    const update = vi.fn()
    const stop = watchAppointmentCutoffs([item], update)
    vi.advanceTimersByTime(0)
    expect(isAppointmentCutoffReached(item, update.mock.lastCall[0])).toBe(false)
    vi.advanceTimersByTime(1)
    expect(isAppointmentCutoffReached(item, update.mock.lastCall[0])).toBe(false)
    vi.advanceTimersByTime(1)
    expect(isAppointmentCutoffReached(item, update.mock.lastCall[0])).toBe(true)
    stop()
    const calls = update.mock.calls.length
    windowEvents.dispatchEvent(new Event('focus'))
    documentEvents.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(120000)
    expect(update).toHaveBeenCalledTimes(calls)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('resynchronizes after the browser regains focus or visibility', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW.getTime() - 1000)
    const windowEvents = new EventTarget()
    const documentEvents = new EventTarget()
    vi.stubGlobal('window', windowEvents)
    vi.stubGlobal('document', documentEvents)
    const update = vi.fn()
    const stop = watchAppointmentCutoffs([item], update)
    vi.advanceTimersByTime(0)
    vi.setSystemTime(NOW.getTime() + 1000)
    windowEvents.dispatchEvent(new Event('focus'))
    expect(isAppointmentCutoffReached(item, update.mock.lastCall[0])).toBe(true)
    vi.setSystemTime(NOW.getTime() + 2000)
    documentEvents.dispatchEvent(new Event('visibilitychange'))
    expect(update.mock.lastCall[0]).toBe(NOW.getTime() + 2000)
    stop()
  })
})
