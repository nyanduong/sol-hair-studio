import { createServer } from 'node:http'
import { once } from 'node:events'
import express from 'express'
import { io as client } from 'socket.io-client'
import { afterEach, expect, it } from 'vitest'
import { attachBookingRealtime, availabilityInvalidation } from '../availability.realtime.js'

let realtime
let sockets = []
afterEach(async () => {
  sockets.forEach((socket) => socket.disconnect())
  sockets = []
  if (realtime) await new Promise((resolve) => realtime.close(resolve))
})

async function setup() {
  const app = express()
  app.use(availabilityInvalidation)
  app.post('/api/appointments', (req, res) => res.sendStatus(req.query.fail ? 409 : 201))
  app.post('/api/staff/a/shifts', (req, res) => res.sendStatus(201))
  const server = createServer(app)
  realtime = attachBookingRealtime(server, app, {
    authenticateSocket: async (token) => {
      if (token !== 'synthetic') throw new Error('invalid')
      return { roles: ['customer'] }
    },
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`
  const connect = (token) => {
    const socket = client(url, { auth: { token }, autoConnect: false, reconnection: false })
    sockets.push(socket)
    return socket
  }
  return { url, connect }
}

it('rejects an unauthenticated socket', async () => {
  const { connect } = await setup()
  const socket = connect('invalid')
  const denied = once(socket, 'connect_error')
  socket.connect()
  expect((await denied)[0].message).toContain('đăng nhập')
  expect(realtime.engine.clientsCount).toBeLessThanOrEqual(1)
  expect(socket.connected).toBe(false)
})

it('invalidates both clients only after successful HTTP writes, with no private payload', async () => {
  const { url, connect } = await setup()
  const a = connect('synthetic')
  const b = connect('synthetic')
  const connections = [once(a, 'connect'), once(b, 'connect')]
  a.connect()
  b.connect()
  await Promise.all(connections)
  let count = 0
  a.on('availability:changed', () => count++)
  const signals = [once(a, 'availability:changed'), once(b, 'availability:changed')]
  expect((await fetch(`${url}/api/appointments?fail=1`, { method: 'POST' })).status).toBe(409)
  expect((await fetch(`${url}/api/appointments`, { method: 'POST' })).status).toBe(201)
  expect(await Promise.all(signals)).toEqual([[], []])
  expect(count).toBe(1)
  const shiftSignal = once(b, 'availability:changed')
  await fetch(`${url}/api/staff/a/shifts`, { method: 'POST' })
  expect(await shiftSignal).toEqual([])
})
