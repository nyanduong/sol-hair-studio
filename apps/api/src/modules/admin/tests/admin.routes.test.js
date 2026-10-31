import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config/database.js', () => ({
  getDatabaseStatus: vi.fn(),
}))

vi.mock('../../services/services.repository.js', () => ({
  findActiveServices: vi.fn(),
  findAllServices: vi.fn(),
  findServiceById: vi.fn(),
  findServiceBySlug: vi.fn(),
  createService: vi.fn(),
  updateService: vi.fn(),
  findImageById: vi.fn(),
  findImageByPublicId: vi.fn(),
  createImage: vi.fn(),
}))

vi.mock('../../auth/auth.service.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    authenticate: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  }
})

vi.mock('../admin.service.js', () => ({
  getDashboardData: vi.fn(),
  getSalonTodayDate: vi.fn(),
}))

import { getDatabaseStatus } from '../../../config/database.js'
import * as servicesRepo from '../../services/services.repository.js'
import { authenticate, login, logout } from '../../auth/auth.service.js'
import * as adminService from '../admin.service.js'
import { app } from '../../../app.js'

describe('Admin EJS Portal Routes', () => {
  const ownerIdentity = { accountId: '000000000000000000000101', email: 'owner@solhair.vn', roles: ['owner'] }

  beforeEach(() => {
    vi.resetAllMocks()
    getDatabaseStatus.mockReturnValue('connected')
  })

  describe('GET /admin', () => {
    it('chuyển hướng sang /admin/dashboard', async () => {
      const response = await request(app).get('/admin').expect(302)
      expect(response.headers.location).toBe('/admin/dashboard')
    })
  })

  describe('GET /admin/dashboard', () => {
    it('chưa đăng nhập thì chuyển hướng sang /admin/login', async () => {
      const response = await request(app).get('/admin/dashboard').expect(302)
      expect(response.headers.location).toBe('/admin/login')
    })

    it('đã đăng nhập với owner thì render thành công giao diện dashboard', async () => {
      authenticate.mockResolvedValue(ownerIdentity)
      adminService.getDashboardData.mockResolvedValue({
        todayStr: '2026-10-31',
        todayStats: {
          total: 2,
          completed: 1,
          confirmed: 1,
          inProgress: 0,
          cancelled: 0,
          revenueVnd: 450_000,
        },
        todayAppointments: [
          {
            _id: '507f1f77bcf86cd799439011',
            startAt: new Date('2026-10-31T09:00:00.000+07:00'),
            endAt: new Date('2026-10-31T10:00:00.000+07:00'),
            totalDurationMinutes: 60,
            customerSnapshot: { displayName: 'Trương Khang', phone: '+84901234567' },
            items: [{ name: 'Cắt & tạo kiểu', priceVnd: 450_000 }],
            staffNameSnapshot: 'Nguyễn Văn Stylist',
            totalPriceVnd: 450_000,
            status: 'completed',
          },
        ],
        totalRevenueVnd: 15_850_000,
        totalAppointments: 10,
        statusMap: {
          confirmed: 3,
          in_progress: 1,
          completed: 5,
          cancelled: 1,
          no_show: 0,
        },
        topServices: [
          { _id: 'Cắt & tạo kiểu', count: 12, totalRevenue: 5_400_000 },
          { _id: 'Nhuộm thời trang', count: 8, totalRevenue: 9_600_000 },
        ],
        activeServicesCount: 6,
        totalServicesCount: 8,
        activeStaffCount: 4,
      })

      const response = await request(app)
        .get('/admin/dashboard')
        .set('Cookie', ['sol_admin_token=mock-owner-token'])
        .expect(200)

      expect(response.headers['content-type']).toMatch(/text\/html/)
      expect(response.text).toContain('Tổng quan Hoạt động Salon')
      expect(response.text).toContain('Hàng đợi lịch hẹn hôm nay')
      expect(response.text).toContain('Trương Khang')
      expect(response.text).toContain('Cắt &amp; tạo kiểu')
      expect(response.text).toContain('Top Dịch vụ đặt nhiều nhất')
      expect(response.text).toContain('Phân bổ trạng thái lịch hẹn')
    })

    it('alias /owner/dashboard cũng hoạt động và render dashboard', async () => {
      authenticate.mockResolvedValue(ownerIdentity)
      adminService.getDashboardData.mockResolvedValue({
        todayStr: '2026-10-31',
        todayStats: { total: 0, completed: 0, confirmed: 0, inProgress: 0, cancelled: 0, revenueVnd: 0 },
        todayAppointments: [],
        totalRevenueVnd: 0,
        totalAppointments: 0,
        statusMap: { confirmed: 0, in_progress: 0, completed: 0, cancelled: 0, no_show: 0 },
        topServices: [],
        activeServicesCount: 0,
        totalServicesCount: 0,
        activeStaffCount: 0,
      })

      const response = await request(app)
        .get('/owner/dashboard')
        .set('Cookie', ['sol_admin_token=mock-owner-token'])
        .expect(200)

      expect(response.headers['content-type']).toMatch(/text\/html/)
      expect(response.text).toContain('Hôm nay chưa có lịch hẹn nào')
    })
  })

  describe('GET /admin/login', () => {
    it('trả về trang HTML đăng nhập quản trị', async () => {
      const response = await request(app).get('/admin/login').expect(200)
      expect(response.headers['content-type']).toMatch(/text\/html/)
      expect(response.text).toContain('Quản trị Chủ tiệm')
      expect(response.text).toContain('action="/admin/login"')
    })

    it('nếu đã có cookie hợp lệ của owner thì chuyển thẳng sang /admin/services', async () => {
      authenticate.mockResolvedValue(ownerIdentity)

      const response = await request(app)
        .get('/admin/login')
        .set('Cookie', ['sol_admin_token=mock-valid-jwt'])
        .expect(302)

      expect(response.headers.location).toBe('/admin/services')
    })
  })

  describe('POST /admin/login', () => {
    it('báo lỗi nếu không nhập đủ email hoặc password', async () => {
      const response = await request(app)
        .post('/admin/login')
        .send('email=owner@solhair.vn&password=')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .expect(200)

      expect(response.text).toContain('Vui lòng nhập đầy đủ email và mật khẩu.')
    })

    it('đăng nhập thành công với vai trò owner thì set cookie và redirect sang /admin/services', async () => {
      login.mockResolvedValue({
        token: 'owner-session-token-123',
        account: {
          id: '000000000000000000000101',
          email: 'owner@solhair.vn',
          roles: ['owner'],
        },
      })

      const response = await request(app)
        .post('/admin/login')
        .send('email=owner@solhair.vn&password=test_password_fixture')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .expect(302)

      expect(response.headers.location).toBe('/admin/services')
      expect(response.headers['set-cookie']).toBeDefined()
      expect(response.headers['set-cookie'][0]).toContain('sol_admin_token=owner-session-token-123')
    })

    it('từ chối đăng nhập nếu tài khoản không có quyền owner', async () => {
      login.mockResolvedValue({
        token: 'customer-token-123',
        account: {
          id: '000000000000000000000102',
          email: 'customer@solhair.vn',
          roles: ['customer'],
        },
      })

      const response = await request(app)
        .post('/admin/login')
        .send('email=customer@solhair.vn&password=test_password_fixture')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .expect(200)

      expect(response.text).toContain('không có quyền Quản trị viên')
    })
  })

  describe('GET /admin/services', () => {
    it('chưa đăng nhập thì chuyển hướng sang /admin/login', async () => {
      const response = await request(app).get('/admin/services').expect(302)
      expect(response.headers.location).toBe('/admin/login')
    })

    it('truy cập với query ?token=... từ React Web thì tự động set cookie và redirect sang URL sạch', async () => {
      authenticate.mockResolvedValue(ownerIdentity)

      const response = await request(app)
        .get('/admin/services?token=sso-token-valid')
        .expect(302)

      expect(response.headers.location).toBe('/admin/services')
      expect(response.headers['set-cookie']).toBeDefined()
      expect(response.headers['set-cookie'][0]).toContain('sol_admin_token=sso-token-valid')
    })

    it('đã đăng nhập với owner thì render danh sách dịch vụ và thống kê KPI', async () => {
      authenticate.mockResolvedValue(ownerIdentity)
      servicesRepo.findAllServices.mockResolvedValue([
        {
          id: 'service-cut-style',
          slug: 'cat-va-tao-kieu',
          name: 'Cắt & tạo kiểu',
          category: 'Tạo kiểu',
          durationMinutes: { min: 45, max: 60 },
          bookingDurationMinutes: 60,
          priceVnd: 450_000,
          imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          isActive: true,
          displayOrder: 1,
        },
        {
          id: 'service-hidden',
          slug: 'dich-vu-tam-an',
          name: 'Dịch vụ tạm ẩn',
          category: 'Chăm sóc',
          durationMinutes: { min: 30, max: 30 },
          bookingDurationMinutes: 30,
          priceVnd: 200_000,
          imageUrl: 'https://res.cloudinary.com/demo/image/upload/hidden.jpg',
          isActive: false,
          displayOrder: 2,
        },
      ])

      const response = await request(app)
        .get('/admin/services')
        .set('Cookie', ['sol_admin_token=mock-owner-token'])
        .expect(200)

      expect(response.headers['content-type']).toMatch(/text\/html/)
      expect(response.text).toContain('Quản lý Dịch vụ Salon')
      expect(response.text).toContain('Cắt &amp; tạo kiểu')
      expect(response.text).toContain('Dịch vụ tạm ẩn')
      expect(response.text).toContain('450.000')
    })
  })

  describe('POST /admin/services (Create service)', () => {
    it('thêm dịch vụ mới thành công và chuyển hướng về danh sách', async () => {
      authenticate.mockResolvedValue(ownerIdentity)
      servicesRepo.findServiceById.mockResolvedValue(null)
      servicesRepo.createService.mockResolvedValue({
        id: 'service-uon-toc',
        name: 'Uốn tóc cao cấp',
      })

      const response = await request(app)
        .post('/admin/services')
        .set('Cookie', ['sol_admin_token=mock-owner-token'])
        .send(
          'id=service-uon-toc&name=Uốn tóc cao cấp&category=Tạo kiểu&priceVnd=800000&durationMin=60&durationMax=90&bookingDurationMinutes=90&imageUrl=https://res.cloudinary.com/demo/image/upload/uon.jpg&isActive=true',
        )
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .expect(302)

      expect(response.headers.location).toBe('/admin/services?success=created')
      expect(servicesRepo.createService).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'service-uon-toc',
          name: 'Uốn tóc cao cấp',
          category: 'Tạo kiểu',
          priceVnd: 800_000,
          durationMinutes: { min: 60, max: 90 },
          bookingDurationMinutes: 90,
          isActive: true,
        }),
      )
    })
  })

  describe('POST /admin/services/:id/update (Update service)', () => {
    it('cập nhật dịch vụ thành công và chuyển hướng về danh sách', async () => {
      authenticate.mockResolvedValue(ownerIdentity)
      servicesRepo.findServiceById.mockResolvedValue({
        id: 'service-uon-toc',
        durationMinutes: { min: 60, max: 90 },
      })
      servicesRepo.updateService.mockResolvedValue({
        id: 'service-uon-toc',
        name: 'Uốn tóc phục hồi Collagen',
      })

      const response = await request(app)
        .post('/admin/services/service-uon-toc/update')
        .set('Cookie', ['sol_admin_token=mock-owner-token'])
        .send(
          'name=Uốn tóc phục hồi Collagen&category=Tạo kiểu&priceVnd=950000&durationMin=60&durationMax=90',
        )
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .expect(302)

      expect(response.headers.location).toBe('/admin/services?success=updated')
      expect(servicesRepo.updateService).toHaveBeenCalledWith(
        'service-uon-toc',
        expect.objectContaining({
          name: 'Uốn tóc phục hồi Collagen',
          priceVnd: 950_000,
        }),
      )
    })
  })

  describe('POST /admin/services/:id/toggle (Toggle service active status)', () => {
    it('bật tắt trạng thái dịch vụ và redirect về danh sách', async () => {
      authenticate.mockResolvedValue(ownerIdentity)
      servicesRepo.findServiceById.mockResolvedValue({
        id: 'service-cut-style',
        durationMinutes: { min: 45, max: 60 },
        isActive: true,
      })
      servicesRepo.updateService.mockResolvedValue({
        id: 'service-cut-style',
        isActive: false,
      })

      const response = await request(app)
        .post('/admin/services/service-cut-style/toggle')
        .set('Cookie', ['sol_admin_token=mock-owner-token'])
        .send('isActive=false')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .expect(302)

      expect(response.headers.location).toBe('/admin/services?success=toggled')
      expect(servicesRepo.updateService).toHaveBeenCalledWith(
        'service-cut-style',
        expect.objectContaining({
          isActive: false,
        }),
      )
    })
  })

  describe('POST /admin/logout', () => {
    it('xóa cookie và redirect về /admin/login', async () => {
      authenticate.mockResolvedValue(ownerIdentity)
      logout.mockResolvedValue(true)

      const response = await request(app)
        .post('/admin/logout')
        .set('Cookie', ['sol_admin_token=mock-owner-token'])
        .expect(302)

      expect(response.headers.location).toBe('/admin/login')
      expect(response.headers['set-cookie']).toBeDefined()
    })
  })
})
