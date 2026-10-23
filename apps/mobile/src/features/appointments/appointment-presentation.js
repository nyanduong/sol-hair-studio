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

export const statusConfig = {
  confirmed: {
    label: 'Đã xác nhận',
    dot: '#10b981',
    bg: '#ecfdf5',
    text: '#065f46',
    border: '#a7f3d0',
  },
  in_progress: {
    label: 'Đang phục vụ',
    dot: '#3b82f6',
    bg: '#eff6ff',
    text: '#1e40af',
    border: '#bfdbfe',
  },
  completed: {
    label: 'Đã hoàn tất',
    dot: '#78716c',
    bg: '#f5f5f4',
    text: '#44403c',
    border: '#e7e5e4',
  },
  cancelled: {
    label: 'Đã hủy',
    dot: '#f43f5e',
    bg: '#fff1f2',
    text: '#9f1239',
    border: '#fecdd3',
  },
  no_show: {
    label: 'Không đến',
    dot: '#f59e0b',
    bg: '#fffbeb',
    text: '#92400e',
    border: '#fde68a',
  },
}

export function getStatusTheme(status) {
  return statusConfig[status] ?? {
    label: appointmentStatuses[status] ?? 'Chưa xác định',
    dot: '#a8a29e',
    bg: '#f5f5f4',
    text: '#44403c',
    border: '#e7e5e4',
  }
}

export function getShiftLabel(isoStr) {
  if (!isoStr) return ''
  const hour = new Date(isoStr).toLocaleTimeString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hour12: false })
  const hourNum = Number(hour)
  return hourNum < 12 ? 'Buổi sáng' : hourNum < 18 ? 'Chiều' : 'Buổi tối'
}

const fmtWeekday = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long' })
const fmtDay = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit' })
const fmtMonth = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', month: 'numeric' })

export function getCalendarTileParts(isoStr) {
  if (!isoStr) return { weekday: '', day: '', month: '' }
  const d = new Date(isoStr)
  const weekdayStr = fmtWeekday.format(d)
  const weekday = weekdayStr ? weekdayStr.charAt(0).toUpperCase() + weekdayStr.slice(1) : ''
  return {
    weekday,
    day: fmtDay.format(d),
    month: 'Thg ' + fmtMonth.format(d),
  }
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
