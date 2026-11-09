import { describe, expect, it } from 'vitest'
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  formatPhoneForInput,
  validateConfirmPassword,
  validateCustomerProfileForm,
  validateDisplayName,
  validateEmail,
  validateLoginForm,
  validateOtpCode,
  validatePassword,
  validatePhone,
  validateRegisterForm,
} from '../validation/auth.validation.js'

describe('validateEmail (mobile)', () => {
  it('từ chối email rỗng hoặc sai kiểu', () => {
    expect(validateEmail('').isValid).toBe(false)
    expect(validateEmail('   ').isValid).toBe(false)
    expect(validateEmail(null).isValid).toBe(false)
  })

  it('từ chối email sai định dạng cú pháp', () => {
    expect(validateEmail('notanemail').isValid).toBe(false)
    expect(validateEmail('user@').isValid).toBe(false)
    expect(validateEmail('@domain.com').isValid).toBe(false)
    expect(validateEmail('user@domain').isValid).toBe(false)
  })

  it('chấp nhận email hợp lệ và chuẩn hóa lowercase, trim', () => {
    const res = validateEmail('  Customer.Sol@Example.Com  ')
    expect(res.isValid).toBe(true)
    expect(res.value).toBe('customer.sol@example.com')
  })
})

describe('validatePassword (mobile)', () => {
  it('từ chối mật khẩu ngắn hơn 8 ký tự', () => {
    expect(validatePassword('1234567').isValid).toBe(false)
  })

  it('chấp nhận mật khẩu từ 8 ký tự trở lên', () => {
    expect(validatePassword('Password123!').isValid).toBe(true)
  })
})

describe('validateConfirmPassword (mobile)', () => {
  it('từ chối khi mật khẩu xác nhận không trùng khớp', () => {
    expect(validateConfirmPassword('passA', 'passB').isValid).toBe(false)
  })

  it('chấp nhận khi mật khẩu xác nhận trùng khớp', () => {
    expect(validateConfirmPassword('samePass123', 'samePass123').isValid).toBe(true)
  })
})

describe('validateOtpCode (mobile)', () => {
  it('từ chối mã không đủ 6 số hoặc có chữ', () => {
    expect(validateOtpCode('12345').isValid).toBe(false)
    expect(validateOtpCode('1234567').isValid).toBe(false)
    expect(validateOtpCode('12a456').isValid).toBe(false)
  })

  it('chấp nhận mã 6 chữ số hợp lệ', () => {
    expect(validateOtpCode('325954').isValid).toBe(true)
    expect(validateOtpCode('325954').value).toBe('325954')
  })
})

describe('validateDisplayName & validatePhone (mobile)', () => {
  it('kiểm tra tên hiển thị: bắt buộc, từ 2 đến 50 ký tự và không chứa chữ số', () => {
    expect(DISPLAY_NAME_MIN_LENGTH).toBe(2)
    expect(DISPLAY_NAME_MAX_LENGTH).toBe(50)

    expect(validateDisplayName('').isValid).toBe(false)
    expect(validateDisplayName('   ').isValid).toBe(false)

    expect(validateDisplayName('456789').isValid).toBe(false)
    expect(validateDisplayName('456789').message).toBe('Họ và tên không được chứa chữ số.')
    expect(validateDisplayName('Nguyễn 123').isValid).toBe(false)

    expect(validateDisplayName('A').isValid).toBe(false)
    expect(validateDisplayName('A').message).toBe('Họ và tên phải có ít nhất 2 ký tự.')

    expect(validateDisplayName('A'.repeat(51)).isValid).toBe(false)
    expect(validateDisplayName('A'.repeat(51)).message).toBe('Họ và tên không được vượt quá 50 ký tự.')

    expect(validateDisplayName('An').isValid).toBe(true)
    expect(validateDisplayName('Nguyễn Văn A').isValid).toBe(true)
    expect(validateDisplayName('  Trần Thị B  ').value).toBe('Trần Thị B')
  })

  it('yêu cầu số điện thoại không trống, không chứa chữ, đúng 10 số bắt đầu bằng 0 và convert sang E.164', () => {
    expect(validatePhone('').isValid).toBe(false)
    expect(validatePhone('   ').isValid).toBe(false)
    expect(validatePhone('').message).toBe('Vui lòng nhập số điện thoại.')

    expect(validatePhone('0901234abc').isValid).toBe(false)
    expect(validatePhone('0901234abc').message).toBe('Số điện thoại không được chứa chữ cái.')

    expect(validatePhone('0901234567').isValid).toBe(true)
    expect(validatePhone('0901234567').value).toBe('+84901234567')
    expect(validatePhone('+84901234567').isValid).toBe(false)
    expect(validatePhone('12345').isValid).toBe(false)
    expect(validatePhone('090123456').isValid).toBe(false)
    expect(validatePhone('09012345678').isValid).toBe(false)
    expect(validatePhone('1901234567').isValid).toBe(false)
    expect(validatePhone('', { isRequired: false }).isValid).toBe(true)
    expect(validatePhone('', { isRequired: true }).isValid).toBe(false)
  })

  it('formatPhoneForInput chuyển đổi số +84 về định dạng 0 đầu cho input', () => {
    expect(formatPhoneForInput('+84901234567')).toBe('0901234567')
    expect(formatPhoneForInput('0901234567')).toBe('0901234567')
    expect(formatPhoneForInput('')).toBe('')
    expect(formatPhoneForInput(undefined)).toBe('')
  })
})

describe('validateCustomerProfileForm (mobile)', () => {
  it('validate form đầy đủ hợp lệ', () => {
    const res = validateCustomerProfileForm({
      displayName: 'Nguyễn Khách',
      phone: '0912345678',
    })
    expect(res.isValid).toBe(true)
    expect(res.values.displayName).toBe('Nguyễn Khách')
    expect(res.values.phone).toBe('+84912345678')
  })

  it('chặn tên hoặc số điện thoại để trống mặc định', () => {
    const res = validateCustomerProfileForm({
      displayName: '',
      phone: '',
    })
    expect(res.isValid).toBe(false)
    expect(res.errors.displayName).toBe('Vui lòng nhập tên hiển thị (họ tên).')
    expect(res.errors.phone).toBe('Vui lòng nhập số điện thoại.')
  })

  it('chặn tên chứa số và số điện thoại không hợp lệ', () => {
    const res = validateCustomerProfileForm({
      displayName: '456789',
      phone: '12345',
    })
    expect(res.isValid).toBe(false)
    expect(res.errors.displayName).toBe('Họ và tên không được chứa chữ số.')
    expect(res.errors.phone).toBe(
      'Số điện thoại phải gồm đúng 10 chữ số và bắt đầu bằng số 0 (ví dụ: 0901234567).'
    )
  })
})

describe('validateLoginForm & validateRegisterForm (mobile)', () => {
  it('validate form đăng nhập hợp lệ', () => {
    const res = validateLoginForm({ email: 'user@example.com', password: 'Password123' })
    expect(res.isValid).toBe(true)
  })

  it('validate form đăng ký hợp lệ', () => {
    const res = validateRegisterForm({
      email: 'user@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    })
    expect(res.isValid).toBe(true)
  })
})
