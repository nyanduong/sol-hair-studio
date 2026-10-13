import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchServices, getServicesErrorMessage } from '../api/services.api.js'

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
