import { describe, expect, it } from 'vitest'
import { formatDuration, formatPrice } from '../format-service.js'

describe('định dạng dữ liệu dịch vụ cho giao diện', () => {
  it('giữ đơn vị VND và nhóm hàng nghìn theo locale Việt Nam', () => {
    expect(formatPrice(450000)).toBe('450.000đ')
    expect(formatPrice(1200000)).toBe('1.200.000đ')
  })

  it('hiển thị dịch vụ miễn phí mà không thay đổi dữ liệu API', () => {
    expect(formatPrice(0)).toBe('Miễn phí')
  })

  it('phân biệt thời lượng cố định với khoảng thời lượng', () => {
    expect(formatDuration({ min: 45, max: 60 })).toBe('45–60 phút')
    expect(formatDuration({ min: 30, max: 30 })).toBe('30 phút')
  })
})
