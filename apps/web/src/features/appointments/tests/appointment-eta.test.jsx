import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateAppointmentEta, appointmentEtaPayload, mergeAppointmentEta } from '../api/appointment-eta.api.js'
import { appointmentStaffDto, readOwnerAppointment } from '../api/owner-appointments.api.js'
import { createOwnerAppointmentCommand } from '../hooks/useOwnerAppointmentCommand.js'
import { isOwnerAccount, useOwnerAppointmentRead } from '../hooks/useOwnerAppointments.js'
import { isStylistAccount, useStylistAppointments } from '../hooks/useStylistAppointments.js'
import { readStylistAppointment } from '../api/stylist-appointments.api.js'
import { AppointmentEtaDialog, AppointmentEtaSummary } from '../components/AppointmentEta.jsx'
import OwnerAppointmentManagement from '../components/OwnerAppointmentManagement.jsx'
import { AuthContext } from '../../auth/context/auth-context.js'
import LegacyAppointmentsFixture from './legacy-owner-page.fixture.jsx'

vi.mock('../hooks/useOwnerAppointments.js', async original => ({ ...await original(), useOwnerAppointmentRead: vi.fn() }))
vi.mock('../hooks/useStylistAppointments.js', async original => ({ ...await original(), useStylistAppointments: vi.fn() }))

const id = 'aaaaaaaaaaaaaaaaaaaaaaaa', staffId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const other = 'cccccccccccccccccccccccc'
const planned = '2026-10-23T03:30:00.000Z', eta = '2026-10-23T04:00:00.000Z'
const now = Date.parse('2026-10-23T03:00:00.000Z')
const owner = { accountId: other, roles: ['owner'], status: 'active' }
const stylist = { accountId: other, roles: ['stylist'], status: 'active' }
const item = {
  id, staffId, revision: 3, status: 'in_progress', startedAt: '2026-10-23T02:55:00.000Z',
  startAt: '2026-10-23T03:00:00.000Z', endAt: planned,
  customerSnapshot: { displayName: 'Khách ETA', phone: '+84901234567' }, staffNameSnapshot: 'Stylist An',
  items: [{ serviceId: 'cut', name: 'Cắt tóc snapshot', priceVnd: 150000, durationMinutes: 30 }],
  totalPriceVnd: 150000, totalDurationMinutes: 30,
}
const impact = { id: other, staffId, status: 'confirmed', startAt: '2026-10-23T04:00:00.000Z',
  endAt: '2026-10-23T04:30:00.000Z', reasons: ['staff_overlap'] }
const body = { expectedRevision: 3, estimatedEndAt: eta }
const result = (actor = 'owner', extra = {}) => ({ ...item, ...(actor === 'owner' ? { customerId: 'customer' } : {}),
  revision: 4, estimatedEndAt: eta, occupiedUntil: '2026-10-23T04:10:00.000Z',
  affectedAppointments: [impact], ownerReviewRequired: true, ...extra })
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => status < 400 ? { data } : data })
function respond(data, status = 200) {
  const fetch = vi.fn(async () => response(data, status))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
const send = (actor = 'owner', payload = body) => updateAppointmentEta('https://api.example.test', 'token', id, payload, 'eta-key-1234567890', undefined, actor)
function manager(actor = 'owner', profile = actor === 'owner' ? owner : stylist) {
  return createOwnerAppointmentCommand({
    readProfile: async () => profile, authorize: actor === 'owner' ? isOwnerAccount : isStylistAccount,
    verify: actor === 'stylist' ? (_profile, signal) => readStylistAppointment('https://api.example.test', 'token', id, signal) : undefined,
    send: (payload, key, signal) => updateAppointmentEta('https://api.example.test', 'token', id, payload, key, signal, actor),
  }, () => 'same-eta-key-1234567890')
}
const callbacks = { retry: vi.fn(), loadMore: vi.fn() }
beforeEach(() => {
  vi.mocked(useOwnerAppointmentRead).mockImplementation((_token, kind) => kind === 'detail'
    ? { kind: 'success', value: { ...item, customerId: 'customer' }, ...callbacks }
    : { kind: 'success', value: [], items: [], ...callbacks })
  vi.mocked(useStylistAppointments).mockReturnValue({ kind: 'success', value: item, ...callbacks })
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
function route(actor, status = 'in_progress') {
  const account = actor === 'owner' ? owner : stylist
  vi.mocked(useOwnerAppointmentRead).mockReturnValue({ kind: 'success', value: { ...item, status, customerId: 'customer' }, ...callbacks })
  vi.mocked(useStylistAppointments).mockReturnValue({ kind: 'success', value: { ...item, status }, ...callbacks })
  return renderToStaticMarkup(<MemoryRouter initialEntries={[(actor === 'owner' ? '/quan-ly/lich-hen/' : '/nhan-vien/lich-hen/') + id]}>
    <AuthContext.Provider value={{ account, token: 'token', isAuthenticated: true, openLoginModal() {}, logout() {} }}><LegacyAppointmentsFixture /></AuthContext.Provider>
  </MemoryRouter>)
}

describe('ETA input and unchanged booking', () => {
  it('converts salon local time independently of device timezone, keeping payload minimal', () => {
    const before = structuredClone(item)
    expect(appointmentEtaPayload(item, '2026-10-23T11:00', true, now)).toEqual(body)
    expect(item).toEqual(before)
    expect(item.endAt).toBe(planned)
  })
  it.each(['confirmed', 'completed', 'cancelled', 'no_show'])('rejects %s state', status => {
    expect(() => appointmentEtaPayload({ ...item, status }, '2026-10-23T11:00', true, now)).toThrow()
  })
  it.each(['', '2026-02-30T11:00', '2026-10-23T10:30', '2026-10-23T10:00', 'bad'])('rejects invalid, past or planned-end ETA %s', value => {
    expect(() => appointmentEtaPayload(item, value, true, now)).toThrow()
  })
  it('rejects ETA equal to current time even when after planned end', () => {
    expect(() => appointmentEtaPayload(item, '2026-10-23T11:00', true, Date.parse(eta))).toThrow()
  })
  it.each([-1, Number.MAX_SAFE_INTEGER, 1.5, undefined])('requires safe revision %s', revision => {
    expect(() => appointmentEtaPayload({ ...item, revision }, '2026-10-23T11:00', true, now)).toThrow()
  })
  it('requires explicit confirmation but accepts an earlier revised estimate and no booking grid', () => {
    expect(() => appointmentEtaPayload(item, '2026-10-23T11:00', false, now)).toThrow()
    expect(appointmentEtaPayload({ ...item, estimatedEndAt: '2026-10-23T05:00:00.000Z' }, '2026-10-23T10:47', true, now).estimatedEndAt).toBe('2026-10-23T03:47:00.000Z')
  })
})

describe('ETA API contract and scoped warnings', () => {
  it.each(['owner', 'stylist'])('%s posts the existing ETA endpoint, revision and key without planned-time edits', async actor => {
    const fetch = respond(result(actor))
    const value = await send(actor)
    expect(value).toMatchObject({ estimatedEndAt: eta, endAt: planned, revision: 4, affectedAppointments: [impact] })
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/appointments/' + id + '/eta')
    expect(JSON.parse(request.body)).toEqual(body)
    expect(request.headers.get('Authorization')).toBe('Bearer token')
    expect(request.headers.get('Idempotency-Key')).toBe('eta-key-1234567890')
    expect(value.items).toEqual(item.items)
    expect(value.staffId).toBe(staffId)
  })
  it('does not disclose extra contact/internal fields in warnings or command DTO', async () => {
    respond(result('stylist', { email: 'hidden', lastCommand: 'hidden', affectedAppointments: [{ ...impact, email: 'hidden', customerSnapshot: { phone: 'hidden' } }] }))
    expect(JSON.stringify(await send('stylist'))).not.toContain('hidden')
  })
  it('allows Owner cross-staff customer conflict and Stylist hidden-conflict flag with no invented rows', async () => {
    respond(result('owner', { affectedAppointments: [{ ...impact, staffId: other, reasons: ['customer_overlap'] }] }))
    expect((await send()).affectedAppointments[0].staffId).toBe(other)
    respond(result('stylist', { affectedAppointments: [] }))
    expect(await send('stylist')).toMatchObject({ affectedAppointments: [], ownerReviewRequired: true })
  })
  it('rejects leaked cross-staff warning for Stylist', async () => {
    respond(result('stylist', { affectedAppointments: [{ ...impact, staffId: other }] }))
    await expect(send('stylist')).rejects.toThrow()
  })
  it.each([
    { affectedAppointments: undefined }, { ownerReviewRequired: undefined }, { estimatedEndAt: planned },
    { occupiedUntil: eta }, { status: 'completed' }, { revision: 3 }, { affectedAppointments: [impact, impact] },
    { affectedAppointments: [{ ...impact, reasons: ['invented'] }] },
  ])('treats malformed success as unknown rather than fabricating impact: %j', async extra => {
    respond(result('owner', extra))
    const command = manager()
    await expect(command.run(body)).rejects.toMatchObject({ uncertain: true })
    expect(command.getPending().payload).toEqual(body)
  })
  it.each([400, 401, 403, 404, 409])('preserves HTTP %s business error', async status => {
    respond({ code: status === 400 ? 'INVALID_ETA' : 'APPOINTMENT_REVISION_CONFLICT' }, status)
    await expect(send()).rejects.toMatchObject({ status })
  })
  it('rejects extra fields or Customer actor before HTTP', async () => {
    const fetch = respond(result())
    await expect(send('owner', { ...body, startAt: item.startAt })).rejects.toThrow()
    await expect(send('customer')).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('ETA command concurrency and authorization', () => {
  it.each(['owner', 'stylist'])('%s succeeds, deduplicates double submit, and returns server warnings', async actor => {
    let finish
    const pending = new Promise(resolve => { finish = resolve })
    const fetch = vi.fn(async (_url, request) => request.method === 'POST' ? pending : response(item))
    vi.stubGlobal('fetch', fetch)
    const command = manager(actor)
    const first = command.run(body), duplicate = command.run(body)
    await vi.waitFor(() => expect(fetch.mock.calls.filter(([, request]) => request.method === 'POST')).toHaveLength(1))
    finish(response(result(actor)))
    expect(await first).toMatchObject({ revision: 4, estimatedEndAt: eta })
    expect(await duplicate).toMatchObject({ revision: 4 })
    expect(command.getPending()).toBeUndefined()
  })
  it('rechecks assigned Stylist scope and prevents POST for a different Stylist appointment', async () => {
    const fetch = respond({ code: 'APPOINTMENT_NOT_FOUND' }, 404)
    await expect(manager('stylist').run(body)).rejects.toMatchObject({ status: 404, uncertain: false })
    expect(fetch.mock.calls.every(([, request]) => request.method !== 'POST')).toBe(true)
  })
  it('rechecks active role before sending and blocks Customer', async () => {
    const fetch = respond(result())
    await expect(manager('owner', { ...owner, roles: ['customer'] }).run(body)).rejects.toMatchObject({ status: 403 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each(['APPOINTMENT_REVISION_CONFLICT', 'APPOINTMENT_STATE_CONFLICT'])('clears intent for %s, requiring fresh data', async code => {
    respond({ code }, 409)
    const command = manager()
    await expect(command.run(body)).rejects.toMatchObject({ status: 409, uncertain: false })
    expect(command.getPending()).toBeUndefined()
  })
  it('retries the exact ETA/revision/key after an uncertain network failure', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(response(result()))
    vi.stubGlobal('fetch', fetch)
    const command = manager()
    await expect(command.run(body)).rejects.toMatchObject({ uncertain: true })
    await expect(command.run({ ...body, estimatedEndAt: '2026-10-23T05:00:00.000Z' })).rejects.toThrow()
    await command.run(body)
    expect(fetch.mock.calls).toHaveLength(2)
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body)
    expect(fetch.mock.calls[0][1].headers.get('Idempotency-Key')).toBe(fetch.mock.calls[1][1].headers.get('Idempotency-Key'))
  })
})

describe('ETA UI, refresh boundaries and existing workflow', () => {
  it.each(['owner', 'stylist'])('%s exposes ETA on in-progress detail without changing original end', actor => {
    const html = route(actor)
    expect(html).toContain('Cập nhật giờ dự kiến xong')
    expect(html).toContain('10:30')
    expect(html).toContain('Chưa có ETA được ghi nhận')
    expect(html).not.toContain('>Bắt đầu phục vụ</button>')
    if (actor === 'stylist') expect(html).toContain('Hoàn tất phục vụ')
  })
  it.each(['confirmed', 'completed', 'cancelled', 'no_show'])('does not offer ETA for %s', status => {
    for (const actor of ['owner', 'stylist']) expect(route(actor, status)).not.toContain('Cập nhật giờ dự kiến xong')
  })
  it('keeps Owner salon Start/Complete restriction while exposing managerial ETA', () => {
    const html = renderToStaticMarkup(<OwnerAppointmentManagement token="token" appointment={{ ...item, customerId: 'customer' }} onChanged={() => {}} />)
    expect(html).toContain('Cập nhật giờ dự kiến xong')
    expect(html).not.toContain('>Hoàn tất phục vụ</button>')
  })
  it('renders only official warnings, including hidden conflicts, without fake notifications', () => {
    let html = renderToStaticMarkup(<AppointmentEtaSummary appointment={result()} />)
    for (const text of ['11:00', other, 'Trùng khoảng giữ stylist', '10 phút', 'không lịch nào được tự động']) expect(html).toContain(text)
    html = renderToStaticMarkup(<AppointmentEtaSummary appointment={result('stylist', { affectedAppointments: [] })} />)
    expect(html).toContain('ngoài quyền xem')
    expect(html).not.toContain(other)
    html = renderToStaticMarkup(<AppointmentEtaSummary appointment={result('owner', { affectedAppointments: [], ownerReviewRequired: false })} />)
    expect(html).toContain('Không có lịch bị ảnh hưởng')
  })
  it('keeps POST ETA only for the same freshly read revision and never after permission/state changes', () => {
    const saved = result()
    const fresh = { kind: 'success', value: { ...item, revision: 4 } }
    expect(mergeAppointmentEta(fresh, saved).value.estimatedEndAt).toBe(eta)
    for (const state of [{ kind: 'denied' }, { kind: 'loading' }, { kind: 'success', value: { ...item, revision: 5 } },
      { kind: 'success', value: { ...item, revision: 4, status: 'completed' } }, { kind: 'success', value: { ...item, id: other } }]) {
      expect(mergeAppointmentEta(state, saved)).toBe(state)
    }
    expect(mergeAppointmentEta(fresh, null)).toBe(fresh)
    expect(mergeAppointmentEta({ kind: 'success', value: item }, saved).value).toEqual(saved)
    expect(appointmentStaffDto(result()).estimatedEndAt).toBe(eta)
  })
  it('disables save until confirmation; freezes fields on unknown result and requires reload on revision conflict', () => {
    const fields = { localTime: '2026-10-23T11:00', confirmed: false }
    const render = command => renderToStaticMarkup(<AppointmentEtaDialog appointment={item} fields={fields} onFields={() => {}}
      command={command} onConfirm={() => {}} onClose={() => {}} onReload={() => {}} />)
    expect(render({ kind: 'idle' })).toMatch(/<button[^>]*disabled=""[^>]*>Xác nhận lưu ETA<\/button>/)
    expect(render({ kind: 'error', error: { status: 409 } })).toContain('Tải lại lịch')
    expect(render({ kind: 'error', error: { code: 'INVALID_ETA', status: 400 } })).toContain('Theo giờ server')
    const html = render({ kind: 'error', pending: { payload: body }, locked: true, error: new Error('offline') })
    expect(html).toContain('Thử lại cùng yêu cầu')
    expect(html).toContain('<fieldset disabled=""')
    expect(html).not.toContain('Tải lại lịch</button>')
  })
})

describe('fresh ETA warnings after full detail reload', () => {
  it.each(['owner', 'stylist'])('%s GET detail retains ETA and role-scoped warnings without POST', async actor => {
    const fetch = respond(result(actor))
    const read = actor === 'owner' ? readOwnerAppointment : readStylistAppointment
    for (let reload = 0; reload < 2; reload++) {
      const value = await read('https://api.example.test', 'token', id)
      expect(value).toMatchObject({ estimatedEndAt: eta, affectedAppointments: [impact], ownerReviewRequired: true })
      const html = renderToStaticMarkup(<AppointmentEtaSummary appointment={value} />)
      expect(html).toContain(other)
      expect(html).toContain('11:00')
      expect(html).not.toContain('GET chi tiết')
    }
    expect(fetch.mock.calls.every(([, request]) => request.method !== 'POST')).toBe(true)
  })
  it('prefers newly computed empty GET warnings to an older POST at the same revision', () => {
    const saved = result()
    const fresh = { kind: 'success', value: appointmentStaffDto(result('owner', { affectedAppointments: [], ownerReviewRequired: false })) }
    const merged = mergeAppointmentEta(fresh, saved)
    expect(merged).toBe(fresh)
    expect(merged.value.affectedAppointments).toEqual([])
    const html = renderToStaticMarkup(<AppointmentEtaSummary appointment={merged.value} />)
    expect(html).toContain('Không có lịch bị ảnh hưởng')
    expect(html).not.toContain(other)
  })
  it('refreshes changed warning rows without requiring an appointment revision change', () => {
    const newer = { ...impact, id: 'dddddddddddddddddddddddd' }
    const fresh = { kind: 'success', value: appointmentStaffDto(result('owner', { affectedAppointments: [newer] })) }
    expect(mergeAppointmentEta(fresh, result()).value.affectedAppointments).toEqual([newer])
  })
  it('keeps hidden conflicts private after Stylist reload', async () => {
    respond(result('stylist', { affectedAppointments: [], email: 'secret', ownerReviewRequired: true }))
    const value = await readStylistAppointment('https://api.example.test', 'token', id)
    expect(value).toMatchObject({ affectedAppointments: [], ownerReviewRequired: true })
    expect(JSON.stringify(value)).not.toContain('secret')
    expect(renderToStaticMarkup(<AppointmentEtaSummary appointment={value} />)).toContain('ngoài quyền xem')
  })
  it.each([
    { affectedAppointments: undefined }, { ownerReviewRequired: undefined },
    { affectedAppointments: [{ ...impact, reasons: ['invented'] }] },
    { affectedAppointments: [impact], ownerReviewRequired: false },
  ])('does not interpret malformed GET warnings as a safe empty list: %j', async extra => {
    respond(result('owner', extra))
    await expect(readOwnerAppointment('https://api.example.test', 'token', id)).rejects.toThrow()
  })
  it('rejects cross-staff information in Stylist GET warnings', async () => {
    respond(result('stylist', { affectedAppointments: [{ ...impact, staffId: other }] }))
    await expect(readStylistAppointment('https://api.example.test', 'token', id)).rejects.toThrow()
  })
})
