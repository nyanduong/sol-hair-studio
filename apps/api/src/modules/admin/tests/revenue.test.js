import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

vi.mock('../../appointments/appointments.model.js', async original => ({ ...await original(), AppointmentModel: { aggregate: vi.fn() } }))
vi.mock('../../../config/database.js', () => ({ getDatabaseStatus: () => 'connected' }))
vi.mock('../../auth/auth.service.js', async original => ({ ...await original(), authenticate: vi.fn() }))
import { AppointmentModel } from '../../appointments/appointments.model.js'
import { authenticate } from '../../auth/auth.service.js'
import { getRevenueFilters, getRevenueReport } from '../revenue.service.js'
import { app } from '../../../app.js'

beforeEach(() => {
  vi.resetAllMocks()
  authenticate.mockResolvedValue({ roles: ['owner'], email: 'owner@example.test' })
  AppointmentModel.aggregate.mockResolvedValue([{ summary: [], periods: [], services: [] }])
})

describe('Revenue date filters', () => {
  it('includes today and six preceding dates across year boundaries', () => {
    expect(getRevenueFilters({}, '2026-01-03')).toEqual({ range: 'week', group: 'day', from: '2025-12-28', to: '2026-01-03' })
    expect(getRevenueFilters({ range: 'month' }, '2026-11-03').from).toBe('2026-11-01')
    expect(getRevenueFilters({ range: 'today' }, '2026-11-03').from).toBe('2026-11-03')
  })
  it.each([
    { range: ['week'] }, { group: 'year' },
    { range: 'custom', from: '2026-02-29', to: '2026-03-01' },
    { range: 'custom', from: '2026-11-04', to: '2026-11-03' },
    { range: 'custom', from: '2025-01-01', to: '2026-01-02' },
    { range: 'custom', from: { $gt: '' }, to: '2026-01-01' },
  ])('rejects malformed or excessive ranges: %j', query => {
    expect(() => getRevenueFilters(query)).toThrow(RangeError)
  })
  it('allows a leap day and an inclusive 366-day range', () => {
    expect(getRevenueFilters({ range: 'custom', from: '2024-01-01', to: '2024-12-31' }).to).toBe('2024-12-31')
  })
})

describe('Revenue aggregation', () => {
  it('filters completed local-date snapshots before all aggregations and fills missing dates', async () => {
    AppointmentModel.aggregate.mockResolvedValue([{
      summary: [{ revenueVnd: 1500000, count: 2 }],
      periods: [{ _id: '2026-11-01', revenueVnd: 1500000, count: 2 }],
      services: [{ _id: 'cut', name: 'Cắt', revenueVnd: 500000, count: 1 }, { _id: 'color', name: 'Nhuộm', revenueVnd: 1000000, count: 2 }],
    }])
    const report = await getRevenueReport({ from: '2026-11-01', to: '2026-11-03', group: 'day' })
    expect(AppointmentModel.aggregate.mock.calls[0][0][0]).toEqual({ $match: { status: 'completed', localDate: { $gte: '2026-11-01', $lte: '2026-11-03' } } })
    expect(report.averageVnd).toBe(750000)
    expect(report.periods).toHaveLength(3)
    expect(report.periods[1]).toEqual({ key: '2026-11-02', revenueVnd: 0, count: 0 })
    expect(report.services[1].share).toBeCloseTo(66.6667)
  })
  it('fills partial months once and returns finite zero metrics for empty data', async () => {
    const report = await getRevenueReport({ from: '2026-10-28', to: '2026-11-03', group: 'month' })
    expect(report.periods.map(row => row.key)).toEqual(['2026-10', '2026-11'])
    expect(report.revenueVnd).toBe(0)
    expect(report.averageVnd).toBe(0)
  })
})

describe('Owner revenue page', () => {
  it('requires an authenticated owner', async () => {
    await request(app).get('/admin/revenue').expect(303)
    authenticate.mockResolvedValue({ roles: ['customer'] })
    await request(app).get('/admin/revenue').set('Cookie', 'sol_admin_token=fixture').expect(303)
    expect(AppointmentModel.aggregate).not.toHaveBeenCalled()
  })
  it('renders an empty report with navigation immediately below overview', async () => {
    const response = await request(app).get('/admin/revenue').set('Cookie', 'sol_admin_token=fixture').expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.text).toContain('Chưa có lịch hẹn hoàn tất')
    expect(response.text).toContain('href="/admin/revenue" aria-current="page"')
    expect(response.text.indexOf('href="/admin/revenue"')).toBeLessThan(response.text.indexOf('href="/owner/appointments"'))
  })
  it('renders actual amounts and escaped snapshots in the chart and service table', async () => {
    AppointmentModel.aggregate.mockResolvedValue([{
      summary: [{ revenueVnd: 450000, count: 1 }], periods: [{ _id: '2026-11-03', revenueVnd: 450000, count: 1 }],
      services: [{ _id: 'cut', name: '<script>bad</script>', revenueVnd: 450000, count: 1 }],
    }])
    const response = await request(app).get('/admin/revenue?range=custom&from=2026-11-03&to=2026-11-03').set('Cookie', 'sol_admin_token=fixture').expect(200)
    expect(response.text).toContain('450.000 đ')
    expect(response.text).toContain('&lt;script&gt;bad&lt;/script&gt;')
    expect(response.text).toContain('viewBox=')
  })
  it('rejects invalid filters without querying the database', async () => {
    await request(app).get('/admin/revenue?range=custom&from=bad&to=bad').set('Cookie', 'sol_admin_token=fixture').expect(400)
    expect(AppointmentModel.aggregate).not.toHaveBeenCalled()
  })
  it('shows a retryable failure instead of a false zero report or database details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    AppointmentModel.aggregate.mockRejectedValue(new Error('private database detail'))
    const response = await request(app).get('/admin/revenue').set('Cookie', 'sol_admin_token=fixture').expect(503)
    expect(response.text).toContain('Chưa thể tải báo cáo')
    expect(response.text).not.toContain('private database detail')
    expect(response.text).not.toContain('Trung bình mỗi lịch')
    log.mockRestore()
  })
})
