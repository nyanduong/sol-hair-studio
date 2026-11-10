const weekdayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
const actualTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function dateAtLocalMidnight(value) {
  return new Date(`${value}T00:00:00`)
}

function localDateValue(date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function currentWeekRange(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { fromDate: localDateValue(start), toDate: localDateValue(end) }
}

export function moveWeek(range, amount) {
  const start = dateAtLocalMidnight(range.fromDate)
  start.setDate(start.getDate() + amount * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { fromDate: localDateValue(start), toDate: localDateValue(end) }
}

export function weekLabel(range) {
  return `${formatShortDate(range.fromDate)} – ${formatShortDate(range.toDate)}`
}

export function formatShiftDate(localDate) {
  const date = dateAtLocalMidnight(localDate)
  return `${weekdayNames[date.getDay()]}, ${formatShortDate(localDate)}`
}

export function formatShiftTime(value) {
  const parts = Object.fromEntries(
    actualTime.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  )
  return `${parts.hour}:${parts.minute}`
}

export function shiftStatusLabel(status) {
  return status === 'cancelled' ? 'Đã hủy' : 'Đang áp dụng'
}

export function shiftAttendanceLabel(shift) {
  if (shift.status === 'cancelled') return 'Ca đã hủy'
  if (shift.actualEndedAt) return 'Đã kết thúc ca'
  if (shift.actualStartedAt) return 'Đang làm ca'
  const now = Date.now()
  if (now < Date.parse(shift.startAt)) return 'Chưa đến giờ làm'
  if (now >= Date.parse(shift.endAt)) return 'Đã quá giờ điểm danh'
  return 'Sẵn sàng bắt đầu ca'
}

export function shiftAttendanceAction(shift) {
  if (shift.status !== 'active' || shift.actualEndedAt) return null
  if (shift.actualStartedAt) return 'check-out'
  const now = Date.now()
  return now >= Date.parse(shift.startAt) && now < Date.parse(shift.endAt) ? 'check-in' : null
}

export function moveLocalDate(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function appointmentDateLabel(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

export function appointmentStatusLabel(status) {
  return {
    confirmed: 'Đã xác nhận',
    in_progress: 'Đang phục vụ',
    completed: 'Đã hoàn tất',
  }[status] ?? status
}

function formatShortDate(value) {
  const date = dateAtLocalMidnight(value)
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}
