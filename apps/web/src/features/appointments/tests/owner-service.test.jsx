import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnerServiceDialog } from '../components/OwnerAppointmentService.jsx'
import OwnerAppointmentManagement from '../components/OwnerAppointmentManagement.jsx'
import OwnerAppointmentsView from '../components/OwnerAppointmentsView.jsx'
import { ownerServicePayload, mergeOwnerServiceResult, createOwnerAppointmentCommand } from '../hooks/useOwnerAppointmentCommand.js'
import { readOwnerAppointment, sendOwnerAppointmentCommand } from '../api/owner-appointments.api.js'
import { createOwnerAppointmentReader } from '../hooks/useOwnerAppointments.js'

const owner = { roles: ['owner'], status: 'active' }
const item = {
  id: '1234567890abcdef12345678', revision: 3, customerId: 'customer-a',
  customerSnapshot: { displayName: 'Khách A', phone: '+84901234567' }, staffId: 'staff-a', staffNameSnapshot: 'Stylist An',
  status: 'confirmed', startAt: '2026-10-23T04:00:00.000Z', endAt: '2026-10-23T05:00:00.000Z',
  totalDurationMinutes: 60, totalPriceVnd: 150000,
  items: [{ serviceId: 'cut', name: 'Cắt tóc snapshot', durationMinutes: 40, priceVnd: 100000 },
    { serviceId: 'wash', name: 'Gội đầu', durationMinutes: 20, priceVnd: 50000 }],
}
const startedAt = '2026-10-23T03:03:12.123Z'
const completedAt = '2026-10-23T03:50:43.456Z'
const appointment = operation => ({ ...item, ...(operation === 'complete' ? { status: 'in_progress', startedAt } : {}) })
const outcome = operation => ({ ...item, revision: 4, status: operation === 'start' ? 'in_progress' : 'completed', startedAt,
  ...(operation === 'complete' ? { completedAt } : {}) })
const initial = { kind: 'success', value: item }
function respond(value, status = 200) {
  return { ok: status === 200, status, json: async () => status === 200 ? { data: value } : value }
}
function setup(operation, readProfile = async () => owner) {
  return createOwnerAppointmentCommand({ readProfile, send: (body, key, signal) =>
    sendOwnerAppointmentCommand('https://api.example.test', 'owner-token', item.id, operation, body, key, signal) }, () => 'owner-service-intent-key')
}
function dialog(operation = 'start', command = { kind: 'idle', locked: false }, confirmed = true, value = appointment(operation)) {
  return renderToStaticMarkup(<OwnerServiceDialog appointment={value} operation={operation} command={command}
    confirmed={confirmed} onConfirmed={() => {}} onConfirm={() => {}} onClose={() => {}} onReload={() => {}} />)
}
function renderDetail(value) {
  return renderToStaticMarkup(<MemoryRouter><OwnerAppointmentsView detailed state={{ kind: 'success', value }} /></MemoryRouter>)
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Owner service contract and guards', () => {
  it.each(['start', 'complete'])('%s sends revision only and uses the existing POST with Bearer/key', async operation => {
    const fetch = vi.fn().mockResolvedValue(respond(outcome(operation)))
    vi.stubGlobal('fetch', fetch)
    const body = ownerServicePayload(appointment(operation), operation, true)
    expect(body).toEqual({ expectedRevision: 3 })
    const value = await setup(operation).run(body)
    expect(value).toMatchObject(outcome(operation))
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/appointments/' + item.id + '/' + operation)
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body)).toEqual({ expectedRevision: 3 })
    expect(request.headers.get('Idempotency-Key')).toBe('owner-service-intent-key')
    expect(request.headers.get('Authorization')).toBe('Bearer owner-token')
  })
  it('allows an early Start for Backend validation without scheduled lead-time or fabricated clock', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-10-23T03:00:00.000Z')
    const fetch = vi.fn().mockResolvedValue(respond(outcome('start')))
    vi.stubGlobal('fetch', fetch)
    const value = await setup('start').run(ownerServicePayload(item, 'start', true))
    expect(value.startedAt).toBe(startedAt)
    expect(value.startAt).toBe(item.startAt)
    expect(value.startedAt).not.toBe(new Date().toISOString())
    expect(fetch.mock.calls[0][1].body).toBe('{"expectedRevision":3}')
  })
  it.each(['start', 'complete'])('%s requires explicit actual-service confirmation', operation => {
    for (const confirmed of [false, undefined, 'true']) {
      expect(() => ownerServicePayload(appointment(operation), operation, confirmed)).toThrow('xác nhận')
    }
  })
  it.each(['start', 'complete'])('%s rejects all wrong statuses and invalid revisions', operation => {
    for (const status of ['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].filter(s => s !== (operation === 'start' ? 'confirmed' : 'in_progress'))) {
      expect(() => ownerServicePayload({ ...item, status }, operation, true)).toThrow()
    }
    for (const revision of [undefined, -1, '3', 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => ownerServicePayload({ ...appointment(operation), revision }, operation, true)).toThrow('revision')
    }
  })
  it.each(['start', 'complete'])('%s rejects client time/status/payment/check-in before a request', async operation => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    for (const field of ['startedAt', 'completedAt', 'status', 'actorId', 'payment', 'checkIn', 'items']) {
      await expect(sendOwnerAppointmentCommand('https://api.example.test', 'token', item.id, operation, { expectedRevision: 3, [field]: true }, 'key')).rejects.toThrow()
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{ roles: ['customer'], status: 'active' }, { roles: ['stylist'], status: 'active' }, { roles: ['owner'], status: 'disabled' }, null])(
    'rejects a non-owner/current revoked identity before POST', async profile => {
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)
      await expect(setup('start', async () => profile).run({ expectedRevision: 3 })).rejects.toMatchObject({ status: 403 })
      expect(fetch).not.toHaveBeenCalled()
    })
  it.each(['START_OUTSIDE_SHIFT', 'START_TIME_OFF_CONFLICT', 'START_APPOINTMENT_CONFLICT'])('preserves early-start rejection %s', async code => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ code }, 409)))
    const command = setup('start')
    await expect(command.run({ expectedRevision: 3 })).rejects.toMatchObject({ status: 409, code, uncertain: false })
    expect(command.getPending()).toBeUndefined()
    expect(dialog('start', { kind: 'error', error: { status: 409, code } })).toContain('Tải lại lịch')
  })
  it.each(['start', 'complete'])('%s preserves auth, revision, state and network errors without success', async operation => {
    for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [404, 'APPOINTMENT_NOT_FOUND'],
      [409, 'APPOINTMENT_REVISION_CONFLICT'], [409, 'APPOINTMENT_STATE_CONFLICT'], [503, 'APPOINTMENT_COMMAND_RESULT_UNKNOWN']]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ code }, status)))
      const command = setup(operation)
      await expect(command.run({ expectedRevision: 3 })).rejects.toMatchObject({ status, code })
      expect(Boolean(command.getPending())).toBe(status >= 500)
    }
  })
  it.each(['start', 'complete'])('%s deduplicates double-submit and preserves retry body/key', async operation => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(respond(outcome(operation)))
    vi.stubGlobal('fetch', fetch)
    const command = setup(operation)
    const first = command.run({ expectedRevision: 3 })
    expect(command.run({ expectedRevision: 3 })).toBe(first)
    await expect(first).rejects.toMatchObject({ uncertain: true })
    await expect(command.run({ expectedRevision: 4 })).rejects.toThrow()
    await command.run({ expectedRevision: 3 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body)
    expect(fetch.mock.calls[0][1].headers.get('Idempotency-Key')).toBe(fetch.mock.calls[1][1].headers.get('Idempotency-Key'))
  })
  it.each([
    ['start', { ...outcome('start'), startedAt: undefined }],
    ['start', { ...outcome('start'), startedAt: 'invalid' }],
    ['start', { ...outcome('start'), status: 'confirmed' }],
    ['complete', { ...outcome('complete'), completedAt: undefined }],
    ['complete', { ...outcome('complete'), completedAt: '2026-10-23T02:00:00.000Z' }],
    ['complete', { ...outcome('complete'), revision: 3 }],
  ])('treats malformed %s success as unknown and retains the original intent', async (operation, data) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(data)))
    const command = setup(operation)
    await expect(command.run({ expectedRevision: 3 })).rejects.toMatchObject({ uncertain: true })
    expect(command.getPending()).toBeDefined()
  })
})

describe('Owner service UI and actual-time readiness', () => {
  it.each(['start', 'complete'])('%s identifies customer/stylist/all services/planned time with an unchecked confirmation', operation => {
    const html = dialog(operation, undefined, false)
    for (const value of ['Khách A', '+84901234567', 'Stylist An', 'Cắt tóc snapshot', 'Gội đầu', item.id, '23/10/26']) expect(html).toContain(value)
    expect(html).not.toContain('checked=""')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Xác nhận (bắt đầu|hoàn tất)<\/button>/)
    expect(html).not.toContain('Thanh toán')
  })
  it('shows Start only for confirmed and Complete only for in_progress', () => {
    const confirmed = renderToStaticMarkup(<OwnerAppointmentManagement token="fixture" personalStaffId={item.staffId} appointment={item} />)
    expect(confirmed).toContain('>Bắt đầu phục vụ</button>')
    expect(confirmed).not.toContain('>Hoàn tất phục vụ</button>')
    const serving = renderToStaticMarkup(<OwnerAppointmentManagement token="fixture" personalStaffId={item.staffId} appointment={appointment('complete')} />)
    expect(serving).toContain('>Hoàn tất phục vụ</button>')
    for (const text of ['>Bắt đầu phục vụ</button>', '>Hủy lịch</button>', '>Đổi lịch</button>', '>Đánh dấu không đến</button>']) expect(serving).not.toContain(text)
    for (const status of ['completed', 'cancelled', 'no_show']) {
      expect(renderToStaticMarkup(<OwnerAppointmentManagement token="fixture" personalStaffId={item.staffId} appointment={{ ...item, status }} />)).toBe('')
    }
  })
  it.each(['start', 'complete'])('%s locks closing/checkbox during submit and permits same-intent retry after unknown result', operation => {
    const pending = { payload: { expectedRevision: 3 } }
    const html = dialog(operation, { kind: 'loading', locked: true, pending })
    expect(html).toContain('disabled="">Đang xử lý…')
    expect(html).toContain('disabled="">Quay lại')
    const unknown = dialog(operation, { kind: 'error', locked: true, pending, error: new Error('offline') })
    expect(unknown).toContain('Chưa xác định được kết quả')
    expect(unknown).toContain('>Thử lại cùng yêu cầu</button>')
    expect(unknown).not.toContain('disabled="">Thử lại cùng yêu cầu')
    expect(unknown).toContain('disabled="">Quay lại')
  })
  it.each(['START_OUTSIDE_SHIFT', 'APPOINTMENT_STATE_CONFLICT', 'APPOINTMENT_REVISION_CONFLICT'])('blocks blind retry after %s', code => {
    const html = dialog('start', { kind: 'error', error: { status: 409, code } })
    expect(html).toContain('Tải lại lịch')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Xác nhận bắt đầu<\/button>/)
  })
  it('shows actual times from response and does not invent times when GET omits them', async () => {
    const full = outcome('complete')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(full)))
    const read = await readOwnerAppointment('https://api.example.test', 'token', item.id)
    expect(read).toMatchObject({ startedAt, completedAt })
    const html = renderDetail(read)
    expect(html).toContain('10:03')
    expect(html).toContain('10:50')
    expect(html).not.toContain('Thanh toán')
    const { startedAt: omittedStart, completedAt: omittedEnd, ...missing } = full
    expect(omittedStart).toBe(startedAt); expect(omittedEnd).toBe(completedAt)
    const absent = renderDetail(missing)
    expect(absent).toContain('Chưa có thông tin.')
    expect(absent).not.toContain('10:03')
    expect(absent).not.toContain('10:50')
  })
  it.each(['start', 'complete'])('refreshes %s detail and filtered list without older responses overwriting success', async operation => {
    let resolveOld
    const old = new Promise(resolve => { resolveOld = resolve })
    const result = outcome(operation)
    const { startedAt: actualStart, completedAt: actualEnd, ...getDto } = result
    expect(actualStart).toBe(startedAt)
    expect(actualEnd).toBe(operation === 'complete' ? completedAt : undefined)
    const read = vi.fn().mockImplementationOnce(() => old).mockResolvedValue(getDto)
    const detail = createOwnerAppointmentReader({ readProfile: async () => owner, readData: read })
    const oldRequest = detail.load()
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
    await detail.load()
    resolveOld(item)
    await oldRequest
    const merged = mergeOwnerServiceResult(detail.getSnapshot(), result)
    expect(merged.value).toMatchObject(result)
    expect(mergeOwnerServiceResult(initial, result).value.status).toBe(result.status)
    const filteredList = createOwnerAppointmentReader({ readProfile: async () => owner, paginated: true,
      readData: async () => ({ items: result.status === 'confirmed' ? [result] : [], pagination: { hasNextPage: false, nextCursor: null } }) })
    await filteredList.load()
    expect(filteredList.getSnapshot().items).toEqual([])
  })
  it('never merges a previous command into another account/resource, revoked read or newer revision/state', () => {
    const command = outcome('complete')
    for (const state of [{ kind: 'denied' }, { kind: 'notFound' }, { kind: 'error' }, { kind: 'loading' },
      { kind: 'success', value: { ...item, id: 'other', revision: 4 } },
      { kind: 'success', value: { ...item, revision: 5 } },
      { kind: 'success', value: { ...item, revision: 4 } }]) {
      expect(mergeOwnerServiceResult(state, command)).toBe(state)
    }
    expect(mergeOwnerServiceResult(initial, null)).toBe(initial)
  })
})
