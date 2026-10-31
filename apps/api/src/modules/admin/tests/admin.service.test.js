import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../appointments/appointments.model.js', () => ({
  AppointmentModel: {
    find: vi.fn(),
    aggregate: vi.fn(),
  },
}))

vi.mock('../../services/services.model.js', () => ({
  ServiceModel: {
    countDocuments: vi.fn(),
  },
}))

vi.mock('../../staff/staff.model.js', () => ({
  StaffModel: {
    countDocuments: vi.fn(),
  },
}))

import { AppointmentModel } from '../../appointments/appointments.model.js'
import { ServiceModel } from '../../services/services.model.js'
import { StaffModel } from '../../staff/staff.model.js'
import { getDashboardData, getSalonTodayDate } from '../admin.service.js'

describe('Admin Service — getDashboardData', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('trả về định dạng ngày YYYY-MM-DD theo giờ salon', () => {
    const today = getSalonTodayDate()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('tổng hợp dữ liệu dashboard chính xác từ các model Mongoose', async () => {
    const mockTodayAppointments = [
      {
        _id: 'apt-001',
        totalPriceVnd: 500_000,
        status: 'completed',
        startAt: new Date(),
      },
      {
        _id: 'apt-002',
        totalPriceVnd: 300_000,
        status: 'in_progress',
        startAt: new Date(),
      },
      {
        _id: 'apt-003',
        totalPriceVnd: 200_000,
        status: 'confirmed',
        startAt: new Date(),
      },
      {
        _id: 'apt-004',
        totalPriceVnd: 150_000,
        status: 'cancelled',
        startAt: new Date(),
      },
    ]

    const sortMock = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTodayAppointments),
    })
    AppointmentModel.find.mockReturnValue({ sort: sortMock })

    AppointmentModel.aggregate
      .mockResolvedValueOnce([
        { _id: 'completed', count: 10 },
        { _id: 'in_progress', count: 2 },
        { _id: 'confirmed', count: 3 },
        { _id: 'cancelled', count: 1 },
      ])
      .mockResolvedValueOnce([{ _id: null, totalRevenue: 12_500_000 }])
      .mockResolvedValueOnce([
        { _id: 'Cắt tóc nam', serviceId: 's1', count: 8, totalRevenue: 1_600_000 },
      ])

    ServiceModel.countDocuments
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(7)

    StaffModel.countDocuments.mockResolvedValueOnce(3)

    const result = await getDashboardData()

    expect(result.todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.todayStats.total).toBe(4)
    expect(result.todayStats.completed).toBe(1)
    expect(result.todayStats.inProgress).toBe(1)
    expect(result.todayStats.confirmed).toBe(1)
    expect(result.todayStats.cancelled).toBe(1)
    expect(result.todayStats.revenueVnd).toBe(500_000)

    expect(result.totalRevenueVnd).toBe(12_500_000)
    expect(result.totalAppointments).toBe(16)
    expect(result.statusMap.completed).toBe(10)
    expect(result.statusMap.in_progress).toBe(2)
    expect(result.statusMap.confirmed).toBe(3)
    expect(result.statusMap.cancelled).toBe(1)
    expect(result.statusMap.no_show).toBe(0)

    expect(result.topServices).toHaveLength(1)
    expect(result.topServices[0]._id).toBe('Cắt tóc nam')
    expect(result.activeServicesCount).toBe(5)
    expect(result.totalServicesCount).toBe(7)
    expect(result.activeStaffCount).toBe(3)
  })

  it('xử lý an toàn khi cơ sở dữ liệu chưa có lịch hẹn nào', async () => {
    const sortMock = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    })
    AppointmentModel.find.mockReturnValue({ sort: sortMock })

    AppointmentModel.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    ServiceModel.countDocuments
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)

    StaffModel.countDocuments.mockResolvedValueOnce(0)

    const result = await getDashboardData()

    expect(result.todayStats.total).toBe(0)
    expect(result.todayStats.completed).toBe(0)
    expect(result.todayStats.revenueVnd).toBe(0)
    expect(result.totalRevenueVnd).toBe(0)
    expect(result.totalAppointments).toBe(0)
    expect(result.topServices).toHaveLength(0)
  })
})

