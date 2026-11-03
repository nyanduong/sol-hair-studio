// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import BookingPage from '../pages/BookingPage.jsx'
import { AuthContext } from '../../auth/context/auth-context.js'
import { readBookingData, updateBookingProfile } from '../api/booking.api.js'
import { bookingDateRange } from '../booking-date.js'

vi.mock('../api/booking.api.js', () => ({ readBookingData: vi.fn(), updateBookingProfile: vi.fn(), createBooking: vi.fn() }))
vi.mock('../api/availability-live.js', () => ({ watchAvailability: () => () => {} }))
vi.mock('../../services/hooks/useServices.js', () => ({ useServices: () => ({state:{kind:'success',data:[{id:'cut',name:'Cắt',category:'Tóc',priceVnd:100000,durationMinutes:{min:60,max:60}}]},retry(){}}) }))
let root, router, container, profile
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve,30)) })
const button = text => [...container.querySelectorAll('button')].find(el => el.textContent.trim() === text)
const click = el => act(async () => { el.click() })
function setInput(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value)
  input.dispatchEvent(new Event('input',{bubbles:true}))
  input.dispatchEvent(new Event('change',{bubbles:true}))
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  profile = {roles:['customer'],status:'active',customer:{displayName:'QA',phone:''}}
  readBookingData.mockImplementation(async (_base,_token,kind) => kind === 'profile' ? profile : {items:[{serviceId:'cut',priceVnd:100000}],totalPriceVnd:100000,totalDurationMinutes:60,stylists:[{staffId:'an',displayName:'Stylist An',slots:[{startAt:'2026-11-02T02:00:00Z',endAt:'2026-11-02T03:00:00Z'}]}]})
  updateBookingProfile.mockImplementation(async (_base,_token,input) => { profile={...profile,customer:input}; return profile })
  container = document.createElement('div'); document.body.append(container); root=createRoot(container)
  const account={id:'qa',roles:['customer'],status:'active'}
  router=createMemoryRouter([{path:'*',element:<AuthContext.Provider value={{token:'synthetic-token',account,isAuthenticated:true,logout(){},openLoginModal(){}}}><BookingPage /></AuthContext.Provider>}],{initialEntries:['/booking?serviceId=cut']})
  await act(async () => root.render(<RouterProvider router={router} />))
  await settle(); await settle()
})
afterEach(async () => { await act(async () => root.unmount()); router.dispose(); container.remove() })
it('collects contact in step one and reaches confirmation without selecting a slot twice', async () => {
  const phone=container.querySelector('input[type="tel"]')
  expect(phone.closest('section').hidden).toBe(false)
  expect(button('Tiếp tục chọn giờ →').disabled).toBe(true)
  await act(async () => setInput(phone,'0912345678'))
  await click(button('Lưu thông tin')); await settle(); await settle()
  expect(updateBookingProfile.mock.calls[0][2]).toEqual({displayName:'QA',phone:'+84912345678'})
  expect(container.querySelector('[aria-current="step"]').textContent).toContain('Dịch vụ')
  await click(button('Tiếp tục chọn giờ →'))
  await click(button('Stylist An'))
  await click(button('09:00'))
  await click(button('Kiểm tra cuộc hẹn →'))
  expect(button('Xác nhận đặt lịch').disabled).toBe(false)
  expect(container.textContent).toContain('+84912345678')
})
it('bounds the date picker and does not send an out-of-range date to availability', async () => {
  const date=container.querySelector('input[type="date"]')
  const range=bookingDateRange()
  expect(date.min).toBe(range.min); expect(date.max).toBe(range.max)
  const before=readBookingData.mock.calls.length
  await act(async () => setInput(date,'2099-01-01')); await settle()
  expect(date.value).toBe(range.min)
  expect(container.textContent).toContain('Chọn ngày từ hôm nay đến tối đa 7 ngày tới')
  expect(readBookingData.mock.calls.length).toBe(before)
})
it('explains no suitable slot and suggests changing day, stylist or services', async () => {
  readBookingData.mockImplementation(async (_base,_token,kind) => kind === 'profile' ? profile : {items:[],stylists:[{staffId:'an',displayName:'Stylist An',slots:[]}]})
  await click(button('Tải lại giờ trống')); await settle()
  await click(button('Stylist An'))
  expect(container.textContent).toContain('đổi ngày, đổi stylist hoặc giảm dịch vụ')
  expect(container.textContent).toContain('Giờ trùng với lịch hẹn hiện có của bạn')
})
