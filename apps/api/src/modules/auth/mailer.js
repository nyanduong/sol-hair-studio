import nodemailer from 'nodemailer'
import { config } from '../../config/env.js'

let customTransport = null

export function setMailTransport(transport) {
  customTransport = transport
}

export function resetMailTransport() {
  customTransport = null
}

export async function sendOtpEmail({ to, code, purpose }) {
  if (customTransport) {
    return customTransport.sendMail({
      to,
      code,
      purpose,
    })
  }

  if (!config.smtpHost || !config.mailFrom || !Number.isInteger(config.smtpPort) || config.smtpPort < 1 || config.smtpPort > 65535) {
    throw new Error('SMTP is not configured')
  }
  const transport = nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure,
    requireTLS: !config.smtpSecure && config.nodeEnv === 'production',
    ...(config.smtpUser ? { auth: { user: config.smtpUser, pass: config.smtpPassword } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false,
  })
  const result = await transport.sendMail({
    from: config.mailFrom, to,
    subject: 'Sol Hair Studio — Mã xác minh',
    text: `Mã xác minh cho ${purpose}: ${code}. Có hiệu lực 5 phút, chỉ dùng một lần.`,
  })
  if (!result.accepted?.length) throw new Error('SMTP recipient rejected')
  return { delivered: true }
}
