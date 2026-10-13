import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ServiceCard from '../components/ServiceCard.jsx'

describe('ServiceCard với DTO từ API', () => {
  it('render mô tả, ảnh và giá/thời lượng mà không tạo link detail chưa tồn tại', () => {
    const markup = renderToStaticMarkup(<ServiceCard service={{
      id: 'contract-fixture', name: 'Dịch vụ từ API',
      description: 'Mô tả lấy từ máy chủ.',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/fixture.jpg',
      priceVnd: 0, durationMinutes: { min: 30, max: 30 },
    }} />)
    expect(markup).toContain('Dịch vụ từ API')
    expect(markup).toContain('Mô tả lấy từ máy chủ.')
    expect(markup).toContain('https://res.cloudinary.com/demo/image/upload/fixture.jpg')
    expect(markup).toContain('Miễn phí')
    expect(markup).toContain('30 phút')
    expect(markup).not.toContain('<a ')
  })
})
