const customerItems = [
  { route: 'Home', icon: 'home', label: 'Trang chủ' },
  { route: 'Services', icon: 'grid', label: 'Dịch vụ' },
  { route: 'Booking', icon: 'calendar', label: 'Đặt lịch', kind: 'booking', booking: true },
  { icon: 'clock', label: 'Lịch hẹn của tôi', kind: 'unavailable', requiresAuth: true },
  { route: 'Profile', icon: 'user', label: 'Tài khoản', kind: 'profile' },
]

const stylistItems = [
  { route: 'Home', icon: 'home', label: 'Trang chủ' },
  { icon: 'calendar', label: 'Lịch hẹn được giao', kind: 'unavailable', requiresAuth: true },
  { route: 'StylistShifts', icon: 'clock', label: 'Ca làm của tôi', kind: 'stylist-shifts', booking: true },
  { icon: 'bar-chart-2', label: 'Báo cáo', kind: 'unavailable', requiresAuth: true },
  { route: 'Profile', icon: 'user', label: 'Tài khoản', kind: 'profile' },
]

export function getBottomNavItems(isStylist) {
  return isStylist ? stylistItems : customerItems
}
