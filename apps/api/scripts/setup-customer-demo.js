import 'dotenv/config'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { v2 as cloudinary } from 'cloudinary'
import { ServiceModel } from '../src/modules/services/services.model.js'
import { CategoryModel } from '../src/modules/services/categories.model.js'
import { StaffModel } from '../src/modules/staff/staff.model.js'
import { StaffShiftModel } from '../src/modules/staff/staff-shifts.model.js'
import { AccountModel } from '../src/modules/auth/accounts.model.js'
import { hashPassword } from '../src/modules/auth/password.js'

// Explicit local-only, additive demo setup. Existing catalog/accounts are never replaced.
const uri = process.env.MONGODB_URI || ''
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(uri)) throw new Error('Demo setup requires a local MongoDB URI.')
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET })
const names = ['hero', 'cut', 'wash', 'color']
const files = process.argv.slice(2)
if (files.length !== 4) throw new Error('Provide hero, cut, wash and color image paths.')
const media = {}
for (const [index, key] of names.entries()) {
  const uploaded = await cloudinary.uploader.upload(files[index], { public_id: `sol/customer-demo-v1/${key}`, overwrite: false, resource_type: 'image' })
  media[key] = uploaded.secure_url.replace('/upload/', '/upload/f_auto,q_auto,w_1600/')
}
await mongoose.connect(uri)
try {
  const rows = [
    ['cut', 'Cắt & tạo kiểu', 'Cắt & tạo kiểu', 150000, 60, 'Tạo kiểu phù hợp với gương mặt và phong cách của bạn.'],
    ['wash', 'Gội & chăm sóc', 'Chăm sóc tóc', 100000, 30, 'Làm sạch nhẹ nhàng, thư giãn da đầu và nuôi dưỡng mái tóc.'],
    ['color', 'Nhuộm tóc', 'Nhuộm tóc', 650000, 120, 'Sắc màu hài hòa, tôn lên nét đẹp riêng của bạn.'],
  ]
  const serviceIds = []
  for (const [key, name, category, priceVnd, duration, description] of rows) {
    const normalizedName = category.normalize('NFC').toLocaleLowerCase('vi-VN')
    let group = await CategoryModel.findOne({ normalizedName })
    group ??= await CategoryModel.create({ name: category, normalizedName })
    const id = `sol-demo-${key}`
    if (!await ServiceModel.exists({ id })) await ServiceModel.create({ id, slug: id, name, category, categoryId: group._id, priceVnd, description, durationMinutes: { min: duration, max: duration }, bookingDurationMinutes: duration, imageUrl: media[key], displayOrder: -30 + serviceIds.length, isActive: true })
    serviceIds.push(id)
  }
  let shiftsCreated = 0
  for (const [key, displayName] of [['minh-anh', 'Minh Anh'], ['thu-ha', 'Thu Hà']]) {
    const emailNormalized = `${key}@demo.sol.example`
    let account = await AccountModel.findOne({ emailNormalized })
    account ??= await AccountModel.create({ emailNormalized, roles: ['stylist'], status: 'active', emailVerifiedAt: new Date(), passwordHash: await hashPassword(randomUUID()) })
    let staff = await StaffModel.findOne({ accountId: account._id })
    staff ??= await StaffModel.create({ accountId: account._id, displayName, serviceIds, isActive: true })
    for (let offset = 0; offset <= 7; offset++) {
      const localDate = new Date(Date.now() + 7 * 3600000 + offset * 86400000).toISOString().slice(0, 10)
      for (const [start, end] of [['09:00', '12:00'], ['13:00', '18:00']]) {
        const startAt = new Date(`${localDate}T${start}:00+07:00`)
        const endAt = new Date(`${localDate}T${end}:00+07:00`)
        if (!await StaffShiftModel.exists({ staffId: staff._id, startAt: { $lt: endAt }, endAt: { $gt: startAt }, status: 'active' })) {
          await StaffShiftModel.create({ staffId: staff._id, localDate, startAt, endAt, status: 'active' })
          shiftsCreated++
        }
      }
    }
  }
  console.log(JSON.stringify({ media, serviceIds, shiftsCreated }))
} finally { await mongoose.disconnect() }
