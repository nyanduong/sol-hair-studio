import { Router } from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app.js'
import { errorHandler } from '../error-handler.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('phản hồi lỗi JSON thống nhất', () => {
  it('trả 404 có mã lỗi khi route không tồn tại', async () => {
    const response = await request(createApp())
      .get('/api/khong-ton-tai')
      .expect(404)

    expect(response.body).toEqual({
      status: 'error',
      code: 'NOT_FOUND',
      message: 'Không tìm thấy đường dẫn.',
    })
  })

  it('trả 400 khi request chứa JSON không hợp lệ', async () => {
    const response = await request(createApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"status":')
      .expect(400)

    expect(response.body).toEqual({
      status: 'error',
      code: 'INVALID_JSON',
      message: 'Dữ liệu JSON không hợp lệ.',
    })
  })

  it('trả 500 an toàn cho lỗi ngoài dự kiến', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const routes = Router()
    routes.get('/api/test-only/error', () => {
      throw new Error('chi-tiet-noi-bo-khong-duoc-lo')
    })

    const response = await request(createApp({ routes }))
      .get('/api/test-only/error')
      .expect(500)

    expect(response.body).toEqual({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Máy chủ gặp lỗi. Vui lòng thử lại sau.',
    })
    expect(JSON.stringify(response.body)).not.toContain(
      'chi-tiet-noi-bo-khong-duoc-lo',
    )
    expect(consoleError).toHaveBeenCalledWith(
      'Lỗi nội bộ khi xử lý yêu cầu.',
      expect.objectContaining({
        method: 'GET',
        path: '/api/test-only/error',
        name: 'Error',
      }),
    )
  })

  it('chuyển tiếp lỗi nếu headers đã được gửi', () => {
    const error = new Error('late failure')
    const response = { headersSent: true }
    const next = vi.fn()

    errorHandler(error, { method: 'GET', path: '/' }, response, next)

    expect(next).toHaveBeenCalledWith(error)
  })
})

describe('HTTP request logging', () => {
  it('logs method, path, status and timing without query/body/credentials', async () => {
    const lines = []
    const routes = Router()
    const nested = Router()
    nested.post('/test-only/log', (_req, res) => res.status(201).json({ status: 'ok' }))
    routes.use('/api', nested)
    await request(createApp({ routes, logStream: { write: line => lines.push(line) } }))
      .post('/api/test-only/log?email=private@example.test&token=secret-query')
      .set('Authorization', 'Bearer secret-header')
      .send({ password: 'secret-password', code: '123456' })
      .expect(201)
    expect(lines.join('')).toMatch(/POST \/api\/test-only\/log 201 [\d.]+ ms/)
    for (const secret of ['private@example.test', 'secret-query', 'secret-header', 'secret-password', '123456']) {
      expect(lines.join('')).not.toContain(secret)
    }
  })
  it('logs malformed JSON rejected before the route', async () => {
    const lines = []
    await request(createApp({ logStream: { write: line => lines.push(line) } }))
      .post('/api/health').set('Content-Type', 'application/json').send('{"status":').expect(400)
    expect(lines.join('')).toMatch(/POST \/api\/health 400/)
  })
})

it('keeps CORS preflight working without logging OPTIONS', async () => {
  const lines = []
  const app = createApp({ logStream: { write: line => lines.push(line) } })
  await request(app).options('/api/health')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'GET')
    .set('Access-Control-Request-Headers', 'authorization')
    .expect(204)
    .expect('Access-Control-Allow-Origin', 'http://localhost:5173')
  expect(lines).toEqual([])
  await request(app).get('/api/health').expect(200)
  expect(lines.join('')).toMatch(/GET \/api\/health 200/)
})
