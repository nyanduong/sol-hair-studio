import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OwnerAppointmentManagement, { OwnerAppointmentCommandDialog } from '../components/OwnerAppointmentManagement.jsx'
import OwnerAppointmentsView from '../components/OwnerAppointmentsView.jsx'
import { createOwnerAppointmentCommand, ownerAppointmentActions, ownerAppointmentPayload, watchOwnerAppointmentTime } from '../hooks/useOwnerAppointmentCommand.js'
import { readOwnerAppointment, sendOwnerAppointmentCommand } from '../api/owner-appointments.api.js'
import { createOwnerAppointmentReader } from '../hooks/useOwnerAppointments.js'

const now = Date.parse('2026-10-23T03:15:00.000Z')
const owner = { accountId: 'owner-a', roles: ['owner'], status: 'active' }
const item = {
  id: '1234567890abcdef12345678', revision: 3, customerId: 'customer-a',
  customerSnapshot: { displayName: 'Khách A', phone: '+84901234567' }, staffId: 'staff-a', staffNameSnapshot: 'Stylist An',
  status: 'confirmed', startAt: '2026-10-23T03:00:00.000Z', endAt: '2026-10-23T04:00:00.000Z',
  totalDurationMinutes: 60, totalPriceVnd: 150000,
  items: [{ serviceId: 'cut', name: 'Cắt tóc snapshot', durationMinutes: 40, priceVnd: 100000 },
    { serviceId: 'wash', name: 'Gội đầu', durationMinutes: 20, priceVnd: 50000 }],
}
const fields = { reason: 'Khách gọi hủy', contactLocal: '2026-10-23T10:10', confirmedAbsent: true }
const result = operation => ({ ...item, revision: 4, status: operation === 'cancel' ? 'cancelled' : 'no_show' })
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function respond(value, status = 200) {
  const fetch = vi.fn().mockResolvedValue({ ok: status === 200, status, json: async () => status === 200 ? { data: value } : { code: value } })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
const payload = operation => ownerAppointmentPayload(item, operation, fields, now)
const renderDialog = (operation = 'cancel', command = { kind: 'idle', locked: false }, values = fields, time = now) =>
  renderToStaticMarkup(<OwnerAppointmentCommandDialog appointment={item} operation={operation} now={time}
    command={command} fields={values} onFields={() => {}} onConfirm={() => {}} onClose={() => {}} onReload={() => {}} />)
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Owner cancellation and no-show rules', () => {
  it('does not apply Customer cutoff to Owner, but requires a reason inside two hours or after start', () => {
    const exact = { ...item, startAt: new Date(now + 7_200_000).toISOString() }
    expect(ownerAppointmentPayload(exact, 'cancel', {}, now)).toEqual({ expectedRevision: 3 })
    expect(() => ownerAppointmentPayload(exact, 'cancel', {}, now + 1)).toThrow('lý do')
    expect(() => ownerAppointmentPayload(item, 'cancel', {}, now)).toThrow('lý do')
    expect(payload('cancel')).toEqual({ expectedRevision: 3, reason: fields.reason })
  })
  it('trims an optional reason and enforces the actual 500-character contract', () => {
    const future = { ...item, startAt: new Date(now + 10_800_000).toISOString() }
    expect(ownerAppointmentPayload(future, 'cancel', { reason: '  Khách gọi  ' }, now).reason).toBe('Khách gọi')
    expect(ownerAppointmentPayload(item, 'cancel', { reason: 'a'.repeat(500) }, now).reason).toHaveLength(500)
    for (const reason of [' ', 'a'.repeat(501), 123]) expect(() => ownerAppointmentPayload(item, 'cancel', { reason }, now)).toThrow()
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('blocks both operations on %s', status => {
    const value = { ...item, status }
    expect(ownerAppointmentActions(value, now)).toMatchObject({ cancel: false, noShow: false })
    for (const operation of ['cancel', 'no-show']) expect(() => ownerAppointmentPayload(value, operation, fields, now)).toThrow()
  })
  it.each([undefined, -1, 1.5, '3'])('blocks a missing or invalid revision %s', revision => {
    expect(ownerAppointmentActions({ ...item, revision }, now).cancel).toBe(false)
  })
  it('permits no-show exactly at +15 minutes, rejecting one millisecond earlier', () => {
    expect(ownerAppointmentActions(item, now).noShow).toBe(true)
    expect(ownerAppointmentActions(item, now - 1).noShow).toBe(false)
    expect(() => ownerAppointmentPayload(item, 'no-show', fields, now - 1)).toThrow('15 phút')
    expect(payload('no-show')).toEqual({ expectedRevision: 3, contactAttemptedAt: '2026-10-23T03:10:00.000Z' })
  })
  it('requires an explicit assertion that the customer has not arrived and was contacted', () => {
    for (const confirmedAbsent of [false, undefined]) {
      expect(() => ownerAppointmentPayload(item, 'no-show', { ...fields, confirmedAbsent }, now)).toThrow('xác nhận')
    }
  })
  it.each(['', 'bad', '2026-02-30T10:00', '2026-10-23T10:16', '2026-10-23T03:10:00.000Z'])('rejects invalid/future local contact time %s', contactLocal => {
    expect(() => ownerAppointmentPayload(item, 'no-show', { ...fields, contactLocal }, now)).toThrow()
  })
  it('does not invent a rule forbidding contact before the scheduled start', () => {
    expect(ownerAppointmentPayload(item, 'no-show', { ...fields, contactLocal: '2026-10-23T09:59' }, now).contactAttemptedAt)
      .toBe('2026-10-23T02:59:00.000Z')
  })
  it('updates exactly at the two-hour boundary and +15-minute threshold', () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const start = Date.parse(item.startAt)
    vi.setSystemTime(start - 7_200_000)
    const update = vi.fn()
    const stop = watchOwnerAppointmentTime(item.startAt, update)
    vi.advanceTimersByTime(0)
    expect(ownerAppointmentActions(item, update.mock.lastCall[0]).reasonRequired).toBe(false)
    vi.advanceTimersByTime(1)
    expect(ownerAppointmentActions(item, update.mock.lastCall[0]).reasonRequired).toBe(true)
    stop()
    vi.setSystemTime(now - 1)
    const stopNoShow = watchOwnerAppointmentTime(item.startAt, update)
    vi.advanceTimersByTime(0)
    expect(ownerAppointmentActions(item, update.mock.lastCall[0]).noShow).toBe(false)
    vi.advanceTimersByTime(1)
    expect(ownerAppointmentActions(item, update.mock.lastCall[0]).noShow).toBe(true)
    stopNoShow()
    expect(vi.getTimerCount()).toBe(0)
    expect(window.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function))
  })
})

describe('Owner command HTTP, authorization and idempotency', () => {
  it('retains the real detail revision but still drops internal fields', async () => {
    respond({ ...item, lastCommand: { key: 'private' }, email: 'private' })
    const detail = await readOwnerAppointment('https://api.example.test', 'owner-token', item.id)
    expect(detail.revision).toBe(3)
    expect(detail).not.toHaveProperty('lastCommand')
    expect(detail).not.toHaveProperty('email')
  })
  it('refuses detail without a usable revision', async () => {
    respond({ ...item, revision: undefined })
    await expect(readOwnerAppointment('https://api.example.test', 'token', item.id)).rejects.toThrow()
  })
  it.each(['cancel', 'no-show'])('uses the existing POST %s contract and command key', async operation => {
    const fetch = respond(result(operation))
    const body = payload(operation)
    await expect(sendOwnerAppointmentCommand('https://api.example.test', 'owner-token', item.id, operation, body, 'owner-command-key')).resolves.toMatchObject(result(operation))
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/appointments/' + item.id + '/' + operation)
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body)).toEqual(body)
    expect(request.headers.get('Authorization')).toBe('Bearer owner-token')
    expect(request.headers.get('Idempotency-Key')).toBe('owner-command-key')
    expect(request.headers.get('Content-Type')).toBe('application/json')
  })
  it.each([
    { roles: ['customer'], status: 'active' }, { roles: ['stylist'], status: 'active' },
    { roles: ['owner'], status: 'disabled' }, null,
  ])('verifies actual Owner role before sending despite cached UI', async profile => {
    const send = vi.fn()
    const manager = createOwnerAppointmentCommand({ readProfile: async () => profile, send }, () => 'key')
    await expect(manager.run(payload('cancel'))).rejects.toMatchObject({ status: 403 })
    expect(send).not.toHaveBeenCalled()
    expect(manager.getPending()).toBeUndefined()
  })
  it('does not POST if the account/filter scope was cancelled during profile verification', async () => {
    const profile = deferred(), send = vi.fn(), controller = new AbortController()
    const manager = createOwnerAppointmentCommand({ readProfile: () => profile.promise, send }, () => 'key')
    const job = manager.run(payload('cancel'), controller.signal)
    controller.abort(); profile.resolve(owner)
    await expect(job).rejects.toMatchObject({ name: 'AbortError' })
    expect(send).not.toHaveBeenCalled()
  })
  it.each(['cancel', 'no-show'])('deduplicates double-submit for %s', async operation => {
    const pending = deferred(), send = vi.fn(() => pending.promise)
    const manager = createOwnerAppointmentCommand({ readProfile: async () => owner, send }, () => 'same-key')
    const first = manager.run(payload(operation))
    expect(manager.run(payload(operation))).toBe(first)
    pending.resolve(result(operation))
    await expect(first).resolves.toMatchObject({ revision: 4 })
    expect(send).toHaveBeenCalledOnce()
    expect(manager.getPending()).toBeUndefined()
  })
  it.each(['cancel', 'no-show'])('keeps %s body/key/revision on uncertain network outcome', async operation => {
    const send = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(result(operation))
    const key = vi.fn(() => 'stable-key')
    const manager = createOwnerAppointmentCommand({ readProfile: async () => owner, send }, key)
    const body = payload(operation)
    await expect(manager.run(body)).rejects.toMatchObject({ uncertain: true })
    expect(manager.getPending().payload).toEqual(body)
    await expect(manager.run({ ...body, expectedRevision: 4 })).rejects.toThrow()
    await manager.run(body)
    expect(send.mock.calls[0].slice(0, 2)).toEqual(send.mock.calls[1].slice(0, 2))
    expect(key).toHaveBeenCalledOnce()
  })
  it.each([[400, 'CANCELLATION_REASON_REQUIRED'], [400, 'INVALID_CONTACT_ATTEMPTED_AT'], [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'], [404, 'APPOINTMENT_NOT_FOUND'], [409, 'APPOINTMENT_REVISION_CONFLICT'], [409, 'NO_SHOW_TOO_EARLY'], [503, 'APPOINTMENT_COMMAND_RESULT_UNKNOWN']])(
    'preserves HTTP %s / %s and never reports success', async (status, code) => {
      respond(code, status)
      const manager = createOwnerAppointmentCommand({ readProfile: async () => owner,
        send: (body, key) => sendOwnerAppointmentCommand('https://api.example.test', 'token', item.id, 'cancel', body, key) }, () => 'stable-key')
      await expect(manager.run(payload('cancel'))).rejects.toMatchObject({ status, code })
      expect(Boolean(manager.getPending())).toBe(status >= 500)
    })
  it.each([{ ...result('cancel'), status: 'confirmed' }, { ...result('cancel'), revision: 3 }, { ...result('cancel'), id: 'wrong' }, {}])(
    'treats malformed success as unknown, keeping the original intent', async response => {
      respond(response)
      const manager = createOwnerAppointmentCommand({ readProfile: async () => owner,
        send: (body, key) => sendOwnerAppointmentCommand('https://api.example.test', 'token', item.id, 'cancel', body, key) }, () => 'key')
      await expect(manager.run(payload('cancel'))).rejects.toMatchObject({ uncertain: true })
      expect(manager.getPending()).toBeDefined()
    })
  it('does not send service changes, contact confirmations or unsupported operations', async () => {
    const fetch = respond(result('cancel'))
    for (const [operation, body] of [['cancel', { ...payload('cancel'), items: [] }],
      ['no-show', { ...payload('no-show'), confirmedAbsent: true }], ['start', { expectedRevision: 3 }]]) {
      await expect(sendOwnerAppointmentCommand('https://api.example.test', 'token', item.id, operation, body, 'key')).rejects.toThrow()
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('Owner command confirmation UI and refreshed data', () => {
  it('identifies the correct appointment and marks late cancellation reason as required', () => {
    const html = renderDialog()
    for (const text of [item.id, 'Khách A', '+84901234567', 'Stylist An', 'Cắt tóc snapshot', 'Gội đầu', 'Lý do hủy (bắt buộc)']) expect(html).toContain(text)
    expect(html).toContain('maxLength="500"')
    expect(html).not.toContain('Start')
    const future = renderDialog('cancel', undefined, { ...fields, reason: '' }, Date.parse(item.startAt) - 7_200_000)
    expect(future).toContain('Lý do hủy (không bắt buộc)')
  })
  it('requires contact time and explicit absent/contacted confirmation before no-show', () => {
    const html = renderDialog('no-show', undefined, { ...fields, confirmedAbsent: false })
    expect(html).toContain('datetime-local')
    expect(html).toContain('giờ Việt Nam')
    expect(html).toContain('Tôi xác nhận đã liên hệ và khách chưa đến salon.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Xác nhận không đến<\/button>/)
  })
  it('disables no-show before the 15-minute boundary and unlocks at equality', () => {
    vi.useFakeTimers(); vi.setSystemTime(now - 1)
    const render = () => renderToStaticMarkup(<OwnerAppointmentManagement token="fixture" appointment={item} onChanged={() => {}} />)
    expect(render()).toMatch(/<button[^>]*disabled=""[^>]*>Đánh dấu không đến<\/button>/)
    vi.setSystemTime(now)
    expect(render()).not.toMatch(/<button[^>]*disabled=""[^>]*>Đánh dấu không đến<\/button>/)
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('renders no commands on %s', status => {
    expect(renderToStaticMarkup(<OwnerAppointmentManagement token="fixture" appointment={{ ...item, status }} />)).toBe('')
  })
  it('locks fields and closing during submit, and only permits same-intent retry after network error', () => {
    const pending = { payload: payload('cancel') }
    const loading = renderDialog('cancel', { kind: 'loading', locked: true, pending })
    expect(loading).toContain('<fieldset disabled=""')
    expect(loading).toContain('disabled="">Quay lại')
    expect(loading).toContain('disabled="">Đang xử lý…')
    const unknown = renderDialog('cancel', { kind: 'error', locked: true, pending, error: new Error('offline') })
    expect(unknown).toContain('Chưa xác định được kết quả')
    expect(unknown).toContain('>Thử lại cùng yêu cầu</button>')
    expect(unknown).not.toContain('disabled="">Thử lại cùng yêu cầu')
    expect(unknown).not.toContain('Đã hủy lịch hẹn.')
  })
  it.each([['APPOINTMENT_REVISION_CONFLICT', 'Lịch đã được cập nhật'], ['NO_SHOW_TOO_EARLY', 'Theo giờ server'],
    ['APPOINTMENT_STATE_CONFLICT', 'Trạng thái lịch đã thay đổi']])('requires refresh after %s', (code, message) => {
      const html = renderDialog('no-show', { kind: 'error', locked: false, error: { status: 409, code } })
      expect(html).toContain(message)
      expect(html).toContain('Tải lại lịch')
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Xác nhận không đến<\/button>/)
    })
  it.each(['cancel', 'no-show'])('refreshes %s detail/list and ignores older confirmed data', async operation => {
    let current = item
    const old = deferred()
    const detailRead = vi.fn().mockImplementationOnce(() => old.promise).mockImplementation(async () => current)
    const detail = createOwnerAppointmentReader({ readProfile: async () => owner, readData: detailRead })
    const oldRequest = detail.load()
    await vi.waitFor(() => expect(detailRead).toHaveBeenCalledOnce())
    const manager = createOwnerAppointmentCommand({ readProfile: async () => owner,
      send: async () => { current = result(operation); return current } }, () => 'key')
    await manager.run(payload(operation))
    await detail.load()
    old.resolve(item)
    await oldRequest
    expect(detail.getSnapshot().value).toEqual(result(operation))

    const list = createOwnerAppointmentReader({ readProfile: async () => owner, paginated: true,
      readData: async () => ({ items: [current], pagination: { hasNextPage: false, nextCursor: null } }) })
    await list.load()
    expect(list.getSnapshot().items[0].status).toBe(current.status)
    const filtered = createOwnerAppointmentReader({ readProfile: async () => owner, paginated: true,
      readData: async () => ({ items: current.status === 'confirmed' ? [current] : [], pagination: { hasNextPage: false, nextCursor: null } }) })
    await filtered.load()
    expect(filtered.getSnapshot().items).toEqual([])
    const html = renderToStaticMarkup(<MemoryRouter><OwnerAppointmentsView state={detail.getSnapshot()} detailed
      actions={<OwnerAppointmentManagement token="fixture" appointment={current} />} /></MemoryRouter>)
    expect(html).toContain(operation === 'cancel' ? 'Đã hủy' : 'Không đến')
    expect(html).not.toContain('>Hủy lịch</button>')
    expect(html).not.toContain('>Đánh dấu không đến</button>')
  })
})
