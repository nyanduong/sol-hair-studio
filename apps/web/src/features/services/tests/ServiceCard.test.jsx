import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import ServiceCard from '../components/ServiceCard.jsx'

describe('ServiceCard với DTO từ API', () => {
  it('giữ thông tin dịch vụ trong thẻ liên kết tới booking với đúng mã dịch vụ', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><ServiceCard service={{
      id: 'contract-fixture', name: 'Dịch vụ từ API',
      description: 'Mô tả lấy từ máy chủ.',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/fixture.jpg',
      priceVnd: 0, durationMinutes: { min: 30, max: 30 },
    }} /></MemoryRouter>)
    expect(markup).toContain('Dịch vụ từ API')
    expect(markup).toContain('Mô tả lấy từ máy chủ.')
    expect(markup).toContain('https://res.cloudinary.com/demo/image/upload/fixture.jpg')
    expect(markup).toContain('Miễn phí')
    expect(markup).toContain('30 phút')
    expect(markup).toContain('href="/booking?serviceId=contract-fixture"')
    expect(markup).toContain('aria-label="Dịch vụ từ API — Đặt lịch"')
  })
})
