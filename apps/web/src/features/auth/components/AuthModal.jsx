import { useEffect, useRef, useState } from 'react'
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

export default function AuthModal() {
  const {
    isModalOpen,
    modalMode,
    promptNotice,
    closeModal,
    setModalMode,
    login,
    register,
    activate,
    resendActivation,
  } = useAuth()

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

  const modalRef = useRef(null)
  const emailInputRef = useRef(null)
  const otpInputRef = useRef(null)

  // Focus and scroll lock synchronization
  useEffect(() => {
    if (!isModalOpen) return
    document.body.style.overflow = 'hidden'

    const timer = setTimeout(() => {
      if (modalMode === 'otp_verification') {
        otpInputRef.current?.focus()
      } else {
        emailInputRef.current?.focus()
      }
    }, 50)
    return () => {
      clearTimeout(timer)
      document.body.style.overflow = ''
    }
  }, [isModalOpen, modalMode])

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // Escape key handler
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && isModalOpen) {
        closeModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isModalOpen, closeModal])

  if (!isModalOpen) return null

  function handleModeChange(newMode) {
    setModalMode(newMode)
    setFieldErrors({})
    setTouchedFields({})
    setApiError(null)
    setApiErrorCode(null)
    setSuccessNotice(null)
  }

  function handleBlur(field) {
    setTouchedFields((prev) => ({ ...prev, [field]: true }))
    validateField(field)
  }

  function validateField(field) {
    if (field === 'email') {
      const result = validateEmail(email)
      setFieldErrors((prev) => ({
        ...prev,
        email: result.isValid ? null : result.message,
      }))
    } else if (field === 'password') {
      const result = validatePassword(password)
      setFieldErrors((prev) => ({
        ...prev,
        password: result.isValid ? null : result.message,
      }))
      if (modalMode === 'register' && touchedFields.confirmPassword) {
        const confirmResult = validateConfirmPassword(confirmPassword, password)
        setFieldErrors((prev) => ({
          ...prev,
          confirmPassword: confirmResult.isValid ? null : confirmResult.message,
        }))
      }
    } else if (field === 'confirmPassword' && modalMode === 'register') {
      const confirmResult = validateConfirmPassword(confirmPassword, password)
      setFieldErrors((prev) => ({
        ...prev,
        confirmPassword: confirmResult.isValid ? null : confirmResult.message,
      }))
    } else if (field === 'otpCode') {
      const result = validateOtpCode(otpCode)
      setFieldErrors((prev) => ({
        ...prev,
        otpCode: result.isValid ? null : result.message,
      }))
    }
  }

  function handleEmailChange(e) {
    const val = e.target.value
    setEmail(val)
    if (touchedFields.email) {
      const result = validateEmail(val)
      setFieldErrors((prev) => ({
        ...prev,
        email: result.isValid ? null : result.message,
      }))
    }
  }

  function handlePasswordChange(e) {
    const val = e.target.value
    setPassword(val)
    if (touchedFields.password) {
      const result = validatePassword(val)
      setFieldErrors((prev) => ({
        ...prev,
        password: result.isValid ? null : result.message,
      }))
    }
    if (modalMode === 'register' && touchedFields.confirmPassword) {
      const confirmResult = validateConfirmPassword(confirmPassword, val)
      setFieldErrors((prev) => ({
        ...prev,
        confirmPassword: confirmResult.isValid ? null : confirmResult.message,
      }))
    }
  }

  function handleConfirmPasswordChange(e) {
    const val = e.target.value
    setConfirmPassword(val)
    if (touchedFields.confirmPassword) {
      const confirmResult = validateConfirmPassword(val, password)
      setFieldErrors((prev) => ({
        ...prev,
        confirmPassword: confirmResult.isValid ? null : confirmResult.message,
      }))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setApiError(null)
    setApiErrorCode(null)
    setSuccessNotice(null)

    if (modalMode === 'login') {
      const validation = validateLoginForm({ email, password })
      if (!validation.isValid) {
        setFieldErrors(validation.errors)
        setTouchedFields({ email: true, password: true })
        return
      }

      setIsSubmitting(true)
      try {
        await login({ email: validation.values.email, password: validation.values.password })
      } catch (err) {
        setApiError(getAuthErrorMessage(err))
        setApiErrorCode(err?.code)
      } finally {
        setIsSubmitting(false)
      }
    } else if (modalMode === 'register') {
      const validation = validateRegisterForm({ email, password, confirmPassword })
      if (!validation.isValid) {
        setFieldErrors(validation.errors)
        setTouchedFields({ email: true, password: true, confirmPassword: true })
        return
      }

      setIsSubmitting(true)
      try {
        await register({ email: validation.values.email, password: validation.values.password })
        // Save to state and sessionStorage so page reload/tab switch retains credentials
        setOtpEmail(validation.values.email)
        setPendingPassword(validation.values.password)
        try {
          sessionStorage.setItem('sol_pending_email', validation.values.email)
          sessionStorage.setItem('sol_pending_password', validation.values.password)
        } catch {
          // ignore sessionStorage restrictions
        }
        setOtpCode('')
        setFieldErrors({})
        setTouchedFields({})
        setResendCooldown(60)
        setSuccessNotice('Mã xác thực gồm 6 chữ số đã được gửi tới email của bạn. Vui lòng nhập mã để kích hoạt tài khoản.')
        setModalMode('otp_verification')
      } catch (err) {
        setApiError(getAuthErrorMessage(err))
        setApiErrorCode(err?.code)
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault()
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

      // Clear pending registration cache
      try {
        sessionStorage.removeItem('sol_pending_email')
        sessionStorage.removeItem('sol_pending_password')
      } catch {
        // ignore
      }

      // If API returned a session token directly, activate callback already established session!
      if (data?.token) {
        closeModal()
        return
      }

      // If token wasn't returned in response, auto-login with saved password
      if (savedPass) {
        await login({ email: savedEmail, password: savedPass })
        closeModal()
        return
      }

      // Fallback only if no password available anywhere
      setSuccessNotice('Tài khoản đã được kích hoạt thành công!')
      setModalMode('login')
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

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      closeModal()
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border/80 bg-canvas p-6 shadow-2xl sm:p-8"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={closeModal}
          aria-label="Đóng cửa sổ"
          className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-soft-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header Branding */}
        <div className="text-center">
          <img
            src="/logo/sol-logo.png"
            alt=""
            width="44"
            height="44"
            className="mx-auto h-11 w-11 object-contain"
            decoding="async"
          />
          <h2
            id="auth-modal-title"
            className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
          >
            {modalMode === 'otp_verification'
              ? 'Kích hoạt tài khoản'
              : modalMode === 'login'
                ? 'Đăng nhập Sol Hair'
                : 'Tạo tài khoản Sol'}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {modalMode === 'otp_verification'
              ? 'Xác thực mã 6 số được gửi qua email để hoàn tất đăng ký.'
              : modalMode === 'login'
                ? 'Trải nghiệm dịch vụ làm đẹp dành riêng cho bạn.'
                : 'Đăng ký để dễ dàng đặt lịch và theo dõi dịch vụ.'}
          </p>
        </div>

        {/* Prompt Notice (e.g. from clicking Đặt lịch) */}
        {promptNotice && modalMode !== 'otp_verification' && (
          <div
            role="status"
            className="mt-4 flex items-start gap-2.5 rounded-2xl border border-terracotta/20 bg-terracotta/10 p-3 text-xs leading-relaxed text-terracotta"
          >
            <svg
              className="mt-0.5 h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>{promptNotice}</span>
          </div>
        )}

        {/* Mode Switcher Tabs (Only shown for login & register) */}
        {modalMode !== 'otp_verification' && (
          <div className="mt-5 grid grid-cols-2 rounded-2xl border border-border/60 bg-soft-surface p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleModeChange('login')}
              className={`rounded-xl py-2 transition-all ${
                modalMode === 'login'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('register')}
              className={`rounded-xl py-2 transition-all ${
                modalMode === 'register'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Đăng ký
            </button>
          </div>
        )}

        {/* Global API Error Alert */}
        {apiError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-terracotta/30 bg-terracotta/10 p-3 text-xs leading-relaxed text-terracotta"
          >
            <p>{apiError}</p>
            {apiErrorCode === 'ACCOUNT_NOT_ACTIVE' && (
              <button
                type="button"
                onClick={() => {
                  setOtpEmail(email)
                  setPendingPassword(password)
                  setModalMode('otp_verification')
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

        {/* Success Notice */}
        {successNotice && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800"
          >
            {successNotice}
          </div>
        )}

        {/* OTP Verification Form */}
        {modalMode === 'otp_verification' ? (
          <form onSubmit={handleVerifyOtp} noValidate className="mt-5 space-y-4">
            <div className="rounded-2xl border border-border/80 bg-soft-surface p-3 text-center text-xs text-muted">
              Mã xác thực 6 chữ số đã được gửi tới:
              <span className="mt-1 block font-semibold text-ink break-all">
                {otpEmail || email}
              </span>
            </div>

            <div>
              <label
                htmlFor="auth-otp-input"
                className="block text-center text-xs font-medium text-ink"
              >
                Nhập mã OTP <span className="text-terracotta">*</span>
              </label>
              <div className="mt-2 flex justify-center">
                <input
                  ref={otpInputRef}
                  id="auth-otp-input"
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
                  aria-describedby={fieldErrors.otpCode ? 'auth-otp-error' : undefined}
                  className={`w-52 rounded-2xl border bg-white py-3 text-center font-mono text-2xl font-bold tracking-[0.35em] text-ink placeholder:text-muted/40 transition focus:outline-none ${
                    fieldErrors.otpCode
                      ? 'border-terracotta focus:border-terracotta focus:ring-2 focus:ring-terracotta/20'
                      : 'border-border focus:border-terracotta focus:ring-2 focus:ring-terracotta/15'
                  }`}
                />
              </div>
              {fieldErrors.otpCode && (
                <p
                  id="auth-otp-error"
                  role="alert"
                  className="mt-1.5 flex items-center justify-center gap-1 text-xs text-terracotta"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {fieldErrors.otpCode}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  setModalMode('register')
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
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-terracotta px-5 text-sm font-semibold text-white shadow-md transition hover:bg-terracotta-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Đang kích hoạt...</span>
                  </>
                ) : (
                  <span>Kích hoạt tài khoản</span>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Login & Register Forms */
          <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
            {/* Email field */}
            <div>
              <label
                htmlFor="auth-email-input"
                className="block text-xs font-medium text-ink"
              >
                Địa chỉ email <span className="text-terracotta">*</span>
              </label>
              <div className="relative mt-1.5">
                <input
                  ref={emailInputRef}
                  id="auth-email-input"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="ten@vidu.com"
                  value={email}
                  onChange={handleEmailChange}
                  onBlur={() => handleBlur('email')}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
                  className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 transition focus:outline-none ${
                    fieldErrors.email
                      ? 'border-terracotta focus:border-terracotta focus:ring-2 focus:ring-terracotta/20'
                      : 'border-border focus:border-terracotta focus:ring-2 focus:ring-terracotta/15'
                  }`}
                />
              </div>
              {fieldErrors.email && (
                <p
                  id="auth-email-error"
                  role="alert"
                  className="mt-1.5 flex items-center gap-1 text-xs text-terracotta"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password field */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="auth-password-input"
                  className="block text-xs font-medium text-ink"
                >
                  Mật khẩu <span className="text-terracotta">*</span>
                </label>
              </div>
              <div className="relative mt-1.5">
                <input
                  id="auth-password-input"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={modalMode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="Ít nhất 8 ký tự"
                  value={password}
                  onChange={handlePasswordChange}
                  onBlur={() => handleBlur('password')}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink focus:outline-none p-1"
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
                <p
                  id="auth-password-error"
                  role="alert"
                  className="mt-1.5 flex items-center gap-1 text-xs text-terracotta"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Confirm Password (only in register mode) */}
            {modalMode === 'register' && (
              <div>
                <label
                  htmlFor="auth-confirm-password-input"
                  className="block text-xs font-medium text-ink"
                >
                  Xác nhận mật khẩu <span className="text-terracotta">*</span>
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="auth-confirm-password-input"
                    name="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Nhập lại mật khẩu"
                    value={confirmPassword}
                    onChange={handleConfirmPasswordChange}
                    onBlur={() => handleBlur('confirmPassword')}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={fieldErrors.confirmPassword ? 'auth-confirm-error' : undefined}
                    className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 transition focus:outline-none ${
                      fieldErrors.confirmPassword
                        ? 'border-terracotta focus:border-terracotta focus:ring-2 focus:ring-terracotta/20'
                        : 'border-border focus:border-terracotta focus:ring-2 focus:ring-terracotta/15'
                    }`}
                  />
                </div>
                {fieldErrors.confirmPassword && (
                  <p
                    id="auth-confirm-error"
                    role="alert"
                    className="mt-1.5 flex items-center gap-1 text-xs text-terracotta"
                  >
                    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-terracotta px-5 text-sm font-semibold text-white shadow-md transition hover:bg-terracotta-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <span>{modalMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer Toggle */}
        {modalMode !== 'otp_verification' && (
          <div className="mt-5 text-center text-xs text-muted">
            {modalMode === 'login' ? (
              <p>
                Chưa có tài khoản?{' '}
                <button
                  type="button"
                  onClick={() => handleModeChange('register')}
                  className="font-semibold text-terracotta hover:underline focus:outline-none"
                >
                  Đăng ký ngay
                </button>
              </p>
            ) : (
              <p>
                Đã có tài khoản?{' '}
                <button
                  type="button"
                  onClick={() => handleModeChange('login')}
                  className="font-semibold text-terracotta hover:underline focus:outline-none"
                >
                  Đăng nhập ngay
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
