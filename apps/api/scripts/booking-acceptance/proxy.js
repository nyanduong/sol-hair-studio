import { createHash } from 'node:crypto'
import { createServer, request } from 'node:http'

const digest = (value) => createHash('sha256').update(value).digest('hex')

// Acceptance-only transport fault. Every business response comes from the real API.
// No test control endpoint or fault switch is installed in the product server.
export async function startAcceptanceProxy(target, { port = 0 } = {}) {
  const records = []
  let drops = 0
  const sockets = new Set()
  const server = createServer((incoming, outgoing) => {
    const chunks = []
    incoming.on('data', (chunk) => chunks.push(chunk))
    incoming.on('end', () => {
      const body = Buffer.concat(chunks)
      const booking = incoming.method === 'POST' && incoming.url === '/api/appointments'
      const drop = booking && drops > 0
      if (drop) drops--
      let payload
      try {
        payload = JSON.parse(body.toString())
      } catch {
        /* Forward malformed bodies unchanged. */
      }
      const record = booking
        ? {
            requestHash: digest(body),
            keyHash: digest(incoming.headers['idempotency-key'] ?? ''),
            hasStartAt: payload != null && Object.hasOwn(payload, 'startAt'),
            responseDropped: false,
          }
        : null
      const upstream = request(
        new URL(incoming.url, target),
        {
          method: incoming.method,
          headers: { ...incoming.headers, host: new URL(target).host },
        },
        (response) => {
          const responseChunks = []
          response.on('data', (chunk) => responseChunks.push(chunk))
          response.on('end', () => {
            const data = Buffer.concat(responseChunks)
            if (record) {
              record.status = response.statusCode
              try {
                record.appointmentId = JSON.parse(data.toString()).data?.id
              } catch {
                /* Preserve HTTP behavior even when upstream is not JSON. */
              }
              records.push(record)
            }
            // Drop only after an actual successful commit response has arrived.
            if (drop && response.statusCode >= 200 && response.statusCode < 300) {
              record.responseDropped = true
              outgoing.destroy()
              return
            }
            outgoing.writeHead(response.statusCode, response.headers)
            outgoing.end(data)
          })
          response.on('error', () => outgoing.destroy())
        },
      )
      upstream.on('error', () => outgoing.destroy())
      upstream.end(body)
    })
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    records,
    dropNextResponse() {
      drops++
    },
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
