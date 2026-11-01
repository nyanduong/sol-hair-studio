import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config/database.js', () => ({ getDatabaseStatus: vi.fn() }))
vi.mock('../../auth/auth.service.js', async (importOriginal) => ({
  ...await importOriginal(),
  authenticate: vi.fn(),
  login: vi.fn(),
}))
vi.mock('../../appointments/appointments.service.js', async (importOriginal) => ({
  ...await importOriginal(),
  listAppointments: vi.fn(),
  startAppointment: vi.fn(),
  getAppointmentDetail: vi.fn(),
  getAppointmentRescheduleOptions: vi.fn(),
  getAppointmentAudit: vi.fn(),
  rescheduleAppointment: vi.fn(),
}))
vi.mock('../../staff/staff.service.js', async (importOriginal) => ({
  ...await importOriginal(),
  listStaff: vi.fn(),
}))

import { app } from '../../../app.js'
import { getDatabaseStatus } from '../../../config/database.js'
import { authenticate, AuthError, login } from '../../auth/auth.service.js'
import {
  AppointmentError, listAppointments, startAppointment, getAppointmentDetail,
  getAppointmentRescheduleOptions, getAppointmentAudit, rescheduleAppointment,
} from '../../appointments/appointments.service.js'
import { listStaff } from '../../staff/staff.service.js'

const id = '000000000000000000000123'
const owner = { accountId: '000000000000000000000101', roles: ['owner'], authRevision: 0 }
const token = 'test.owner.token'
const staffId = '000000000000000000000202'
const personalStaff = { accountId: owner.accountId, staffId, displayName: 'Owner Stylist', isActive: true }
const appointment = {
  id, staffId, status: 'confirmed', revision: 0,
  customerSnapshot: { displayName: '<Customer>', phone: '+84900000000' },
  staffNameSnapshot: 'Owner Stylist',
  startAt: '2026-10-31T01:00:00.000Z', endAt: '2026-10-31T01:45:00.000Z',
  items: [{ serviceId: 'cut', name: 'Cut', priceVnd: 450000, durationMinutes: 45 }],
  totalPriceVnd: 450000, totalDurationMinutes: 45,
}
const routes = [
  ['get', '/appointments'],
  ['get', `/appointments/${id}`],
  ['get', `/appointments/${id}/reschedule`],
  ['get', `/appointments/${id}/audit`],
  ...['cancel', 'reschedule', 'no-show', 'start', 'complete', 'eta', 'correct-start', 'correct-complete']
    .map(operation => ['post', `/appointments/${id}/${operation}`]),
]

describe('Owner EJS uses the shared Admin session', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    getDatabaseStatus.mockReturnValue('connected')
    authenticate.mockImplementation(async value => {
      if (value !== token) throw new AuthError('Invalid session', { status: 401, code: 'UNAUTHORIZED' })
      return owner
    })
    listAppointments.mockResolvedValue({
      items: [], pagination: { limit: 50, hasNextPage: false, nextCursor: null },
    })
    listStaff.mockResolvedValue([])
    getAppointmentDetail.mockResolvedValue(appointment)
  })

  it.each(routes)('%s %s redirects an anonymous visitor to Login', async (method, path) => {
    const response = await request(app)[method]('/admin' + path).expect(302)
    expect(response.headers.location).toBe('/admin/login')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('uses the unchanged Admin header and footer on the appointment page', async () => {
    const response = await request(app).get('/admin/appointments')
      .set('Cookie', `sol_admin_token=${token}`).expect(200)
    expect(response.text).toContain('Trang Quản Trị Salon')
    expect(response.text).toContain('Cổng Quản trị dành cho Chủ tiệm')
    expect(response.text).toContain('href="/admin/dashboard"')
    expect(response.text).not.toContain('fonts.googleapis.com/css2?family=Cormorant')
    expect(response.text).not.toContain('/owner-assets/css/owner.css')
  })

  it.each(['get', 'post'])('redirects a legacy %s appointment URL without losing method or filters', async method => {
    const response = await request(app)[method]('/owner/appointments/' + id + '?view=mine&localDate=2026-10-31').expect(308)
    expect(response.headers.location).toBe('/admin/appointments/' + id + '?view=mine&localDate=2026-10-31')
    expect(listAppointments).not.toHaveBeenCalled()
    expect(startAppointment).not.toHaveBeenCalled()
  })

  it.each(routes)('%s %s rejects a non-Owner cookie', async (method, path) => {
    authenticate.mockResolvedValue({ ...owner, roles: ['customer'] })
    const response = await request(app)[method]('/admin' + path)
      .set('Cookie', `sol_admin_token=${token}`).expect(302)
    expect(response.headers.location).toBe('/admin/login?error=forbidden')
    expect(listAppointments).not.toHaveBeenCalled()
    expect(startAppointment).not.toHaveBeenCalled()
  })

  it('uses the cookie issued by the existing Admin Login to render appointments', async () => {
    login.mockResolvedValue({ token, account: owner })
    const browser = request.agent(app)
    await browser.post('/admin/login').type('form')
      .send({ email: 'owner@example.test', password: 'test-only-password' }).expect(302)
    const response = await browser.get('/admin/appointments?localDate=2026-10-31').expect(200)
    expect(response.headers['content-type']).toMatch(/text\/html/)
    expect(listAppointments).toHaveBeenCalledWith(owner, { localDate: '2026-10-31' })
    expect(authenticate).toHaveBeenCalledWith(token)
  })

  it('passes the cookie identity and form data to the existing start Service', async () => {
    startAppointment.mockResolvedValue({ startedAt: '2026-10-31T01:00:00.000Z' })
    await request(app).post(`/admin/appointments/${id}/start`)
      .set('Cookie', `sol_admin_token=${token}`).type('form')
      .send({ expectedRevision: '0', commandKey: 'test-start-command-key' }).expect(200)
    expect(startAppointment).toHaveBeenCalledWith(owner, id, { expectedRevision: 0 }, 'test-start-command-key')
  })

  it('clears an expired cookie and returns to the existing Login', async () => {
    const response = await request(app).get('/admin/appointments')
      .set('Cookie', 'sol_admin_token=expired').expect(302)
    expect(response.headers.location).toBe('/admin/login?error=session_expired')
    expect(response.headers['set-cookie'][0]).toContain('sol_admin_token=;')
    expect(listAppointments).not.toHaveBeenCalled()
  })

  it('keeps cookie-only requests unauthorized on the JSON API', async () => {
    const response = await request(app).get('/api/appointments?localDate=2026-10-31')
      .set('Cookie', `sol_admin_token=${token}`).expect(401)
    expect(response.body.code).toBe('UNAUTHORIZED')
    expect(listAppointments).not.toHaveBeenCalled()
  })

  it('preserves Bearer access for the JSON API', async () => {
    await request(app).get('/api/appointments?localDate=2026-10-31')
      .set('Authorization', `Bearer ${token}`).expect(200)
    expect(listAppointments).toHaveBeenCalledWith(owner, { localDate: '2026-10-31' })
  })

  it('renders the React-style card and escapes contact text', async () => {
    listAppointments.mockResolvedValue({ items: [appointment], pagination: { hasNextPage: false } })
    const response = await request(app).get('/admin/appointments?localDate=2026-10-31')
      .set('Cookie', `sol_admin_token=${token}`).expect(200)
    expect(response.text).toContain('Lịch của tôi')
    expect(response.text).toContain('Lịch toàn salon')
    expect(response.text).toContain('&lt;Customer&gt;')
    expect(response.text).toContain('bg-emerald-50')
    expect(response.text).toContain('lg:grid-cols-3')
  })

  it('filters personal appointments by the authenticated account, ignoring a supplied Staff', async () => {
    listStaff.mockResolvedValue([personalStaff])
    await request(app).get('/admin/appointments?view=mine&localDate=2026-10-31&staffId=other')
      .set('Cookie', `sol_admin_token=${token}`).expect(200)
    expect(listAppointments).toHaveBeenCalledWith(owner, { localDate: '2026-10-31', staffId })
  })

  it('does not fall back to salon appointments when Owner has no Staff profile', async () => {
    const response = await request(app).get('/admin/appointments?view=mine')
      .set('Cookie', `sol_admin_token=${token}`).expect(200)
    expect(listAppointments).not.toHaveBeenCalled()
    expect(response.text).toContain('chưa có hồ sơ stylist')
  })

  it('shows start only in the assigned personal workspace, preserving list filters', async () => {
    listStaff.mockResolvedValue([personalStaff])
    const salon = await request(app).get(`/admin/appointments/${id}`)
      .set('Cookie', `sol_admin_token=${token}`).expect(200)
    expect(salon.text).not.toContain(`/${id}/start`)
    const mine = await request(app).get(`/admin/appointments/${id}?view=mine&localDate=2026-10-31&status=confirmed`)
      .set('Cookie', `sol_admin_token=${token}`).expect(200)
    expect(mine.text).toContain(`/${id}/start?view=mine`)
    expect(mine.text).toContain('localDate=2026-10-31&amp;status=confirmed')
  })

  it('does not show another Staff appointment as a personal appointment', async () => {
    listStaff.mockResolvedValue([{ ...personalStaff, staffId: '000000000000000000000999' }])
    const response = await request(app).get(`/admin/appointments/${id}?view=mine`)
      .set('Cookie', `sol_admin_token=${token}`).expect(403)
    expect(response.text).not.toContain('&lt;Customer&gt;')
  })

  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('renders detail for %s', async status => {
    getAppointmentDetail.mockResolvedValue({
      ...appointment, status,
      ...(['in_progress', 'completed'].includes(status) ? { startedAt: appointment.startAt } : {}),
      ...(status === 'completed' ? { completedAt: appointment.endAt } : {}),
      ...(status === 'in_progress' ? {
        estimatedEndAt: '2026-10-31T02:00:00.000Z', ownerReviewRequired: true,
        affectedAppointments: [{ id: 'another-id', startAt: appointment.startAt, endAt: appointment.endAt, reasons: ['staff_overlap'] }],
      } : {}),
    })
    listStaff.mockResolvedValue([personalStaff])
    const response = await request(app).get(`/admin/appointments/${id}?view=mine`)
      .set('Cookie', `sol_admin_token=${token}`).expect(200)
    if (status === 'in_progress') {
      expect(response.text).toContain('Lịch bị ảnh hưởng')
      expect(response.text).toContain(`/${id}/complete?view=mine`)
    }
  })

  it('keeps workspace context out of Service query contracts for options and audit', async () => {
    getAppointmentRescheduleOptions.mockResolvedValue({ revision: 0, stylists: [] })
    getAppointmentAudit.mockResolvedValue({ items: [], pagination: { hasNextPage: false } })
    const context = '?view=mine&localDate=2026-10-31&status=confirmed'
    await request(app).get(`/admin/appointments/${id}/reschedule${context}`)
      .set('Cookie', `sol_admin_token=${token}`).expect(200)
    expect(getAppointmentRescheduleOptions).toHaveBeenCalledWith(owner, id, { localDate: '2026-10-31' })
    await request(app).get(`/admin/appointments/${id}/audit${context}`)
      .set('Cookie', `sol_admin_token=${token}`).expect(200)
    expect(getAppointmentAudit).toHaveBeenCalledWith(owner, id, {})
  })

  it('requires customer agreement in EJS but does not add it to the API payload', async () => {
    const body = { expectedRevision: '0', staffId, startAt: appointment.startAt, reason: 'Agreed with customer', commandKey: 'reschedule-ui-test-key' }
    await request(app).post(`/admin/appointments/${id}/reschedule`).type('form')
      .set('Cookie', `sol_admin_token=${token}`).send(body).expect(400)
    expect(rescheduleAppointment).not.toHaveBeenCalled()
    rescheduleAppointment.mockResolvedValue({ id })
    await request(app).post(`/admin/appointments/${id}/reschedule`).type('form')
      .set('Cookie', `sol_admin_token=${token}`).send({ ...body, customerAgreementConfirmed: 'true' }).expect(200)
    expect(rescheduleAppointment).toHaveBeenCalledWith(owner, id, {
      expectedRevision: 0, staffId, startAt: appointment.startAt, reason: body.reason,
    }, body.commandKey)
  })

  it('retains agreement and the same intent/key when a reschedule result is unknown', async () => {
    rescheduleAppointment.mockRejectedValue(new AppointmentError('Unknown', { status: 503 }))
    const response = await request(app).post(`/admin/appointments/${id}/reschedule?view=mine`).type('form')
      .set('Cookie', `sol_admin_token=${token}`).send({
        expectedRevision: '0', startAt: appointment.startAt, staffId, reason: 'Agreed',
        customerAgreementConfirmed: 'true', commandKey: 'reschedule-ui-test-key',
      }).expect(503)
    expect(response.text).toContain('name="customerAgreementConfirmed" value="true"')
    expect(response.text).toContain('reschedule-ui-test-key')
    expect(response.text).toContain(`/${id}/reschedule?view=mine`)
  })
})
