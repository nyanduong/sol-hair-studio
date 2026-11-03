const customerItems = [
  { route: 'Home', icon: 'home', label: 'Trang chủ' },
  { route: 'Services', icon: 'grid', label: 'Dịch vụ' },
  { route: 'Booking', icon: 'calendar', label: 'Đặt lịch', kind: 'booking', booking: true },
  { route: 'CustomerAppointments', icon: 'clock', label: 'Lịch hẹn của tôi', kind: 'customer-appointments' },
  { route: 'Profile', icon: 'user', label: 'Tài khoản', kind: 'profile' },
]

const stylistItems = [
  { route: 'Home', icon: 'home', label: 'Trang chủ' },
  { route: 'StylistAppointments', icon: 'calendar', label: 'Lịch hẹn', kind: 'stylist-appointments' },
  { route: 'StylistShifts', icon: 'clock', label: 'Ca làm của tôi', kind: 'stylist-shifts', booking: true },
  { icon: 'bar-chart-2', label: 'Báo cáo', kind: 'unavailable', requiresAuth: true },
  { route: 'Profile', icon: 'user', label: 'Tài khoản', kind: 'profile' },
]

export function getBottomNavItems(isStylist) {
  return isStylist ? stylistItems : customerItems
}
