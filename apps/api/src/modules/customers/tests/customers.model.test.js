import mongoose from 'mongoose'
import { describe, expect, it } from 'vitest'
import { CustomerModel, customerSchema } from '../customers.model.js'

describe('customerSchema and CustomerModel', () => {
  it('cho phép khách vãng lai không có accountId và phone', async () => {
    const customer = new CustomerModel({
      displayName: 'Khách Vãng Lai',
    })

    expect(customer.accountId).toBeUndefined()
    expect(customer.phone).toBeUndefined()
    await expect(customer.validate()).resolves.toBeUndefined()
  })

  it('chấp nhận hồ sơ khách có đầy đủ accountId và phone chuẩn E.164', async () => {
    const customer = new CustomerModel({
      accountId: new mongoose.Types.ObjectId(),
      displayName: 'Nguyễn Văn A',
      phone: '+84901234567',
    })

    await expect(customer.validate()).resolves.toBeUndefined()
  })

  it('từ chối hồ sơ khách khi accountId là null', async () => {
    const customer = new CustomerModel({
      displayName: 'Khách Test',
      accountId: null,
    })

    await expect(customer.validate()).rejects.toHaveProperty('errors.accountId')
  })

  it('từ chối hồ sơ khách khi phone là null', async () => {
    const customer = new CustomerModel({
      displayName: 'Khách Test',
      phone: null,
    })

    await expect(customer.validate()).rejects.toHaveProperty('errors.phone')
  })

  it('từ chối hồ sơ khách khi thiếu displayName', async () => {
    const customer = new CustomerModel({
      phone: '+84901234567',
    })

    await expect(customer.validate()).rejects.toHaveProperty('errors.displayName')
  })

  it('từ chối số điện thoại không theo chuẩn E.164', async () => {
    const localPhoneCustomer = new CustomerModel({
      displayName: 'Khách Test',
      phone: '0901234567',
    })
    await expect(localPhoneCustomer.validate()).rejects.toHaveProperty('errors.phone')

    const invalidCharCustomer = new CustomerModel({
      displayName: 'Khách Test',
      phone: '+84-90-123-4567',
    })
    await expect(invalidCharCustomer.validate()).rejects.toHaveProperty('errors.phone')
  })

  it('từ chối bookingRevision âm, thập phân hoặc vượt số nguyên an toàn', async () => {
    const negative = new CustomerModel({
      displayName: 'Khách Test',
      bookingRevision: -1,
    })
    await expect(negative.validate()).rejects.toHaveProperty('errors.bookingRevision')

    const decimal = new CustomerModel({
      displayName: 'Khách Test',
      bookingRevision: 2.5,
    })
    await expect(decimal.validate()).rejects.toHaveProperty('errors.bookingRevision')

    const overflow = new CustomerModel({
      displayName: 'Khách Test',
      bookingRevision: Number.MAX_SAFE_INTEGER + 1000,
    })
    await expect(overflow.validate()).rejects.toHaveProperty('errors.bookingRevision')

    const defaultCustomer = new CustomerModel({
      displayName: 'Khách Mặc Định',
    })
    expect(defaultCustomer.bookingRevision).toBe(0)
    await expect(defaultCustomer.validate()).resolves.toBeUndefined()
  })

  it('cấu hình partial unique index cho accountId và index cho phone', () => {
    const indexes = customerSchema.indexes()
    const accountIndex = indexes.find(([fields]) => fields.accountId === 1)
    expect(accountIndex).toBeDefined()
    expect(accountIndex[1].unique).toBe(true)
    expect(accountIndex[1].partialFilterExpression).toEqual({
      accountId: { $type: 'objectId' },
    })

    const phoneIndex = indexes.find(
      ([fields]) => fields.phone === 1 && fields._id === 1,
    )
    expect(phoneIndex).toBeDefined()
    expect(phoneIndex[1].unique).toBeUndefined()
  })
})
