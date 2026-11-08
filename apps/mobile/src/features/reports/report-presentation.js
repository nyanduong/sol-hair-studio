export function monthRange(month) {
  const [year, number] = month.split('-').map(Number)
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return { fromDate: `${month}-01`, toDate: `${month}-${days}` }
}

export function moveMonth(month, delta) {
  const date = new Date(`${month}-01T00:00:00.000Z`)
  date.setUTCMonth(date.getUTCMonth() + delta)
  return date.toISOString().slice(0, 7)
}

export function calendarWeeks(month) {
  const { fromDate, toDate } = monthRange(month)
  const offset = (new Date(`${fromDate}T00:00:00.000Z`).getUTCDay() + 6) % 7
  const cells = Array(offset).fill(null)
  for (let day = 1; day <= Number(toDate.slice(-2)); day++) cells.push(`${month}-${String(day).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))
}

export function summarizeDay(items) {
  return {
    completed: items.filter(item => item.status === 'completed').length,
    waiting: items.filter(item => item.status === 'confirmed').length,
    inProgress: items.filter(item => item.status === 'in_progress').length,
    serviceValueVnd: items.filter(item => item.status === 'completed').reduce((sum, item) => sum + item.totalPriceVnd, 0),
    // Stylist DTO deliberately excludes cancellations.
    cancelled: null,
  }
}
