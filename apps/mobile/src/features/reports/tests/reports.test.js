import { describe, expect, it, vi } from 'vitest'
import { salonDate } from '../../../../../../shared/booking.js'
import { calendarWeeks, monthRange, moveMonth, summarizeDay } from '../report-presentation.js'
import { createReportReader, readReportDay, reportShifts } from '../hooks/report-reader.js'
import { bindAppointmentLifecycle } from '../../appointments/hooks/customer-appointments-reader.js'

const staffId = 'aaaaaaaaaaaaaaaaaaaaaaaa', date = '2026-11-08'
const signal = () => new AbortController().signal
const row = (n, status = 'completed') => ({ id: String(n), staffId, localDate: date, status, totalPriceVnd: 150000, startAt: '2026-11-08T02:00:00.000Z' })
const page = (items, nextCursor = null) => ({ items, pagination: { hasNextPage: nextCursor !== null, nextCursor } })
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }

describe('staff report calendar and honest metrics', () => {
  it('uses salon dates at the Vietnam midnight boundary', () => {
    expect(salonDate(new Date('2026-11-07T16:59:59Z'))).toBe('2026-11-07')
    expect(salonDate(new Date('2026-11-07T17:00:00Z'))).toBe(date)
  })
  it('builds Monday-first months with leading/trailing blanks and leap years', () => {
    const weeks = calendarWeeks('2026-11')
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(weeks.at(-1)).toEqual(['2026-11-30', null, null, null, null, null, null])
    expect(weeks.flat().filter(Boolean)).toHaveLength(30)
    expect(monthRange('2028-02')).toEqual({ fromDate: '2028-02-01', toDate: '2028-02-29' })
    expect(monthRange('2027-02').toDate).toBe('2027-02-28')
    expect(moveMonth('2026-12', 1)).toBe('2027-01')
    expect(moveMonth('2026-01', -1)).toBe('2025-12')
  })
  it('separates waiting/in-progress/completed and never invents receipts or cancellations', () => {
    expect(summarizeDay([row(1), row(2, 'confirmed'), row(3, 'in_progress'), { ...row(4), totalPriceVnd: 0 }])).toEqual({
      completed: 2, waiting: 1, inProgress: 1, serviceValueVnd: 150000, cancelled: null,
    })
    expect(summarizeDay([])).toMatchObject({ completed: 0, waiting: 0, serviceValueVnd: 0, cancelled: null })
  })
})

describe('complete report pagination', () => {
  it('loads over 50 appointments before publishing the report', async () => {
    const readPage = vi.fn().mockResolvedValueOnce(page(Array.from({ length: 50 }, (_, i) => row(i)), 'second')).mockResolvedValueOnce(page([row(50)]))
    const items = await readReportDay({ readPage, staffId, localDate: date }, signal())
    expect(items).toHaveLength(51)
    expect(summarizeDay(items).serviceValueVnd).toBe(7650000)
    expect(readPage.mock.calls.map(call => call[0])).toEqual([null, 'second'])
  })
  it('does not publish an undercount if a later page fails', async () => {
    const readPage = vi.fn().mockResolvedValueOnce(page([row(1)], 'second')).mockRejectedValueOnce(new Error('Offline'))
    const reader = createReportReader(signal => readReportDay({ readPage, staffId, localDate: date }, signal))
    await reader.load()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'error' })
    expect(reader.getSnapshot()).not.toHaveProperty('data')
  })
  it.each([{ staffId: 'another-staff' }, { localDate: '2026-11-09' }])('rejects mixed staff or date: %j', async patch => {
    await expect(readReportDay({ staffId, localDate: date, readPage: async () => page([{ ...row(1), ...patch }]) }, signal())).rejects.toMatchObject({ status: 403 })
  })
  it('rejects duplicate rows and cyclic cursors instead of guessing totals', async () => {
    const duplicate = vi.fn().mockResolvedValueOnce(page([row(1)], 'second')).mockResolvedValueOnce(page([row(1)]))
    await expect(readReportDay({ staffId, localDate: date, readPage: duplicate }, signal())).rejects.toThrow('đã thay đổi')
    const cyclic = vi.fn().mockResolvedValue(page([], 'same'))
    await expect(readReportDay({ staffId, localDate: date, readPage: cyclic }, signal())).rejects.toThrow('đọc đủ')
    expect(cyclic).toHaveBeenCalledTimes(2)
  })
  it('stops before fetching on an aborted lifecycle', async () => {
    const controller = new AbortController(), readPage = vi.fn()
    controller.abort()
    await expect(readReportDay({ staffId, localDate: date, readPage }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(readPage).not.toHaveBeenCalled()
  })
})

describe('report lifecycle and shift scope', () => {
  it('ignores an old request after retry and erases old data on authorization failure', async () => {
    const old = deferred(), read = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValueOnce(['new']).mockRejectedValueOnce({ status: 403 })
    const reader = createReportReader(read)
    const first = reader.load()
    await reader.retry()
    old.resolve(['old']); await first
    expect(reader.getSnapshot()).toEqual({ kind: 'success', data: ['new'] })
    await reader.load()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'denied' })
    expect(reader.getSnapshot()).not.toHaveProperty('data')
  })
  it('cancels on blur/background and reloads on foreground', async () => {
    const old = deferred(), read = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValueOnce([])
    const reader = createReportReader(read), remove = vi.fn()
    let change
    const cleanup = bindAppointmentLifecycle(reader, { currentState: 'active', addEventListener: (_, callback) => { change = callback; return { remove } } })
    change('background')
    expect(read.mock.calls[0][0].aborted).toBe(true)
    old.resolve(['old']); await old.promise
    expect(reader.getSnapshot()).toEqual({ kind: 'loading' })
    change('active')
    await vi.waitFor(() => expect(reader.getSnapshot()).toEqual({ kind: 'success', data: [] }))
    cleanup()
    expect(remove).toHaveBeenCalledOnce()
    expect(reader.getSnapshot()).not.toHaveProperty('data')
  })
  const shift = { shiftId: 'bbbbbbbbbbbbbbbbbbbbbbbb', staffId, localDate: date, status: 'active', startAt: '2026-11-08T02:00:00.000Z', endAt: '2026-11-08T10:00:00.000Z' }
  it('marks only active shifts, strips extra fields and preserves off-days', () => {
    const range = monthRange('2026-11')
    expect(reportShifts([{ ...shift, privateData: 'hidden' }, { ...shift, status: 'cancelled' }], staffId, range)).toEqual([
      { shiftId: shift.shiftId, localDate: date, startAt: shift.startAt, endAt: shift.endAt },
    ])
    expect(reportShifts([], staffId, range)).toEqual([])
  })
  it.each([{ staffId: 'another' }, { localDate: '2026-12-01' }, { status: 'unknown' }, { localDate: undefined }, { endAt: 'invalid' }])('rejects incorrect shift data %j', patch => {
    expect(() => reportShifts([{ ...shift, ...patch }], staffId, monthRange('2026-11'))).toThrow()
  })
})
