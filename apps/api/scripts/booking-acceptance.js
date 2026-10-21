import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { seedAcceptanceData } from './booking-acceptance/fixtures.js'
import { startAcceptanceProxy } from './booking-acceptance/proxy.js'
import { connectToDatabase, disconnectFromDatabase } from '../src/config/database.js'
import { prepareBookingStorage } from '../src/modules/appointments/booking.repository.js'
import { AccountModel } from '../src/modules/auth/accounts.model.js'
import { CustomerModel } from '../src/modules/customers/customers.model.js'
import { StaffModel } from '../src/modules/staff/staff.model.js'
import { StaffShiftModel } from '../src/modules/staff/staff-shifts.model.js'
import { ServiceModel } from '../src/modules/services/services.model.js'
import { AppointmentModel } from '../src/modules/appointments/appointments.model.js'
import { AppointmentEventModel } from '../src/modules/appointments/appointment-events.model.js'
import { BookingRequestModel } from '../src/modules/appointments/booking-requests.model.js'

const { values } = parseArgs({
  options: { port: { type: 'string', default: '4012' }, 'evidence-dir': { type: 'string' } },
})
const port = Number(values.port)
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid acceptance port')
// Never read an external DB URI, auth secret or SMTP destination into this harness.
process.env.NODE_ENV = 'test'
process.env.AUTH_SECRET = randomBytes(48).toString('base64url')
process.env.MONGODB_URI = ''
process.env.SMTP_HOST = ''
process.env.SMTP_USER = ''
process.env.SMTP_PASSWORD = ''
process.env.CORS_ORIGIN = 'http://localhost:5178'
const temporary = await mkdtemp(path.join(tmpdir(), 'sol034-'))
const evidence = path.resolve(values['evidence-dir'] ?? path.join(temporary, 'evidence'))
await mkdir(evidence, { recursive: true })
const replica = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  binary: { version: '8.0.17' },
})
let server,
  proxy,
  input,
  stopping = false
const credentialPath = path.join(temporary, 'credentials.json')
async function audit() {
  const appointments = await AppointmentModel.find().lean()
  const data = {
    environment: 'Synthetic acceptance data; actual Express + MongoDB 8.0.17 temporary replica set',
    generatedAt: new Date().toISOString(),
    appointments: appointments.map((a) => ({
      id: String(a._id),
      customerId: String(a.customerId),
      staffId: String(a.staffId),
      bookingMode: a.bookingMode,
      status: a.status,
      startAt: a.startAt,
      endAt: a.endAt,
      confirmedAt: a.confirmedAt,
      occupiedUntil: a.occupiedUntil,
      items: a.items,
      totalPriceVnd: a.totalPriceVnd,
      totalDurationMinutes: a.totalDurationMinutes,
    })),
    events: await AppointmentEventModel.countDocuments(),
    receipts: await BookingRequestModel.countDocuments(),
  }
  await writeFile(path.join(evidence, 'db-audit.json'), JSON.stringify(data, null, 2) + '\n')
  await writeFile(
    path.join(evidence, 'transport.json'),
    JSON.stringify(proxy?.records ?? [], null, 2) + '\n',
  )
}
async function stop() {
  if (stopping) return
  stopping = true
  input?.close()
  try {
    if (proxy) await audit()
  } finally {
    if (proxy) await proxy.close()
    if (server) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    await disconnectFromDatabase()
    await replica.stop()
    await unlink(credentialPath).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
    // Evidence defaults to this directory, so only remove an empty directory.
    await rmdir(temporary).catch((error) => {
      if (error.code !== 'ENOTEMPTY') throw error
    })
  }
}
try {
  await connectToDatabase(replica.getUri('sol034_acceptance'))
  for (const model of [AccountModel, CustomerModel, StaffModel, StaffShiftModel, ServiceModel])
    await model.init()
  await prepareBookingStorage()
  const fixture = await seedAcceptanceData()
  await writeFile(credentialPath, JSON.stringify(fixture), { mode: 0o600 })
  const { app } = await import('../src/app.js')
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  proxy = await startAcceptanceProxy(`http://127.0.0.1:${server.address().port}`, { port })
  console.log(`Acceptance API: ${proxy.url}; Android emulator host: http://10.0.2.2:${port}`)
  console.log(`Temporary credentials file (do not commit): ${credentialPath}`)
  console.log(`Evidence: ${evidence}`)
  console.log('Commands: drop-next, audit, change-catalog, stop. Product routes are unchanged.')
  input = createInterface({ input: process.stdin })
  for await (const line of input) {
    if (line.trim() === 'drop-next') {
      proxy.dropNextResponse()
      console.log('Next successful booking response will be dropped AFTER upstream commit.')
    } else if (line.trim() === 'audit') {
      await audit()
      console.log('Sanitized DB/transport evidence saved.')
    } else if (line.trim() === 'change-catalog') {
      await ServiceModel.updateMany(
        {},
        { $set: { name: 'Changed acceptance catalog', priceVnd: 999000 } },
      )
      await audit()
      console.log('Temporary catalog changed; stored booking snapshots remain unchanged.')
    } else if (line.trim() === 'stop') break
  }
} finally {
  await stop()
}
