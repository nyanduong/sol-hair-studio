import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { fetchServices, getServicesErrorMessage } from '../api/services.api.js'

const baseUrl = 'http://10.0.2.2:4000/'
const service = {
  id: 'service-cut-style',
  slug: 'cat-tao-kieu',
  name: 'Cắt & tạo kiểu',
  description: 'Tạo kiểu phù hợp với bạn.',
  category: 'Chăm sóc tóc',
  durationMinutes: { min: 45, max: 60 },
  priceVnd: 250000,
  imageUrl: 'https://res.cloudinary.com/demo/image/upload/service.jpg',
}

function jsonResponse(data) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('danh mục mobile qua HTTP helper và request manager', () => {
  it('đọc đúng endpoint trên host mobile, giữ đủ dữ liệu hiển thị từ DTO chung', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([service]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchServices(baseUrl)).resolves.toEqual([service])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.0.2.2:4000/api/services',
      { signal: expect.any(AbortSignal) },
    )
  })

  it('giữ danh sách rỗng để giao diện hiển thị trạng thái chưa có dịch vụ', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    await expect(fetchServices(baseUrl)).resolves.toEqual([])
  })

  it('báo lỗi 503 an toàn và tải được dữ liệu khi thử lại', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":{"message":"internal database details"}}', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse([service]))
    vi.stubGlobal('fetch', fetchMock)
    const manager = createLatestRequest()

    const failed = await manager.run((signal) => fetchServices(baseUrl, { signal }))
    expect(failed.kind).toBe('error')
    expect(failed.error.message).toBe('API trả về HTTP 503.')
    expect(getServicesErrorMessage(failed.error)).toBe(
      'Không thể tải danh mục dịch vụ. Vui lòng kiểm tra kết nối và thử lại.',
    )
    await expect(manager.run((signal) => fetchServices(baseUrl, { signal })))
      .resolves.toEqual({ kind: 'success', value: [service] })
  })

  it('hủy fetch và bỏ qua dữ liệu đến sau khi rời màn hình', async () => {
    let finishRequest
    let fetchSignal
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => {
      fetchSignal = signal
      return new Promise((resolve) => { finishRequest = resolve })
    }))
    const manager = createLatestRequest()
    const pending = manager.run((signal) => fetchServices(baseUrl, { signal }))

    manager.cancel()
    expect(fetchSignal.aborted).toBe(true)
    finishRequest(jsonResponse([service]))
    await expect(pending).resolves.toEqual({ kind: 'ignored' })
  })

  it('hết timeout hữu hạn thì báo lỗi có thể thử lại thay vì giữ trạng thái tải', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'))
      })
    })))
    const manager = createLatestRequest()
    const pending = manager.run((signal) => fetchServices(baseUrl, { signal }))

    await vi.advanceTimersByTimeAsync(8000)
    const result = await pending
    expect(result.kind).toBe('error')
    expect(getServicesErrorMessage(result.error)).toBe('Tải dịch vụ quá lâu. Vui lòng thử lại.')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('không cho response cũ ghi đè danh mục mới dù fetch hoàn thành sau khi abort', async () => {
    const requests = []
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((resolve) => {
      requests.push({ resolve, signal })
    })))
    const manager = createLatestRequest()
    const first = manager.run((signal) => fetchServices(baseUrl, { signal }))
    const latest = manager.run((signal) => fetchServices(baseUrl, { signal }))

    expect(requests[0].signal.aborted).toBe(true)
    requests[1].resolve(jsonResponse([service]))
    await expect(latest).resolves.toEqual({ kind: 'success', value: [service] })
    requests[0].resolve(jsonResponse([]))
    await expect(first).resolves.toEqual({ kind: 'ignored' })
  })
})
