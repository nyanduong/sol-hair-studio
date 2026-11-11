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
  { route: 'StylistReports', icon: 'bar-chart-2', label: 'Báo cáo', kind: 'stylist-reports' },
  { route: 'Profile', icon: 'user', label: 'Tài khoản', kind: 'profile' },
]

const ownerItems = [
  { route: 'Home', icon: 'home', label: 'Trang chủ' },
  { route: 'OwnerDashboard', icon: 'bar-chart-2', label: 'Tổng quan', kind: 'owner-dashboard', booking: true },
  { route: 'Profile', icon: 'user', label: 'Tài khoản', kind: 'profile' },
]

export function getBottomNavItems(account) {
  const roles = Array.isArray(account?.roles) ? account.roles : []
  if (roles.includes('owner')) return ownerItems
  return roles.includes('stylist') ? stylistItems : customerItems
}
