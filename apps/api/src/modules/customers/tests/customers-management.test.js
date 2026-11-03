import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
vi.mock('../../../config/cloudinary.js', () => ({ uploadImagePayload: vi.fn() }))
vi.mock('../../../config/database.js', () => ({ getDatabaseStatus: () => 'connected' }))
vi.mock('../../auth/auth.service.js', async original => ({ ...await original(), authenticate: vi.fn() }))
import { authenticate, AuthError } from '../../auth/auth.service.js'
import { app } from '../../../app.js'
import { CustomerModel } from '../customers.model.js'
import { AppointmentModel } from '../../appointments/appointments.model.js'
import { uploadImagePayload } from '../../../config/cloudinary.js'
import { customerInput, listFilters } from '../customers.service.js'
let db
const owner = req => req.set('Authorization', 'Bearer a.b.c')
beforeAll(async () => { db = await MongoMemoryServer.create(); await mongoose.connect(db.getUri()) }, 60000)
afterAll(async () => { await mongoose.disconnect(); await db?.stop() })
beforeEach(async () => { await CustomerModel.deleteMany({}); await AppointmentModel.deleteMany({}); authenticate.mockResolvedValue({ roles: ['owner'] }) })
describe('Customer management contract', () => {
  it('validates filters and normalizes Vietnamese phone numbers', () => {
    expect(customerInput({ displayName: ' Khách ', phone: '090 123 4567' })).toEqual({ displayName: 'Khách', phone: '+84901234567' })
    for (const body of [{ displayName: '' }, { displayName: 'A', accountId: 'injected' }, { displayName: 'A', phone: 'bad' }]) expect(() => customerInput(body)).toThrow()
    for (const query of [{ q: {} }, { page: '0' }, { type: 'unknown' }]) expect(() => listFilters(query)).toThrow()
  })
  it('rejects unauthenticated and customer access before reading private data', async () => {
    authenticate.mockRejectedValue(new AuthError('Cần đăng nhập', { status: 401 }))
    await request(app).get('/api/customer-management').expect(401)
    authenticate.mockResolvedValue({ roles: ['customer'] })
    await owner(request(app).get('/api/customer-management')).expect(403)
    await owner(request(app).post('/api/customer-management')).send({ displayName: 'A' }).expect(403)
    await owner(request(app).patch('/api/customer-management/123456789012345678901234')).send({ displayName: 'A' }).expect(403)
  })
  it('creates distinct guests, edits only allowed profile fields, and handles bad IDs', async () => {
    const { body } = await owner(request(app).post('/api/customer-management')).send({ displayName: 'Khách', phone: '0901234567' }).expect(201)
    await owner(request(app).post('/api/customer-management')).send({ displayName: 'Khách khác', phone: '0901234567' }).expect(201)
    await owner(request(app).patch('/api/customer-management/' + body.data.id)).send({ displayName: 'Tên mới', phone: '' }).expect(200)
    const row = await CustomerModel.findById(body.data.id).lean()
    expect(row.displayName).toBe('Tên mới'); expect(row.phone).toBeUndefined()
    await owner(request(app).get('/api/customer-management/bad')).expect(400)
    await owner(request(app).get('/api/customer-management/123456789012345678901234')).expect(404)
  })
  it('paginates and filters literally, calculates completed history only, excludes internal fields', async () => {
    const customer = await CustomerModel.create({ displayName: 'Khách [A]' })
    await CustomerModel.insertMany(Array.from({ length: 7 }, (_, i) => ({ displayName: 'Guest ' + i })))
    await AppointmentModel.collection.insertMany(['completed', 'completed', 'cancelled'].map((status, i) => ({ customerId: customer._id, status, totalPriceVnd: 100000, completedAt: new Date(2026, 10, i + 1), startAt: new Date(2026, 10, i + 1), items: [{ name: 'Cắt tóc' }] })))
    const list = await owner(request(app).get('/api/customer-management')).expect(200)
    expect(list.body.data.items).toHaveLength(6); expect(list.body.data.total).toBe(8)
    const filtered = await owner(request(app).get('/api/customer-management').query({ q: '[A]' })).expect(200)
    expect(filtered.body.data.items[0]).toMatchObject({ visits: 2, totalSpentVnd: 200000 })
    const detail = await owner(request(app).get('/api/customer-management/' + customer.id)).expect(200)
    expect(detail.body.data.history).toHaveLength(2)
    expect(detail.body.data).not.toHaveProperty('accountId')
    expect(detail.body.data).not.toHaveProperty('bookingRevision')
  })
  it('renders the protected page and active sidebar', async () => {
    const res = await owner(request(app).get('/admin/khach-hang')).expect(200)
    expect(res.text).toContain('Quản lý khách hàng')
    expect(res.text).toContain('href="/admin/khach-hang" aria-current="page"')
    expect(res.headers['cache-control']).toBe('no-store')
  })
  it('uploads validated avatar bytes and exposes only the URL in list/detail', async () => {
    const customer = await CustomerModel.create({ displayName: 'Avatar test' })
    const image = 'data:image/png;base64,' + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64')
    const url = 'https://res.cloudinary.com/test/image/upload/avatar.png'
    uploadImagePayload.mockResolvedValue({ url, publicId: 'customer-avatars/test' })
    const endpoint = '/api/customer-management/' + customer.id + '/avatar'
    await owner(request(app).put(endpoint)).send({ image: 'https://example.com/a.png' }).expect(400)
    await owner(request(app).put(endpoint)).send({ image: 'data:image/png;base64,SGVsbG8=' }).expect(400)
    expect(uploadImagePayload).not.toHaveBeenCalled()
    await owner(request(app).put(endpoint)).send({ image }).expect(200)
    expect(uploadImagePayload).toHaveBeenCalledWith(image, { folder: 'sol-hair-studio/customer-avatars' })
    const detail = await owner(request(app).get('/api/customer-management/' + customer.id)).expect(200)
    expect(detail.body.data.avatarUrl).toBe(url)
    expect(detail.body.data).not.toHaveProperty('avatar')
    const list = await owner(request(app).get('/api/customer-management')).expect(200)
    expect(list.body.data.items[0].avatarUrl).toBe(url)
    uploadImagePayload.mockRejectedValueOnce(new Error('private provider failure'))
    const failure = await owner(request(app).put(endpoint)).send({ image }).expect(502)
    expect(failure.text).not.toContain('private provider failure')
    expect((await CustomerModel.findById(customer.id)).avatar.url).toBe(url)
    authenticate.mockResolvedValue({ roles: ['customer'] })
    await owner(request(app).put(endpoint)).send({ image }).expect(403)
  })

})
