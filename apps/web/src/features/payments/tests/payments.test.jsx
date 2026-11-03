import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PaymentView } from '../components/CustomerPayment.jsx'
import { createPaymentReader } from '../hooks/usePayment.js'
const view = value => renderToStaticMarkup(<PaymentView state={{ kind: 'success', value, refresh() {} }} dialogRef={{ current: null }} />)
describe('Customer payment', () => {
  it('offers QR only for completed unpaid appointments, without a customer confirmation action', () => {
    const html = view({ status: 'unpaid', appointmentStatus: 'completed', amountVnd: 250000, transferContent: 'SOL-23456789', qrPath: '/admin-assets/qr/qr-code.jpg' })
    expect(html).toContain('Chưa thanh toán')
    expect(html).toContain('Xem QR chuyển khoản')
    expect(html).toContain('SOL-23456789')
    expect(html).not.toContain('Xác nhận đã nhận tiền')
    expect(view({ status: 'unpaid', appointmentStatus: 'in_progress', amountVnd: 250000 })).not.toContain('Xem QR chuyển khoản')
    expect(view({ status: 'unpaid', appointmentStatus: 'cancelled', amountVnd: 250000 })).toContain('Không có yêu cầu thanh toán')
  })
  it('shows an authoritative receipt without offering transfer again', () => {
    const html = view({ status: 'paid', appointmentStatus: 'completed', amountVnd: 250000, receivedAt: '2026-11-03T10:00:00Z' })
    expect(html).toContain('Đã thanh toán')
    expect(html).toContain('Salon xác nhận nhận tiền')
    expect(html).not.toContain('Xem QR chuyển khoản')
  })
  it('returns the fresh status to the QR opener and retains state during reconciliation', async () => {
    let finish
    const read = vi.fn().mockResolvedValueOnce({ status: 'unpaid' }).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const reader = createPaymentReader(read)
    await reader.load()
    const checking = reader.load()
    expect(reader.getSnapshot()).toMatchObject({ kind: 'success', refreshing: true, value: { status: 'unpaid' } })
    finish({ status: 'paid' })
    expect(await checking).toEqual({ status: 'paid' })
    expect(reader.getSnapshot()).toMatchObject({ value: { status: 'paid' } })
  })
  it('never renders an error as unpaid' , () => {
    const html = renderToStaticMarkup(<PaymentView state={{ kind: 'error', refresh() {} }} />)
    expect(html).toContain('Chưa đọc được trạng thái')
    expect(html).not.toContain('Chưa thanh toán')
  })
  it('ignores stale results and clears a cached receipt on a failed refresh', async () => {
    let finish
    const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce({ status: 'paid' })
    const reader = createPaymentReader(read)
    const first = reader.load()
    await reader.load()
    finish({ status: 'unpaid' }); await first
    expect(reader.getSnapshot()).toMatchObject({ kind: 'success', value: { status: 'paid' } })
    read.mockRejectedValueOnce(new Error('offline'))
    await reader.load()
    expect(reader.getSnapshot().kind).toBe('error')
    expect(reader.getSnapshot()).not.toHaveProperty('value')
  })
})
