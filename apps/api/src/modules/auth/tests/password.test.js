import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../password.js'

describe('Password hashing and verification with scrypt', () => {
  it('tạo hash an toàn và xác thực thành công mật khẩu đúng', async () => {
    const rawPassword = 'SecurePassword123!'
    const hash = await hashPassword(rawPassword)

    expect(hash).toMatch(/^\$scrypt\$N=131072,r=8,p=1\$[a-f0-9]{32}\$[a-f0-9]{128}$/)
    const isValid = await verifyPassword(rawPassword, hash)
    expect(isValid).toBe(true)
  })

  it('từ chối mật khẩu sai', async () => {
    const hash = await hashPassword('CorrectPassword123')
    const isValid = await verifyPassword('WrongPassword321', hash)
    expect(isValid).toBe(false)
  })

  it('từ chối mật khẩu dưới 8 ký tự', async () => {
    await expect(hashPassword('short')).rejects.toThrow('Mật khẩu phải là chuỗi từ 8 đến 128 ký tự.')
  })

  it('trả false khi verify với định dạng hash không hợp lệ', async () => {
    expect(await verifyPassword('Password123', 'invalid-hash')).toBe(false)
    expect(await verifyPassword('Password123', null)).toBe(false)
  })
})
