vi.mock('../../config/database.js', () => ({ getDatabaseStatus: () => 'connected' }))
vi.mock('../../modules/auth/auth.service.js', async (original) => ({ ...await original(), authenticate: vi.fn() }))
import { authenticate } from '../../modules/auth/auth.service.js'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../../app.js'

describe('GET /admin/nhan-su', () => {
  beforeEach(() => { authenticate.mockResolvedValue({ roles: ['owner'] }) })
  it('redirects anonymous visitors to the shared login instead of showing a second login form', async () => {
    const response = await request(app).get('/admin/nhan-su').expect(303)
    expect(response.headers.location).toBe('http://localhost:5173/login')
    expect(response.text).not.toContain('login-form')
  })
  it('render giao diện quản trị bằng EJS', async () => {
    const response = await request(app).get('/admin/nhan-su').set('Cookie', 'sol_admin_token=fixture').expect(200)

    expect(response.headers['content-type']).toContain('text/html')
    expect(response.text).toContain('Nhân sự &amp; ca làm')
    expect(response.text).toContain('/admin/assets/staff-admin.js')
    expect(response.text).toContain('href="/admin/dashboard"')
    expect(response.text).toContain('href="/admin/services"')
    expect(response.text).toContain('href="/admin/nhan-su"')
    expect(response.text).toContain('href="/admin/nhan-su" aria-current="page"')
  })

  it('giữ đường dẫn quản trị cũ khi chuyển sang EJS', async () => {
    const response = await request(app).get('/quan-ly/nhan-su').set('Cookie', 'sol_admin_token=fixture').expect(200)

    expect(response.headers['content-type']).toContain('text/html')
    expect(response.text).toContain('Nhân sự &amp; ca làm')
  })
})
