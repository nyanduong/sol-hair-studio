import mongoose from 'mongoose'
import request from 'supertest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.AUTH_SECRET = 'sol-025-test-secret-at-least-32-bytes-long'
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = ''
  process.env.SMTP_PASSWORD = ''
  process.env.MAIL_FROM = 'sol@example.test'
  process.env.NODE_ENV = 'test'
})

import { app } from '../../../app.js'
import { connectToDatabase, disconnectFromDatabase } from '../../../config/database.js'
import { AccountModel } from '../../auth/accounts.model.js'
import { AuthChallengeModel } from '../../auth/auth-challenges.model.js'
import * as authService from '../../auth/auth.service.js'
import { resetMailTransport, setMailTransport } from '../../auth/mailer.js'
import { hashPassword } from '../../auth/password.js'
import { resetRateLimits } from '../../auth/rate-limiter.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { ServiceModel } from '../../services/services.model.js'
import {
  resetAppointmentReader,
  setAppointmentReader,
} from '../appointments.repository.js'
import { StaffModel } from '../staff.model.js'
import { StaffShiftModel } from '../staff-shifts.model.js'

let replica
let mailer
let passwordHash
const password = 'StaffPassword123!'
const bearer = (token) => `Bearer ${token}`

async function loginAccount(emailNormalized) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: emailNormalized, password })
    .expect(200)
  return res.body.data.token
}

async function createOwnerActor(emailNormalized = 'owner@example.test') {
  const account = await AccountModel.create({
    emailNormalized,
    roles: ['owner'],
    status: 'active',
    passwordHash,
    emailVerifiedAt: new Date(),
  })
  const token = await loginAccount(emailNormalized)
  return { account, token }
}

async function createActiveStylistActor({
  emailNormalized = 'stylist1@example.test',
  displayName = 'Stylist Một',
  serviceIds = ['service-cut-style'],
} = {}) {
  const account = await AccountModel.create({
    emailNormalized,
    roles: ['stylist'],
    status: 'active',
    passwordHash,
    emailVerifiedAt: new Date(),
  })
  const staff = await StaffModel.create({
    accountId: account._id,
    displayName,
    isActive: true,
    serviceIds,
  })
  const token = await loginAccount(emailNormalized)
  return { account, staff, token }
}

async function createActiveCustomerActor(emailNormalized = 'customer1@example.test') {
  const account = await AccountModel.create({
    emailNormalized,
    roles: ['customer'],
    status: 'active',
    passwordHash,
    emailVerifiedAt: new Date(),
  })
  const token = await loginAccount(emailNormalized)
  return { account, token }
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: '8.0.17' },
  })
  await connectToDatabase(replica.getUri('sol025_test'))
  for (const model of [
    AccountModel,
    AuthChallengeModel,
    CustomerModel,
    ServiceModel,
    StaffModel,
    StaffShiftModel,
  ]) {
    await model.init()
  }
  passwordHash = await hashPassword(password)
}, 180000)

beforeEach(async () => {
  for (const model of [
    AccountModel,
    AuthChallengeModel,
    CustomerModel,
    ServiceModel,
    StaffModel,
    StaffShiftModel,
  ]) {
    await model.deleteMany({})
  }
  await mongoose.connection.db.collection('appointments').deleteMany({})
  resetAppointmentReader()
  resetRateLimits()

  const sentEmails = []
  mailer = {
    async sendMail(message) {
      sentEmails.push(message)
    },
    getLastEmail: () => sentEmails.at(-1),
    getSentEmails: () => [...sentEmails],
  }
  setMailTransport(mailer)

  await ServiceModel.create([
    {
      id: 'service-cut-style',
      slug: 'cat-tao-kieu',
      name: 'Cắt & tạo kiểu',
      description: 'Cắt và tạo kiểu chuẩn salon',
      category: 'Cắt',
      durationMinutes: { min: 45, max: 60 },
      priceVnd: 450000,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/cut.jpg',
      isActive: true,
      displayOrder: 1,
    },
    {
      id: 'service-hair-spa',
      slug: 'hair-spa-phuc-hoi',
      name: 'Hair spa phục hồi',
      description: 'Phục hồi tóc chuyên sâu',
      category: 'Phục hồi',
      durationMinutes: { min: 60, max: 75 },
      priceVnd: 600000,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/spa.jpg',
      isActive: true,
      displayOrder: 2,
    },
  ])
})

afterAll(async () => {
  resetAppointmentReader()
  resetMailTransport()
  await disconnectFromDatabase()
  await replica?.stop()
})

describe('SOL-025 M3 Staff profiles, capabilities, shifts & appointment protection', { timeout: 30000 }, () => {
  it('owner tạo staff qua createStaffAccount, kích hoạt OTP thật và không lộ trường nhạy cảm', async () => {
    const { token } = await createOwnerActor()
    const createAccountSpy = vi.spyOn(authService, 'createStaffAccount')

    try {
      const response = await request(app)
        .post('/api/staff')
        .set('Authorization', bearer(token))
        .send({
          email: '  NewStylist@Example.Test ',
          displayName: '  Stylist An  ',
          serviceIds: ['service-cut-style', 'service-hair-spa'],
          isActive: true,
          // Các trường giả mạo từ client phải bị loại bỏ qua allowlist
          accountId: new mongoose.Types.ObjectId().toString(),
          bookingRevision: 999,
          roles: ['owner'],
        })
        .expect(201)

      expect(createAccountSpy).toHaveBeenCalledTimes(1)
      const data = response.body.data
      expect(data.displayName).toBe('Stylist An')
      expect(data.isActive).toBe(true)
      expect(data.serviceIds).toEqual(['service-cut-style', 'service-hair-spa'])
      expect(data.bookingRevision).toBe(0)
      expect(data.staffId).toMatch(/^[a-f0-9]{24}$/)
      expect(data.accountId).toMatch(/^[a-f0-9]{24}$/)
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|codeDigest|grantDigest|authRevision/)

      const linkedAccount = await AccountModel.findById(data.accountId).select('+passwordHash')
      expect(linkedAccount.emailNormalized).toBe('newstylist@example.test')
      expect(linkedAccount.roles).toEqual(['stylist'])
      expect(linkedAccount.status).toBe('pending_verification')
      expect(mailer.getSentEmails()).toHaveLength(1)
    } finally {
      createAccountSpy.mockRestore()
    }
  })

  it('kiểm tra phân quyền: chặn không token (401), chặn customer (403), stylist chỉ đọc chính mình và không được sửa', async () => {
    const { token: ownerToken } = await createOwnerActor()
    const stylist1 = await createActiveStylistActor({
      emailNormalized: 'stylist1@example.test',
      displayName: 'Stylist Một',
    })
    const stylist2 = await createActiveStylistActor({
      emailNormalized: 'stylist2@example.test',
      displayName: 'Stylist Hai',
    })
    const customer = await createActiveCustomerActor()

    await StaffShiftModel.create([
      {
        staffId: stylist1.staff._id,
        localDate: '2026-10-05',
        startAt: new Date('2026-10-05T01:00:00.000Z'),
        endAt: new Date('2026-10-05T05:00:00.000Z'),
        status: 'active',
      },
      {
        staffId: stylist2.staff._id,
        localDate: '2026-10-05',
        startAt: new Date('2026-10-05T01:00:00.000Z'),
        endAt: new Date('2026-10-05T05:00:00.000Z'),
        status: 'active',
      },
    ])

    // Không gửi token -> 401
    await request(app).get('/api/staff').expect(401)
    await request(app).post('/api/staff').send({ email: 'a@b.test', displayName: 'A' }).expect(401)
    await request(app).get(`/api/staff/${stylist1.staff._id}/shifts`).expect(401)

    // Customer -> luôn bị 403 trên mọi route staff và shifts
    await request(app).get('/api/staff').set('Authorization', bearer(customer.token)).expect(403)
    await request(app)
      .get(`/api/staff/${stylist1.staff._id}`)
      .set('Authorization', bearer(customer.token))
      .expect(403)
    await request(app)
      .post('/api/staff')
      .set('Authorization', bearer(customer.token))
      .send({ email: 'x@example.test', displayName: 'X' })
      .expect(403)
    await request(app)
      .get(`/api/staff/${stylist1.staff._id}/shifts`)
      .set('Authorization', bearer(customer.token))
      .expect(403)

    // Stylist chỉ đọc được hồ sơ và ca của chính mình
    const stylistList = await request(app)
      .get('/api/staff')
      .set('Authorization', bearer(stylist1.token))
      .expect(200)
    expect(stylistList.body.data).toHaveLength(1)
    expect(stylistList.body.data[0].staffId).toBe(String(stylist1.staff._id))

    await request(app)
      .get(`/api/staff/${stylist1.staff._id}`)
      .set('Authorization', bearer(stylist1.token))
      .expect(200)
    await request(app)
      .get(`/api/staff/${stylist2.staff._id}`)
      .set('Authorization', bearer(stylist1.token))
      .expect(403)

    const ownShifts = await request(app)
      .get(`/api/staff/${stylist1.staff._id}/shifts`)
      .set('Authorization', bearer(stylist1.token))
      .expect(200)
    expect(ownShifts.body.data).toHaveLength(1)

    await request(app)
      .get(`/api/staff/${stylist2.staff._id}/shifts`)
      .set('Authorization', bearer(stylist1.token))
      .expect(403)

    // Stylist không được tạo/sửa staff hay ca
    await request(app)
      .post('/api/staff')
      .set('Authorization', bearer(stylist1.token))
      .send({ email: 'new@example.test', displayName: 'New' })
      .expect(403)
    await request(app)
      .patch(`/api/staff/${stylist1.staff._id}`)
      .set('Authorization', bearer(stylist1.token))
      .send({ displayName: 'Tự đổi tên' })
      .expect(403)
    await request(app)
      .post(`/api/staff/${stylist1.staff._id}/shifts`)
      .set('Authorization', bearer(stylist1.token))
      .send({
        localDate: '2026-10-06',
        startAt: '2026-10-06T01:00:00.000Z',
        endAt: '2026-10-06T05:00:00.000Z',
      })
      .expect(403)

    // Owner xem được toàn bộ
    const ownerList = await request(app)
      .get('/api/staff')
      .set('Authorization', bearer(ownerToken))
      .expect(200)
    expect(ownerList.body.data).toHaveLength(2)
  })

  it('validate đầy đủ dữ liệu tạo/sửa staff, email, displayName, serviceIds và shift time', async () => {
    const { token } = await createOwnerActor()
    const stylist = await createActiveStylistActor()

    // Body không phải JSON object
    await request(app)
      .post('/api/staff')
      .set('Authorization', bearer(token))
      .send(['invalid'])
      .expect(400)

    // Validate create staff
    const invalidStaffPayloads = [
      { email: 'bad-email', displayName: 'Stylist A' },
      { email: 'valid@example.test', displayName: '' },
      { email: 'valid@example.test', displayName: 'A'.repeat(121) },
      { email: 'valid@example.test', displayName: 'Stylist A', isActive: 'yes' },
      { email: 'valid@example.test', displayName: 'Stylist A', serviceIds: 'not-array' },
      {
        email: 'valid@example.test',
        displayName: 'Stylist A',
        serviceIds: ['service-cut-style', 'service-cut-style'],
      },
      {
        email: 'valid@example.test',
        displayName: 'Stylist A',
        serviceIds: ['service-does-not-exist'],
      },
    ]

    for (const payload of invalidStaffPayloads) {
      const res = await request(app)
        .post('/api/staff')
        .set('Authorization', bearer(token))
        .send(payload)
        .expect(400)
      expect(res.body.status).toBe('error')
    }
    // Không tạo account rác khi payload staff không hợp lệ
    expect(await AccountModel.countDocuments({ emailNormalized: 'valid@example.test' })).toBe(0)

    // Validate update staff: ObjectId sai, body rỗng
    await request(app)
      .patch('/api/staff/not-an-object-id')
      .set('Authorization', bearer(token))
      .send({ displayName: 'Tên mới' })
      .expect(400)
    await request(app)
      .patch(`/api/staff/${stylist.staff._id}`)
      .set('Authorization', bearer(token))
      .send({})
      .expect(400)

    // Validate shift time: precision phút, endAt > startAt, qua ngày địa phương, lệch localDate
    const invalidShifts = [
      {
        localDate: '2026-10-05',
        startAt: '2026-10-05T01:00:15.000Z', // có giây lẻ
        endAt: '2026-10-05T05:00:00.000Z',
      },
      {
        localDate: '2026-10-05',
        startAt: '2026-10-05T05:00:00.000Z',
        endAt: '2026-10-05T01:00:00.000Z', // endAt < startAt
      },
      {
        localDate: '2026-10-04', // lệch ngày so với 2026-10-05T01:00:00Z (08:00+07 ngày 05/10)
        startAt: '2026-10-05T01:00:00.000Z',
        endAt: '2026-10-05T05:00:00.000Z',
      },
      {
        localDate: '2026-10-05',
        startAt: '2026-10-05T08:00:00.000Z',
        endAt: '2026-10-05T17:01:00.000Z', // vượt quá biên 00:00 ngày 06/10 theo Asia/Ho_Chi_Minh
      },
    ]

    for (const shiftPayload of invalidShifts) {
      const res = await request(app)
        .post(`/api/staff/${stylist.staff._id}/shifts`)
        .set('Authorization', bearer(token))
        .send(shiftPayload)
        .expect(400)
      expect(res.body.status).toBe('error')
    }

    // Biên phải đúng 00:00 ngày kế tiếp (2026-10-05T17:00:00.000Z) được chấp nhận
    await request(app)
      .post(`/api/staff/${stylist.staff._id}/shifts`)
      .set('Authorization', bearer(token))
      .send({
        localDate: '2026-10-05',
        startAt: '2026-10-05T12:00:00.000Z',
        endAt: '2026-10-05T17:00:00.000Z',
      })
      .expect(201)
  })

  it('quản lý ca: chặn tạo ca chồng, chặn sửa ca thành chồng và cho phép hai ca liền kề [startAt, endAt)', async () => {
    const { token } = await createOwnerActor()
    const stylist = await createActiveStylistActor()
    const staffId = String(stylist.staff._id)

    // Tạo ca 1: 08:00 -> 12:00 (01:00Z -> 05:00Z)
    const shift1Res = await request(app)
      .post(`/api/staff/${staffId}/shifts`)
      .set('Authorization', bearer(token))
      .send({
        localDate: '2026-10-05',
        startAt: '2026-10-05T01:00:00.000Z',
        endAt: '2026-10-05T05:00:00.000Z',
      })
      .expect(201)

    // Tạo ca chồng với ca 1 (11:00 -> 15:00) -> 409 SHIFT_OVERLAP
    const overlapCreate = await request(app)
      .post(`/api/staff/${staffId}/shifts`)
      .set('Authorization', bearer(token))
      .send({
        localDate: '2026-10-05',
        startAt: '2026-10-05T04:00:00.000Z',
        endAt: '2026-10-05T08:00:00.000Z',
      })
      .expect(409)
    expect(overlapCreate.body.code).toBe('SHIFT_OVERLAP')

    // Tạo ca 2 liền kề ca 1: 12:00 -> 17:00 (05:00Z -> 10:00Z) -> Hợp lệ!
    const shift2Res = await request(app)
      .post(`/api/staff/${staffId}/shifts`)
      .set('Authorization', bearer(token))
      .send({
        localDate: '2026-10-05',
        startAt: '2026-10-05T05:00:00.000Z',
        endAt: '2026-10-05T10:00:00.000Z',
      })
      .expect(201)

    // Sửa ca 2 lùi giờ bắt đầu thành 04:30Z để chồng với ca 1 -> 409 SHIFT_OVERLAP
    const overlapUpdate = await request(app)
      .patch(`/api/staff/${staffId}/shifts/${shift2Res.body.data.shiftId}`)
      .set('Authorization', bearer(token))
      .send({
        startAt: '2026-10-05T04:30:00.000Z',
      })
      .expect(409)
    expect(overlapUpdate.body.code).toBe('SHIFT_OVERLAP')

    // Ca 2 trong DB vẫn giữ nguyên startAt = 05:00Z
    const shift2InDb = await StaffShiftModel.findById(shift2Res.body.data.shiftId)
    expect(shift2InDb.startAt.toISOString()).toBe('2026-10-05T05:00:00.000Z')
    expect(shift1Res.body.data.status).toBe('active')
  })

  it('bảo vệ lịch hẹn khi sửa/hủy ca: chặn khi confirmed hoặc in_progress mất coverage, cho phép khi completed/cancelled/no_show', async () => {
    const { token } = await createOwnerActor()
    const stylist = await createActiveStylistActor()
    const staffId = String(stylist.staff._id)

    const createdShift = await request(app)
      .post(`/api/staff/${staffId}/shifts`)
      .set('Authorization', bearer(token))
      .send({
        localDate: '2026-10-05',
        startAt: '2026-10-05T01:00:00.000Z',
        endAt: '2026-10-05T11:00:00.000Z',
      })
      .expect(201)
    const shiftId = createdShift.body.data.shiftId

    const confirmedId = new mongoose.Types.ObjectId()
    const inProgressId = new mongoose.Types.ObjectId()
    const completedId = new mongoose.Types.ObjectId()
    const cancelledId = new mongoose.Types.ObjectId()
    const noShowId = new mongoose.Types.ObjectId()

    await mongoose.connection.db.collection('appointments').insertMany([
      {
        _id: confirmedId,
        staffId: stylist.staff._id,
        customerId: new mongoose.Types.ObjectId(),
        customerSnapshot: { displayName: 'Khách Ẩn', phone: '+84901112222' },
        status: 'confirmed',
        localDate: '2026-10-05',
        startAt: new Date('2026-10-05T02:00:00.000Z'),
        endAt: new Date('2026-10-05T03:00:00.000Z'),
        occupiedFrom: new Date('2026-10-05T02:00:00.000Z'),
        occupiedUntil: new Date('2026-10-05T03:10:00.000Z'),
      },
      {
        _id: inProgressId,
        staffId: stylist.staff._id,
        customerId: new mongoose.Types.ObjectId(),
        customerSnapshot: { displayName: 'Khách Đang Làm', phone: '+84903334444' },
        status: 'in_progress',
        localDate: '2026-10-05',
        startAt: new Date('2026-10-05T04:00:00.000Z'),
        startedAt: new Date('2026-10-05T04:00:00.000Z'),
        endAt: new Date('2026-10-05T05:00:00.000Z'),
        occupiedFrom: new Date('2026-10-05T04:00:00.000Z'),
        occupiedUntil: new Date('2026-10-05T05:10:00.000Z'),
      },
      {
        _id: completedId,
        staffId: stylist.staff._id,
        status: 'completed',
        localDate: '2026-10-05',
        startAt: new Date('2026-10-05T06:00:00.000Z'),
        endAt: new Date('2026-10-05T07:00:00.000Z'),
        occupiedFrom: new Date('2026-10-05T06:00:00.000Z'),
        occupiedUntil: new Date('2026-10-05T07:10:00.000Z'),
      },
      {
        _id: cancelledId,
        staffId: stylist.staff._id,
        status: 'cancelled',
        localDate: '2026-10-05',
        startAt: new Date('2026-10-05T07:30:00.000Z'),
        endAt: new Date('2026-10-05T08:30:00.000Z'),
        occupiedFrom: new Date('2026-10-05T07:30:00.000Z'),
        occupiedUntil: new Date('2026-10-05T08:40:00.000Z'),
      },
      {
        _id: noShowId,
        staffId: stylist.staff._id,
        status: 'no_show',
        localDate: '2026-10-05',
        startAt: new Date('2026-10-05T09:00:00.000Z'),
        endAt: new Date('2026-10-05T10:00:00.000Z'),
        occupiedFrom: new Date('2026-10-05T09:00:00.000Z'),
        occupiedUntil: new Date('2026-10-05T10:10:00.000Z'),
      },
    ])

    // Hủy ca khi đang có confirmed + in_progress -> 409 APPOINTMENT_CONFLICT và không lưu
    const cancelConflict = await request(app)
      .delete(`/api/staff/${staffId}/shifts/${shiftId}`)
      .set('Authorization', bearer(token))
      .expect(409)
    expect(cancelConflict.body.code).toBe('APPOINTMENT_CONFLICT')
    expect(cancelConflict.body.conflicts).toHaveLength(2)
    expect(cancelConflict.body.conflicts.map((c) => c.appointmentId)).toEqual([
      String(confirmedId),
      String(inProgressId),
    ])
    // Không làm lộ thông tin nhạy cảm của khách trong danh sách conflict
    expect(JSON.stringify(cancelConflict.body)).not.toMatch(/customerSnapshot|phone|\+8490/)

    // Ca vẫn active trong DB
    expect((await StaffShiftModel.findById(shiftId)).status).toBe('active')

    // Thu hẹp ca thành [01:00Z, 04:30Z) làm lịch in_progress (occupiedUntil 05:10Z) mất coverage -> 409
    const shrinkConflict = await request(app)
      .patch(`/api/staff/${staffId}/shifts/${shiftId}`)
      .set('Authorization', bearer(token))
      .send({ endAt: '2026-10-05T04:30:00.000Z' })
      .expect(409)
    expect(shrinkConflict.body.code).toBe('APPOINTMENT_CONFLICT')
    expect(shrinkConflict.body.conflicts).toHaveLength(1)
    expect(shrinkConflict.body.conflicts[0].appointmentId).toBe(String(inProgressId))

    // Thu hẹp ca thành [01:30Z, 05:30Z): vẫn bao phủ đủ confirmed + in_progress (dù cắt qua completed/cancelled/no_show) -> 200 OK!
    const validShrink = await request(app)
      .patch(`/api/staff/${staffId}/shifts/${shiftId}`)
      .set('Authorization', bearer(token))
      .send({
        startAt: '2026-10-05T01:30:00.000Z',
        endAt: '2026-10-05T05:30:00.000Z',
      })
      .expect(200)
    expect(validShrink.body.data.endAt).toBe('2026-10-05T05:30:00.000Z')

    // Sau khi chủ xử lý xong 2 lịch hiệu lực (chuyển sang completed/cancelled), được phép hủy ca và giữ lịch sử document
    await mongoose.connection.db
      .collection('appointments')
      .updateMany(
        { _id: { $in: [confirmedId, inProgressId] } },
        { $set: { status: 'completed' } },
      )

    const cancelledRes = await request(app)
      .delete(`/api/staff/${staffId}/shifts/${shiftId}`)
      .set('Authorization', bearer(token))
      .expect(200)
    expect(cancelledRes.body.data.status).toBe('cancelled')

    const persistedShift = await StaffShiftModel.findById(shiftId)
    expect(persistedShift).not.toBeNull()
    expect(persistedShift.status).toBe('cancelled')
  })

  it('chặn ngừng nhân viên (isActive=false) khi còn lịch chưa kết thúc nhưng cho phép bỏ serviceIds dù còn lịch cũ', async () => {
    const { token } = await createOwnerActor()
    const stylist = await createActiveStylistActor({
      serviceIds: ['service-cut-style', 'service-hair-spa'],
    })
    const staffId = String(stylist.staff._id)
    const initialRevision = stylist.staff.bookingRevision

    const activeApptId = new mongoose.Types.ObjectId()
    setAppointmentReader(async () => [
      {
        _id: activeApptId,
        staffId,
        status: 'confirmed',
        localDate: '2026-10-06',
        startAt: new Date('2026-10-06T02:00:00.000Z'),
        endAt: new Date('2026-10-06T03:00:00.000Z'),
        occupiedFrom: new Date('2026-10-06T02:00:00.000Z'),
        occupiedUntil: new Date('2026-10-06T03:10:00.000Z'),
      },
    ])

    // 1. Ngừng nhân viên khi còn lịch confirmed -> bị chặn 409, staff vẫn active và bookingRevision rollback
    const deactivateBlocked = await request(app)
      .patch(`/api/staff/${staffId}`)
      .set('Authorization', bearer(token))
      .send({ isActive: false })
      .expect(409)
    expect(deactivateBlocked.body.code).toBe('APPOINTMENT_CONFLICT')
    expect(deactivateBlocked.body.conflicts).toHaveLength(1)
    expect(deactivateBlocked.body.conflicts[0].appointmentId).toBe(String(activeApptId))

    const staffAfterBlocked = await StaffModel.findById(staffId)
    expect(staffAfterBlocked.isActive).toBe(true)
    expect(staffAfterBlocked.bookingRevision).toBe(initialRevision)

    // 2. Bỏ serviceId của nhân viên vẫn được phép dù đang có lịch confirmed
    const removeServiceRes = await request(app)
      .patch(`/api/staff/${staffId}`)
      .set('Authorization', bearer(token))
      .send({ serviceIds: [] })
      .expect(200)
    expect(removeServiceRes.body.data.serviceIds).toEqual([])
    expect(removeServiceRes.body.data.bookingRevision).toBe(initialRevision + 1)

    // 3. Khi không còn lịch confirmed/in_progress (chỉ còn completed/cancelled/no_show), ngừng nhân viên thành công
    setAppointmentReader(async () => [
      {
        _id: activeApptId,
        staffId,
        status: 'completed',
        localDate: '2026-10-06',
        startAt: new Date('2026-10-06T02:00:00.000Z'),
        endAt: new Date('2026-10-06T03:00:00.000Z'),
      },
    ])

    const deactivateOk = await request(app)
      .patch(`/api/staff/${staffId}`)
      .set('Authorization', bearer(token))
      .send({ isActive: false })
      .expect(200)
    expect(deactivateOk.body.data.isActive).toBe(false)
    expect(deactivateOk.body.data.bookingRevision).toBe(initialRevision + 2)
  })

  it('xử lý nhất quán các lỗi guard/concurrency (MAX_SAFE_INTEGER, conflict) bằng phản hồi JSON chuẩn', async () => {
    const { token } = await createOwnerActor()
    const stylist = await createActiveStylistActor()
    const staffId = String(stylist.staff._id)

    await StaffModel.updateOne(
      { _id: staffId },
      { $set: { bookingRevision: Number.MAX_SAFE_INTEGER } },
    )

    const maxRevResponse = await request(app)
      .post(`/api/staff/${staffId}/shifts`)
      .set('Authorization', bearer(token))
      .send({
        localDate: '2026-10-07',
        startAt: '2026-10-07T01:00:00.000Z',
        endAt: '2026-10-07T05:00:00.000Z',
      })
      .expect(409)

    expect(maxRevResponse.body).toEqual({
      status: 'error',
      code: 'BOOKING_REVISION_LIMIT',
      message: expect.any(String),
    })

    // Kiểm tra 404 khi staffId hoặc shiftId không tồn tại
    const missingId = new mongoose.Types.ObjectId().toString()
    const notFoundStaff = await request(app)
      .get(`/api/staff/${missingId}`)
      .set('Authorization', bearer(token))
      .expect(404)
    expect(notFoundStaff.body.code).toBe('STAFF_NOT_FOUND')

    await StaffModel.updateOne({ _id: staffId }, { $set: { bookingRevision: 0 } })
    const notFoundShift = await request(app)
      .patch(`/api/staff/${staffId}/shifts/${missingId}`)
      .set('Authorization', bearer(token))
      .send({ status: 'cancelled' })
      .expect(404)
    expect(notFoundShift.body.code).toBe('SHIFT_NOT_FOUND')
  })
})
