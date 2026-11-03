import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createService,
  fetchManageServices,
  fetchServices,
  getServiceActionErrorMessage,
  getServicesErrorMessage,
  updateService,
  uploadServiceImage,
} from '../api/services.api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchServices', () => {
  it('giữ danh sách rỗng và cho phép phục hồi sau lỗi 503', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('{"data":[]}', { status: 200 }))
    vi.stubGlobal('fetch', mock)
    await expect(fetchServices('http://localhost:4000')).rejects.toThrow('HTTP 503')
    await expect(fetchServices('http://localhost:4000')).resolves.toEqual([])
  })

  it('đưa ra thông báo dịch vụ an toàn cho lỗi mạng và timeout', () => {
    expect(getServicesErrorMessage(new Error('Yêu cầu kiểm tra API đã hết thời gian chờ.')))
      .toBe('Tải dịch vụ quá lâu. Vui lòng thử lại.')
    expect(getServicesErrorMessage(new Error('Internal network details')))
      .toBe('Không thể tải danh mục dịch vụ. Vui lòng kiểm tra kết nối và thử lại.')
  })

  it('gọi endpoint danh mục dịch vụ và trả danh sách', async () => {
    const services = [{ id: 'service-cut-style', name: 'Cắt & tạo kiểu' }]
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: services }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchServices('http://localhost:4000/')).resolves.toEqual(
      services,
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/services',
      { signal: expect.any(AbortSignal) },
    )
  })
})

describe('Owner service management API', () => {
  const token = 'mock-owner-token'
  const baseUrl = 'http://localhost:4000'

  it('fetchManageServices gửi Authorization header và lấy data', async () => {
    const services = [{ id: 'srv-1', name: 'Uốn tóc', isActive: false }]
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: services }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchManageServices(baseUrl, token)
    expect(result).toEqual(services)
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/api/services/manage`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )
  })

  it('createService gửi POST kèm payload và token', async () => {
    const payload = { id: 'srv-new', name: 'Nhuộm tóc' }
    const created = { ...payload, isActive: true }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: created }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await createService(baseUrl, token, payload)
    expect(result).toEqual(created)
    const callArgs = fetchMock.mock.calls[0]
    expect(callArgs[0]).toBe(`${baseUrl}/api/services`)
    expect(callArgs[1].method).toBe('POST')
    expect(JSON.parse(callArgs[1].body)).toEqual(payload)
  })

  it('updateService gửi PATCH đến endpoint dịch vụ cụ thể', async () => {
    const updates = { isActive: false }
    const updated = { id: 'srv-1', isActive: false }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: updated }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await updateService(baseUrl, token, 'srv-1', updates)
    expect(result).toEqual(updated)
    const callArgs = fetchMock.mock.calls[0]
    expect(callArgs[0]).toBe(`${baseUrl}/api/services/srv-1`)
    expect(callArgs[1].method).toBe('PATCH')
  })

  it('uploadServiceImage gửi POST /api/services/images', async () => {
    const imgPayload = { dataUrl: 'data:image/png;base64,...', originalName: 'cut.png' }
    const imgResponse = { id: 'img-1', url: 'https://res.cloudinary.com/test/cut.png' }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: imgResponse }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await uploadServiceImage(baseUrl, token, imgPayload)
    expect(result).toEqual(imgResponse)
    const callArgs = fetchMock.mock.calls[0]
    expect(callArgs[0]).toBe(`${baseUrl}/api/services/images`)
    expect(callArgs[1].method).toBe('POST')
  })

  it('getServiceActionErrorMessage map chính xác các mã lỗi nghiệp vụ', () => {
    expect(getServiceActionErrorMessage({ code: 'DUPLICATE_SERVICE_ID' }))
      .toBe('Mã dịch vụ này đã tồn tại, vui lòng chọn mã khác.')
    expect(getServiceActionErrorMessage({ code: 'DUPLICATE_SERVICE_SLUG' }))
      .toBe('Tên hoặc slug dịch vụ này đã tồn tại.')
    expect(getServiceActionErrorMessage({ code: 'SERVICE_NOT_FOUND' }))
      .toBe('Không tìm thấy dịch vụ cần cập nhật.')
    expect(getServiceActionErrorMessage({ code: 'INVALID_DURATION' }))
      .toBe('Thời lượng min/max không hợp lệ (1 - 480 phút và min <= max).')
    expect(getServiceActionErrorMessage({ code: 'INVALID_BOOKING_DURATION' }))
      .toBe('Thời lượng đặt lịch phải nằm trong khoảng thời lượng min - max.')
    expect(getServiceActionErrorMessage({ code: 'MISSING_IMAGE' }))
      .toBe('Vui lòng tải ảnh lên hoặc cung cấp URL ảnh hợp lệ.')
    expect(getServiceActionErrorMessage({ message: 'Lỗi tùy biến' }))
      .toBe('Lỗi tùy biến')
  })
})
