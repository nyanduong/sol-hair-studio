import { createHmac } from 'node:crypto'
import mongoose from 'mongoose'
import request from 'supertest'
import { SignJWT } from 'jose'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.AUTH_SECRET = 'sol035-management-test-secret-at-least-32-bytes'
  process.env.NODE_ENV = 'test'
})
import { app } from '../../../app.js'
import { connectToDatabase, disconnectFromDatabase } from '../../../config/database.js'
import { AccountModel } from '../../auth/accounts.model.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { StaffModel } from '../../staff/staff.model.js'
import { StaffShiftModel } from '../../staff/staff-shifts.model.js'
import { ServiceModel } from '../../services/services.model.js'
import * as appointmentRepository from '../appointments.repository.js'
import * as availabilityRepository from '../../availability/availability.repository.js'
import { AppointmentModel } from '../appointments.model.js'
import { AppointmentEventModel } from '../appointment-events.model.js'

const NOW = new Date('2026-10-20T03:00:00.000Z')
const MINUTE = 60_000
const KEY = 'sol035-command-key-0001'
const listPath = '/api/appointments'
const oid = () => new mongoose.Types.ObjectId()
const detailPath = id => listPath + '/' + id
const commandPath = (id, kind) => detailPath(id) + '/' + kind
let replica
let owner, client, otherClient, stylist, otherStylist
let sequence = 0

async function actor(role, profile = true) {
  const account = await AccountModel.create({
    emailNormalized: 'test' + (++sequence) + '@example.test', roles: [role],
    status: 'active', passwordHash: 'fixture-only-not-a-real-hash', emailVerifiedAt: NOW,
  })
  const token = await new SignJWT({ authRevision: account.authRevision })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(String(account._id))
    .setJti(String(oid())).setIssuedAt().setExpirationTime('1h')
    .setIssuer('sol-hair-studio').setAudience('sol-hair-clients')
    .sign(createHmac('sha256', process.env.AUTH_SECRET).update('sol-hair-studio/access-token').digest())
  let customer, staff
  if (role === 'customer' && profile) customer = await CustomerModel.create({
    accountId: account._id, displayName: 'Customer ' + sequence, phone: '+84901234567',
  })
  if (role === 'stylist' && profile) staff = await StaffModel.create({
    accountId: account._id, displayName: 'Stylist ' + sequence, serviceIds: ['service-cut-style'],
  })
  return { account, token, customer, staff }
}

async function appointment(overrides = {}) {
  const startAt = overrides.startAt ?? new Date(NOW.getTime() + 3 * 60 * MINUTE)
  const endAt = new Date(startAt.getTime() + 30 * MINUTE)
  const status = overrides.status ?? 'confirmed'
  const data = {
    customerId: client.customer._id, staffId: stylist.staff._id,
    createdByAccountId: owner.account._id, bookingMode: 'owner_scheduled',
    customerSnapshot: { displayName: 'Private customer', phone: '+84901234567' },
    staffNameSnapshot: 'Historical stylist',
    items: [{ serviceId: 'service-cut-style', name: 'Historical service', priceVnd: 100000, durationMinutes: 30 }],
    totalPriceVnd: 100000, totalDurationMinutes: 30, bufferAfterMinutes: 10,
    startAt, endAt, occupiedFrom: startAt, occupiedUntil: new Date(endAt.getTime() + 10 * MINUTE),
    timeZone: 'Asia/Ho_Chi_Minh',
    localDate: new Date(startAt.getTime() + 7 * 60 * MINUTE).toISOString().slice(0, 10),
    status, revision: 0, confirmedAt: new Date(NOW.getTime() - 86400_000),
  }
  if (status === 'in_progress' || status === 'completed') data.startedAt = startAt
  if (status === 'completed') {
    data.completedAt = new Date(startAt.getTime() + 25 * MINUTE)
    data.occupiedUntil = new Date(data.completedAt.getTime() + 10 * MINUTE)
  }
  if (status === 'cancelled') data.cancelledAt = NOW
  if (status === 'no_show') {
    data.noShowAt = new Date(startAt.getTime() + 15 * MINUTE)
    data.contactAttemptedAt = data.noShowAt
  }
  return AppointmentModel.create({ ...data, ...overrides })
}

function get(path, acting = client) {
  return request(app).get(path).set('Authorization', 'Bearer ' + acting.token)
}
function command(id, kind = 'cancel', acting = client, body = { expectedRevision: 0 }, key = KEY) {
  return request(app).post(commandPath(id, kind)).set('Authorization', 'Bearer ' + acting.token)
    .set('Idempotency-Key', key).send(body)
}
async function assertUnchanged(id) {
  const stored = await AppointmentModel.findById(id).lean()
  expect(stored).toMatchObject({ status: 'confirmed', revision: 0 })
  expect(stored.lastCommand).toBeUndefined()
  expect(await AppointmentEventModel.countDocuments({ appointmentId: id })).toBe(0)
  expect((await CustomerModel.findById(stored.customerId)).bookingRevision).toBe(0)
  expect((await StaffModel.findById(stored.staffId)).bookingRevision).toBe(0)
}

beforeAll(async () => {
  // All mutations are confined to this newly started, temporary replica set.
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '8.0.17' } })
  await connectToDatabase(replica.getUri('sol035_management_test'))
  for (const model of [AccountModel, CustomerModel, StaffModel, StaffShiftModel, ServiceModel]) await model.init()
  for (const model of [AppointmentModel, AppointmentEventModel]) {
    await model.createCollection()
    await model.createIndexes()
  }
}, 180000)
afterAll(async () => {
  await disconnectFromDatabase()
  if (replica) await replica.stop()
})
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  for (const model of [AppointmentEventModel, AppointmentModel, StaffShiftModel, ServiceModel, CustomerModel, StaffModel, AccountModel]) await model.deleteMany({})
  await mongoose.connection.db.collection('staff_time_off').deleteMany({})
  owner = await actor('owner')
  client = await actor('customer')
  otherClient = await actor('customer')
  stylist = await actor('stylist')
  otherStylist = await actor('stylist')
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('appointment lists and details', () => {
  it('scopes customer lists by profile rather than shared phone, with a strict DTO', async () => {
    const mine = await appointment()
    await appointment({ customerId: otherClient.customer._id })
    const response = await get(listPath).expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.data.items.map(item => item.id)).toEqual([String(mine._id)])
    expect(response.body.data.items[0]).not.toHaveProperty('customerSnapshot')
    expect(response.body.data.items[0]).not.toHaveProperty('createdByAccountId')
    expect(response.body.data.pagination).toEqual({ limit: 20, hasNextPage: false, nextCursor: null })
  })
  it('returns empty lists with and without a Customer profile', async () => {
    const missing = await actor('customer', false)
    for (const acting of [client, missing]) expect((await get(listPath, acting).expect(200)).body.data.items).toEqual([])
  })
  it('scopes stylist lists by account-linked Staff and salon date', async () => {
    const mine = await appointment()
    await appointment({ staffId: otherStylist.staff._id })
    await appointment({ startAt: new Date(NOW.getTime() + 86400_000) })
    const response = await get(listPath, stylist).query({ localDate: mine.localDate }).expect(200)
    expect(response.body.data.items.map(item => item.id)).toEqual([String(mine._id)])
    expect(response.body.data.items[0].customerSnapshot.phone).toBe('+84901234567')
    expect(response.body.data.items[0]).not.toHaveProperty('email')
    expect(response.body.data.pagination.limit).toBe(50)
  })
  it('lets owner filter by date, Staff and status without requiring a Staff profile', async () => {
    const mine = await appointment({ status: 'cancelled' })
    await appointment()
    await appointment({ status: 'cancelled', staffId: otherStylist.staff._id })
    const response = await get(listPath, owner).query({ localDate: mine.localDate, staffId: String(stylist.staff._id), status: 'cancelled' }).expect(200)
    expect(response.body.data.items.map(item => item.id)).toEqual([String(mine._id)])
  })
  it.each(['customerId', 'staffId', 'status'])('rejects customer scope/filter injection %s', async key => {
    await get(listPath).query({ [key]: String(otherClient.customer._id) }).expect(400)
  })
  it('rejects stylist Staff filter and invalid dates/status', async () => {
    await get(listPath, stylist).query({ localDate: '2026-10-20', staffId: String(otherStylist.staff._id) }).expect(400)
    await get(listPath, stylist).query({ localDate: '2026-02-30' }).expect(400)
    await get(listPath, owner).query({ localDate: '2026-10-20', status: 'paid' }).expect(400)
  })
  it.each(['customer', 'stylist', 'owner'])('pages %s lists correctly when timestamps are equal', async role => {
    const ids = ['000000000000000000000031', '000000000000000000000032', '000000000000000000000033']
    for (const id of ids) await appointment({ _id: new mongoose.Types.ObjectId(id) })
    const acting = role === 'customer' ? client : role === 'stylist' ? stylist : owner
    const query = role === 'customer' ? { limit: 2 } : { limit: 2, localDate: '2026-10-20' }
    const first = await get(listPath, acting).query(query).expect(200)
    const second = await get(listPath, acting).query({ ...query, cursor: first.body.data.pagination.nextCursor }).expect(200)
    const actual = [...first.body.data.items, ...second.body.data.items].map(item => item.id)
    expect(actual).toEqual(role === 'customer' ? ids.toReversed() : ids)
    expect(second.body.data.pagination.nextCursor).toBeNull()
  })
  it.each(['0', '51', '-1', '1.5', ''])('rejects invalid customer limit %j', async limit => {
    await get(listPath).query({ limit }).expect(400)
  })
  it('enforces role-specific limits, rejects bad cursors and repeated params', async () => {
    expect((await get(listPath).query({ limit: 50 }).expect(200)).body.data.pagination.limit).toBe(50)
    await get(listPath, stylist).query({ localDate: '2026-10-20', limit: 101 }).expect(400)
    expect((await get(listPath, owner).query({ localDate: '2026-10-20', limit: 100 }).expect(200)).body.data.pagination.limit).toBe(100)
    await get(listPath).query({ cursor: 'invalid!' }).expect(400)
    await get(listPath).query('limit=1&limit=2').expect(400)
  })
  it('allows own/assigned/owner detail and hides foreign contexts', async () => {
    const mine = await appointment()
    for (const acting of [client, stylist, owner]) {
      const response = await get(detailPath(mine._id), acting).expect(200)
      expect(response.body.data).toMatchObject({ id: String(mine._id), revision: 0, confirmedAt: mine.confirmedAt.toISOString() })
      expect(response.body.data).not.toHaveProperty('lastCommand')
    }
    await get(detailPath(mine._id), otherClient).expect(404)
    await get(detailPath(mine._id), otherStylist).expect(404)
    await get(detailPath(mine._id) + '?customerId=' + client.customer._id, otherClient).expect(404)
  })
  it('handles malformed/nonexistent IDs and missing profiles', async () => {
    await get(detailPath('bad')).expect(400)
    await get(detailPath(oid())).expect(404)
    const missing = await actor('stylist', false)
    const mine = await appointment()
    expect((await get(detailPath(mine._id), missing).expect(404)).body.code).toBe('STAFF_NOT_FOUND')
  })
  it.each(['cancelled', 'no_show'])('does not expose %s appointments to stylist', async status => {
    const mine = await appointment({ status })
    await get(detailPath(mine._id), stylist).expect(404)
    expect((await get(listPath, stylist).query({ localDate: mine.localDate }).expect(200)).body.data.items).toEqual([])
    await get(detailPath(mine._id), client).expect(200)
    await get(detailPath(mine._id), owner).expect(200)
  })
})

describe('transactional cancellation', () => {
  it.each([1, 0, -1])('checks the 2-hour boundary with offset %i ms', async offset => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() + 120 * MINUTE + offset) })
    const response = await command(mine._id).expect(offset < 0 ? 409 : 200)
    if (offset < 0) {
      expect(response.body.code).toBe('CANCELLATION_CUTOFF')
      await assertUnchanged(mine._id)
    } else {
      expect(response.body.data).toMatchObject({ status: 'cancelled', revision: 1, cancelledAt: NOW.toISOString() })
      const stored = await AppointmentModel.findById(mine._id).lean()
      expect(stored.items).toEqual(mine.toObject().items)
      expect(stored.startAt).toEqual(mine.startAt)
      expect(stored.occupiedUntil).toEqual(mine.occupiedUntil)
      expect(stored.lastCommand).toMatchObject({ key: KEY, actorId: client.account._id, resultRevision: 1 })
      const event = await AppointmentEventModel.findOne({ appointmentId: mine._id }).lean()
      expect(event).toMatchObject({ kind: 'cancelled', revision: 1, before: { status: 'confirmed' }, after: { status: 'cancelled' } })
      expect(event.occurredAt).toEqual(stored.cancelledAt)
      expect((await CustomerModel.findById(client.customer._id)).bookingRevision).toBe(1)
      expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(1)
    }
  })
  it.each([0, -10])('requires owner reason at/after old start, offset %i minutes', async offset => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() + offset * MINUTE) })
    expect((await command(mine._id, 'cancel', owner).expect(400)).body.code).toBe('CANCELLATION_REASON_REQUIRED')
    await assertUnchanged(mine._id)
    const response = await command(mine._id, 'cancel', owner, { expectedRevision: 0, reason: '  Customer called  ' }).expect(200)
    expect(response.body.data.status).toBe('cancelled')
    expect((await AppointmentEventModel.findOne({ appointmentId: mine._id })).reason).toBe('Customer called')
  })
  it('allows owner cancellation at exactly two hours without reason', async () => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() + 120 * MINUTE) })
    await command(mine._id, 'cancel', owner).expect(200)
  })
  it('rejects foreign customer and stylist writes and rolls back guards', async () => {
    const mine = await appointment()
    expect((await command(mine._id, 'cancel', otherClient).expect(404)).body.code).toBe('APPOINTMENT_NOT_FOUND')
    await command(mine._id, 'cancel', stylist).expect(403)
    await assertUnchanged(mine._id)
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('rejects state %s', async status => {
    const mine = await appointment({ status })
    expect((await command(mine._id, 'cancel', owner, { expectedRevision: 0, reason: 'Owner request' }).expect(409)).body.code).toBe('APPOINTMENT_STATE_CONFLICT')
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(0)
  })
  it('rejects stale revisions without persisting guards', async () => {
    const mine = await appointment()
    expect((await command(mine._id, 'cancel', client, { expectedRevision: 1 }).expect(409)).body.code).toBe('APPOINTMENT_REVISION_CONFLICT')
    await assertUnchanged(mine._id)
  })
  it('replays the same command without duplicate events or revisions', async () => {
    const mine = await appointment()
    const first = await command(mine._id).expect(200)
    const replay = await command(mine._id).expect(200)
    expect(replay.body).toEqual(first.body)
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(1)
    expect((await AppointmentModel.findById(mine._id)).revision).toBe(1)
  })
  it('rejects same key with a changed payload', async () => {
    const mine = await appointment()
    await command(mine._id).expect(200)
    expect((await command(mine._id, 'cancel', client, { expectedRevision: 0, reason: 'Different intent' }).expect(409)).body.code).toBe('COMMAND_KEY_CONFLICT')
  })
  it('does not replay a receipt for another actor', async () => {
    const mine = await appointment()
    await command(mine._id).expect(200)
    expect((await command(mine._id, 'cancel', owner, { expectedRevision: 0, reason: 'Other actor' }).expect(409)).body.code).toBe('APPOINTMENT_REVISION_CONFLICT')
  })
  it('rolls appointment and guards back when audit insert fails', async () => {
    const mine = await appointment()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(AppointmentEventModel, 'create').mockRejectedValueOnce(new Error('Injected audit failure'))
    expect((await command(mine._id).expect(500)).body.code).toBe('INTERNAL_ERROR')
    await assertUnchanged(mine._id)
  })
  it('rolls back on CAS failure', async () => {
    const mine = await appointment()
    vi.spyOn(AppointmentModel, 'findOneAndUpdate').mockReturnValueOnce({ lean: async () => null })
    expect((await command(mine._id).expect(409)).body.code).toBe('APPOINTMENT_REVISION_CONFLICT')
    await assertUnchanged(mine._id)
  })
  it('does not commit the customer guard when the Staff guard is exhausted', async () => {
    const mine = await appointment()
    await StaffModel.updateOne({ _id: stylist.staff._id }, { $set: { bookingRevision: Number.MAX_SAFE_INTEGER } })
    expect((await command(mine._id).expect(409)).body.code).toBe('STAFF_GUARD_CONFLICT')
    expect((await CustomerModel.findById(client.customer._id)).bookingRevision).toBe(0)
    expect((await AppointmentModel.findById(mine._id)).status).toBe('confirmed')
  })
  it('allows only one of two concurrent distinct-key cancellations', async () => {
    const mine = await appointment()
    const responses = await Promise.all([
      command(mine._id, 'cancel', client, { expectedRevision: 0 }, 'concurrent-cancel-key-1'),
      command(mine._id, 'cancel', client, { expectedRevision: 0 }, 'concurrent-cancel-key-2'),
    ])
    expect(responses.map(res => res.status).sort()).toEqual([200, 409])
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(1)
  })
  it('concurrent same-key requests converge on one cancellation', async () => {
    const mine = await appointment()
    const responses = await Promise.all([command(mine._id), command(mine._id)])
    expect(responses.map(res => res.status)).toEqual([200, 200])
    expect(responses[0].body).toEqual(responses[1].body)
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(1)
  })
})

describe('transactional no-show', () => {
  it.each([-1, 0, 1])('checks the 15-minute boundary with offset %i ms', async offset => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() - 15 * MINUTE - offset) })
    const response = await command(mine._id, 'no-show', owner, { expectedRevision: 0, contactAttemptedAt: NOW.toISOString() }).expect(offset < 0 ? 409 : 200)
    if (offset < 0) {
      expect(response.body.code).toBe('NO_SHOW_TOO_EARLY')
      await assertUnchanged(mine._id)
    } else {
      expect(response.body.data).toMatchObject({ status: 'no_show', revision: 1, noShowAt: NOW.toISOString(), contactAttemptedAt: NOW.toISOString() })
      const event = await AppointmentEventModel.findOne({ appointmentId: mine._id }).lean()
      expect(event).toMatchObject({ kind: 'no_show', before: { status: 'confirmed' }, after: { status: 'no_show' } })
      expect((await AppointmentModel.findById(mine._id)).noShowAt).toEqual(event.occurredAt)
    }
  })
  it.each(['customer', 'stylist'])('rejects role %s', async role => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() - 20 * MINUTE) })
    await command(mine._id, 'no-show', role === 'customer' ? client : stylist, { expectedRevision: 0, contactAttemptedAt: NOW.toISOString() }).expect(403)
    await assertUnchanged(mine._id)
  })
  it.each([undefined, null, 123, '', 'bad-date', '2026-10-20'])('rejects missing or malformed contact timestamp %j', async contactAttemptedAt => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() - 20 * MINUTE) })
    expect((await command(mine._id, 'no-show', owner, { expectedRevision: 0, contactAttemptedAt }).expect(400)).body.code).toBe('INVALID_CONTACT_ATTEMPTED_AT')
    await assertUnchanged(mine._id)
  })
  it('rejects contact timestamps in the future', async () => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() - 20 * MINUTE) })
    expect((await command(mine._id, 'no-show', owner, { expectedRevision: 0, contactAttemptedAt: new Date(NOW.getTime() + 1).toISOString() }).expect(400)).body.code).toBe('INVALID_CONTACT_ATTEMPTED_AT')
    await assertUnchanged(mine._id)
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('rejects transition from %s', async status => {
    const mine = await appointment({ status, startAt: new Date(NOW.getTime() - 30 * MINUTE) })
    expect((await command(mine._id, 'no-show', owner, { expectedRevision: 0, contactAttemptedAt: NOW.toISOString() }).expect(409)).body.code).toBe('APPOINTMENT_STATE_CONFLICT')
  })
  it('replays no-show and prevents key reuse with a different contact time', async () => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() - 20 * MINUTE) })
    const body = { expectedRevision: 0, contactAttemptedAt: NOW.toISOString() }
    const first = await command(mine._id, 'no-show', owner, body).expect(200)
    expect((await command(mine._id, 'no-show', owner, body).expect(200)).body).toEqual(first.body)
    expect((await command(mine._id, 'no-show', owner, { ...body, contactAttemptedAt: new Date(NOW.getTime() - MINUTE).toISOString() }).expect(409)).body.code).toBe('COMMAND_KEY_CONFLICT')
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(1)
  })
  it('does not replay cancellation as no-show with the same key', async () => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() - 20 * MINUTE) })
    await command(mine._id, 'cancel', owner, { expectedRevision: 0, reason: 'Owner cancellation' }).expect(200)
    expect((await command(mine._id, 'no-show', owner, { expectedRevision: 0, contactAttemptedAt: NOW.toISOString() }).expect(409)).body.code).toBe('COMMAND_KEY_CONFLICT')
  })
  it('rolls back no-show and guards when audit insert fails', async () => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() - 20 * MINUTE) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(AppointmentEventModel, 'create').mockRejectedValueOnce(new Error('Injected audit failure'))
    await command(mine._id, 'no-show', owner, { expectedRevision: 0, contactAttemptedAt: NOW.toISOString() }).expect(500)
    await assertUnchanged(mine._id)
  })
  it('allows only one concurrent cancellation/no-show transition', async () => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() - 20 * MINUTE) })
    const responses = await Promise.all([
      command(mine._id, 'cancel', owner, { expectedRevision: 0, reason: 'Owner cancellation' }, 'cancel-vs-noshow-key1'),
      command(mine._id, 'no-show', owner, { expectedRevision: 0, contactAttemptedAt: NOW.toISOString() }, 'cancel-vs-noshow-key2'),
    ])
    expect(responses.map(res => res.status).sort()).toEqual([200, 409])
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(1)
    expect((await AppointmentModel.findById(mine._id)).revision).toBe(1)
  })
})

describe('command request validation and authentication', () => {
  it.each([{}, { expectedRevision: -1 }, { expectedRevision: 1.5 }, { expectedRevision: '0' }, { expectedRevision: 0, status: 'cancelled' }])('rejects invalid cancellation body %j', async body => {
    const mine = await appointment()
    await command(mine._id, 'cancel', client, body).expect(400)
    await assertUnchanged(mine._id)
  })
  it.each(['', 'short', 'x'.repeat(101)])('rejects invalid key %j', async key => {
    const mine = await appointment()
    expect((await command(mine._id, 'cancel', client, { expectedRevision: 0 }, key).expect(400)).body.code).toBe('INVALID_COMMAND_KEY')
  })
  it('rejects missing key, malformed JSON and unknown appointment IDs', async () => {
    const mine = await appointment()
    await request(app).post(commandPath(mine._id, 'cancel')).set('Authorization', 'Bearer ' + client.token).send({ expectedRevision: 0 }).expect(400)
    expect((await request(app).post(commandPath(mine._id, 'cancel')).set('Authorization', 'Bearer ' + client.token).set('Content-Type', 'application/json').send('{bad').expect(400)).body.code).toBe('INVALID_JSON')
    await command('bad').expect(400)
    await command(oid()).expect(404)
  })
  it.each(['cancel', 'no-show'])('requires login for %s', async kind => {
    await request(app).post(commandPath(oid(), kind)).send({ expectedRevision: 0 }).expect(401)
  })
  it('requires login for list and detail', async () => {
    await request(app).get(listPath).expect(401)
    await request(app).get(detailPath(oid())).expect(401)
  })
})

async function shift(staffId, date = '2026-10-20', from = '07:00', until = '23:00') {
  return StaffShiftModel.create({ staffId, localDate: date,
    startAt: new Date(date + 'T' + from + ':00+07:00'), endAt: new Date(date + 'T' + until + ':00+07:00'),
  })
}
const newStart = minutes => new Date(NOW.getTime() + minutes * MINUTE).toISOString()

// Real shared availability + command transaction; no calendar mocks in success/conflict tests.
describe('transactional rescheduling', () => {
  beforeEach(async () => {
    await shift(stylist.staff._id)
    await shift(otherStylist.staff._id)
  })

  it('changes time, excludes itself and preserves snapshots and confirmedAt', async () => {
    const mine = await appointment()
    const response = await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: newStart(195) }).expect(200)
    expect(response.body.data).toMatchObject({ startAt: newStart(195), endAt: newStart(225), status: 'confirmed', revision: 1, lastRescheduledAt: NOW.toISOString() })
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored.items).toEqual(mine.toObject().items)
    expect(stored.customerSnapshot).toEqual(mine.toObject().customerSnapshot)
    expect(stored.staffNameSnapshot).toBe(mine.staffNameSnapshot)
    expect(stored.confirmedAt).toEqual(mine.confirmedAt)
    expect(stored.totalPriceVnd).toBe(mine.totalPriceVnd)
    expect(stored.occupiedUntil.toISOString()).toBe(newStart(235))
    const event = await AppointmentEventModel.findOne({ appointmentId: mine._id }).lean()
    expect(event).toMatchObject({ kind: 'rescheduled', revision: 1, before: { startAt: mine.startAt }, after: { startAt: stored.startAt } })
  })

  it('reassigns Staff and takes sorted guards exactly once for old and new Staff', async () => {
    const mine = await appointment()
    const guards = vi.spyOn(StaffModel, 'findOneAndUpdate')
    const response = await command(mine._id, 'reschedule', client, { expectedRevision: 0, staffId: String(otherStylist.staff._id) }).expect(200)
    expect(response.body.data).toMatchObject({ staffId: String(otherStylist.staff._id), staffNameSnapshot: otherStylist.staff.displayName, startAt: mine.startAt.toISOString() })
    expect(guards.mock.calls.map(([filter]) => String(filter._id))).toEqual([String(stylist.staff._id), String(otherStylist.staff._id)].sort())
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(1)
    expect((await StaffModel.findById(otherStylist.staff._id)).bookingRevision).toBe(1)
  })

  it('does not double-lock the same Staff for time-only changes', async () => {
    const mine = await appointment()
    await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: newStart(195), staffId: String(stylist.staff._id) }).expect(200)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(1)
  })

  it('allows time and Staff changes together and recalculates the salon date', async () => {
    const mine = await appointment()
    await shift(otherStylist.staff._id, '2026-10-21')
    const startAt = newStart(24 * 60)
    const response = await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt, staffId: String(otherStylist.staff._id) }).expect(200)
    expect(response.body.data).toMatchObject({ startAt, staffId: String(otherStylist.staff._id), localDate: '2026-10-21' })
  })

  it('does not require active catalog or use current catalog durations/prices', async () => {
    await ServiceModel.create({ id: 'service-cut-style', slug: 'service-cut-style', name: 'Changed name', description: 'Fixture', category: 'Hair', durationMinutes: { min: 30, max: 60 }, bookingDurationMinutes: 60, priceVnd: 999999, isActive: false, imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' })
    const mine = await appointment()
    const response = await command(mine._id, 'reschedule', client, { expectedRevision: 0, staffId: String(otherStylist.staff._id), startAt: newStart(195) }).expect(200)
    expect(response.body.data.items).toEqual(mine.toObject().items)
    expect(response.body.data.totalDurationMinutes).toBe(30)
    expect(response.body.data.totalPriceVnd).toBe(100000)
  })

  it.each([1, 0, -1])('uses the OLD start for customer cutoff at 2 hours plus %i ms', async offset => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() + 120 * MINUTE + offset) })
    const response = await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: newStart(240) }).expect(offset < 0 ? 409 : 200)
    if (offset < 0) { expect(response.body.code).toBe('RESCHEDULE_CUTOFF'); await assertUnchanged(mine._id) }
  })

  it('allows owner late changes with reason and does not apply customer lead-time', async () => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() - 20 * MINUTE) })
    expect((await command(mine._id, 'reschedule', owner, { expectedRevision: 0, startAt: newStart(15) }).expect(400)).body.code).toBe('RESCHEDULE_REASON_REQUIRED')
    await assertUnchanged(mine._id)
    await command(mine._id, 'reschedule', owner, { expectedRevision: 0, startAt: newStart(15), reason: '  Owner contacted customer  ' }).expect(200)
    expect((await AppointmentEventModel.findOne({ appointmentId: mine._id })).reason).toBe('Owner contacted customer')
  })

  it.each([30, 29])('checks new customer lead at %i minutes', async minutes => {
    const mine = await appointment()
    const response = await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: newStart(minutes) }).expect(minutes === 30 ? 200 : 400)
    if (minutes === 29) expect(response.body.code).toBe('INVALID_START_AT')
  })

  it('rejects customer new start before 30 minutes even on the grid', async () => {
    const mine = await appointment()
    expect((await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: newStart(15) }).expect(409)).body.code).toBe('RESCHEDULE_LEAD_TIME')
  })

  it('rejects owner backdating, accepts now on the scheduled grid', async () => {
    const mine = await appointment()
    expect((await command(mine._id, 'reschedule', owner, { expectedRevision: 0, startAt: newStart(-15) }).expect(409)).body.code).toBe('RESCHEDULE_LEAD_TIME')
    await command(mine._id, 'reschedule', owner, { expectedRevision: 0, startAt: NOW.toISOString() }).expect(200)
  })

  it('accepts exactly 168 hours and rejects beyond the instant horizon', async () => {
    const mine = await appointment()
    await shift(stylist.staff._id, '2026-10-27')
    await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: newStart(168 * 60) }).expect(200)
    const another = await appointment({ customerId: otherClient.customer._id })
    expect((await command(another._id, 'reschedule', owner, { expectedRevision: 0, startAt: newStart(168 * 60 + 15) }).expect(409)).body.code).toBe('RESCHEDULE_HORIZON')
  })

  it.each(['inactive', 'incapable', 'account-disabled'])('rejects %s target Staff and rolls back both guards', async kind => {
    const mine = await appointment()
    if (kind === 'inactive') await StaffModel.updateOne({ _id: otherStylist.staff._id }, { $set: { isActive: false } })
    if (kind === 'incapable') await StaffModel.updateOne({ _id: otherStylist.staff._id }, { $set: { serviceIds: [] } })
    if (kind === 'account-disabled') await AccountModel.updateOne({ _id: otherStylist.account._id }, { $set: { status: 'disabled' } })
    expect((await command(mine._id, 'reschedule', client, { expectedRevision: 0, staffId: String(otherStylist.staff._id) }).expect(409)).body.code).toBe('STAFF_UNAVAILABLE')
    await assertUnchanged(mine._id)
    expect((await StaffModel.findById(otherStylist.staff._id)).bookingRevision).toBe(0)
  })

  it('rejects missing target Staff', async () => {
    const mine = await appointment()
    await command(mine._id, 'reschedule', client, { expectedRevision: 0, staffId: String(oid()) }).expect(409)
    await assertUnchanged(mine._id)
  })

  it('rejects no shift or cleanup outside the active shift', async () => {
    const mine = await appointment()
    await StaffShiftModel.deleteMany({ staffId: otherStylist.staff._id })
    expect((await command(mine._id, 'reschedule', client, { expectedRevision: 0, staffId: String(otherStylist.staff._id) }).expect(409)).body.code).toBe('SLOT_UNAVAILABLE')
    await shift(otherStylist.staff._id, '2026-10-20', '12:00', '13:30')
    await command(mine._id, 'reschedule', client, { expectedRevision: 0, staffId: String(otherStylist.staff._id) }).expect(409)
    await assertUnchanged(mine._id)
  })

  it('rejects overlap with time off', async () => {
    const mine = await appointment()
    await mongoose.connection.db.collection('staff_time_off').insertOne({ staffId: otherStylist.staff._id, startAt: mine.startAt, endAt: mine.endAt })
    expect((await command(mine._id, 'reschedule', client, { expectedRevision: 0, staffId: String(otherStylist.staff._id) }).expect(409)).body.code).toBe('SLOT_UNAVAILABLE')
    await assertUnchanged(mine._id)
  })

  it('rejects overlap with another Staff booking including cleanup', async () => {
    const mine = await appointment()
    await appointment({ customerId: otherClient.customer._id, startAt: new Date(newStart(150)) })
    await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: newStart(180), staffId: String(otherStylist.staff._id) }).expect(200)
    // Different Staff is allowed; switch back while old Staff is still cleaning.
    expect((await command(mine._id, 'reschedule', client, { expectedRevision: 1, staffId: String(stylist.staff._id) }, 'second-reschedule-key1').expect(409)).body.code).toBe('SLOT_UNAVAILABLE')
  })

  it('checks Customer overlap across different Staff', async () => {
    const mine = await appointment()
    await appointment({ staffId: otherStylist.staff._id, startAt: new Date(newStart(240)) })
    expect((await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: newStart(240) }).expect(409)).body.code).toBe('SLOT_UNAVAILABLE')
    await assertUnchanged(mine._id)
  })

  it('overdue in-progress with unknown end blocks a new slot', async () => {
    const mine = await appointment()
    await appointment({ customerId: otherClient.customer._id, staffId: otherStylist.staff._id, status: 'in_progress', startAt: new Date(newStart(-120)) })
    expect((await command(mine._id, 'reschedule', client, { expectedRevision: 0, staffId: String(otherStylist.staff._id) }).expect(409)).body.code).toBe('SLOT_UNAVAILABLE')
  })

  it.each(['cancelled', 'no_show'])('ignores %s as a busy interval', async status => {
    const mine = await appointment()
    await appointment({ customerId: otherClient.customer._id, staffId: otherStylist.staff._id, status })
    await command(mine._id, 'reschedule', client, { expectedRevision: 0, staffId: String(otherStylist.staff._id) }).expect(200)
  })

  it('rejects foreign Customer and Stylist role', async () => {
    const mine = await appointment()
    await command(mine._id, 'reschedule', otherClient, { expectedRevision: 0, startAt: newStart(195) }).expect(404)
    await command(mine._id, 'reschedule', stylist, { expectedRevision: 0, startAt: newStart(195) }).expect(403)
    await assertUnchanged(mine._id)
  })

  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('rejects transition from %s', async status => {
    const mine = await appointment({ status })
    expect((await command(mine._id, 'reschedule', owner, { expectedRevision: 0, startAt: newStart(240) }).expect(409)).body.code).toBe('APPOINTMENT_STATE_CONFLICT')
  })

  it.each([
    { expectedRevision: 0 }, { expectedRevision: 0, startAt: 'bad' },
    { expectedRevision: 0, startAt: 1 }, { expectedRevision: 0, staffId: { $ne: null } },
    { expectedRevision: 0, startAt: newStart(195), items: [] },
    { expectedRevision: 0, startAt: newStart(195), reason: '  ' },
  ])('rejects invalid input %j', async body => {
    const mine = await appointment()
    await command(mine._id, 'reschedule', client, body).expect(400)
    await assertUnchanged(mine._id)
  })

  it('rejects an unchanged assignment/time and stale revision', async () => {
    const mine = await appointment()
    expect((await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: mine.startAt.toISOString() }).expect(400)).body.code).toBe('RESCHEDULE_NO_CHANGE')
    expect((await command(mine._id, 'reschedule', client, { expectedRevision: 1, startAt: newStart(195) }).expect(409)).body.code).toBe('APPOINTMENT_REVISION_CONFLICT')
    await assertUnchanged(mine._id)
  })

  it('replays reassignment despite changed calendar, but rejects key intent changes', async () => {
    const mine = await appointment()
    const body = { expectedRevision: 0, staffId: String(otherStylist.staff._id), startAt: newStart(195) }
    const first = await command(mine._id, 'reschedule', client, body).expect(200)
    await StaffShiftModel.deleteMany({ staffId: otherStylist.staff._id })
    expect((await command(mine._id, 'reschedule', client, body).expect(200)).body).toEqual(first.body)
    expect((await command(mine._id, 'reschedule', client, { ...body, startAt: newStart(210) }).expect(409)).body.code).toBe('COMMAND_KEY_CONFLICT')
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(1)
  })

  it('passes the transaction session and exclude ID to shared availability readers', async () => {
    const mine = await appointment()
    const reader = vi.spyOn(availabilityRepository, 'findAvailabilityCalendar')
    await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: newStart(195) }).expect(200)
    expect(reader).toHaveBeenCalledOnce()
    expect(reader.mock.calls[0][4]).toMatchObject({ session: expect.any(Object), excludeAppointmentId: String(mine._id) })
  })

  it('re-reads resources after a changed guard set and does not commit the first guards', async () => {
    const mine = await appointment()
    vi.spyOn(appointmentRepository, 'findAppointmentCommandResources').mockResolvedValueOnce({
      _id: mine._id, customerId: mine.customerId, staffId: otherStylist.staff._id,
    })
    await command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: newStart(195) }).expect(200)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(1)
    expect((await StaffModel.findById(otherStylist.staff._id)).bookingRevision).toBe(0)
  })

  it('rolls back reassignment and all guards if audit fails', async () => {
    const mine = await appointment()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(AppointmentEventModel, 'create').mockRejectedValueOnce(new Error('Injected audit failure'))
    await command(mine._id, 'reschedule', client, { expectedRevision: 0, staffId: String(otherStylist.staff._id) }).expect(500)
    await assertUnchanged(mine._id)
    expect(String((await AppointmentModel.findById(mine._id)).staffId)).toBe(String(stylist.staff._id))
    expect((await StaffModel.findById(otherStylist.staff._id)).bookingRevision).toBe(0)
  })

  it('allows one of two appointments to acquire the same target slot', async () => {
    const a = await appointment()
    const b = await appointment({ customerId: otherClient.customer._id, startAt: new Date(newStart(300)) })
    const responses = await Promise.all([
      command(a._id, 'reschedule', client, { expectedRevision: 0, staffId: String(otherStylist.staff._id), startAt: newStart(240) }, 'reschedule-race-key1'),
      command(b._id, 'reschedule', otherClient, { expectedRevision: 0, staffId: String(otherStylist.staff._id), startAt: newStart(240) }, 'reschedule-race-key2'),
    ])
    expect(responses.map(item => item.status).sort()).toEqual([200, 409])
    expect(await AppointmentEventModel.countDocuments({ kind: 'rescheduled' })).toBe(1)
  })

  it('concurrent same-key requests produce one revision and one event', async () => {
    const mine = await appointment()
    const body = { expectedRevision: 0, startAt: newStart(195) }
    const responses = await Promise.all([command(mine._id, 'reschedule', client, body), command(mine._id, 'reschedule', client, body)])
    expect(responses.map(item => item.status)).toEqual([200, 200])
    expect(responses[0].body).toEqual(responses[1].body)
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(1)
  })

  it('serializes cancellation versus rescheduling on the same appointment', async () => {
    const mine = await appointment()
    const responses = await Promise.all([
      command(mine._id, 'cancel', client, { expectedRevision: 0 }, 'cancel-reschedule-key1'),
      command(mine._id, 'reschedule', client, { expectedRevision: 0, startAt: newStart(195) }, 'cancel-reschedule-key2'),
    ])
    expect(responses.map(item => item.status).sort()).toEqual([200, 409])
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(1)
  })
})
