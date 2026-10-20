import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activateCustomer,
  getAuthErrorMessage,
  getMe,
  loginUser,
  logoutUser,
  registerCustomer,
  resendActivationOtp,
} from '../api/auth.api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('auth.api', () => {
  const baseUrl = 'http://localhost:4000'

  it('loginUser gọi endpoint POST /api/auth/login và trả dữ liệu', async () => {
    const mockData = {
      token: 'jwt-mock-token',
      tokenType: 'Bearer',
      expiresAt: '2026-10-21T00:00:00.000Z',
      account: {
        accountId: 'acc-123',
        email: 'customer@test.com',
        roles: ['customer'],
        status: 'active',
      },
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: mockData }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await loginUser(baseUrl, {
      email: 'customer@test.com',
      password: 'password123',
    })

    expect(result).toEqual(mockData)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'customer@test.com', password: 'password123' }),
      }),
    )
  })

  it('registerCustomer gọi endpoint POST /api/auth/register', async () => {
    const mockData = {
      accountId: 'acc-456',
      email: 'new@test.com',
      roles: ['customer'],
      status: 'pending_verification',
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: mockData }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await registerCustomer(baseUrl, {
      email: 'new@test.com',
      password: 'password123',
    })

    expect(result).toEqual(mockData)
  })

  it('activateCustomer gọi endpoint POST /api/auth/activate với email và code', async () => {
    const mockData = { success: true, message: 'Tài khoản đã được kích hoạt thành công.' }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: mockData }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await activateCustomer(baseUrl, {
      email: 'new@test.com',
      code: '123456',
    })

    expect(result).toEqual(mockData)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/auth/activate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'new@test.com', code: '123456' }),
      }),
    )
  })

  it('resendActivationOtp gọi endpoint POST /api/auth/resend-activation', async () => {
    const mockData = { message: 'Nếu tài khoản hợp lệ, mã xác minh đã được gửi qua email.' }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: mockData }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await resendActivationOtp(baseUrl, {
      email: 'new@test.com',
    })

    expect(result).toEqual(mockData)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/auth/resend-activation',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'new@test.com' }),
      }),
    )
  })

  it('getMe đính kèm Authorization header Bearer token', async () => {
    const mockData = {
      account: { accountId: 'acc-123', email: 'me@test.com', roles: ['customer'] },
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: mockData }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await getMe(baseUrl, 'my-secret-token')
    expect(result).toEqual(mockData)

    const calledHeaders = fetchMock.mock.calls[0][1].headers
    expect(calledHeaders.get('Authorization')).toBe('Bearer my-secret-token')
  })

  it('logoutUser gửi POST /api/auth/logout kèm Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await logoutUser(baseUrl, 'token-to-invalidate')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })
})

describe('getAuthErrorMessage', () => {
  it('dịch mã lỗi INVALID_CREDENTIALS sang tiếng Việt', () => {
    const err = new Error('Wrong pass')
    err.code = 'INVALID_CREDENTIALS'
    expect(getAuthErrorMessage(err)).toBe('Email hoặc mật khẩu không chính xác.')
  })

  it('dịch mã lỗi ACCOUNT_NOT_ACTIVE', () => {
    const err = new Error('Inactive')
    err.code = 'ACCOUNT_NOT_ACTIVE'
    expect(getAuthErrorMessage(err)).toContain('chưa được kích hoạt')
  })

  it('dịch mã lỗi INVALID_OTP', () => {
    const err = new Error('Wrong OTP')
    err.code = 'INVALID_OTP'
    expect(getAuthErrorMessage(err)).toContain('Mã OTP không chính xác')
  })

  it('dịch mã lỗi CHALLENGE_EXPIRED', () => {
    const err = new Error('Expired')
    err.code = 'CHALLENGE_EXPIRED'
    expect(getAuthErrorMessage(err)).toContain('hết hạn')
  })

  it('dịch mã lỗi RATE_LIMIT_EXCEEDED', () => {
    const err = new Error('Rate limit')
    err.code = 'RATE_LIMIT_EXCEEDED'
    expect(getAuthErrorMessage(err)).toContain('quá nhiều yêu cầu')
  })

  it('xử lý lỗi timeout', () => {
    const err = new Error('Yêu cầu kiểm tra API đã hết thời gian chờ.')
    expect(getAuthErrorMessage(err)).toContain('hết thời gian chờ')
  })
})
