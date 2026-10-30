import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../../app.js'

describe('GET /admin/nhan-su', () => {
  it('render giao diện quản trị bằng EJS', async () => {
    const response = await request(app).get('/admin/nhan-su').expect(200)

    expect(response.headers['content-type']).toContain('text/html')
    expect(response.text).toContain('Nhân sự &amp; ca làm')
    expect(response.text).toContain('/admin/assets/staff-admin.js')
  })

  it('giữ đường dẫn quản trị cũ khi chuyển sang EJS', async () => {
    const response = await request(app).get('/quan-ly/nhan-su').expect(200)

    expect(response.headers['content-type']).toContain('text/html')
    expect(response.text).toContain('Nhân sự &amp; ca làm')
  })
})
