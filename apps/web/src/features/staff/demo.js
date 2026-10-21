// Dữ liệu minh họa chỉ sống trong bộ nhớ, không gửi tới API hay tài khoản thật.
export const services = ['Cắt & tạo kiểu', 'Uốn tóc', 'Nhuộm tóc', 'Phục hồi']
export const initialStaff = [
  { id: 'owner', name: 'Minh Anh', email: 'minhanh@example.com', active: true, services: [0, 1, 2, 3], owner: true },
  { id: 'stylist', name: 'Khánh Linh', email: 'khanhlinh@example.com', active: true, services: [0, 2], owner: false },
]

export function dateString(date) {
  return date.toISOString().slice(0, 10)
}

// Dùng UTC cho phép tính ngày lịch, tránh phụ thuộc múi giờ trình duyệt.
export function weekStart(value) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  return dateString(date)
}

export function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return dateString(date)
}

// Hiển thị đủ tháng và năm khi tuần đi qua ranh giới tháng hoặc năm.
export function formatWeekRange(start) {
  const end = addDays(start, 6)
  const [startYear, startMonth, startDay] = start.split('-').map(Number)
  const [endYear, endMonth, endDay] = end.split('-').map(Number)
  if (startYear !== endYear) return `${startDay} tháng ${startMonth}, ${startYear} – ${endDay} tháng ${endMonth}, ${endYear}`
  if (startMonth !== endMonth) return `${startDay} tháng ${startMonth} – ${endDay} tháng ${endMonth}, ${endYear}`
  return `${startDay} – ${endDay} tháng ${endMonth}, ${endYear}`
}
