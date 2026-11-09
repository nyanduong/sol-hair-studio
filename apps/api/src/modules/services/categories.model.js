import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  normalizedName: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  revision: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false, collection: 'service_categories' })
export const CategoryModel = mongoose.models.ServiceCategory ?? mongoose.model('ServiceCategory', schema)
