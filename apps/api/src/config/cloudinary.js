import { v2 as cloudinary } from 'cloudinary'
import { config } from './env.js'

export function cloudinaryImageUrl(cloudName, publicId) {
  if (!cloudName || !publicId) {
    throw new Error('Cần cấu hình Cloudinary cloud name và public ID của ảnh.')
  }

  const normalizedPublicId = publicId
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')

  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/f_auto,q_90,w_1200,c_limit/${normalizedPublicId}`
}

export function getCloudinaryClient() {
  if (!config.cloudinaryCloudName) {
    throw new Error('Cần cấu hình CLOUDINARY_CLOUD_NAME.')
  }
  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
    secure: true,
  })
  return cloudinary
}

export async function uploadImagePayload(payload, { folder = 'sol-hair-studio/services', originalName } = {}) {
  const client = getCloudinaryClient()
  const result = await client.uploader.upload(payload, {
    folder,
    resource_type: 'image',
  })
  return {
    cloudName: config.cloudinaryCloudName,
    cloudinaryAssetId: result.asset_id,
    publicId: result.public_id,
    url: result.secure_url || cloudinaryImageUrl(config.cloudinaryCloudName, result.public_id),
    originalName: originalName || result.original_filename || 'image.jpg',
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    format: result.format || 'jpg',
  }
}
