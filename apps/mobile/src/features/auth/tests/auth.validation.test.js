import { describe, expect, it } from 'vitest'
import {
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
  it('kiểm tra tên hiển thị bắt buộc', () => {
    expect(validateDisplayName('').isValid).toBe(false)
    expect(validateDisplayName('Nguyễn Văn A').isValid).toBe(true)
    expect(validateDisplayName('  Trần Thị B  ').value).toBe('Trần Thị B')
  })

  it('chấp nhận số điện thoại E.164 hoặc số 0 đầu tự động convert', () => {
    expect(validatePhone('+84901234567').isValid).toBe(true)
    expect(validatePhone('0901234567').value).toBe('+84901234567')
    expect(validatePhone('12345').isValid).toBe(false)
    expect(validatePhone('', { isRequired: false }).isValid).toBe(true)
    expect(validatePhone('', { isRequired: true }).isValid).toBe(false)
  })
})

describe('validateCustomerProfileForm (mobile)', () => {
  it('validate form đầy đủ hợp lệ', () => {
    const res = validateCustomerProfileForm({
      displayName: 'Nguyễn Khách',
      phone: '0912345678',
      isPhoneRequired: true,
    })
    expect(res.isValid).toBe(true)
    expect(res.values.displayName).toBe('Nguyễn Khách')
    expect(res.values.phone).toBe('+84912345678')
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
