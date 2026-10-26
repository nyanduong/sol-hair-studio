import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config/database.js', () => ({
  getDatabaseStatus: vi.fn(),
}))

vi.mock('../services.repository.js', () => ({
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
  }
})

import { getDatabaseStatus } from '../../../config/database.js'
import * as servicesRepo from '../services.repository.js'
import { authenticate, AuthError } from '../../auth/auth.service.js'
import { app } from '../../../app.js'

describe('Services API', () => {
  const ownerIdentity = { id: '000000000000000000000101', roles: ['owner'] }
  const customerIdentity = { id: '000000000000000000000102', roles: ['customer'] }

  beforeEach(() => {
    vi.resetAllMocks()
    getDatabaseStatus.mockReturnValue('connected')
  })

  describe('GET /api/services (Public catalog)', () => {
    it('trả danh mục dịch vụ và URL ảnh theo hợp đồng dùng chung', async () => {
      servicesRepo.findActiveServices.mockResolvedValue([
        {
          id: 'service-cut-style',
          slug: 'cat-va-tao-kieu',
          name: 'Cắt & tạo kiểu',
          description: 'Tạo phom tóc phù hợp với gương mặt và phong cách riêng của bạn.',
          category: 'Tạo kiểu',
          durationMinutes: { min: 45, max: 60 },
          priceVnd: 450_000,
          imageUrl:
            'https://res.cloudinary.com/sol-hair/image/upload/f_auto,q_auto/services/cut-style',
        },
      ])

      const response = await request(app).get('/api/services').expect(200)

      expect(response.body.data).toEqual([
        {
          id: 'service-cut-style',
          slug: 'cat-va-tao-kieu',
          name: 'Cắt & tạo kiểu',
          description: 'Tạo phom tóc phù hợp với gương mặt và phong cách riêng của bạn.',
          category: 'Tạo kiểu',
          durationMinutes: { min: 45, max: 60 },
          imageUrl:
            'https://res.cloudinary.com/sol-hair/image/upload/f_auto,q_auto/services/cut-style',
          priceVnd: 450_000,
        },
      ])
      expect(servicesRepo.findActiveServices).toHaveBeenCalledOnce()
    })

    it('trả 503 khi MongoDB chưa được cấu hình hoặc chưa kết nối', async () => {
      getDatabaseStatus.mockReturnValue('not-configured')

      const response = await request(app).get('/api/services').expect(503)

      expect(response.body).toEqual({
        status: 'error',
        code: 'DATABASE_UNAVAILABLE',
        message: 'Danh mục dịch vụ tạm thời chưa khả dụng.',
      })
      expect(servicesRepo.findActiveServices).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/services/manage (Owner)', () => {
    it('chặn truy cập khi thiếu token đăng nhập (401)', async () => {
      authenticate.mockImplementationOnce(() => {
        throw new AuthError('Cần đăng nhập.', { code: 'UNAUTHORIZED', status: 401 })
      })

      const res = await request(app).get('/api/services/manage').expect(401)
      expect(res.body.code).toBe('UNAUTHORIZED')
    })

    it('chặn truy cập khi không có role owner (403)', async () => {
      authenticate.mockResolvedValueOnce(customerIdentity)

      const res = await request(app)
        .get('/api/services/manage')
        .set('Authorization', 'Bearer valid-customer-token')
        .expect(403)

      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('trả toàn bộ danh sách dịch vụ cho chủ tiệm', async () => {
      authenticate.mockResolvedValueOnce(ownerIdentity)
      servicesRepo.findAllServices.mockResolvedValueOnce([
        {
          id: 'service-cut',
          name: 'Cắt tóc',
          isActive: true,
          bookingDurationMinutes: 45,
        },
        {
          id: 'service-hidden',
          name: 'Dịch vụ tạm ẩn',
          isActive: false,
          bookingDurationMinutes: 60,
        },
      ])

      const res = await request(app)
        .get('/api/services/manage')
        .set('Authorization', 'Bearer valid-owner-token')
        .expect(200)

      expect(res.body.status).toBe('success')
      expect(res.body.data).toHaveLength(2)
      expect(res.body.data[1].isActive).toBe(false)
    })
  })

  describe('GET /api/services/:id', () => {
    it('trả chi tiết dịch vụ khi tồn tại', async () => {
      servicesRepo.findServiceById.mockResolvedValueOnce({
        id: 'service-cut-style',
        name: 'Cắt & tạo kiểu',
        priceVnd: 450_000,
      })

      const res = await request(app).get('/api/services/service-cut-style').expect(200)
      expect(res.body.status).toBe('success')
      expect(res.body.data.name).toBe('Cắt & tạo kiểu')
    })

    it('trả 404 khi dịch vụ không tồn tại', async () => {
      servicesRepo.findServiceById.mockResolvedValueOnce(null)
      servicesRepo.findServiceBySlug.mockResolvedValueOnce(null)

      const res = await request(app).get('/api/services/unknown').expect(404)
      expect(res.body.code).toBe('SERVICE_NOT_FOUND')
    })
  })

  describe('POST /api/services (Owner create service)', () => {
    const newServicePayload = {
      id: 'service-spa',
      name: 'Gội đầu dưỡng sinh',
      description: 'Chăm sóc và thư giãn da đầu.',
      category: 'Chăm sóc',
      durationMinutes: { min: 30, max: 45 },
      bookingDurationMinutes: 45,
      priceVnd: 250_000,
      imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/services/spa',
      displayOrder: 2,
    }

    it('tạo dịch vụ thành công với mã 201 cho owner', async () => {
      authenticate.mockResolvedValueOnce(ownerIdentity)
      servicesRepo.findServiceById.mockResolvedValueOnce(null)
      servicesRepo.findServiceBySlug.mockResolvedValueOnce(null)
      servicesRepo.createService.mockResolvedValueOnce({
        ...newServicePayload,
        slug: 'goi-dau-duong-sinh',
      })

      const res = await request(app)
        .post('/api/services')
        .set('Authorization', 'Bearer valid-owner-token')
        .send(newServicePayload)
        .expect(201)

      expect(res.body.status).toBe('success')
      expect(res.body.data.id).toBe('service-spa')
    })

    it('từ chối khi trùng mã dịch vụ (409)', async () => {
      authenticate.mockResolvedValueOnce(ownerIdentity)
      servicesRepo.findServiceById.mockResolvedValueOnce({ id: 'service-spa' })

      const res = await request(app)
        .post('/api/services')
        .set('Authorization', 'Bearer valid-owner-token')
        .send(newServicePayload)
        .expect(409)

      expect(res.body.code).toBe('DUPLICATE_SERVICE_ID')
    })
  })

  describe('PATCH /api/services/:id (Owner update service)', () => {
    it('cập nhật dịch vụ thành công', async () => {
      authenticate.mockResolvedValueOnce(ownerIdentity)
      servicesRepo.findServiceById.mockResolvedValueOnce({
        id: 'service-spa',
        durationMinutes: { min: 30, max: 45 },
        bookingDurationMinutes: 45,
      })
      servicesRepo.updateService.mockResolvedValueOnce({
        id: 'service-spa',
        priceVnd: 300_000,
        isActive: false,
      })

      const res = await request(app)
        .patch('/api/services/service-spa')
        .set('Authorization', 'Bearer valid-owner-token')
        .send({ priceVnd: 300_000, isActive: false })
        .expect(200)

      expect(res.body.status).toBe('success')
      expect(res.body.data.priceVnd).toBe(300_000)
    })
  })

  describe('POST /api/services/images (Owner upload/register image)', () => {
    it('chặn khách hàng tải ảnh (403)', async () => {
      authenticate.mockResolvedValueOnce(customerIdentity)

      const res = await request(app)
        .post('/api/services/images')
        .set('Authorization', 'Bearer customer-token')
        .send({ originalName: 'test.jpg' })
        .expect(403)

      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('cho phép owner đăng ký metadata ảnh Cloudinary thành công (201)', async () => {
      authenticate.mockResolvedValueOnce(ownerIdentity)
      servicesRepo.findImageByPublicId.mockResolvedValueOnce(null)
      servicesRepo.createImage.mockResolvedValueOnce({
        _id: 'img-123',
        publicId: 'sol-hair-studio/services/test',
        url: 'https://res.cloudinary.com/sol-hair/image/upload/v1/test.jpg',
        originalName: 'test.jpg',
      })

      const res = await request(app)
        .post('/api/services/images')
        .set('Authorization', 'Bearer owner-token')
        .send({
          cloudName: 'sol-hair',
          cloudinaryAssetId: 'asset-test',
          publicId: 'sol-hair-studio/services/test',
          url: 'https://res.cloudinary.com/sol-hair/image/upload/v1/test.jpg',
          originalName: 'test.jpg',
          width: 1200,
          height: 800,
          bytes: 180000,
          format: 'jpg',
        })
        .expect(201)

      expect(res.body.status).toBe('success')
      expect(res.body.data.publicId).toBe('sol-hair-studio/services/test')
    })
  })
})
