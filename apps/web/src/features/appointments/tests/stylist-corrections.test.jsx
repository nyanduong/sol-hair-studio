import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StylistCorrectionDialog } from '../components/StylistAppointmentCorrection.jsx'
import { sendOwnerCorrection } from '../api/owner-corrections.api.js'

const appointment = { id: '111111111111111111111111', status: 'in_progress', revision: 2,
  customerSnapshot: { displayName: 'Khách test', phone: '+84900000000' }, staffNameSnapshot: 'Stylist test',
  items: [{ name: 'Cắt tóc' }], startAt: '2026-11-01T03:00:00.000Z', endAt: '2026-11-01T03:45:00.000Z' }
function render(patch = {}) {
  return renderToStaticMarkup(<StylistCorrectionDialog appointment={appointment} operation="correct-start"
    now={Date.parse('2026-11-01T03:10:00.000Z')} command={{ kind: 'idle', locked: false }}
    fields={{ reason: '', confirmed: false, etaLocal: '' }} {...patch} />)
}
afterEach(() => vi.unstubAllGlobals())
describe('Stylist correction dialog', () => {
  it('accepts a Stylist response without a customerId and sends to the same scoped API', async () => {
    const data = { ...appointment, staffId: '222222222222222222222222', status: 'confirmed', revision: 3,
      totalPriceVnd: 100000, totalDurationMinutes: 45,
      items: [{ serviceId: 'cut', name: 'Cắt tóc', priceVnd: 100000, durationMinutes: 45 }],
      occupiedFrom: appointment.startAt, occupiedUntil: '2026-11-01T03:55:00.000Z' }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const body = { expectedRevision: 2, reason: 'Pressed by mistake', serviceNotStarted: true }
    const result = await sendOwnerCorrection('https://api.test', 'token', appointment.id, 'correct-start', body, 'stylist-correction-test-key', undefined, 'stylist')
    expect(result.status).toBe('confirmed')
    expect(result).not.toHaveProperty('customerId')
    expect(fetch.mock.calls[0][0]).toBe('https://api.test/api/appointments/' + appointment.id + '/correct-start')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body)
  })
  it('shows the scoped customer, reason and explicit confirmation without an audit reader', () => {
    const html = render()
    expect(html).toContain('Khách test')
    expect(html).toContain('Stylist test')
    expect(html).toContain('Lý do sửa nhầm')
    expect(html).toContain('thực tế khách chưa được phục vụ')
    expect(html).not.toContain('Lịch sử thao tác')
    expect(html).toContain('disabled=""')
  })
  it('requires a new ETA when reopening service after the planned end', () => {
    const html = render({ appointment: { ...appointment, status: 'completed' }, operation: 'correct-complete', now: Date.parse('2026-11-01T04:00:00.000Z') })
    expect(html).toContain('datetime-local')
    expect(html).toContain('— bắt buộc')
    expect(html).toContain('thực tế khách vẫn đang được phục vụ')
  })
  it('retains retry and prevents editing when the result is unknown', () => {
    const html = render({ command: { kind: 'error', locked: true, pending: { payload: {} }, error: { status: 503 } } })
    expect(html).toContain('Thử lại cùng yêu cầu')
    expect(html).toContain('<fieldset disabled=""')
  })
})
