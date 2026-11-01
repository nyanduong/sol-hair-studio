import { afterEach, expect, it, vi } from 'vitest'
const socket = vi.hoisted(() => ({
  on: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
}))
vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }))
import { watchAvailability } from '../api/availability-live.js'
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('refreshes on reconnect, coalesces bursts and cleans up pending refresh on unmount', () => {
  vi.useFakeTimers()
  const refresh = vi.fn()
  const connection = vi.fn()
  const stop = watchAvailability('http://localhost:4000', 'synthetic', refresh, connection)
  const handlers = Object.fromEntries(socket.on.mock.calls)
  handlers.connect()
  handlers['availability:changed']()
  handlers['availability:changed']()
  vi.advanceTimersByTime(150)
  expect(refresh).toHaveBeenCalledTimes(1)
  handlers.disconnect()
  expect(connection).toHaveBeenLastCalledWith(false)
  handlers.connect()
  vi.advanceTimersByTime(150)
  expect(refresh).toHaveBeenCalledTimes(2)
  handlers['availability:changed']()
  stop()
  vi.runAllTimers()
  expect(refresh).toHaveBeenCalledTimes(2)
  expect(socket.removeAllListeners).toHaveBeenCalledOnce()
  expect(socket.disconnect).toHaveBeenCalledOnce()
})
