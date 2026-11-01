import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import BookingSuccess from '../components/BookingSuccess.jsx'

const receipt = {
  id: '0123456789abcdef01234567',
  referenceCode: 'SOL-23456789',
  startAt: '2026-11-02T02:00:00Z',
  endAt: '2026-11-02T04:15:00Z',
  staffDisplayName: 'Stylist Linh',
  customerDisplayName: 'Khách QA',
  totalPriceVnd: 1050000,
  totalDurationMinutes: 135,
  status: 'confirmed',
  items: [{ serviceId: 'cut', name: 'Dịch vụ đã lưu', priceVnd: 1050000, durationMinutes: 135 }],
}
it('renders the saved receipt independently of live catalog and links to its protected detail', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <BookingSuccess
        receipt={receipt}
        services={[{ id: 'cut', name: 'Tên mới trong catalog', priceVnd: 1 }]}
      />
    </MemoryRouter>,
  )
  expect(html).toContain('SOL-23456789')
  expect(html).toContain('Dịch vụ đã lưu')
  expect(html).not.toContain('Tên mới trong catalog')
  expect(html).toContain('09:00')
  expect(html).toContain('11:15')
  expect(html).toContain(`/lich-cua-toi/${receipt.id}`)
  expect(html).not.toContain('Cần chọn lại giờ')
  expect(html).not.toContain('Sắp hoàn tất')
})
it('does not expose an internal ID as a customer code for legacy receipts', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <BookingSuccess receipt={{ ...receipt, referenceCode: undefined }} />
    </MemoryRouter>,
  )
  expect(html).not.toContain(`Mã lịch: ${receipt.id}`)
  expect(html).toContain('Xem thông tin lịch hẹn trong trang chi tiết.')
})
