import { createHmac } from 'node:crypto'
import mongoose from 'mongoose'
import request from 'supertest'
import { SignJWT } from 'jose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.AUTH_SECRET = 'sol035-history-test-secret-at-least-32-bytes'
  process.env.NODE_ENV = 'test'
})

import { app } from '../../../app.js'
import { connectToDatabase, disconnectFromDatabase } from '../../../config/database.js'
import { AccountModel } from '../../auth/accounts.model.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { StaffModel } from '../../staff/staff.model.js'
import { AppointmentModel } from '../appointments.model.js'

let memory
let actor
let otherStaff
let customer
let otherCustomer
let context
let sequence = 0
const objectId = () => new mongoose.Types.ObjectId()
const endpoint = id => '/api/appointments/' + id + '/service-history'
const cursor = payload => Buffer.from(JSON.stringify(payload)).toString('base64url')

async function createActor(roles = ['stylist'], withStaff = true) {
  const account = await AccountModel.create({
    emailNormalized: 'actor' + (++sequence) + '@example.test',
    passwordHash: 'fixture-only-not-a-real-password-hash',
    roles, status: 'active', emailVerifiedAt: new Date(),
  })
  const token = await new SignJWT({ authRevision: account.authRevision })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(account._id))
    .setJti(String(objectId()))
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer('sol-hair-studio')
    .setAudience('sol-hair-clients')
    .sign(createHmac('sha256', process.env.AUTH_SECRET).update('sol-hair-studio/access-token').digest())
  const staff = withStaff ? await StaffModel.create({
    accountId: account._id, displayName: 'Fixture stylist', serviceIds: ['service-cut-style'],
  }) : null
  return { account, staff, token }
}

async function appointment(overrides = {}) {
  const startAt = overrides.startAt ?? new Date('2026-10-10T03:00:00.000Z')
  const endAt = new Date(startAt.getTime() + 30 * 60_000)
  const status = overrides.status ?? 'confirmed'
  const data = {
    customerId: customer._id, staffId: actor.staff._id,
    createdByAccountId: actor.account._id, bookingMode: 'owner_scheduled',
    customerSnapshot: { displayName: 'Private customer name', phone: '+84901234567' },
    staffNameSnapshot: 'Historical stylist name',
    items: [{ serviceId: 'service-cut-style', name: 'Historical service snapshot', priceVnd: 100000, durationMinutes: 30 }],
    totalPriceVnd: 100000, totalDurationMinutes: 30, bufferAfterMinutes: 10,
    startAt, endAt, occupiedFrom: startAt,
    occupiedUntil: new Date(endAt.getTime() + 10 * 60_000),
    localDate: new Date(startAt.getTime() + 7 * 60 * 60_000).toISOString().slice(0, 10),
    timeZone: 'Asia/Ho_Chi_Minh', status, revision: 0,
    confirmedAt: new Date(startAt.getTime() - 86400_000),
  }
  if (status === 'completed' || status === 'in_progress') data.startedAt = startAt
  if (status === 'completed') {
    data.completedAt = overrides.completedAt ?? new Date(startAt.getTime() + 25 * 60_000)
    data.occupiedUntil = new Date(data.completedAt.getTime() + 10 * 60_000)
  }
  if (status === 'cancelled') data.cancelledAt = startAt
  if (status === 'no_show') {
    data.noShowAt = new Date(startAt.getTime() + 15 * 60_000)
    data.contactAttemptedAt = data.noShowAt
  }
  return AppointmentModel.create({ ...data, ...overrides })
}

function getHistory(id = context._id, token = actor.token) {
  return request(app).get(endpoint(id)).set('Authorization', 'Bearer ' + token)
}

beforeAll(async () => {
  // Only this fresh in-memory URI is connected; never use config.mongoUri.
  memory = await MongoMemoryServer.create({ binary: { version: '8.0.17' } })
  await connectToDatabase(memory.getUri('sol035_history_test'))
  for (const model of [AccountModel, CustomerModel, StaffModel]) await model.init()
  await AppointmentModel.createCollection()
  await AppointmentModel.createIndexes()
}, 180000)

afterAll(async () => {
  await disconnectFromDatabase()
  if (memory) await memory.stop()
})

beforeEach(async () => {
  for (const model of [AppointmentModel, StaffModel, CustomerModel, AccountModel]) await model.deleteMany({})
  actor = await createActor()
  otherStaff = await createActor()
  // Same phone is intentional: identity is the profile ID, not contact data.
  customer = await CustomerModel.create({ displayName: 'Customer A', phone: '+84901234567' })
  otherCustomer = await CustomerModel.create({ displayName: 'Customer B', phone: '+84901234567' })
  context = await appointment()
})

describe('GET appointment service history in authorized context', () => {
  it('returns completed history of the context customer across staff, with a strict DTO', async () => {
    const history = await appointment({ status: 'completed', staffId: otherStaff.staff._id })
    await appointment({ status: 'completed', customerId: otherCustomer._id })
    for (const status of ['confirmed', 'in_progress', 'cancelled', 'no_show']) await appointment({ status })
    const response = await getHistory().expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    const { items, pagination } = response.body.data
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      id: String(history._id), staffId: String(otherStaff.staff._id),
      staffNameSnapshot: 'Historical stylist name',
      items: [{ serviceId: 'service-cut-style', name: 'Historical service snapshot', priceVnd: 100000, durationMinutes: 30 }],
      totalPriceVnd: 100000, totalDurationMinutes: 30,
      startAt: history.startAt.toISOString(), endAt: history.endAt.toISOString(),
      completedAt: history.completedAt.toISOString(), timeZone: 'Asia/Ho_Chi_Minh',
      localDate: history.localDate, status: 'completed',
    })
    expect(pagination).toEqual({ limit: 20, hasNextPage: false, nextCursor: null })
    expect(JSON.stringify(response.body)).not.toContain('Private customer name')
    expect(JSON.stringify(response.body)).not.toContain('+84901234567')
  })

  it('returns an empty page for an authorized context without completed history', async () => {
    const response = await getHistory().expect(200)
    expect(response.body.data).toEqual({ items: [], pagination: { limit: 20, hasNextPage: false, nextCursor: null } })
  })

  it('does not leak history through another stylist context', async () => {
    const foreign = await appointment({ staffId: otherStaff.staff._id })
    await appointment({ status: 'completed' })
    const response = await getHistory(foreign._id).expect(404)
    expect(response.body.code).toBe('APPOINTMENT_NOT_FOUND')
    expect(response.body.data).toBeUndefined()
  })

  it('checks the assignment again on subsequent pages', async () => {
    await appointment({ status: 'completed' })
    await appointment({ status: 'completed' })
    const first = await getHistory().query({ limit: 1 }).expect(200)
    await AppointmentModel.updateOne({ _id: context._id }, { $set: { staffId: otherStaff.staff._id } })
    await getHistory().query({ limit: 1, cursor: first.body.data.pagination.nextCursor }).expect(404)
  })

  it.each(['cancelled', 'no_show'])('does not use %s appointments as stylist context', async status => {
    const closed = await appointment({ status })
    await getHistory(closed._id).expect(404)
  })

  it('allows owner access without requiring a Staff profile', async () => {
    const owner = await createActor(['owner'], false)
    await appointment({ status: 'completed', staffId: otherStaff.staff._id })
    const response = await getHistory(context._id, owner.token).expect(200)
    expect(response.body.data.items).toHaveLength(1)
    expect(response.body.data.items[0]).not.toHaveProperty('customerSnapshot')
  })

  it('allows owner plus stylist to use the owner scope', async () => {
    const owner = await createActor(['owner', 'stylist'], false)
    await getHistory(context._id, owner.token).expect(200)
  })

  it('rejects a customer even when the context belongs to that customer', async () => {
    const client = await createActor(['customer'], false)
    await CustomerModel.updateOne({ _id: customer._id }, { $set: { accountId: client.account._id } })
    await getHistory(context._id, client.token).expect(403)
  })

  it('requires authentication', async () => {
    await request(app).get(endpoint(context._id)).expect(401)
  })

  it('rejects an invalid token', async () => {
    await getHistory(context._id, 'invalid.token.value').expect(401)
  })

  it('rejects a disabled account with an otherwise valid token', async () => {
    await AccountModel.updateOne({ _id: actor.account._id }, { $set: { status: 'disabled' } })
    await getHistory().expect(401)
  })

  it('rejects stylist accounts without a linked Staff profile', async () => {
    const missing = await createActor(['stylist'], false)
    const response = await getHistory(context._id, missing.token).expect(404)
    expect(response.body.code).toBe('STAFF_NOT_FOUND')
  })

  it('rejects an invalid context ID and hides nonexistent contexts', async () => {
    expect((await getHistory('not-an-id').expect(400)).body.code).toBe('INVALID_APPOINTMENT_ID')
    expect((await getHistory(objectId()).expect(404)).body.code).toBe('APPOINTMENT_NOT_FOUND')
  })

  it.each(['customerId', 'staffId', 'status', 'localDate'])('rejects the %s filter instead of expanding scope', async key => {
    expect((await getHistory().query({ [key]: String(otherCustomer._id) }).expect(400)).body.code).toBe('INVALID_QUERY')
  })

  it('pages by completedAt and ID without duplicates for equal timestamps', async () => {
    const ids = ['000000000000000000000021', '000000000000000000000022', '000000000000000000000023']
    for (const id of ids) await appointment({ _id: new mongoose.Types.ObjectId(id), status: 'completed' })
    const first = await getHistory().query({ limit: 2 }).expect(200)
    expect(first.body.data.items.map(item => item.id)).toEqual([ids[2], ids[1]])
    const token = first.body.data.pagination.nextCursor
    expect(JSON.parse(Buffer.from(token, 'base64url').toString())).toEqual({
      completedAt: '2026-10-10T03:25:00.000Z', id: ids[1],
    })
    const second = await getHistory().query({ limit: 2, cursor: token }).expect(200)
    expect(second.body.data.items.map(item => item.id)).toEqual([ids[0]])
    expect(second.body.data.pagination).toEqual({ limit: 2, hasNextPage: false, nextCursor: null })
  })

  it('sorts by completion rather than scheduled start', async () => {
    const first = await appointment({ status: 'completed', completedAt: new Date('2026-10-10T04:00:00.000Z'), occupiedUntil: new Date('2026-10-10T04:10:00.000Z') })
    await appointment({ status: 'completed', startAt: new Date('2026-10-10T03:15:00.000Z') })
    expect((await getHistory().expect(200)).body.data.items[0].id).toBe(String(first._id))
  })

  it.each(['0', '51', '-1', '1.5', '', 'abc'])('rejects limit %j', async limit => {
    expect((await getHistory().query({ limit }).expect(400)).body.code).toBe('INVALID_LIMIT')
  })

  it('accepts the maximum limit and rejects duplicate limit params', async () => {
    expect((await getHistory().query({ limit: 50 }).expect(200)).body.data.pagination.limit).toBe(50)
    await getHistory().query('limit=1&limit=2').expect(400)
  })

  it.each([
    '', '!', 'e30',
    cursor({ startAt: '2026-10-10T03:25:00.000Z', id: '000000000000000000000021' }),
    cursor({ completedAt: 'bad-date', id: '000000000000000000000021' }),
    cursor({ completedAt: '2026-10-10T03:25:00.000Z', id: { $ne: null } }),
    cursor({ completedAt: '2026-10-10T03:25:00.000Z', id: '000000000000000000000021', extra: true }),
    'a'.repeat(513),
  ])('rejects invalid or wrong-sort cursor %j', async token => {
    expect((await getHistory().query({ cursor: token }).expect(400)).body.code).toBe('INVALID_CURSOR')
  })

  it('keeps startAt cursor pagination working for existing appointment lists', async () => {
    await appointment({ startAt: new Date('2026-10-10T03:15:00.000Z') })
    const path = '/api/appointments'
    const first = await request(app).get(path).set('Authorization', 'Bearer ' + actor.token)
      .query({ localDate: context.localDate, limit: 1 }).expect(200)
    const second = await request(app).get(path).set('Authorization', 'Bearer ' + actor.token)
      .query({ localDate: context.localDate, limit: 1, cursor: first.body.data.pagination.nextCursor }).expect(200)
    expect(second.body.data.items).toHaveLength(1)
    expect(second.body.data.items[0].id).not.toBe(first.body.data.items[0].id)
  })
})
