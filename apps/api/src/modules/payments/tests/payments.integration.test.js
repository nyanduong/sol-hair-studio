import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
vi.mock('../../../config/database.js', () => ({ getDatabaseStatus: () => 'connected' }))
vi.mock('../../auth/auth.service.js', async original => ({ ...await original(), authenticate: vi.fn() }))
import { authenticate, AuthError } from '../../auth/auth.service.js'
import { app } from '../../../app.js'
import { AppointmentModel } from '../../appointments/appointments.model.js'
import { CustomerModel } from '../../customers/customers.model.js'
import { getRevenueReport } from '../../admin/revenue.service.js'
const ownerId = new mongoose.Types.ObjectId(), customerAccountId = new mongoose.Types.ObjectId()
let db, customer, appointment
const auth = req => req.set('Authorization', 'Bearer a.b.c')
const path = () => '/api/appointments/' + appointment._id + '/payment'
const confirm = (key = 'payment-request-key-0001', body = { expectedRevision: 0, receivedConfirmed: true }) => auth(request(app).post(path() + '/confirm')).set('Idempotency-Key', key).send(body)
beforeAll(async () => { db = await MongoMemoryServer.create(); await mongoose.connect(db.getUri()) }, 60000)
afterAll(async () => { await mongoose.disconnect(); await db?.stop() })
beforeEach(async () => {
  await CustomerModel.deleteMany({}); await AppointmentModel.deleteMany({})
  authenticate.mockResolvedValue({ accountId: String(ownerId), roles: ['owner'] })
  customer = await CustomerModel.create({ accountId: customerAccountId, displayName: 'Khách thanh toán' })
  appointment = { _id: new mongoose.Types.ObjectId(), customerId: customer._id, status: 'completed', revision: 0, totalPriceVnd: 250000, referenceCode: 'SOL-23456789', localDate: '2026-11-03', items: [{ serviceId: 'cut', name: 'Cắt tóc', priceVnd: 250000 }] }
  await AppointmentModel.collection.insertOne(appointment)
})
describe('Manual QR collection', () => {
  it('serves the provided QR and defaults legacy appointments to unpaid', async () => {
    await request(app).get('/admin-assets/qr/qr-code.jpg').expect(200).expect('Content-Type', /image\/jpeg/)
    const response = await auth(request(app).get(path())).expect(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body.data).toMatchObject({ status: 'unpaid', amountVnd: 250000, qrPath: '/admin-assets/qr/qr-code.jpg', transferContent: 'SOL-23456789' })
  })
  it('limits customer reads to their own bookings and forbids customer/stylist confirmation', async () => {
    authenticate.mockResolvedValue({ accountId: String(customerAccountId), roles: ['customer'] })
    await auth(request(app).get(path())).expect(200)
    await confirm().expect(403)
    authenticate.mockResolvedValue({ accountId: String(new mongoose.Types.ObjectId()), roles: ['customer'] })
    await auth(request(app).get(path())).expect(404)
    authenticate.mockResolvedValue({ accountId: String(new mongoose.Types.ObjectId()), roles: ['stylist'] })
    await confirm().expect(403)
    authenticate.mockRejectedValue(new AuthError('Cần đăng nhập', { status: 401 }))
    await request(app).get(path()).expect(401)
  })
  it('rejects unconfirmed service, stale versions, missing attestation and caller amounts', async () => {
    await confirm(undefined, { expectedRevision: 1, receivedConfirmed: true }).expect(409)
    await confirm(undefined, { expectedRevision: 0, receivedConfirmed: false }).expect(400)
    await confirm(undefined, { expectedRevision: 0, receivedConfirmed: true, amountVnd: 1 }).expect(400)
    await AppointmentModel.collection.updateOne({ _id: appointment._id }, { $set: { status: 'in_progress' } })
    await confirm().expect(409)
    expect((await AppointmentModel.findById(appointment._id).lean()).payment).toBeUndefined()
  })
  it('records one immutable receipt under concurrent retries and redacts internal audit from customer', async () => {
    const responses = await Promise.all([confirm(), confirm()])
    expect(responses.map(result => result.status)).toEqual([200, 200])
    expect(responses[0].body.data.receivedAt).toBe(responses[1].body.data.receivedAt)
    const row = await AppointmentModel.findById(appointment._id).lean()
    expect(row.payment.amountVnd).toBe(250000)
    expect(String(row.payment.receivedByAccountId)).toBe(String(ownerId))
    expect(row.revision).toBe(0)
    await confirm('different-request-key-0002').expect(409)
    authenticate.mockResolvedValue({ accountId: String(customerAccountId), roles: ['customer'] })
    const customerResult = await auth(request(app).get(path())).expect(200)
    expect(customerResult.body.data.status).toBe('paid')
    expect(customerResult.body.data.qrPath).toBeNull()
    expect(customerResult.body.data).not.toHaveProperty('receivedByAccountId')
    expect(customerResult.body.data).not.toHaveProperty('commandKey')
  })
  it('allows only one winner with different concurrent collection commands', async () => {
    const responses = await Promise.all([confirm('first-request-key-0001'), confirm('second-request-key-0002')])
    expect(responses.map(result => result.status).sort()).toEqual([200, 409])
  })
  it('separates receipt dates and outstanding service dates, preserving cash after service correction', async () => {
    await confirm().expect(200)
    await AppointmentModel.collection.updateOne({ _id: appointment._id }, { $set: { 'payment.receivedLocalDate': '2026-11-04', status: 'in_progress' } })
    await AppointmentModel.collection.insertOne({ ...appointment, _id: new mongoose.Types.ObjectId(), totalPriceVnd: 100000 })
    const serviceDay = await getRevenueReport({ from: '2026-11-03', to: '2026-11-03', group: 'day' })
    expect(serviceDay).toMatchObject({ revenueVnd: 100000, unpaidVnd: 100000, paidVnd: 0 })
    const receivedDay = await getRevenueReport({ from: '2026-11-04', to: '2026-11-04', group: 'day' })
    expect(receivedDay).toMatchObject({ revenueVnd: 0, unpaidVnd: 0, paidVnd: 250000, paidCount: 1 })
    expect(receivedDay.cashPeriods[0].paidVnd).toBe(250000)
  })
})
