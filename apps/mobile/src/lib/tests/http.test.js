import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeBaseUrl, requestJson } from '../http.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('normalizeBaseUrl', () => {
  it('xóa khoảng trắng và dấu gạch chéo ở cuối URL', () => {
    expect(normalizeBaseUrl(' http://10.0.2.2:4000/// ')).toBe(
      'http://10.0.2.2:4000',
    )
  })
})

describe('requestJson', () => {
  it('báo lỗi khi HTTP response không thành công', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    await expect(
      requestJson('/api/example', { baseUrl: 'http://10.0.2.2:4000' }),
    ).rejects.toThrow('HTTP 503')
  })

  it('chuyển timeout thành lỗi có thể thử lại', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
      ),
    )

    const pending = requestJson('/api/example', {
      baseUrl: 'http://10.0.2.2:4000',
      timeoutMs: 100,
    })
    const assertion = expect(pending).rejects.toThrow('đã hết thời gian chờ')
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })

  it('dọn timer khi request hoàn tất', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })),
    )

    await expect(
      requestJson('/api/example', { baseUrl: 'http://10.0.2.2:4000' }),
    ).resolves.toEqual({ ok: true })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gửi POST request với JSON body và custom headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"data":{"token":"abc"}}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await requestJson('/api/auth/login', {
      baseUrl: 'http://10.0.2.2:4000',
      method: 'POST',
      headers: { Authorization: 'Bearer token-123' },
      body: { email: 'test@example.com', password: 'password123' },
    })

    expect(res).toEqual({ data: { token: 'abc' } })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.0.2.2:4000/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      }),
    )
  })

  it('trích xuất mã lỗi và thông báo chi tiết từ JSON response của API', async () => {
    const errorResponse = new Response(
      JSON.stringify({ code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không chính xác.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse))

    let caught = null
    try {
      await requestJson('/api/auth/login', {
        baseUrl: 'http://10.0.2.2:4000',
        method: 'POST',
        body: { email: 'bad@example.com', password: 'wrong' },
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(Error)
    expect(caught?.message).toBe('Email hoặc mật khẩu không chính xác.')
    expect(caught?.code).toBe('INVALID_CREDENTIALS')
    expect(caught?.status).toBe(401)
  })
})
