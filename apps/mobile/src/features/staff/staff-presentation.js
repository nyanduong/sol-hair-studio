const weekdayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

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
  const match = /T(\d{2}:\d{2})/.exec(value)
  return match ? match[1] : value
}

export function shiftStatusLabel(status) {
  return status === 'cancelled' ? 'Đã hủy' : 'Đang áp dụng'
}

function formatShortDate(value) {
  const date = dateAtLocalMidnight(value)
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}
