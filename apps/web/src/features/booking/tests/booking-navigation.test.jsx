// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useBookingSubmission } from '../hooks/useBookingSubmission.js'
import { createBooking } from '../api/booking.api.js'

vi.mock('../api/booking.api.js', () => ({ createBooking: vi.fn() }))
let root, router, container, state
const payload = { serviceIds: ['cut'], staffId: 'stylist', startAt: '2026-11-02T02:00:00Z' }
function Probe() {
  const submission = useBookingSubmission('synthetic-token')
  useEffect(() => { state = submission })
  return <><Link to="/other">Rời trang</Link><p>{submission.navigationBlocked ? 'blocked' : submission.kind}</p></>
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  router = createMemoryRouter([{path:'/booking',element:<Probe />},{path:'/other',element:<p>Other</p>}], { initialEntries: ['/other', '/booking'], initialIndex: 1 })
  await act(async () => root.render(<RouterProvider router={router} />))
})
afterEach(async () => { await act(async () => root.unmount()); router.dispose(); container.remove() })
async function clickLink() { await act(async () => container.querySelector('a').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0}))) }

it('blocks links and browser Back during submission, keeping the request alive until success', async () => {
  let finish, request
  createBooking.mockImplementation((_base,_token,_body,_key,signal) => { request=signal; return new Promise(resolve => { finish=resolve }) })
  let result
  await act(async () => { result=state.submit(payload) })
  await clickLink()
  expect(router.state.location.pathname).toBe('/booking')
  expect(state.navigationBlocked).toBe(true)
  await act(async () => router.navigate(-1))
  expect(router.state.location.pathname).toBe('/booking')
  expect(request.aborted).toBe(false)
  await act(async () => { finish({id:'saved'}); await result })
  await clickLink()
  expect(router.state.location.pathname).toBe('/other')
})
it('retains exactly the same key and payload on retry after unknown outcome and blocked navigation', async () => {
  createBooking.mockRejectedValueOnce(Object.assign(new Error('lost response'),{status:503})).mockResolvedValueOnce({id:'saved'})
  await act(async () => { await state.submit(payload) })
  await clickLink()
  expect(state.navigationBlocked).toBe(true)
  await act(async () => { await state.submit(state.pending.payload) })
  expect(createBooking.mock.calls[1].slice(2,4)).toEqual(createBooking.mock.calls[0].slice(2,4))
  await clickLink()
  expect(router.state.location.pathname).toBe('/other')
})
it('releases navigation after a definitive conflict', async () => {
  createBooking.mockRejectedValueOnce(Object.assign(new Error('conflict'),{status:409}))
  await act(async () => { await state.submit(payload) })
  expect(state.pending).toBeUndefined()
  await clickLink()
  expect(router.state.location.pathname).toBe('/other')
})
