import { uploadImagePayload } from '../../config/cloudinary.js'
import mongoose from 'mongoose'
import { CustomerModel } from './customers.model.js'
import { AppointmentModel } from '../appointments/appointments.model.js'

export class CustomerError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
const id = value => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new CustomerError('Mã khách hàng không hợp lệ.')
  return new mongoose.Types.ObjectId(value)
}
export function customerInput(body) {
  if (!body || Object.keys(body).some(key => !['displayName', 'phone'].includes(key))) throw new CustomerError('Chỉ chấp nhận tên và số điện thoại.')
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  let phone = typeof body.phone === 'string' ? body.phone.trim().replace(/[\s.-]/g, '') : ''
  if (/^0\d{9}$/.test(phone)) phone = '+84' + phone.slice(1)
  if (!displayName || displayName.length > 120 || (phone && !/^\+[1-9]\d{1,14}$/.test(phone))) throw new CustomerError('Nhập tên (tối đa 120 ký tự) và số điện thoại hợp lệ.')
  return { displayName, phone: phone || undefined }
}
export function listFilters(query) {
  const { q = '', type = 'all', page = '1' } = query
  if (typeof q !== 'string' || q.length > 120 || !['all', 'account', 'guest'].includes(type) || typeof page !== 'string' || !/^[1-9]\d{0,4}$/.test(page)) throw new CustomerError('Bộ lọc không hợp lệ.')
  return { q: q.trim(), type, page: Number(page) }
}
const serialize = row => ({ id: String(row._id), displayName: row.displayName, phone: row.phone || '', avatarUrl: row.avatar?.url || null, hasAccount: Boolean(row.accountId), visits: row.visits || 0, totalSpentVnd: row.totalSpentVnd || 0, lastVisit: row.lastVisit || null })
const statsLookup = { $lookup: { from: 'appointments', let: { customer: '$_id' }, pipeline: [
  { $match: { $expr: { $eq: ['$customerId', '$$customer'] }, status: 'completed' } },
  { $group: { _id: null, visits: { $sum: 1 }, totalSpentVnd: { $sum: '$totalPriceVnd' }, lastVisit: { $max: '$completedAt' } } },
], as: 'stats' } }
export async function listCustomers(query) {
  const filters = listFilters(query)
  const match = {}
  if (filters.q) {
    const literal = filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const phoneSearch = filters.q.replace(/[\s.-]/g, '')
    const phoneLiteral = (/^0\d{9}$/.test(phoneSearch) ? '+84' + phoneSearch.slice(1) : phoneSearch).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    match.$or = [{ displayName: { $regex: literal, $options: 'i' } }, { phone: { $regex: phoneLiteral } }]
  }
  if (filters.type !== 'all') match.accountId = { $exists: filters.type === 'account' }
  const [result] = await CustomerModel.aggregate([{ $facet: {
    summary: [{ $group: { _id: null, total: { $sum: 1 }, account: { $sum: { $cond: [{ $ifNull: ['$accountId', false] }, 1, 0] } } } }],
    count: [{ $match: match }, { $count: 'total' }],
    items: [{ $match: match }, { $sort: { createdAt: -1, _id: -1 } }, { $skip: (filters.page - 1) * 6 }, { $limit: 6 }, statsLookup, { $set: { visits: { $first: '$stats.visits' }, totalSpentVnd: { $first: '$stats.totalSpentVnd' }, lastVisit: { $first: '$stats.lastVisit' } } }],
  } }])
  return { items: result.items.map(serialize), total: result.count[0]?.total || 0, page: filters.page, summary: result.summary[0] || { total: 0, account: 0 } }
}
export async function customerDetail(customerId, query = {}) {
  const _id = id(customerId)
  const { page } = listFilters({ page: query.page })
  const [row] = await CustomerModel.aggregate([{ $match: { _id } }, statsLookup, { $set: { visits: { $first: '$stats.visits' }, totalSpentVnd: { $first: '$stats.totalSpentVnd' }, lastVisit: { $first: '$stats.lastVisit' } } }, { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } }])
  if (!row) throw new CustomerError('Không tìm thấy khách hàng.', 404)
  const history = await AppointmentModel.find({ customerId: _id, status: 'completed' }).sort({ completedAt: -1, _id: -1 }).skip((page - 1) * 6).limit(6).select('items.name startAt completedAt totalPriceVnd').lean()
  return { ...serialize(row), email: row.account?.[0]?.emailNormalized || '', history: history.map(item => ({ id: String(item._id), names: item.items.map(service => service.name), startAt: item.startAt, totalPriceVnd: item.totalPriceVnd })), historyPage: page }
}
export async function saveCustomer(customerId, body) {
  const input = customerInput(body)
  if (!customerId) return { id: String((await CustomerModel.create(input))._id) }
  const row = await CustomerModel.findByIdAndUpdate(id(customerId), { $set: { displayName: input.displayName, ...(input.phone ? { phone: input.phone } : {}) }, ...(!input.phone ? { $unset: { phone: 1 } } : {}) }, { returnDocument: 'after', runValidators: true })
  if (!row) throw new CustomerError('Không tìm thấy khách hàng.', 404)
  return { id: String(row._id) }
}

// Only image bytes are accepted; callers cannot attach arbitrary URLs or public IDs.
export function avatarPayload(body) {
  if (!body || Object.keys(body).some(key => key !== 'image') || typeof body.image !== 'string' || body.image.length > 2800000) throw new CustomerError('Chọn ảnh JPG, PNG hoặc WebP tối đa 2 MB.')
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.image)
  if (!match) throw new CustomerError('Định dạng ảnh không hợp lệ.')
  const bytes = Buffer.from(match[2], 'base64')
  const valid = match[1] === 'jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  if (!valid || bytes.length > 2 * 1024 * 1024 || bytes.toString('base64') !== match[2]) throw new CustomerError('Ảnh không hợp lệ hoặc lớn hơn 2 MB.')
  return body.image
}
export async function uploadCustomerAvatar(customerId, body) {
  const _id = id(customerId)
  const payload = avatarPayload(body)
  if (!await CustomerModel.exists({ _id })) throw new CustomerError('Không tìm thấy khách hàng.', 404)
  let image
  try {
    image = await uploadImagePayload(payload, { folder: 'sol-hair-studio/customer-avatars' })
  } catch {
    throw new CustomerError('Chưa thể tải ảnh lên Cloudinary. Vui lòng thử lại.', 502)
  }
  const row = await CustomerModel.findByIdAndUpdate(_id, { $set: { avatar: { url: image.url, publicId: image.publicId } } }, { returnDocument: 'after', runValidators: true })
  if (!row) throw new CustomerError('Không tìm thấy khách hàng.', 404)
  return { id: String(row._id), avatarUrl: row.avatar.url }
}
