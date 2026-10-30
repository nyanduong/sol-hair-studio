import { describe, expect, it } from 'vitest'
import { formatDuration, formatPrice, slugify } from '../service-presentation.js'

describe('Mobile Service Presentation & Slugify Helpers', () => {
  it('formatPrice định dạng đúng tiền tệ VNĐ và miễn phí', () => {
    expect(formatPrice(0)).toBe('Miễn phí')
    expect(formatPrice(150000)).toBe('150.000đ')
    expect(formatPrice(null)).toBe('0đ')
    expect(formatPrice(undefined)).toBe('0đ')
  })

  it('formatDuration định dạng số hoặc dải min/max', () => {
    expect(formatDuration({ min: 30, max: 30 })).toBe('30 phút')
    expect(formatDuration({ min: 30, max: 45 })).toBe('30–45 phút')
    expect(formatDuration(45)).toBe('45 phút')
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration({})).toBe('—')
  })

  it('slugify tạo slug an toàn cho ID từ tên tiếng Việt', () => {
    expect(slugify('Cắt tóc & Tạo kiểu layer')).toBe('cat-toc-tao-kieu-layer')
    expect(slugify('Nhuộm tóc thời trang Đỗ Quyên')).toBe('nhuom-toc-thoi-trang-do-quyen')
    expect(slugify('Uốn xoăn hippie / sóng lơi')).toBe('uon-xoan-hippie-song-loi')
    expect(slugify('')).toBe('')
    expect(slugify(null)).toBe('')
  })
})

