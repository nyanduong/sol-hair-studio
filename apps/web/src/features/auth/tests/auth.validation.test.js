import { describe, expect, it } from 'vitest'
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateConfirmPassword,
  validateEmail,
  validateLoginForm,
  validateOtpCode,
  validatePassword,
  validateRegisterForm,
} from '../validation/auth.validation.js'

describe('validateEmail', () => {
  it('báo lỗi khi email rỗng hoặc không đúng kiểu', () => {
    expect(validateEmail('').isValid).toBe(false)
    expect(validateEmail('   ').isValid).toBe(false)
    expect(validateEmail(null).isValid).toBe(false)
    expect(validateEmail(undefined).isValid).toBe(false)
    expect(validateEmail('').message).toBe('Vui lòng nhập địa chỉ email.')
  })

  it('báo lỗi khi email vượt quá độ dài tối đa 254 ký tự', () => {
    const longEmail = 'a'.repeat(250) + '@example.com'
    const result = validateEmail(longEmail)
    expect(result.isValid).toBe(false)
    expect(result.message).toContain(`${MAX_EMAIL_LENGTH} ký tự`)
  })

  it('báo lỗi khi email không đúng định dạng', () => {
    const invalidEmails = [
      'plainaddress',
      '@missingusername.com',
      'username@.com',
      'username@domain',
      'username with space@domain.com',
    ]

    for (const email of invalidEmails) {
      const result = validateEmail(email)
      expect(result.isValid).toBe(false)
      expect(result.message).toContain('không đúng định dạng')
    }
  })

  it('hợp lệ và chuẩn hóa email về chữ thường và cắt khoảng trắng', () => {
    const result = validateEmail('  Customer.Sol@Studio.VN  ')
    expect(result.isValid).toBe(true)
    expect(result.value).toBe('customer.sol@studio.vn')
    expect(result.message).toBeNull()
  })
})

describe('validatePassword', () => {
  it('báo lỗi khi mật khẩu rỗng hoặc không đúng kiểu', () => {
    expect(validatePassword('').isValid).toBe(false)
    expect(validatePassword(null).isValid).toBe(false)
    expect(validatePassword('').message).toBe('Vui lòng nhập mật khẩu.')
  })

  it('báo lỗi khi mật khẩu ít hơn 8 ký tự', () => {
    const result = validatePassword('1234567')
    expect(result.isValid).toBe(false)
    expect(result.message).toContain(`${MIN_PASSWORD_LENGTH} ký tự`)
  })

  it('báo lỗi khi mật khẩu vượt quá 128 ký tự', () => {
    const result = validatePassword('a'.repeat(129))
    expect(result.isValid).toBe(false)
    expect(result.message).toContain(`${MAX_PASSWORD_LENGTH} ký tự`)
  })

  it('hợp lệ khi mật khẩu từ 8 đến 128 ký tự', () => {
    const result = validatePassword('SecretPass123!')
    expect(result.isValid).toBe(true)
    expect(result.value).toBe('SecretPass123!')
    expect(result.message).toBeNull()
  })
})

describe('validateConfirmPassword', () => {
  it('báo lỗi khi mật khẩu xác nhận rỗng', () => {
    const result = validateConfirmPassword('', 'SecretPass123!')
    expect(result.isValid).toBe(false)
    expect(result.message).toBe('Vui lòng xác nhận lại mật khẩu.')
  })

  it('báo lỗi khi mật khẩu xác nhận không khớp', () => {
    const result = validateConfirmPassword('Different123', 'SecretPass123!')
    expect(result.isValid).toBe(false)
    expect(result.message).toBe('Mật khẩu xác nhận không khớp.')
  })

  it('hợp lệ khi mật khẩu xác nhận khớp hoàn toàn', () => {
    const result = validateConfirmPassword('SecretPass123!', 'SecretPass123!')
    expect(result.isValid).toBe(true)
    expect(result.message).toBeNull()
  })
})

describe('validateLoginForm', () => {
  it('chặn submit khi cả email và mật khẩu đều rỗng', () => {
    const result = validateLoginForm({ email: '', password: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.email).toBeDefined()
    expect(result.errors.password).toBeDefined()
  })

  it('chặn submit khi mật khẩu ngắn hơn 8 ký tự', () => {
    const result = validateLoginForm({ email: 'user@example.com', password: '123' })
    expect(result.isValid).toBe(false)
    expect(result.errors.email).toBeUndefined()
    expect(result.errors.password).toContain('8 ký tự')
  })

  it('hợp lệ khi email và mật khẩu đúng chuẩn', () => {
    const result = validateLoginForm({ email: '  User@Example.com ', password: 'password123' })
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
    expect(result.values.email).toBe('user@example.com')
    expect(result.values.password).toBe('password123')
  })
})

describe('validateRegisterForm', () => {
  it('chặn submit khi thông tin thiếu hoặc không khớp', () => {
    const result = validateRegisterForm({
      email: 'bad-email',
      password: 'short',
      confirmPassword: 'mismatch',
    })
    expect(result.isValid).toBe(false)
    expect(result.errors.email).toBeDefined()
    expect(result.errors.password).toBeDefined()
    expect(result.errors.confirmPassword).toBeDefined()
  })

  it('hợp lệ khi cả 3 trường đều đúng chuẩn', () => {
    const result = validateRegisterForm({
      email: 'newuser@solhair.vn',
      password: 'SecurePassword2026!',
      confirmPassword: 'SecurePassword2026!',
    })
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
    expect(result.values.email).toBe('newuser@solhair.vn')
  })
})

describe('validateOtpCode', () => {
  it('báo lỗi khi mã OTP rỗng hoặc chứa ký tự không phải số', () => {
    expect(validateOtpCode('').isValid).toBe(false)
    expect(validateOtpCode('   ').isValid).toBe(false)
    expect(validateOtpCode('12345').isValid).toBe(false)
    expect(validateOtpCode('1234567').isValid).toBe(false)
    expect(validateOtpCode('12a456').isValid).toBe(false)
  })

  it('hợp lệ khi mã OTP đúng 6 chữ số', () => {
    const result = validateOtpCode(' 654321 ')
    expect(result.isValid).toBe(true)
    expect(result.value).toBe('654321')
    expect(result.message).toBeNull()
  })
})
