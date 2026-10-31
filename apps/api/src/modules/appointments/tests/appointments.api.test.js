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
import { BookingRequestModel } from '../booking-requests.model.js'

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
  for (const model of [AppointmentModel, AppointmentEventModel, BookingRequestModel]) {
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
  for (const model of [BookingRequestModel, AppointmentEventModel, AppointmentModel, StaffShiftModel, ServiceModel, CustomerModel, StaffModel, AccountModel]) await model.deleteMany({})
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

  it.each(['confirmed', 'in_progress', 'completed'])('returns persisted actual times on repeated scoped GET for %s', async status => {
    const mine = await appointment({ status })
    for (const acting of [client, stylist, owner]) {
      for (let reload = 0; reload < 2; reload++) {
        const data = (await get(detailPath(mine._id), acting).expect(200)).body.data
        if (status !== 'confirmed') expect(data.startedAt).toBe(mine.startedAt.toISOString())
        else expect(data).not.toHaveProperty('startedAt')
        if (status === 'completed') expect(data.completedAt).toBe(mine.completedAt.toISOString())
        else expect(data).not.toHaveProperty('completedAt')
        for (const field of ['lastCommand', 'bookingRevision', 'createdByAccountId', 'email']) expect(data).not.toHaveProperty(field)
      }
    }
    await get(detailPath(mine._id), otherClient).expect(404)
    await get(detailPath(mine._id), otherStylist).expect(404)
  })
  it.each(['owner', 'stylist', 'customer'])('scopes persisted ETA on repeated GET detail for %s', async role => {
    const estimatedEndAt = new Date(NOW.getTime() + 5 * 60 * MINUTE)
    const mine = await appointment({ status: 'in_progress', estimatedEndAt,
      occupiedUntil: new Date(estimatedEndAt.getTime() + 10 * MINUTE) })
    const acting = { owner, stylist, customer: client }[role]
    for (let reload = 0; reload < 2; reload++) {
      const data = (await get(detailPath(mine._id), acting).expect(200)).body.data
      if (role === 'customer') expect(data).not.toHaveProperty('estimatedEndAt')
      else expect(data.estimatedEndAt).toBe(estimatedEndAt.toISOString())
      expect(data.startAt).toBe(mine.startAt.toISOString())
      expect(data.endAt).toBe(mine.endAt.toISOString())
      for (const field of ['lastCommand', 'occupiedUntil', 'email']) expect(data).not.toHaveProperty(field)
    }
    await get(detailPath(mine._id), otherStylist).expect(404)
    await get(detailPath(mine._id), otherClient).expect(404)
  })
  it.each(['confirmed', 'in_progress', 'completed'])('does not invent missing ETA for %s on GET detail', async status => {
    const mine = await appointment({ status })
    for (const acting of [owner, stylist]) {
      expect((await get(detailPath(mine._id), acting).expect(200)).body.data).not.toHaveProperty('estimatedEndAt')
    }
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

// SOL-036 Step 1 uses the same isolated replica set, actors and guard fixtures.
describe('transactional appointment start', () => {
  beforeEach(async () => { await shift(stylist.staff._id) })
  const begin = (id, acting = stylist, body = { expectedRevision: 0 }, key = 'sol036-start-command-0001') =>
    command(id, 'start', acting, body, key)

  it.each(['stylist', 'owner'])('allows %s to start at the scheduled instant with one audit event', async role => {
    const mine = await appointment({ startAt: NOW })
    const response = await begin(mine._id, role === 'owner' ? owner : stylist).expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.data).toMatchObject({ status: 'in_progress', revision: 1, startedAt: NOW.toISOString() })
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored.startAt).toEqual(mine.startAt)
    expect(stored.endAt).toEqual(mine.endAt)
    expect(stored.items).toEqual(mine.toObject().items)
    expect(stored.occupiedFrom).toEqual(NOW)
    expect(stored.occupiedUntil).toEqual(mine.occupiedUntil)
    expect((await CustomerModel.findById(client.customer._id)).bookingRevision).toBe(1)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(1)
    const event = await AppointmentEventModel.findOne({ appointmentId: mine._id }).lean()
    expect(event).toMatchObject({ kind: 'started', revision: 1, occurredAt: NOW,
      before: { status: 'confirmed' }, after: { status: 'in_progress', startedAt: NOW } })
  })

  it('starts early at an actual off-grid instant and preserves planned end', async () => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() + 15 * MINUTE) })
    const actual = new Date(NOW.getTime() + 7 * MINUTE + 1234)
    vi.setSystemTime(actual)
    const response = await begin(mine._id).expect(200)
    expect(response.body.data.startedAt).toBe(actual.toISOString())
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored.occupiedFrom).toEqual(actual)
    expect(stored.occupiedUntil).toEqual(mine.occupiedUntil)
    expect(stored.endAt).toEqual(mine.endAt)
  })

  it('can start late without backdating the actual start', async () => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() - 10 * MINUTE) })
    await begin(mine._id).expect(200)
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored.startedAt).toEqual(NOW)
    expect(stored.occupiedFrom).toEqual(mine.startAt)
  })

  it('does not require historical catalog or capabilities to be rewritten', async () => {
    const mine = await appointment({ startAt: NOW })
    await StaffModel.updateOne({ _id: stylist.staff._id }, { serviceIds: [] })
    await begin(mine._id).expect(200)
  })

  it.each(['customer', 'otherStylist'])('denies %s without partial writes', async role => {
    const mine = await appointment({ startAt: NOW })
    await begin(mine._id, role === 'customer' ? client : otherStylist).expect(role === 'customer' ? 403 : 404)
    await assertUnchanged(mine._id)
  })

  it('requires authentication', async () => {
    await request(app).post(commandPath(oid(), 'start')).send({ expectedRevision: 0 }).expect(401)
  })

  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('does not start %s', async status => {
    const mine = await appointment({ status })
    const response = await begin(mine._id).expect(409)
    expect(response.body.code).toBe('APPOINTMENT_STATE_CONFLICT')
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
  })

  it('rejects a stale revision and rolls back guards', async () => {
    const mine = await appointment({ startAt: NOW })
    expect((await begin(mine._id, stylist, { expectedRevision: 1 }).expect(409)).body.code).toBe('APPOINTMENT_REVISION_CONFLICT')
    await assertUnchanged(mine._id)
  })

  it.each([{ expectedRevision: -1 }, { expectedRevision: 0.5 }, {}, { expectedRevision: 0, startedAt: NOW.toISOString() }, { expectedRevision: 0, status: 'in_progress' }, { expectedRevision: 0, checkIn: true }])('rejects invalid input %j', async body => {
    const mine = await appointment({ startAt: NOW })
    await begin(mine._id, stylist, body).expect(400)
    await assertUnchanged(mine._id)
  })

  it('requires a valid command key', async () => {
    const mine = await appointment({ startAt: NOW })
    await begin(mine._id, stylist, { expectedRevision: 0 }, 'short').expect(400)
    await assertUnchanged(mine._id)
  })

  it.each(['outside', 'cancelled', 'cleanup'])('rejects %s shift availability', async variant => {
    await StaffShiftModel.deleteMany({})
    const startAt = variant === 'outside' ? '11:00' : '09:00'
    const shiftDoc = await shift(stylist.staff._id, '2026-10-20', startAt, variant === 'cleanup' ? '10:30' : '18:00')
    if (variant === 'cancelled') await StaffShiftModel.updateOne({ _id: shiftDoc._id }, { status: 'cancelled' })
    const mine = await appointment({ startAt: NOW })
    expect((await begin(mine._id).expect(409)).body.code).toBe('START_OUTSIDE_SHIFT')
    await assertUnchanged(mine._id)
  })

  it('rejects time off in the proposed serving interval', async () => {
    const mine = await appointment({ startAt: NOW })
    await mongoose.connection.db.collection('staff_time_off').insertOne({ staffId: stylist.staff._id, startAt: NOW, endAt: new Date(NOW.getTime() + MINUTE) })
    expect((await begin(mine._id).expect(409)).body.code).toBe('START_TIME_OFF_CONFLICT')
    await assertUnchanged(mine._id)
  })

  it.each(['staff', 'customer', 'overdue', 'cleanup'])('rejects %s overlap including the early extension', async variant => {
    const mine = await appointment({ startAt: new Date(NOW.getTime() + 30 * MINUTE) })
    const pastStart = new Date(NOW.getTime() - (variant === 'cleanup' ? 35 : variant === 'overdue' ? 60 : 15) * MINUTE)
    await appointment({ customerId: variant === 'customer' ? client.customer._id : otherClient.customer._id,
      staffId: variant === 'customer' ? otherStylist.staff._id : stylist.staff._id,
      startAt: pastStart, ...(variant === 'overdue' ? { status: 'in_progress' } : {}) })
    expect((await begin(mine._id).expect(409)).body.code).toBe('START_APPOINTMENT_CONFLICT')
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored).toMatchObject({ status: 'confirmed', revision: 0 })
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
  })

  it('accepts exact cleanup adjacency', async () => {
    const mine = await appointment({ startAt: NOW })
    await appointment({ customerId: otherClient.customer._id, startAt: new Date(NOW.getTime() - 40 * MINUTE) })
    await begin(mine._id).expect(200)
  })

  it('replays the latest request without incrementing revision or duplicating audit', async () => {
    const mine = await appointment({ startAt: NOW })
    const first = await begin(mine._id).expect(200)
    vi.setSystemTime(new Date(NOW.getTime() + MINUTE))
    const replay = await begin(mine._id).expect(200)
    expect(replay.body).toEqual(first.body)
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
    expect((await AppointmentModel.findById(mine._id)).revision).toBe(1)
  })

  it('rejects reuse of the same key with another intent', async () => {
    const mine = await appointment({ startAt: NOW })
    await begin(mine._id).expect(200)
    expect((await begin(mine._id, stylist, { expectedRevision: 1 }).expect(409)).body.code).toBe('COMMAND_KEY_CONFLICT')
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('serializes simultaneous duplicate starts', async () => {
    const mine = await appointment({ startAt: NOW })
    const results = await Promise.all([begin(mine._id), begin(mine._id)])
    expect(results.map(r => r.status)).toEqual([200, 200])
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('serializes starts of conflicting appointments', async () => {
    const first = await appointment({ startAt: new Date(NOW.getTime() + 60 * MINUTE) })
    const second = await appointment({ customerId: otherClient.customer._id, startAt: new Date(NOW.getTime() + 120 * MINUTE) })
    const results = await Promise.all([begin(first._id), begin(second._id, stylist, { expectedRevision: 0 }, 'sol036-start-command-0002')])
    expect(results.map(r => r.status).sort()).toEqual([200, 409])
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('rolls back appointment and both guards when audit fails', async () => {
    const mine = await appointment({ startAt: NOW })
    vi.spyOn(appointmentRepository, 'insertAppointmentEvent').mockRejectedValueOnce(new Error('synthetic audit failure'))
    await begin(mine._id).expect(500)
    await assertUnchanged(mine._id)
  })

  it('checks the current actor again inside the transaction', async () => {
    const mine = await appointment({ startAt: NOW })
    vi.spyOn(appointmentRepository, 'findAppointmentCommandActor').mockResolvedValueOnce(null)
    await begin(mine._id).expect(401)
    await assertUnchanged(mine._id)
  })
})

// SOL-036 Step 2: actual completion on the same temporary replica set.
describe('transactional appointment completion', () => {
  const finish = (id, acting = stylist, body = { expectedRevision: 0 }, key = 'sol036-complete-command-0001') =>
    command(id, 'complete', acting, body, key)
  const serving = (patch = {}) => appointment({ status: 'in_progress', startAt: new Date(NOW.getTime() - 30 * MINUTE), ...patch })
  const slots = async (staffId = stylist.staff._id) => {
    const result = await get('/api/availability', owner).query({ serviceIds: 'service-cut-style',
      staffId: String(staffId), customerId: String(client.customer._id), localDate: '2026-10-20' }).expect(200)
    return result.body.data.stylists[0].slots.map(item => item.startAt)
  }
  async function assertServingUnchanged(mine) {
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored).toMatchObject({ status: 'in_progress', revision: 0 })
    expect(stored.completedAt).toBeUndefined()
    expect(stored.lastCommand).toBeUndefined()
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
    expect((await CustomerModel.findById(client.customer._id)).bookingRevision).toBe(0)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(0)
  }
  beforeEach(async () => {
    await shift(stylist.staff._id)
    await shift(otherStylist.staff._id)
    await ServiceModel.create({ id: 'service-cut-style', slug: 'service-cut-style', name: 'Current service',
      description: 'Synthetic service', category: 'Hair', durationMinutes: { min: 30, max: 30 },
      bookingDurationMinutes: 30, priceVnd: 100000, imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' })
  })

  it.each(['stylist', 'owner'])('allows %s to complete using server time and one event', async role => {
    const mine = await serving()
    const response = await finish(mine._id, role === 'owner' ? owner : stylist).expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.data).toMatchObject({ status: 'completed', revision: 1, startedAt: mine.startedAt.toISOString(), completedAt: NOW.toISOString() })
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored.occupiedFrom).toEqual(mine.startedAt)
    expect(stored.occupiedUntil).toEqual(new Date(NOW.getTime() + 10 * MINUTE))
    for (const field of ['startAt', 'endAt', 'items', 'customerSnapshot', 'staffNameSnapshot', 'totalPriceVnd', 'totalDurationMinutes', 'confirmedAt', 'bookingMode']) {
      expect(stored[field]).toEqual(mine.toObject()[field])
    }
    expect(stored.status).not.toBe('paid')
    expect((await CustomerModel.findById(client.customer._id)).bookingRevision).toBe(1)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(1)
    const event = await AppointmentEventModel.findOne().lean()
    expect(event).toMatchObject({ kind: 'completed', revision: 1, occurredAt: NOW,
      before: { status: 'in_progress' }, after: { status: 'completed', completedAt: NOW } })
  })

  it('completes early and opens the unused reservation after cleanup on the grid', async () => {
    const mine = await serving({ startAt: new Date(NOW.getTime() - 10 * MINUTE) })
    const before = await slots()
    expect(before[0]).toBe(new Date(NOW.getTime() + 30 * MINUTE).toISOString())
    await finish(mine._id).expect(200)
    const after = await slots()
    expect(after[0]).toBe(new Date(NOW.getTime() + 15 * MINUTE).toISOString())
    expect(after).not.toContain(NOW.toISOString())
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored.endAt).toEqual(mine.endAt)
    expect(stored.occupiedUntil.getTime()).toBeLessThan(mine.occupiedUntil.getTime())
  })

  it('accepts a slot exactly at cleanup end when it lies on the grid', async () => {
    const mine = await serving()
    vi.setSystemTime(new Date(NOW.getTime() + 5 * MINUTE))
    await finish(mine._id).expect(200)
    expect((await slots())[0]).toBe(new Date(NOW.getTime() + 15 * MINUTE).toISOString())
  })

  it('records late completion and releases an overdue unknown-end reservation', async () => {
    const mine = await serving({ startAt: new Date(NOW.getTime() - 60 * MINUTE) })
    expect(await slots()).toEqual([])
    await finish(mine._id).expect(200)
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored.completedAt).toEqual(NOW)
    expect(stored.occupiedUntil.getTime()).toBeGreaterThan(mine.occupiedUntil.getTime())
    expect((await slots())[0]).toBe(new Date(NOW.getTime() + 15 * MINUTE).toISOString())
  })

  it('records actual completion even outside the shift and does not move an affected appointment', async () => {
    const mine = await serving({ startAt: new Date(NOW.getTime() - 90 * MINUTE) })
    const next = await appointment({ customerId: otherClient.customer._id, startAt: new Date(NOW.getTime() - 30 * MINUTE) })
    await StaffShiftModel.deleteMany({})
    await finish(mine._id).expect(200)
    const unchanged = await AppointmentModel.findById(next._id).lean()
    expect(unchanged).toMatchObject({ status: 'confirmed', revision: 0, startAt: next.startAt, endAt: next.endAt })
    expect(await AppointmentEventModel.countDocuments({ appointmentId: next._id })).toBe(0)
    expect(await slots()).toEqual([])
  })

  it('does not reserve customer cleanup on another Staff', async () => {
    const mine = await serving()
    await finish(mine._id).expect(200)
    expect((await slots(otherStylist.staff._id))[0]).toBe(NOW.toISOString())
    expect((await slots())[0]).toBe(new Date(NOW.getTime() + 15 * MINUTE).toISOString())
  })

  it('still requires enough service plus cleanup time before the next booking', async () => {
    const mine = await serving()
    await appointment({ customerId: otherClient.customer._id, startAt: new Date(NOW.getTime() + 45 * MINUTE) })
    await finish(mine._id).expect(200)
    const available = await slots()
    expect(available).not.toContain(new Date(NOW.getTime() + 15 * MINUTE).toISOString())
    expect(available).not.toContain(new Date(NOW.getTime() + 30 * MINUTE).toISOString())
  })

  it('keeps customer lead-time after releasing cleanup', async () => {
    const mine = await serving()
    await finish(mine._id).expect(200)
    const result = await get('/api/availability').query({ serviceIds: 'service-cut-style', staffId: String(stylist.staff._id), localDate: '2026-10-20' }).expect(200)
    expect(result.body.data.stylists[0].slots[0].startAt).toBe(new Date(NOW.getTime() + 30 * MINUTE).toISOString())
  })

  it('removes an existing ETA from the current document while preserving it in audit', async () => {
    const eta = new Date(NOW.getTime() + 60 * MINUTE)
    const mine = await serving({ estimatedEndAt: eta, occupiedUntil: new Date(eta.getTime() + 10 * MINUTE) })
    await finish(mine._id).expect(200)
    expect((await AppointmentModel.findById(mine._id).lean()).estimatedEndAt).toBeUndefined()
    const event = await AppointmentEventModel.findOne().lean()
    expect(event.before.estimatedEndAt).toEqual(eta)
    expect(event.after.estimatedEndAt).toBeUndefined()
  })

  it('completes after Start using its new revision and preserves both audit events', async () => {
    const mine = await appointment({ startAt: NOW })
    await command(mine._id, 'start', stylist, { expectedRevision: 0 }, 'sol036-start-before-complete').expect(200)
    vi.setSystemTime(new Date(NOW.getTime() + 5 * MINUTE))
    const result = await finish(mine._id, stylist, { expectedRevision: 1 }).expect(200)
    expect(result.body.data.revision).toBe(2)
    expect((await AppointmentEventModel.find().sort({ revision: 1 }).lean()).map(item => item.kind)).toEqual(['started', 'completed'])
  })

  it.each(['customer', 'otherStylist'])('rejects %s without partial changes', async role => {
    const mine = await serving()
    await finish(mine._id, role === 'customer' ? client : otherStylist).expect(role === 'customer' ? 403 : 404)
    await assertServingUnchanged(mine)
  })

  it('requires authentication and valid appointment ID', async () => {
    await request(app).post(commandPath(oid(), 'complete')).send({ expectedRevision: 0 }).expect(401)
    await finish('bad').expect(400)
    await finish(oid()).expect(404)
  })

  it.each(['confirmed', 'completed', 'cancelled', 'no_show'])('rejects %s state', async status => {
    const mine = await appointment({ status })
    expect((await finish(mine._id).expect(409)).body.code).toBe('APPOINTMENT_STATE_CONFLICT')
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
  })

  it('rejects stale revision and rolls back guards', async () => {
    const mine = await serving()
    expect((await finish(mine._id, stylist, { expectedRevision: 1 }).expect(409)).body.code).toBe('APPOINTMENT_REVISION_CONFLICT')
    await assertServingUnchanged(mine)
  })

  it('does not backdate completion before an invalid future actual start', async () => {
    const mine = await serving({ startedAt: new Date(NOW.getTime() + MINUTE) })
    expect((await finish(mine._id).expect(409)).body.code).toBe('INVALID_COMPLETION_TIME')
    await assertServingUnchanged(mine)
  })

  it.each([{}, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { expectedRevision: 0, completedAt: NOW.toISOString() }, { expectedRevision: 0, status: 'paid' }, { expectedRevision: 0, items: [] }])('rejects invalid body %j', async body => {
    const mine = await serving()
    await finish(mine._id, stylist, body).expect(400)
    await assertServingUnchanged(mine)
  })

  it('requires a valid command key', async () => {
    const mine = await serving()
    await finish(mine._id, stylist, { expectedRevision: 0 }, 'bad').expect(400)
    await assertServingUnchanged(mine)
  })

  it('replays the latest completion without another revision or event', async () => {
    const mine = await serving()
    const first = await finish(mine._id).expect(200)
    vi.setSystemTime(new Date(NOW.getTime() + 20 * MINUTE))
    const replay = await finish(mine._id).expect(200)
    expect(replay.body).toEqual(first.body)
    expect((await AppointmentModel.findById(mine._id)).revision).toBe(1)
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('rejects a changed intent on the same key', async () => {
    const mine = await serving()
    await finish(mine._id).expect(200)
    expect((await finish(mine._id, stylist, { expectedRevision: 1 }).expect(409)).body.code).toBe('COMMAND_KEY_CONFLICT')
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('serializes identical concurrent completions', async () => {
    const mine = await serving()
    const responses = await Promise.all([finish(mine._id), finish(mine._id)])
    expect(responses.map(item => item.status)).toEqual([200, 200])
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('allows only one of two different completion commands at the same revision', async () => {
    const mine = await serving()
    const responses = await Promise.all([finish(mine._id), finish(mine._id, owner, { expectedRevision: 0 }, 'sol036-complete-command-0002')])
    expect(responses.map(item => item.status).sort()).toEqual([200, 409])
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('rolls back appointment and guards if the completed event cannot be inserted', async () => {
    const mine = await serving()
    vi.spyOn(appointmentRepository, 'insertAppointmentEvent').mockRejectedValueOnce(new Error('synthetic completion audit failure'))
    await finish(mine._id).expect(500)
    await assertServingUnchanged(mine)
  })

  it('rolls back guards when the lifecycle CAS loses', async () => {
    const mine = await serving()
    vi.spyOn(appointmentRepository, 'persistCompletedAppointment').mockResolvedValueOnce(null)
    await finish(mine._id).expect(409)
    await assertServingUnchanged(mine)
  })

  it('rereads current authorization inside the transaction', async () => {
    const mine = await serving()
    vi.spyOn(appointmentRepository, 'findAppointmentCommandActor').mockResolvedValueOnce(null)
    await finish(mine._id).expect(401)
    await assertServingUnchanged(mine)
  })
})

// SOL-036 Step 3: ETA never rejects truthful overrun because another reservation is affected.
describe('transactional ETA and scoped impact warnings', () => {
  const etaAt = minutes => new Date(NOW.getTime() + minutes * MINUTE).toISOString()
  const serving = (patch = {}) => appointment({ status: 'in_progress', startAt: new Date(NOW.getTime() - 15 * MINUTE), ...patch })
  const update = (id, acting = stylist, body = { expectedRevision: 0, estimatedEndAt: etaAt(45) }, key = 'sol036-eta-command-0001') => command(id, 'eta', acting, body, key)
  async function unchanged(mine) {
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored).toMatchObject({ status: 'in_progress', revision: 0 })
    expect(stored.estimatedEndAt).toEqual(mine.estimatedEndAt)
    expect(stored.lastCommand).toBeUndefined()
    expect(stored.occupiedUntil).toEqual(mine.occupiedUntil)
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
    expect((await CustomerModel.findById(client.customer._id)).bookingRevision).toBe(0)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(0)
  }
  beforeEach(async () => {
    await shift(stylist.staff._id)
    await shift(otherStylist.staff._id)
    await ServiceModel.create({ id: 'service-cut-style', slug: 'service-cut-style', name: 'Current service', description: 'Synthetic',
      category: 'Hair', durationMinutes: { min: 30, max: 30 }, bookingDurationMinutes: 30, priceVnd: 100000,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' })
  })

  it.each(['stylist', 'owner'])('lets %s update ETA without changing planned snapshots', async role => {
    const mine = await serving()
    const result = await update(mine._id, role === 'owner' ? owner : stylist).expect(200)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(result.body.data).toMatchObject({ status: 'in_progress', revision: 1, estimatedEndAt: etaAt(45), occupiedUntil: etaAt(55), affectedAppointments: [], ownerReviewRequired: false })
    const stored = await AppointmentModel.findById(mine._id).lean()
    for (const key of ['startAt', 'endAt', 'startedAt', 'items', 'customerSnapshot', 'staffNameSnapshot', 'staffId', 'customerId', 'totalPriceVnd', 'totalDurationMinutes', 'confirmedAt']) {
      expect(stored[key]).toEqual(mine.toObject()[key])
    }
    const event = await AppointmentEventModel.findOne().lean()
    expect(event).toMatchObject({ kind: 'eta_updated', revision: 1, occurredAt: NOW, before: { status: 'in_progress' }, after: { status: 'in_progress', estimatedEndAt: new Date(etaAt(45)) } })
    expect((await CustomerModel.findById(client.customer._id)).bookingRevision).toBe(1)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(1)
  })

  it('accepts off-grid ETA and does not apply the booking horizon', async () => {
    const mine = await serving()
    const eta = new Date(NOW.getTime() + 8 * 86400_000 + 1234).toISOString()
    await update(mine._id, stylist, { expectedRevision: 0, estimatedEndAt: eta }).expect(200)
    expect((await AppointmentModel.findById(mine._id)).estimatedEndAt.toISOString()).toBe(eta)
  })

  it.each(['past', 'now', 'plannedEnd', 'beforePlannedEnd'])('rejects ETA at %s without partial writes', async variant => {
    const mine = await serving()
    const value = { past: etaAt(-1), now: etaAt(0), plannedEnd: mine.endAt.toISOString(), beforePlannedEnd: etaAt(10) }[variant]
    expect((await update(mine._id, stylist, { expectedRevision: 0, estimatedEndAt: value }).expect(400)).body.code).toBe('INVALID_ETA')
    await unchanged(mine)
  })

  it.each([null, 'bad', 42, {}, '2026-10-20T11:00:00+07:00', '+275760-09-13T00:00:00.000Z'])('rejects malformed ETA %j', async estimatedEndAt => {
    const mine = await serving()
    await update(mine._id, stylist, { expectedRevision: 0, estimatedEndAt }).expect(400)
    await unchanged(mine)
  })

  it.each([{ expectedRevision: 0 }, { expectedRevision: -1, estimatedEndAt: etaAt(45) }, { expectedRevision: 0, estimatedEndAt: etaAt(45), endAt: etaAt(45) }, { expectedRevision: 0, estimatedEndAt: etaAt(45), items: [] }])('rejects unsupported or missing input %j', async body => {
    const mine = await serving()
    await update(mine._id, stylist, body).expect(400)
    await unchanged(mine)
  })

  it.each(['customer', 'otherStylist'])('rejects %s access', async role => {
    const mine = await serving()
    await update(mine._id, role === 'customer' ? client : otherStylist).expect(role === 'customer' ? 403 : 404)
    await unchanged(mine)
  })

  it('requires login, a valid ID and a valid key', async () => {
    await request(app).post(commandPath(oid(), 'eta')).send({ expectedRevision: 0, estimatedEndAt: etaAt(45) }).expect(401)
    await update('bad').expect(400)
    await update(oid()).expect(404)
    const mine = await serving()
    await update(mine._id, stylist, { expectedRevision: 0, estimatedEndAt: etaAt(45) }, 'short').expect(400)
    await unchanged(mine)
  })

  it.each(['confirmed', 'completed', 'cancelled', 'no_show'])('rejects %s state', async status => {
    const mine = await appointment({ status })
    expect((await update(mine._id).expect(409)).body.code).toBe('APPOINTMENT_STATE_CONFLICT')
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
  })

  it('rejects stale revision', async () => {
    const mine = await serving()
    expect((await update(mine._id, stylist, { expectedRevision: 1, estimatedEndAt: etaAt(45) }).expect(409)).body.code).toBe('APPOINTMENT_REVISION_CONFLICT')
    await unchanged(mine)
  })


  it.each(['owner', 'stylist'])('reloads current ETA impact for %s without writing and clears a resolved conflict', async role => {
    const mine = await serving()
    const next = await appointment({ customerId: otherClient.customer._id, startAt: new Date(etaAt(30)) })
    await update(mine._id).expect(200)
    const before = await AppointmentModel.findById(mine._id).lean()
    const guards = [(await CustomerModel.findById(client.customer._id)).bookingRevision, (await StaffModel.findById(stylist.staff._id)).bookingRevision]
    const events = await AppointmentEventModel.countDocuments({ appointmentId: mine._id })
    for (let reload = 0; reload < 2; reload++) {
      const result = await get(detailPath(mine._id), role === 'owner' ? owner : stylist).expect(200)
      expect(result.headers['cache-control']).toBe('no-store')
      expect(result.body.data).toMatchObject({ revision: 1, estimatedEndAt: etaAt(45), ownerReviewRequired: true,
        affectedAppointments: [{ id: String(next._id), staffId: String(stylist.staff._id), reasons: ['staff_overlap'] }] })
      expect(Object.keys(result.body.data.affectedAppointments[0]).sort()).toEqual(['id', 'staffId', 'status', 'startAt', 'endAt', 'reasons'].sort())
      expect(result.body.data).not.toHaveProperty('occupiedFrom')
      if (role === 'stylist') expect(result.body.data).not.toHaveProperty('customerId')
    }
    expect(await AppointmentModel.findById(mine._id).lean()).toEqual(before)
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(events)
    expect([(await CustomerModel.findById(client.customer._id)).bookingRevision, (await StaffModel.findById(stylist.staff._id)).bookingRevision]).toEqual(guards)
    await command(next._id, 'cancel', owner, { expectedRevision: 0, reason: 'Synthetic conflict resolution' }, 'eta-read-resolve-command').expect(200)
    const fresh = (await get(detailPath(mine._id), role === 'owner' ? owner : stylist).expect(200)).body.data
    expect(fresh).toMatchObject({ revision: 1, estimatedEndAt: etaAt(45), affectedAppointments: [], ownerReviewRequired: false })
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(events)
  })

  it('GET keeps cross-Staff conflicts Owner-only and exposes no impact to Customer or foreign Stylist', async () => {
    const mine = await serving()
    const next = await appointment({ staffId: otherStylist.staff._id, startAt: new Date(etaAt(30)) })
    await update(mine._id).expect(200)
    const staffRead = (await get(detailPath(mine._id), stylist).expect(200)).body
    expect(staffRead.data).toMatchObject({ affectedAppointments: [], ownerReviewRequired: true })
    expect(JSON.stringify(staffRead)).not.toContain(String(next._id))
    expect(staffRead.data).not.toHaveProperty('customerId')
    const ownerRead = (await get(detailPath(mine._id), owner).expect(200)).body.data
    expect(ownerRead.affectedAppointments).toEqual([{ id: String(next._id), staffId: String(otherStylist.staff._id), status: 'confirmed',
      startAt: next.startAt.toISOString(), endAt: next.endAt.toISOString(), reasons: ['customer_overlap'] }])
    const customerRead = (await get(detailPath(mine._id), client).expect(200)).body.data
    for (const field of ['estimatedEndAt', 'affectedAppointments', 'ownerReviewRequired']) expect(customerRead).not.toHaveProperty(field)
    await get(detailPath(mine._id), otherStylist).expect(404)
    await get(detailPath(mine._id), otherClient).expect(404)
  })

  it('GET uses current server time for an expired ETA rather than stale saved warnings', async () => {
    const mine = await serving()
    await appointment({ customerId: otherClient.customer._id, startAt: new Date(etaAt(90)) })
    await update(mine._id).expect(200)
    expect((await get(detailPath(mine._id), owner).expect(200)).body.data.affectedAppointments).toEqual([])
    vi.setSystemTime(new Date(etaAt(46)))
    const read = (await get(detailPath(mine._id), owner).expect(200)).body.data
    expect(read.affectedAppointments).toHaveLength(1)
    expect(read.ownerReviewRequired).toBe(true)
    expect(read.revision).toBe(1)
  })

  it('GET respects cleanup adjacency without changing appointment history', async () => {
    const mine = await serving()
    await appointment({ customerId: otherClient.customer._id, startAt: new Date(etaAt(55)) })
    await update(mine._id).expect(200)
    const read = (await get(detailPath(mine._id), stylist).expect(200)).body.data
    expect(read).toMatchObject({ affectedAppointments: [], ownerReviewRequired: false })
    expect(read.endAt).toBe(mine.endAt.toISOString())
  })

  it('fails GET when warning reads fail instead of claiming no conflicts', async () => {
    const mine = await serving()
    await update(mine._id).expect(200)
    const before = await AppointmentModel.findById(mine._id).lean()
    vi.spyOn(appointmentRepository, 'findAppointmentConflictCandidates').mockRejectedValueOnce(new Error('synthetic read impact failure'))
    const result = await get(detailPath(mine._id), owner).expect(500)
    expect(result.body).not.toHaveProperty('data')
    expect(await AppointmentModel.findById(mine._id).lean()).toEqual(before)
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id, kind: 'eta_updated' })).toBe(1)
  })

  it('records staff overlap and returns the affected assigned appointment without PII', async () => {
    const mine = await serving()
    const next = await appointment({ customerId: otherClient.customer._id, startAt: new Date(etaAt(30)) })
    const result = await update(mine._id).expect(200)
    expect(result.body.data.ownerReviewRequired).toBe(true)
    expect(result.body.data.affectedAppointments).toEqual([{ id: String(next._id), staffId: String(stylist.staff._id), status: 'confirmed', startAt: next.startAt.toISOString(), endAt: next.endAt.toISOString(), reasons: ['staff_overlap'] }])
    const stored = await AppointmentModel.findById(next._id).lean()
    expect(stored).toMatchObject({ status: 'confirmed', revision: 0, startAt: next.startAt, staffId: next.staffId })
    expect(stored.lastCommand).toBeUndefined()
    expect(await AppointmentEventModel.countDocuments({ appointmentId: next._id })).toBe(0)
  })

  it('Owner can see Customer overlap on a different Staff; Stylist cannot inspect it', async () => {
    const mine = await serving()
    const next = await appointment({ staffId: otherStylist.staff._id, startAt: new Date(etaAt(30)) })
    const stylistResponse = await update(mine._id).expect(200)
    expect(stylistResponse.body.data).toMatchObject({ affectedAppointments: [], ownerReviewRequired: true })
    expect(JSON.stringify(stylistResponse.body)).not.toContain(String(next._id))
    const ownerResponse = await update(mine._id, owner, { expectedRevision: 1, estimatedEndAt: etaAt(50) }, 'sol036-eta-owner-command-0002').expect(200)
    expect(ownerResponse.body.data.affectedAppointments).toEqual([{ id: String(next._id), staffId: String(otherStylist.staff._id), status: 'confirmed', startAt: next.startAt.toISOString(), endAt: next.endAt.toISOString(), reasons: ['customer_overlap'] }])
  })

  it('deduplicates one appointment affected by both Staff and Customer intervals', async () => {
    const mine = await serving()
    const next = await appointment({ startAt: new Date(etaAt(30)) })
    const result = await update(mine._id, owner).expect(200)
    expect(result.body.data.affectedAppointments).toHaveLength(1)
    expect(result.body.data.affectedAppointments[0]).toMatchObject({ id: String(next._id), reasons: ['staff_overlap', 'customer_overlap'] })
  })

  it('includes Staff cleanup overlap but never Customer cleanup', async () => {
    const mine = await serving()
    const staffOnly = await appointment({ customerId: otherClient.customer._id, startAt: new Date(etaAt(45)) })
    await appointment({ staffId: otherStylist.staff._id, startAt: new Date(etaAt(40)) })
    const result = await update(mine._id, owner, { expectedRevision: 0, estimatedEndAt: etaAt(40) }).expect(200)
    expect(result.body.data.affectedAppointments.map(item => item.id)).toEqual([String(staffOnly._id)])
    expect(result.body.data.affectedAppointments[0].reasons).toEqual(['staff_overlap'])
  })

  it('does not warn on exact half-open cleanup adjacency', async () => {
    const mine = await serving()
    await appointment({ customerId: otherClient.customer._id, startAt: new Date(etaAt(60)) })
    const result = await update(mine._id, owner, { expectedRevision: 0, estimatedEndAt: etaAt(50) }).expect(200)
    expect(result.body.data).toMatchObject({ affectedAppointments: [], ownerReviewRequired: false })
  })

  it.each(['cancelled', 'no_show', 'completed'])('does not warn for %s appointments', async status => {
    const mine = await serving()
    await appointment({ status, customerId: otherClient.customer._id, startAt: new Date(etaAt(30)) })
    const result = await update(mine._id).expect(200)
    expect(result.body.data).toMatchObject({ affectedAppointments: [], ownerReviewRequired: false })
  })

  it('warns for an overdue in-progress appointment despite its expired stored occupiedUntil', async () => {
    const mine = await serving()
    const busy = await serving({ customerId: otherClient.customer._id, startAt: new Date(etaAt(-60)) })
    const result = await update(mine._id).expect(200)
    expect(result.body.data.affectedAppointments.map(item => item.id)).toEqual([String(busy._id)])
  })

  it('can revise an old ETA earlier while remaining future and after the planned end', async () => {
    const oldEta = new Date(etaAt(90))
    const mine = await serving({ estimatedEndAt: oldEta, occupiedUntil: new Date(etaAt(100)) })
    await appointment({ customerId: otherClient.customer._id, startAt: new Date(etaAt(60)) })
    const result = await update(mine._id).expect(200)
    expect(result.body.data).toMatchObject({ estimatedEndAt: etaAt(45), occupiedUntil: etaAt(55), affectedAppointments: [], ownerReviewRequired: false })
    expect((await AppointmentEventModel.findOne().lean()).before.estimatedEndAt).toEqual(oldEta)
  })

  it('availability uses the updated ETA and cleanup without changing SOL-030', async () => {
    const mine = await serving()
    await update(mine._id).expect(200)
    const result = await get('/api/availability', owner).query({ serviceIds: 'service-cut-style', staffId: String(stylist.staff._id), localDate: '2026-10-20' }).expect(200)
    expect(result.body.data.stylists[0].slots[0].startAt).toBe(etaAt(60))
  })

  it('replays even when the original ETA has passed, without another event/revision', async () => {
    const mine = await serving()
    await update(mine._id).expect(200)
    vi.setSystemTime(new Date(etaAt(46)))
    const replay = await update(mine._id).expect(200)
    expect(replay.body.data).toMatchObject({ revision: 1, estimatedEndAt: etaAt(45) })
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('recomputes read-only warnings on replay without applying ETA again', async () => {
    const mine = await serving()
    await update(mine._id).expect(200)
    const next = await appointment({ customerId: otherClient.customer._id, startAt: new Date(etaAt(30)) })
    const replay = await update(mine._id).expect(200)
    expect(replay.body.data.affectedAppointments[0].id).toBe(String(next._id))
    expect(replay.body.data.revision).toBe(1)
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('rejects changed ETA with the same key', async () => {
    const mine = await serving()
    await update(mine._id).expect(200)
    expect((await update(mine._id, stylist, { expectedRevision: 0, estimatedEndAt: etaAt(50) }).expect(409)).body.code).toBe('COMMAND_KEY_CONFLICT')
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('serializes duplicate requests to one ETA event', async () => {
    const mine = await serving()
    const responses = await Promise.all([update(mine._id), update(mine._id)])
    expect(responses.map(item => item.status)).toEqual([200, 200])
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('allows only one of concurrent different ETA intents at the same revision', async () => {
    const mine = await serving()
    const responses = await Promise.all([update(mine._id), update(mine._id, owner, { expectedRevision: 0, estimatedEndAt: etaAt(50) }, 'sol036-eta-command-0002')])
    expect(responses.map(item => item.status).sort()).toEqual([200, 409])
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it.each(['audit', 'warnings', 'CAS'])('rolls back ETA and guards after %s failure', async stage => {
    const mine = await serving()
    if (stage === 'audit') vi.spyOn(appointmentRepository, 'insertAppointmentEvent').mockRejectedValueOnce(new Error('synthetic ETA audit failure'))
    if (stage === 'warnings') vi.spyOn(appointmentRepository, 'findAppointmentConflictCandidates').mockRejectedValueOnce(new Error('synthetic warning read failure'))
    if (stage === 'CAS') vi.spyOn(appointmentRepository, 'persistAppointmentEta').mockResolvedValueOnce(null)
    await update(mine._id).expect(stage === 'CAS' ? 409 : 500)
    await unchanged(mine)
  })

  it('rereads active authorization before the ETA command', async () => {
    const mine = await serving()
    vi.spyOn(appointmentRepository, 'findAppointmentCommandActor').mockResolvedValueOnce(null)
    await update(mine._id).expect(401)
    await unchanged(mine)
  })
})

// SOL-036 Step 4 only: Owner corrects an accidental Start, never a completed appointment.
describe('Owner correction of accidental start', () => {
  const at = minutes => new Date(NOW.getTime() + minutes * MINUTE)
  const serving = (patch = {}) => appointment({ status: 'in_progress', startAt: at(15), startedAt: NOW, occupiedFrom: NOW, ...patch })
  const body = (patch = {}) => ({ expectedRevision: 0, reason: 'Start was pressed accidentally; service has not begun.', serviceNotStarted: true, ...patch })
  const correct = (id, acting = owner, input = body(), key = 'sol036-correct-start-command-0001') => command(id, 'correct-start', acting, input, key)
  async function unchanged(mine) {
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored).toMatchObject({ status: 'in_progress', revision: mine.revision, startedAt: mine.startedAt })
    expect(stored.estimatedEndAt).toEqual(mine.estimatedEndAt)
    expect(stored.occupiedFrom).toEqual(mine.occupiedFrom)
    expect(stored.occupiedUntil).toEqual(mine.occupiedUntil)
    expect(stored.lastCommand).toBeUndefined()
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
    expect((await CustomerModel.findById(client.customer._id)).bookingRevision).toBe(0)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(0)
  }
  beforeEach(async () => { await shift(stylist.staff._id); await shift(otherStylist.staff._id) })

  it('preserves the started event and appends a corrected event with actor/reason/before/after', async () => {
    const mine = await appointment({ startAt: at(15) })
    await command(mine._id, 'start', stylist, { expectedRevision: 0 }, 'sol036-start-before-correction').expect(200)
    const result = await correct(mine._id, owner, body({ expectedRevision: 1, reason: '  Accidental start; no actual service.  ' })).expect(200)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(result.body.data).toMatchObject({ status: 'confirmed', revision: 2, occupiedFrom: mine.startAt.toISOString(), occupiedUntil: mine.occupiedUntil.toISOString() })
    expect(result.body.data).not.toHaveProperty('startedAt')
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored.startedAt).toBeUndefined()
    expect(stored.completedAt).toBeUndefined()
    expect(stored.estimatedEndAt).toBeUndefined()
    expect(stored.serviceNotStarted).toBeUndefined()
    for (const field of ['startAt', 'endAt', 'items', 'customerSnapshot', 'staffNameSnapshot', 'staffId', 'customerId', 'totalPriceVnd', 'totalDurationMinutes', 'confirmedAt', 'bookingMode']) {
      expect(stored[field]).toEqual(mine.toObject()[field])
    }
    const events = await AppointmentEventModel.find().sort({ revision: 1 }).lean()
    expect(events.map(event => event.kind)).toEqual(['started', 'corrected'])
    expect(events[1]).toMatchObject({ actorId: owner.account._id, revision: 2, occurredAt: NOW,
      reason: 'Accidental start; no actual service.', before: { status: 'in_progress', startedAt: NOW }, after: { status: 'confirmed' } })
    expect(events[1].after.startedAt).toBeUndefined()
    expect(events[0].after.startedAt).toEqual(NOW)
  })

  it('removes ETA/actual fields only from the current document and retains them in audit', async () => {
    const mine = await serving({ estimatedEndAt: at(90), occupiedUntil: at(100) })
    await correct(mine._id).expect(200)
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored.occupiedFrom).toEqual(mine.startAt)
    expect(stored.occupiedUntil).toEqual(at(55))
    expect(stored.startedAt).toBeUndefined()
    expect(stored.estimatedEndAt).toBeUndefined()
    const event = await AppointmentEventModel.findOne().lean()
    expect(event.before).toMatchObject({ startedAt: NOW, estimatedEndAt: at(90) })
    expect(event.after.estimatedEndAt).toBeUndefined()
  })

  it('does not apply new-booking lead-time, grid, horizon or current catalog capabilities', async () => {
    const mine = await serving()
    await StaffModel.updateOne({ _id: stylist.staff._id }, { serviceIds: [] })
    await ServiceModel.deleteMany({})
    await correct(mine._id).expect(200)
    expect((await AppointmentModel.findById(mine._id)).startAt).toEqual(mine.startAt)
  })

  it('rejects customer without exposing conflict details', async () => {
    const mine = await serving()
    await appointment({ customerId: otherClient.customer._id, startAt: at(30) })
    const result = await correct(mine._id, client).expect(403)
    expect(result.body).not.toHaveProperty('details')
    await unchanged(mine)
  })

  it('requires authentication and a valid existing appointment ID', async () => {
    await request(app).post(commandPath(oid(), 'correct-start')).send(body()).expect(401)
    await correct('bad').expect(400)
    await correct(oid()).expect(404)
  })

  it.each(['confirmed', 'completed', 'cancelled', 'no_show'])('does not correct %s in Step 4', async status => {
    const mine = await appointment({ status })
    expect((await correct(mine._id).expect(409)).body.code).toBe('APPOINTMENT_STATE_CONFLICT')
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
  })

  it.each([undefined, '', '   ', 42, 'x'.repeat(501)])('requires a valid reason %j', async reason => {
    const mine = await serving()
    await correct(mine._id, owner, body({ reason })).expect(400)
    await unchanged(mine)
  })

  it.each([undefined, false, 'true', 1])('requires explicit service-not-started confirmation %j', async serviceNotStarted => {
    const mine = await serving()
    expect((await correct(mine._id, owner, body({ serviceNotStarted })).expect(400)).body.code).toBe('SERVICE_NOT_STARTED_CONFIRMATION_REQUIRED')
    await unchanged(mine)
  })

  it.each([{ expectedRevision: -1 }, { expectedRevision: 0.5 }, { startAt: NOW.toISOString() }, { status: 'confirmed' }, { estimatedEndAt: at(90).toISOString() }])('rejects invalid or extra fields %j', async patch => {
    const mine = await serving()
    await correct(mine._id, owner, body(patch)).expect(400)
    await unchanged(mine)
  })

  it('rejects stale revision and invalid command key', async () => {
    const mine = await serving()
    expect((await correct(mine._id, owner, body({ expectedRevision: 1 })).expect(409)).body.code).toBe('APPOINTMENT_REVISION_CONFLICT')
    await correct(mine._id, owner, body(), 'bad').expect(400)
    await unchanged(mine)
  })

  it.each(['missing', 'cancelled', 'cleanup', 'split'])('rejects %s shift coverage without changing state', async variant => {
    await StaffShiftModel.deleteMany({})
    if (variant === 'cancelled') {
      const shiftDoc = await shift(stylist.staff._id)
      await StaffShiftModel.updateOne({ _id: shiftDoc._id }, { status: 'cancelled' })
    }
    if (variant === 'cleanup') await shift(stylist.staff._id, '2026-10-20', '09:00', '10:45')
    if (variant === 'split') {
      await shift(stylist.staff._id, '2026-10-20', '09:00', '10:30')
      await shift(stylist.staff._id, '2026-10-20', '10:30', '12:00')
    }
    const mine = await serving()
    const result = await correct(mine._id).expect(409)
    expect(result.body).toMatchObject({ code: 'CORRECTION_CONFLICT', details: { shiftConflict: true } })
    await unchanged(mine)
  })

  it('returns time-off conflict details to Owner without partial updates', async () => {
    const mine = await serving()
    await mongoose.connection.db.collection('staff_time_off').insertOne({ staffId: stylist.staff._id, startAt: at(45), endAt: at(60) })
    const result = await correct(mine._id).expect(409)
    expect(result.body.details).toEqual({ shiftConflict: false, timeOffConflicts: [{ startAt: at(45).toISOString(), endAt: at(60).toISOString() }], conflictingAppointments: [] })
    await unchanged(mine)
  })

  it.each(['staff', 'customer', 'both', 'overdue'])('returns %s overlap details and leaves the other appointment unchanged', async variant => {
    const mine = await serving()
    const next = await appointment({ customerId: variant === 'customer' || variant === 'both' ? client.customer._id : otherClient.customer._id,
      staffId: variant === 'customer' ? otherStylist.staff._id : stylist.staff._id,
      startAt: variant === 'overdue' ? at(-60) : at(30), ...(variant === 'overdue' ? { status: 'in_progress' } : {}) })
    const result = await correct(mine._id).expect(409)
    expect(result.body.code).toBe('CORRECTION_CONFLICT')
    expect(result.body.details.conflictingAppointments).toHaveLength(1)
    expect(result.body.details.conflictingAppointments[0]).toEqual({ id: String(next._id), staffId: String(next.staffId), status: next.status,
      startAt: next.startAt.toISOString(), endAt: next.endAt.toISOString(), reasons: variant === 'both' ? ['staff_overlap', 'customer_overlap'] : variant === 'customer' ? ['customer_overlap'] : ['staff_overlap'] })
    expect((await AppointmentModel.findById(next._id)).toObject()).toEqual(next.toObject())
    await unchanged(mine)
  })

  it('does not treat Customer cleanup on another Staff as a conflict', async () => {
    const mine = await serving()
    await appointment({ staffId: otherStylist.staff._id, startAt: at(45) })
    await correct(mine._id).expect(200)
  })

  it('includes completed Staff cleanup in conflict checks', async () => {
    const mine = await serving({ startAt: NOW, startedAt: at(-20), occupiedFrom: at(-20) })
    const previous = await appointment({ status: 'completed', customerId: otherClient.customer._id, startAt: at(-30), completedAt: at(-5), occupiedUntil: at(5) })
    const result = await correct(mine._id).expect(409)
    expect(result.body.details.conflictingAppointments[0].id).toBe(String(previous._id))
    await unchanged(mine)
  })

  it.each(['cancelled', 'no_show'])('ignores %s reservations', async status => {
    const mine = await serving()
    await appointment({ status, customerId: otherClient.customer._id, startAt: at(30) })
    await correct(mine._id).expect(200)
  })

  it('accepts exact Staff cleanup adjacency and exact time-off adjacency', async () => {
    const mine = await serving({ endAt: at(35), totalDurationMinutes: 20,
      items: [{ serviceId: 'service-cut-style', name: 'Historical service', priceVnd: 100000, durationMinutes: 20 }], occupiedUntil: at(45) })
    await appointment({ customerId: otherClient.customer._id, startAt: at(45) })
    await mongoose.connection.db.collection('staff_time_off').insertOne({ staffId: stylist.staff._id, startAt: at(45), endAt: at(60) })
    await correct(mine._id).expect(200)
  })

  it('allows the same original key/revision to replay even if shift data later changes', async () => {
    const mine = await serving()
    const first = await correct(mine._id).expect(200)
    await StaffShiftModel.deleteMany({})
    const replay = await correct(mine._id).expect(200)
    expect(replay.body).toEqual(first.body)
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
    expect((await AppointmentModel.findById(mine._id)).revision).toBe(1)
  })

  it('rejects a changed correction reason with the same key', async () => {
    const mine = await serving()
    await correct(mine._id).expect(200)
    expect((await correct(mine._id, owner, body({ reason: 'Different reason' })).expect(409)).body.code).toBe('COMMAND_KEY_CONFLICT')
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('serializes concurrent identical corrections to one event', async () => {
    const mine = await serving()
    const responses = await Promise.all([correct(mine._id), correct(mine._id)])
    expect(responses.map(item => item.status)).toEqual([200, 200])
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('allows only one concurrent correction with different keys at the same revision', async () => {
    const mine = await serving()
    const responses = await Promise.all([correct(mine._id), correct(mine._id, owner, body(), 'sol036-correct-start-command-0002')])
    expect(responses.map(item => item.status).sort()).toEqual([200, 409])
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it.each(['audit', 'CAS', 'calendar'])('fully rolls back after %s failure', async stage => {
    const mine = await serving()
    if (stage === 'audit') vi.spyOn(appointmentRepository, 'insertAppointmentEvent').mockRejectedValueOnce(new Error('synthetic correction audit failure'))
    if (stage === 'CAS') vi.spyOn(appointmentRepository, 'persistCorrectedStartAppointment').mockResolvedValueOnce(null)
    if (stage === 'calendar') vi.spyOn(availabilityRepository, 'findAvailabilityCalendar').mockRejectedValueOnce(new Error('synthetic correction calendar failure'))
    await correct(mine._id).expect(stage === 'CAS' ? 409 : 500)
    await unchanged(mine)
  })

  it('checks Owner permission again inside the transaction', async () => {
    const mine = await serving()
    vi.spyOn(appointmentRepository, 'findAppointmentCommandActor').mockResolvedValueOnce({ accountId: String(owner.account._id), roles: ['customer'], authRevision: owner.account.authRevision })
    await correct(mine._id).expect(403)
    await unchanged(mine)
  })
})

// Step 5 shares the isolated replica set; Booking requests below use the real SOL-031 API.
describe('Owner correction of accidental completion', () => {
  const at = minutes => new Date(NOW.getTime() + minutes * MINUTE)
  const completed = (patch = {}) => appointment({ status: 'completed', startAt: at(-10), startedAt: at(-12),
    completedAt: at(-5), occupiedFrom: at(-12), occupiedUntil: at(5), ...patch })
  const body = (patch = {}) => ({ expectedRevision: 0, reason: 'Completion was accidental; the customer is still being served.', serviceNotCompleted: true, ...patch })
  const correct = (id, acting = owner, input = body(), key = 'sol036-correct-complete-command-0001') => command(id, 'correct-complete', acting, input, key)
  async function unchanged(mine, { eventCount = 0, customerGuard = 0, staffGuard = 0 } = {}) {
    expect(await AppointmentModel.findById(mine._id).lean()).toEqual(mine.toObject())
    expect(await AppointmentEventModel.countDocuments()).toBe(eventCount)
    expect((await CustomerModel.findById(client.customer._id)).bookingRevision).toBe(customerGuard)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(staffGuard)
  }
  const book = (staffId = stylist.staff._id, customerId = otherClient.customer._id) => request(app)
    .post('/api/appointments').set('Authorization', 'Bearer ' + owner.token).set('Idempotency-Key', 'sol036-book-after-false-completion')
    .send({ bookingMode: 'owner_scheduled', serviceIds: ['service-cut-style'], staffId: String(staffId), customerId: String(customerId), startAt: at(15).toISOString() })
  async function slots() {
    const result = await get('/api/availability', owner).query({ serviceIds: 'service-cut-style', staffId: String(stylist.staff._id), localDate: '2026-10-20' }).expect(200)
    return result.body.data.stylists[0].slots.map(item => item.startAt)
  }
  beforeEach(async () => {
    await shift(stylist.staff._id); await shift(otherStylist.staff._id)
    await ServiceModel.create({ id: 'service-cut-style', slug: 'service-cut-style', name: 'Current service', description: 'Synthetic', category: 'Hair',
      durationMinutes: { min: 30, max: 30 }, bookingDurationMinutes: 30, priceVnd: 100000,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' })
  })

  it('preserves the original Start and Completed events and original actual start through the full lifecycle', async () => {
    const mine = await appointment({ startAt: NOW })
    await command(mine._id, 'start', stylist, { expectedRevision: 0 }, 'sol036-start-before-false-complete').expect(200)
    vi.setSystemTime(at(5))
    await command(mine._id, 'complete', stylist, { expectedRevision: 1 }, 'sol036-false-complete-before-correction').expect(200)
    const oldEvents = await AppointmentEventModel.find().sort({ revision: 1 }).lean()
    vi.setSystemTime(at(6))
    const result = await correct(mine._id, owner, body({ expectedRevision: 2, reason: '  Completion was pressed accidentally.  ' })).expect(200)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(result.body.data).toMatchObject({ status: 'in_progress', revision: 3, startedAt: NOW.toISOString(), occupiedFrom: NOW.toISOString(), occupiedUntil: at(40).toISOString() })
    expect(result.body.data).not.toHaveProperty('completedAt')
    expect(result.body.data).not.toHaveProperty('estimatedEndAt')
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored.startedAt).toEqual(NOW)
    expect(stored.completedAt).toBeUndefined()
    expect(stored.estimatedEndAt).toBeUndefined()
    expect(stored.serviceNotCompleted).toBeUndefined()
    for (const field of ['startAt', 'endAt', 'items', 'customerSnapshot', 'staffNameSnapshot', 'staffId', 'customerId', 'totalPriceVnd', 'totalDurationMinutes', 'confirmedAt', 'bookingMode']) {
      expect(stored[field]).toEqual(mine.toObject()[field])
    }
    const events = await AppointmentEventModel.find().sort({ revision: 1 }).lean()
    expect(events.slice(0, 2)).toEqual(oldEvents)
    expect(events.map(event => event.kind)).toEqual(['started', 'completed', 'corrected'])
    expect(events[2]).toMatchObject({ kind: 'corrected', revision: 3, actorId: owner.account._id, occurredAt: at(6), reason: 'Completion was pressed accidentally.',
      before: { status: 'completed', startedAt: NOW, completedAt: at(5) }, after: { status: 'in_progress', startedAt: NOW } })
    expect(events[2].after.completedAt).toBeUndefined()
  })

  it('restores the full actual/planned interval without ETA while planned end is still future', async () => {
    const mine = await completed()
    await correct(mine._id).expect(200)
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored).toMatchObject({ status: 'in_progress', revision: 1, startedAt: mine.startedAt, occupiedFrom: at(-12), occupiedUntil: at(30) })
    expect(stored.completedAt).toBeUndefined()
    expect((await CustomerModel.findById(client.customer._id)).bookingRevision).toBe(1)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(1)
  })

  it('accepts a valid optional ETA before planned end and keeps snapshots', async () => {
    const mine = await completed()
    const result = await correct(mine._id, owner, body({ estimatedEndAt: at(45).toISOString() })).expect(200)
    expect(result.body.data).toMatchObject({ estimatedEndAt: at(45).toISOString(), occupiedUntil: at(55).toISOString() })
    expect((await AppointmentModel.findById(mine._id)).items.toObject()).toEqual(mine.items.toObject())
    expect((await AppointmentEventModel.findOne().lean()).after.estimatedEndAt).toEqual(at(45))
  })

  it.each(['passed', 'exactEnd'])('requires ETA when planned end has %s', async variant => {
    const mine = await completed({ startAt: at(variant === 'passed' ? -60 : -30) })
    const result = await correct(mine._id).expect(400)
    expect(result.body.code).toBe('CORRECTION_ETA_REQUIRED')
    await unchanged(mine)
  })

  it('accepts no ETA just before planned end but never creates an expired service end', async () => {
    const mine = await completed()
    vi.setSystemTime(new Date(mine.endAt.getTime() - 1))
    await correct(mine._id).expect(200)
    expect((await AppointmentModel.findById(mine._id)).occupiedUntil).toEqual(at(30))
  })

  it('reopens an overdue appointment with request ETA and preserves its original startedAt', async () => {
    const mine = await completed({ startAt: at(-60) })
    const result = await correct(mine._id, owner, body({ estimatedEndAt: at(45).toISOString() })).expect(200)
    expect(result.body.data).toMatchObject({ status: 'in_progress', startedAt: mine.startedAt.toISOString(), estimatedEndAt: at(45).toISOString(), occupiedFrom: at(-60).toISOString(), occupiedUntil: at(55).toISOString() })
    const stored = await AppointmentModel.findById(mine._id).lean()
    expect(stored.startAt).toEqual(mine.startAt)
    expect(stored.endAt).toEqual(mine.endAt)
    expect(stored.completedAt).toBeUndefined()
  })

  it('does not infer a previous ETA from the audit after Complete removed it', async () => {
    const mine = await appointment({ status: 'in_progress', startAt: at(-60) })
    await command(mine._id, 'eta', stylist, { expectedRevision: 0, estimatedEndAt: at(45).toISOString() }, 'sol036-eta-before-false-complete').expect(200)
    await command(mine._id, 'complete', stylist, { expectedRevision: 1 }, 'sol036-complete-after-eta-before-correct').expect(200)
    expect((await correct(mine._id, owner, body({ expectedRevision: 2 })).expect(400)).body.code).toBe('CORRECTION_ETA_REQUIRED')
    expect((await AppointmentModel.findById(mine._id)).status).toBe('completed')
    expect(await AppointmentEventModel.countDocuments()).toBe(2)
    await correct(mine._id, owner, body({ expectedRevision: 2, estimatedEndAt: at(60).toISOString() })).expect(200)
    expect((await AppointmentEventModel.find().sort({ revision: 1 }).lean()).map(event => event.kind)).toEqual(['eta_updated', 'completed', 'corrected'])
  })

  it.each(['past', 'now', 'plannedEnd', 'beforePlannedEnd'])('rejects ETA at %s', async variant => {
    const mine = await completed()
    const eta = { past: at(-1), now: NOW, plannedEnd: mine.endAt, beforePlannedEnd: at(10) }[variant]
    expect((await correct(mine._id, owner, body({ estimatedEndAt: eta.toISOString() })).expect(400)).body.code).toBe('INVALID_ETA')
    await unchanged(mine)
  })

  it.each([null, 'bad', 42, {}, '2026-10-20T11:00:00+07:00', '+275760-09-13T00:00:00.000Z'])('rejects malformed ETA %j', async estimatedEndAt => {
    const mine = await completed({ startAt: at(-60) })
    await correct(mine._id, owner, body({ estimatedEndAt })).expect(400)
    await unchanged(mine)
  })

  it('accepts a future ETA one millisecond after now for an overdue planned end', async () => {
    const mine = await completed({ startAt: at(-60) })
    await correct(mine._id, owner, body({ estimatedEndAt: new Date(NOW.getTime() + 1).toISOString() })).expect(200)
    expect((await AppointmentModel.findById(mine._id)).occupiedUntil.getTime()).toBe(NOW.getTime() + 600_001)
  })

  it('denies customer with no correction details', async () => {
    const mine = await completed()
    const result = await correct(mine._id, client).expect(403)
    expect(result.body).not.toHaveProperty('details')
    await unchanged(mine)
  })

  it('requires authentication and a valid existing ID', async () => {
    await request(app).post(commandPath(oid(), 'correct-complete')).send(body()).expect(401)
    await correct('bad').expect(400)
    await correct(oid()).expect(404)
  })

  it.each(['confirmed', 'in_progress', 'cancelled', 'no_show'])('does not restore %s', async status => {
    const mine = await appointment({ status })
    expect((await correct(mine._id).expect(409)).body.code).toBe('APPOINTMENT_STATE_CONFLICT')
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
  })

  it.each([undefined, '', '   ', 42, 'x'.repeat(501)])('requires valid reason %j', async reason => {
    const mine = await completed()
    await correct(mine._id, owner, body({ reason })).expect(400)
    await unchanged(mine)
  })

  it.each([undefined, false, 'true', 1])('requires explicit unfinished-service confirmation %j', async serviceNotCompleted => {
    const mine = await completed()
    expect((await correct(mine._id, owner, body({ serviceNotCompleted })).expect(400)).body.code).toBe('SERVICE_NOT_COMPLETED_CONFIRMATION_REQUIRED')
    await unchanged(mine)
  })

  it.each([{ expectedRevision: -1 }, { expectedRevision: 0.5 }, { completedAt: NOW.toISOString() }, { startedAt: NOW.toISOString() }, { status: 'in_progress' }, { serviceNotStarted: true }, { items: [] }])('rejects invalid or extra fields %j', async patch => {
    const mine = await completed()
    await correct(mine._id, owner, body(patch)).expect(400)
    await unchanged(mine)
  })

  it('rejects stale revision and invalid key', async () => {
    const mine = await completed()
    expect((await correct(mine._id, owner, body({ expectedRevision: 1 })).expect(409)).body.code).toBe('APPOINTMENT_REVISION_CONFLICT')
    await correct(mine._id, owner, body(), 'short').expect(400)
    await unchanged(mine)
  })

  it.each(['staff', 'customer', 'both'])('refuses restoration after SOL-031 booked a new %s conflict into the released slot', async variant => {
    const mine = await completed()
    const sameStaff = variant !== 'customer'
    const sameCustomer = variant !== 'staff'
    const booking = await book(sameStaff ? stylist.staff._id : otherStylist.staff._id, sameCustomer ? client.customer._id : otherClient.customer._id).expect(201)
    const next = await AppointmentModel.findById(booking.body.data.id).lean()
    const result = await correct(mine._id).expect(409)
    expect(result.body.code).toBe('CORRECTION_CONFLICT')
    expect(result.body.details.conflictingAppointments).toEqual([{ id: String(next._id), staffId: String(next.staffId), status: 'confirmed', startAt: next.startAt.toISOString(), endAt: next.endAt.toISOString(),
      reasons: variant === 'both' ? ['staff_overlap', 'customer_overlap'] : sameStaff ? ['staff_overlap'] : ['customer_overlap'] }])
    expect(await AppointmentModel.findById(next._id).lean()).toEqual(next)
    await unchanged(mine, { eventCount: 1, staffGuard: sameStaff ? 1 : 0, customerGuard: sameCustomer ? 1 : 0 })
  })

  it('restores once the conflicting new reservation has been cancelled through the existing API', async () => {
    const mine = await completed()
    const booking = await book().expect(201)
    await correct(mine._id).expect(409)
    await command(booking.body.data.id, 'cancel', owner, { expectedRevision: 0, reason: 'Owner resolved the correction conflict with customer.' }, 'sol036-resolve-correction-conflict').expect(200)
    await correct(mine._id).expect(200)
    expect((await AppointmentModel.findById(booking.body.data.id)).status).toBe('cancelled')
    expect((await AppointmentModel.findById(mine._id)).status).toBe('in_progress')
  })

  it('refuses overlap introduced only by the new ETA cleanup extension', async () => {
    const mine = await completed()
    const next = await appointment({ customerId: otherClient.customer._id, startAt: at(45) })
    const result = await correct(mine._id, owner, body({ estimatedEndAt: at(40).toISOString() })).expect(409)
    expect(result.body.details.conflictingAppointments[0]).toMatchObject({ id: String(next._id), reasons: ['staff_overlap'] })
    await unchanged(mine)
  })

  it('does not reserve Customer cleanup on another Staff', async () => {
    const mine = await completed()
    await appointment({ staffId: otherStylist.staff._id, startAt: at(45) })
    await correct(mine._id, owner, body({ estimatedEndAt: at(45).toISOString() })).expect(200)
  })

  it('accepts exact half-open Staff cleanup adjacency', async () => {
    const mine = await completed()
    await appointment({ customerId: otherClient.customer._id, startAt: at(45) })
    await correct(mine._id, owner, body({ estimatedEndAt: at(35).toISOString() })).expect(200)
  })

  it('detects an overdue in-progress conflict despite its expired stored occupiedUntil', async () => {
    const mine = await completed()
    const busy = await appointment({ status: 'in_progress', customerId: otherClient.customer._id, startAt: at(-60) })
    const result = await correct(mine._id).expect(409)
    expect(result.body.details.conflictingAppointments[0].id).toBe(String(busy._id))
    await unchanged(mine)
  })

  it('includes another completed appointment cleanup in restore conflicts', async () => {
    const mine = await completed()
    const busy = await completed({ customerId: otherClient.customer._id, startAt: at(-60), startedAt: at(-60), completedAt: at(-15), occupiedFrom: at(-60), occupiedUntil: at(-5) })
    const result = await correct(mine._id).expect(409)
    expect(result.body.details.conflictingAppointments[0].id).toBe(String(busy._id))
    await unchanged(mine)
  })

  it.each(['cancelled', 'no_show'])('ignores %s reservations', async status => {
    const mine = await completed()
    await appointment({ status, customerId: otherClient.customer._id, startAt: at(15) })
    await correct(mine._id).expect(200)
  })

  it.each(['missing', 'cancelled', 'earlyActual', 'cleanup', 'split'])('rejects %s shift coverage', async variant => {
    await StaffShiftModel.deleteMany({})
    if (variant === 'cancelled') {
      const doc = await shift(stylist.staff._id)
      await StaffShiftModel.updateOne({ _id: doc._id }, { status: 'cancelled' })
    }
    if (variant === 'earlyActual') await shift(stylist.staff._id, '2026-10-20', '10:00', '18:00')
    if (variant === 'cleanup') await shift(stylist.staff._id, '2026-10-20', '09:00', '10:45')
    if (variant === 'split') { await shift(stylist.staff._id, '2026-10-20', '09:00', '10:00'); await shift(stylist.staff._id, '2026-10-20', '10:00', '18:00') }
    const mine = await completed(variant === 'earlyActual' ? { startAt: NOW } : {})
    const result = await correct(mine._id, owner, body(variant === 'cleanup' ? { estimatedEndAt: at(40).toISOString() } : {})).expect(409)
    expect(result.body.details.shiftConflict).toBe(true)
    await unchanged(mine)
  })

  it('rejects time-off in the restored ETA interval', async () => {
    const mine = await completed()
    await mongoose.connection.db.collection('staff_time_off').insertOne({ staffId: stylist.staff._id, startAt: at(30), endAt: at(45) })
    const result = await correct(mine._id, owner, body({ estimatedEndAt: at(45).toISOString() })).expect(409)
    expect(result.body.details.timeOffConflicts).toEqual([{ startAt: at(30).toISOString(), endAt: at(45).toISOString() }])
    await unchanged(mine)
  })

  it('availability reserves the restored planned interval after an early accidental completion', async () => {
    const mine = await completed()
    expect((await slots())[0]).toBe(at(15).toISOString())
    await correct(mine._id).expect(200)
    expect((await slots())[0]).toBe(at(30).toISOString())
  })

  it('availability reserves the restored ETA plus ten-minute cleanup', async () => {
    const mine = await completed({ startAt: at(-60) })
    await correct(mine._id, owner, body({ estimatedEndAt: at(45).toISOString() })).expect(200)
    expect((await slots())[0]).toBe(at(60).toISOString())
  })

  it('replays the original correction after its ETA expires without another event or revision', async () => {
    const mine = await completed({ startAt: at(-60) })
    const input = body({ estimatedEndAt: at(45).toISOString() })
    const first = await correct(mine._id, owner, input).expect(200)
    vi.setSystemTime(at(46))
    const replay = await correct(mine._id, owner, input).expect(200)
    expect(replay.body).toEqual(first.body)
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
    expect((await AppointmentModel.findById(mine._id)).revision).toBe(1)
    expect(await slots()).toEqual([])
  })

  it('replays without ETA even when the unchanged planned end later passes', async () => {
    const mine = await completed()
    const first = await correct(mine._id).expect(200)
    vi.setSystemTime(at(25))
    expect((await correct(mine._id).expect(200)).body).toEqual(first.body)
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it.each(['reason', 'ETA'])('rejects changed %s intent on the same key', async variant => {
    const mine = await completed()
    const input = body({ estimatedEndAt: at(45).toISOString() })
    await correct(mine._id, owner, input).expect(200)
    const changed = variant === 'reason' ? { ...input, reason: 'A different reason' } : { ...input, estimatedEndAt: at(50).toISOString() }
    expect((await correct(mine._id, owner, changed).expect(409)).body.code).toBe('COMMAND_KEY_CONFLICT')
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('serializes duplicate concurrent corrections to one revision/event', async () => {
    const mine = await completed()
    const result = await Promise.all([correct(mine._id), correct(mine._id)])
    expect(result.map(item => item.status)).toEqual([200, 200])
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('allows only one of concurrent different correction keys at the same revision', async () => {
    const mine = await completed()
    const result = await Promise.all([correct(mine._id), correct(mine._id, owner, body(), 'sol036-correct-complete-command-0002')])
    expect(result.map(item => item.status).sort()).toEqual([200, 409])
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
  })

  it('serializes SOL-031 booking against restoration of the released interval', async () => {
    const mine = await completed()
    const [correction, booking] = await Promise.all([correct(mine._id), book()])
    expect([[200, 409], [409, 201]]).toContainEqual([correction.status, booking.status])
    expect(await AppointmentEventModel.countDocuments()).toBe(1)
    expect(await AppointmentModel.countDocuments()).toBe(correction.status === 200 ? 1 : 2)
    expect((await AppointmentModel.findById(mine._id)).status).toBe(correction.status === 200 ? 'in_progress' : 'completed')
  })

  it.each(['audit', 'CAS', 'calendar'])('rolls back all correction writes after %s failure', async stage => {
    const mine = await completed()
    if (stage === 'audit') vi.spyOn(appointmentRepository, 'insertAppointmentEvent').mockRejectedValueOnce(new Error('synthetic correct-complete audit failure'))
    if (stage === 'CAS') vi.spyOn(appointmentRepository, 'persistCorrectedCompleteAppointment').mockResolvedValueOnce(null)
    if (stage === 'calendar') vi.spyOn(availabilityRepository, 'findAvailabilityCalendar').mockRejectedValueOnce(new Error('synthetic correct-complete calendar failure'))
    await correct(mine._id).expect(stage === 'CAS' ? 409 : 500)
    await unchanged(mine)
  })

  it('checks Owner permission again inside the transaction', async () => {
    const mine = await completed()
    vi.spyOn(appointmentRepository, 'findAppointmentCommandActor').mockResolvedValueOnce({ accountId: String(owner.account._id), roles: ['customer'], authRevision: owner.account.authRevision })
    await correct(mine._id).expect(403)
    await unchanged(mine)
  })
})

describe('Customer and Owner reschedule option snapshots', () => {
  beforeEach(async () => {
    await shift(stylist.staff._id)
    await shift(otherStylist.staff._id)
  })
  const path = id => detailPath(id) + '/reschedule-options?localDate=2026-10-20'

  it('uses the existing snapshot, excludes itself and works without active catalog services', async () => {
    const mine = await appointment()
    const response = await get(path(mine._id)).expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.data).toMatchObject({ appointmentId: String(mine._id), revision: 0 })
    const staff = response.body.data.stylists.find(item => item.staffId === String(stylist.staff._id))
    expect(staff.slots.some(slot => slot.startAt === mine.startAt.toISOString())).toBe(true)
    expect(staff.slots.find(slot => slot.startAt === mine.startAt.toISOString()).endAt).toBe(mine.endAt.toISOString())
    expect(JSON.stringify(response.body)).not.toContain('Private customer')
    expect(JSON.stringify(response.body)).not.toContain('+849')
    await assertUnchanged(mine._id)
  })
  it('reflects another appointment, cleanup and unchanged snapshot duration', async () => {
    const mine = await appointment()
    await appointment({ customerId: otherClient.customer._id, startAt: new Date(newStart(240)),
      endAt: new Date(newStart(270)), occupiedFrom: new Date(newStart(240)), occupiedUntil: new Date(newStart(280)) })
    const data = (await get(path(mine._id)).expect(200)).body.data
    const slots = data.stylists.find(item => item.staffId === String(stylist.staff._id)).slots
    expect(slots.some(slot => slot.startAt === newStart(225))).toBe(false)
    expect(slots.some(slot => slot.startAt === newStart(270))).toBe(false)
    expect(slots.some(slot => slot.startAt === newStart(285))).toBe(true)
  })
  it('uses current staff capabilities and assigned shifts', async () => {
    const mine = await appointment()
    await StaffModel.updateOne({ _id: otherStylist.staff._id }, { $set: { serviceIds: [] } })
    const data = (await get(path(mine._id)).expect(200)).body.data
    expect(data.stylists.map(item => item.staffId)).not.toContain(String(otherStylist.staff._id))
    await StaffShiftModel.deleteMany({ staffId: stylist.staff._id })
    const noShift = (await get(path(mine._id)).expect(200)).body.data
    expect(noShift.stylists.find(item => item.staffId === String(stylist.staff._id)).slots).toEqual([])
  })
  it('does not expose another Customer appointment (IDOR)', async () => {
    const mine = await appointment()
    await get(path(mine._id), otherClient).expect(404)
  })
  it.each(['stylist'])('rejects %s actors', async role => {
    const mine = await appointment()
    await get(path(mine._id), role === 'owner' ? owner : stylist).expect(403)
  })
  it('requires an active session', async () => {
    await request(app).get(path(oid())).expect(401)
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('rejects %s appointments', async status => {
    const mine = await appointment({ status })
    expect((await get(path(mine._id)).expect(409)).body.code).toBe('APPOINTMENT_STATE_CONFLICT')
  })
  it('allows exact two-hour cutoff and rejects one millisecond later', async () => {
    const mine = await appointment({ startAt: new Date(newStart(120)), endAt: new Date(newStart(150)),
      occupiedFrom: new Date(newStart(120)), occupiedUntil: new Date(newStart(160)) })
    await get(path(mine._id)).expect(200)
    vi.setSystemTime(new Date(NOW.getTime() + 1))
    expect((await get(path(mine._id)).expect(409)).body.code).toBe('RESCHEDULE_CUTOFF')
  })
  it('rejects client-supplied snapshot, scope, exclusion and invalid dates', async () => {
    const mine = await appointment()
    for (const field of ['customerId', 'serviceIds', 'excludeAppointmentId', 'durationMinutes']) {
      await get(path(mine._id) + '&' + field + '=other').expect(400)
    }
    await get(detailPath(mine._id) + '/reschedule-options?localDate=bad').expect(400)
    await get(detailPath(mine._id) + '/reschedule-options?localDate=2026-11-01').expect(400)
    await get(detailPath('invalid') + '/reschedule-options?localDate=2026-10-20').expect(400)
  })
  it('lets Owner read late appointments with snapshot slots at server-now and no Customer cutoff', async () => {
    const mine = await appointment({ startAt: new Date(newStart(15)) })
    const data = (await get(path(mine._id), owner).expect(200)).body.data
    const slots = data.stylists.find(item => item.staffId === String(stylist.staff._id)).slots
    expect(slots.some(slot => slot.startAt === NOW.toISOString())).toBe(true)
    expect((await get(path(mine._id)).expect(409)).body.code).toBe('RESCHEDULE_CUTOFF')
    expect(data.items).toEqual(mine.items.map(item => item.toObject()))
    expect(JSON.stringify(data)).not.toContain('Private customer')
    await assertUnchanged(mine._id)
  })
  it('checks the appointment Customer across Staff for Owner and excludes only itself', async () => {
    const mine = await appointment()
    await appointment({ staffId: otherStylist.staff._id, startAt: NOW })
    const data = (await get(path(mine._id), owner).expect(200)).body.data
    const slots = data.stylists.find(item => item.staffId === String(stylist.staff._id)).slots
    expect(slots.some(slot => slot.startAt === NOW.toISOString())).toBe(false)
    expect(slots.some(slot => slot.startAt === newStart(30))).toBe(true)
    expect(slots.some(slot => slot.startAt === mine.startAt.toISOString())).toBe(true)
  })
  it('uses Owner precedence for mixed roles without a Customer profile for the Owner', async () => {
    const mine = await appointment({ startAt: new Date(newStart(15)) })
    await AccountModel.updateOne({ _id: owner.account._id }, { $set: { roles: ['customer', 'owner'] } })
    await get(path(mine._id), owner).expect(200)
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('rejects Owner options for %s', async status => {
    const mine = await appointment({ status })
    expect((await get(path(mine._id), owner).expect(409)).body.code).toBe('APPOINTMENT_STATE_CONFLICT')
  })
  it('reads selected date through the partial eighth day within 168 hours, rejecting injected scope', async () => {
    const mine = await appointment()
    await shift(stylist.staff._id, '2026-10-27')
    const data = (await get(detailPath(mine._id) + '/reschedule-options?localDate=2026-10-27', owner).expect(200)).body.data
    expect(data.localDate).toBe('2026-10-27')
    const slots = data.stylists.find(item => item.staffId === String(stylist.staff._id)).slots
    expect(slots.some(slot => slot.startAt === newStart(168 * 60))).toBe(true)
    expect(slots.every(slot => Date.parse(slot.startAt) <= NOW.getTime() + 168 * 60 * MINUTE)).toBe(true)
    for (const field of ['customerId', 'serviceIds', 'excludeAppointmentId', 'durationMinutes']) {
      await get(path(mine._id) + '&' + field + '=other', owner).expect(400)
    }
    await get(path(oid()), owner).expect(404)
  })
  it('can submit an Owner snapshot option without changing booked services', async () => {
    const mine = await appointment({ startAt: new Date(newStart(15)) })
    const data = (await get(path(mine._id), owner).expect(200)).body.data
    const other = data.stylists.find(item => item.staffId === String(otherStylist.staff._id))
    const selected = other.slots.find(slot => slot.startAt === NOW.toISOString())
    expect(selected).toBeDefined()
    const response = await command(mine._id, 'reschedule', owner, {
      expectedRevision: data.revision, staffId: other.staffId, startAt: selected.startAt, reason: 'Customer agreed new time',
    }).expect(200)
    expect(response.body.data).toMatchObject({ revision: 1, startAt: NOW.toISOString(), staffId: other.staffId,
      totalPriceVnd: mine.totalPriceVnd, totalDurationMinutes: mine.totalDurationMinutes })
    expect(response.body.data.items).toEqual(mine.items.map(item => item.toObject()))
  })

})

describe('Owner appointment audit API', () => {
  const auditPath = id => detailPath(id) + '/audit'
  async function event(mine, revision, patch = {}) {
    return AppointmentEventModel.create({ appointmentId: mine._id, actorId: owner.account._id, revision,
      kind: revision === 0 ? 'created' : 'started', occurredAt: NOW, before: {}, after: { status: 'confirmed' }, ...patch })
  }
  it('returns real event allowlists in reverse revision order even with duplicate timestamps', async () => {
    const mine = await appointment({ revision: 2, lastCommand: { key: 'synthetic-audit-fixture-key', actorId: owner.account._id, hash: 'a'.repeat(64), resultRevision: 2 } })
    const unrelated = await appointment()
    await event(unrelated, 0)
    const old = await event(mine, 0)
    await event(mine, 1, { kind: 'completed', after: { status: 'completed', completedAt: NOW } })
    const corrected = await event(mine, 2, { kind: 'corrected', reason: 'Synthetic correction',
      before: { status: 'completed', completedAt: NOW }, after: { status: 'in_progress', estimatedEndAt: new Date(NOW.getTime() + 3600000) } })
    const result = await get(auditPath(mine._id), owner).expect(200)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(result.body.data.items.map(item => item.revision)).toEqual([2, 1, 0])
    expect(result.body.data.items[0]).toMatchObject({ id: String(corrected._id), appointmentId: String(mine._id),
      actorId: String(owner.account._id), reason: 'Synthetic correction', before: { status: 'completed' }, after: { status: 'in_progress' } })
    expect(result.body.data.items.at(-1).id).toBe(String(old._id))
    for (const item of result.body.data.items) {
      expect(Object.keys(item).sort()).toEqual(['id', 'appointmentId', 'actorId', 'revision', 'kind', 'occurredAt', 'before', 'after', ...(item.reason ? ['reason'] : [])].sort())
      for (const field of ['email', 'passwordHash', 'lastCommand', 'createdAt', 'actorRole', 'actorName']) expect(item).not.toHaveProperty(field)
    }
  })
  it('paginates without duplicates and binds cursors to the requested appointment', async () => {
    const mine = await appointment({ revision: 2, lastCommand: { key: 'synthetic-audit-fixture-key', actorId: owner.account._id, hash: 'a'.repeat(64), resultRevision: 2 } }), other = await appointment()
    for (const revision of [0, 1, 2]) await event(mine, revision)
    const first = (await get(auditPath(mine._id), owner).query({ limit: 1 }).expect(200)).body.data
    const second = (await get(auditPath(mine._id), owner).query({ limit: 1, cursor: first.pagination.nextCursor }).expect(200)).body.data
    const third = (await get(auditPath(mine._id), owner).query({ limit: 1, cursor: second.pagination.nextCursor }).expect(200)).body.data
    expect([...first.items, ...second.items, ...third.items].map(item => item.revision)).toEqual([2, 1, 0])
    expect(third.pagination).toEqual({ limit: 1, hasNextPage: false, nextCursor: null })
    expect((await get(auditPath(other._id), owner).query({ cursor: first.pagination.nextCursor }).expect(400)).body.code).toBe('INVALID_CURSOR')
  })
  it.each(['customer', 'stylist', 'otherStylist'])('denies %s administrative audit access', async role => {
    const mine = await appointment()
    await event(mine, 0)
    const result = await get(auditPath(mine._id), { customer: client, stylist, otherStylist }[role]).expect(403)
    expect(result.body).not.toHaveProperty('data')
  })
  it('requires login and handles malformed/missing appointments', async () => {
    await request(app).get(auditPath(oid())).expect(401)
    await get(auditPath('bad'), owner).expect(400)
    await get(auditPath(oid()), owner).expect(404)
  })
  it.each([{ limit: '0' }, { limit: '51' }, { limit: '1.5' }, { cursor: 'bad' }, { status: 'confirmed' },
    { cursor: Buffer.from(JSON.stringify({ appointmentId: 'bad', revision: -1 })).toString('base64url') }])('rejects invalid query %j', async query => {
    const mine = await appointment()
    await get(auditPath(mine._id), owner).query(query).expect(400)
  })
  it('returns an empty event list instead of fabricating history, including cancelled appointments', async () => {
    const mine = await appointment({ status: 'cancelled' })
    const result = await get(auditPath(mine._id), owner).expect(200)
    expect(result.body.data).toEqual({ items: [], pagination: { limit: 20, hasNextPage: false, nextCursor: null } })
  })
  it('reads without changing appointment, guard revisions or event documents', async () => {
    const mine = await appointment()
    await event(mine, 0)
    const before = await AppointmentModel.findById(mine._id).lean()
    const history = await AppointmentEventModel.find({ appointmentId: mine._id }).lean()
    const guard = (await StaffModel.findById(stylist.staff._id)).bookingRevision
    await get(auditPath(mine._id), owner).expect(200)
    await get(auditPath(mine._id), owner).expect(200)
    expect(await AppointmentModel.findById(mine._id).lean()).toEqual(before)
    expect(await AppointmentEventModel.find({ appointmentId: mine._id }).lean()).toEqual(history)
    expect((await StaffModel.findById(stylist.staff._id)).bookingRevision).toBe(guard)
  })
  it.each(['correct-start', 'correct-complete'])('preserves prior real service events and reads the new %s event', async operation => {
    await shift(stylist.staff._id)
    const mine = await appointment({ startAt: NOW })
    await command(mine._id, 'start', owner, { expectedRevision: 0 }, 'audit-read-start-key-0001').expect(200)
    if (operation === 'correct-complete') {
      vi.setSystemTime(new Date(NOW.getTime() + 5 * MINUTE))
      await command(mine._id, 'complete', owner, { expectedRevision: 1 }, 'audit-read-complete-key-0001').expect(200)
    }
    const before = (await get(auditPath(mine._id), owner).expect(200)).body.data.items
    const expectedRevision = operation === 'correct-start' ? 1 : 2
    await command(mine._id, operation, owner, { expectedRevision, reason: 'Actual service was misreported',
      [operation === 'correct-start' ? 'serviceNotStarted' : 'serviceNotCompleted']: true }, 'audit-read-correction-key-0001').expect(200)
    const after = (await get(auditPath(mine._id), owner).expect(200)).body.data.items
    expect(after.slice(1)).toEqual(before)
    expect(after[0]).toMatchObject({ kind: 'corrected', reason: 'Actual service was misreported', revision: expectedRevision + 1 })
  })
})


describe('Stylist corrections restricted to assigned appointments', () => {
  const at = minutes => new Date(NOW.getTime() + minutes * MINUTE)
  beforeEach(async () => { await shift(stylist.staff._id); await shift(otherStylist.staff._id) })
  const cases = [
    ['correct-start', 'in_progress', 'confirmed', 'serviceNotStarted'],
    ['correct-complete', 'completed', 'in_progress', 'serviceNotCompleted'],
  ]
  function fixture(status) {
    return appointment({ status, startAt: at(-10), startedAt: at(-10), occupiedFrom: at(-10),
      ...(status === 'completed' ? { completedAt: at(-5), occupiedUntil: at(5) } : {}) })
  }
  it.each(cases)('%s permits assigned Stylist, records actor and replays once', async (operation, status, target, flag) => {
    const mine = await fixture(status)
    const body = { expectedRevision: 0, reason: 'Pressed by mistake', [flag]: true }
    await command(mine._id, operation, stylist, body).expect(200)
    await command(mine._id, operation, stylist, body).expect(200)
    expect(await AppointmentModel.findById(mine._id).lean()).toMatchObject({ status: target, revision: 1 })
    expect(await AppointmentEventModel.countDocuments({ appointmentId: mine._id })).toBe(1)
    expect(await AppointmentEventModel.findOne({ appointmentId: mine._id }).lean()).toMatchObject({ actorId: stylist.account._id, kind: 'corrected', reason: body.reason })
  })
  it.each(cases)('%s rejects another Stylist without writes or details', async (operation, status, target, flag) => {
    const mine = await fixture(status)
    const result = await command(mine._id, operation, otherStylist, { expectedRevision: 0, reason: 'Not assigned', [flag]: true }).expect(404)
    expect(result.body).not.toHaveProperty('details')
    expect((await AppointmentModel.findById(mine._id)).revision).toBe(0)
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
  })
  it('does not reveal a conflicting appointment assigned to another Stylist', async () => {
    const mine = await fixture('completed')
    const hidden = await appointment({ staffId: otherStylist.staff._id, startAt: at(5) })
    const result = await command(mine._id, 'correct-complete', stylist, { expectedRevision: 0, reason: 'Still serving', serviceNotCompleted: true }).expect(409)
    expect(result.body.code).toBe('CORRECTION_CONFLICT')
    expect(result.body.details).toMatchObject({ ownerReviewRequired: true, conflictingAppointments: [] })
    expect(JSON.stringify(result.body)).not.toContain(String(hidden._id))
    expect((await AppointmentModel.findById(mine._id)).status).toBe('completed')
    expect(await AppointmentEventModel.countDocuments()).toBe(0)
  })
})
