import 'dotenv/config'

function readPort(value) {
  const port = Number(value ?? 4000)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT phải là số nguyên từ 1 đến 65535.')
  }
  return port
}

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: readPort(process.env.PORT),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  mongoUri: process.env.MONGODB_URI?.trim() || undefined,
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || undefined,
  authSecret: process.env.AUTH_SECRET?.trim() || undefined,
  smtpHost: process.env.SMTP_HOST?.trim() || undefined,
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  mailFrom: process.env.MAIL_FROM?.trim() || undefined,
})
