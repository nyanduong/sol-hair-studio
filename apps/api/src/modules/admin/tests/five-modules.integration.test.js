import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'
  process.env.AUTH_SECRET = 'sol024-five-modules-regression-secret-32b'
})

import { app } from '../../../app.js'
import { connectToDatabase, disconnectFromDatabase } from '../../../config/database.js'
import { AccountModel } from '../../auth/accounts.model.js'
import { hashPassword } from '../../auth/password.js'
import { resetRateLimits } from '../../auth/rate-limiter.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { ServiceModel } from '../../services/services.model.js'
import { ImageModel } from '../../services/images.model.js'
import { StaffModel } from '../../staff/staff.model.js'
import { StaffShiftModel, toHoChiMinhDate } from '../../staff/staff-shifts.model.js'
import { AppointmentModel } from '../../appointments/appointments.model.js'
import { AppointmentEventModel } from '../../appointments/appointment-events.model.js'
import { BookingRequestModel } from '../../appointments/booking-requests.model.js'
import { prepareBookingStorage } from '../../appointments/booking.repository.js'

let replica
let server
let baseUrl
let tokens = {}

const FIXTURE_PASSWORD = 'test_password_fixture'
const NOW = new Date('2026-10-25T08:00:00.000Z')

async function createAccount({ email, role, displayName, phone = '+84901234567' }) {
  const passwordHash = await hashPassword(FIXTURE_PASSWORD)
  const account = await AccountModel.create({
    emailNormalized: email.toLowerCase().trim(),
    passwordHash,
    roles: [role],
    status: 'active',
    emailVerifiedAt: NOW,
  })

  let profile = null
  if (role === 'customer') {
    profile = await CustomerModel.create({
      accountId: account._id,
      displayName: displayName || 'Khách hàng Test',
      phone,
    })
  } else if (role === 'stylist') {
    profile = await StaffModel.create({
      accountId: account._id,
      displayName: displayName || 'Stylist Test',
      serviceIds: ['service-cat-toc-vip', 'service-uon-toc-vip'],
      isActive: true,
    })
  }

  return { account, profile }
}

async function loginAs(email) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: FIXTURE_PASSWORD }),
  })
  expect(res.status).toBe(200)
  const json = await res.json()
  return json.data.token
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: '8.0.17' },
  })
  await connectToDatabase(replica.getUri('sol024_five_modules_regression'))
  await prepareBookingStorage()

  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
}, 180000)

beforeEach(async () => {
  resetRateLimits()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)

  await ServiceModel.deleteMany({})
  await ImageModel.deleteMany({})
  await AccountModel.deleteMany({})
  await CustomerModel.deleteMany({})
  await StaffModel.deleteMany({})
  await StaffShiftModel.deleteMany({})
  await AppointmentModel.deleteMany({})
  await AppointmentEventModel.deleteMany({})
  await BookingRequestModel.deleteMany({})

  // 1. Seed Owner
  await createAccount({ email: 'owner-sol024@solhair.test', role: 'owner', displayName: 'Chủ Tiệm Sol' })
  // 2. Seed Stylist
  await createAccount({ email: 'stylist-sol024@solhair.test', role: 'stylist', displayName: 'Stylist Hoàng' })
  // 3. Seed Customer 1
  await createAccount({ email: 'cust1-sol024@solhair.test', role: 'customer', displayName: 'Nguyễn Văn A' })
  // 4. Seed Customer 2
  await createAccount({ email: 'cust2-sol024@solhair.test', role: 'customer', displayName: 'Trần Thị B' })

  tokens = {
    owner: await loginAs('owner-sol024@solhair.test'),
    stylist: await loginAs('stylist-sol024@solhair.test'),
    cust1: await loginAs('cust1-sol024@solhair.test'),
    cust2: await loginAs('cust2-sol024@solhair.test'),
  }
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  await disconnectFromDatabase()
  if (replica) await replica.stop()
})

describe('SOL-024: Kiểm thử tích hợp và hồi quy 5 module (Cross-Module E2E Regression)', () => {
  it('M1, M2 & M3: Phân quyền RBAC, kiểm tra DTO danh mục 8 trường và phân bổ ca nhân sự', async () => {
    // [M2] Tạo dịch vụ mới
    await ServiceModel.create({
      id: 'service-cat-toc-vip',
      slug: 'cat-toc-vip',
      name: 'Cắt tóc tạo kiểu VIP',
      description: 'Cắt tóc và gội dưỡng sinh organic.',
      category: 'Cắt & Tạo kiểu',
      durationMinutes: { min: 30, max: 45 },
      bookingDurationMinutes: 45,
      priceVnd: 250000,
      imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/cat-toc.jpg',
      isActive: true,
      displayOrder: 1,
    })

    // [M2] Khách hàng đọc danh mục qua GET /api/services -> Chỉ nhận đúng 8 trường allowlist
    const catRes = await fetch(`${baseUrl}/api/services`)
    expect(catRes.status).toBe(200)
    const catData = await catRes.json()
    expect(Array.isArray(catData.data)).toBe(true)
    const serviceItem = catData.data.find((s) => s.id === 'service-cat-toc-vip')
    expect(serviceItem).toBeDefined()
    expect(Object.keys(serviceItem).sort()).toEqual([
      'category',
      'description',
      'durationMinutes',
      'id',
      'imageUrl',
      'name',
      'priceVnd',
      'slug',
    ])
    // Không rò rỉ các trường nội bộ
    expect(serviceItem.isActive).toBeUndefined()
    expect(serviceItem.displayOrder).toBeUndefined()
    expect(serviceItem.createdAt).toBeUndefined()

    // [M3] Phân bổ ca làm việc cho stylist qua API
    const staff = await StaffModel.findOne({ displayName: 'Stylist Hoàng' })
    const todayStr = toHoChiMinhDate(NOW)
    const shiftRes = await fetch(`${baseUrl}/api/staff/${staff._id}/shifts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.owner}`,
      },
      body: JSON.stringify({
        localDate: todayStr,
        startAt: new Date(`${todayStr}T08:00:00+07:00`).toISOString(),
        endAt: new Date(`${todayStr}T12:00:00+07:00`).toISOString(),
      }),
    })
    expect(shiftRes.status).toBe(201)

    // [M3] Chặn tạo ca trùng lặp/chồng chéo cho cùng stylist (kỳ vọng 409 SHIFT_OVERLAP)
    const overlapRes = await fetch(`${baseUrl}/api/staff/${staff._id}/shifts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.owner}`,
      },
      body: JSON.stringify({
        localDate: todayStr,
        startAt: new Date(`${todayStr}T10:00:00+07:00`).toISOString(),
        endAt: new Date(`${todayStr}T14:00:00+07:00`).toISOString(),
      }),
    })
    expect(overlapRes.status).toBe(409)

    // [M1] Kiểm tra phân quyền RBAC: Customer không thể truy cập các route quản lý chủ tiệm (/api/customers)
    const unauthorizedRes = await fetch(`${baseUrl}/api/customers`, {
      headers: { Authorization: `Bearer ${tokens.cust1}` },
    })
    expect(unauthorizedRes.status).toBe(403)
  })

  it('M4 & M5: Luồng khép kín từ Đặt lịch -> Bắt đầu -> ETA -> Hoàn thành và ghi nhận Audit Event', async () => {
    // 1. Chuẩn bị Service & Shift
    const service = await ServiceModel.create({
      id: 'service-uon-toc-vip',
      slug: 'uon-toc-vip',
      name: 'Uốn tóc phục hồi Collagen',
      description: 'Giữ nếp lơi bồng bềnh.',
      category: 'Uốn & Nhuộm',
      durationMinutes: { min: 60, max: 60 },
      bookingDurationMinutes: 60,
      priceVnd: 500000,
      imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/uon-toc.jpg',
      isActive: true,
      displayOrder: 1,
    })

    const staff = await StaffModel.findOne({ displayName: 'Stylist Hoàng' })
    const todayStr = toHoChiMinhDate(NOW)
    await StaffShiftModel.create({
      staffId: staff._id,
      localDate: todayStr,
      startAt: new Date(`${todayStr}T08:00:00+07:00`),
      endAt: new Date(`${todayStr}T18:00:00+07:00`),
    })

    // 2. [M4] Khách hàng kiểm tra lịch trống (Availability)
    const availRes = await fetch(
      `${baseUrl}/api/availability?serviceIds=${service.id}&localDate=${todayStr}`,
      {
        headers: { Authorization: `Bearer ${tokens.cust1}` },
      },
    )
    expect(availRes.status).toBe(200)
    const availData = await availRes.json()
    expect(availData.data.stylists.length).toBeGreaterThan(0)
    const availableSlots = availData.data.stylists[0].slots
    expect(availableSlots.length).toBeGreaterThan(0)
    const chosenSlot = availableSlots[0]

    // 3. [M4] Khách hàng đặt lịch hẹn (Booking POST) tại slot hợp lệ
    const bookingRes = await fetch(`${baseUrl}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.cust1}`,
        'Idempotency-Key': 'sol024-idemp-key-booking-01',
      },
      body: JSON.stringify({
        serviceIds: [service.id],
        staffId: staff._id,
        startAt: chosenSlot.startAt,
        bookingMode: 'customer',
      }),
    })
    expect(bookingRes.status).toBe(201)
    const bookingData = await bookingRes.json()
    const appointmentId = bookingData.data.id || bookingData.data.appointmentId || bookingData.data._id
    expect(appointmentId).toBeDefined()

    // 4. [M5 Audit] Kiểm tra event 'created' đã được ghi vào AppointmentEventModel
    const createdEvent = await AppointmentEventModel.findOne({ appointmentId, kind: 'created' })
    expect(createdEvent).toBeDefined()
    expect(createdEvent.after.status).toBe('confirmed')

    // 5. [M4 Vòng đời] Stylist bắt đầu thực hiện dịch vụ (Start)
    const startRes = await fetch(`${baseUrl}/api/appointments/${appointmentId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.stylist}`,
        'Idempotency-Key': 'sol024-idemp-key-start-001',
      },
      body: JSON.stringify({ expectedRevision: 0 }),
    })
    expect(startRes.status).toBe(200)

    // Kiểm tra DB: trạng thái chuyển sang in_progress
    const inProgressAppt = await AppointmentModel.findById(appointmentId)
    expect(inProgressAppt.status).toBe('in_progress')
    expect(inProgressAppt.startedAt).toBeDefined()

    // 6. [M4 Vòng đời] Stylist cập nhật thời gian dự kiến kết thúc (ETA)
    const newEta = new Date(new Date(chosenSlot.endAt).getTime() + 15 * 60000).toISOString()
    const etaRes = await fetch(`${baseUrl}/api/appointments/${appointmentId}/eta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.stylist}`,
        'Idempotency-Key': 'sol024-idemp-key-eta-0001',
      },
      body: JSON.stringify({ expectedRevision: 1, estimatedEndAt: newEta }),
    })
    expect(etaRes.status).toBe(200)

    // 7. [M4 Vòng đời] Stylist hoàn tất dịch vụ (Complete)
    const completeRes = await fetch(`${baseUrl}/api/appointments/${appointmentId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.stylist}`,
        'Idempotency-Key': 'sol024-idemp-key-complete-1',
      },
      body: JSON.stringify({ expectedRevision: 2 }),
    })
    expect(completeRes.status).toBe(200)

    // 8. [M5 Audit] Kiểm tra toàn bộ chuỗi event được ghi đầy đủ
    const events = await AppointmentEventModel.find({ appointmentId }).sort({ revision: 1 })
    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain('created')
    expect(kinds).toContain('started')
    expect(kinds).toContain('eta_updated')
    expect(kinds).toContain('completed')
  })

  it('Hồi quy liên module 1: Thay đổi giá hoặc ẩn dịch vụ M2 không ảnh hưởng đến snapshot lịch hẹn M4', async () => {
    // 1. Tạo dịch vụ giá 300.000đ
    const service = await ServiceModel.create({
      id: 'service-tay-toc',
      slug: 'tay-toc',
      name: 'Tẩy tóc bạch kim',
      description: 'Tẩy an toàn da đầu.',
      category: 'Nhuộm',
      durationMinutes: { min: 90, max: 90 },
      bookingDurationMinutes: 90,
      priceVnd: 300000,
      imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/tay.jpg',
      isActive: true,
      displayOrder: 1,
    })

    const staff = await StaffModel.findOne({ displayName: 'Stylist Hoàng' })
    const customer = await CustomerModel.findOne({ displayName: 'Nguyễn Văn A' })
    const custAccount = await AccountModel.findById(customer.accountId)

    // 2. Tạo lịch hẹn với snapshot giá 300.000đ
    const appointment = await AppointmentModel.create({
      customerId: customer._id,
      staffId: staff._id,
      createdByAccountId: custAccount._id,
      bookingMode: 'customer',
      customerSnapshot: { displayName: customer.displayName, phone: customer.phone },
      staffNameSnapshot: staff.displayName,
      items: [
        {
          serviceId: service.id,
          name: service.name,
          priceVnd: 300000,
          durationMinutes: 90,
        },
      ],
      totalPriceVnd: 300000,
      totalDurationMinutes: 90,
      bufferAfterMinutes: 10,
      startAt: new Date('2026-10-25T14:00:00+07:00'),
      endAt: new Date('2026-10-25T15:30:00+07:00'),
      occupiedFrom: new Date('2026-10-25T14:00:00+07:00'),
      occupiedUntil: new Date('2026-10-25T15:40:00+07:00'),
      timeZone: 'Asia/Ho_Chi_Minh',
      localDate: '2026-10-25',
      status: 'confirmed',
      revision: 0,
      confirmedAt: NOW,
    })

    // 3. Chủ tiệm tăng giá dịch vụ lên 800.000đ và đổi tên, tắt hiển thị (isActive = false)
    await ServiceModel.updateOne(
      { id: service.id },
      { $set: { priceVnd: 800000, name: 'Tẩy tóc Super VIP 2026', isActive: false } },
    )

    // 4. Đối chiếu snapshot lịch hẹn trong DB: giá và tên vẫn nguyên vẹn
    const savedAppt = await AppointmentModel.findById(appointment._id).lean()
    expect(savedAppt.items[0].priceVnd).toBe(300000)
    expect(savedAppt.items[0].name).toBe('Tẩy tóc bạch kim')
    expect(savedAppt.totalPriceVnd).toBe(300000)
  })

  it('Hồi quy liên module 2: Chặn xóa hoặc vô hiệu ca làm việc M3 nếu có lịch hẹn confirmed/in_progress ở M4', async () => {
    const staff = await StaffModel.findOne({ displayName: 'Stylist Hoàng' })
    const customer = await CustomerModel.findOne({ displayName: 'Nguyễn Văn A' })
    const custAccount = await AccountModel.findById(customer.accountId)
    const todayStr = toHoChiMinhDate(NOW)

    // 1. Tạo ca làm việc
    const shift = await StaffShiftModel.create({
      staffId: staff._id,
      localDate: todayStr,
      startAt: new Date(`${todayStr}T08:00:00+07:00`),
      endAt: new Date(`${todayStr}T16:00:00+07:00`),
    })

    // 2. Tạo lịch hẹn confirmed nằm trong ca làm việc này
    await AppointmentModel.create({
      customerId: customer._id,
      staffId: staff._id,
      createdByAccountId: custAccount._id,
      bookingMode: 'customer',
      customerSnapshot: { displayName: customer.displayName, phone: customer.phone },
      staffNameSnapshot: staff.displayName,
      items: [
        {
          serviceId: 'service-test-cut',
          name: 'Cắt tóc',
          priceVnd: 100000,
          durationMinutes: 30,
        },
      ],
      totalPriceVnd: 100000,
      totalDurationMinutes: 30,
      bufferAfterMinutes: 10,
      startAt: new Date(`${todayStr}T10:00:00+07:00`),
      endAt: new Date(`${todayStr}T10:30:00+07:00`),
      occupiedFrom: new Date(`${todayStr}T10:00:00+07:00`),
      occupiedUntil: new Date(`${todayStr}T10:40:00+07:00`),
      timeZone: 'Asia/Ho_Chi_Minh',
      localDate: todayStr,
      status: 'confirmed',
      revision: 0,
      confirmedAt: NOW,
    })

    // 3. Chủ tiệm gọi API cố tình xóa ca làm việc đang có lịch hẹn -> Phải bị từ chối
    const deleteShiftRes = await fetch(`${baseUrl}/api/staff/${staff._id}/shifts/${shift._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokens.owner}` },
    })
    expect([400, 409]).toContain(deleteShiftRes.status)

    // Xác nhận ca làm việc vẫn tồn tại trong DB, không bị mất
    const checkShift = await StaffShiftModel.findById(shift._id)
    expect(checkShift).not.toBeNull()
  })

  it('Hồi quy bảo mật liên module: Khách hàng không thể can thiệp lịch của khách khác hoặc gọi route admin', async () => {
    const customer1 = await CustomerModel.findOne({ displayName: 'Nguyễn Văn A' })
    const staff = await StaffModel.findOne({ displayName: 'Stylist Hoàng' })
    const cust1Account = await AccountModel.findById(customer1.accountId)

    // Tạo lịch của Khách 1
    const apptCust1 = await AppointmentModel.create({
      customerId: customer1._id,
      staffId: staff._id,
      createdByAccountId: cust1Account._id,
      bookingMode: 'customer',
      customerSnapshot: { displayName: customer1.displayName, phone: customer1.phone },
      staffNameSnapshot: staff.displayName,
      items: [
        {
          serviceId: 'service-test',
          name: 'Dịch vụ A',
          priceVnd: 150000,
          durationMinutes: 30,
        },
      ],
      totalPriceVnd: 150000,
      totalDurationMinutes: 30,
      bufferAfterMinutes: 10,
      startAt: new Date('2026-10-25T10:00:00+07:00'),
      endAt: new Date('2026-10-25T10:30:00+07:00'),
      occupiedFrom: new Date('2026-10-25T10:00:00+07:00'),
      occupiedUntil: new Date('2026-10-25T10:40:00+07:00'),
      timeZone: 'Asia/Ho_Chi_Minh',
      localDate: '2026-10-25',
      status: 'confirmed',
      revision: 0,
      confirmedAt: NOW,
    })

    // Khách 2 (cust2) cố tình gọi API hủy lịch của Khách 1 -> Bị chặn 403 hoặc 404
    const maliciousCancelRes = await fetch(`${baseUrl}/api/appointments/${apptCust1._id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.cust2}`,
        'Idempotency-Key': 'malicious-cancel-attempt-key-01',
      },
      body: JSON.stringify({ reason: 'Hủy trộm của người khác', expectedRevision: 0 }),
    })
    expect([403, 404]).toContain(maliciousCancelRes.status)

    // Khách 2 cố tình gọi route bắt đầu lịch hẹn (chỉ dành cho stylist/owner) -> Bị chặn 403
    const maliciousStartRes = await fetch(`${baseUrl}/api/appointments/${apptCust1._id}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.cust2}`,
        'Idempotency-Key': 'malicious-start-attempt-key-001',
      },
      body: JSON.stringify({ expectedRevision: 0 }),
    })
    expect(maliciousStartRes.status).toBe(403)
  })
})
