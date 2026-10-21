import { describe, expect, it } from 'vitest'
import { addDays, formatWeekRange, weekStart } from '../demo.js'

describe('lịch mẫu của đội ngũ', () => {
  it('tính tuần và qua năm theo ngày lịch', () => {
    expect(weekStart('2027-01-01')).toBe('2026-12-28')
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04')
  })

  it('hiển thị tuần trong tháng, qua tháng và qua năm', () => {
    expect(formatWeekRange('2026-10-19')).toBe('19 – 25 tháng 10, 2026')
    expect(formatWeekRange('2026-10-26')).toBe('26 tháng 10 – 1 tháng 11, 2026')
    expect(formatWeekRange('2026-12-28')).toBe('28 tháng 12, 2026 – 3 tháng 1, 2027')
  })

})
