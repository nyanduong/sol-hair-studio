import mongoose from 'mongoose'
import { describe, expect, it } from 'vitest'
import { ServiceModel } from '../services.model.js'
import { ImageModel } from '../images.model.js'

const validService = {
  id: 'service-cut-style',
  slug: 'cat-va-tao-kieu',
  name: 'Cắt & tạo kiểu',
  description: 'Tạo phom tóc phù hợp với gương mặt và phong cách riêng của bạn.',
  category: 'Tạo kiểu',
  durationMinutes: { min: 45, max: 60 },
  bookingDurationMinutes: 60,
  priceVnd: 450_000,
  imageUrl:
    'https://res.cloudinary.com/sol-hair/image/upload/services/cut-style',
}

describe('serviceSchema', () => {
  it('chấp nhận dịch vụ có URL ảnh Cloudinary và bookingDurationMinutes hợp lệ', async () => {
    await expect(new ServiceModel(validService).validate()).resolves.toBeUndefined()
  })

  it('chấp nhận dịch vụ có coverImageId và mảng images', async () => {
    const serviceWithImages = new ServiceModel({
      ...validService,
      coverImageId: new mongoose.Types.ObjectId(),
      images: [
        { imageId: new mongoose.Types.ObjectId(), alt: 'Chi tiết kiểu tóc' },
      ],
    })
    await expect(serviceWithImages.validate()).resolves.toBeUndefined()
  })

  it('từ chối dịch vụ thiếu URL Cloudinary', async () => {
    const service = new ServiceModel({
      ...validService,
      imageUrl: '/legacy-local-image.png',
    })

    await expect(service.validate()).rejects.toHaveProperty('errors.imageUrl')
  })

  it('từ chối bookingDurationMinutes nằm ngoài khoảng min - max', async () => {
    const service = new ServiceModel({
      ...validService,
      durationMinutes: { min: 45, max: 60 },
      bookingDurationMinutes: 30,
    })

    await expect(service.validate()).rejects.toHaveProperty('errors.bookingDurationMinutes')
  })

  it('hỗ trợ validator bookingDurationMinutes trong ngữ cảnh update query', () => {
    const validator = ServiceModel.schema.path('bookingDurationMinutes').validators[0].validator
    const queryContext = {
      getUpdate() {
        return { $set: { durationMinutes: { min: 30, max: 60 } } }
      },
    }
    expect(validator.call(queryContext, 45)).toBe(true)
    expect(validator.call(queryContext, 75)).toBe(false)
    expect(validator.call(queryContext, undefined)).toBe(true)

    const partialContext = {
      getUpdate() {
        return { $set: { imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' } }
      },
    }
    expect(validator.call(partialContext, 45)).toBe(true)
  })
})

describe('imageSchema', () => {
  const validImage = {
    cloudName: 'sol-hair',
    cloudinaryAssetId: 'asset-12345',
    publicId: 'sol-hair-studio/services/cut',
    url: 'https://res.cloudinary.com/sol-hair/image/upload/v1234/cut.jpg',
    originalName: 'cut.jpg',
    width: 800,
    height: 600,
    bytes: 150000,
    format: 'jpg',
  }

  it('chấp nhận metadata ảnh Cloudinary hợp lệ', async () => {
    await expect(new ImageModel(validImage).validate()).resolves.toBeUndefined()
  })

  it('từ chối ảnh có url không phải https://res.cloudinary.com/', async () => {
    const invalidUrl = new ImageModel({
      ...validImage,
      url: 'https://malicious-site.com/image.jpg',
    })
    await expect(invalidUrl.validate()).rejects.toHaveProperty('errors.url')
  })

  it('từ chối ảnh có định dạng không được phép', async () => {
    const invalidFormat = new ImageModel({
      ...validImage,
      format: 'gif',
    })
    await expect(invalidFormat.validate()).rejects.toHaveProperty('errors.format')
  })

  it('từ chối ảnh vượt quá kích thước hoặc dung lượng cho phép', async () => {
    const invalidSize = new ImageModel({
      ...validImage,
      bytes: 15_000_000,
    })
    await expect(invalidSize.validate()).rejects.toHaveProperty('errors.bytes')
  })
})
