import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'
  process.env.AUTH_SECRET = 'sol039-lifecycle-integration-fixture-secret-32b'
})
import { app } from '../../../app.js'
import { connectToDatabase, disconnectFromDatabase } from '../../../config/database.js'
import { AccountModel } from '../../auth/accounts.model.js'
import { resetRateLimits } from '../../auth/rate-limiter.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { StaffModel } from '../../staff/staff.model.js'
import { StaffShiftModel } from '../../staff/staff-shifts.model.js'
import { ServiceModel } from '../../services/services.model.js'
import { AppointmentModel } from '../appointments.model.js'
import { AppointmentEventModel } from '../appointment-events.model.js'
import { BookingRequestModel } from '../booking-requests.model.js'
import { prepareBookingStorage } from '../booking.repository.js'
import * as repository from '../appointments.repository.js'
import { seedAcceptanceData } from '../../../../scripts/booking-acceptance/fixtures.js'
import { seedLifecycleAcceptanceData } from '../../../../scripts/booking-acceptance/lifecycle-fixtures.js'
import { startAcceptanceProxy } from '../../../../scripts/booking-acceptance/proxy.js'
import * as webBooking from '../../../../../web/src/features/booking/api/booking.api.js'
import * as web from '../../../../../web/src/features/appointments/api/appointments.api.js'
import * as owner from '../../../../../web/src/features/appointments/api/owner-appointments.api.js'
import { sendOwnerCorrection } from '../../../../../web/src/features/appointments/api/owner-corrections.api.js'
import { readOwnerAudit } from '../../../../../web/src/features/appointments/api/owner-audit.api.js'
import * as mobile from '../../../../../mobile/src/features/appointments/api/appointments.api.js'
import * as stylist from '../../../../../mobile/src/features/appointments/api/stylist-appointments.api.js'
import { updateStylistEta } from '../../../../../mobile/src/features/appointments/api/stylist-eta.api.js'
import { sendStylistCorrection } from '../../../../../mobile/src/features/appointments/api/stylist-corrections.api.js'
import { listStylistServiceHistory } from '../../../../../mobile/src/features/appointments/api/stylist-service-history.api.js'

const NOW = new Date('2026-11-06T03:00:00.000Z') // 10:00 Asia/Ho_Chi_Minh
const localDate = '2026-11-06'
const at = time => new Date(`${localDate}T${time}+07:00`).toISOString()
const models = [AccountModel, CustomerModel, StaffModel, StaffShiftModel, ServiceModel,
  AppointmentModel, AppointmentEventModel, BookingRequestModel]
let replica, server, baseUrl, fixture, tokens

async function http(path, role = 'owner', { method = 'GET', body, key } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { Authorization: `Bearer ${tokens[role]}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}
const command = (id, operation, role, body, key = randomUUID()) =>
  http(`/api/appointments/${id}/${operation}`, role, { method: 'POST', body, key })
const book = (start = '13:00:00', role = 'web', patch = {}) => webBooking.createBooking(baseUrl, tokens[role], {
  serviceIds: ['accept-cut'], staffId: fixture.staffIds[0], startAt: at(start), bookingMode: 'customer', ...patch,
}, randomUUID())
const ownerCommand = (id, operation, body, key = randomUUID()) =>
  owner.sendOwnerAppointmentCommand(baseUrl, tokens.owner, id, operation, body, key)
const service = (id, operation, revision, key = randomUUID()) =>
  stylist.sendStylistServiceCommand(baseUrl, tokens.stylist, id, operation, { expectedRevision: revision }, key)
const events = id => AppointmentEventModel.find({ appointmentId: id }).sort({ revision: 1 }).lean()
async function unchanged(id, before, count) {
  expect(await AppointmentModel.findById(id).lean()).toEqual(before)
  expect(await AppointmentEventModel.countDocuments({ appointmentId: id })).toBe(count)
}
const clients = {
  web: {
    read: web.readCustomerAppointment,
    options: web.readRescheduleOptions,
    send: (id, operation, body) => web.sendAppointmentCommand(baseUrl, tokens.web, id, operation, body, randomUUID()),
  },
  mobile: {
    read: mobile.getCustomerAppointment,
    options: mobile.getCustomerRescheduleOptions,
    send: (id, operation, body) => operation === 'cancel'
      ? mobile.cancelCustomerAppointment(baseUrl, tokens.web, id, body, randomUUID())
      : mobile.rescheduleCustomerAppointment(baseUrl, tokens.web, id, body, randomUUID()),
  },
}

beforeAll(async () => {
  // This suite never accepts a URI or connects to an application database.
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: '8.0.17' } })
  await connectToDatabase(replica.getUri('sol039_lifecycle_integration'))
  for (const model of models.slice(0, 5)) await model.init()
  await prepareBookingStorage()
  server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
}, 180000)
beforeEach(async () => {
  resetRateLimits()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  for (const model of models) await model.deleteMany({})
  fixture = await seedAcceptanceData(NOW)
  tokens = {}
  for (const [role, actor] of Object.entries(fixture.actors)) {
    const response = await fetch(baseUrl + '/api/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: actor.email, password: actor.password }) })
    expect(response.status).toBe(200)
    tokens[role] = (await response.json()).data.token
  }
}, 15000)
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
  await disconnectFromDatabase()
  if (replica) await replica.stop()
})

describe('SOL-039 real HTTP integration: M1 identity, M3 shifts, M4 booking and M5 lifecycle', () => {
  it('the isolated native acceptance fixture starts confirmed and no-show goes through the real owner API', async () => {
    const { noShowId } = await seedLifecycleAcceptanceData(fixture, NOW)
    const before = await AppointmentModel.findById(noShowId).lean()
    expect(before).toMatchObject({ status: 'confirmed', revision: 0 })
    expect(before.startAt.getTime()).toBe(NOW.getTime() - 20 * 60_000)
    const result = await ownerCommand(noShowId, 'no-show', { expectedRevision: 0, contactAttemptedAt: NOW.toISOString() })
    expect(result.status).toBe('no_show')
    expect((await events(noShowId)).map(event => event.kind)).toEqual(['created', 'no_show'])
  })
  it('web and mobile read the same booking while other same-phone profiles and staff cannot access it', async () => {
    const booked = await book()
    const a = await web.readCustomerAppointment(baseUrl, tokens.web, booked.id)
    const b = await mobile.getCustomerAppointment(baseUrl, tokens.web, booked.id)
    expect(a).toMatchObject({ id: b.id, staffId: b.staffId, startAt: b.startAt, status: 'confirmed' })
    for (const dto of [a, b]) for (const key of ['customerId', 'customerSnapshot', 'lastCommand', 'email', 'actorId'])
      expect(dto).not.toHaveProperty(key)
    for (const role of ['mobile', 'stylist2'])
      expect((await http(`/api/appointments/${booked.id}`, role)).status).toBe(404)
    expect((await mobile.listCustomerAppointments(baseUrl, tokens.mobile)).items).toEqual([])
    expect((await stylist.listStylistAppointments(baseUrl, tokens.stylist, localDate)).items.map(item => item.id)).toEqual([booked.id])
    for (const role of ['web', 'stylist', 'stylist2']) {
      const audit = await http(`/api/appointments/${booked.id}/audit`, role)
      expect(audit.status).toBe(403)
      expect(audit.body).not.toHaveProperty('data')
    }
  })

  for (const platform of ['web', 'mobile']) for (const operation of ['cancel', 'reschedule']) {
    it.each([0, 1])(`${platform} ${operation}: exact two-hour cutoff succeeds, +%i ms cannot bypass it`, async offset => {
      const booked = await book()
      const client = clients[platform]
      const before = await AppointmentModel.findById(booked.id).lean()
      vi.setSystemTime(new Date(Date.parse(at('11:00:00')) + offset))
      const body = { expectedRevision: 0, ...(operation === 'reschedule'
        ? { startAt: at('14:00:00'), staffId: fixture.staffIds[1] } : {}) }
      if (offset) {
        await expect(client.send(booked.id, operation, body)).rejects.toMatchObject({ status: 409 })
        await expect(client.options(baseUrl, tokens.web, booked.id, localDate)).rejects.toMatchObject({ status: 409 })
        await unchanged(booked.id, before, 1)
      } else {
        const result = await client.send(booked.id, operation, body)
        expect(result).toMatchObject({ status: operation === 'cancel' ? 'cancelled' : 'confirmed', revision: 1 })
        expect((await events(booked.id)).map(event => event.kind)).toEqual(['created', operation === 'cancel' ? 'cancelled' : 'rescheduled'])
        if (operation === 'reschedule') {
          expect((await stylist.listStylistAppointments(baseUrl, tokens.stylist, localDate)).items).toEqual([])
          expect((await http(`/api/appointments/${booked.id}`, 'stylist')).status).toBe(404)
          expect((await stylist.getStylistAppointment(baseUrl, tokens.stylist2, booked.id)).staffId).toBe(fixture.staffIds[1])
          const stored = await AppointmentModel.findById(booked.id).lean()
          expect(stored.items).toEqual(before.items)
          expect(stored.customerSnapshot).toEqual(before.customerSnapshot)
        }
      }
    })
  }

  it('no-show requires contact and 15 minutes; a returning customer gets a new booking, not a reopened one', async () => {
    const booked = await book('10:30:00')
    vi.setSystemTime(new Date(at('10:44:59.999')))
    expect((await command(booked.id, 'no-show', 'owner', { expectedRevision: 0, contactAttemptedAt: at('10:40:00') })).status).toBe(409)
    vi.setSystemTime(new Date(at('10:45:00')))
    await ownerCommand(booked.id, 'no-show', { expectedRevision: 0, contactAttemptedAt: at('10:45:00') })
    expect((await command(booked.id, 'start', 'owner', { expectedRevision: 1 })).status).toBe(409)
    const returned = await book('10:45:00', 'owner', { bookingMode: 'owner_walkin', startAt: undefined, customerId: fixture.actors.web.customerId })
    expect(returned.id).not.toBe(booked.id)
    expect((await AppointmentModel.findById(booked.id)).status).toBe('no_show')
    expect((await events(booked.id)).map(event => event.kind)).toEqual(['created', 'no_show'])
  })

  it('mobile starts and finishes early; web sees actual times and M4 reuses the released slot', async () => {
    const booked = await book('10:30:00')
    vi.setSystemTime(new Date(at('10:30:00')))
    await service(booked.id, 'start', 0)
    vi.setSystemTime(new Date(at('10:40:00')))
    const done = await service(booked.id, 'complete', 1)
    const customer = await web.readCustomerAppointment(baseUrl, tokens.web, booked.id)
    expect(customer).toMatchObject({ status: 'completed', startedAt: at('10:30:00'), completedAt: at('10:40:00') })
    expect(done.completedAt).toBe(at('10:40:00'))
    expect((await listStylistServiceHistory(baseUrl, tokens.stylist, booked.id)).items.map(item => item.id)).toEqual([booked.id])
    const next = await book('11:00:00', 'owner', { bookingMode: 'owner_scheduled', customerId: fixture.actors.mobile.customerId })
    expect(next.id).not.toBe(booked.id)
    expect((await AppointmentModel.findById(booked.id)).occupiedUntil.toISOString()).toBe(at('10:50:00'))
    expect((await events(booked.id)).map(event => event.kind)).toEqual(['created', 'started', 'completed'])
  })

  it('ETA warns about a following booking without moving it or leaking contacts to customers', async () => {
    const booked = await book('10:30:00')
    const following = await book('11:15:00', 'mobile')
    const before = await AppointmentModel.findById(following.id).lean()
    vi.setSystemTime(new Date(at('10:30:00')))
    await service(booked.id, 'start', 0)
    const eta = await updateStylistEta(baseUrl, tokens.stylist, booked.id,
      { expectedRevision: 1, estimatedEndAt: at('11:30:00') }, randomUUID())
    expect(eta).toMatchObject({ status: 'in_progress', estimatedEndAt: at('11:30:00'), ownerReviewRequired: true })
    const detail = await owner.readOwnerAppointment(baseUrl, tokens.owner, booked.id)
    expect(detail.affectedAppointments.map(item => item.id)).toContain(following.id)
    const customer = await http(`/api/appointments/${booked.id}`, 'web')
    expect(customer.body.data).not.toHaveProperty('affectedAppointments')
    expect(customer.body.data).not.toHaveProperty('customerSnapshot')
    await unchanged(following.id, before, 1)
    expect((await events(booked.id)).map(event => event.kind)).toEqual(['created', 'started', 'eta_updated'])
  })

  it('owner corrects an accidental start once with reason, retaining original audit; customer cannot correct', async () => {
    const booked = await book('10:30:00')
    vi.setSystemTime(new Date(at('10:30:00')))
    await service(booked.id, 'start', 0)
    const intent = { expectedRevision: 1, reason: 'Started the wrong appointment', serviceNotStarted: true }
    expect((await command(booked.id, 'correct-start', 'web', intent)).status).toBe(403)
    expect((await command(booked.id, 'correct-start', 'owner', { ...intent, reason: '' })).status).toBe(400)
    const key = randomUUID()
    for (let count = 0; count < 2; count++) {
      const result = await sendOwnerCorrection(baseUrl, tokens.owner, booked.id, 'correct-start', intent, key)
      expect(result).toMatchObject({ status: 'confirmed', revision: 2 })
    }
    const audit = await readOwnerAudit(baseUrl, tokens.owner, booked.id)
    expect(audit.items.map(event => event.kind)).toEqual(['corrected', 'started', 'created'])
    expect(audit.items[0]).toMatchObject({ reason: intent.reason, actorId: fixture.actors.owner.accountId })
    expect(await AppointmentEventModel.countDocuments({ appointmentId: booked.id })).toBe(3)
  })

  it('correction of early completion detects a real intervening booking and rolls back until owner resolves it', async () => {
    const booked = await book('10:30:00')
    vi.setSystemTime(new Date(at('10:30:00')))
    await service(booked.id, 'start', 0)
    vi.setSystemTime(new Date(at('10:40:00')))
    await service(booked.id, 'complete', 1)
    const following = await book('11:00:00', 'owner', { bookingMode: 'owner_scheduled', customerId: fixture.actors.mobile.customerId })
    const before = await AppointmentModel.findById(booked.id).lean()
    const intent = { expectedRevision: 2, reason: 'Customer is still being served', serviceNotCompleted: true }
    const key = randomUUID()
    await expect(sendOwnerCorrection(baseUrl, tokens.owner, booked.id, 'correct-complete', intent, key))
      .rejects.toMatchObject({ status: 409, code: 'CORRECTION_CONFLICT' })
    await unchanged(booked.id, before, 3)
    await ownerCommand(following.id, 'cancel', { expectedRevision: 0, reason: 'Resolve confirmed restoration conflict' })
    await sendOwnerCorrection(baseUrl, tokens.owner, booked.id, 'correct-complete', intent, key)
    expect((await AppointmentModel.findById(booked.id)).status).toBe('in_progress')
    expect((await events(booked.id)).map(event => event.kind)).toEqual(['created', 'started', 'completed', 'corrected'])
    expect((await stylist.getStylistAppointment(baseUrl, tokens.stylist, booked.id)).startedAt).toBe(at('10:30:00'))
  })

  it('web cancellation and mobile start compete at one revision without partial events or double transitions', async () => {
    const booked = await book('10:30:00')
    vi.setSystemTime(new Date(at('10:30:00')))
    const outcomes = await Promise.allSettled([
      service(booked.id, 'start', 0),
      ownerCommand(booked.id, 'cancel', { expectedRevision: 0, reason: 'Owner cancellation agreed with customer' }),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.find(result => result.status === 'rejected').reason.status).toBe(409)
    expect((await AppointmentModel.findById(booked.id)).revision).toBe(1)
    expect((await events(booked.id)).map(event => event.revision)).toEqual([0, 1])
  })

  it('mobile corrections use current assigned-staff permission and preserve an owner-readable audit', async () => {
    const booked = await book('10:30:00')
    vi.setSystemTime(new Date(at('10:30:00')))
    await service(booked.id, 'start', 0)
    const first = { expectedRevision: 1, reason: 'Wrong appointment selected', serviceNotStarted: true }
    await expect(sendStylistCorrection(baseUrl, tokens.stylist2, booked.id, 'correct-start', first, randomUUID()))
      .rejects.toMatchObject({ status: 404 })
    await sendStylistCorrection(baseUrl, tokens.stylist, booked.id, 'correct-start', first, randomUUID())
    await service(booked.id, 'start', 2)
    vi.setSystemTime(new Date(at('10:40:00')))
    await service(booked.id, 'complete', 3)
    await sendStylistCorrection(baseUrl, tokens.stylist, booked.id, 'correct-complete', {
      expectedRevision: 4, reason: 'Accidental completion; still serving', serviceNotCompleted: true,
    }, randomUUID())
    const audit = await readOwnerAudit(baseUrl, tokens.owner, booked.id)
    expect(audit.items.filter(event => event.kind === 'corrected')).toHaveLength(2)
    expect(audit.items[0]).toMatchObject({ revision: 5, actorId: fixture.actors.stylist.accountId })
    expect((await http(`/api/appointments/${booked.id}/audit`, 'stylist')).status).toBe(403)
  })

  it('a disabled M1 session cannot mutate a booked appointment or reuse its old access token', async () => {
    const booked = await book()
    const before = await AppointmentModel.findById(booked.id).lean()
    await AccountModel.updateOne({ _id: fixture.actors.web.accountId }, { $set: { status: 'disabled' } })
    const response = await command(booked.id, 'cancel', 'web', { expectedRevision: 0 })
    expect([401, 403]).toContain(response.status)
    await unchanged(booked.id, before, 1)
  })

  it('concurrent retries of the same mobile intent commit a single transition and audit event', async () => {
    const booked = await book('10:30:00')
    vi.setSystemTime(new Date(at('10:30:00')))
    const key = randomUUID()
    const results = await Promise.all([service(booked.id, 'start', 0, key), service(booked.id, 'start', 0, key)])
    expect(results[0]).toEqual(results[1])
    expect((await AppointmentModel.findById(booked.id)).revision).toBe(1)
    expect((await events(booked.id)).map(event => event.kind)).toEqual(['created', 'started'])
  })

  it('a real lost command response can be retried with the same key without a second lifecycle event', async () => {
    const booked = await book('10:30:00')
    vi.setSystemTime(new Date(at('10:30:00')))
    const proxy = await startAcceptanceProxy(baseUrl)
    const key = randomUUID(), body = { expectedRevision: 0 }
    try {
      proxy.dropNextCommandResponse()
      await expect(stylist.sendStylistServiceCommand(proxy.url, tokens.stylist, booked.id, 'start', body, key)).rejects.toThrow()
      expect((await AppointmentModel.findById(booked.id)).status).toBe('in_progress')
      const replay = await stylist.sendStylistServiceCommand(proxy.url, tokens.stylist, booked.id, 'start', body, key)
      expect(replay).toMatchObject({ status: 'in_progress', revision: 1 })
      expect((await events(booked.id)).map(event => event.kind)).toEqual(['created', 'started'])
      expect(proxy.records).toEqual([])
      expect(proxy.commandRecords).toHaveLength(2)
      expect(proxy.commandRecords.map(record => record.responseDropped)).toEqual([true, false])
      expect(proxy.commandRecords[0].keyHash).toBe(proxy.commandRecords[1].keyHash)
      expect(proxy.commandRecords[0].requestHash).toBe(proxy.commandRecords[1].requestHash)
    } finally { await proxy.close() }
  })

  it('an audit write failure rolls back lifecycle, guards and receipt on the real replica set', async () => {
    const booked = await book('10:30:00')
    vi.setSystemTime(new Date(at('10:30:00')))
    const before = await AppointmentModel.findById(booked.id).lean()
    const staffBefore = await StaffModel.findById(fixture.staffIds[0]).lean()
    const customerBefore = await CustomerModel.findById(fixture.actors.web.customerId).lean()
    vi.spyOn(repository, 'insertAppointmentEvent').mockRejectedValueOnce(new Error('SOL039 isolated audit fault'))
    const response = await command(booked.id, 'start', 'stylist', { expectedRevision: 0 })
    expect(response.status).toBeGreaterThanOrEqual(500)
    await unchanged(booked.id, before, 1)
    expect((await StaffModel.findById(staffBefore._id)).bookingRevision).toBe(staffBefore.bookingRevision)
    expect((await CustomerModel.findById(customerBefore._id)).bookingRevision).toBe(customerBefore.bookingRevision)
  })

  it('M3 cannot cancel an occupied shift; after M5 cancellation it can, and availability updates', async () => {
    const booked = await book()
    const shift = await StaffShiftModel.findOne({ staffId: fixture.staffIds[0], localDate, status: 'active' })
    const path = `/api/staff/${fixture.staffIds[0]}/shifts/${shift._id}`
    expect((await http(path, 'owner', { method: 'DELETE' })).status).toBe(409)
    await web.sendAppointmentCommand(baseUrl, tokens.web, booked.id, 'cancel', { expectedRevision: 0 }, randomUUID())
    expect((await http(path, 'owner', { method: 'DELETE' })).status).toBe(200)
    const available = await webBooking.readBookingData(baseUrl, tokens.web, 'availability', {
      localDate, serviceIds: ['accept-cut'], staffId: fixture.staffIds[0],
    })
    expect(available.stylists.flatMap(item => item.slots)).toEqual([])
  })
})
