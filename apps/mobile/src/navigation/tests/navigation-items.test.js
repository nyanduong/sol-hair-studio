import { describe, expect, it } from 'vitest'
import { getBottomNavItems } from '../navigation-items.js'

describe('điều hướng dưới theo vai trò', () => {
  it('giữ dịch vụ và đặt lịch cho khách hàng', () => {
    expect(getBottomNavItems({ roles: ['customer'] }).map((item) => item.label)).toEqual([
      'Trang chủ', 'Dịch vụ', 'Đặt lịch', 'Lịch hẹn của tôi', 'Tài khoản',
    ])
  })

  it('đặt ca làm của stylist ở giữa và không hiển thị dịch vụ hay đặt lịch', () => {
    const items = getBottomNavItems({ roles: ['stylist'] })
    expect(items.map((item) => item.label)).toEqual([
      'Trang chủ', 'Lịch hẹn', 'Ca làm của tôi', 'Báo cáo', 'Tài khoản',
    ])
    expect(items[2]).toMatchObject({ route: 'StylistShifts', booking: true })
    expect(items[1]).toMatchObject({ route: 'StylistAppointments' })
    expect(items[3]).toMatchObject({ route: 'StylistReports', kind: 'stylist-reports' })
  })

  it('ưu tiên điều hướng gọn cho chủ salon', () => {
    const items = getBottomNavItems({ roles: ['owner', 'customer'] })

    expect(items.map((item) => item.label)).toEqual(['Trang chủ', 'Tổng quan', 'Tài khoản'])
    expect(items[1]).toMatchObject({ route: 'OwnerDashboard', kind: 'owner-dashboard', booking: true })
  })
})
