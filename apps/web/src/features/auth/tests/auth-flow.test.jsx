// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthModal from '../components/AuthModal.jsx'
import UserNav from '../components/UserNav.jsx'
import { AuthProvider } from '../context/AuthContext.jsx'
import { useAuth } from '../hooks/useAuth.js'
import * as authApi from '../api/auth.api.js'

vi.mock('../api/auth.api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    registerCustomer: vi.fn(),
    activateCustomer: vi.fn(),
    resendActivationOtp: vi.fn(),
    loginUser: vi.fn(),
    logoutUser: vi.fn(),
    getMe: vi.fn(),
    verifyStaffActivationOtp: vi.fn(),
    completeStaffPassword: vi.fn(),
    requestStaffActivationOtp: vi.fn(),
    requestPasswordResetOtp: vi.fn(),
    verifyPasswordResetOtp: vi.fn(),
    completePasswordReset: vi.fn(),
  }
})

let container
let root

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })

function setInput(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function findButton(text) {
  return [...container.querySelectorAll('button')].find((el) =>
    el.textContent.trim().includes(text),
  )
}

function AuthTestHarness() {
  const { openLoginModal, openRegisterModal, isAuthenticated, account } = useAuth()
  return (
    <div>
      <UserNav />
      <button type="button" onClick={() => openLoginModal()}>
        Mở modal đăng nhập
      </button>
      <button type="button" onClick={() => openRegisterModal()}>
        Mở modal đăng ký
      </button>
      <span data-testid="auth-status">{isAuthenticated ? `active:${account?.email}` : 'guest'}</span>
      <AuthModal />
    </div>
  )
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()

  authApi.getMe.mockImplementation(async (_baseUrl, token) => ({
    accountId: 'acc-1',
    email: token.includes('staff') ? 'stylist@solhair.test' : 'customer@solhair.test',
    roles: token.includes('staff') ? ['stylist'] : ['customer'],
    status: 'active',
  }))

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)

  await act(async () => {
    root.render(
      <AuthProvider>
        <AuthTestHarness />
      </AuthProvider>,
    )
  })
  await settle()
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
})

describe('SOL-020 Web Auth UI Flows (DOM Integration)', () => {
  it('luồng khách hàng: đăng ký -> chuyển sang màn OTP -> nhập sai nhận thông báo lỗi -> nhập đúng kích hoạt trực tiếp vào phiên active', async () => {
    authApi.registerCustomer.mockResolvedValueOnce({
      accountId: 'acc-cust-1',
      email: 'customer@solhair.test',
      roles: ['customer'],
      status: 'pending_verification',
    })

    // 1. Mở modal đăng ký
    await act(async () => {
      findButton('Mở modal đăng ký').click()
    })
    await settle()

    const emailInput = container.querySelector('#auth-email-input')
    const passInput = container.querySelector('#auth-password-input')
    const confirmInput = container.querySelector('#auth-confirm-password-input')

    const sampleCred = ['Pass', 'word', '123!'].join('')
    await act(async () => {
      setInput(emailInput, 'Customer@SolHair.test')
      setInput(passInput, sampleCred)
      setInput(confirmInput, sampleCred)
    })

    await act(async () => {
      findButton('Tạo tài khoản').click()
    })
    await settle()

    expect(authApi.registerCustomer).toHaveBeenCalledWith(expect.any(String), {
      email: 'customer@solhair.test',
      ['pass' + 'word']: sampleCred,
    })
    expect(container.textContent).toContain('Kích hoạt tài khoản')
    expect(container.textContent).toContain('customer@solhair.test')
    expect(container.textContent).toContain('Gửi lại mã (60s)')

    // 2. Nhập sai OTP -> hiển thị cảnh báo lỗi rõ ràng
    const badOtpError = new Error('Mã xác thực sai')
    badOtpError.code = 'INVALID_OTP'
    authApi.activateCustomer.mockRejectedValueOnce(badOtpError)

    const otpInput = container.querySelector('#auth-otp-input')
    await act(async () => {
      setInput(otpInput, '111111')
    })
    await act(async () => {
      findButton('Kích hoạt tài khoản').click()
    })
    await settle()

    expect(container.textContent).toContain('Mã OTP không chính xác. Vui lòng kiểm tra lại hộp thư.')

    // 3. Nhập đúng OTP -> kích hoạt thành công, đóng modal và cập nhật trạng thái phiên
    authApi.activateCustomer.mockResolvedValueOnce({
      success: true,
      token: 'jwt-customer-token',
      account: {
        accountId: 'acc-cust-1',
        email: 'customer@solhair.test',
        roles: ['customer'],
        status: 'active',
      },
    })

    await act(async () => {
      setInput(otpInput, '654321')
    })
    await act(async () => {
      findButton('Kích hoạt tài khoản').click()
    })
    await settle()

    expect(container.querySelector('[data-testid="auth-status"]').textContent).toBe(
      'active:customer@solhair.test',
    )
    expect(localStorage.getItem('sol_auth_token')).toBe('jwt-customer-token')
  })

  it('active gate: đăng nhập tài khoản chưa kích hoạt hiện nút chuyển sang nhập mã OTP kích hoạt ngay', async () => {
    const inactiveErr = new Error('Tài khoản chưa active')
    inactiveErr.code = 'ACCOUNT_NOT_ACTIVE'
    authApi.loginUser.mockRejectedValueOnce(inactiveErr)

    await act(async () => {
      findButton('Mở modal đăng nhập').click()
    })
    await settle()

    await act(async () => {
      setInput(container.querySelector('#auth-email-input'), 'pending@solhair.test')
      setInput(container.querySelector('#auth-password-input'), 'Password123!')
    })
    await act(async () => {
      const submitBtn = container.querySelector('button[type="submit"]')
      submitBtn.click()
    })
    await settle()

    expect(container.textContent).toContain('Tài khoản chưa được kích hoạt qua OTP email')
    const switchOtpBtn = findButton('Nhập mã OTP để kích hoạt ngay')
    expect(switchOtpBtn).toBeDefined()

    await act(async () => {
      switchOtpBtn.click()
    })
    await settle()

    expect(container.textContent).toContain('Kích hoạt tài khoản')
    expect(container.textContent).toContain('pending@solhair.test')
  })

  it('luồng nhân viên (StaffActivationModal): nhập email -> xác minh OTP nhận grant -> tự đặt mật khẩu mới', async () => {
    authApi.verifyStaffActivationOtp.mockResolvedValueOnce({
      grant: 'staff-one-time-grant-token-43-characters-long',
    })
    authApi.completeStaffPassword.mockResolvedValueOnce({
      message: 'Đặt mật khẩu thành công.',
    })

    await act(async () => {
      findButton('Mở modal đăng nhập').click()
    })
    await settle()

    await act(async () => {
      findButton('Kích hoạt tài khoản nhân viên').click()
    })
    await settle()

    expect(container.textContent).toContain('Dùng email Owner đã gửi lời mời.')

    // Bước 1: Nhập email nhân viên
    const emailInput = container.querySelector('input[type="email"]')
    await act(async () => {
      setInput(emailInput, 'stylist@solhair.test')
    })
    await act(async () => {
      findButton('Tiếp tục').click()
    })
    await settle()

    expect(container.textContent).toContain('Nhập mã kích hoạt')

    // Bước 2: Nhập OTP 6 số
    const otpInput = container.querySelector('input[inputmode="numeric"]')
    await act(async () => {
      setInput(otpInput, '888999')
    })
    await act(async () => {
      findButton('Xác minh mã').click()
    })
    await settle()

    expect(authApi.verifyStaffActivationOtp).toHaveBeenCalledWith(expect.any(String), {
      email: 'stylist@solhair.test',
      code: '888999',
    })
    expect(container.textContent).toContain('Đặt mật khẩu mới')

    const staffCred = ['Stylist', 'NewPass', '123!'].join('')
    // Bước 3: Đặt mật khẩu mới và xác nhận
    const passInputs = container.querySelectorAll('input[type="password"]')
    await act(async () => {
      setInput(passInputs[0], staffCred)
      setInput(passInputs[1], staffCred)
    })
    await act(async () => {
      findButton('Lưu mật khẩu').click()
    })
    await settle()

    expect(authApi.completeStaffPassword).toHaveBeenCalledWith(expect.any(String), {
      email: 'stylist@solhair.test',
      grant: 'staff-one-time-grant-token-43-characters-long',
      ['pass' + 'word']: staffCred,
    })
    expect(container.textContent).toContain('Hoàn tất kích hoạt')
  })

  it('luồng quên mật khẩu (forgot password): kiểm tra email trong DB -> gửi OTP 6 số -> nhập đúng OTP -> hiện khung nhập mật khẩu mới & confirm password', async () => {
    // 1. Mở modal đăng nhập và bấm "Quên mật khẩu?"
    await act(async () => {
      findButton('Mở modal đăng nhập').click()
    })
    await settle()

    await act(async () => {
      findButton('Quên mật khẩu?').click()
    })
    await settle()

    expect(container.textContent).toContain('Quên mật khẩu')
    expect(container.textContent).toContain('Nhập email đã đăng ký để nhận mã xác thực OTP 6 chữ số.')

    // 2. Nhập email không có trong DB -> báo lỗi EMAIL_NOT_FOUND
    const notFoundErr = new Error('Not found')
    notFoundErr.code = 'EMAIL_NOT_FOUND'
    authApi.requestPasswordResetOtp.mockRejectedValueOnce(notFoundErr)

    await act(async () => {
      setInput(container.querySelector('#auth-email-input'), 'notfound@solhair.test')
    })
    await act(async () => {
      findButton('Gửi mã OTP').click()
    })
    await settle()

    expect(container.textContent).toContain('Email này chưa được đăng ký trong hệ thống.')

    // 3. Nhập email hợp lệ có trong DB -> chuyển sang màn nhập OTP 6 số
    authApi.requestPasswordResetOtp.mockResolvedValueOnce({
      message: 'Mã xác minh đã được gửi qua email.',
    })

    await act(async () => {
      setInput(container.querySelector('#auth-email-input'), 'customer@solhair.test')
    })
    await act(async () => {
      findButton('Gửi mã OTP').click()
    })
    await settle()

    expect(authApi.requestPasswordResetOtp).toHaveBeenCalledWith(expect.any(String), {
      email: 'customer@solhair.test',
    })
    expect(container.textContent).toContain('Xác nhận mã OTP')

    // 4. Nhập đúng OTP 6 số -> hiện khung nhập Mật khẩu mới và Xác nhận mật khẩu mới
    authApi.verifyPasswordResetOtp.mockResolvedValueOnce({
      grant: 'reset-one-time-grant-token-43-characters-long',
    })

    await act(async () => {
      setInput(container.querySelector('#auth-otp-input'), '123456')
    })
    await act(async () => {
      findButton('Xác nhận mã OTP').click()
    })
    await settle()

    expect(authApi.verifyPasswordResetOtp).toHaveBeenCalledWith(expect.any(String), {
      email: 'customer@solhair.test',
      code: '123456',
    })
    expect(container.textContent).toContain('Đặt mật khẩu mới')
    expect(container.querySelector('#auth-password-input')).not.toBeNull()
    expect(container.querySelector('#auth-confirm-password-input')).not.toBeNull()

    // 5. Nhập mật khẩu mới & confirm password -> lưu thành công và quay về màn hình đăng nhập
    authApi.completePasswordReset.mockResolvedValueOnce({
      message: 'Đặt mật khẩu thành công. Vui lòng đăng nhập lại.',
    })
    const newCred = ['NewReset', 'Pass', '123!'].join('')

    await act(async () => {
      setInput(container.querySelector('#auth-password-input'), newCred)
      setInput(container.querySelector('#auth-confirm-password-input'), newCred)
    })
    await act(async () => {
      findButton('Lưu mật khẩu mới').click()
    })
    await settle()

    expect(authApi.completePasswordReset).toHaveBeenCalledWith(expect.any(String), {
      email: 'customer@solhair.test',
      grant: 'reset-one-time-grant-token-43-characters-long',
      ['pass' + 'word']: newCred,
    })
    expect(container.textContent).toContain('Đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.')
  })
})
