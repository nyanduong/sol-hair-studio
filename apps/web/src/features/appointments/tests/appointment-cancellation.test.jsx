import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CustomerAppointmentManagement, { CancellationDialog } from '../components/CustomerAppointmentManagement.jsx'
import CustomerAppointmentList from '../components/CustomerAppointmentList.jsx'
import CustomerAppointmentDetail from '../components/CustomerAppointmentDetail.jsx'
import { assertCustomerAppointmentEditable, createAppointmentCommand } from '../hooks/useAppointmentCommand.js'
import { sendAppointmentCommand } from '../api/appointments.api.js'
import { createCustomerAppointmentDetail } from '../hooks/useCustomerAppointmentDetail.js'
import { createCustomerAppointmentList } from '../hooks/useCustomerAppointments.js'

const now = Date.parse('2026-10-23T03:00:00.000Z')
const customer = { roles: ['customer'], status: 'active' }
const appointment = {
  id: '1234567890abcdef12345678', staffId: 'aaaaaaaaaaaaaaaaaaaaaaaa', revision: 3, status: 'confirmed',
  startAt: new Date(now + 7200000).toISOString(), endAt: new Date(now + 10800000).toISOString(),
  staffNameSnapshot: 'Stylist An', totalDurationMinutes: 60, totalPriceVnd: 150000,
  items: [{ serviceId: 'cut', name: 'Cắt tóc', durationMinutes: 40, priceVnd: 100000 },
    { serviceId: 'wash', name: 'Gội đầu', durationMinutes: 20, priceVnd: 50000 }],
}
const cancelled = { ...appointment, status: 'cancelled', revision: 4, cancelledAt: new Date(now).toISOString() }
const callbacks = { onConfirm() {}, onClose() {}, onReload() {} }
const renderDialog = (command = { kind: 'idle', locked: false }, editable = true) =>
  renderToStaticMarkup(<CancellationDialog appointment={appointment} command={command} editable={editable} {...callbacks} />)
const confirmDisabled = html => /<button[^>]*disabled=""[^>]*>Xác nhận hủy lịch<\/button>/.test(html)
const page = item => ({ items: [item], pagination: { hasNextPage: false, nextCursor: null } })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Customer cancellation confirmation', () => {
  it('identifies the exact appointment, Vietnam time, stylist and all services without requiring a reason', () => {
    const html = renderDialog()
    for (const text of [appointment.id, '23/10/2026', '12:00', 'Stylist An', 'Cắt tóc', 'Gội đầu', 'không thể mở lại']) {
      expect(html).toContain(text)
    }
    expect(html).toContain('aria-describedby="appointment-cancel-description"')
    expect(html).not.toContain('<textarea')
    expect(confirmDisabled(html)).toBe(false)
  })
  it('disables confirmation and closing while submitting', () => {
    const html = renderDialog({ kind: 'loading', locked: true, pending: { payload: { expectedRevision: 3 } } })
    expect(html).toContain('disabled="">Đang xử lý…')
    expect(html).toContain('disabled="">Quay lại')
    expect(html).not.toContain('Đã hủy lịch hẹn')
  })
  it.each([
    ['CANCELLATION_CUTOFF', 'theo giờ hệ thống'],
    ['APPOINTMENT_REVISION_CONFLICT', 'Lịch đã được cập nhật'],
    ['APPOINTMENT_STATE_CONFLICT', 'Trạng thái lịch đã thay đổi'],
    ['COMMAND_KEY_CONFLICT', 'Yêu cầu này không còn phù hợp'],
  ])('shows actionable %s without resubmitting a rejected revision', (code, message) => {
    const html = renderDialog({ kind: 'error', locked: false, error: { status: 409, code } })
    expect(html).toContain(message)
    expect(html).toContain('Tải lại lịch')
    expect(confirmDisabled(html)).toBe(true)
    expect(html).not.toContain('Đã hủy lịch hẹn')
  })
  it.each([401, 403, 404])('blocks re-confirmation after HTTP %s', status => {
    const html = renderDialog({ kind: 'error', locked: false, error: { status } })
    expect(html).toContain('Phiên đăng nhập hoặc quyền truy cập')
    expect(confirmDisabled(html)).toBe(true)
  })
  it('keeps an unknown network outcome locked but permits retry of the same request even after cutoff', () => {
    const html = renderDialog({ kind: 'error', locked: true, pending: { payload: { expectedRevision: 3 } }, error: new Error('offline') }, false)
    expect(html).toContain('Chưa xác định được kết quả')
    expect(html).toContain('disabled="">Quay lại')
    expect(html).toContain('>Thử lại cùng yêu cầu</button>')
    expect(html).not.toContain('disabled="">Thử lại cùng yêu cầu')
    expect(html).not.toContain('Đã hủy lịch hẹn')
  })
  it.each([0, 1])('allows exact cutoff, blocks one millisecond later (%s)', offset => {
    vi.useFakeTimers(); vi.setSystemTime(now + offset)
    const html = renderToStaticMarkup(<CustomerAppointmentManagement token="fixture" appointment={appointment} initialAction="cancel" />)
    expect(confirmDisabled(html)).toBe(offset > 0)
    if (offset === 0) expect(() => assertCustomerAppointmentEditable(appointment)).not.toThrow()
    else expect(() => assertCustomerAppointmentEditable(appointment)).toThrow()
  })
  it.each(['in_progress', 'completed', 'cancelled', 'no_show'])('rejects %s even via a direct cancel URL', status => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    const value = { ...appointment, status }
    const html = renderToStaticMarkup(<CustomerAppointmentManagement token="fixture" appointment={value} initialAction="cancel" />)
    expect(confirmDisabled(html)).toBe(true)
    expect(() => assertCustomerAppointmentEditable(value)).toThrow()
  })
})

describe('Customer cancellation command and refreshed reads', () => {
  it('deduplicates a double-submit against the actual HTTP adapter and preserves the revision/key', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: cancelled }) })
    vi.stubGlobal('fetch', fetch)
    const send = (body, key) => sendAppointmentCommand('https://api.example.test', 'customer-token', appointment.id, 'cancel', body, key)
    const manager = createAppointmentCommand(send, () => 'cancel-intent-key')
    const first = manager.run({ expectedRevision: 3 })
    expect(manager.run({ expectedRevision: 3 })).toBe(first)
    await expect(first).resolves.toEqual(cancelled)
    expect(fetch).toHaveBeenCalledOnce()
    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/appointments/' + appointment.id + '/cancel')
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body)).toEqual({ expectedRevision: 3 })
    expect(request.headers.get('Idempotency-Key')).toBe('cancel-intent-key')
    expect(request.headers.get('Authorization')).toBe('Bearer customer-token')
  })
  it('retries a network failure with identical key and body, without treating it as success', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: cancelled }) })
    vi.stubGlobal('fetch', fetch)
    const manager = createAppointmentCommand((body, key) =>
      sendAppointmentCommand('https://api.example.test', 'token', appointment.id, 'cancel', body, key), () => 'stable-key')
    await expect(manager.run({ expectedRevision: 3 })).rejects.toMatchObject({ uncertain: true })
    expect(manager.getPending().payload).toEqual({ expectedRevision: 3 })
    await expect(manager.run({ expectedRevision: 3 })).resolves.toEqual(cancelled)
    expect(fetch.mock.calls[1][1].headers.get('Idempotency-Key')).toBe(fetch.mock.calls[0][1].headers.get('Idempotency-Key'))
    expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body)
  })
  it.each([[403, 'FORBIDDEN'], [404, 'APPOINTMENT_NOT_FOUND'], [409, 'CANCELLATION_CUTOFF'], [409, 'APPOINTMENT_REVISION_CONFLICT']])(
    'preserves HTTP %s / %s and does not create a success result', async (status, code) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ code }) }))
      const manager = createAppointmentCommand((body, key) =>
        sendAppointmentCommand('https://api.example.test', 'token', appointment.id, 'cancel', body, key), () => 'key')
      await expect(manager.run({ expectedRevision: 3 })).rejects.toMatchObject({ status, code, uncertain: false })
      expect(manager.getPending()).toBeUndefined()
    })
  it('refreshes cancelled detail and list, removes actions and ignores an older confirmed response', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    let resolveOld
    const old = new Promise(resolve => { resolveOld = resolve })
    const readDetail = vi.fn().mockImplementationOnce(() => old).mockResolvedValue(cancelled)
    const detail = createCustomerAppointmentDetail({ readProfile: async () => customer, readDetail })
    const oldLoad = detail.load()
    await vi.waitFor(() => expect(readDetail).toHaveBeenCalledOnce())
    await detail.load()
    resolveOld(appointment)
    await oldLoad
    expect(detail.getSnapshot()).toMatchObject({ kind: 'success', value: cancelled })

    const readPage = vi.fn().mockResolvedValueOnce(page(appointment)).mockResolvedValueOnce(page(cancelled))
    const list = createCustomerAppointmentList({ readProfile: async () => customer, readPage })
    await list.load()
    await list.load()
    expect(list.getSnapshot().items).toEqual([cancelled])
    const listHtml = renderToStaticMarkup(<MemoryRouter><CustomerAppointmentList state={list.getSnapshot()} /></MemoryRouter>)
    const detailHtml = renderToStaticMarkup(<CustomerAppointmentDetail state={detail.getSnapshot()} />)
    const actionsHtml = renderToStaticMarkup(<CustomerAppointmentManagement token="fixture" appointment={detail.getSnapshot().value} />)
    expect(listHtml).not.toContain('action=cancel')
    expect(detailHtml).toContain('Đã hủy')
    expect(actionsHtml).not.toContain('>Hủy lịch hẹn</button>')
  })
})
