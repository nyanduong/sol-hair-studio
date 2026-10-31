import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import request from 'supertest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'
  process.env.AUTH_SECRET = 'sol037-ejs-integration-isolated-secret-32bytes'
})

import { app } from '../../../app.js'
import { connectToDatabase, disconnectFromDatabase } from '../../../config/database.js'
import { AccountModel } from '../../auth/accounts.model.js'
import { hashPassword } from '../../auth/password.js'
import { resetRateLimits } from '../../auth/rate-limiter.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { StaffModel } from '../../staff/staff.model.js'
import { StaffShiftModel } from '../../staff/staff-shifts.model.js'
import { ServiceModel } from '../../services/services.model.js'
import { AppointmentModel } from '../../appointments/appointments.model.js'
import { AppointmentEventModel } from '../../appointments/appointment-events.model.js'
import { BookingRequestModel } from '../../appointments/booking-requests.model.js'
import { prepareBookingStorage } from '../../appointments/booking.repository.js'
import * as repository from '../../appointments/appointments.repository.js'

const DATABASE = 'sol037_ejs_isolated_regression'
const NOW = new Date('2026-10-31T03:00:00.000Z') // 10:00 tại salon.
const PASSWORD = 'ejs-test-fixture-password'
const models = [AccountModel, CustomerModel, StaffModel, StaffShiftModel, ServiceModel,
  AppointmentModel, AppointmentEventModel, BookingRequestModel]
let replica, passwordHash, browser, owner, customer, staff, otherStaff, token

beforeAll(async () => {
  // Chỉ dùng replica set tạm được tạo ở đây, không nhận URI từ môi trường.
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '8.0.17' } })
  await connectToDatabase(replica.getUri(DATABASE))
  for (const model of models) await model.init()
  await prepareBookingStorage()
  passwordHash = await hashPassword(PASSWORD)
}, 180000)

beforeEach(async () => {
  expect(mongoose.connection.name).toBe(DATABASE)
  for (const model of models) await model.deleteMany({})
  resetRateLimits()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  const accounts = await AccountModel.create([
    { emailNormalized: 'owner-ejs@example.test', roles: ['owner'], status: 'active', passwordHash, emailVerifiedAt: NOW },
    { emailNormalized: 'stylist-ejs@example.test', roles: ['stylist'], status: 'active', passwordHash, emailVerifiedAt: NOW },
    { emailNormalized: 'customer-ejs@example.test', roles: ['customer'], status: 'active', passwordHash, emailVerifiedAt: NOW },
  ])
  owner = accounts[0]
  customer = await CustomerModel.create({ accountId: accounts[2]._id, displayName: 'EJS Customer', phone: '+84900000037' })
  const people = await StaffModel.create([
    { accountId: owner._id, displayName: 'Owner Stylist', serviceIds: ['ejs-cut'] },
    { accountId: accounts[1]._id, displayName: 'Other Stylist', serviceIds: ['ejs-cut'] },
  ])
  ;[staff, otherStaff] = people
  await StaffShiftModel.create(people.map(person => ({
    staffId: person._id, localDate: '2026-10-31',
    startAt: new Date('2026-10-31T01:00:00.000Z'), endAt: new Date('2026-10-31T13:00:00.000Z'),
  })))
  await ServiceModel.create({
    id: 'ejs-cut', slug: 'ejs-cut', name: 'EJS test cut', description: 'Synthetic fixture', category: 'Hair',
    durationMinutes: { min: 45, max: 45 }, bookingDurationMinutes: 45,
    priceVnd: 450000, imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  })
  browser = request.agent(app)
  const login = await browser.post('/admin/login').type('form')
    .send({ email: owner.emailNormalized, password: PASSWORD }).expect(302)
  token = login.headers['set-cookie'][0].split(';')[0].slice('sol_admin_token='.length)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

afterAll(async () => {
  await disconnectFromDatabase()
  if (replica) await replica.stop()
})

async function booking({ startAt = '2026-10-31T04:00:00.000Z', staffId = staff._id, guest = false } = {}) {
  const response = await request(app).post('/api/appointments')
    .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID())
    .send({
      bookingMode: 'owner_scheduled', serviceIds: ['ejs-cut'], staffId: String(staffId), startAt,
      ...(guest ? { guestCustomer: { displayName: 'Another EJS guest', phone: '+84900000038' } } : { customerId: String(customer._id) }),
    }).expect(201)
  return response.body.data.id
}

function submit(id, operation, fields = {}, key = randomUUID()) {
  return browser.post(`/admin/appointments/${id}/${operation}?view=mine&localDate=2026-10-31`)
    .type('form').send({ expectedRevision: '0', commandKey: key, ...fields })
}

async function stored(id) { return AppointmentModel.findById(id).lean() }
async function eventCount(id) { return AppointmentEventModel.countDocuments({ appointmentId: id }) }

describe('SOL-037 EJS with real Login, Services and isolated MongoDB transactions', () => {
  it('renders list/personal filters and detail using the real Admin cookie', async () => {
    const mine = await booking()
    await booking({ startAt: '2026-10-31T06:00:00.000Z', staffId: otherStaff._id, guest: true })
    const list = await browser.get('/admin/appointments?localDate=2026-10-31&view=mine').expect(200)
    expect(list.text).toContain(mine)
    expect(list.text).toContain('Lịch được giao cho')
    expect(list.text).not.toContain('Another EJS guest')
    const detail = await browser.get(`/admin/appointments/${mine}?view=mine`).expect(200)
    expect(detail.text).toContain('EJS test cut')
    expect(detail.text).toContain('data-owner-panel')
    expect(detail.text).toContain(`/${mine}/start?view=mine`)
  })

  it('reschedules both time and Stylist, keeps snapshots, records audit and replays only once', async () => {
    const id = await booking()
    const before = await stored(id)
    const choices = await browser.get(`/admin/appointments/${id}/reschedule?localDate=2026-10-31`).expect(200)
    expect(choices.text).toContain(String(otherStaff._id))
    expect(choices.text).toContain('name="customerAgreementConfirmed"')
    const fields = { startAt: '2026-10-31T06:00:00.000Z', staffId: String(otherStaff._id), reason: 'Customer agreed', customerAgreementConfirmed: 'true' }
    const key = randomUUID()
    await submit(id, 'reschedule', fields, key).expect(200)
    await submit(id, 'reschedule', fields, key).expect(200)
    const after = await stored(id)
    expect(after.staffId).toEqual(otherStaff._id)
    expect(after.startAt.toISOString()).toBe(fields.startAt)
    expect(after.items).toEqual(before.items)
    expect(after.revision).toBe(1)
    expect(await eventCount(id)).toBe(2)
    expect(await AppointmentEventModel.findOne({ appointmentId: id, kind: 'rescheduled' }).lean()).toMatchObject({ reason: fields.reason })
  })

  it('rejects a conflicting reschedule without changing the original appointment', async () => {
    const id = await booking()
    await booking({ startAt: '2026-10-31T06:00:00.000Z', staffId: otherStaff._id, guest: true })
    const before = await stored(id)
    await submit(id, 'reschedule', {
      startAt: '2026-10-31T06:00:00.000Z', staffId: String(otherStaff._id), reason: 'Customer agreed', customerAgreementConfirmed: 'true',
    }).expect(409)
    expect(await stored(id)).toEqual(before)
    expect(await eventCount(id)).toBe(1)
  })

  it('requires a reason for late cancellation, cancels and replays without a second event', async () => {
    const id = await booking()
    await submit(id, 'cancel').expect(400)
    const key = randomUUID()
    const response = await submit(id, 'cancel', { reason: 'EJS cancellation' }, key).expect(200)
    expect(response.text).toContain('Đã hủy lịch hẹn')
    await submit(id, 'cancel', { reason: 'EJS cancellation' }, key).expect(200)
    expect(await stored(id)).toMatchObject({ status: 'cancelled', revision: 1 })
    expect(await eventCount(id)).toBe(2)
    const detail = await browser.get(`/admin/appointments/${id}`).expect(200)
    expect(detail.text).not.toContain(`/${id}/cancel`)
  })

  it('enforces the no-show 15-minute cutoff and contact time, then records no-show once', async () => {
    const id = await booking()
    vi.setSystemTime('2026-10-31T04:14:00.000Z')
    await submit(id, 'no-show', { contactAttemptedLocal: '2026-10-31T11:10' }).expect(409)
    vi.setSystemTime('2026-10-31T04:15:00.000Z')
    await submit(id, 'no-show', { contactAttemptedLocal: '2026-10-31T11:16' }).expect(400)
    const key = randomUUID()
    await submit(id, 'no-show', { contactAttemptedLocal: '2026-10-31T11:10' }, key).expect(200)
    await submit(id, 'no-show', { contactAttemptedLocal: '2026-10-31T11:10' }, key).expect(200)
    expect(await stored(id)).toMatchObject({ status: 'no_show', revision: 1, contactAttemptedAt: new Date('2026-10-31T04:10:00.000Z') })
    expect(await eventCount(id)).toBe(2)
  })

  it('starts at the scheduled time and completes with actual times plus 10 minutes cleanup', async () => {
    const id = await booking()
    vi.setSystemTime('2026-10-31T04:00:00.000Z')
    await submit(id, 'start', { serviceConfirmed: 'true' }).expect(200)
    vi.setSystemTime('2026-10-31T04:20:00.000Z')
    const response = await submit(id, 'complete', { expectedRevision: '1', serviceConfirmed: 'true' }).expect(200)
    expect(response.text).toContain('11:30')
    expect(await stored(id)).toMatchObject({
      status: 'completed', revision: 2, startedAt: new Date('2026-10-31T04:00:00.000Z'),
      completedAt: new Date('2026-10-31T04:20:00.000Z'), occupiedUntil: new Date('2026-10-31T04:30:00.000Z'),
    })
    expect(await eventCount(id)).toBe(3)
  })

  it('starts early and corrects accidental start, preserving earlier audit events', async () => {
    const id = await booking()
    await submit(id, 'start').expect(200)
    expect((await stored(id)).startedAt).toEqual(NOW)
    await submit(id, 'correct-start', { expectedRevision: '1', reason: 'Accidental start', serviceNotStarted: 'true' }).expect(200)
    const after = await stored(id)
    expect(after).toMatchObject({ status: 'confirmed', revision: 2 })
    expect(after.startedAt).toBeUndefined()
    expect(await eventCount(id)).toBe(3)
    expect(await AppointmentEventModel.countDocuments({ appointmentId: id, kind: 'started' })).toBe(1)
  })

  it('updates ETA, warns about affected appointments and renders warnings again on detail reload', async () => {
    const id = await booking()
    const affectedId = await booking({ startAt: '2026-10-31T05:00:00.000Z', guest: true })
    const beforeOther = await stored(affectedId)
    await submit(id, 'start').expect(200)
    const response = await submit(id, 'eta', { expectedRevision: '1', estimatedEndLocal: '2026-10-31T12:15' }).expect(200)
    expect(response.text).toContain(affectedId)
    expect(response.text).toContain('Trùng thời gian Stylist')
    const after = await stored(id)
    expect(after.estimatedEndAt.toISOString()).toBe('2026-10-31T05:15:00.000Z')
    expect(after.occupiedUntil.toISOString()).toBe('2026-10-31T05:25:00.000Z')
    expect(await stored(affectedId)).toEqual(beforeOther)
    const detail = await browser.get(`/admin/appointments/${id}?view=mine`).expect(200)
    expect(detail.text).toContain(affectedId)
    expect(detail.text).toContain('Lịch bị ảnh hưởng')
  })

  it('rejects invalid calendar dates and an ETA not after the planned end', async () => {
    const id = await booking()
    await submit(id, 'start').expect(200)
    const before = await stored(id)
    for (const estimatedEndLocal of ['2026-02-30T12:00', '2026-10-31T11:45']) {
      await submit(id, 'eta', { expectedRevision: '1', estimatedEndLocal }).expect(400)
    }
    expect(await stored(id)).toEqual(before)
    expect(await eventCount(id)).toBe(2)
  })

  it('requires confirmation and a future ETA when correcting completion after planned end', async () => {
    const id = await booking()
    await submit(id, 'start').expect(200)
    vi.setSystemTime('2026-10-31T03:20:00.000Z')
    await submit(id, 'complete', { expectedRevision: '1' }).expect(200)
    vi.setSystemTime('2026-10-31T05:00:00.000Z')
    await submit(id, 'correct-complete', { expectedRevision: '2', reason: 'Accidental completion' }).expect(400)
    await submit(id, 'correct-complete', { expectedRevision: '2', reason: 'Accidental completion', serviceNotCompleted: 'true' }).expect(400)
    await submit(id, 'correct-complete', {
      expectedRevision: '2', reason: 'Accidental completion', serviceNotCompleted: 'true', estimatedEndLocal: '2026-10-31T12:30',
    }).expect(200)
    const after = await stored(id)
    expect(after).toMatchObject({ status: 'in_progress', revision: 3, startedAt: NOW })
    expect(after.completedAt).toBeUndefined()
    expect(after.estimatedEndAt.toISOString()).toBe('2026-10-31T05:30:00.000Z')
    expect(await eventCount(id)).toBe(4)
  })

  it('renders correction conflicts and rolls back if released time has been booked', async () => {
    const id = await booking()
    await submit(id, 'start').expect(200)
    vi.setSystemTime('2026-10-31T03:20:00.000Z')
    await submit(id, 'complete', { expectedRevision: '1' }).expect(200)
    const conflictId = await booking({ startAt: '2026-10-31T03:45:00.000Z', guest: true })
    const before = await stored(id)
    const response = await submit(id, 'correct-complete', {
      expectedRevision: '2', reason: 'Accidental completion', serviceNotCompleted: 'true',
    }).expect(409)
    expect(response.text).toContain(conflictId)
    expect(response.text).toContain('Cần xử lý xung đột')
    expect(await stored(id)).toEqual(before)
    expect(await eventCount(id)).toBe(3)
  })

  it('rejects stale revisions and a reused key with a changed payload', async () => {
    const id = await booking()
    const key = randomUUID()
    await submit(id, 'start', {}, key).expect(200)
    await submit(id, 'complete').expect(409)
    await submit(id, 'start', { expectedRevision: '1' }, key).expect(409)
    expect(await stored(id)).toMatchObject({ status: 'in_progress', revision: 1 })
    expect(await eventCount(id)).toBe(2)
  })

  it('rolls back appointment, guards and audit after an injected failure and retries the same form', async () => {
    const id = await booking()
    const before = await stored(id)
    const staffBefore = await StaffModel.findById(staff._id).lean()
    const customerBefore = await CustomerModel.findById(customer._id).lean()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(repository, 'insertAppointmentEvent').mockRejectedValueOnce(new Error('Synthetic EJS audit failure'))
    const key = randomUUID()
    const response = await submit(id, 'start', {}, key).expect(500)
    expect(response.text).toContain('Gửi lại cùng yêu cầu')
    expect(response.text).toContain(key)
    expect(await stored(id)).toEqual(before)
    expect((await StaffModel.findById(staff._id).lean()).bookingRevision).toBe(staffBefore.bookingRevision)
    expect((await CustomerModel.findById(customer._id).lean()).bookingRevision).toBe(customerBefore.bookingRevision)
    expect(await eventCount(id)).toBe(1)
    await submit(id, 'start', {}, key).expect(200)
    expect(await eventCount(id)).toBe(2)
  })

  it('renders real audit before/after data with cursor pagination and retained workspace', async () => {
    const id = await booking()
    await submit(id, 'start').expect(200)
    await submit(id, 'correct-start', { expectedRevision: '1', reason: 'Accidental start', serviceNotStarted: 'true' }).expect(200)
    const response = await browser.get(`/admin/appointments/${id}/audit?view=mine&localDate=2026-10-31&limit=1`).expect(200)
    expect(response.text).toContain('Accidental start')
    expect(response.text).toContain('Xem dữ liệu trước và sau')
    const next = response.text.match(/href="([^"]*\/audit\?[^"]*cursor=[^"]*)"/)
    expect(next).not.toBeNull()
    const second = await browser.get(next[1].replaceAll('&amp;', '&')).expect(200)
    expect(second.text).toContain('Bắt đầu phục vụ')
    expect(second.text).toContain('view=mine')
  })

  it('rejects a real Customer token on Admin EJS without modifying an appointment', async () => {
    const id = await booking()
    const response = await request(app).post('/api/auth/login')
      .send({ email: 'customer-ejs@example.test', password: PASSWORD }).expect(200)
    const before = await stored(id)
    const denied = await request(app).post(`/admin/appointments/${id}/start`)
      .set('Cookie', `sol_admin_token=${response.body.data.token}`).type('form')
      .send({ expectedRevision: '0', commandKey: randomUUID() }).expect(302)
    expect(denied.headers.location).toBe('/admin/login?error=forbidden')
    expect(await stored(id)).toEqual(before)
  })

  it('logs out through the shared Admin flow and blocks the next appointment request', async () => {
    await browser.post('/admin/logout').expect(302)
    const response = await browser.get('/admin/appointments').expect(302)
    expect(response.headers.location).toBe('/admin/login')
    expect((await AccountModel.findById(owner._id).lean()).authRevision).toBeGreaterThan(0)
  })
})
