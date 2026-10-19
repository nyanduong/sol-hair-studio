import { describe, expect, it } from 'vitest'
import { AccountModel, accountSchema } from '../accounts.model.js'

describe('accountSchema and AccountModel', () => {
  it('cho phép customer chờ xác minh có passwordHash nhưng chưa có emailVerifiedAt', async () => {
    const account = new AccountModel({
      emailNormalized: 'customer@example.com',
      passwordHash: '$2b$10$hashedpasswordforcustomervalidation',
      roles: ['customer'],
      status: 'pending_verification',
    })

    await expect(account.validate()).resolves.toBeUndefined()
  })

  it('cho phép nhân viên chờ xác minh chưa có passwordHash', async () => {
    const account = new AccountModel({
      emailNormalized: 'stylist@example.com',
      roles: ['stylist'],
      status: 'pending_verification',
    })

    await expect(account.validate()).resolves.toBeUndefined()
  })

  it('từ chối trạng thái pending_password khi thiếu emailVerifiedAt', async () => {
    const account = new AccountModel({
      emailNormalized: 'staff@example.com',
      roles: ['stylist'],
      status: 'pending_password',
    })

    await expect(account.validate()).rejects.toHaveProperty(
      'errors.emailVerifiedAt',
    )
  })

  it('chấp nhận trạng thái pending_password khi đã có emailVerifiedAt', async () => {
    const account = new AccountModel({
      emailNormalized: 'staff@example.com',
      roles: ['stylist'],
      status: 'pending_password',
      emailVerifiedAt: new Date(),
    })

    await expect(account.validate()).resolves.toBeUndefined()
  })

  it('từ chối trạng thái active khi thiếu passwordHash', async () => {
    const account = new AccountModel({
      emailNormalized: 'active@example.com',
      roles: ['customer'],
      status: 'active',
      emailVerifiedAt: new Date(),
    })

    await expect(account.validate()).rejects.toHaveProperty(
      'errors.passwordHash',
    )
  })

  it('từ chối trạng thái active khi thiếu emailVerifiedAt', async () => {
    const account = new AccountModel({
      emailNormalized: 'active@example.com',
      roles: ['customer'],
      status: 'active',
      passwordHash: '$2b$10$hashedpasswordforcustomervalidation',
    })

    await expect(account.validate()).rejects.toHaveProperty(
      'errors.emailVerifiedAt',
    )
  })

  it('chấp nhận trạng thái active khi có cả passwordHash và emailVerifiedAt', async () => {
    const account = new AccountModel({
      emailNormalized: 'active@example.com',
      roles: ['customer'],
      status: 'active',
      passwordHash: '$2b$10$hashedpasswordforcustomervalidation',
      emailVerifiedAt: new Date(),
    })

    await expect(account.validate()).resolves.toBeUndefined()
  })

  it('từ chối role không hợp lệ, mảng role rỗng hoặc trùng lặp', async () => {
    const invalidRoleAccount = new AccountModel({
      emailNormalized: 'test@example.com',
      roles: ['admin'],
      status: 'pending_verification',
    })
    await expect(invalidRoleAccount.validate()).rejects.toHaveProperty(
      'errors.roles',
    )

    const emptyRolesAccount = new AccountModel({
      emailNormalized: 'test@example.com',
      roles: [],
      status: 'pending_verification',
    })
    await expect(emptyRolesAccount.validate()).rejects.toHaveProperty(
      'errors.roles',
    )

    const duplicateRolesAccount = new AccountModel({
      emailNormalized: 'test@example.com',
      roles: ['customer', 'customer'],
      status: 'pending_verification',
    })
    await expect(duplicateRolesAccount.validate()).rejects.toHaveProperty(
      'errors.roles',
    )

    const tooManyRolesAccount = new AccountModel({
      emailNormalized: 'test@example.com',
      roles: ['customer', 'stylist', 'owner', 'customer'],
      status: 'pending_verification',
    })
    await expect(tooManyRolesAccount.validate()).rejects.toHaveProperty(
      'errors.roles',
    )
  })

  it('chấp nhận kết hợp 1-3 roles hợp lệ và phân biệt', async () => {
    const singleRole = new AccountModel({
      emailNormalized: 'test@example.com',
      roles: ['customer'],
      status: 'pending_verification',
    })
    await expect(singleRole.validate()).resolves.toBeUndefined()

    const multiRole = new AccountModel({
      emailNormalized: 'owner@example.com',
      roles: ['owner', 'stylist'],
      status: 'pending_verification',
    })
    await expect(multiRole.validate()).resolves.toBeUndefined()
  })

  it('tự động trim và lowercase emailNormalized', () => {
    const account = new AccountModel({
      emailNormalized: '   Customer.One@SolHairStudio.COM   ',
      roles: ['customer'],
      status: 'pending_verification',
    })

    expect(account.emailNormalized).toBe('customer.one@solhairstudio.com')
  })

  it('từ chối emailNormalized vượt quá 254 ký tự', async () => {
    const longLocal = 'a'.repeat(245)
    const account = new AccountModel({
      emailNormalized: `${longLocal}@example.com`,
      roles: ['customer'],
      status: 'pending_verification',
    })

    await expect(account.validate()).rejects.toHaveProperty(
      'errors.emailNormalized',
    )
  })

  it('từ chối authRevision âm, thập phân hoặc vượt số nguyên an toàn', async () => {
    const negativeRevision = new AccountModel({
      emailNormalized: 'rev@example.com',
      roles: ['customer'],
      status: 'pending_verification',
      authRevision: -1,
    })
    await expect(negativeRevision.validate()).rejects.toHaveProperty(
      'errors.authRevision',
    )

    const decimalRevision = new AccountModel({
      emailNormalized: 'rev@example.com',
      roles: ['customer'],
      status: 'pending_verification',
      authRevision: 1.5,
    })
    await expect(decimalRevision.validate()).rejects.toHaveProperty(
      'errors.authRevision',
    )

    const overflowRevision = new AccountModel({
      emailNormalized: 'rev@example.com',
      roles: ['customer'],
      status: 'pending_verification',
      authRevision: Number.MAX_SAFE_INTEGER + 1000,
    })
    await expect(overflowRevision.validate()).rejects.toHaveProperty(
      'errors.authRevision',
    )

    const defaultRevision = new AccountModel({
      emailNormalized: 'rev@example.com',
      roles: ['customer'],
      status: 'pending_verification',
    })
    expect(defaultRevision.authRevision).toBe(0)
    await expect(defaultRevision.validate()).resolves.toBeUndefined()
  })

  it('cấu hình select:false cho passwordHash', () => {
    expect(accountSchema.path('passwordHash').options.select).toBe(false)
  })

  it('cấu hình unique index cho emailNormalized trong schema', () => {
    expect(accountSchema.path('emailNormalized').options.unique).toBe(true)
  })

  it('cho phép account pending_verification bỏ qua toàn bộ các field optional (passwordHash, emailVerifiedAt)', async () => {
    const account = new AccountModel({
      emailNormalized: 'optional@example.com',
      roles: ['customer'],
      status: 'pending_verification',
    })
    expect(account.passwordHash).toBeUndefined()
    expect(account.emailVerifiedAt).toBeUndefined()
    await expect(account.validate()).resolves.toBeUndefined()
  })

  it('từ chối passwordHash có giá trị null', async () => {
    const account = new AccountModel({
      emailNormalized: 'nullhash@example.com',
      roles: ['customer'],
      status: 'pending_verification',
      passwordHash: null,
    })
    await expect(account.validate()).rejects.toHaveProperty('errors.passwordHash')
  })

  it('từ chối emailVerifiedAt có giá trị null', async () => {
    const account = new AccountModel({
      emailNormalized: 'nullverified@example.com',
      roles: ['customer'],
      status: 'pending_verification',
      emailVerifiedAt: null,
    })
    await expect(account.validate()).rejects.toHaveProperty('errors.emailVerifiedAt')
  })
})
