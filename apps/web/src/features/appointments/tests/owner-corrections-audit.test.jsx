import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { correctionPayload, sendOwnerCorrection, correctionConflicts } from '../api/owner-corrections.api.js'
import { readOwnerAudit } from '../api/owner-audit.api.js'
import { createOwnerAppointmentCommand } from '../hooks/useOwnerAppointmentCommand.js'
import { createOwnerAppointmentReader, readOwnerAppointmentScope, useOwnerAppointmentRead } from '../hooks/useOwnerAppointments.js'
import { useStylistAppointments } from '../hooks/useStylistAppointments.js'

import { AuthContext } from '../../auth/context/auth-context.js'
import AppRoutes from '../../../routes/AppRoutes.jsx'

vi.mock('../hooks/useOwnerAppointments.js', async original => ({ ...await original(), useOwnerAppointmentRead: vi.fn() }))
vi.mock('../hooks/useStylistAppointments.js', async original => ({ ...await original(), useStylistAppointments: vi.fn() }))
const id = 'aaaaaaaaaaaaaaaaaaaaaaaa', staffId = 'bbbbbbbbbbbbbbbbbbbbbbbb', actorId = 'cccccccccccccccccccccccc'
const now = Date.parse('2026-10-23T03:00:00.000Z')
const owner = { accountId: actorId, status: 'active', roles: ['owner'] }
const item = { id, customerId: 'customer', staffId, revision: 3, status: 'in_progress', startedAt: '2026-10-23T02:55:00.000Z',
  startAt: '2026-10-23T03:00:00.000Z', endAt: '2026-10-23T03:30:00.000Z',
  customerSnapshot: { displayName: 'Khách correction', phone: '+84901234567' }, staffNameSnapshot: 'Stylist An',
  items: [{ serviceId: 'cut', name: 'Cắt snapshot', priceVnd: 150000, durationMinutes: 30 }], totalPriceVnd: 150000, totalDurationMinutes: 30 }
const fields = { reason: '  Bấm nhầm trạng thái  ', confirmed: true, etaLocal: '' }
const payload = operation => ({ expectedRevision: 3, reason: 'Bấm nhầm trạng thái', [operation === 'correct-start' ? 'serviceNotStarted' : 'serviceNotCompleted']: true })
const result = (operation, extra = {}) => {
  const { startedAt, ...base } = item
  return { ...base, revision: 4, status: operation === 'correct-start' ? 'confirmed' : 'in_progress',
    occupiedFrom: item.startAt, occupiedUntil: '2026-10-23T03:40:00.000Z', ...(operation === 'correct-complete' ? { startedAt } : {}), ...extra }
}
const event = (revision = 2, extra = {}) => ({ id: (revision + 1).toString(16).padStart(24, '0'), appointmentId: id, actorId,
  revision, kind: 'corrected', occurredAt: '2026-10-23T03:00:00.000Z', reason: 'Bấm nhầm',
  before: { status: 'completed', completedAt: '2026-10-23T02:59:00.000Z' },
  after: { status: 'in_progress', staffId, estimatedEndAt: '2026-10-23T04:00:00.000Z' }, ...extra })
const page = (items = [event()], cursor = null) => ({ items, pagination: { limit: 20, hasNextPage: Boolean(cursor), nextCursor: cursor } })
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => status < 400 ? { data } : data })
function respond(data, status = 200) { const fetch = vi.fn(async () => response(data, status)); vi.stubGlobal('fetch', fetch); return fetch }
const send = (operation = 'correct-start', body = payload(operation)) => sendOwnerCorrection('https://api.example.test', 'token', id, operation, body, 'correction-key-123456', undefined)
const manager = (operation = 'correct-start', profile = owner) => createOwnerAppointmentCommand({
  readProfile: async () => profile, send: (body, key, signal) => sendOwnerCorrection('https://api.example.test', 'token', id, operation, body, key, signal),
}, () => 'correction-key-123456')
const callbacks = { retry: vi.fn(), loadMore: vi.fn() }
beforeEach(() => {
  vi.mocked(useOwnerAppointmentRead).mockImplementation((_token, kind) => kind === 'detail'
    ? { kind: 'success', value: item, ...callbacks } : kind === 'my-staff'
      ? { kind: 'success', value: { staffId, displayName: 'Owner stylist' }, ...callbacks }
      : kind === 'audit' ? { kind: 'success', items: [event()], ...callbacks } : { kind: 'success', value: [], items: [], ...callbacks })
  const { customerId: _privateId, ...stylistItem } = item
  void _privateId
  vi.mocked(useStylistAppointments).mockReturnValue({ kind: 'success', value: stylistItem, ...callbacks })
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
function route(url, account = owner) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><AuthContext.Provider value={{
    token: 'token', isAuthenticated: true, account, openLoginModal() {}, logout() {},
  }}><AppRoutes /></AuthContext.Provider></MemoryRouter>)
}

describe('Owner correction payload', () => {
  it.each(['correct-start', 'correct-complete'])('allows only %s transition and preserves original booking', operation => {
    const appointment = { ...item, status: operation === 'correct-start' ? 'in_progress' : 'completed' }
    const before = structuredClone(appointment)
    expect(correctionPayload(appointment, operation, fields, now)).toEqual(payload(operation))
    expect(appointment).toEqual(before)
  })
  it.each(['confirmed', 'cancelled', 'no_show'])('never restores %s or accepts an arbitrary target', status => {
    for (const operation of ['correct-start', 'correct-complete', 'cancel']) expect(() => correctionPayload({ ...item, status }, operation, fields, now)).toThrow()
  })
  it.each(['', '   ', 'x'.repeat(501), null])('requires a valid reason %j', reason => {
    expect(() => correctionPayload(item, 'correct-start', { ...fields, reason }, now)).toThrow()
  })
  it('requires explicit confirmation and a matching safe revision', () => {
    expect(() => correctionPayload(item, 'correct-start', { ...fields, confirmed: false }, now)).toThrow()
    for (const revision of [-1, 1.5, Number.MAX_SAFE_INTEGER]) expect(() => correctionPayload({ ...item, revision }, 'correct-start', fields, now)).toThrow()
    expect(() => correctionPayload({ ...item, status: 'completed' }, 'correct-start', fields, now)).toThrow()
  })
  it('requires ETA when planned end is at/past now and accepts optional future ETA before that boundary', () => {
    const completed = { ...item, status: 'completed' }
    expect(() => correctionPayload(completed, 'correct-complete', fields, Date.parse(item.endAt))).toThrow('ETA')
    expect(() => correctionPayload(completed, 'correct-complete', fields, Date.parse(item.endAt) + 1)).toThrow('ETA')
    expect(correctionPayload(completed, 'correct-complete', { ...fields, etaLocal: '2026-10-23T11:00' }, now))
      .toEqual({ ...payload('correct-complete'), estimatedEndAt: '2026-10-23T04:00:00.000Z' })
  })
  it.each(['2026-10-23T10:00', '2026-10-23T10:30', 'bad', '2026-02-30T12:00'])('rejects invalid correction ETA %s', etaLocal => {
    expect(() => correctionPayload({ ...item, status: 'completed' }, 'correct-complete', { ...fields, etaLocal }, now)).toThrow()
  })
})

describe('Correction HTTP, conflicts and uncertain outcomes', () => {
  it.each(['correct-start', 'correct-complete'])('uses exact %s contract and scoped DTO', async operation => {
    const fetch = respond(result(operation))
    expect(await send(operation)).toMatchObject({ id, revision: 4, status: operation === 'correct-start' ? 'confirmed' : 'in_progress' })
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/appointments/' + id + '/' + operation)
    expect(request.headers.get('Idempotency-Key')).toBe('correction-key-123456')
    expect(JSON.parse(request.body)).toEqual(payload(operation))
  })
  it('accepts correct-complete ETA without inventing impact absent from its contract', async () => {
    const eta = '2026-10-23T04:00:00.000Z'
    respond(result('correct-complete', { estimatedEndAt: eta, occupiedUntil: '2026-10-23T04:10:00.000Z' }))
    const value = await send('correct-complete', { ...payload('correct-complete'), estimatedEndAt: eta })
    expect(value.estimatedEndAt).toBe(eta)
    expect(value).not.toHaveProperty('affectedAppointments')
    expect(value).not.toHaveProperty('completedAt')
  })
  it('preserves CORRECTION_CONFLICT details through the shared HTTP helper', async () => {
    const details = { shiftConflict: true, timeOffConflicts: [{ startAt: item.startAt, endAt: item.endAt }],
      conflictingAppointments: [{ id: actorId, startAt: item.startAt, endAt: item.endAt, reasons: ['staff_overlap'], email: 'hidden' }] }
    respond({ code: 'CORRECTION_CONFLICT', details }, 409)
    let error
    try { await send() } catch (caught) { error = caught }
    expect(error).toMatchObject({ status: 409, code: 'CORRECTION_CONFLICT', details })
    expect(JSON.stringify(correctionConflicts(error.details))).not.toContain('hidden')
    expect(correctionConflicts({ shiftConflict: true })).toBeNull()
  })
  it.each([400, 401, 403, 404, 409])('preserves known HTTP %s and clears uncertain intent', async status => {
    respond({ code: 'APPOINTMENT_REVISION_CONFLICT' }, status)
    const command = manager()
    await expect(command.run(payload('correct-start'))).rejects.toMatchObject({ status, uncertain: false })
    expect(command.getPending()).toBeUndefined()
  })
  it('deduplicates double-submit and retries original body/key after network failure', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(response(result('correct-start')))
    vi.stubGlobal('fetch', fetch)
    const command = manager(), body = payload('correct-start')
    await expect(command.run(body)).rejects.toMatchObject({ uncertain: true })
    await expect(command.run({ ...body, reason: 'Changed intent' })).rejects.toThrow()
    const first = command.run(body), duplicate = command.run(body)
    await Promise.all([first, duplicate])
    expect(fetch.mock.calls).toHaveLength(2)
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body)
    expect(fetch.mock.calls[0][1].headers.get('Idempotency-Key')).toBe(fetch.mock.calls[1][1].headers.get('Idempotency-Key'))
  })
  it('rechecks Owner role before posting', async () => {
    const fetch = respond(result('correct-start'))
    for (const roles of [['customer'], ['stylist']]) await expect(manager('correct-start', { ...owner, roles }).run(payload('correct-start'))).rejects.toMatchObject({ status: 403 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects arbitrary states/extra fields and malformed success instead of reporting completion', async () => {
    const fetch = respond(result('correct-start', { revision: 3 }))
    await expect(send('cancel')).rejects.toThrow()
    await expect(send('correct-start', { ...payload('correct-start'), status: 'confirmed' })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
    const command = manager()
    await expect(command.run(payload('correct-start'))).rejects.toMatchObject({ uncertain: true })
  })
})

describe('Audit HTTP and read lifecycle', () => {
  it('loads real audit pages with Bearer/cursor, stripping fields not in the contract', async () => {
    const fetch = respond(page([event(2, { email: 'hidden', actorName: 'invented' })], 'cursor-1'))
    const value = await readOwnerAudit('https://api.example.test', 'token', id, 'previous')
    expect(value.items[0]).toMatchObject({ actorId, kind: 'corrected', reason: 'Bấm nhầm' })
    expect(JSON.stringify(value)).not.toContain('hidden')
    expect(JSON.stringify(value)).not.toContain('invented')
    const [url, request] = fetch.mock.calls[0]
    expect(new URL(url).pathname).toBe('/api/appointments/' + id + '/audit')
    expect(new URL(url).searchParams.get('cursor')).toBe('previous')
    expect(request.headers.get('Authorization')).toBe('Bearer token')
    expect(request.method).toBeUndefined()
  })
  it.each([
    page([event(1), event(2)]), page([event(2), event(2)]), page([event(2, { appointmentId: actorId })]),
    page([event(2, { occurredAt: 'bad' })]), page([event(2, { kind: 'invented' })]),
    page([event(2, { after: { status: 'paid' } })]),
  ])('rejects invalid or wrong-appointment audit data', async data => {
    respond(data)
    await expect(readOwnerAudit('https://api.example.test', 'token', id)).rejects.toThrow()
  })
  it.each([401, 403, 404, 503])('does not fabricate an empty history on HTTP %s', async status => {
    respond({ code: 'FORBIDDEN' }, status)
    await expect(readOwnerAudit('https://api.example.test', 'token', id)).rejects.toMatchObject({ status })
  })
  it('requires a valid ID before querying', async () => {
    const fetch = respond(page())
    await expect(readOwnerAudit('https://api.example.test', 'token', '../bad')).rejects.toMatchObject({ status: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('keeps old service events while refresh adds a real correction, deduplicating pages and rejecting repeated cursors', async () => {
    const read = vi.fn().mockResolvedValueOnce(page([event(2)], 'cursor-1'))
      .mockResolvedValueOnce(page([event(1, { kind: 'completed' }), event(0, { kind: 'started' })]))
      .mockResolvedValueOnce(page([event(3), event(2)], 'cursor-1'))
      .mockResolvedValueOnce(page([event(1)], 'cursor-1'))
    const reader = createOwnerAppointmentReader({ readProfile: async () => owner, readData: read, paginated: true })
    await reader.load(); await reader.load(true)
    expect(reader.getSnapshot().items.map(item => item.kind)).toEqual(['corrected', 'completed', 'started'])
    await reader.retry()
    expect(reader.getSnapshot().items.map(item => item.revision)).toEqual([3, 2])
    await reader.load(true)
    expect(reader.getSnapshot()).toMatchObject({ kind: 'error', restartRequired: true })
  })
  it('ignores stale audit response after leaving the account or appointment', async () => {
    let finish
    const reader = createOwnerAppointmentReader({ readProfile: async () => owner,
      readData: () => new Promise(resolve => { finish = resolve }), paginated: true })
    const job = reader.load()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    reader.cancel()
    finish(page())
    await job
    expect(reader.getSnapshot()).toMatchObject({ kind: 'loading', items: [] })
  })
  it('uses Owner-only audit scope and blocks a non-Owner despite cached UI permissions', async () => {
    const fetch = respond(page())
    await expect(readOwnerAppointmentScope({ baseUrl: 'https://api.example.test', token: 'token', kind: 'audit', query: { id }, profile: { ...owner, roles: ['stylist'] } })).rejects.toMatchObject({ status: 403 })
    expect(fetch).not.toHaveBeenCalled()
    await readOwnerAppointmentScope({ baseUrl: 'https://api.example.test', token: 'token', kind: 'audit', query: { id }, profile: owner })
    expect(fetch).toHaveBeenCalledOnce()
  })
})

describe('Owner correction and audit UI', () => {

  it('keeps the administrative audit reader hidden in Stylist detail', () => {
    const staff = route('/nhan-vien/lich-hen/' + id, { ...owner, roles: ['stylist'] })
    expect(staff).not.toContain('Lịch sử thao tác')
  })

})
