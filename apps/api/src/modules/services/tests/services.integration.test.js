import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import mongoose from 'mongoose'

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'
  process.env.AUTH_SECRET = 'sol023-service-regression-secret-32b'
})

import { app } from '../../../app.js'
import { connectToDatabase, disconnectFromDatabase } from '../../../config/database.js'
import { AccountModel } from '../../auth/accounts.model.js'
import { hashPassword } from '../../auth/password.js'
import { ServiceModel } from '../services.model.js'
import { ImageModel } from '../images.model.js'
import { AppointmentModel } from '../../appointments/appointments.model.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { StaffModel } from '../../staff/staff.model.js'
import * as webServicesApi from '../../../../../web/src/features/services/api/services.api.js'
import * as mobileServicesApi from '../../../../../mobile/src/features/services/api/services.api.js'

let replica
let server
let baseUrl
let ownerToken

const OWNER_EMAIL = 'owner-sol023@solhair.test'
const OWNER_PASSWORD = 'test_password_fixture'

async function loginAsOwner() {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  })
  expect(res.status).toBe(200)
  const data = await res.json()
  return data.data.token
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: '8.0.17' },
  })
  await connectToDatabase(replica.getUri('sol023_service_regression'))

  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
}, 180000)

beforeEach(async () => {
  await ServiceModel.deleteMany({})
  await ImageModel.deleteMany({})
  await AccountModel.deleteMany({})
  await AppointmentModel.deleteMany({})
  await CustomerModel.deleteMany({})
  await StaffModel.deleteMany({})

  // Seed Owner Account
  const passwordHash = await hashPassword(OWNER_PASSWORD)
  await AccountModel.create({
    emailNormalized: OWNER_EMAIL,
    passwordHash,
    roles: ['owner'],
    status: 'active',
    emailVerifiedAt: new Date(),
  })

  ownerToken = await loginAsOwner()
})

afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  await disconnectFromDatabase()
  if (replica) await replica.stop()
})

describe('SOL-023: Tích hợp dịch vụ và hồi quy danh mục (M2 Integration & Regression)', () => {
  it('Quản lý dịch vụ phía chủ tiệm: thêm, sửa, ẩn dịch vụ và bảo toàn dữ liệu MongoDB', async () => {
    // 1. Chủ tiệm tạo dịch vụ mới qua API
    const newServicePayload = {
      id: 'service-uon-toc-han-quoc',
      name: 'Uốn tóc phong cách Hàn Quốc',
      category: 'Uốn & Nhuộm',
      description: 'Công nghệ uốn sóng lơi nhẹ nhàng, giữ nếp tự nhiên.',
      priceVnd: 600000,
      durationMinutes: { min: 90, max: 120 },
      bookingDurationMinutes: 120,
      imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/uon-toc.jpg',
      isActive: true,
      displayOrder: 1,
    }

    const created = await webServicesApi.createService(baseUrl, ownerToken, newServicePayload)
    expect(created.id).toBe('service-uon-toc-han-quoc')
    expect(created.name).toBe('Uốn tóc phong cách Hàn Quốc')

    // Kiểm tra trong MongoDB
    const docInDb = await ServiceModel.findOne({ id: 'service-uon-toc-han-quoc' }).lean()
    expect(docInDb).toBeDefined()
    expect(docInDb.slug).toBe('uon-toc-phong-cach-han-quoc')
    expect(docInDb.priceVnd).toBe(600000)
    expect(docInDb.bookingDurationMinutes).toBe(120)
    expect(docInDb.isActive).toBe(true)

    // 2. Chủ tiệm chỉnh sửa thông tin dịch vụ
    const updatePayload = {
      name: 'Uốn tóc sóng lơi cao cấp',
      priceVnd: 750000,
      durationMinutes: { min: 90, max: 120 },
      bookingDurationMinutes: 100,
    }

    const updated = await webServicesApi.updateService(baseUrl, ownerToken, 'service-uon-toc-han-quoc', updatePayload)
    expect(updated.name).toBe('Uốn tóc sóng lơi cao cấp')
    expect(updated.priceVnd).toBe(750000)

    const updatedDoc = await ServiceModel.findOne({ id: 'service-uon-toc-han-quoc' }).lean()
    expect(updatedDoc.priceVnd).toBe(750000)
    expect(updatedDoc.bookingDurationMinutes).toBe(100)

    // 3. Chủ tiệm ẩn dịch vụ (isActive: false)
    await webServicesApi.updateService(baseUrl, ownerToken, 'service-uon-toc-han-quoc', { isActive: false })
    const hiddenDoc = await ServiceModel.findOne({ id: 'service-uon-toc-han-quoc' }).lean()
    expect(hiddenDoc).toBeDefined()
    expect(hiddenDoc.isActive).toBe(false) // Dịch vụ bị ẩn nhưng không bị xóa khỏi DB
  })

  it('Đồng bộ danh mục đa nền tảng: Web và Mobile client nhận cùng dữ liệu API tức thì', async () => {
    // Seed 2 dịch vụ: 1 hiển thị (active), 1 bị ẩn (inactive)
    await ServiceModel.create([
      {
        id: 'service-cat-toc',
        slug: 'cat-toc-nam-nu',
        name: 'Cắt tóc nam nữ tiêu chuẩn',
        description: 'Tạo kiểu phom tóc chuẩn phong cách hiện đại.',
        category: 'Tạo kiểu',
        durationMinutes: { min: 30, max: 45 },
        bookingDurationMinutes: 45,
        priceVnd: 150000,
        imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/cat-toc.jpg',
        isActive: true,
        displayOrder: 1,
      },
      {
        id: 'service-tam-ngung',
        slug: 'dich-vu-tam-ngung',
        name: 'Dịch vụ tạm ngưng phục vụ',
        description: 'Dịch vụ đang bảo trì nâng cấp công thức.',
        category: 'Chăm sóc',
        durationMinutes: { min: 30, max: 30 },
        bookingDurationMinutes: 30,
        priceVnd: 200000,
        imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/tam-ngung.jpg',
        isActive: false,
        displayOrder: 2,
      },
    ])

    // Client Web và Client Mobile đều gọi API public
    const webCatalog = await webServicesApi.fetchServices(baseUrl)
    const mobileCatalog = await mobileServicesApi.fetchServices(baseUrl)

    // Cả 2 client nhận chính xác cùng 1 danh sách
    expect(webCatalog).toEqual(mobileCatalog)
    expect(webCatalog).toHaveLength(1)
    expect(webCatalog[0].id).toBe('service-cat-toc')

    // Dịch vụ bị ẩn tuyệt đối không xuất hiện trong danh mục public của khách
    const hiddenInWeb = webCatalog.some((s) => s.id === 'service-tam-ngung')
    const hiddenInMobile = mobileCatalog.some((s) => s.id === 'service-tam-ngung')
    expect(hiddenInWeb).toBe(false)
    expect(hiddenInMobile).toBe(false)

    // Nhưng danh sách quản lý của Chủ tiệm vẫn có đủ cả 2 dịch vụ
    const ownerManageList = await webServicesApi.fetchManageServices(baseUrl, ownerToken)
    expect(ownerManageList).toHaveLength(2)
  })

  it('Hồi quy DTO công khai: Bảo vệ trường nhạy cảm, chỉ trả về đúng 8 field allowlist', async () => {
    await ServiceModel.create({
      id: 'service-goi-dau',
      slug: 'goi-dau-duong-sinh',
      name: 'Gội đầu dưỡng sinh thảo dược',
      description: 'Thư giãn kết hợp bấm huyệt cổ vai gáy.',
      category: 'Gội & Chăm sóc',
      durationMinutes: { min: 45, max: 60 },
      bookingDurationMinutes: 60,
      priceVnd: 250000,
      imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/goi-dau.jpg',
      coverImageId: new mongoose.Types.ObjectId(),
      images: [{ imageId: new mongoose.Types.ObjectId(), alt: 'Gội đầu' }],
      isActive: true,
      displayOrder: 1,
    })

    const response = await fetch(`${baseUrl}/api/services`)
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(Array.isArray(json.data)).toBe(true)

    const service = json.data[0]

    // 8 trường bắt buộc phải có
    expect(Object.keys(service).sort()).toEqual([
      'category',
      'description',
      'durationMinutes',
      'id',
      'imageUrl',
      'name',
      'priceVnd',
      'slug',
    ])

    // Các trường nội bộ và metadata tuyệt đối không được rò rỉ ra API công khai
    expect(service.bookingDurationMinutes).toBeUndefined()
    expect(service.coverImageId).toBeUndefined()
    expect(service.images).toBeUndefined()
    expect(service._id).toBeUndefined()
    expect(service.__v).toBeUndefined()
  })

  it('Hồi quy lịch hẹn: Sửa giá hoặc ẩn dịch vụ không làm thay đổi snapshot lịch đã đặt', async () => {
    // 1. Tạo dịch vụ giá ban đầu 200.000đ
    const serviceDoc = await ServiceModel.create({
      id: 'service-nhuom-toc-vip',
      slug: 'nhuom-toc-vip',
      name: 'Nhuộm tóc phủ bóng VIP',
      description: 'Màu nhuộm organic không xơ rối.',
      category: 'Nhuộm',
      durationMinutes: { min: 60, max: 90 },
      bookingDurationMinutes: 90,
      priceVnd: 200000,
      imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/nhuom.jpg',
      isActive: true,
      displayOrder: 1,
    })

    // Tạo hồ sơ khách và nhân viên để gắn lịch hẹn
    const customerAccount = await AccountModel.create({
      emailNormalized: 'cust023@example.test',
      passwordHash: 'hash',
      roles: ['customer'],
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    const customer = await CustomerModel.create({
      accountId: customerAccount._id,
      displayName: 'Khách hàng A',
      phone: '+84901234567',
    })
    const staff = await StaffModel.create({
      accountId: customerAccount._id,
      displayName: 'Stylist Minh',
      serviceIds: ['service-nhuom-toc-vip'],
    })

    // 2. Tạo một lịch hẹn có snapshot dịch vụ tại thời điểm đặt (200.000đ / 90 phút)
    const appointment = await AppointmentModel.create({
      customerId: customer._id,
      staffId: staff._id,
      createdByAccountId: customerAccount._id,
      bookingMode: 'customer',
      customerSnapshot: { displayName: 'Khách hàng A', phone: '+84901234567' },
      staffNameSnapshot: 'Stylist Minh',
      items: [
        {
          serviceId: serviceDoc.id,
          name: serviceDoc.name,
          priceVnd: 200000,
          durationMinutes: 90,
        },
      ],
      totalPriceVnd: 200000,
      totalDurationMinutes: 90,
      bufferAfterMinutes: 10,
      startAt: new Date('2026-11-05T09:00:00+07:00'),
      endAt: new Date('2026-11-05T10:30:00+07:00'),
      occupiedFrom: new Date('2026-11-05T09:00:00+07:00'),
      occupiedUntil: new Date('2026-11-05T10:40:00+07:00'),
      timeZone: 'Asia/Ho_Chi_Minh',
      localDate: '2026-11-05',
      status: 'confirmed',
      revision: 0,
      confirmedAt: new Date(),
    })

    // 3. Sau khi đặt, Chủ tiệm tăng giá dịch vụ lên 500.000đ và ẩn dịch vụ
    await ServiceModel.updateOne(
      { id: 'service-nhuom-toc-vip' },
      { $set: { priceVnd: 500000, name: 'Nhuộm tóc cao cấp 2026', isActive: false } },
    )

    // 4. Kiểm tra snapshot của lịch hẹn trong DB vẫn giữ nguyên vẹn
    const savedAppt = await AppointmentModel.findById(appointment._id).lean()
    expect(savedAppt.items[0].serviceId).toBe('service-nhuom-toc-vip')
    expect(savedAppt.items[0].priceVnd).toBe(200000) // Vẫn là giá lúc đặt, không bị đổi thành 500000
    expect(savedAppt.items[0].name).toBe('Nhuộm tóc phủ bóng VIP') // Vẫn là tên lúc đặt
    expect(savedAppt.totalPriceVnd).toBe(200000)
  })

  it('Hồi quy sắp xếp: Danh mục luôn được sắp xếp theo thứ tự hiển thị displayOrder và id', async () => {
    await ServiceModel.create([
      {
        id: 'service-b',
        slug: 'service-b',
        name: 'Dịch vụ B',
        description: 'Mô tả',
        category: 'Tạo kiểu',
        durationMinutes: { min: 30, max: 30 },
        bookingDurationMinutes: 30,
        priceVnd: 100000,
        imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/b.jpg',
        isActive: true,
        displayOrder: 2,
      },
      {
        id: 'service-a',
        slug: 'service-a',
        name: 'Dịch vụ A',
        description: 'Mô tả',
        category: 'Tạo kiểu',
        durationMinutes: { min: 30, max: 30 },
        bookingDurationMinutes: 30,
        priceVnd: 100000,
        imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/a.jpg',
        isActive: true,
        displayOrder: 1,
      },
      {
        id: 'service-c',
        slug: 'service-c',
        name: 'Dịch vụ C',
        description: 'Mô tả',
        category: 'Tạo kiểu',
        durationMinutes: { min: 30, max: 30 },
        bookingDurationMinutes: 30,
        priceVnd: 100000,
        imageUrl: 'https://res.cloudinary.com/sol-hair/image/upload/v1/c.jpg',
        isActive: true,
        displayOrder: 1,
      },
    ])

    const catalog = await webServicesApi.fetchServices(baseUrl)
    expect(catalog.map((s) => s.id)).toEqual(['service-a', 'service-c', 'service-b'])
  })
})
