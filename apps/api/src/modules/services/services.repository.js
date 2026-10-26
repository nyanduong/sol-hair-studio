import { ServiceModel } from './services.model.js'
import { ImageModel } from './images.model.js'

export function findActiveServices() {
  return ServiceModel.find({ isActive: true })
    .sort({ displayOrder: 1, id: 1 })
    .select('id slug name description category durationMinutes priceVnd imageUrl -_id')
    .lean()
}

export function findAllServices() {
  return ServiceModel.find({})
    .sort({ displayOrder: 1, id: 1 })
    .populate('coverImageId', 'url publicId originalName width height format')
    .lean()
}

export function findServiceById(id) {
  return ServiceModel.findOne({ id })
    .populate('coverImageId', 'url publicId originalName width height format')
    .lean()
}

export function findServiceBySlug(slug) {
  return ServiceModel.findOne({ slug })
    .populate('coverImageId', 'url publicId originalName width height format')
    .lean()
}

export async function createService(data) {
  const service = new ServiceModel(data)
  return await service.save()
}

export function updateService(id, updates) {
  return ServiceModel.findOneAndUpdate(
    { id },
    { $set: updates },
    { new: true, runValidators: true },
  )
    .populate('coverImageId', 'url publicId originalName width height format')
    .lean()
}

export function findImageById(id) {
  return ImageModel.findById(id).lean()
}

export function findImageByPublicId(cloudName, publicId) {
  return ImageModel.findOne({ cloudName, publicId }).lean()
}

export function findImagesByIds(ids) {
  return ImageModel.find({ _id: { $in: ids }, isActive: true }).lean()
}

export async function createImage(data) {
  const image = new ImageModel(data)
  return await image.save()
}
