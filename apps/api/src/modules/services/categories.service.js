import mongoose from 'mongoose'
import { CategoryModel } from './categories.model.js'
import { ServiceModel } from './services.model.js'
export class CategoryError extends Error {
  constructor(message, status) { super(message); this.status = status; this.name = 'CategoryError' }
}
function owner(identity) { if (!identity?.roles?.includes('owner')) throw new CategoryError('Chỉ chủ tiệm được quản lý danh mục.', 403) }
function nameInput(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw new CategoryError('Tên danh mục phải từ 1 đến 80 ký tự.', 400)
  return name.trim().replace(/\s+/g, ' ')
}
function idInput(id) { if (!mongoose.isValidObjectId(id)) throw new CategoryError('Danh mục không hợp lệ.', 400) }
function normalized(name) { return name.normalize('NFC').toLocaleLowerCase('vi-VN') }
function dto(category) { return { id: String(category._id), name: category.name, isActive: category.isActive } }
async function write(operation) {
  try { return await operation() } catch (error) {
    if (error.code === 11000) throw new CategoryError('Tên danh mục đã tồn tại.', 409)
    throw error
  }
}
export async function listCategories(identity) { owner(identity); return (await CategoryModel.find({}).sort({ name: 1 }).lean()).map(dto) }
export async function listCategoryManagement(identity) {
  owner(identity)
  const [categories, services] = await Promise.all([
    CategoryModel.find({}).sort({ name: 1 }).lean(),
    ServiceModel.find({}).select('categoryId category').lean(),
  ])
  const countById = new Map()
  const legacyCountByName = new Map()
  for (const service of services) {
    if (service.categoryId) {
      const id = String(service.categoryId)
      countById.set(id, (countById.get(id) || 0) + 1)
    } else if (service.category) {
      const name = normalized(service.category.trim().replace(/\s+/g, ' '))
      legacyCountByName.set(name, (legacyCountByName.get(name) || 0) + 1)
    }
  }
  return categories.map(category => ({
    ...dto(category),
    serviceCount: (countById.get(String(category._id)) || 0) + (legacyCountByName.get(category.normalizedName) || 0),
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }))
}
export async function createCategory(identity, input) {
  owner(identity); const name = nameInput(input.name)
  return write(async () => dto(await CategoryModel.create({ name, normalizedName: normalized(name) })))
}
export async function updateCategory(identity, id, input) {
  owner(identity); idInput(id)
  return write(() => mongoose.connection.transaction(async session => {
    const category = await CategoryModel.findById(id).session(session)
    if (!category) throw new CategoryError('Không tìm thấy danh mục.', 404)
    const oldName = category.name
    if (input.name !== undefined) { category.name = nameInput(input.name); category.normalizedName = normalized(category.name) }
    if (input.isActive !== undefined) {
      if (typeof input.isActive !== 'boolean') throw new CategoryError('Trạng thái không hợp lệ.', 400)
      category.isActive = input.isActive
    }
    category.revision++; await category.save({ session })
    if (oldName !== category.name) await ServiceModel.updateMany({ $or: [{ categoryId: category._id }, { categoryId: { $exists: false }, category: oldName }] }, { $set: { category: category.name, categoryId: category._id } }, { session })
    return dto(category)
  }))
}
export async function withManagedCategory(identity, input, operation, existing = null) {
  owner(identity); idInput(input.categoryId)
  return mongoose.connection.transaction(async session => {
    const category = await CategoryModel.findOneAndUpdate({ _id: input.categoryId }, { $inc: { revision: 1 } }, { session, returnDocument: 'after' })
    if (!category || (!category.isActive && String(existing?.categoryId) !== String(category._id))) throw new CategoryError('Chọn danh mục đang hoạt động.', 400)
    return operation({ ...input, category: category.name }, session)
  })
}

export async function resolveCategoryName(name) {
  const category = await CategoryModel.findOne({ normalizedName: normalized(nameInput(name)), isActive: true }).lean()
  if (!category) throw new CategoryError('Chọn danh mục đang hoạt động.', 400)
  return String(category._id)
}
