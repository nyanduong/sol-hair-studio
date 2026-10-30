import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createService,
  fetchManageServices,
  getServiceActionErrorMessage,
  updateService,
  uploadServiceImage,
} from '../api/services.api.js'

const baseUrl = 'http://10.0.2.2:4000/'
const mockToken = 'mock-owner-token'

const sampleService = {
  id: 'service-nail-art',
  slug: 'service-nail-art',
  name: 'Làm móng nghệ thuật',
  description: 'Chăm sóc móng',
  category: 'Chăm sóc móng',
  durationMinutes: { min: 30, max: 60 },
  bookingDurationMinutes: 60,
  priceVnd: 180000,
  imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  isActive: true,
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { data } : data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Mobile Owner Services API', () => {
  it('fetchManageServices gọi đúng /api/services/manage kèm Bearer token của chủ tiệm', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([sampleService]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchManageServices(baseUrl, mockToken)
    expect(result).toEqual([sampleService])

    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.0.2.2:4000/api/services/manage',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )

    const callHeaders = fetchMock.mock.calls[0][1].headers
    expect(callHeaders.get('Authorization')).toBe(`Bearer ${mockToken}`)
  })

  it('createService gửi request POST với payload dịch vụ mới và Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleService, 201))
    vi.stubGlobal('fetch', fetchMock)

    const payload = {
      id: 'service-nail-art',
      name: 'Làm móng nghệ thuật',
      category: 'Chăm sóc móng',
      priceVnd: 180000,
      durationMinutes: { min: 30, max: 60 },
      bookingDurationMinutes: 60,
      description: 'Chăm sóc móng',
      isActive: true,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    }

    const result = await createService(baseUrl, mockToken, payload)
    expect(result).toEqual(sampleService)

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://10.0.2.2:4000/api/services')
    expect(options.method).toBe('POST')
    expect(options.headers.get('Authorization')).toBe(`Bearer ${mockToken}`)
    expect(JSON.parse(options.body)).toEqual(payload)
  })

  it('updateService gửi request PATCH vào /api/services/:id với dữ liệu cập nhật', async () => {
    const updated = { ...sampleService, isActive: false }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(updated))
    vi.stubGlobal('fetch', fetchMock)

    const result = await updateService(baseUrl, mockToken, 'service-nail-art', {
      isActive: false,
    })
    expect(result.isActive).toBe(false)

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://10.0.2.2:4000/api/services/service-nail-art')
    expect(options.method).toBe('PATCH')
    expect(options.headers.get('Authorization')).toBe(`Bearer ${mockToken}`)
    expect(JSON.parse(options.body)).toEqual({ isActive: false })
  })

  it('uploadServiceImage gửi request POST tới /api/services/images', async () => {
    const uploadResult = { id: 'img-123', secureUrl: 'https://res.cloudinary.com/demo/image.jpg' }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(uploadResult, 201))
    vi.stubGlobal('fetch', fetchMock)

    const payload = { dataUrl: 'data:image/jpeg;base64,abc', originalName: 'nails.jpg' }
    const result = await uploadServiceImage(baseUrl, mockToken, payload)
    expect(result).toEqual(uploadResult)

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://10.0.2.2:4000/api/services/images')
    expect(options.method).toBe('POST')
  })

  it('getServiceActionErrorMessage dịch đúng các mã lỗi nghiệp vụ sang thông báo tiếng Việt', () => {
    expect(getServiceActionErrorMessage({ code: 'DUPLICATE_SERVICE_ID' })).toContain(
      'Mã dịch vụ này đã tồn tại',
    )
    expect(getServiceActionErrorMessage({ code: 'DUPLICATE_SERVICE_SLUG' })).toContain(
      'Tên hoặc slug dịch vụ này đã tồn tại',
    )
    expect(getServiceActionErrorMessage({ code: 'INVALID_DURATION' })).toContain(
      'Thời lượng min/max không hợp lệ',
    )
    expect(getServiceActionErrorMessage({ code: 'INVALID_BOOKING_DURATION' })).toContain(
      'Thời lượng đặt lịch phải nằm trong khoảng',
    )
    expect(getServiceActionErrorMessage({ code: 'MISSING_IMAGE' })).toContain(
      'Vui lòng cung cấp URL ảnh hợp lệ',
    )
    expect(getServiceActionErrorMessage({ message: 'Lỗi máy chủ nội bộ' })).toBe(
      'Lỗi máy chủ nội bộ',
    )
    expect(getServiceActionErrorMessage({})).toBe('Thao tác không thành công. Vui lòng thử lại.')
  })
})

