import { describe, expect, it } from 'vitest'
import { filterBookingServices, serviceCategory } from '../service-catalog.js'

const services = Array.from({ length: 30 }, (_, index) => ({
  id: `service-${index}`,
  name: index % 2 ? `Nhuộm thời trang ${index}` : `Cắt & tạo kiểu ${index}`,
  category: index % 2 ? 'Nhuộm' : 'Tạo kiểu',
}))

describe('booking catalog search', () => {
  it('matches Vietnamese text without accents and combines all query terms with the category filter', () => {
    expect(filterBookingServices(services, '  NHUOM   trang  ', 'Nhuộm')).toHaveLength(15)
    expect(filterBookingServices(services, 'nhuom', 'Tạo kiểu')).toHaveLength(0)
    expect(filterBookingServices(services, 'cat kieu 28', '')[0].id).toBe('service-28')
  })
  it('handles Đ, punctuation and missing categories without mutating the source catalog', () => {
    const items = [
      { id: 'a', name: 'Duỗi tóc', category: '  Chăm sóc  ' },
      { id: 'b', name: 'Gội đầu' },
    ]
    expect(filterBookingServices(items, 'duoi', 'Chăm sóc').map((item) => item.id)).toEqual(['a'])
    expect(filterBookingServices(items, 'dau', 'Khác').map((item) => item.id)).toEqual(['b'])
    expect(serviceCategory(items[1])).toBe('Khác')
    expect(items[0].category).toBe('  Chăm sóc  ')
  })
})
