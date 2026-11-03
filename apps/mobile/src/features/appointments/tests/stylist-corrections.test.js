import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendStylistCorrection, stylistCorrectionOperation, stylistCorrectionPayload } from '../api/stylist-corrections.api.js'
import { createStylistCorrectionCommand } from '../hooks/stylist-correction-command.js'

const id = '111111111111111111111111', staffId = '222222222222222222222222', accountId = '333333333333333333333333'
const key = 'stylist-correction-test-key-0001'
const now = Date.parse('2050-01-01T03:00:00.000Z')
const appointment = { id, staffId, status: 'in_progress', revision: 2, staffNameSnapshot: 'Test Stylist',
  confirmedAt: '2050-01-01T01:00:00.000Z', startedAt: '2050-01-01T02:50:00.000Z',
  startAt: '2050-01-01T03:00:00.000Z', endAt: '2050-01-01T03:30:00.000Z',
  localDate: '2050-01-01', timeZone: 'Asia/Ho_Chi_Minh', customerSnapshot: { displayName: 'Test', phone: '+84900000000' },
  items: [{ serviceId: 'cut', name: 'Cut', priceVnd: 100000, durationMinutes: 30 }], totalPriceVnd: 100000, totalDurationMinutes: 30 }
const fields = { reason: 'Pressed by mistake', confirmed: true, date: '', time: '' }

function setup() {
  const readProfile = vi.fn().mockResolvedValue({ account: { accountId, roles: ['stylist'], status: 'active' } })
  const readStaff = vi.fn().mockResolvedValue([{ staffId, accountId, isActive: true }])
  const readDetail = vi.fn().mockResolvedValue(appointment)
  const send = vi.fn().mockResolvedValue({ ...appointment, status: 'confirmed', revision: 3 })
  const onChanged = vi.fn()
  const command = createStylistCorrectionCommand({ accountId, appointmentId: id, readProfile, readStaff, readDetail, send, newKey: () => key, onChanged })
  command.open(appointment)
  command.edit({ reason: fields.reason })
  command.attest(true)
  return { command, send, onChanged, readStaff, readDetail, readProfile }
}
afterEach(() => vi.unstubAllGlobals())

describe('Stylist correction input and API', () => {
  it('requires correct state, reason, confirmation and ETA after planned end', () => {
    expect(stylistCorrectionOperation({ ...appointment, status: 'confirmed' })).toBeNull()
    expect(() => stylistCorrectionPayload(appointment, { ...fields, reason: ' ' }, now)).toThrow('lý do')
    expect(() => stylistCorrectionPayload(appointment, { ...fields, confirmed: false }, now)).toThrow('xác nhận')
    const completed = { ...appointment, status: 'completed', endAt: '2050-01-01T02:59:00.000Z' }
    expect(() => stylistCorrectionPayload(completed, fields, now)).toThrow('ETA')
    expect(stylistCorrectionPayload(completed, { ...fields, date: '2050-01-01', time: '10:30' }, now))
      .toMatchObject({ serviceNotCompleted: true, estimatedEndAt: '2050-01-01T03:30:00.000Z' })
  })
  it('posts revision, reason, confirmation and the same key to the scoped endpoint', async () => {
    const { startedAt, ...snapshot } = appointment
    expect(startedAt).toBeTruthy()
    const result = { ...snapshot, status: 'confirmed', revision: 3, occupiedFrom: appointment.startAt, occupiedUntil: '2050-01-01T03:40:00.000Z' }
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: result }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const body = stylistCorrectionPayload(appointment, fields, now)
    const value = await sendStylistCorrection('https://api.test', 'token', id, 'correct-start', body, key)
    expect(fetch.mock.calls[0][0]).toBe('https://api.test/api/appointments/' + id + '/correct-start')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body)
    expect(fetch.mock.calls[0][1].headers.get('Idempotency-Key')).toBe(key)
    expect(value.status).toBe('confirmed')
  })
})

describe('Stylist correction state', () => {
  it('checks the current session and assignment before sending, then refreshes detail', async () => {
    const page = setup()
    await page.command.submit()
    expect(page.readProfile).toHaveBeenCalledOnce()
    expect(page.readStaff).toHaveBeenCalledOnce()
    expect(page.send).toHaveBeenCalledWith('correct-start', { expectedRevision: 2, reason: fields.reason, serviceNotStarted: true }, key, expect.any(AbortSignal))
    expect(page.onChanged).toHaveBeenCalledOnce()
    expect(page.command.getSnapshot()).toMatchObject({ visible: false, kind: 'success' })
  })
  it('rejects another Stylist assignment without sending', async () => {
    const page = setup()
    page.readDetail.mockResolvedValue({ ...appointment, staffId: '444444444444444444444444' })
    await page.command.submit()
    expect(page.send).not.toHaveBeenCalled()
    expect(page.command.getSnapshot().kind).toBe('rejected')
  })
  it('locks edits/close and retries the identical operation, body and key after network loss', async () => {
    const page = setup()
    page.send.mockRejectedValueOnce(new TypeError('offline'))
    await page.command.submit()
    expect(page.command.getSnapshot().kind).toBe('uncertain')
    expect(page.command.edit({ reason: 'Different' })).toBe(false)
    expect(page.command.close()).toBe(false)
    expect(page.command.open({ ...appointment, status: 'completed' })).toBe(false)
    await page.command.submit()
    expect(page.send.mock.calls[1].slice(0, 3)).toEqual(page.send.mock.calls[0].slice(0, 3))
    expect(page.onChanged).toHaveBeenCalledOnce()
  })
  it('changing any field clears the previous confirmation', () => {
    const { command } = setup()
    command.edit({ reason: 'Updated reason' })
    expect(command.getSnapshot().fields.confirmed).toBe(false)
  })
})
