import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reschedulePayload, createAppointmentCommand } from '../hooks/useAppointmentCommand.js'
import { ownerReschedulePayload, createOwnerAppointmentCommand } from '../hooks/useOwnerAppointmentCommand.js'
import { sendAppointmentCommand, readRescheduleOptions } from '../api/appointments.api.js'
import { sendOwnerAppointmentCommand } from '../api/owner-appointments.api.js'
import { useRescheduleOptions } from '../hooks/useRescheduleOptions.js'
import { RescheduleForm } from '../components/CustomerAppointmentManagement.jsx'

import { createOwnerAppointmentReader } from '../hooks/useOwnerAppointments.js'
import { createCustomerAppointmentDetail } from '../hooks/useCustomerAppointmentDetail.js'
import { createCustomerAppointmentList } from '../hooks/useCustomerAppointments.js'

vi.mock('../hooks/useRescheduleOptions.js', () => ({ useRescheduleOptions: vi.fn() }))
const now = Date.parse('2026-10-23T03:00:00.000Z')
const owner = { roles: ['owner'], status: 'active' }
const customer = { roles: ['customer'], status: 'active' }
const item = {
  id: '1234567890abcdef12345678', revision: 3, staffId: 'aaaaaaaaaaaaaaaaaaaaaaaa', status: 'confirmed',
  startAt: new Date(now + 10_800_000).toISOString(), endAt: new Date(now + 12_600_000).toISOString(),
  staffNameSnapshot: 'Stylist An', totalDurationMinutes: 30, totalPriceVnd: 100000,
  items: [{ serviceId: 'cut', name: 'Giá cũ lúc đặt', durationMinutes: 30, priceVnd: 100000 }],
}
const ownerItem = { ...item, customerId: 'customer-a', customerSnapshot: { displayName: 'Khách A', phone: '+84901234567' } }
const otherId = 'bbbbbbbbbbbbbbbbbbbbbbbb'
function optionsFor(startAt, staffId = item.staffId, localDate = '2026-10-23') {
  return { appointmentId: item.id, revision: 3, localDate, generatedAt: new Date(now).toISOString(),
    stylists: [{ staffId, displayName: staffId === item.staffId ? 'Stylist An' : 'Stylist Bình',
      slots: [{ startAt, endAt: new Date(Date.parse(startAt) + 1_800_000).toISOString() }] }] }
}
const selectionAt = (startAt, staffId = item.staffId) => ({ startAt, staffId })
const later = new Date(now + 14_400_000).toISOString()
const baseOptions = optionsFor(later)
function body(role, selected = selectionAt(later), appointment = role === 'owner' ? ownerItem : item, options = optionsFor(selected.startAt, selected.staffId), reason = role === 'owner' ? 'Khách đã thống nhất lịch mới' : '') {
  return role === 'owner' ? ownerReschedulePayload(appointment, selected, options, reason, now, true)
    : reschedulePayload(appointment, selected, options, now)
}
function outcome(role, request) {
  return { ...(role === 'owner' ? ownerItem : item), ...request, revision: 4, status: 'confirmed' }
}
function send(role, request, key, signal) {
  return role === 'owner'
    ? sendOwnerAppointmentCommand('https://api.example.test', 'owner-token', item.id, 'reschedule', request, key, signal)
    : sendAppointmentCommand('https://api.example.test', 'customer-token', item.id, 'reschedule', request, key, signal)
}
function manager(role) {
  return role === 'owner' ? createOwnerAppointmentCommand({ readProfile: async () => owner,
    send: (request, key, signal) => send(role, request, key, signal) }, () => 'reschedule-intent-key')
    : createAppointmentCommand((request, key, signal) => send(role, request, key, signal), () => 'reschedule-intent-key')
}
function response(value, status = 200) {
  return { ok: status === 200, status, json: async () => status === 200 ? { data: value } : value }
}
const formProps = {
  token: 'fixture', appointment: item, locked: false, onSelect() {}, selection: null,
  command: { kind: 'idle' }, editable: true, onConfirm() {}, onClose() {}, onReload() {},
}
function renderForm(overrides = {}) { return renderToStaticMarkup(<RescheduleForm {...formProps} {...overrides} />) }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  vi.mocked(useRescheduleOptions).mockReturnValue({ kind: 'success', value: baseOptions, retry() {} })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('role-specific reschedule validation', () => {
  it.each(['customer', 'owner'])('%s can retain the old stylist or assign another without changing snapshots', role => {
    for (const staffId of [item.staffId, otherId]) {
      const selected = selectionAt(later, staffId)
      const result = body(role, selected)
      expect(result).toEqual({ expectedRevision: 3, startAt: later, staffId, ...(role === 'owner' ? { reason: 'Khách đã thống nhất lịch mới' } : {}) })
      expect(result).not.toHaveProperty('items')
      expect(result).not.toHaveProperty('totalPriceVnd')
      expect(item.items[0]).toMatchObject({ priceVnd: 100000, durationMinutes: 30 })
    }
  })
  it('allows Customer at exact old cutoff but refuses just below it', () => {
    const value = { ...item, startAt: new Date(now + 7_200_000).toISOString() }
    expect(() => body('customer', undefined, value)).not.toThrow()
    expect(() => reschedulePayload(value, selectionAt(later), baseOptions, now + 1)).toThrow()
  })
  it('allows Owner late changes with a reason and rejects missing/blank/oversized reasons', () => {
    const late = { ...ownerItem, startAt: new Date(now - 900_000).toISOString() }
    expect(body('owner', undefined, late, baseOptions, '  Khách đồng ý  ').reason).toBe('Khách đồng ý')
    for (const reason of ['', ' ', 'a'.repeat(501)]) expect(() => body('owner', undefined, late, baseOptions, reason)).toThrow()
    expect(body('owner', undefined, late, baseOptions, 'a'.repeat(500)).reason).toHaveLength(500)
  })
  it('requires Owner reason on Web at exactly two hours and one millisecond later', () => {
    const value = { ...ownerItem, startAt: new Date(now + 7_200_000).toISOString() }
    expect(() => body('owner', undefined, value, baseOptions, '')).toThrow('lý do')
    expect(() => ownerReschedulePayload(value, selectionAt(later), baseOptions, '', now + 1)).toThrow('lý do')
  })
  it('uses Owner server-now boundary instead of Customer 30-minute lead-time', () => {
    const selected = selectionAt(new Date(now).toISOString(), otherId)
    const options = optionsFor(selected.startAt, otherId)
    expect(body('owner', selected, ownerItem, options).startAt).toBe(new Date(now).toISOString())
    expect(() => body('customer', selected, item, options)).toThrow('30 phút')
    expect(() => ownerReschedulePayload(ownerItem, selected, options, '', now + 1)).toThrow()
  })
  it.each(['customer', 'owner'])('%s rejects invalid states, stale revision, absent slot and no-op', role => {
    const appointment = role === 'owner' ? ownerItem : item
    for (const status of ['in_progress', 'completed', 'cancelled', 'no_show']) {
      expect(() => body(role, undefined, { ...appointment, status })).toThrow()
    }
    expect(() => body(role, undefined, appointment, { ...baseOptions, revision: 4 })).toThrow()
    expect(() => body(role, undefined, appointment, { ...baseOptions, stylists: [] })).toThrow()
    const same = selectionAt(item.startAt)
    expect(() => body(role, same)).toThrow('khác')
  })
  it.each(['customer', 'owner'])('%s includes the exact 168-hour boundary but rejects beyond/off-grid', role => {
    const edge = selectionAt(new Date(now + 604_800_000).toISOString())
    expect(() => body(role, edge)).not.toThrow()
    for (const offset of [604_800_001, 604_800_000 + 900_000, 14_400_001]) {
      expect(() => body(role, selectionAt(new Date(now + offset).toISOString()))).toThrow()
    }
  })
})

describe('Owner agreement gate', () => {
  it.each([false, undefined, 'true'])('requires explicit Owner agreement, rejecting %s without sending any request', async agreement => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(() => ownerReschedulePayload(ownerItem, selectionAt(later), baseOptions, 'Khách đã đồng ý', now, agreement))
      .toThrow('xác nhận')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('requires Owner reason even far before cutoff and serializes no confirmation field', () => {
    for (const reason of ['', ' ', 'a'.repeat(501)]) {
      expect(() => ownerReschedulePayload(ownerItem, selectionAt(later), baseOptions, reason, now, true)).toThrow('lý do')
    }
    const payload = ownerReschedulePayload(ownerItem, selectionAt(later), baseOptions, '  Đã trao đổi với khách  ', now, true)
    expect(payload).toEqual({ expectedRevision: 3, staffId: item.staffId, startAt: later, reason: 'Đã trao đổi với khách' })
    expect(Object.keys(payload).sort()).toEqual(['expectedRevision', 'reason', 'staffId', 'startAt'])
  })

})

describe('shared reschedule form and availability contract', () => {
  it('keeps stylist choices first, then date/time, with historical snapshot totals', () => {
    const html = renderForm()
    expect(html.indexOf('1. Chọn chuyên viên')).toBeLessThan(html.indexOf('2. Chọn thời gian mới'))
    for (const text of ['Giữ chuyên viên hiện tại', 'Chọn chuyên viên khác', 'Stylist An', 'Giá cũ lúc đặt', '100.000', '30 phút']) expect(html).toContain(text)
    expect(html).not.toContain('đã bao gồm dọn')
    expect(html).not.toContain('Lý do đổi lịch')
    expect(useRescheduleOptions).toHaveBeenCalledWith('fixture', item.id, '2026-10-23')
  })
  it('renders current stylist slots only, rather than another stylist slots', () => {
    const other = optionsFor(new Date(now + 18_000_000).toISOString(), otherId)
    vi.mocked(useRescheduleOptions).mockReturnValue({ kind: 'success', value: { ...baseOptions, stylists: [...baseOptions.stylists, ...other.stylists] } })
    const html = renderForm()
    expect(html).toContain('14:00')
    expect(html).not.toContain('15:00')
  })
  it('shows loading, error/retry, empty staff and stale revision without usable confirmation', () => {
    for (const state of [
      { kind: 'loading' },
      { kind: 'error', retry() {} },
      { kind: 'success', value: { ...baseOptions, stylists: [] } },
      { kind: 'success', value: { ...baseOptions, revision: 4 } },
    ]) {
      vi.mocked(useRescheduleOptions).mockReturnValue(state)
      const html = renderForm()
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Xác nhận đổi lịch hẹn →<\/button>/)
    }
  })

  it('retains the locked form and same-request retry after unknown outcome', () => {
    const html = renderForm({ locked: true, ambiguous: true, command: { kind: 'error', pending: { payload: body('customer') } },
      error: new Error('offline') })
    expect(html).toContain('<fieldset disabled=""')
    expect(html).toContain('Chưa xác định được kết quả')
    expect(html).toContain('>Thử lại cùng yêu cầu</button>')
    expect(html).toContain('disabled="">Quay lại')
  })
  it.each([401, 403, 404, 409])('blocks another confirmation after definite HTTP %s and offers refresh', status => {
    const html = renderForm({ error: { status }, command: { kind: 'error' }, selection: { startAt: later } })
    expect(html).toContain('Tải lại lịch')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Xác nhận đổi lịch hẹn →<\/button>/)
  })
  it.each(['customer-token', 'owner-token'])('requests scoped snapshot options by date with %s', async token => {
    const fetch = vi.fn().mockResolvedValue(response(baseOptions))
    vi.stubGlobal('fetch', fetch)
    await readRescheduleOptions('https://api.example.test', token, item.id, '2026-10-24')
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/api/appointments/' + item.id + '/reschedule-options?localDate=2026-10-24')
    expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer ' + token)
    expect(fetch.mock.calls[0][1].body).toBeUndefined()
  })
})

describe('reschedule command and synchronization', () => {
  it.each(['customer', 'owner'])('%s sends one POST for double-submit and retains snapshot values', async role => {
    const request = body(role)
    const value = outcome(role, request)
    const fetch = vi.fn().mockResolvedValue(response(value))
    vi.stubGlobal('fetch', fetch)
    const command = manager(role)
    const first = command.run(request)
    expect(command.run(request)).toBe(first)
    await expect(first).resolves.toMatchObject({ revision: 4, startAt: later, totalPriceVnd: item.totalPriceVnd, items: item.items })
    expect(fetch).toHaveBeenCalledOnce()
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/appointments/' + item.id + '/reschedule')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual(request)
    expect(options.headers.get('Idempotency-Key')).toBe('reschedule-intent-key')
  })
  it.each(['customer', 'owner'])('%s retries network failure with original body/revision/key', async role => {
    const request = body(role)
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(response(outcome(role, request)))
    vi.stubGlobal('fetch', fetch)
    const command = manager(role)
    await expect(command.run(request)).rejects.toMatchObject({ uncertain: true })
    expect(command.getPending().payload).toEqual(request)
    await expect(command.run({ ...request, startAt: new Date(now + 18_000_000).toISOString() })).rejects.toThrow()
    await command.run(request)
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body)
    expect(fetch.mock.calls[0][1].headers.get('Idempotency-Key')).toBe(fetch.mock.calls[1][1].headers.get('Idempotency-Key'))
  })
  it.each(['customer', 'owner'])('%s preserves conflicts/authorization errors without claiming success', async role => {
    for (const code of ['SLOT_UNAVAILABLE', 'STAFF_UNAVAILABLE', 'APPOINTMENT_REVISION_CONFLICT', 'APPOINTMENT_STATE_CONFLICT', 'RESCHEDULE_CUTOFF']) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ code }, 409)))
      const command = manager(role)
      await expect(command.run(body(role))).rejects.toMatchObject({ status: 409, code, uncertain: false })
      expect(command.getPending()).toBeUndefined()
    }
    for (const status of [401, 403, 404]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ code: 'DENIED' }, status)))
      await expect(manager(role).run(body(role))).rejects.toMatchObject({ status })
    }
  })
  it.each(['customer', 'owner'])('%s refreshes changed detail/list and ignores stale reads', async role => {
    vi.useRealTimers()
    let current = role === 'owner' ? ownerItem : item
    let resolveOld
    const old = new Promise(resolve => { resolveOld = resolve })
    const read = vi.fn().mockImplementationOnce(() => old).mockImplementation(async () => current)
    const detail = role === 'owner' ? createOwnerAppointmentReader({ readProfile: async () => owner, readData: read })
      : createCustomerAppointmentDetail({ readProfile: async () => customer, readDetail: read })
    const oldRequest = detail.load()
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
    current = outcome(role, body(role))
    await detail.load()
    resolveOld(role === 'owner' ? ownerItem : item)
    await oldRequest
    expect(detail.getSnapshot().value.startAt).toBe(later)
    expect(detail.getSnapshot().value.revision).toBe(4)
    const readPage = async () => ({ items: [current], pagination: { hasNextPage: false, nextCursor: null } })
    const list = role === 'owner' ? createOwnerAppointmentReader({ readProfile: async () => owner, paginated: true, readData: readPage })
      : createCustomerAppointmentList({ readProfile: async () => customer, readPage })
    await list.load()
    expect(list.getSnapshot().items[0]).toMatchObject({ startAt: later, revision: 4 })
  })
})
