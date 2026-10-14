import mongoose from 'mongoose'
import request from 'supertest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { SMTPServer } from 'smtp-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.AUTH_SECRET = 'sol-017-test-secret-at-least-32-bytes-long'
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = ''
  process.env.SMTP_PASSWORD = ''
  process.env.MAIL_FROM = 'sol@example.test'
  process.env.NODE_ENV = 'test'
})

import { app } from '../../../app.js'
import { connectToDatabase, disconnectFromDatabase } from '../../../config/database.js'
import { AccountModel } from '../accounts.model.js'
import { AuthOtpModel } from '../auth-otps.model.js'
import { AuthSessionModel } from '../auth-sessions.model.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { resetMailTransport, setMailTransport } from '../mailer.js'
import { hashPassword } from '../password.js'
import { resetRateLimits } from '../rate-limiter.js'
import { createStaffAccount } from '../auth.service.js'

let replica, mailer, passwordHash
const password = 'CustomerPass123!'
const email = 'customer@example.test'
const body = (overrides = {}) => ({ email, password, displayName: 'Khách thử', ...overrides })
const post = (path, input) => request(app).post(`/api/auth/${path}`).send(input)
const code = () => mailer.getLastEmail().code
const bearer = (token) => `Bearer ${token}`

async function register(overrides) {
  return post('register', body(overrides)).expect(201)
}
async function activeCustomer() {
  await register()
  await post('activate', { email, code: code() }).expect(200)
  const result = await post('login', { email, password }).expect(200)
  return result.body.data.token
}
async function owner() {
  const account = await AccountModel.create({ emailNormalized: 'owner@example.test', roles: ['owner'], status: 'active', passwordHash, emailVerifiedAt: new Date() })
  const result = await post('login', { email: account.emailNormalized, password }).expect(200)
  return { account, token: result.body.data.token }
}
async function unlockCooldown(purpose = 'activate_customer') {
  await AuthOtpModel.updateMany({ purpose }, { $set: { resendAvailableAt: new Date(0) } })
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '8.0.17' } })
  await connectToDatabase(replica.getUri('sol017_test'))
  for (const model of [AccountModel, CustomerModel, AuthOtpModel, AuthSessionModel]) await model.init()
  passwordHash = await hashPassword(password)
}, 180000)

beforeEach(async () => {
  for (const model of [AccountModel, CustomerModel, AuthOtpModel, AuthSessionModel]) await model.deleteMany({})
  resetRateLimits()
  const sentEmails = []
  mailer = {
    async sendMail(message) { sentEmails.push(message) },
    getLastEmail: () => sentEmails.at(-1),
    getSentEmails: () => [...sentEmails],
  }
  setMailTransport(mailer)
})
afterAll(async () => {
  resetMailTransport()
  await disconnectFromDatabase()
  await replica?.stop()
})

describe('SOL-017 API + real isolated MongoDB replica set', { timeout: 30000 }, () => {
  it('registers only customer, hashes password, activates and exposes allowlisted identity/profile', async () => {
    const registered = await register({ roles: ['owner'], status: 'active', emailVerifiedAt: new Date() })
    expect(registered.body.data.roles).toEqual(['customer'])
    expect(registered.body.data.status).toBe('pending_verification')
    const account = await AccountModel.findOne({ emailNormalized: email }).select('+passwordHash')
    expect(account.passwordHash).not.toBe(password)
    expect(account.emailVerifiedAt).toBeUndefined()
    await post('login', { email, password }).expect(403)
    const challenge = await AuthOtpModel.findOne({ accountId: account._id })
    expect(+challenge.expiresAt - +challenge.issuedAt).toBe(300000)
    expect(+challenge.resendAvailableAt - +challenge.issuedAt).toBe(60000)
    expect(challenge.codeDigest).not.toContain(code())
    await post('activate', { email, code: code() }).expect(200)
    const login = await post('login', { email, password }).expect(200)
    const token = login.body.data.token
    const me = await request(app).get('/api/auth/me').set('Authorization', bearer(token)).expect(200)
    expect(me.body.data.customer.displayName).toBe('Khách thử')
    expect(me.body.data.roles).toEqual(['customer'])
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|codeDigest|grantDigest|tokenDigest/)
    const stored = await AuthSessionModel.findOne({ accountId: account._id }).select('+tokenDigest')
    expect(stored.tokenDigest).not.toBe(token)
    await post('activate', { email, code: code() }).expect(400)
  })

  it('validates bad input and rejects duplicate email using the actual unique index', async () => {
    for (const invalid of [{ email: 3 }, { password: 'short' }, { displayName: '' }, { phone: null }, { phone: '0901234567' }]) {
      await post('register', body(invalid)).expect(400)
    }
    await register()
    await post('register', body({ email: ' Customer@Example.Test ' })).expect(409)
    expect(await AccountModel.countDocuments()).toBe(1)
    await request(app).post('/api/auth/login').send([]).expect(400)
  })

  it('rolls back account creation if profile insertion fails', async () => {
    const spy = vi.spyOn(CustomerModel, 'create').mockRejectedValueOnce(new Error('test database failure'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try { await post('register', body()).expect(500) } finally { spy.mockRestore(); log.mockRestore() }
    expect(await AccountModel.countDocuments()).toBe(0)
    expect(await AuthOtpModel.countDocuments()).toBe(0)
    expect(mailer.getSentEmails()).toHaveLength(0)
  })

  it('keeps pending state on mail failure and allows recovery through resend', async () => {
    setMailTransport({ sendMail: async () => { throw new Error('mail down') } })
    await post('register', body()).expect(502)
    expect((await AccountModel.findOne({ emailNormalized: email })).status).toBe('pending_verification')
    setMailTransport(mailer)
    await post('resend-activation', { email }).expect(429)
    await unlockCooldown()
    await post('resend-activation', { email }).expect(200)
    await post('activate', { email, code: code() }).expect(200)
  })

  it('caps simultaneous wrong attempts at 5 and rejects the correct code after lockout', async () => {
    await register()
    const correct = code()
    const wrong = correct === '111111' ? '222222' : '111111'
    const results = await Promise.all(Array.from({ length: 6 }, () => post('activate', { email, code: wrong })))
    expect(results.every((x) => x.status === 400)).toBe(true)
    expect((await AuthOtpModel.findOne({ purpose: 'activate_customer' })).failedAttempts).toBe(5)
    await post('activate', { email, code: correct }).expect(400)
  })

  it('allows exactly one concurrent activation and one concurrent resend generation', async () => {
    await register()
    const previousCode = code()
    await unlockCooldown()
    const resend = await Promise.all([post('resend-activation', { email }), post('resend-activation', { email })])
    expect(resend.filter((x) => x.status === 200)).toHaveLength(1)
    expect((await AuthOtpModel.findOne({ purpose: 'activate_customer' })).generation).toBe(2)
    if (previousCode !== code()) await post('activate', { email, code: previousCode }).expect(400)
    const currentCode = code()
    const results = await Promise.all([post('activate', { email, code: currentCode }), post('activate', { email, code: currentCode })])
    expect(results.filter((x) => x.status === 200)).toHaveLength(1)
    expect(results.filter((x) => x.status === 400)).toHaveLength(1)
  })

  it('rolls OTP consumption back when account activation fails', async () => {
    await register()
    const correct = code()
    const spy = vi.spyOn(AccountModel, 'updateOne').mockRejectedValueOnce(new Error('account write failed'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try { await post('activate', { email, code: correct }).expect(500) } finally { spy.mockRestore(); log.mockRestore() }
    expect((await AuthOtpModel.findOne({ purpose: 'activate_customer' })).consumedAt).toBeUndefined()
    expect((await AccountModel.findOne({ emailNormalized: email })).status).toBe('pending_verification')
    await post('activate', { email, code: correct }).expect(200)
  })

  it('rejects expired codes and wrong purpose without activating', async () => {
    await register()
    await post('otp/verify', { email, purpose: 'activate_staff', code: code() }).expect(400)
    await AuthOtpModel.updateOne({ purpose: 'activate_customer' }, { $set: { expiresAt: new Date(0) } })
    await post('activate', { email, code: code() }).expect(400)
    expect((await AccountModel.findOne({ emailNormalized: email })).status).toBe('pending_verification')
  })

  it('enforces role checks and completes staff activation with a limited one-use proof', async () => {
    const customerToken = await activeCustomer()
    await post('staff', { email: 'staff@example.test' }).expect(401)
    await request(app).post('/api/auth/staff').set('Authorization', bearer(customerToken)).send({ email: 'staff@example.test' }).expect(403)
    resetRateLimits()
    const { token } = await owner()
    const staffEmail = 'staff@example.test'
    const created = await request(app).post('/api/auth/staff').set('Authorization', bearer(token)).send({ email: staffEmail, roles: ['owner'], password }).expect(201)
    expect(created.body.data.roles).toEqual(['stylist'])
    const staff = await AccountModel.findOne({ emailNormalized: staffEmail }).select('+passwordHash')
    expect(staff.passwordHash).toBeUndefined()
    const verified = await post('otp/verify', { email: staffEmail, purpose: 'activate_staff', code: code() }).expect(200)
    const grant = verified.body.data.grant
    expect((await AccountModel.findById(staff._id)).status).toBe('pending_password')
    await request(app).get('/api/auth/me').set('Authorization', bearer(grant)).expect(401)
    await post('password/complete', { email: staffEmail, purpose: 'reset_password', grant, password }).expect(400)
    const input = { email: staffEmail, purpose: 'activate_staff', grant, password }
    const completions = await Promise.all([post('password/complete', input), post('password/complete', input)])
    expect(completions.filter((x) => x.status === 200)).toHaveLength(1)
    expect(completions.filter((x) => x.status === 400)).toHaveLength(1)
    const login = await post('login', { email: staffEmail, password }).expect(200)
    await request(app).post('/api/auth/staff').set('Authorization', bearer(login.body.data.token)).send({ email: 'other@example.test' }).expect(403)
    const me = await request(app).get('/api/auth/me').set('Authorization', bearer(login.body.data.token)).expect(200)
    expect(me.body.data.roles).toEqual(['stylist'])
  })

  it('resets password, invalidates old sessions/password/proofs and never reactivates disabled accounts', async () => {
    const token = await activeCustomer()
    resetRateLimits()
    await post('forgot-password', { email }).expect(200)
    const verified = await post('otp/verify', { email, purpose: 'reset_password', code: code() }).expect(200)
    const grant = verified.body.data.grant
    await post('reset-password', { email: 'other@example.test', grant, password: 'NewPassword123!' }).expect(400)
    await post('reset-password', { email, grant, password: 'NewPassword123!' }).expect(200)
    await request(app).get('/api/auth/me').set('Authorization', bearer(token)).expect(401)
    await post('login', { email, password }).expect(401)
    await post('reset-password', { email, grant, password }).expect(400)
    await post('login', { email, password: 'NewPassword123!' }).expect(200)
    resetRateLimits()
    await unlockCooldown('reset_password')
    await post('forgot-password', { email }).expect(200)
    const next = await post('otp/verify', { email, purpose: 'reset_password', code: code() }).expect(200)
    await AccountModel.updateOne({ emailNormalized: email }, { $set: { status: 'disabled' }, $inc: { authRevision: 1 } })
    await post('reset-password', { email, grant: next.body.data.grant, password }).expect(400)
    await post('forgot-password', { email }).expect(200)
    expect((await AccountModel.findOne({ emailNormalized: email })).status).toBe('disabled')
  })

  it('expires proofs, invalidates them on resend and isolates profiles', async () => {
    const token = await activeCustomer()
    resetRateLimits()
    await CustomerModel.create({ displayName: 'Other', phone: '+84901234567' })
    await request(app).patch('/api/auth/me').set('Authorization', bearer(token)).send({ displayName: 'Updated', phone: '+84901234567', roles: ['owner'], accountId: new mongoose.Types.ObjectId().toString() }).expect(200)
    expect((await CustomerModel.findOne({ displayName: 'Other' })).displayName).toBe('Other')
    await post('forgot-password', { email }).expect(200)
    const verified = await post('otp/verify', { email, purpose: 'reset_password', code: code() }).expect(200)
    await unlockCooldown('reset_password')
    await post('forgot-password', { email }).expect(200)
    await post('reset-password', { email, grant: verified.body.data.grant, password }).expect(400)
    const next = await post('otp/verify', { email, purpose: 'reset_password', code: code() }).expect(200)
    await AuthOtpModel.updateOne({ purpose: 'reset_password' }, { $set: { grantExpiresAt: new Date(0) } })
    await post('reset-password', { email, grant: next.body.data.grant, password }).expect(400)
  })

  it('logout, token expiry and disabled account invalidate access without relying on TTL', async () => {
    const token = await activeCustomer()
    await request(app).post('/api/auth/logout').set('Authorization', bearer(token)).send({}).expect(200)
    await request(app).get('/api/auth/me').set('Authorization', bearer(token)).expect(401)
    const next = await post('login', { email, password }).expect(200)
    await AuthSessionModel.updateMany({}, { $set: { expiresAt: new Date(0) } })
    await request(app).get('/api/auth/me').set('Authorization', bearer(next.body.data.token)).expect(401)
    const last = await post('login', { email, password }).expect(200)
    await AccountModel.updateOne({ emailNormalized: email }, { $set: { status: 'disabled' } })
    await request(app).get('/api/auth/me').set('Authorization', bearer(last.body.data.token)).expect(401)
  })

  it('checks owner authority inside the service as well as the HTTP middleware', async () => {
    const customer = await AccountModel.create({ emailNormalized: email, roles: ['customer'], status: 'active', passwordHash, emailVerifiedAt: new Date() })
    await expect(createStaffAccount({ actorId: customer._id, email: 'staff@example.test' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rate limits spoofed forwarded IP headers and malformed email input safely', async () => {
    for (let i = 0; i < 20; i++) {
      await request(app).post('/api/auth/forgot-password').set('X-Forwarded-For', `192.0.2.${i}`).send({ email: `missing${i}@example.test` }).expect(200)
    }
    await post('forgot-password', { email: 'new@example.test' }).expect(429)
    await post('login', { email: {}, password }).expect(400)
  })

  it('actually sends through SMTP and fails instead of claiming delivery when unconfigured', async () => {
    resetMailTransport()
    // config is immutable; use the configured ephemeral SMTP port through module isolation.
    const messages = []
    const server = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onData(stream, session, callback) {
      let text = ''
      stream.on('data', (chunk) => { text += chunk })
      stream.on('end', () => { messages.push(text); callback() })
    } })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      process.env.SMTP_PORT = String(server.server.address().port)
      vi.resetModules()
      const { sendOtpEmail: smtpSend } = await import('../mailer.js')
      await smtpSend({ to: 'recipient@example.test', code: '123456', purpose: 'activate_customer' })
      expect(messages).toHaveLength(1)
      expect(messages[0]).toContain('123456')
      process.env.MAIL_FROM = ''
      vi.resetModules()
      const { sendOtpEmail: unconfiguredSend } = await import('../mailer.js')
      await expect(unconfiguredSend({ to: 'recipient@example.test', code: '123456', purpose: 'activate_customer' })).rejects.toThrow('SMTP is not configured')
    } finally { process.env.MAIL_FROM = 'sol@example.test'; await new Promise((resolve) => server.close(resolve)) }
  })

  it('creates the real unique customer link index while allowing shared phone and walk-ins', async () => {
    const accountId = new mongoose.Types.ObjectId()
    await CustomerModel.create({ accountId, displayName: 'One', phone: '+84901234567' })
    await expect(CustomerModel.create({ accountId, displayName: 'Two' })).rejects.toMatchObject({ code: 11000 })
    await CustomerModel.create([{ displayName: 'Walk-in' }, { displayName: 'Walk-in 2', phone: '+84901234567' }])
    expect(await CustomerModel.countDocuments()).toBe(3)
  })

  it('enforces a single owner account with the real unique partial index', async () => {
    await owner()
    await expect(AccountModel.create({
      emailNormalized: 'second-owner@example.test', roles: ['owner'],
      status: 'active', passwordHash, emailVerifiedAt: new Date(),
    })).rejects.toMatchObject({ code: 11000 })
    expect(await AccountModel.countDocuments({ roles: 'owner' })).toBe(1)
  })
})
