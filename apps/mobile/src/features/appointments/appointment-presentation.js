// Cùng thứ tự ưu tiên role của API: Owner > Stylist > Customer.
export function isAppointmentCustomer(account) {
  return account?.status === 'active' && Array.isArray(account.roles) &&
    account.roles.includes('customer') && !account.roles.some(role => ['owner', 'stylist'].includes(role))
}

export function appointmentListDestination(account) {
  // Giữ đường dẫn ca làm Stylist hiện có; Owner Mobile ngoài SOL-038.
  if (account?.roles?.includes('stylist')) return 'StylistShifts'
  return isAppointmentCustomer(account) ? 'CustomerAppointments' : null
}

export const appointmentStatuses = {
  confirmed: 'Đã xác nhận', in_progress: 'Đang phục vụ', completed: 'Đã hoàn tất',
  cancelled: 'Đã hủy', no_show: 'Không đến',
}

export function customerAppointmentTab(state, tab) {
  const upcoming = state.items.filter(item => ['confirmed', 'in_progress'].includes(item.status))
  const history = state.items.filter(item => ['completed', 'cancelled', 'no_show'].includes(item.status))
  const complete = state.kind === 'success' && !state.hasNextPage
  const items = tab === 'history' ? history : upcoming
  return { items, counts: complete ? { upcoming: upcoming.length, history: history.length } : null,
    empty: complete && items.length === 0, incomplete: Boolean(state.hasNextPage) }
}

const date = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const price = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

export function appointmentCardText(item) {
  return { date: date.format(new Date(item.startAt)), time: time.format(new Date(item.startAt)) + ' – ' + time.format(new Date(item.endAt)),
    services: item.items.map(service => service.name).join(' · '), stylist: item.staffNameSnapshot,
    duration: item.totalDurationMinutes + ' phút', price: price.format(item.totalPriceVnd), status: appointmentStatuses[item.status] }
}
