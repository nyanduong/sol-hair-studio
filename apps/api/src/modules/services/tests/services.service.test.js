import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import * as servicesRepo from '../services.repository.js'
import {
  generateSlug,
  createService,
  updateService,
  uploadOrRegisterImage,
} from '../services.service.js'

describe('services.service', () => {
  const ownerIdentity = { id: 'owner-123', roles: ['owner'] }
  const customerIdentity = { id: 'customer-123', roles: ['customer'] }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('generateSlug', () => {
    it('chuyển đổi chuỗi tiếng Việt có dấu thành slug không dấu dạng kebab-case', () => {
      expect(generateSlug('Cắt & Tạo Kiểu Tóc Đẹp')).toBe('cat-tao-kieu-toc-dep')
      expect(generateSlug('Nhuộm Thời Trang Cao Cấp')).toBe('nhuom-thoi-trang-cao-cap')
    })
  })

  describe('createService', () => {
    const validPayload = {
      id: 'service-perm',
      name: 'Uốn tóc chuyên nghiệp',
      description: 'Uốn phom sóng nước nhẹ nhàng.',
      category: 'Uốn',
      durationMinutes: { min: 60, max: 120 },
      bookingDurationMinutes: 90,
      priceVnd: 800_000,
      imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/services/perm',
    }

    it('từ chối khi người gọi không phải chủ tiệm (owner)', async () => {
      await expect(createService(customerIdentity, validPayload)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
      })
    })

    it('từ chối khi trùng mã dịch vụ (id)', async () => {
      servicesRepo.findServiceById.mockResolvedValueOnce({ id: 'service-perm' })

      await expect(createService(ownerIdentity, validPayload)).rejects.toMatchObject({
        code: 'DUPLICATE_SERVICE_ID',
        status: 409,
      })
    })

    it('từ chối khi trùng slug dịch vụ', async () => {
      servicesRepo.findServiceById.mockResolvedValueOnce(null)
      servicesRepo.findServiceBySlug.mockResolvedValueOnce({ slug: 'uon-toc-chuyen-nghiep' })

      await expect(createService(ownerIdentity, validPayload)).rejects.toMatchObject({
        code: 'DUPLICATE_SERVICE_SLUG',
        status: 409,
      })
    })

    it('từ chối khi bookingDurationMinutes nằm ngoài khoảng min-max', async () => {
      servicesRepo.findServiceById.mockResolvedValueOnce(null)
      servicesRepo.findServiceBySlug.mockResolvedValueOnce(null)

      const badDuration = { ...validPayload, bookingDurationMinutes: 150 }
      await expect(createService(ownerIdentity, badDuration)).rejects.toMatchObject({
        code: 'INVALID_BOOKING_DURATION',
        status: 400,
      })
    })

    it('tạo dịch vụ thành công khi dữ liệu hợp lệ', async () => {
      servicesRepo.findServiceById.mockResolvedValueOnce(null)
      servicesRepo.findServiceBySlug.mockResolvedValueOnce(null)
      servicesRepo.createService.mockImplementationOnce((data) => Promise.resolve({ ...data, _id: 'new-id' }))

      const result = await createService(ownerIdentity, validPayload)
      expect(result).toMatchObject({
        id: 'service-perm',
        slug: 'uon-toc-chuyen-nghiep',
        priceVnd: 800_000,
      })
      expect(servicesRepo.createService).toHaveBeenCalledOnce()
    })
  })

  describe('updateService', () => {
    it('từ chối cập nhật khi dịch vụ không tồn tại', async () => {
      servicesRepo.findServiceById.mockResolvedValueOnce(null)

      await expect(
        updateService(ownerIdentity, 'non-existent', { name: 'New Name' }),
      ).rejects.toMatchObject({
        code: 'SERVICE_NOT_FOUND',
        status: 404,
      })
    })

    it('từ chối khi bookingDurationMinutes cập nhật không khớp durationMinutes', async () => {
      servicesRepo.findServiceById.mockResolvedValueOnce({
        id: 'service-cut',
        durationMinutes: { min: 30, max: 60 },
        bookingDurationMinutes: 45,
      })

      await expect(
        updateService(ownerIdentity, 'service-cut', {
          bookingDurationMinutes: 75,
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_BOOKING_DURATION',
        status: 400,
      })
    })

    it('cập nhật thành công các trường hợp lệ', async () => {
      servicesRepo.findServiceById.mockResolvedValueOnce({
        id: 'service-cut',
        durationMinutes: { min: 30, max: 60 },
        bookingDurationMinutes: 45,
      })
      servicesRepo.updateService.mockResolvedValueOnce({
        id: 'service-cut',
        name: 'Tên mới',
        priceVnd: 500_000,
      })

      const updated = await updateService(ownerIdentity, 'service-cut', {
        name: 'Tên mới',
        priceVnd: 500_000,
      })

      expect(updated.name).toBe('Tên mới')
      expect(updated.priceVnd).toBe(500_000)
    })
  })

  describe('uploadOrRegisterImage', () => {
    const validImageMeta = {
      cloudName: 'sol-hair',
      cloudinaryAssetId: 'asset-abc',
      publicId: 'sol-hair-studio/services/cut-v2',
      url: 'https://res.cloudinary.com/sol-hair/image/upload/v1/cut-v2.jpg',
      originalName: 'cut-v2.jpg',
      width: 1200,
      height: 900,
      bytes: 200000,
      format: 'jpg',
    }

    it('từ chối nếu không phải chủ tiệm', async () => {
      await expect(uploadOrRegisterImage(customerIdentity, validImageMeta)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        status: 403,
      })
    })

    it('từ chối ảnh nếu URL không phải từ Cloudinary', async () => {
      await expect(
        uploadOrRegisterImage(ownerIdentity, {
          ...validImageMeta,
          url: 'https://other-domain.com/photo.jpg',
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_IMAGE_URL',
        status: 400,
      })
    })

    it('lưu metadata ảnh thành công', async () => {
      servicesRepo.findImageByPublicId.mockResolvedValueOnce(null)
      servicesRepo.createImage.mockImplementationOnce((data) => Promise.resolve({ ...data, _id: 'img-1' }))

      const result = await uploadOrRegisterImage(ownerIdentity, validImageMeta)
      expect(result).toMatchObject({
        publicId: 'sol-hair-studio/services/cut-v2',
        uploadedByAccountId: 'owner-123',
      })
    })
  })
})
