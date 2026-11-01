// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import CustomerAppointmentList from '../components/CustomerAppointmentList.jsx'

it('moves a due confirmed card into the separate tab and retains detail/support actions', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  const start = Date.parse('2026-11-02T02:00:00Z')
  vi.setSystemTime(start - 1)
  const appointment = {id:'due',status:'confirmed',startAt:new Date(start).toISOString(),endAt:'2026-11-02T03:00:00Z',items:[{name:'Cắt tóc'}],staffNameSnapshot:'An',totalPriceVnd:100000,totalDurationMinutes:60}
  const container=document.createElement('div');document.body.append(container)
  const root=createRoot(container)
  try {
    await act(async () => root.render(<MemoryRouter><CustomerAppointmentList state={{kind:'success',items:[appointment],hasNextPage:false}} onLogin={() => {}} /></MemoryRouter>))
    expect(container.querySelector('a[href="/lich-cua-toi/due"]')).not.toBeNull()
    await act(async () => vi.advanceTimersByTime(1))
    expect(container.querySelector('a[href="/lich-cua-toi/due"]')).toBeNull()
    await act(async () => [...container.querySelectorAll('button')].find(b=>b.textContent.includes('Đến/quá giờ')).click())
    expect(container.textContent).toContain('tiệm chưa cập nhật kết quả')
    expect(container.textContent).toContain('Đã xác nhận')
    expect(container.querySelector('a[href="/lich-cua-toi/due"]')).not.toBeNull()
    expect(container.querySelector('a[href="tel:19006828"]')).not.toBeNull()
    expect(container.querySelector('a[href*="action=reschedule"]')).toBeNull()
    expect(appointment.status).toBe('confirmed')
  } finally { await act(async () => root.unmount());container.remove();vi.useRealTimers() }
})
