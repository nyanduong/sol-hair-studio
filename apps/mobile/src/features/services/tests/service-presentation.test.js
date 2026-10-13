import { describe, expect, it } from 'vitest'
import { formatDuration, formatPrice, serviceColumns } from '../service-presentation.js'

describe('mobile service presentation', () => {
  it('shows free services and Vietnamese prices', () => {
    expect(formatPrice(0)).toBe('Miễn phí')
    expect(formatPrice(1200000)).toBe('1.200.000đ')
  })
  it('does not repeat a fixed duration', () => {
    expect(formatDuration({ min: 30, max: 30 })).toBe('30 phút')
    expect(formatDuration({ min: 45, max: 60 })).toBe('45–60 phút')
  })
  it('switches to one column on narrow screens and large text', () => {
    expect(serviceColumns(320)).toBe(1)
    expect(serviceColumns(393)).toBe(2)
    expect(serviceColumns(393, 1.3)).toBe(1)
    expect(serviceColumns(768, 2)).toBe(2)
    expect(serviceColumns(1024, 2.2)).toBe(1)
  })
})
