import mongoose from 'mongoose'
import { describe, expect, it } from 'vitest'
import { StaffShiftModel, staffShiftSchema } from '../staff-shifts.model.js'

describe('staffShiftSchema and StaffShiftModel', () => {
  it('chấp nhận ca làm việc hợp lệ theo ngày Asia/Ho_Chi_Minh và cả ca chạm biên phải 00:00 ngày sau', async () => {
    const regularShift = new StaffShiftModel({
      staffId: new mongoose.Types.ObjectId(),
      localDate: '2026-10-05',
      startAt: new Date('2026-10-05T01:00:00.000Z'), // 08:00+07:00
      endAt: new Date('2026-10-05T11:00:00.000Z'), // 18:00+07:00
      status: 'active',
    })
    await expect(regularShift.validate()).resolves.toBeUndefined()

    // Biên phải đúng 00:00 ngày kế tiếp theo Asia/Ho_Chi_Minh (2026-10-05T17:00:00.000Z = 2026-10-06T00:00:00+07:00)
    const midnightBoundaryShift = new StaffShiftModel({
      staffId: new mongoose.Types.ObjectId(),
      localDate: '2026-10-05',
      startAt: new Date('2026-10-05T08:00:00.000Z'),
      endAt: new Date('2026-10-05T17:00:00.000Z'),
      status: 'active',
    })
    await expect(midnightBoundaryShift.validate()).resolves.toBeUndefined()
  })

  it('từ chối ca có giây hoặc mili-giây khác 0 (không đúng precision phút)', async () => {
    const startWithSeconds = new StaffShiftModel({
      staffId: new mongoose.Types.ObjectId(),
      localDate: '2026-10-05',
      startAt: new Date('2026-10-05T01:00:30.000Z'),
      endAt: new Date('2026-10-05T11:00:00.000Z'),
    })
    await expect(startWithSeconds.validate()).rejects.toHaveProperty('errors.startAt')

    const endWithMillis = new StaffShiftModel({
      staffId: new mongoose.Types.ObjectId(),
      localDate: '2026-10-05',
      startAt: new Date('2026-10-05T01:00:00.000Z'),
      endAt: new Date('2026-10-05T11:00:00.500Z'),
    })
    await expect(endWithMillis.validate()).rejects.toHaveProperty('errors.endAt')
  })

  it('từ chối khi endAt <= startAt hoặc vượt qua 00:00 ngày địa phương kế tiếp', async () => {
    const equalTimes = new StaffShiftModel({
      staffId: new mongoose.Types.ObjectId(),
      localDate: '2026-10-05',
      startAt: new Date('2026-10-05T01:00:00.000Z'),
      endAt: new Date('2026-10-05T01:00:00.000Z'),
    })
    await expect(equalTimes.validate()).rejects.toHaveProperty('errors.endAt')

    const crossDayPastMidnight = new StaffShiftModel({
      staffId: new mongoose.Types.ObjectId(),
      localDate: '2026-10-05',
      startAt: new Date('2026-10-05T08:00:00.000Z'),
      endAt: new Date('2026-10-05T17:01:00.000Z'), // 00:01+07:00 ngày 2026-10-06
    })
    await expect(crossDayPastMidnight.validate()).rejects.toHaveProperty('errors.endAt')
  })

  it('từ chối khi localDate sai định dạng hoặc lệch ngày startAt theo Asia/Ho_Chi_Minh', async () => {
    const wrongFormat = new StaffShiftModel({
      staffId: new mongoose.Types.ObjectId(),
      localDate: '05-10-2026',
      startAt: new Date('2026-10-05T01:00:00.000Z'),
      endAt: new Date('2026-10-05T11:00:00.000Z'),
    })
    await expect(wrongFormat.validate()).rejects.toHaveProperty('errors.localDate')

    // 2026-10-04T18:00:00.000Z là 01:00 sáng ngày 2026-10-05 theo giờ Việt Nam (UTC+7)
    const mismatchedLocalDate = new StaffShiftModel({
      staffId: new mongoose.Types.ObjectId(),
      localDate: '2026-10-04',
      startAt: new Date('2026-10-04T18:00:00.000Z'),
      endAt: new Date('2026-10-05T02:00:00.000Z'),
    })
    await expect(mismatchedLocalDate.validate()).rejects.toHaveProperty('errors.localDate')
  })

  it('chỉ chấp nhận status active hoặc cancelled và khai báo index tra cứu ca', async () => {
    const cancelledShift = new StaffShiftModel({
      staffId: new mongoose.Types.ObjectId(),
      localDate: '2026-10-05',
      startAt: new Date('2026-10-05T01:00:00.000Z'),
      endAt: new Date('2026-10-05T11:00:00.000Z'),
      status: 'cancelled',
    })
    await expect(cancelledShift.validate()).resolves.toBeUndefined()

    const invalidStatus = new StaffShiftModel({
      staffId: new mongoose.Types.ObjectId(),
      localDate: '2026-10-05',
      startAt: new Date('2026-10-05T01:00:00.000Z'),
      endAt: new Date('2026-10-05T11:00:00.000Z'),
      status: 'deleted',
    })
    await expect(invalidStatus.validate()).rejects.toHaveProperty('errors.status')

    const indexes = staffShiftSchema.indexes()
    const shiftIndex = indexes.find(
      ([fields]) => fields.staffId === 1 && fields.status === 1 && fields.startAt === 1,
    )
    expect(shiftIndex).toBeDefined()
  })
})
