export const EMAIL_MAX_LENGTH = 254
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
export const DISPLAY_NAME_MAX_LENGTH = 120

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_REGEX = /^\d{6}$/
// E.164 phone format: starts with +, followed by 1 to 15 digits (e.g., +84901234567)
const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/

export function validateEmail(email) {
  if (!email || typeof email !== 'string' || !email.trim()) {
    return { isValid: false, message: 'Vui lòng nhập địa chỉ email.' }
  }

  const trimmed = email.trim()
  if (trimmed.length > EMAIL_MAX_LENGTH) {
    return { isValid: false, message: `Email không được vượt quá ${EMAIL_MAX_LENGTH} ký tự.` }
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { isValid: false, message: 'Địa chỉ email không đúng định dạng (ví dụ: ten@domain.com).' }
  }

  return { isValid: true, value: trimmed.toLowerCase() }
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { isValid: false, message: 'Vui lòng nhập mật khẩu.' }
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return { isValid: false, message: `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự.` }
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return { isValid: false, message: `Mật khẩu không được vượt quá ${PASSWORD_MAX_LENGTH} ký tự.` }
  }

  return { isValid: true, value: password }
}

export function validateConfirmPassword(confirmPassword, password) {
  if (!confirmPassword || typeof confirmPassword !== 'string') {
    return { isValid: false, message: 'Vui lòng nhập lại mật khẩu xác nhận.' }
  }

  if (confirmPassword !== password) {
    return { isValid: false, message: 'Mật khẩu xác nhận không trùng khớp.' }
  }

  return { isValid: true, value: confirmPassword }
}

export function validateOtpCode(code) {
  if (!code || typeof code !== 'string' || !code.trim()) {
    return { isValid: false, message: 'Vui lòng nhập mã OTP gồm 6 chữ số.' }
  }

  const trimmed = code.trim()
  if (!OTP_REGEX.test(trimmed)) {
    return { isValid: false, message: 'Mã xác thực phải gồm đúng 6 chữ số.' }
  }

  return { isValid: true, value: trimmed }
}

export function validateDisplayName(displayName) {
  if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
    return { isValid: false, message: 'Vui lòng nhập tên hiển thị (họ tên).' }
  }

  const trimmed = displayName.trim()
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return { isValid: false, message: `Tên không được vượt quá ${DISPLAY_NAME_MAX_LENGTH} ký tự.` }
  }

  return { isValid: true, value: trimmed }
}

export function validatePhone(phone, { isRequired = false } = {}) {
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    if (isRequired) {
      return { isValid: false, message: 'Vui lòng nhập số điện thoại.' }
    }
    return { isValid: true, value: undefined }
  }

  let formatted = phone.trim()
  // Convenience: auto-convert 0xxxxxxxxx to +84xxxxxxxxx if entered locally
  if (formatted.startsWith('0') && formatted.length === 10) {
    formatted = '+84' + formatted.slice(1)
  }

  if (!E164_PHONE_REGEX.test(formatted)) {
    return {
      isValid: false,
      message: 'Số điện thoại phải ở định dạng chuẩn quốc tế E.164 (ví dụ: +84901234567 hoặc 0901234567).',
    }
  }

  return { isValid: true, value: formatted }
}

export function validateLoginForm({ email, password }) {
  const emailRes = validateEmail(email)
  const passwordRes = validatePassword(password)

  const errors = {}
  if (!emailRes.isValid) errors.email = emailRes.message
  if (!passwordRes.isValid) errors.password = passwordRes.message

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    values: {
      email: emailRes.value,
      password: passwordRes.value,
    },
  }
}

export function validateRegisterForm({ email, password, confirmPassword }) {
  const emailRes = validateEmail(email)
  const passwordRes = validatePassword(password)
  const confirmRes = validateConfirmPassword(confirmPassword, password)

  const errors = {}
  if (!emailRes.isValid) errors.email = emailRes.message
  if (!passwordRes.isValid) errors.password = passwordRes.message
  if (!confirmRes.isValid) errors.confirmPassword = confirmRes.message

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    values: {
      email: emailRes.value,
      password: passwordRes.value,
      confirmPassword: confirmRes.value,
    },
  }
}

export function validateCustomerProfileForm({ displayName, phone, isPhoneRequired = false }) {
  const nameRes = validateDisplayName(displayName)
  const phoneRes = validatePhone(phone, { isRequired: isPhoneRequired })

  const errors = {}
  if (!nameRes.isValid) errors.displayName = nameRes.message
  if (!phoneRes.isValid) errors.phone = phoneRes.message

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    values: {
      displayName: nameRes.value,
      phone: phoneRes.value,
    },
  }
}

export function validateCompletePasswordForm({ password, confirmPassword }) {
  const passwordRes = validatePassword(password)
  const confirmRes = validateConfirmPassword(confirmPassword, password)

  const errors = {}
  if (!passwordRes.isValid) errors.password = passwordRes.message
  if (!confirmRes.isValid) errors.confirmPassword = confirmRes.message

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    values: {
      password: passwordRes.value,
      confirmPassword: confirmRes.value,
    },
  }
}
