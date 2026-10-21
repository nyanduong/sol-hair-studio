import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAuthErrorMessage } from '../api/auth.api.js'
import { useAuth } from '../hooks/useAuth.js'
import {
  validateConfirmPassword,
  validateEmail,
  validateLoginForm,
  validateOtpCode,
  validatePassword,
  validateRegisterForm,
} from '../validation/auth.validation.js'

export default function LoginPage() {
  const { isAuthenticated, account, login, register, activate, resendActivation, logout } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // OTP verification state
  const [otpCode, setOtpCode] = useState('')
  const [otpEmail, setOtpEmail] = useState('')
  const [pendingPassword, setPendingPassword] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)

  const [fieldErrors, setFieldErrors] = useState({})
  const [touchedFields, setTouchedFields] = useState({})
  const [apiError, setApiError] = useState(null)
  const [apiErrorCode, setApiErrorCode] = useState(null)
  const [successNotice, setSuccessNotice] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  if (isAuthenticated && account) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
        <div className="w-full rounded-3xl border border-border/80 bg-white p-8 shadow-sm">
          <img
            src="/logo/sol-logo.png"
            alt=""
            width="48"
            height="48"
            className="mx-auto h-12 w-12 object-contain"
          />
          <h1 className="mt-4 font-display text-2xl font-medium text-ink">
            Bạn đã đăng nhập
          </h1>
          <p className="mt-2 text-xs text-muted">
            Tài khoản hiện tại: <strong className="text-ink">{account.email}</strong>
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-terracotta px-5 text-xs font-semibold text-white transition hover:bg-terracotta-dark"
            >
              Về trang chủ
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 text-xs font-medium text-muted transition hover:border-terracotta hover:text-ink"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </main>
    )
  }

  function handleBlur(field) {
    setTouchedFields((prev) => ({ ...prev, [field]: true }))
    if (field === 'email') {
      const res = validateEmail(email)
      setFieldErrors((prev) => ({ ...prev, email: res.isValid ? null : res.message }))
    } else if (field === 'password') {
      const res = validatePassword(password)
      setFieldErrors((prev) => ({ ...prev, password: res.isValid ? null : res.message }))
    } else if (field === 'confirmPassword' && mode === 'register') {
      const res = validateConfirmPassword(confirmPassword, password)
      setFieldErrors((prev) => ({ ...prev, confirmPassword: res.isValid ? null : res.message }))
    } else if (field === 'otpCode') {
      const res = validateOtpCode(otpCode)
      setFieldErrors((prev) => ({ ...prev, otpCode: res.isValid ? null : res.message }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setApiError(null)
    setApiErrorCode(null)
    setSuccessNotice(null)

    if (mode === 'login') {
      const validation = validateLoginForm({ email, password })
      if (!validation.isValid) {
        setFieldErrors(validation.errors)
        setTouchedFields({ email: true, password: true })
        return
      }

      setIsSubmitting(true)
      try {
        await login({ email: validation.values.email, password: validation.values.password })
        navigate('/')
      } catch (err) {
        setApiError(getAuthErrorMessage(err))
        setApiErrorCode(err?.code)
      } finally {
        setIsSubmitting(false)
      }
    } else if (mode === 'register') {
      const validation = validateRegisterForm({ email, password, confirmPassword })
      if (!validation.isValid) {
        setFieldErrors(validation.errors)
        setTouchedFields({ email: true, password: true, confirmPassword: true })
        return
      }

      setIsSubmitting(true)
      try {
        await register({ email: validation.values.email, password: validation.values.password })
        setOtpEmail(validation.values.email)
        setPendingPassword(validation.values.password)
        try {
          sessionStorage.setItem('sol_pending_email', validation.values.email)
          sessionStorage.setItem('sol_pending_password', validation.values.password)
        } catch {
          // ignore
        }
        setOtpCode('')
        setFieldErrors({})
        setTouchedFields({})
        setResendCooldown(60)
        setSuccessNotice('Mã xác thực gồm 6 chữ số đã được gửi tới email của bạn. Vui lòng nhập mã để kích hoạt tài khoản.')
        setMode('otp_verification')
      } catch (err) {
        setApiError(getAuthErrorMessage(err))
        setApiErrorCode(err?.code)
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setApiError(null)
    setApiErrorCode(null)
    setSuccessNotice(null)

    const result = validateOtpCode(otpCode)
    if (!result.isValid) {
      setFieldErrors({ otpCode: result.message })
      return
    }

    setIsSubmitting(true)
    let savedEmail = otpEmail || email
    let savedPass = pendingPassword
    try {
      if (!savedEmail) savedEmail = sessionStorage.getItem('sol_pending_email') || ''
      if (!savedPass) savedPass = sessionStorage.getItem('sol_pending_password') || ''
    } catch {
      // ignore
    }

    try {
      const data = await activate({ email: savedEmail, code: result.value })
      try {
        sessionStorage.removeItem('sol_pending_email')
        sessionStorage.removeItem('sol_pending_password')
      } catch {
        // ignore
      }

      if (data?.token) {
        navigate('/')
        return
      }

      if (savedPass) {
        await login({ email: savedEmail, password: savedPass })
        navigate('/')
        return
      }

      setSuccessNotice('Tài khoản đã được kích hoạt thành công!')
      setMode('login')
      setEmail(savedEmail)
      setPassword('')
      setOtpCode('')
    } catch (err) {
      setApiError(getAuthErrorMessage(err))
      setApiErrorCode(err?.code)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return
    setApiError(null)
    setApiErrorCode(null)
    setIsSubmitting(true)
    const activeEmail = otpEmail || email
    try {
      await resendActivation({ email: activeEmail })
      setResendCooldown(60)
      setSuccessNotice(`Mã OTP mới đã được gửi lại tới ${activeEmail}.`)
    } catch (err) {
      setApiError(getAuthErrorMessage(err))
      setApiErrorCode(err?.code)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[85vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-3xl border border-border/80 bg-white p-6 shadow-sm sm:p-8">
        <div className="text-center">
          <Link to="/" className="inline-block">
            <img
              src="/logo/sol-logo.png"
              alt="Sol Hair Studio"
              width="44"
              height="44"
              className="mx-auto h-11 w-11 object-contain"
            />
          </Link>
          <h1 className="mt-3 font-display text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            {mode === 'otp_verification'
              ? 'Kích hoạt tài khoản'
              : mode === 'login'
                ? 'Đăng nhập Sol Hair Studio'
                : 'Tạo tài khoản Sol'}
          </h1>
          <p className="mt-1 text-xs text-muted">
            {mode === 'otp_verification'
              ? 'Xác thực mã 6 số được gửi qua email để hoàn tất đăng ký.'
              : mode === 'login'
                ? 'Đăng nhập để đặt lịch và chăm sóc mái tóc của bạn.'
                : 'Đăng ký tài khoản khách hàng để trải nghiệm dịch vụ.'}
          </p>
        </div>

        {/* Switch tabs (only for login and register) */}
        {mode !== 'otp_verification' && (
          <div className="mt-5 grid grid-cols-2 rounded-2xl border border-border/60 bg-soft-surface p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setFieldErrors({})
                setApiError(null)
                setApiErrorCode(null)
                setSuccessNotice(null)
              }}
              className={`rounded-xl py-2 transition-all ${
                mode === 'login'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register')
                setFieldErrors({})
                setApiError(null)
                setApiErrorCode(null)
                setSuccessNotice(null)
              }}
              className={`rounded-xl py-2 transition-all ${
                mode === 'register'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Đăng ký
            </button>
          </div>
        )}

        {apiError && (
          <div role="alert" className="mt-4 rounded-xl border border-terracotta/30 bg-terracotta/10 p-3 text-xs leading-relaxed text-terracotta">
            <p>{apiError}</p>
            {apiErrorCode === 'ACCOUNT_NOT_ACTIVE' && (
              <button
                type="button"
                onClick={() => {
                  setOtpEmail(email)
                  setPendingPassword(password)
                  setMode('otp_verification')
                  setApiError(null)
                  setApiErrorCode(null)
                  setSuccessNotice(`Nhập mã OTP kích hoạt cho tài khoản ${email}.`)
                  setResendCooldown(60)
                }}
                className="mt-2 inline-block font-semibold underline hover:text-terracotta-dark"
              >
                Nhập mã OTP để kích hoạt ngay →
              </button>
            )}
          </div>
        )}

        {successNotice && (
          <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
            {successNotice}
          </div>
        )}

        {mode === 'otp_verification' ? (
          <form onSubmit={handleVerifyOtp} noValidate className="mt-5 space-y-4">
            <div className="rounded-2xl border border-border/80 bg-soft-surface p-3 text-center text-xs text-muted">
              Mã xác thực 6 chữ số đã được gửi tới:
              <span className="mt-1 block font-semibold text-ink break-all">
                {otpEmail || email}
              </span>
            </div>

            <div>
              <label
                htmlFor="login-otp-input"
                className="block text-center text-xs font-medium text-ink"
              >
                Nhập mã OTP <span className="text-terracotta">*</span>
              </label>
              <div className="mt-2 flex justify-center">
                <input
                  id="login-otp-input"
                  name="otpCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  value={otpCode}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setOtpCode(clean)
                    if (fieldErrors.otpCode) {
                      const res = validateOtpCode(clean)
                      setFieldErrors((prev) => ({
                        ...prev,
                        otpCode: res.isValid ? null : res.message,
                      }))
                    }
                  }}
                  onBlur={() => handleBlur('otpCode')}
                  aria-invalid={Boolean(fieldErrors.otpCode)}
                  className={`w-52 rounded-2xl border bg-white py-3 text-center font-mono text-2xl font-bold tracking-[0.35em] text-ink placeholder:text-muted/40 transition focus:outline-none ${
                    fieldErrors.otpCode
                      ? 'border-terracotta focus:border-terracotta focus:ring-2 focus:ring-terracotta/20'
                      : 'border-border focus:border-terracotta focus:ring-2 focus:ring-terracotta/15'
                  }`}
                />
              </div>
              {fieldErrors.otpCode && (
                <p
                  role="alert"
                  className="mt-1.5 flex items-center justify-center gap-1 text-xs text-terracotta"
                >
                  {fieldErrors.otpCode}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  setMode('register')
                  setApiError(null)
                  setApiErrorCode(null)
                  setFieldErrors({})
                }}
                className="text-muted hover:text-ink hover:underline"
              >
                ← Quay lại đăng ký
              </button>
              <button
                type="button"
                disabled={resendCooldown > 0 || isSubmitting}
                onClick={handleResendOtp}
                className="font-medium text-terracotta hover:underline disabled:cursor-not-allowed disabled:text-muted/60 disabled:no-underline"
              >
                {resendCooldown > 0 ? `Gửi lại mã (${resendCooldown}s)` : 'Gửi lại mã OTP'}
              </button>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-terracotta px-5 text-sm font-semibold text-white shadow-md transition hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Đang kích hoạt...' : 'Kích hoạt tài khoản'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-ink">
                Địa chỉ email <span className="text-terracotta">*</span>
              </label>
              <div className="mt-1.5">
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="ten@vidu.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (touchedFields.email) {
                      const res = validateEmail(e.target.value)
                      setFieldErrors((prev) => ({ ...prev, email: res.isValid ? null : res.message }))
                    }
                  }}
                  onBlur={() => handleBlur('email')}
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 transition focus:outline-none ${
                    fieldErrors.email
                      ? 'border-terracotta focus:border-terracotta focus:ring-2 focus:ring-terracotta/20'
                      : 'border-border focus:border-terracotta focus:ring-2 focus:ring-terracotta/15'
                  }`}
                />
              </div>
              {fieldErrors.email && (
                <p role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-terracotta">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-ink">
                Mật khẩu <span className="text-terracotta">*</span>
              </label>
              <div className="relative mt-1.5">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="Ít nhất 8 ký tự"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (touchedFields.password) {
                      const res = validatePassword(e.target.value)
                      setFieldErrors((prev) => ({ ...prev, password: res.isValid ? null : res.message }))
                    }
                  }}
                  onBlur={() => handleBlur('password')}
                  aria-invalid={Boolean(fieldErrors.password)}
                  className={`w-full rounded-xl border bg-white px-3.5 py-2.5 pr-10 text-sm text-ink placeholder:text-muted/60 transition focus:outline-none ${
                    fieldErrors.password
                      ? 'border-terracotta focus:border-terracotta focus:ring-2 focus:ring-terracotta/20'
                      : 'border-border focus:border-terracotta focus:ring-2 focus:ring-terracotta/15'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink focus:outline-none"
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-terracotta">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {mode === 'register' && (
              <div>
                <label htmlFor="login-confirm-password" className="block text-xs font-medium text-ink">
                  Xác nhận mật khẩu <span className="text-terracotta">*</span>
                </label>
                <div className="mt-1.5">
                  <input
                    id="login-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Nhập lại mật khẩu"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      if (touchedFields.confirmPassword) {
                        const res = validateConfirmPassword(e.target.value, password)
                        setFieldErrors((prev) => ({ ...prev, confirmPassword: res.isValid ? null : res.message }))
                      }
                    }}
                    onBlur={() => handleBlur('confirmPassword')}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 transition focus:outline-none ${
                      fieldErrors.confirmPassword
                        ? 'border-terracotta focus:border-terracotta focus:ring-2 focus:ring-terracotta/20'
                        : 'border-border focus:border-terracotta focus:ring-2 focus:ring-terracotta/15'
                    }`}
                  />
                </div>
                {fieldErrors.confirmPassword && (
                  <p role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-terracotta">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-terracotta px-5 text-sm font-semibold text-white shadow-md transition hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Đang xử lý...' : (mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản')}
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 text-center text-xs text-muted">
          <Link to="/" className="font-medium hover:text-ink">
            ← Quay lại trang chủ
          </Link>
        </div>
      </div>
    </main>
  )
}
