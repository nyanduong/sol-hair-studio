const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MAX_EMAIL_LENGTH = 254
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128

export function validateEmail(email) {
  if (typeof email !== 'string' || !email.trim()) {
    return { isValid: false, message: 'Vui lòng nhập địa chỉ email.' }
  }

  const trimmed = email.trim()
  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return { isValid: false, message: `Email không được vượt quá ${MAX_EMAIL_LENGTH} ký tự.` }
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { isValid: false, message: 'Địa chỉ email không đúng định dạng (ví dụ: ban@example.com).' }
  }

  return { isValid: true, message: null, value: trimmed.toLowerCase() }
}

export function validatePassword(password) {
  if (typeof password !== 'string' || !password) {
    return { isValid: false, message: 'Vui lòng nhập mật khẩu.' }
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { isValid: false, message: `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` }
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return { isValid: false, message: `Mật khẩu không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự.` }
  }

  return { isValid: true, message: null, value: password }
}

export function validateConfirmPassword(confirmPassword, password) {
  if (typeof confirmPassword !== 'string' || !confirmPassword) {
    return { isValid: false, message: 'Vui lòng xác nhận lại mật khẩu.' }
  }

  if (confirmPassword !== password) {
    return { isValid: false, message: 'Mật khẩu xác nhận không khớp.' }
  }

  return { isValid: true, message: null }
}

export function validateLoginForm({ email, password }) {
  const emailResult = validateEmail(email)
  const passwordResult = validatePassword(password)

  const errors = {}
  if (!emailResult.isValid) errors.email = emailResult.message
  if (!passwordResult.isValid) errors.password = passwordResult.message

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    values: {
      email: emailResult.value ?? '',
      password: passwordResult.value ?? '',
    },
  }
}

export function validateRegisterForm({ email, password, confirmPassword }) {
  const emailResult = validateEmail(email)
  const passwordResult = validatePassword(password)
  const confirmResult = validateConfirmPassword(confirmPassword, password)

  const errors = {}
  if (!emailResult.isValid) errors.email = emailResult.message
  if (!passwordResult.isValid) errors.password = passwordResult.message
  if (!confirmResult.isValid) errors.confirmPassword = confirmResult.message

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    values: {
      email: emailResult.value ?? '',
      password: passwordResult.value ?? '',
    },
  }
}

export function validateOtpCode(code) {
  if (typeof code !== 'string' || !code.trim()) {
    return { isValid: false, message: 'Vui lòng nhập mã OTP.' }
  }

  const trimmed = code.trim()
  if (!/^\d{6}$/.test(trimmed)) {
    return { isValid: false, message: 'Mã OTP phải gồm đúng 6 chữ số.' }
  }

  return { isValid: true, message: null, value: trimmed }
}

