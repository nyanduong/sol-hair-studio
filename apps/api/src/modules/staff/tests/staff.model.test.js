import mongoose from 'mongoose'
import { describe, expect, it } from 'vitest'
import { StaffModel, staffSchema } from '../staff.model.js'

describe('staffSchema and StaffModel', () => {
  it('chấp nhận hồ sơ nhân viên hợp lệ với giá trị mặc định', async () => {
    const staff = new StaffModel({
      accountId: new mongoose.Types.ObjectId(),
      displayName: '  Stylist mẫu An  ',
    })

    expect(staff.displayName).toBe('Stylist mẫu An')
    expect(staff.isActive).toBe(true)
    expect(staff.serviceIds).toEqual([])
    expect(staff.bookingRevision).toBe(0)
    await expect(staff.validate()).resolves.toBeUndefined()
  })

  it('từ chối khi thiếu accountId hoặc accountId là null', async () => {
    const missingAccount = new StaffModel({
      displayName: 'Stylist Test',
    })
    await expect(missingAccount.validate()).rejects.toHaveProperty('errors.accountId')

    const nullAccount = new StaffModel({
      accountId: null,
      displayName: 'Stylist Test',
    })
    await expect(nullAccount.validate()).rejects.toHaveProperty('errors.accountId')
  })

  it('từ chối displayName rỗng, chỉ toàn khoảng trắng hoặc vượt 120 ký tự', async () => {
    const emptyName = new StaffModel({
      accountId: new mongoose.Types.ObjectId(),
      displayName: '   ',
    })
    await expect(emptyName.validate()).rejects.toHaveProperty('errors.displayName')

    const longName = new StaffModel({
      accountId: new mongoose.Types.ObjectId(),
      displayName: 'A'.repeat(121),
    })
    await expect(longName.validate()).rejects.toHaveProperty('errors.displayName')
  })

  it('chấp nhận 0–50 serviceIds duy nhất và từ chối trùng lặp, vượt 50 hoặc phần tử rỗng', async () => {
    const fiftyUnique = Array.from({ length: 50 }, (_, index) => `service-${index + 1}`)
    const validStaff = new StaffModel({
      accountId: new mongoose.Types.ObjectId(),
      displayName: 'Stylist 50 dịch vụ',
      serviceIds: fiftyUnique,
    })
    await expect(validStaff.validate()).resolves.toBeUndefined()

    const duplicateServices = new StaffModel({
      accountId: new mongoose.Types.ObjectId(),
      displayName: 'Stylist trùng dịch vụ',
      serviceIds: ['service-cut-style', 'service-cut-style'],
    })
    await expect(duplicateServices.validate()).rejects.toHaveProperty('errors.serviceIds')

    const tooManyServices = new StaffModel({
      accountId: new mongoose.Types.ObjectId(),
      displayName: 'Stylist quá 50 dịch vụ',
      serviceIds: Array.from({ length: 51 }, (_, index) => `service-${index + 1}`),
    })
    await expect(tooManyServices.validate()).rejects.toHaveProperty('errors.serviceIds')

    const blankServiceId = new StaffModel({
      accountId: new mongoose.Types.ObjectId(),
      displayName: 'Stylist mã rỗng',
      serviceIds: [''],
    })
    await expect(blankServiceId.validate()).rejects.toHaveProperty('errors.serviceIds')
  })

  it('từ chối bookingRevision âm, thập phân hoặc vượt số nguyên an toàn', async () => {
    for (const invalidRevision of [-1, 1.5, Number.MAX_SAFE_INTEGER + 100]) {
      const staff = new StaffModel({
        accountId: new mongoose.Types.ObjectId(),
        displayName: 'Stylist Revision',
        bookingRevision: invalidRevision,
      })
      await expect(staff.validate()).rejects.toHaveProperty('errors.bookingRevision')
    }
  })

  it('cấu hình unique index cho accountId và multikey index cho isActive + serviceIds', () => {
    expect(staffSchema.path('accountId').options.unique).toBe(true)
    const indexes = staffSchema.indexes()
    const capabilityIndex = indexes.find(
      ([fields]) => fields.isActive === 1 && fields.serviceIds === 1,
    )
    expect(capabilityIndex).toBeDefined()
  })
})
