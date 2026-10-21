import { createHmac } from 'node:crypto'
import mongoose from 'mongoose'
import request from 'supertest'
import { SignJWT } from 'jose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.AUTH_SECRET = 'sol031-test-secret-at-least-32-bytes-long'
  process.env.NODE_ENV = 'test'
})
import { app } from '../../../app.js'
import { connectToDatabase, disconnectFromDatabase } from '../../../config/database.js'
import { AccountModel } from '../../auth/accounts.model.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { ServiceModel } from '../../services/services.model.js'
import { StaffModel } from '../../staff/staff.model.js'
import { StaffShiftModel } from '../../staff/staff-shifts.model.js'
import { AppointmentModel } from '../appointments.model.js'
import { AppointmentEventModel } from '../appointment-events.model.js'
import { BookingRequestModel } from '../booking-requests.model.js'
import { prepareBookingStorage } from '../booking.repository.js'
import { createBooking } from '../booking.service.js'
import * as availabilityRepository from '../../availability/availability.repository.js'

const NOW = new Date('2026-10-21T03:00:00.000Z')
const at = (time) => new Date(`2026-10-21T${time}+07:00`)
const oid = () => new mongoose.Types.ObjectId()
const KEY = 'sol031-request-key-0001'
const models = [
  AccountModel,
  CustomerModel,
  ServiceModel,
  StaffModel,
  StaffShiftModel,
  AppointmentModel,
  AppointmentEventModel,
  BookingRequestModel,
]
let replica, owner, customer, other, stylist, secondStylist
let serial = 0

async function actor(role) {
  const account = await AccountModel.create({
    emailNormalized: `sol031-${++serial}@example.test`,
    roles: [role],
    status: 'active',
    passwordHash: 'synthetic-test-hash',
    emailVerifiedAt: NOW,
  })
  const token = await new SignJWT({ authRevision: 0 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(account._id))
    .setJti(String(oid()))
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer('sol-hair-studio')
    .setAudience('sol-hair-clients')
    .sign(
      createHmac('sha256', process.env.AUTH_SECRET).update('sol-hair-studio/access-token').digest(),
    )
  const identity = { accountId: String(account._id), roles: [role], authRevision: 0 }
  let profile, staff
  if (role === 'customer') {
    profile = await CustomerModel.create({
      accountId: account._id,
      displayName: 'Synthetic customer',
      phone: '+84901234567',
    })
    identity.customerId = String(profile._id)
  }
  if (role === 'stylist') {
    staff = await StaffModel.create({
      accountId: account._id,
      displayName: 'Synthetic stylist',
      serviceIds: ['cut', 'spa'],
    })
    await StaffShiftModel.create({
      staffId: staff._id,
      localDate: '2026-10-21',
      startAt: at('09:00:00'),
      endAt: at('18:00:00'),
    })
  }
  return { account, token, identity, profile, staff }
}
const body = (patch = {}) => ({
  serviceIds: ['cut'],
  staffId: String(stylist.staff._id),
  startAt: at('10:30:00').toISOString(),
  bookingMode: 'customer',
  ...patch,
})
function post(patch = {}, acting = customer, key = KEY) {
  return request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${acting.token}`)
    .set('Idempotency-Key', key)
    .send(body(patch))
}
async function assertEmpty() {
  expect(await AppointmentModel.countDocuments()).toBe(0)
  expect(await BookingRequestModel.countDocuments()).toBe(0)
  expect(await AppointmentEventModel.countDocuments()).toBe(0)
  expect((await CustomerModel.findById(customer.profile._id)).bookingRevision).toBe(0)
  expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(0)
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: '8.0.17' },
  })
  await connectToDatabase(replica.getUri('sol031_booking_test'))
  for (const model of models.slice(0, 5)) await model.init()
  await prepareBookingStorage()
  await prepareBookingStorage() // startup preparation is repeatable
}, 180000)
afterAll(async () => {
  await disconnectFromDatabase()
  if (replica) await replica.stop()
})
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  for (const model of models) await model.deleteMany({})
  await mongoose.connection.db.collection('staff_time_off').deleteMany({})
  owner = await actor('owner')
  customer = await actor('customer')
  other = await actor('customer')
  stylist = await actor('stylist')
  secondStylist = await actor('stylist')
  await ServiceModel.create(
    ['cut', 'spa'].map((id) => ({
      id,
      slug: id,
      name: id,
      description: 'Synthetic service',
      category: 'Hair',
      durationMinutes: { min: 20, max: 45 },
      bookingDurationMinutes: 30,
      priceVnd: id === 'cut' ? 0 : 100000,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    })),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('SOL-031 transactional booking HTTP + real temporary replica set', () => {
  it('creates confirmed snapshots, guards, event and 24h receipt; M5 reads the same appointment', async () => {
    const servicesReader = vi.spyOn(availabilityRepository, 'findBookingServices')
    const staffReader = vi.spyOn(availabilityRepository, 'findEligibleStaff')
    const calendarReader = vi.spyOn(availabilityRepository, 'findAvailabilityCalendar')
    const response = await post({ serviceIds: ['spa', 'cut'] }).expect(201)
    const session = servicesReader.mock.calls[0][1].session
    expect(session).toBeInstanceOf(mongoose.mongo.ClientSession)
    expect(staffReader.mock.calls[0][2].session).toBe(session)
    expect(calendarReader.mock.calls[0][4].session).toBe(session)
    expect(response.headers['cache-control']).toBe('no-store')
    const appointment = await AppointmentModel.findById(response.body.data.id).lean()
    expect(appointment).toMatchObject({
      status: 'confirmed',
      revision: 0,
      bookingMode: 'customer',
      totalPriceVnd: 100000,
      totalDurationMinutes: 60,
      startAt: at('10:30:00'),
      endAt: at('11:30:00'),
      occupiedUntil: at('11:40:00'),
    })
    expect(appointment.items.map((i) => i.serviceId)).toEqual(['spa', 'cut'])
    expect((await CustomerModel.findById(customer.profile._id)).bookingRevision).toBe(1)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(1)
    const receipt = await BookingRequestModel.findOne().lean()
    expect(receipt.expiresAt.getTime() - receipt.createdAt.getTime()).toBe(86400000)
    expect(await AppointmentEventModel.findOne().lean()).toMatchObject({
      kind: 'created',
      revision: 0,
      before: {},
      after: { status: 'confirmed' },
    })
    const detail = await request(app)
      .get(`/api/appointments/${appointment._id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200)
    expect(detail.body.data.id).toBe(response.body.data.id)
    await ServiceModel.updateMany({}, { priceVnd: 99999, name: 'Changed catalog' })
    await CustomerModel.updateOne({ _id: customer.profile._id }, { displayName: 'Changed contact' })
    expect((await post({ serviceIds: ['spa', 'cut'] }).expect(201)).body.data).toEqual(
      response.body.data,
    )
    expect((await AppointmentModel.findById(appointment._id)).customerSnapshot.displayName).toBe(
      'Synthetic customer',
    )
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })
  it('replays concurrent identical keys once, even for a new guest', async () => {
    const patch = {
      bookingMode: 'owner_scheduled',
      guestCustomer: { displayName: 'Guest', phone: '+84901234567' },
    }
    const responses = await Promise.all(Array.from({ length: 4 }, () => post(patch, owner)))
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201])
    expect(new Set(responses.map((r) => r.body.data.id)).size).toBe(1)
    expect(await AppointmentModel.countDocuments()).toBe(1)
    expect(await CustomerModel.countDocuments()).toBe(3)
    expect(await BookingRequestModel.countDocuments()).toBe(1)
  })
  it('serializes two customers competing for the same stylist at DB level', async () => {
    const responses = await Promise.all([post(), post({}, other, 'sol031-request-key-0002')])
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await AppointmentModel.countDocuments()).toBe(1)
    expect(await BookingRequestModel.countDocuments()).toBe(1)
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })
  it('serializes the same customer booking different stylists', async () => {
    const responses = await Promise.all([
      post(),
      post({ staffId: String(secondStylist.staff._id) }, customer, 'sol031-request-key-0002'),
    ])
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await AppointmentModel.countDocuments()).toBe(1)
    expect((await CustomerModel.findById(customer.profile._id)).bookingRevision).toBe(1)
  })
  it('same actor/key with a different payload conflicts; another actor has a separate key scope', async () => {
    await post().expect(201)
    expect((await post({ startAt: at('12:00:00').toISOString() }).expect(409)).body.code).toBe(
      'IDEMPOTENCY_CONFLICT',
    )
    await post({ staffId: String(secondStylist.staff._id) }, other).expect(201)
    expect(await BookingRequestModel.countDocuments()).toBe(2)
  })
  it('hash is independent of body property order and ID casing', async () => {
    const initial = await post().expect(201)
    const payload = {
      staffId: String(stylist.staff._id).toUpperCase(),
      bookingMode: 'customer',
      startAt: body().startAt,
      serviceIds: ['cut'],
    }
    const replay = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', KEY)
      .send(payload)
      .expect(201)
    expect(replay.body.data.id).toBe(initial.body.data.id)
  })
  it('expired but retained receipt is replaced conditionally and overlap is still enforced', async () => {
    await post().expect(201)
    await BookingRequestModel.updateOne({}, { expiresAt: NOW })
    await post().expect(409)
    const expired = await BookingRequestModel.findOne().lean()
    expect(expired.expiresAt).toEqual(NOW)
    await post({ startAt: at('12:00:00').toISOString() }).expect(201)
    expect(await BookingRequestModel.countDocuments()).toBe(1)
    expect(await AppointmentModel.countDocuments()).toBe(2)
  })
  it('walk-in uses exact server time, ignores time in hash and retries after it has passed', async () => {
    vi.setSystemTime(new Date(NOW.getTime() + 1234))
    const response = await post(
      { bookingMode: 'owner_walkin', startAt: undefined, customerId: String(other.profile._id) },
      owner,
    ).expect(201)
    expect(response.body.data.startAt).toBe(new Date(NOW.getTime() + 1234).toISOString())
    vi.setSystemTime(new Date(NOW.getTime() + 60000))
    expect(
      (
        await post(
          {
            bookingMode: 'owner_walkin',
            startAt: undefined,
            customerId: String(other.profile._id),
          },
          owner,
        ).expect(201)
      ).body.data,
    ).toEqual(response.body.data)
  })
  it('owner lookup returns distinct profiles sharing phone and never merges them', async () => {
    const response = await request(app)
      .get('/api/customers')
      .query({ phone: '+84901234567' })
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)
    expect(response.body.data.items.map((c) => c.id).sort()).toEqual(
      [String(customer.profile._id), String(other.profile._id)].sort(),
    )
    expect(Object.keys(response.body.data.items[0]).sort()).toEqual(['displayName', 'id', 'phone'])
    const created = await post(
      { bookingMode: 'owner_scheduled', customerId: String(other.profile._id) },
      owner,
    ).expect(201)
    expect(created.body.data.customerId).toBe(String(other.profile._id))
    await request(app)
      .get('/api/customers')
      .query({ phone: '+84901234567' })
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403)
  })
  it.each([
    { startAt: at('10:15:00').toISOString() },
    { startAt: at('10:31:00').toISOString() },
    { startAt: at('18:00:00').toISOString() },
    { startAt: at('09:00:00').toISOString() },
  ])('rejects invalid lead/grid/shift/start %j without partial writes', async (patch) => {
    await post(patch).expect(409)
    await assertEmpty()
  })
  it('owner can schedule now while customer needs 30 minutes; same-phone other customer is independent', async () => {
    await post(
      {
        bookingMode: 'owner_scheduled',
        customerId: String(other.profile._id),
        startAt: NOW.toISOString(),
      },
      owner,
    ).expect(201)
    await post({ staffId: String(secondStylist.staff._id) }).expect(201)
  })
  it.each([
    'inactive',
    'skills',
    'account',
    'timeoff',
    'duration',
    'hidden',
    'profile',
    'customerLimit',
    'staffLimit',
  ])('fails closed for %s and rolls back receipt/guards', async (kind) => {
    if (kind === 'inactive')
      await StaffModel.updateOne({ _id: stylist.staff._id }, { isActive: false })
    if (kind === 'skills')
      await StaffModel.updateOne({ _id: stylist.staff._id }, { serviceIds: ['spa'] })
    if (kind === 'account')
      await AccountModel.updateOne({ _id: stylist.account._id }, { status: 'disabled' })
    if (kind === 'timeoff')
      await mongoose.connection.db
        .collection('staff_time_off')
        .insertOne({ staffId: stylist.staff._id, startAt: at('10:45:00'), endAt: at('11:00:00') })
    if (kind === 'duration')
      await ServiceModel.updateOne({ id: 'cut' }, { $unset: { bookingDurationMinutes: '' } })
    if (kind === 'hidden') await ServiceModel.updateOne({ id: 'cut' }, { isActive: false })
    if (kind === 'profile')
      await CustomerModel.updateOne({ _id: customer.profile._id }, { $unset: { phone: '' } })
    if (kind === 'customerLimit')
      await CustomerModel.updateOne(
        { _id: customer.profile._id },
        { bookingRevision: Number.MAX_SAFE_INTEGER },
      )
    if (kind === 'staffLimit')
      await StaffModel.updateOne(
        { _id: stylist.staff._id },
        { bookingRevision: Number.MAX_SAFE_INTEGER },
      )
    await post().expect(409)
    expect(await AppointmentModel.countDocuments()).toBe(0)
    expect(await BookingRequestModel.countDocuments()).toBe(0)
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
    expect((await CustomerModel.findById(customer.profile._id)).bookingRevision).toBe(
      kind === 'customerLimit' ? Number.MAX_SAFE_INTEGER : 0,
    )
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(
      kind === 'staffLimit' ? Number.MAX_SAFE_INTEGER : 0,
    )
  })
  it('rolls back every write if audit insertion fails', async () => {
    vi.spyOn(AppointmentEventModel, 'create').mockRejectedValueOnce(
      new Error('synthetic audit failure'),
    )
    await post().expect(500)
    await assertEmpty()
  })
  it.each([-1, 0.5])(
    'rejects corrupt staff revision %s without repairing or writing booking',
    async (revision) => {
      await StaffModel.collection.updateOne(
        { _id: stylist.staff._id },
        { $set: { bookingRevision: revision } },
      )
      await post().expect(409)
      expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(revision)
      expect((await CustomerModel.findById(customer.profile._id)).bookingRevision).toBe(0)
      expect(await BookingRequestModel.countDocuments()).toBe(0)
      expect(await AppointmentModel.countDocuments()).toBe(0)
    },
  )
  it('reports unsupported standalone transactions as unavailable', async () => {
    const error = Object.assign(new Error('synthetic unsupported topology'), { code: 20 })
    vi.spyOn(mongoose.connection, 'transaction').mockRejectedValueOnce(error)
    expect((await post().expect(503)).body.code).toBe('TRANSACTIONS_REQUIRED')
    await assertEmpty()
  })
  it('reads current account roles/revision inside transaction, including replay', async () => {
    await post().expect(201)
    await AccountModel.updateOne({ _id: customer.account._id }, { roles: ['stylist'] })
    await expect(createBooking(customer.identity, body(), KEY)).rejects.toHaveProperty(
      'code',
      'FORBIDDEN',
    )
    await AccountModel.updateOne(
      { _id: customer.account._id },
      { authRevision: 1, roles: ['customer'] },
    )
    await expect(createBooking(customer.identity, body(), KEY)).rejects.toHaveProperty(
      'code',
      'UNAUTHORIZED',
    )
    expect(await AppointmentModel.countDocuments()).toBe(1)
  })
  it.each([
    { bookingMode: 'bad' },
    { totalPriceVnd: 0 },
    { serviceIds: [] },
    { serviceIds: ['cut', 'cut'] },
    { staffId: 'bad' },
    { startAt: 'bad' },
    { startAt: null },
    { bookingMode: 'owner_walkin', customerId: String(new mongoose.Types.ObjectId()) },
  ])('rejects malformed body %j', async (patch) => {
    await post(patch).expect(400)
    await assertEmpty()
  })
  it('enforces auth, roles, own profile and key validation', async () => {
    await request(app).post('/api/appointments').send(body()).expect(401)
    await post({}, stylist).expect(403)
    await post({ customerId: String(other.profile._id) }).expect(403)
    await post({
      bookingMode: 'owner_walkin',
      startAt: undefined,
      customerId: String(other.profile._id),
    }).expect(403)
    await post({}, customer, 'short').expect(400)
    await assertEmpty()
  })
  it('guest and receipt disappear on conflict; does not silently attach existing same-phone profile', async () => {
    await post().expect(201)
    await post(
      {
        bookingMode: 'owner_scheduled',
        guestCustomer: { displayName: 'Guest', phone: '+84901234567' },
      },
      owner,
      'sol031-request-key-0002',
    ).expect(409)
    expect(await CustomerModel.countDocuments()).toBe(2)
    expect(await BookingRequestModel.countDocuments()).toBe(1)
  })
  it('unknown commit is reported as retryable, never a definite conflict', async () => {
    const error = new Error('synthetic unknown commit')
    error.hasErrorLabel = (label) => label === 'UnknownTransactionCommitResult'
    vi.spyOn(mongoose.connection, 'transaction').mockRejectedValueOnce(error)
    expect((await post().expect(503)).body.code).toBe('BOOKING_RESULT_UNKNOWN')
    await assertEmpty()
  })
  it('has unique actor/key and receipt-only TTL indexes', async () => {
    const indexes = await BookingRequestModel.collection.indexes()
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: { actorId: 1, key: 1 }, unique: true }),
        expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
      ]),
    )
    expect(
      (await AppointmentModel.collection.indexes()).some((i) => i.expireAfterSeconds !== undefined),
    ).toBe(false)
  })
  it('different intents concurrently claiming the same key cannot create two appointments', async () => {
    const responses = await Promise.all([post(), post({ startAt: at('12:00:00').toISOString() })])
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await AppointmentModel.countDocuments()).toBe(1)
    expect(await BookingRequestModel.countDocuments()).toBe(1)
  })
  it('rechecks a cancelled shift after its writer used the shared staff guard', async () => {
    const { lockAndBumpStaffBookingRevision } = await import('../../staff/staff.repository.js')
    await mongoose.connection.transaction(async (session) => {
      await lockAndBumpStaffBookingRevision(String(stylist.staff._id), session)
      await StaffShiftModel.updateMany(
        { staffId: stylist.staff._id },
        { status: 'cancelled' },
        { session },
      )
    })
    await post().expect(409)
    expect(await AppointmentModel.countDocuments()).toBe(0)
    expect(await BookingRequestModel.countDocuments()).toBe(0)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(1)
  })
  it('overdue in-progress appointments block new bookings even past stored occupiedUntil', async () => {
    await mongoose.connection.db.collection('appointments').insertOne({
      staffId: stylist.staff._id,
      customerId: other.profile._id,
      status: 'in_progress',
      occupiedFrom: at('09:00:00'),
      occupiedUntil: at('09:40:00'),
      startAt: at('09:00:00'),
      startedAt: at('09:00:00'),
      endAt: at('09:30:00'),
    })
    await post().expect(409)
    expect(await AppointmentModel.countDocuments()).toBe(1)
    expect(await BookingRequestModel.countDocuments()).toBe(0)
  })
  it('customer can book at serving-end on another stylist, staff remains blocked for cleanup', async () => {
    await post().expect(201)
    await post({ startAt: at('11:00:00').toISOString() }, other, 'sol031-request-key-0002').expect(
      409,
    )
    await post(
      { startAt: at('11:00:00').toISOString(), staffId: String(secondStylist.staff._id) },
      customer,
      'sol031-request-key-0003',
    ).expect(201)
    await post({ startAt: at('11:15:00').toISOString() }, other, 'sol031-request-key-0004').expect(
      201,
    )
  })
  it('an active receipt still replays after M5 cancellation without creating a replacement', async () => {
    const initial = await post({ startAt: at('13:00:00').toISOString() }).expect(201)
    await request(app)
      .post(`/api/appointments/${initial.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', 'sol031-cancel-key-0001')
      .send({ expectedRevision: 0 })
      .expect(200)
    expect((await post({ startAt: at('13:00:00').toISOString() }).expect(201)).body.data.id).toBe(
      initial.body.data.id,
    )
    expect((await AppointmentModel.findById(initial.body.data.id)).status).toBe('cancelled')
    expect(await AppointmentModel.countDocuments()).toBe(1)
    expect(await AppointmentEventModel.countDocuments()).toBe(2)
  })
  it.each([
    { bookingMode: 'owner_scheduled' },
    {
      bookingMode: 'owner_scheduled',
      customerId: String(new mongoose.Types.ObjectId()),
      guestCustomer: { displayName: 'G', phone: '+84901234567' },
    },
    { bookingMode: 'owner_scheduled', guestCustomer: { displayName: '', phone: '+84901234567' } },
    { bookingMode: 'owner_scheduled', guestCustomer: { displayName: 'G', phone: '0901234567' } },
    {
      bookingMode: 'owner_scheduled',
      guestCustomer: { displayName: 'G', phone: '+84901234567', accountId: 'injection' },
    },
  ])('rejects invalid owner customer selection %j', async (patch) => {
    await post(patch, owner).expect(400)
    await assertEmpty()
  })
  it('disconnected database cannot report success', async () => {
    await disconnectFromDatabase()
    try {
      await post().expect(503)
    } finally {
      await connectToDatabase(replica.getUri('sol031_booking_test'))
    }
  })
})
