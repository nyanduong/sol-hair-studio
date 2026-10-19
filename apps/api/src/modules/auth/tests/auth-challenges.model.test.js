import mongoose from 'mongoose'
import { describe, expect, it } from 'vitest'
import {
  AuthChallengeModel,
  authChallengeSchema,
} from '../auth-challenges.model.js'

describe('authChallengeSchema and AuthChallengeModel', () => {
  const validChallengeData = () => {
    const issuedAt = new Date()
    return {
      accountId: new mongoose.Types.ObjectId(), purpose: 'activate_customer', generation: 1,
      codeDigest: 'a'.repeat(64), issuedAt,
      expiresAt: new Date(+issuedAt + 300000), resendAvailableAt: new Date(+issuedAt + 60000),
      failedAttempts: 0,
    }
  }

  it('chấp nhận document auth_challenge hợp lệ', async () => {
    const doc = new AuthChallengeModel(validChallengeData())
    await expect(doc.validate()).resolves.toBeUndefined()
  })

  it('chấp nhận các purpose hợp lệ và từ chối purpose lạ', async () => {
    for (const purpose of ['activate_customer', 'activate_staff', 'reset_password']) {
      const doc = new AuthChallengeModel({
        ...validChallengeData(),
        purpose,
      })
      await expect(doc.validate()).resolves.toBeUndefined()
    }

    const invalidDoc = new AuthChallengeModel({
      ...validChallengeData(),
      purpose: 'invalid_purpose',
    })
    await expect(invalidDoc.validate()).rejects.toHaveProperty('errors.purpose')
  })

  it('từ chối generation < 1 hoặc thập phân', async () => {
    const zeroGen = new AuthChallengeModel({
      ...validChallengeData(),
      generation: 0,
    })
    await expect(zeroGen.validate()).rejects.toHaveProperty('errors.generation')

    const decimalGen = new AuthChallengeModel({
      ...validChallengeData(),
      generation: 1.5,
    })
    await expect(decimalGen.validate()).rejects.toHaveProperty('errors.generation')
  })

  it('từ chối failedAttempts âm, lớn hơn 5 hoặc thập phân', async () => {
    const negative = new AuthChallengeModel({
      ...validChallengeData(),
      failedAttempts: -1,
    })
    await expect(negative.validate()).rejects.toHaveProperty('errors.failedAttempts')

    const overLimit = new AuthChallengeModel({
      ...validChallengeData(),
      failedAttempts: 6,
    })
    await expect(overLimit.validate()).rejects.toHaveProperty('errors.failedAttempts')

    const decimal = new AuthChallengeModel({
      ...validChallengeData(),
      failedAttempts: 2.5,
    })
    await expect(decimal.validate()).rejects.toHaveProperty('errors.failedAttempts')

    const validLimit = new AuthChallengeModel({
      ...validChallengeData(),
      failedAttempts: 5,
    })
    await expect(validLimit.validate()).resolves.toBeUndefined()
  })

  it('cho phép thiếu các field optional nhưng từ chối null', async () => {
    const optionalFields = [
      'consumedAt',
      'verifiedAt',
      'grantDigest',
      'grantExpiresAt',
      'grantConsumedAt',
    ]

    for (const field of optionalFields) {
      const docWithNull = new AuthChallengeModel({
        ...validChallengeData(),
        [field]: null,
      })
      await expect(docWithNull.validate()).rejects.toHaveProperty(`errors.${field}`)
    }

    const docWithoutOptional = new AuthChallengeModel(validChallengeData())
    for (const field of optionalFields) {
      expect(docWithoutOptional[field]).toBeUndefined()
    }
    await expect(docWithoutOptional.validate()).resolves.toBeUndefined()
  })

  it('cấu hình unique compound index (accountId, purpose) và không có TTL', () => {
    const indexes = authChallengeSchema.indexes()
    const compoundIndex = indexes.find(
      ([fields]) => fields.accountId === 1 && fields.purpose === 1,
    )
    expect(compoundIndex).toBeDefined()
    expect(compoundIndex[1].unique).toBe(true)

    // Đảm bảo không có index nào có expireAfterSeconds (không TTL)
    for (const [, options] of indexes) {
      expect(options.expireAfterSeconds).toBeUndefined()
    }
  })

  it('rejects an incorrect five-minute expiry or sixty-second cooldown', async () => {
    for (const field of ['expiresAt', 'resendAvailableAt']) {
      const data = validChallengeData()
      data[field] = new Date(+data.issuedAt + 1000)
      await expect(new AuthChallengeModel(data).validate()).rejects.toHaveProperty(`errors.${field}`)
    }
  })

  it('requires verification and consumption together, before expiry and before attempt exhaustion', async () => {
    const data = validChallengeData()
    const within = new Date(+data.issuedAt + 1000)
    for (const change of [
      { consumedAt: within }, { verifiedAt: within },
      { verifiedAt: data.expiresAt, consumedAt: data.expiresAt },
      { verifiedAt: within, consumedAt: within, failedAttempts: 5 },
    ]) await expect(new AuthChallengeModel({ ...data, ...change }).validate()).rejects.toBeDefined()
    await expect(new AuthChallengeModel({ ...data, verifiedAt: within, consumedAt: within }).validate()).resolves.toBeUndefined()
  })

  it('bounds password proofs to the verified staff/reset purpose and OTP lifetime', async () => {
    const data = validChallengeData()
    const verifiedAt = new Date(+data.issuedAt + 1000)
    const proof = { ...data, purpose: 'activate_staff', verifiedAt, consumedAt: verifiedAt,
      grantDigest: 'b'.repeat(64), grantExpiresAt: data.expiresAt }
    await expect(new AuthChallengeModel(proof).validate()).resolves.toBeUndefined()
    for (const change of [
      { purpose: 'activate_customer' }, { grantExpiresAt: undefined },
      { grantExpiresAt: new Date(+data.expiresAt + 1) },
      { grantConsumedAt: data.expiresAt }, { grantConsumedAt: data.issuedAt },
    ]) await expect(new AuthChallengeModel({ ...proof, ...change }).validate()).rejects.toBeDefined()
    expect(authChallengeSchema.path('codeDigest').options.select).toBe(false)
    expect(authChallengeSchema.path('grantDigest').options.select).toBe(false)
    expect(authChallengeSchema.options.collection).toBe('auth_challenges')
    expect(authChallengeSchema.options.versionKey).toBe(false)
  })
})
