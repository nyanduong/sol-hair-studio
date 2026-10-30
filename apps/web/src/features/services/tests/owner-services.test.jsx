import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/context/auth-context.js'
import OwnerServicesRoute from '../pages/OwnerServicesRoute.jsx'
import ServiceTable from '../components/ServiceTable.jsx'
import ServiceFormModal from '../components/ServiceFormModal.jsx'
import { formatDuration, formatPrice, slugify } from '../format-service.js'

function renderRoute(account, token = account ? 'mock-token' : null) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/quan-ly/dich-vu']}>
      <AuthContext.Provider
        value={{
          account,
          token,
          isAuthenticated: Boolean(account && token),
          openLoginModal: vi.fn(),
          logout: vi.fn(),
        }}
      >
        <OwnerServicesRoute />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

const mockServices = [
  {
    id: 'cat-toc-nam',
    slug: 'cat-toc-nam',
    name: 'Cắt tóc nam tiêu chuẩn',
    description: 'Bao gồm gội đầu xả sấy tạo kiểu',
    category: 'Cắt & Tạo kiểu',
    durationMinutes: { min: 30, max: 45 },
    bookingDurationMinutes: 45,
    priceVnd: 120000,
    imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    isActive: true,
  },
  {
    id: 'uon-toc-han-quoc',
    slug: 'uon-toc-han-quoc',
    name: 'Uốn tóc phong cách Hàn Quốc',
    description: 'Kỹ thuật uốn xoăn nhẹ nhàng',
    category: 'Uốn & Nhuộm',
    durationMinutes: { min: 90, max: 120 },
    bookingDurationMinutes: 120,
    priceVnd: 600000,
    imageUrl: '',
    isActive: false,
  },
]

describe('OwnerServicesRoute access control', () => {
  it('yêu cầu đăng nhập khi chưa có phiên', () => {
    const html = renderRoute(null)
    expect(html).toContain('Quản lý dịch vụ &amp; hình ảnh')
    expect(html).toContain('Vui lòng đăng nhập bằng tài khoản chủ tiệm')
    expect(html).toContain('Đăng nhập ngay')
  })

  it.each([
    { roles: ['customer'], status: 'active' },
    { roles: ['stylist'], status: 'active' },
    { roles: ['customer', 'stylist'], status: 'active' },
  ])('chặn truy cập khi vai trò không phải chủ tiệm (roles: %j)', (account) => {
    const html = renderRoute(account)
    expect(html).toContain('Không có quyền truy cập')
    expect(html).toContain('chỉ dành cho tài khoản có vai trò chủ tiệm')
    expect(html).toContain('Về trang chủ')
  })

  it('cho phép tài khoản chủ tiệm (owner) truy cập', () => {
    const html = renderRoute({ id: 'acc-owner', roles: ['owner'], status: 'active' })
    expect(html).toContain('Danh mục dịch vụ &amp; hình ảnh')
    expect(html).toContain('Thêm dịch vụ mới')
    expect(html).toContain('Tổng dịch vụ')
  })
})

describe('ServiceTable component', () => {
  it('hiển thị đầy đủ thông tin danh sách dịch vụ trên desktop và mobile', () => {
    const html = renderToStaticMarkup(
      <ServiceTable
        services={mockServices}
        onEdit={vi.fn()}
        onToggleActive={vi.fn()}
      />,
    )

    // Dịch vụ 1
    expect(html).toContain('Cắt tóc nam tiêu chuẩn')
    expect(html).toContain('120.000đ')
    expect(html).toContain('30–45 phút')
    expect(html).toContain('Cắt &amp; Tạo kiểu')
    expect(html).toContain('Hiển thị')

    // Dịch vụ 2 (đang ẩn)
    expect(html).toContain('Uốn tóc phong cách Hàn Quốc')
    expect(html).toContain('600.000đ')
    expect(html).toContain('90–120 phút')
    expect(html).toContain('Uốn &amp; Nhuộm')
    expect(html).toContain('Đã ẩn')

    // Nút sửa và công tắc
    expect(html).toContain('Sửa')
    expect(html).toContain('role="switch"')
  })

  it('hiển thị trạng thái rỗng khi không có dịch vụ nào', () => {
    const html = renderToStaticMarkup(
      <ServiceTable services={[]} onEdit={vi.fn()} onToggleActive={vi.fn()} />,
    )
    expect(html).toContain('Không có dịch vụ nào phù hợp')
    expect(html).toContain('Thử thay đổi bộ lọc tìm kiếm')
  })
})

describe('ServiceFormModal component', () => {
  it('render modal form thêm mới khi service là rỗng', () => {
    const html = renderToStaticMarkup(
      <ServiceFormModal
        isOpen={true}
        service={{}}
        categories={['Cắt tóc', 'Gội đầu']}
        onClose={vi.fn()}
        onSave={vi.fn()}
        apiBaseUrl="http://localhost:4000"
        token="token"
      />,
    )
    expect(html).toContain('Tạo dịch vụ mới')
    expect(html).toContain('Tên dịch vụ')
    expect(html).toContain('Mã định danh (ID)')
    expect(html).toContain('Giá dịch vụ (VNĐ)')
    expect(html).toContain('Cấu hình thời lượng thực hiện')
    expect(html).toContain('Hiển thị cho khách hàng')
  })

  it('render modal form chỉnh sửa khi service có sẵn ID', () => {
    const html = renderToStaticMarkup(
      <ServiceFormModal
        isOpen={true}
        service={mockServices[0]}
        categories={['Cắt & Tạo kiểu']}
        onClose={vi.fn()}
        onSave={vi.fn()}
        apiBaseUrl="http://localhost:4000"
        token="token"
      />,
    )
    expect(html).toContain('Sửa dịch vụ: Cắt tóc nam tiêu chuẩn')
    expect(html).toContain('cat-toc-nam')
    expect(html).toContain('Cập nhật dịch vụ')
  })

  it('không render gì khi isOpen = false', () => {
    const html = renderToStaticMarkup(
      <ServiceFormModal
        isOpen={false}
        service={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
        apiBaseUrl="http://localhost:4000"
        token="token"
      />,
    )
    expect(html).toBe('')
  })
})

describe('format-service utility helpers', () => {
  it('formatPrice định dạng đúng tiền tệ VNĐ', () => {
    expect(formatPrice(0)).toBe('Miễn phí')
    expect(formatPrice(150000)).toBe('150.000đ')
    expect(formatPrice(null)).toBe('0đ')
  })

  it('formatDuration định dạng số hoặc dải min/max', () => {
    expect(formatDuration({ min: 30, max: 30 })).toBe('30 phút')
    expect(formatDuration({ min: 30, max: 45 })).toBe('30–45 phút')
    expect(formatDuration(60)).toBe('60 phút')
    expect(formatDuration(null)).toBe('—')
  })

  it('slugify chuyển tiếng Việt có dấu thành slug an toàn chuẩn SEO', () => {
    expect(slugify('Cắt tóc & Tạo kiểu')).toBe('cat-toc-tao-kieu')
    expect(slugify('Gội đầu dưỡng sinh đỗ quyên')).toBe('goi-dau-duong-sinh-do-quyen')
    expect(slugify('')).toBe('')
  })
})
