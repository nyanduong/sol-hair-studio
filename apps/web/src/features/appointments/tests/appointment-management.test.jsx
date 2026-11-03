import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertCustomerAppointmentEditable, reschedulePayload, createAppointmentCommand } from '../hooks/useAppointmentCommand.js'
import { readRescheduleOptions, sendAppointmentCommand } from '../api/appointments.api.js'
import CustomerAppointmentManagement from '../components/CustomerAppointmentManagement.jsx'
import CustomerAppointmentList from '../components/CustomerAppointmentList.jsx'

const now = Date.parse('2026-10-23T03:00:00.000Z')
const appointment = {
  id: '1234567890abcdef12345678', staffId: 'aaaaaaaaaaaaaaaaaaaaaaaa', revision: 3, status: 'confirmed',
  startAt: new Date(now + 7200000).toISOString(), endAt: new Date(now + 9000000).toISOString(),
  items: [{ serviceId: 'cut', name: 'Historical cut', priceVnd: 100000, durationMinutes: 30 }],
  staffNameSnapshot: 'An', totalDurationMinutes: 30, totalPriceVnd: 100000,
}
const selection = { staffId: 'bbbbbbbbbbbbbbbbbbbbbbbb', startAt: new Date(now + 10800000).toISOString() }
const options = { appointmentId: appointment.id, revision: 3, stylists: [
  { staffId: selection.staffId, displayName: 'Binh', slots: [{ startAt: selection.startAt }] },
] }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('customer management validation', () => {
  it('allows exact two-hour cutoff and emits only revision, staff and time', () => {
    expect(() => assertCustomerAppointmentEditable(appointment, now)).not.toThrow()
    expect(reschedulePayload(appointment, selection, options, now)).toEqual({
      expectedRevision: 3, staffId: selection.staffId, startAt: selection.startAt,
    })
  })
  it.each([1, 7200000, 7200001])('rejects cutoff or past start at offset %s', offset => {
    expect(() => assertCustomerAppointmentEditable(appointment, now + offset)).toThrow()
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('rejects %s', status => {
    expect(() => assertCustomerAppointmentEditable({ ...appointment, status }, now)).toThrow()
  })
  it('rejects stale availability, unavailable slots and unchanged selection', () => {
    expect(() => reschedulePayload(appointment, selection, { ...options, revision: 4 }, now)).toThrow()
    expect(() => reschedulePayload(appointment, { ...selection, startAt: new Date(now + 11700000).toISOString() }, options, now)).toThrow()
    const same = { staffId: appointment.staffId, startAt: appointment.startAt }
    expect(() => reschedulePayload(appointment, same, { revision: 3, stylists: [{ staffId: same.staffId, slots: [same] }] }, now)).toThrow()
  })
  it.each([1799999, 604800001, 1800001])('rejects lead-time/horizon/off-grid offset %s', offset => {
    const choice = { ...selection, startAt: new Date(now + offset).toISOString() }
    expect(() => reschedulePayload(appointment, choice, { ...options, stylists: [{ staffId: choice.staffId, slots: [choice] }] }, now)).toThrow()
  })
})

describe('receipts and command HTTP', () => {
  it.each(['cancel', 'reschedule'])('uses POST %s and the supplied idempotency key', async operation => {
    const payload = operation === 'cancel' ? { expectedRevision: 3 } : reschedulePayload(appointment, selection, options, now)
    const value = { ...appointment, revision: 4, status: operation === 'cancel' ? 'cancelled' : 'confirmed' }
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: value }) })
    vi.stubGlobal('fetch', fetch)
    expect(await sendAppointmentCommand('https://api.example.test', 'token', appointment.id, operation, payload, 'same-key')).toEqual(value)
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/appointments/' + appointment.id + '/' + operation)
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body)).toEqual(payload)
    expect(request.headers.get('Authorization')).toBe('Bearer token')
    expect(request.headers.get('Idempotency-Key')).toBe('same-key')
  })
  it('deduplicates repeated submission and clears intent only on success', async () => {
    const send = vi.fn().mockResolvedValue({ revision: 4 })
    const manager = createAppointmentCommand(send, () => 'same-key')
    const first = manager.run({ expectedRevision: 3 })
    expect(manager.run({ expectedRevision: 3 })).toBe(first)
    await first
    expect(send).toHaveBeenCalledOnce()
    expect(manager.getPending()).toBeUndefined()
  })
  it('preserves body/key/revision on uncertain result, rejecting a different intent', async () => {
    const send = vi.fn().mockRejectedValueOnce(Object.assign(new Error('unknown'), { status: 503 })).mockResolvedValueOnce({ revision: 4 })
    const keys = vi.fn(() => 'same-key')
    const manager = createAppointmentCommand(send, keys)
    await expect(manager.run({ expectedRevision: 3 })).rejects.toMatchObject({ uncertain: true })
    await expect(manager.run({ expectedRevision: 4 })).rejects.toThrow()
    await manager.run({ expectedRevision: 3 })
    expect(send.mock.calls[0].slice(0, 2)).toEqual(send.mock.calls[1].slice(0, 2))
    expect(keys).toHaveBeenCalledOnce()
  })
  it('keeps a malformed success ambiguous', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }))
    const manager = createAppointmentCommand((body, key) => sendAppointmentCommand('https://api.example.test', 'token', appointment.id, 'cancel', body, key), () => 'same-key')
    await expect(manager.run({ expectedRevision: 3 })).rejects.toMatchObject({ uncertain: true })
    expect(manager.getPending()).toBeDefined()
  })
  it('does not claim success on a definite conflict', async () => {
    const manager = createAppointmentCommand(async () => { throw Object.assign(new Error('busy'), { status: 409, code: 'SLOT_UNAVAILABLE' }) }, () => 'key')
    await expect(manager.run({ expectedRevision: 3 })).rejects.toMatchObject({ uncertain: false, code: 'SLOT_UNAVAILABLE' })
    expect(manager.getPending()).toBeUndefined()
  })
  it.each([401, 403, 404, 409, 503])('preserves HTTP %s', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ code: 'ERROR' }) }))
    await expect(sendAppointmentCommand('https://api.example.test', 'token', appointment.id, 'cancel', { expectedRevision: 3 }, 'key')).rejects.toMatchObject({ status, code: 'ERROR' })
  })
  it('rejects changed services before sending', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(sendAppointmentCommand('https://api.example.test', 'token', appointment.id, 'reschedule', { expectedRevision: 3, items: [] }, 'key')).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('reads snapshot options instead of new-booking availability', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: options }) })
    vi.stubGlobal('fetch', fetch)
    await readRescheduleOptions('https://api.example.test', 'token', appointment.id, '2026-10-24')
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/api/appointments/' + appointment.id + '/reschedule-options?localDate=2026-10-24')
  })
})

describe('customer action UI', () => {
  const render = (value = appointment, initialAction) => renderToStaticMarkup(
    <CustomerAppointmentManagement token="fixture-token" appointment={value} onChanged={() => {}} initialAction={initialAction} />)
  it('requires explicit confirmation in the cancellation dialog', () => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    const html = render(appointment, 'cancel')
    expect(html).toContain('<dialog')
    expect(html).toContain('Bạn có chắc')
    expect(html).toContain('Xác nhận hủy lịch')
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('hides commands for %s', status => {
    const html = render({ ...appointment, status })
    expect(html).not.toContain('>Đổi lịch hẹn</button>')
    expect(html).not.toContain('>Hủy lịch hẹn</button>')
  })
  it('links list actions to the existing appointment, not a new booking', () => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    const html = renderToStaticMarkup(<MemoryRouter><CustomerAppointmentList state={{ kind: 'success', items: [appointment], hasNextPage: false }} onLogin={() => {}} /></MemoryRouter>)
    expect(html).toContain('action=reschedule')
    expect(html).toContain('action=cancel')
    expect(html).not.toContain('/booking?reschedule=')
  })
})
