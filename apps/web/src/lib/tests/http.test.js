import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeBaseUrl, requestJson } from '../http.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('normalizeBaseUrl', () => {
  it('xóa khoảng trắng và dấu gạch chéo ở cuối URL', () => {
    expect(normalizeBaseUrl(' http://localhost:4000/// ')).toBe(
      'http://localhost:4000',
    )
  })
})

describe('requestJson', () => {
  it('báo lỗi khi HTTP response không thành công', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    await expect(
      requestJson('/api/example', { baseUrl: 'http://localhost:4000' }),
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
      baseUrl: 'http://localhost:4000',
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
      requestJson('/api/example', { baseUrl: 'http://localhost:4000' }),
    ).resolves.toEqual({ ok: true })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gửi POST request với JSON body và parse lỗi từ API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'error', code: 'INVALID_CREDENTIALS', message: 'Email hoặc mật khẩu không đúng.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      requestJson('/api/auth/login', {
        baseUrl: 'http://localhost:4000',
        method: 'POST',
        body: { email: 'user@test.com', password: 'password123' },
      }),
    ).rejects.toThrow('Email hoặc mật khẩu không đúng.')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@test.com', password: 'password123' }),
      }),
    )
  })
})
