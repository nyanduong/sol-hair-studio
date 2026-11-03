import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
vi.hoisted(() => {
  process.env.NODE_ENV = 'test'
  process.env.AUTH_SECRET = 'sol034-integration-secret-for-tests-only-32-bytes'
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
import { seedAcceptanceData } from '../../../../scripts/booking-acceptance/fixtures.js'
import { startAcceptanceProxy } from '../../../../scripts/booking-acceptance/proxy.js'
import * as web from '../../../../../web/src/features/booking/api/booking.api.js'
import * as mobile from '../../../../../mobile/src/features/booking/api/booking.api.js'
import { bookingPayload, createBookingSubmission } from '../../../../../../shared/booking.js'

const NOW = new Date('2026-10-21T03:00:00.000Z')
const at = (value) => new Date(`2026-10-21T${value}+07:00`).toISOString()
const models = [
  AccountModel,
  CustomerModel,
  StaffModel,
  StaffShiftModel,
  ServiceModel,
  AppointmentModel,
  AppointmentEventModel,
  BookingRequestModel,
]
let replica, server, baseUrl, proxy, fixture, tokens

async function login(actor) {
  const response = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: actor.email, password: actor.password }),
  })
  expect(response.status).toBe(200)
  return (await response.json()).data.token
}
const payload = (patch = {}) => ({
  serviceIds: ['accept-cut'],
  staffId: fixture.staffIds[0],
  startAt: at('10:30:00'),
  bookingMode: 'customer',
  ...patch,
})
async function counts(expected) {
  expect([
    await AppointmentModel.countDocuments(),
    await AppointmentEventModel.countDocuments(),
    await BookingRequestModel.countDocuments(),
  ]).toEqual(expected)
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: '8.0.17' },
  })
  await connectToDatabase(replica.getUri('sol034_socket_integration'))
  for (const model of models.slice(0, 5)) await model.init()
  await prepareBookingStorage()
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
}, 180000)
beforeEach(async () => {
  resetRateLimits() // Isolate M1 login counters between independently seeded scenarios.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  for (const model of models) await model.deleteMany({})
  fixture = await seedAcceptanceData(NOW)
  tokens = {}
  for (const role of ['web', 'mobile', 'owner']) tokens[role] = await login(fixture.actors[role])
  proxy = await startAcceptanceProxy(baseUrl)
})
afterEach(async () => {
  if (proxy) await proxy.close()
  vi.useRealTimers()
})
afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  await disconnectFromDatabase()
  if (replica) await replica.stop()
})

describe('SOL-034 actual HTTP sockets, shared clients and MongoDB', () => {
  it.each([
    ['Web', web, 'web'],
    ['Mobile JS adapter (Node, not Android UI)', mobile, 'mobile'],
  ])('%s uses M1 profile, availability and creates a real booking', async (_, client, name) => {
    const profile = await client.readBookingData(baseUrl, tokens[name], 'profile', {})
    expect(profile.status).toBe('active')
    expect(profile.customer.customerId).toBe(fixture.actors[name].customerId)
    const available = await client.readBookingData(baseUrl, tokens[name], 'availability', {
      serviceIds: ['accept-cut', 'accept-spa'],
      localDate: '2026-10-21',
    })
    expect(available.totalPriceVnd).toBe(250000)
    expect(available.totalDurationMinutes).toBe(75)
    const data = await client.createBooking(
      baseUrl,
      tokens[name],
      payload({ serviceIds: ['accept-cut', 'accept-spa'] }),
      randomUUID(),
    )
    expect((await AppointmentModel.findById(data.id)).status).toBe('confirmed')
    await counts([1, 1, 1])
  })
  it('Web and Mobile compete concurrently after both read the same available slot', async () => {
    for (const [client, token] of [
      [web, tokens.web],
      [mobile, tokens.mobile],
    ]) {
      const preview = await client.readBookingData(baseUrl, token, 'availability', {
        serviceIds: ['accept-cut'],
        localDate: '2026-10-21',
      })
      expect(preview.stylists[0].slots.some((s) => s.startAt === at('10:30:00'))).toBe(true)
    }
    const results = await Promise.allSettled([
      web.createBooking(baseUrl, tokens.web, payload(), randomUUID()),
      mobile.createBooking(baseUrl, tokens.mobile, payload(), randomUUID()),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((r) => r.status === 'rejected').reason.status).toBe(409)
    await counts([1, 1, 1])
  })
  it.each([
    ['Web', web, 'web'],
    ['Mobile JS adapter', mobile, 'mobile'],
  ])(
    '%s retains the original key/payload after a real response socket is dropped post-commit',
    async (_, client, name) => {
      proxy.dropNextResponse()
      const manager = createBookingSubmission(
        (body, key, signal) => client.createBooking(proxy.url, tokens[name], body, key, signal),
        randomUUID,
      )
      await expect(manager.run(payload())).rejects.toMatchObject({ uncertain: true })
      const pending = manager.getPending()
      expect(pending).toBeDefined()
      await counts([1, 1, 1]) // Client did not receive success, but commit is present.
      const stored = await AppointmentModel.findOne().lean()
      const result = await manager.run(payload())
      expect(result.id).toBe(String(stored._id))
      expect(manager.getPending()).toBeUndefined()
      expect(proxy.records).toHaveLength(2)
      expect(proxy.records[0]).toMatchObject({ responseDropped: true, status: 201 })
      expect(proxy.records[1]).toMatchObject({
        responseDropped: false,
        status: 201,
        requestHash: proxy.records[0].requestHash,
        keyHash: proxy.records[0].keyHash,
        appointmentId: proxy.records[0].appointmentId,
      })
      await counts([1, 1, 1])
    },
  )
  it('409 is definitive for both clients and clears pending intent without another insert', async () => {
    await web.createBooking(baseUrl, tokens.web, payload(), randomUUID())
    const manager = createBookingSubmission(
      (body, key) => mobile.createBooking(baseUrl, tokens.mobile, body, key),
      randomUUID,
    )
    await expect(manager.run(payload())).rejects.toMatchObject({ status: 409, uncertain: false })
    expect(manager.getPending()).toBeUndefined()
    await counts([1, 1, 1])
  })
  it('owner selects the exact same-phone profile and walk-in omits startAt, using server time', async () => {
    const customers = await web.readBookingData(baseUrl, tokens.owner, 'customers', {
      phone: '+84900000034',
    })
    expect(customers.items).toHaveLength(2)
    const chosen = customers.items.find((c) => c.id === fixture.actors.mobile.customerId)
    vi.setSystemTime(new Date(NOW.getTime() + 7123))
    const input = bookingPayload({
      serviceIds: ['accept-cut'],
      staffId: fixture.staffIds[0],
      startAt: NOW.toISOString(),
      owner: true,
      mode: 'owner_walkin',
      customerId: chosen.id,
    })
    expect(input).not.toHaveProperty('startAt')
    const result = await web.createBooking(proxy.url, tokens.owner, input, randomUUID())
    expect(result.startAt).toBe(new Date(NOW.getTime() + 7123).toISOString())
    expect(result.customerId).toBe(chosen.id)
    expect(proxy.records[0].hasStartAt).toBe(false)
    expect((await AppointmentModel.findById(result.id)).bookingMode).toBe('owner_walkin')
  })
  it.each([
    ['10:29:59.999', 409],
    ['10:30:00', 201],
    ['10:31:00', 409],
  ])('customer lead/grid boundary %s returns %s', async (time, status) => {
    const call = mobile.createBooking(
      baseUrl,
      tokens.mobile,
      payload({ startAt: at(time) }),
      randomUUID(),
    )
    if (status === 201) await expect(call).resolves.toHaveProperty('id')
    else await expect(call).rejects.toHaveProperty('status', status)
    await counts(status === 201 ? [1, 1, 1] : [0, 0, 0])
  })
  it.each([
    ['2026-10-28T03:00:00.000Z', 201],
    ['2026-10-28T03:15:00.000Z', 409],
  ])('seven-day instant horizon %s returns %s', async (startAt, status) => {
    const call = web.createBooking(baseUrl, tokens.web, payload({ startAt }), randomUUID())
    if (status === 201) await expect(call).resolves.toHaveProperty('id')
    else await expect(call).rejects.toHaveProperty('status', status)
  })
  it('ten-minute staff cleanup is retained but the customer can move to another stylist at serving-end', async () => {
    await web.createBooking(baseUrl, tokens.web, payload(), randomUUID())
    await expect(
      mobile.createBooking(
        baseUrl,
        tokens.mobile,
        payload({ startAt: at('11:00:00') }),
        randomUUID(),
      ),
    ).rejects.toHaveProperty('status', 409)
    await web.createBooking(
      baseUrl,
      tokens.web,
      payload({ startAt: at('11:00:00'), staffId: fixture.staffIds[1] }),
      randomUUID(),
    )
    await mobile.createBooking(
      baseUrl,
      tokens.mobile,
      payload({ startAt: at('11:15:00') }),
      randomUUID(),
    )
    await counts([3, 3, 3])
  })
  it('snapshots survive changed catalog/contact, retry stays on the same receipt', async () => {
    const key = randomUUID()
    const initial = await web.createBooking(baseUrl, tokens.web, payload(), key)
    await ServiceModel.updateOne(
      { id: 'accept-cut' },
      { name: 'Changed catalog', priceVnd: 900000 },
    )
    await web.updateBookingProfile(baseUrl, tokens.web, {
      displayName: 'Changed contact',
      phone: '+84900000099',
    })
    expect(await mobile.createBooking(baseUrl, tokens.web, payload(), key)).toEqual(initial)
    const appointment = await AppointmentModel.findById(initial.id).lean()
    expect(appointment.items[0]).toMatchObject({
      name: 'SOL034 Cut',
      priceVnd: 100000,
      durationMinutes: 30,
    })
    expect(appointment.customerSnapshot).toMatchObject({
      displayName: 'SOL034 web',
      phone: '+84900000034',
    })
    await counts([1, 1, 1])
  })
  it('receipt remains valid just before 24h, expires at the exact boundary and cannot duplicate an overlap', async () => {
    const input = payload({ startAt: '2026-10-23T03:00:00.000Z' })
    const key = randomUUID()
    const initial = await mobile.createBooking(baseUrl, tokens.mobile, input, key)
    const receipt = await BookingRequestModel.findOne().lean()
    vi.setSystemTime(new Date(receipt.expiresAt.getTime() - 1))
    // Tokens issued yesterday are intentionally replaced by a real login, same actor/key.
    const beforeExpiry = await login(fixture.actors.mobile)
    expect((await mobile.createBooking(baseUrl, beforeExpiry, input, key)).id).toBe(initial.id)
    vi.setSystemTime(receipt.expiresAt)
    const expiredToken = await login(fixture.actors.mobile)
    await expect(mobile.createBooking(baseUrl, expiredToken, input, key)).rejects.toHaveProperty(
      'status',
      409,
    )
    expect((await BookingRequestModel.findOne()).expiresAt).toEqual(receipt.expiresAt)
    const replacement = await mobile.createBooking(
      baseUrl,
      expiredToken,
      { ...input, startAt: '2026-10-23T04:00:00.000Z' },
      key,
    )
    expect(replacement.id).not.toBe(initial.id)
    await counts([2, 2, 1])
  })
  it('both clients block a stale disabled session even when replaying a committed receipt', async () => {
    const key = randomUUID()
    await web.createBooking(baseUrl, tokens.web, payload(), key)
    await AccountModel.updateOne({ _id: fixture.actors.web.accountId }, { status: 'disabled' })
    await expect(mobile.createBooking(baseUrl, tokens.web, payload(), key)).rejects.toHaveProperty(
      'status',
      401,
    )
    await counts([1, 1, 1])
  })
})
