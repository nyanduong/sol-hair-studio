import { createHmac } from 'node:crypto'
import mongoose from 'mongoose'
import request from 'supertest'
import { SignJWT } from 'jose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.AUTH_SECRET = 'sol030-test-secret-at-least-32-bytes-long'
  process.env.NODE_ENV = 'test'
})
import { app } from '../../../app.js'
import { connectToDatabase, disconnectFromDatabase } from '../../../config/database.js'
import { AccountModel } from '../../auth/accounts.model.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { ServiceModel } from '../../services/services.model.js'
import { StaffModel } from '../../staff/staff.model.js'
import { StaffShiftModel } from '../../staff/staff-shifts.model.js'
import { calculateStaffSlots, parseAvailabilityQuery } from '../availability.service.js'

const NOW = new Date('2026-10-21T03:00:00.000Z') // 10:00 salon time
const at = time => new Date(`2026-10-21T${time}+07:00`)
const oid = () => new mongoose.Types.ObjectId()
const models = [AccountModel, CustomerModel, ServiceModel, StaffModel, StaffShiftModel]
let replica, owner, customer, stylist, staff, customerProfile
let serial = 0

async function actor(role) {
  const account = await AccountModel.create({ emailNormalized: `sol030-${++serial}@example.test`,
    roles: [role], status: 'active', passwordHash: 'synthetic-test-hash', emailVerifiedAt: NOW })
  const token = await new SignJWT({ authRevision: 0 }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(account._id)).setJti(String(oid())).setIssuedAt().setExpirationTime('1h')
    .setIssuer('sol-hair-studio').setAudience('sol-hair-clients')
    .sign(createHmac('sha256', process.env.AUTH_SECRET).update('sol-hair-studio/access-token').digest())
  return { account, token }
}
function get(query = {}, acting = customer) {
  return request(app).get('/api/availability').set('Authorization', `Bearer ${acting.token}`)
    .query({ serviceIds: 'cut', localDate: '2026-10-21', ...query })
}
function starts(response) { return response.body.data.stylists[0]?.slots.map(slot => slot.startAt) ?? [] }
async function busy(overrides = {}) {
  // Synthetic calendar fixtures inserted into the existing shared collection, no second model.
  await mongoose.connection.db.collection('appointments').insertOne({
    staffId: staff._id, customerId: oid(), status: 'confirmed', startAt: at('10:30:00'), endAt: at('11:00:00'),
    occupiedFrom: at('10:30:00'), occupiedUntil: at('11:10:00'), ...overrides,
  })
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '8.0.17' } })
  await connectToDatabase(replica.getUri('sol030_availability_test'))
  for (const model of models) await model.init()
}, 180000)
afterAll(async () => { await disconnectFromDatabase(); if (replica) await replica.stop() })
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW)
  for (const model of models) await model.deleteMany({})
  for (const name of ['appointments', 'staff_time_off']) await mongoose.connection.db.collection(name).deleteMany({})
  owner = await actor('owner'); customer = await actor('customer'); stylist = await actor('stylist')
  customerProfile = await CustomerModel.create({ accountId: customer.account._id, displayName: 'Synthetic customer', phone: '+84901234567' })
  staff = await StaffModel.create({ accountId: stylist.account._id, displayName: 'Synthetic stylist', serviceIds: ['cut', 'spa'] })
  await ServiceModel.create(['cut', 'spa'].map(id => ({ id, slug: id, name: id, description: 'Synthetic service',
    category: 'Hair', durationMinutes: { min: 20, max: 45 }, bookingDurationMinutes: 30,
    priceVnd: id === 'cut' ? 0 : 100000, imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' })))
  await StaffShiftModel.create({ staffId: staff._id, localDate: '2026-10-21', startAt: at('09:00:00'), endAt: at('13:00:00') })
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('SOL-030 availability HTTP + MongoDB', () => {
  it('returns server totals, 15-minute grid, inclusive 30-minute lead and cleanup inside one shift', async () => {
    const response = await get({ serviceIds: 'cut,spa' }).expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.data).toMatchObject({ totalPriceVnd: 100000, totalDurationMinutes: 60, bufferAfterMinutes: 10, timeZone: 'Asia/Ho_Chi_Minh' })
    expect(starts(response)[0]).toBe(at('10:30:00').toISOString())
    expect(starts(response).at(-1)).toBe(at('11:45:00').toISOString())
    expect(Object.keys(response.body.data.stylists[0]).sort()).toEqual(['displayName', 'slots', 'staffId'])
    expect(response.body.data.items[0]).toEqual({ serviceId: 'cut', name: 'cut', priceVnd: 0, durationMinutes: 30 })
    expect(await mongoose.connection.db.collection('appointments').countDocuments()).toBe(0)
  })
  it('excludes staff missing any skill, inactive/disabled staff and includes the owner as a stylist', async () => {
    await StaffModel.updateOne({ _id: staff._id }, { serviceIds: ['cut'] })
    expect((await get({ serviceIds: 'cut,spa' }).expect(200)).body.data.stylists).toEqual([])
    await StaffModel.updateOne({ _id: staff._id }, { isActive: false })
    expect((await get().expect(200)).body.data.stylists).toEqual([])
    await StaffModel.updateOne({ _id: staff._id }, { isActive: true })
    await AccountModel.updateOne({ _id: stylist.account._id }, { status: 'disabled' })
    expect((await get().expect(200)).body.data.stylists).toEqual([])
    await StaffModel.updateOne({ _id: staff._id }, { accountId: owner.account._id, serviceIds: ['cut', 'spa'] })
    expect((await get({ serviceIds: 'cut,spa' }).expect(200)).body.data.stylists).toHaveLength(1)
  })
  it('does not invent shifts or combine adjacent shifts; cancelled shifts do not open booking', async () => {
    await StaffShiftModel.deleteMany({})
    expect(starts(await get().expect(200))).toEqual([])
    for (const [start, end] of [['10:30:00', '11:00:00'], ['11:00:00', '11:30:00']]) {
      await StaffShiftModel.create({ staffId: staff._id, localDate: '2026-10-21', startAt: at(start), endAt: at(end) })
    }
    expect(starts(await get().expect(200))).toEqual([])
    await StaffShiftModel.updateMany({}, { status: 'cancelled' })
    expect(starts(await get().expect(200))).toEqual([])
  })
  it('blocks existing bookings including cleanup, and accepts touching half-open intervals', async () => {
    await busy()
    const result = starts(await get().expect(200))
    expect(result).not.toContain(at('11:00:00').toISOString())
    expect(result[0]).toBe(at('11:15:00').toISOString())
    await mongoose.connection.db.collection('appointments').deleteMany({})
    await busy({ startAt: at('11:10:00'), endAt: at('11:40:00'), occupiedFrom: at('11:10:00'), occupiedUntil: at('11:50:00') })
    expect(starts(await get().expect(200))).toContain(at('10:30:00').toISOString())
  })
  it.each(['cancelled', 'no_show'])('ignores %s bookings', async status => {
    await busy({ status })
    expect(starts(await get().expect(200))[0]).toBe(at('10:30:00').toISOString())
  })
  it('releases unused planned time after actual completion and cleanup', async () => {
    await busy({ status: 'completed', startedAt: at('09:00:00'), completedAt: at('10:25:00'),
      startAt: at('09:00:00'), endAt: at('12:00:00'), occupiedFrom: at('09:00:00'), occupiedUntil: at('10:35:00') })
    expect(starts(await get().expect(200))[0]).toBe(at('10:45:00').toISOString())
  })
  it('honors future ETA, and treats overdue in-progress appointments as unknown until completion', async () => {
    await busy({ status: 'in_progress', startAt: at('09:00:00'), startedAt: at('09:00:00'), endAt: at('09:30:00'),
      occupiedFrom: at('09:00:00'), occupiedUntil: at('09:40:00') })
    expect(starts(await get().expect(200))).toEqual([])
    await mongoose.connection.db.collection('appointments').updateMany({}, { $set: { estimatedEndAt: at('11:00:00'), occupiedUntil: at('11:10:00') } })
    expect(starts(await get().expect(200))[0]).toBe(at('11:15:00').toISOString())
    await mongoose.connection.db.collection('appointments').updateMany({}, { $set: { estimatedEndAt: at('09:59:00') } })
    expect(starts(await get().expect(200))).toEqual([])
  })
  it('subtracts time off using half-open intervals', async () => {
    await mongoose.connection.db.collection('staff_time_off').insertOne({ staffId: staff._id, startAt: at('11:10:00'), endAt: at('12:00:00') })
    const result = starts(await get().expect(200))
    expect(result).toContain(at('10:30:00').toISOString())
    expect(result).not.toContain(at('10:45:00').toISOString())
    expect(result).toContain(at('12:00:00').toISOString())
  })
  it('filters the authenticated customer across stylists without applying staff cleanup to that customer', async () => {
    await busy({ staffId: oid(), customerId: customerProfile._id })
    const result = starts(await get().expect(200))
    expect(result).not.toContain(at('10:45:00').toISOString())
    expect(result).toContain(at('11:00:00').toISOString())
    await mongoose.connection.db.collection('appointments').updateMany({}, { $set: { customerId: oid() } })
    expect(starts(await get().expect(200))).toContain(at('10:30:00').toISOString())
  })
  it('lets owner filter the selected customer and rejects arbitrary customer access by customers', async () => {
    await busy({ staffId: oid(), customerId: customerProfile._id })
    expect(starts(await get({ customerId: String(customerProfile._id) }, owner).expect(200))[0]).toBe(at('10:00:00').toISOString())
    expect(starts(await get({ customerId: String(customerProfile._id) }, owner).expect(200))).not.toContain(at('10:30:00').toISOString())
    await get({ customerId: String(customerProfile._id) }).expect(403)
    await get({ customerId: String(oid()) }, owner).expect(404)
  })
  it('blocks customer overrun on a different stylist without leaking another appointment', async () => {
    await busy({ staffId: oid(), customerId: customerProfile._id, status: 'in_progress', startAt: at('09:00:00'),
      startedAt: at('09:00:00'), endAt: at('09:30:00'), occupiedFrom: at('09:00:00'), occupiedUntil: at('09:40:00') })
    expect(starts(await get().expect(200))).toEqual([])
  })
  it('uses exact server-now for walk-in, never a client timestamp or rounded slot', async () => {
    const now = at('10:07:12.345'); vi.setSystemTime(now)
    const response = await get({ mode: 'owner_walkin' }, owner).expect(200)
    expect(starts(response)).toEqual([now.toISOString()])
    expect(response.body.data.stylists[0].slots[0].occupiedUntil).toBe(at('10:47:12.345').toISOString())
    await get({ mode: 'owner_walkin' }).expect(403)
    await get({ mode: 'owner_walkin', startAt: at('09:00:00').toISOString() }, owner).expect(400)
    await busy({ startAt: at('10:00:00'), occupiedFrom: at('10:00:00') })
    expect(starts(await get({ mode: 'owner_walkin' }, owner).expect(200))).toEqual([])
  })
  it('includes the exact 168-hour horizon but not the next grid slot', async () => {
    await StaffShiftModel.create({ staffId: staff._id, localDate: '2026-10-28', startAt: new Date('2026-10-28T09:00:00+07:00'), endAt: new Date('2026-10-28T13:00:00+07:00') })
    const response = await get({ localDate: '2026-10-28' }).expect(200)
    expect(starts(response).at(-1)).toBe('2026-10-28T03:00:00.000Z')
    await get({ localDate: '2026-10-29' }).expect(400)
  })
  it('uses local salon dates across UTC midnight and excludes past times', async () => {
    vi.setSystemTime(new Date('2026-10-20T17:00:00.001Z'))
    customer = await actor('customer')
    await StaffShiftModel.create({ staffId: staff._id, localDate: '2026-10-21', startAt: at('00:00:00'), endAt: at('02:00:00') })
    expect(starts(await get().expect(200))[0]).toBe(at('00:45:00').toISOString())
    await get({ localDate: '2026-10-20' }).expect(400)
  })
  it('filters by staffId and returns no staff for an unknown id', async () => {
    expect((await get({ staffId: String(staff._id) }).expect(200)).body.data.stylists).toHaveLength(1)
    expect((await get({ staffId: String(oid()) }).expect(200)).body.data.stylists).toEqual([])
  })
  it('rejects hidden/missing services and unconfigured fixed durations instead of inferring min/max', async () => {
    await get({ serviceIds: 'missing' }).expect(409)
    await ServiceModel.updateOne({ id: 'cut' }, { isActive: false })
    await get().expect(409)
    await ServiceModel.updateOne({ id: 'cut' }, { isActive: true, $unset: { bookingDurationMinutes: '' } })
    expect((await get().expect(409)).body.code).toBe('SERVICE_BOOKING_NOT_CONFIGURED')
    await ServiceModel.collection.updateOne({ id: 'cut' }, { $set: { bookingDurationMinutes: 300 } })
    expect((await get().expect(409)).body.code).toBe('SERVICE_BOOKING_NOT_CONFIGURED')
  })
  it('keeps the legacy public catalog DTO unchanged after adding fixed booking duration', async () => {
    const response = await request(app).get('/api/services').expect(200)
    expect(Object.keys(response.body.data[0]).sort()).toEqual(['id', 'slug', 'name', 'description', 'category', 'durationMinutes', 'priceVnd', 'imageUrl'].sort())
  })
  it.each([
    { serviceIds: '' }, { serviceIds: 'cut,cut' }, { serviceIds: 'a,b,c,d,e,f' }, { serviceIds: ['cut', 'spa'] },
    { localDate: '2026-02-30' }, { localDate: ['2026-10-21', '2026-10-22'] }, { staffId: 'bad' }, { mode: ['scheduled', 'owner_walkin'] },
    { mode: 'bad' }, { totalPriceVnd: '0' }, { localDate: '2026-10-20' },
  ])('rejects malformed or unauthorized input %j', async query => { await get(query).expect(400) })
  it('requires a live active session and the customer/owner role', async () => {
    await request(app).get('/api/availability').expect(401)
    await get({}, stylist).expect(403)
    await AccountModel.updateOne({ _id: customer.account._id }, { status: 'disabled' })
    await get().expect(401)
  })
  it('returns 503 when database is disconnected', async () => {
    await disconnectFromDatabase()
    try { await get().expect(503) } finally { await connectToDatabase(replica.getUri('sol030_availability_test')) }
  })
})

describe('duration schema and deterministic calculation boundaries', () => {
  it.each([null, 0, 1.5, 481, 19, 46])('rejects invalid fixed duration %s', async value => {
    const service = new ServiceModel({ id: 'x', slug: 'x', name: 'x', description: 'x', category: 'x',
      durationMinutes: { min: 20, max: 45 }, priceVnd: 0, imageUrl: 'https://res.cloudinary.com/demo/a', bookingDurationMinutes: value })
    await expect(service.validate()).rejects.toHaveProperty('errors.bookingDurationMinutes')
  })
  it('does not impose an invented 480-minute cap on a multi-service appointment', () => {
    const options = parseAvailabilityQuery({ serviceIds: 'a,b,c,d,e', localDate: '2026-10-21' }, { roles: ['owner'] }, NOW)
    const slots = calculateStaffSlots('staff', options, { shifts: [{ staffId: 'staff', startAt: at('00:00:00'), endAt: at('23:59:00') }], timeOff: [], appointments: [] }, 600, NOW)
    expect(slots[0].startAt).toBe(NOW.toISOString())
    expect(slots[0].endAt).toBe(at('20:00:00').toISOString())
  })
})
