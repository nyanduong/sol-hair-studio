import { ServiceModel } from './services.model.js'

export function findActiveServices() {
  return ServiceModel.find({ isActive: true })
    .sort({ displayOrder: 1, id: 1 })
    .select('id slug name description category durationMinutes priceVnd imageUrl -_id')
    .lean()
}
