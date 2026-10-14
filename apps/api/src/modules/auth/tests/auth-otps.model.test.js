import mongoose from 'mongoose'
import { describe, expect, it } from 'vitest'
import {
  AuthOtpModel,
  authOtpSchema,
} from '../auth-otps.model.js'

describe('authOtpSchema and AuthOtpModel', () => {
  const validChallengeData = () => ({
    accountId: new mongoose.Types.ObjectId(),
    purpose: 'activate_customer',
    generation: 1,
    codeDigest: 'a'.repeat(64),
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    resendAvailableAt: new Date(Date.now() + 60 * 1000),
    failedAttempts: 0,
  })

  it('chấp nhận document auth_challenge hợp lệ', async () => {
    const doc = new AuthOtpModel(validChallengeData())
    await expect(doc.validate()).resolves.toBeUndefined()
  })

  it('chấp nhận các purpose hợp lệ và từ chối purpose lạ', async () => {
    for (const purpose of ['activate_customer', 'activate_staff', 'reset_password']) {
      const doc = new AuthOtpModel({
        ...validChallengeData(),
        purpose,
      })
      await expect(doc.validate()).resolves.toBeUndefined()
    }

    const invalidDoc = new AuthOtpModel({
      ...validChallengeData(),
      purpose: 'invalid_purpose',
    })
    await expect(invalidDoc.validate()).rejects.toHaveProperty('errors.purpose')
  })

  it('từ chối generation < 1 hoặc thập phân', async () => {
    const zeroGen = new AuthOtpModel({
      ...validChallengeData(),
      generation: 0,
    })
    await expect(zeroGen.validate()).rejects.toHaveProperty('errors.generation')

    const decimalGen = new AuthOtpModel({
      ...validChallengeData(),
      generation: 1.5,
    })
    await expect(decimalGen.validate()).rejects.toHaveProperty('errors.generation')
  })

  it('từ chối failedAttempts âm, lớn hơn 5 hoặc thập phân', async () => {
    const negative = new AuthOtpModel({
      ...validChallengeData(),
      failedAttempts: -1,
    })
    await expect(negative.validate()).rejects.toHaveProperty('errors.failedAttempts')

    const overLimit = new AuthOtpModel({
      ...validChallengeData(),
      failedAttempts: 6,
    })
    await expect(overLimit.validate()).rejects.toHaveProperty('errors.failedAttempts')

    const decimal = new AuthOtpModel({
      ...validChallengeData(),
      failedAttempts: 2.5,
    })
    await expect(decimal.validate()).rejects.toHaveProperty('errors.failedAttempts')

    const validLimit = new AuthOtpModel({
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
      const docWithNull = new AuthOtpModel({
        ...validChallengeData(),
        [field]: null,
      })
      await expect(docWithNull.validate()).rejects.toHaveProperty(`errors.${field}`)
    }

    const docWithoutOptional = new AuthOtpModel(validChallengeData())
    for (const field of optionalFields) {
      expect(docWithoutOptional[field]).toBeUndefined()
    }
    await expect(docWithoutOptional.validate()).resolves.toBeUndefined()
  })

  it('cấu hình unique compound index (accountId, purpose) và không có TTL', () => {
    const indexes = authOtpSchema.indexes()
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
})
