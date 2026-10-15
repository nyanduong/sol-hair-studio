import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { SignJWT, jwtVerify } from 'jose'
import { config } from '../../config/env.js'
import { CustomerModel } from '../customers/customers.model.js'
import { AccountModel } from './accounts.model.js'
import { AuthChallengeModel } from './auth-challenges.model.js'
import { sendOtpEmail } from './mailer.js'
import { hashPassword, verifyPassword } from './password.js'
import { checkAuthRateLimits } from './rate-limiter.js'

const OTP_EXPIRY_MS = 5 * 60 * 1000
const OTP_RESEND_COOLDOWN_MS = 60 * 1000
const MAX_FAILED_ATTEMPTS = 5
const generateOtp = () => crypto.randomInt(100_000, 1_000_000).toString()
const createOtpDigest = ({ accountId, purpose, generation, code, secret }) => crypto
  .createHmac('sha256', secret)
  .update(`${accountId}:${purpose}:${generation}:${code}`)
  .digest('hex')

export class AuthError extends Error {
  constructor(message, { code = 'AUTH_ERROR', status = 400 } = {}) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.status = status
  }
}

function fail(code, message, status = 400) {
  throw new AuthError(message, { code, status })
}

function secret() {
  if (!config.authSecret || Buffer.byteLength(config.authSecret) < 32) {
    fail('AUTH_NOT_CONFIGURED', 'Cần cấu hình AUTH_SECRET ít nhất 32 byte.', 503)
  }
  return config.authSecret
}

function emailValue(email) {
  if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    fail('INVALID_EMAIL', 'Email không đúng định dạng hoặc vượt quá 254 ký tự.')
  }
  return email.trim().toLowerCase()
}

function limited(input) {
  const email = emailValue(input.email)
  if (!checkAuthRateLimits({ ip: input.ip, email })) {
    fail('RATE_LIMIT_EXCEEDED', 'Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429)
  }
  secret()
  return email
}

function nameValue(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    fail('INVALID_DISPLAY_NAME', 'Tên hiển thị không được để trống và tối đa 120 ký tự.')
  }
  return name.trim()
}

function phoneValue(phone) {
  if (phone === undefined) return undefined
  if (typeof phone !== 'string' || !/^\+[1-9]\d{1,14}$/.test(phone.trim())) {
    fail('INVALID_PHONE', 'Số điện thoại phải ở định dạng chuẩn E.164.')
  }
  return phone.trim()
}

function passwordValue(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    fail('INVALID_PASSWORD', 'Mật khẩu phải từ 8 đến 128 ký tự.')
  }
  return password
}

function accountDto(account) {
  return { accountId: String(account._id), email: account.emailNormalized, roles: account.roles, status: account.status }
}

const JWT_ISSUER = 'sol-hair-studio'
const JWT_AUDIENCE = 'sol-hair-clients'
const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60
const jwtKey = () => crypto.createHmac('sha256', secret()).update('sol-hair-studio/access-token').digest()
const grantDigest = (value, account, purpose, generation) => crypto.createHmac('sha256', secret())
  .update(`${account._id}:${account.authRevision}:${purpose}:${generation}:${value}`).digest('hex')

async function transaction(callback) {
  try {
    return await mongoose.connection.transaction(callback, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000 })
  } catch (error) {
    if (error.code === 11000) fail('EMAIL_ALREADY_EXISTS', 'Email này đã được đăng ký tài khoản.', 409)
    throw error
  }
}

// Real account writes serialize auth changes with disable/reset/login.
async function lockAccount(filter, session) {
  return AccountModel.findOneAndUpdate(filter, { $set: { updatedAt: new Date() } }, { returnDocument: 'after', session }).select('+passwordHash')
}

async function bumpRevision(account, session, extra = {}) {
  const changed = await AccountModel.updateOne(
    { _id: account._id, authRevision: { $eq: account.authRevision, $lt: Number.MAX_SAFE_INTEGER } },
    { $inc: { authRevision: 1 }, $set: extra }, { session },
  )
  if (changed.modifiedCount !== 1) fail('ACCOUNT_CONFLICT', 'Tài khoản đã thay đổi; vui lòng thử lại.', 409)
}

async function issueChallenge(account, purpose, session) {
  const now = new Date()
  const previous = await AuthChallengeModel.findOne({ accountId: account._id, purpose }).session(session).select('+codeDigest +grantDigest')
  if (previous && previous.resendAvailableAt > now) fail('RESEND_COOLDOWN_ACTIVE', 'Vui lòng chờ 60 giây trước khi gửi lại mã.', 429)
  const generation = (previous?.generation || 0) + 1
  if (!Number.isSafeInteger(generation)) fail('CHALLENGE_LIMIT', 'Không thể cấp thêm mã.', 409)
  let code
  do {
    code = generateOtp()
  } while (previous && createOtpDigest({ accountId: account._id, purpose, generation: previous.generation, code, secret: secret() }) === previous.codeDigest)
  await AuthChallengeModel.findOneAndUpdate(
    { accountId: account._id, purpose },
    { $set: {
      generation, codeDigest: createOtpDigest({ accountId: account._id, purpose, generation, code, secret: secret() }),
      issuedAt: now, expiresAt: new Date(+now + OTP_EXPIRY_MS), resendAvailableAt: new Date(+now + OTP_RESEND_COOLDOWN_MS), failedAttempts: 0, updatedAt: now,
    }, $setOnInsert: { createdAt: now }, $unset: { consumedAt: '', verifiedAt: '', grantDigest: '', grantExpiresAt: '', grantConsumedAt: '' } },
    { upsert: true, returnDocument: 'after', session, runValidators: true, timestamps: false },
  )
  return { to: account.emailNormalized, purpose, code }
}

async function deliver(mail) {
  try { await sendOtpEmail(mail) } catch {
    fail('MAIL_DELIVERY_FAILED', 'Không thể gửi email. Có thể yêu cầu gửi lại sau 60 giây.', 502)
  }
}

export async function registerCustomer(input) {
  const emailNormalized = limited(input)
  const displayName = nameValue(input.displayName)
  const phone = phoneValue(input.phone)
  const passwordHash = await hashPassword(passwordValue(input.password))
  const result = await transaction(async (session) => {
    const [account] = await AccountModel.create([{ emailNormalized, passwordHash, roles: ['customer'], status: 'pending_verification' }], { session })
    await CustomerModel.create([{ accountId: account._id, displayName, ...(phone ? { phone } : {}) }], { session })
    return { account: accountDto(account), mail: await issueChallenge(account, 'activate_customer', session) }
  })
  await deliver(result.mail)
  return result.account
}

// M3 owns staff profiles; it calls this service to provision the linked account.
export async function createStaffAccount(input) {
  const emailNormalized = limited(input)
  const result = await transaction(async (session) => {
    const owner = await lockAccount({ _id: input.actorId, status: 'active', roles: 'owner', ...(input.actorRevision !== undefined ? { authRevision: input.actorRevision } : {}) }, session)
    if (!owner) fail('FORBIDDEN', 'Chỉ chủ tiệm được tạo tài khoản nhân viên.', 403)
    const [account] = await AccountModel.create([{ emailNormalized, roles: ['stylist'], status: 'pending_verification' }], { session })
    return { account: accountDto(account), mail: await issueChallenge(account, 'activate_staff', session) }
  })
  await deliver(result.mail)
  return result.account
}

function stateMatches(account, purpose) {
  if (purpose === 'activate_customer') return account.status === 'pending_verification' && account.roles.includes('customer') && !!account.passwordHash
  if (purpose === 'activate_staff') return ['pending_verification', 'pending_password'].includes(account.status) && account.roles.includes('stylist') && !account.passwordHash
  return purpose === 'reset_password' && account.status === 'active'
}

export async function requestOtp(input) {
  const emailNormalized = limited(input)
  if (!['activate_customer', 'activate_staff', 'reset_password'].includes(input.purpose)) fail('INVALID_PURPOSE', 'Mục đích OTP không hợp lệ.')
  const mail = await transaction(async (session) => {
    const account = await lockAccount({ emailNormalized }, session)
    if (!account || !stateMatches(account, input.purpose)) {
      if (input.purpose === 'reset_password') return null
      fail('INVALID_ACCOUNT_STATE', 'Tài khoản không ở trạng thái phù hợp.')
    }
    return issueChallenge(account, input.purpose, session)
  })
  if (mail) await deliver(mail)
  return { message: 'Nếu tài khoản hợp lệ, mã xác minh đã được gửi qua email.' }
}

export const resendCustomerActivationOtp = (input) => requestOtp({ ...input, purpose: 'activate_customer' })

export async function verifyOtp(input) {
  const emailNormalized = limited(input)
  const { purpose, code } = input
  if (!['activate_customer', 'activate_staff', 'reset_password'].includes(purpose)) fail('INVALID_PURPOSE', 'Mục đích OTP không hợp lệ.')
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) fail('INVALID_CODE_FORMAT', 'Mã xác thực phải gồm 6 chữ số.')
  const result = await transaction(async (session) => {
    const account = await lockAccount({ emailNormalized }, session)
    if (!account || !stateMatches(account, purpose)) fail('INVALID_ACCOUNT_STATE', 'Tài khoản không ở trạng thái phù hợp.')
    const now = new Date()
    const challenge = await AuthChallengeModel.findOne({ accountId: account._id, purpose }).session(session).select('+codeDigest +grantDigest')
    if (!challenge) fail('CHALLENGE_NOT_FOUND', 'Không tìm thấy yêu cầu xác minh.')
    if (challenge.consumedAt) fail('CHALLENGE_ALREADY_CONSUMED', 'Mã đã được sử dụng.')
    if (challenge.expiresAt <= now) fail('CHALLENGE_EXPIRED', 'Mã xác thực đã hết hạn.')
    if (challenge.failedAttempts >= MAX_FAILED_ATTEMPTS) fail('MAX_ATTEMPTS_EXCEEDED', 'Mã đã bị vô hiệu sau 5 lần sai.')
    const expected = createOtpDigest({ accountId: account._id, purpose, generation: challenge.generation, code, secret: secret() })
    const matches = /^[a-f0-9]{64}$/.test(challenge.codeDigest) && crypto.timingSafeEqual(Buffer.from(challenge.codeDigest, 'hex'), Buffer.from(expected, 'hex'))
    const filter = { _id: challenge._id, generation: challenge.generation, consumedAt: { $exists: false }, expiresAt: { $gt: now }, failedAttempts: { $lt: MAX_FAILED_ATTEMPTS } }
    if (!matches) {
      // Return error after commit so failedAttempts is not rolled back.
      const updated = await AuthChallengeModel.findOneAndUpdate(filter, { $inc: { failedAttempts: 1 } }, { returnDocument: 'after', session })
      return { error: updated?.failedAttempts >= MAX_FAILED_ATTEMPTS ? 'MAX_ATTEMPTS_EXCEEDED' : 'INVALID_OTP' }
    }
    const grant = purpose === 'activate_customer' ? undefined : crypto.randomBytes(32).toString('base64url')
    const consumed = await AuthChallengeModel.findOneAndUpdate(filter, { $set: {
      consumedAt: now, verifiedAt: now,
      ...(grant ? { grantDigest: grantDigest(grant, { _id: account._id, authRevision: account.authRevision + (purpose === 'activate_staff' ? 1 : 0) }, purpose, challenge.generation), grantExpiresAt: challenge.expiresAt } : {}),
    } }, { returnDocument: 'after', session })
    if (!consumed) fail('CHALLENGE_ALREADY_CONSUMED', 'Mã không còn hiệu lực.')
    if (purpose === 'activate_customer') await bumpRevision(account, session, { status: 'active', emailVerifiedAt: now })
    if (purpose === 'activate_staff') await bumpRevision(account, session, { status: 'pending_password', emailVerifiedAt: now })
    return { success: true, message: grant ? 'OTP hợp lệ. Hãy đặt mật khẩu trước khi proof hết hạn.' : 'Tài khoản đã được kích hoạt thành công.', ...(grant ? { grant, grantExpiresAt: challenge.expiresAt } : {}) }
  })
  if (result.error) fail(result.error, 'Mã xác thực sai hoặc đã đủ 5 lần sai.')
  return result
}

export const verifyCustomerActivation = (input) => verifyOtp({ ...input, purpose: 'activate_customer' })

export async function completePassword(input) {
  const emailNormalized = limited(input)
  if (!['activate_staff', 'reset_password'].includes(input.purpose)) fail('INVALID_PURPOSE', 'Mục đích proof không hợp lệ.')
  if (typeof input.grant !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.grant)) fail('INVALID_GRANT', 'Proof không hợp lệ.')
  const passwordHash = await hashPassword(passwordValue(input.password))
  await transaction(async (session) => {
    const account = await lockAccount({ emailNormalized }, session)
    const requiredStatus = input.purpose === 'activate_staff' ? 'pending_password' : 'active'
    if (!account || account.status !== requiredStatus || !stateMatches(account, input.purpose)) fail('INVALID_GRANT', 'Proof không hợp lệ.')
    const challenge = await AuthChallengeModel.findOne({ accountId: account._id, purpose: input.purpose }).session(session).select('+codeDigest +grantDigest')
    if (!challenge) fail('INVALID_GRANT', 'Proof không hợp lệ.')
    const now = new Date()
    const claimed = await AuthChallengeModel.updateOne({
      _id: challenge._id, generation: challenge.generation,
      grantDigest: grantDigest(input.grant, account, input.purpose, challenge.generation),
      grantConsumedAt: { $exists: false }, consumedAt: { $exists: true },
      grantExpiresAt: { $gt: now }, expiresAt: { $gt: now },
    }, { $set: { grantConsumedAt: now } }, { session })
    if (claimed.modifiedCount !== 1) fail('INVALID_GRANT', 'Proof đã hết hạn, bị thay thế hoặc đã dùng.')
    await bumpRevision(account, session, { passwordHash, status: 'active' })
  })
  return { message: 'Đặt mật khẩu thành công. Vui lòng đăng nhập lại.' }
}

export async function login(input) {
  const emailNormalized = limited(input)
  // Login checks the stored hash; new-password rules apply only when setting a password.
  if (typeof input.password !== 'string' || !input.password.length || input.password.length > 128) {
    fail('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.', 401)
  }
  const account = await AccountModel.findOne({ emailNormalized }).select('+passwordHash')
  if (!account || !await verifyPassword(input.password, account.passwordHash)) fail('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.', 401)
  if (account.status !== 'active') fail('ACCOUNT_NOT_ACTIVE', 'Tài khoản chưa active hoặc đã bị vô hiệu.', 403)
  const current = await AccountModel.exists({ _id: account._id, status: 'active', authRevision: account.authRevision })
  if (!current) fail('INVALID_CREDENTIALS', 'Tài khoản đã thay đổi. Vui lòng đăng nhập lại.', 401)
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiration = issuedAt + TOKEN_LIFETIME_SECONDS
  const token = await new SignJWT({ authRevision: account.authRevision })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(account._id))
    .setJti(crypto.randomUUID())
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiration)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .sign(jwtKey())
  const expiresAt = new Date(expiration * 1000)
  return { token, tokenType: 'Bearer', expiresAt, account: accountDto(account) }
}

export async function authenticate(token) {
  if (typeof token !== 'string' || token.length > 2048) fail('UNAUTHORIZED', 'Cần đăng nhập.', 401)
  const key = jwtKey()
  let payload
  try {
    const verified = await jwtVerify(token, key, {
      algorithms: ['HS256'], typ: 'JWT', issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
      requiredClaims: ['sub', 'iat', 'exp', 'jti', 'authRevision'], maxTokenAge: '8h',
    })
    payload = verified.payload
  } catch { fail('UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn.', 401) }
  if (!/^[a-f0-9]{24}$/i.test(payload.sub) || !Number.isSafeInteger(payload.authRevision) || payload.authRevision < 0 || payload.exp - payload.iat > TOKEN_LIFETIME_SECONDS) {
    fail('UNAUTHORIZED', 'Token không hợp lệ.', 401)
  }
  const account = await AccountModel.findById(payload.sub)
  if (!account || account.status !== 'active' || account.authRevision !== payload.authRevision) fail('UNAUTHORIZED', 'Phiên không còn hiệu lực.', 401)
  const customer = await CustomerModel.findOne({ accountId: account._id })
  return { ...accountDto(account), authRevision: account.authRevision, ...(customer ? { customerId: String(customer._id) } : {}) }
}

export async function logout(identity) {
  const changed = await AccountModel.updateOne(
    { _id: identity.accountId, status: 'active', authRevision: { $eq: identity.authRevision, $lt: Number.MAX_SAFE_INTEGER } },
    { $inc: { authRevision: 1 } },
  )
  if (changed.modifiedCount !== 1) fail('UNAUTHORIZED', 'Tài khoản đã thay đổi; token không còn hiệu lực.', 401)
  return { message: 'Đã đăng xuất trên tất cả thiết bị.' }
}

export async function getMyProfile(identity) {
  const customer = await CustomerModel.findOne({ accountId: identity.accountId }).lean()
  return { accountId: identity.accountId, email: identity.email, roles: identity.roles, status: identity.status,
    ...(customer ? { customer: { customerId: String(customer._id), displayName: customer.displayName, ...(customer.phone ? { phone: customer.phone } : {}) } } : {}) }
}

export async function updateMyProfile(identity, input) {
  const displayName = nameValue(input.displayName)
  const phone = phoneValue(input.phone)
  const customer = await CustomerModel.findOneAndUpdate({ accountId: identity.accountId }, { $set: { displayName, ...(phone ? { phone } : {}) } }, { returnDocument: 'after', runValidators: true })
  if (!customer) fail('CUSTOMER_NOT_FOUND', 'Không có hồ sơ khách.', 404)
  return getMyProfile(identity)
}
