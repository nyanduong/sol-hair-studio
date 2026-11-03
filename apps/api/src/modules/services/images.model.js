import mongoose from 'mongoose'

const imageSchema = new mongoose.Schema(
  {
    cloudName: { type: String, required: true, trim: true },
    cloudinaryAssetId: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true },
    url: {
      type: String,
      required: true,
      trim: true,
      match: /^https:\/\/res\.cloudinary\.com\//,
    },
    originalName: { type: String, required: true, trim: true },
    width: { type: Number, required: true, min: 1, max: 20000 },
    height: { type: Number, required: true, min: 1, max: 20000 },
    bytes: { type: Number, required: true, min: 1, max: 10485760 },
    format: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      enum: ['jpg', 'jpeg', 'png', 'webp'],
    },
    isActive: { type: Boolean, default: true },
    uploadedByAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
    },
  },
  { timestamps: true },
)

imageSchema.index({ cloudName: 1, cloudinaryAssetId: 1 }, { unique: true })
imageSchema.index({ cloudName: 1, publicId: 1 }, { unique: true })

export const ImageModel = mongoose.models.Image ?? mongoose.model('Image', imageSchema)
export { imageSchema }
