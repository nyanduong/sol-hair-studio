import * as servicesRepo from './services.repository.js'
import { config } from '../../config/env.js'
import { uploadImagePayload } from '../../config/cloudinary.js'

export class ServiceError extends Error {
  constructor(message, { code = 'BAD_REQUEST', status = 400, details } = {}) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.status = status
    if (details) this.details = details
  }
}

function fail(code, message, status = 400, details = undefined) {
  throw new ServiceError(message, { code, status, details })
}

function ensureOwner(identity) {
  if (!identity || !identity.roles || !identity.roles.includes('owner')) {
    fail('FORBIDDEN', 'Chỉ chủ tiệm mới có quyền thực hiện thao tác này.', 403)
  }
}

export function generateSlug(text) {
  if (!text || typeof text !== 'string') return ''
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function validateServicePayload(input, isUpdate = false) {
  const result = {}

  if (!isUpdate || input.id !== undefined) {
    if (typeof input.id !== 'string' || !/^[a-z0-9-]+$/.test(input.id.trim()) || input.id.trim().length > 80) {
      fail('INVALID_ID', 'ID dịch vụ phải là chuỗi chữ thường, số, dấu gạch ngang và không quá 80 ký tự.')
    }
    result.id = input.id.trim()
  }

  if (!isUpdate || input.slug !== undefined) {
    const slug = (input.slug || generateSlug(input.name || '')).trim()
    if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug) || slug.length > 120) {
      fail('INVALID_SLUG', 'Slug dịch vụ không hợp lệ hoặc vượt quá 120 ký tự.')
    }
    result.slug = slug
  }

  if (!isUpdate || input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120) {
      fail('INVALID_NAME', 'Tên dịch vụ bắt buộc và không quá 120 ký tự.')
    }
    result.name = input.name.trim()
  }

  if (!isUpdate || input.description !== undefined) {
    if (typeof input.description !== 'string' || input.description.trim().length > 2000) {
      fail('INVALID_DESCRIPTION', 'Mô tả dịch vụ không được vượt quá 2000 ký tự.')
    }
    result.description = input.description.trim()
  }

  if (!isUpdate || input.category !== undefined) {
    if (typeof input.category !== 'string' || !input.category.trim() || input.category.trim().length > 80) {
      fail('INVALID_CATEGORY', 'Danh mục dịch vụ bắt buộc và không quá 80 ký tự.')
    }
    result.category = input.category.trim()
  }

  if (!isUpdate || input.durationMinutes !== undefined) {
    const dur = input.durationMinutes
    if (
      !dur ||
      typeof dur !== 'object' ||
      !Number.isInteger(dur.min) ||
      !Number.isInteger(dur.max) ||
      dur.min < 1 ||
      dur.max < 1 ||
      dur.min > dur.max ||
      dur.max > 480
    ) {
      fail('INVALID_DURATION', 'Thời lượng hiển thị min/max phải là số nguyên từ 1 đến 480 và min <= max.')
    }
    result.durationMinutes = { min: dur.min, max: dur.max }
  }

  if (input.bookingDurationMinutes !== undefined) {
    const bookingDur = Number(input.bookingDurationMinutes)
    if (!Number.isInteger(bookingDur) || bookingDur < 1 || bookingDur > 480) {
      fail('INVALID_BOOKING_DURATION', 'Thời lượng đặt lịch phải là số nguyên từ 1 đến 480 phút.')
    }
    result.bookingDurationMinutes = bookingDur
  }

  if (!isUpdate || input.priceVnd !== undefined) {
    const price = Number(input.priceVnd)
    if (!Number.isInteger(price) || price < 0 || price > 100_000_000) {
      fail('INVALID_PRICE', 'Giá dịch vụ phải là số nguyên từ 0 đến 100.000.000 VNĐ.')
    }
    result.priceVnd = price
  }

  if (input.imageUrl !== undefined) {
    if (typeof input.imageUrl !== 'string' || !/^https:\/\/res\.cloudinary\.com\//.test(input.imageUrl.trim())) {
      fail('INVALID_IMAGE_URL', 'URL ảnh phải bắt đầu bằng https://res.cloudinary.com/')
    }
    result.imageUrl = input.imageUrl.trim()
  }

  if (input.coverImageId !== undefined) {
    result.coverImageId = input.coverImageId || null
  }

  if (input.images !== undefined) {
    if (!Array.isArray(input.images) || input.images.length > 10) {
      fail('INVALID_IMAGES', 'Mảng hình ảnh không được vượt quá 10 ảnh.')
    }
    result.images = input.images.map((item) => {
      if (!item || !item.imageId) fail('INVALID_IMAGES', 'Mỗi ảnh trong gallery phải có imageId.')
      return {
        imageId: item.imageId,
        alt: typeof item.alt === 'string' ? item.alt.trim().slice(0, 200) : undefined,
      }
    })
  }

  if (input.isActive !== undefined) {
    result.isActive = Boolean(input.isActive)
  }

  if (input.displayOrder !== undefined) {
    const order = Number(input.displayOrder)
    if (!Number.isInteger(order) || order < 0) {
      fail('INVALID_DISPLAY_ORDER', 'displayOrder phải là số nguyên không âm.')
    }
    result.displayOrder = order
  }

  return result
}

export async function listPublicServices() {
  return await servicesRepo.findActiveServices()
}

export async function listManageServices(identity) {
  ensureOwner(identity)
  return await servicesRepo.findAllServices()
}

export async function getServiceDetail(id) {
  const service = (await servicesRepo.findServiceById(id)) || (await servicesRepo.findServiceBySlug(id))
  if (!service) {
    fail('SERVICE_NOT_FOUND', `Không tìm thấy dịch vụ với mã hoặc slug: ${id}`, 404)
  }
  return service
}

export async function createService(identity, input) {
  ensureOwner(identity)
  const data = validateServicePayload(input, false)

  const existingId = await servicesRepo.findServiceById(data.id)
  if (existingId) {
    fail('DUPLICATE_SERVICE_ID', `Mã dịch vụ '${data.id}' đã tồn tại.`, 409)
  }

  const existingSlug = await servicesRepo.findServiceBySlug(data.slug)
  if (existingSlug) {
    fail('DUPLICATE_SERVICE_SLUG', `Slug dịch vụ '${data.slug}' đã tồn tại.`, 409)
  }

  if (data.bookingDurationMinutes !== undefined) {
    if (data.bookingDurationMinutes < data.durationMinutes.min || data.bookingDurationMinutes > data.durationMinutes.max) {
      fail('INVALID_BOOKING_DURATION', 'bookingDurationMinutes phải nằm trong khoảng thời lượng min - max.')
    }
  }

  if (data.coverImageId) {
    const coverImage = await servicesRepo.findImageById(data.coverImageId)
    if (!coverImage) {
      fail('IMAGE_NOT_FOUND', 'Ảnh coverImageId không tồn tại trong hệ thống.', 404)
    }
    if (!data.imageUrl) {
      data.imageUrl = coverImage.url
    }
  }

  if (!data.imageUrl) {
    fail('MISSING_IMAGE', 'Cần cung cấp imageUrl hoặc coverImageId hợp lệ cho dịch vụ.')
  }

  return await servicesRepo.createService(data)
}

export async function updateService(identity, id, input) {
  ensureOwner(identity)
  const existing = await servicesRepo.findServiceById(id)
  if (!existing) {
    fail('SERVICE_NOT_FOUND', `Không tìm thấy dịch vụ có mã '${id}'.`, 404)
  }

  const updates = validateServicePayload(input, true)

  const currentMin = updates.durationMinutes?.min ?? existing.durationMinutes.min
  const currentMax = updates.durationMinutes?.max ?? existing.durationMinutes.max
  const bookingDuration = updates.bookingDurationMinutes ?? existing.bookingDurationMinutes

  if (bookingDuration !== undefined) {
    if (bookingDuration < currentMin || bookingDuration > currentMax) {
      fail('INVALID_BOOKING_DURATION', 'bookingDurationMinutes phải nằm trong khoảng thời lượng min - max.')
    }
  }

  if (updates.coverImageId) {
    const coverImage = await servicesRepo.findImageById(updates.coverImageId)
    if (!coverImage) {
      fail('IMAGE_NOT_FOUND', 'Ảnh coverImageId không tồn tại trong hệ thống.', 404)
    }
    if (!updates.imageUrl) {
      updates.imageUrl = coverImage.url
    }
  }

  return await servicesRepo.updateService(id, updates)
}

export async function uploadOrRegisterImage(identity, input) {
  ensureOwner(identity)

  // Cách 1: Tải lên trực tiếp từ payload base64 / dataUrl qua Cloudinary SDK
  if (input.dataUrl || input.payload) {
    const rawPayload = input.dataUrl || input.payload
    const uploadRes = await uploadImagePayload(rawPayload, {
      originalName: input.originalName || 'service-image.jpg',
    })

    return await servicesRepo.createImage({
      ...uploadRes,
      uploadedByAccountId: identity.id,
      isActive: true,
    })
  }

  // Cách 2: Đăng ký metadata ảnh đã tải lên Cloudinary từ client/widget
  const {
    cloudName = config.cloudinaryCloudName,
    cloudinaryAssetId,
    publicId,
    url,
    originalName,
    width,
    height,
    bytes,
    format,
  } = input

  if (!cloudName || typeof cloudName !== 'string') {
    fail('INVALID_CLOUD_NAME', 'Tên Cloudinary cloudName không hợp lệ.')
  }
  if (!cloudinaryAssetId || typeof cloudinaryAssetId !== 'string') {
    fail('INVALID_ASSET_ID', 'cloudinaryAssetId bắt buộc phải có.')
  }
  if (!publicId || typeof publicId !== 'string') {
    fail('INVALID_PUBLIC_ID', 'publicId bắt buộc phải có.')
  }
  if (!url || !/^https:\/\/res\.cloudinary\.com\//.test(url)) {
    fail('INVALID_IMAGE_URL', 'URL ảnh phải là link HTTPS từ res.cloudinary.com.')
  }
  if (!originalName || typeof originalName !== 'string') {
    fail('INVALID_ORIGINAL_NAME', 'originalName bắt buộc phải có.')
  }

  const numWidth = Number(width)
  const numHeight = Number(height)
  const numBytes = Number(bytes)

  if (!Number.isInteger(numWidth) || numWidth < 1 || numWidth > 20000) {
    fail('INVALID_DIMENSIONS', 'Chiều rộng ảnh phải là số nguyên từ 1 đến 20000.')
  }
  if (!Number.isInteger(numHeight) || numHeight < 1 || numHeight > 20000) {
    fail('INVALID_DIMENSIONS', 'Chiều cao ảnh phải là số nguyên từ 1 đến 20000.')
  }
  if (!Number.isInteger(numBytes) || numBytes < 1 || numBytes > 10485760) {
    fail('INVALID_BYTES', 'Dung lượng ảnh phải từ 1 byte đến 10MB (10485760 bytes).')
  }

  const normalizedFormat = (format || 'jpg').toLowerCase()
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(normalizedFormat)) {
    fail('INVALID_FORMAT', 'Định dạng ảnh chỉ chấp nhận: jpg, jpeg, png, webp.')
  }

  const existingAsset = await servicesRepo.findImageByPublicId(cloudName, publicId)
  if (existingAsset) {
    return existingAsset
  }

  return await servicesRepo.createImage({
    cloudName,
    cloudinaryAssetId,
    publicId,
    url,
    originalName: originalName.trim(),
    width: numWidth,
    height: numHeight,
    bytes: numBytes,
    format: normalizedFormat,
    isActive: true,
    uploadedByAccountId: identity.id,
  })
}
