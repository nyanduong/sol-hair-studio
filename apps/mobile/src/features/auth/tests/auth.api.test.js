import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activateCustomer,
  completePassword,
  getAuthErrorMessage,
  getMe,
  loginUser,
  logoutUser,
  registerCustomer,
  requestOtp,
  resendActivationOtp,
  updateMyProfile,
  verifyOtp,
} from '../api/auth.api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

const baseUrl = 'http://10.0.2.2:4000'

describe('auth.api (mobile)', () => {
  it('loginUser gọi POST /api/auth/login và trả về data', async () => {
    const mockData = { token: 'jwt-123', account: { email: 'user@sol.test', roles: ['customer'] } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: mockData }), { status: 200 })))

    const data = await loginUser(baseUrl, { email: 'user@sol.test', password: 'password123' })
    expect(data).toEqual(mockData)
  })

  it('registerCustomer gọi POST /api/auth/register', async () => {
    const mockData = { email: 'new@sol.test', status: 'pending_verification' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: mockData }), { status: 201 })))

    const data = await registerCustomer(baseUrl, { email: 'new@sol.test', password: 'password123' })
    expect(data).toEqual(mockData)
  })

  it('activateCustomer gọi POST /api/auth/activate', async () => {
    const mockData = { success: true, message: 'Tài khoản đã được kích hoạt thành công.' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: mockData }), { status: 200 })))

    const data = await activateCustomer(baseUrl, { email: 'user@sol.test', code: '123456' })
    expect(data.success).toBe(true)
  })

  it('resendActivationOtp gọi POST /api/auth/resend-activation', async () => {
    const mockData = { message: 'Đã gửi lại mã OTP.' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: mockData }), { status: 200 })))

    const data = await resendActivationOtp(baseUrl, { email: 'user@sol.test' })
    expect(data.message).toBe('Đã gửi lại mã OTP.')
  })

  it('requestOtp và verifyOtp cho stylist/reset_password', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: { grant: 'proof-token-123' } }), { status: 200 }))))

    const reqData = await requestOtp(baseUrl, { email: 'staff@sol.test', purpose: 'activate_staff' })
    expect(reqData.grant).toBe('proof-token-123')

    const verData = await verifyOtp(baseUrl, { email: 'staff@sol.test', purpose: 'activate_staff', code: '654321' })
    expect(verData.grant).toBe('proof-token-123')
  })

  it('completePassword cho stylist hoặc reset mật khẩu', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { message: 'Thành công.' } }), { status: 200 })))

    const res = await completePassword(baseUrl, {
      email: 'staff@sol.test',
      purpose: 'activate_staff',
      grant: 'proof-token-123',
      password: 'NewStaffPassword123!',
    })
    expect(res.message).toBe('Thành công.')
  })

  it('getMe gọi GET /api/auth/me với Bearer token', async () => {
    const mockProfile = { accountId: 'acc-1', email: 'me@sol.test', roles: ['customer'] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: mockProfile }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const profile = await getMe(baseUrl, 'my-token')
    expect(profile).toEqual(mockProfile)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.0.2.2:4000/api/auth/me',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    )
  })

  it('updateMyProfile gọi PATCH /api/auth/me để cập nhật hồ sơ khách', async () => {
    const mockUpdated = { accountId: 'acc-1', email: 'me@sol.test', customer: { displayName: 'Nguyễn Văn A', phone: '+84901234567' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: mockUpdated }), { status: 200 })))

    const result = await updateMyProfile(baseUrl, 'my-token', { displayName: 'Nguyễn Văn A', phone: '+84901234567' })
    expect(result.customer.displayName).toBe('Nguyễn Văn A')
  })

  it('logoutUser gọi POST /api/auth/logout và xử lý nuốt lỗi nếu mạng ngắt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    await expect(logoutUser(baseUrl, 'token-123')).resolves.toBeUndefined()
  })

  it('getAuthErrorMessage ánh xạ các mã lỗi sang tiếng Việt thân thiện', () => {
    const errCreds = new Error('invalid')
    errCreds.code = 'INVALID_CREDENTIALS'
    expect(getAuthErrorMessage(errCreds)).toContain('Email hoặc mật khẩu không chính xác.')

    const errOtp = new Error('bad otp')
    errOtp.code = 'INVALID_OTP'
    expect(getAuthErrorMessage(errOtp)).toContain('Mã OTP không chính xác.')

    const errActive = new Error('not active')
    errActive.code = 'ACCOUNT_NOT_ACTIVE'
    expect(getAuthErrorMessage(errActive)).toContain('chưa được kích hoạt')
  })
})
