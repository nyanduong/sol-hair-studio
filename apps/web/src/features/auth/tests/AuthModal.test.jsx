import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AuthModal from '../components/AuthModal.jsx'
import UserNav from '../components/UserNav.jsx'
import { AuthContext } from '../context/auth-context.js'

function renderWithAuth(ui, authValue) {
  return renderToStaticMarkup(
    <AuthContext.Provider value={authValue}>
      {ui}
    </AuthContext.Provider>,
  )
}

describe('AuthModal Component', () => {
  it('không render gì khi isModalOpen là false', () => {
    const markup = renderWithAuth(<AuthModal />, {
      isModalOpen: false,
      modalMode: 'login',
      promptNotice: '',
      closeModal: () => {},
      setModalMode: () => {},
      login: async () => {},
      register: async () => {},
    })
    expect(markup).toBe('')
  })

  it('render modal đăng nhập khi isModalOpen là true', () => {
    const markup = renderWithAuth(<AuthModal />, {
      isModalOpen: true,
      modalMode: 'login',
      promptNotice: 'Vui lòng đăng nhập tài khoản để tiếp tục đặt lịch hẹn tại Sol Hair Studio.',
      closeModal: () => {},
      setModalMode: () => {},
      login: async () => {},
      register: async () => {},
    })

    expect(markup).toContain('Đăng nhập Sol Hair')
    expect(markup).toContain('Vui lòng đăng nhập tài khoản để tiếp tục đặt lịch hẹn')
    expect(markup).toContain('Địa chỉ email')
    expect(markup).toContain('Mật khẩu')
    expect(markup).toContain('auth-email-input')
    expect(markup).toContain('auth-password-input')
    expect(markup).toContain('Đăng ký ngay')
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
  })

  it('render modal đăng ký khi modalMode là register', () => {
    const markup = renderWithAuth(<AuthModal />, {
      isModalOpen: true,
      modalMode: 'register',
      promptNotice: '',
      closeModal: () => {},
      setModalMode: () => {},
      login: async () => {},
      register: async () => {},
    })

    expect(markup).toContain('Tạo tài khoản Sol')
    expect(markup).toContain('Xác nhận mật khẩu')
    expect(markup).toContain('auth-confirm-password-input')
    expect(markup).toContain('Đã có tài khoản?')
  })

  it('render màn hình kích hoạt tài khoản khi modalMode là otp_verification', () => {
    const markup = renderWithAuth(<AuthModal />, {
      isModalOpen: true,
      modalMode: 'otp_verification',
      promptNotice: '',
      closeModal: () => {},
      setModalMode: () => {},
      login: async () => {},
      register: async () => {},
      activate: async () => {},
      resendActivation: async () => {},
    })

    expect(markup).toContain('Kích hoạt tài khoản')
    expect(markup).toContain('Nhập mã OTP')
    expect(markup).toContain('auth-otp-input')
    expect(markup).toContain('Gửi lại mã OTP')
    expect(markup).toContain('Quay lại đăng ký')
  })
})

describe('UserNav Component', () => {
  it('render nút Đăng nhập khi chưa authenticated', () => {
    const markup = renderWithAuth(<UserNav />, {
      isAuthenticated: false,
      account: null,
      openLoginModal: () => {},
      logout: async () => {},
    })

    expect(markup).toContain('Đăng nhập')
    expect(markup).not.toContain('Đăng xuất')
  })

  it('render email và avatar khi đã authenticated', () => {
    const markup = renderWithAuth(<UserNav />, {
      isAuthenticated: true,
      account: { email: 'sol.guest@example.com', roles: ['customer'] },
      openLoginModal: () => {},
      logout: async () => {},
    })

    expect(markup).toContain('sol.guest@example.com')
    expect(markup).toContain('S') // initial
  })
})
