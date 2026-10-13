// Offline documentation checker. No app imports, environment reads or DB access.
import assert from 'node:assert/strict'
import { readFile, readdir, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const collections = ['services', 'accounts', 'auth_challenges', 'customers', 'staff', 'staff_shifts', 'staff_time_off', 'appointments', 'booking_requests', 'appointment_events', 'images']
const blocking = new Set(['confirmed', 'in_progress', 'completed'])
const stampFields = ['_id', 'createdAt', 'updatedAt']
const keys = (v, required, optional = []) => {
  assert(v && typeof v === 'object' && !Array.isArray(v), 'expected object')
  required.forEach(k => assert(Object.hasOwn(v, k), `missing ${k}`))
  Object.keys(v).forEach(k => assert([...required, ...optional].includes(k), `unknown field ${k}`))
  Object.values(v).forEach(x => assert(x !== null, 'null is not allowed'))
}
const str = (v, max = 120, min = 1) => assert(typeof v === 'string' && v === v.trim() && v.length >= min && v.length <= max, 'invalid string')
const int = (v, min, max, step = 1) => assert(Number.isSafeInteger(v) && v >= min && v <= max && v % step === 0, 'invalid integer/range/grid')
const bool = v => assert.equal(typeof v, 'boolean')
const oid = v => { keys(v, ['$oid']); assert.match(v.$oid, /^[0-9a-f]{24}$/); return v.$oid }
const time = v => {
  keys(v, ['$date'])
  assert.match(v.$date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  const t = Date.parse(v.$date)
  assert(Number.isFinite(t) && new Date(t).toISOString() === v.$date, 'invalid date')
  return t
}
const phone = v => { str(v, 16); assert.match(v, /^\+[1-9][0-9]{7,14}$/) }
const slug = (v, max) => { str(v, max); assert.match(v, /^[a-z0-9]+(?:-[a-z0-9]+)*$/) }
const arr = (v, min, max) => assert(Array.isArray(v) && v.length >= min && v.length <= max, 'invalid array bound')
const unique = v => assert.equal(new Set(v).size, v.length, 'duplicate value')
const overlaps = (a, b, c, d) => a < d && b > c
const local = t => {
  // v1 only: Asia/Ho_Chi_Minh, UTC+07. Not a generic DST conversion helper.
  const d = new Date(t + 7 * 3600000)
  return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() || 7, minute: d.getUTCHours() * 60 + d.getUTCMinutes() }
}

function validate(data) {
  const maps = {}
  for (const name of collections) {
    arr(data[name], 1, 100)
    unique(data[name].map(v => oid(v._id)))
    maps[name] = new Map(data[name].map(v => [oid(v._id), v]))
    for (const doc of data[name]) assert(time(doc.createdAt) <= time(doc.updatedAt), `${name}: timestamp order`)
  }
  const ref = (name, id) => {
    const doc = maps[name].get(oid(id))
    assert(doc, `dangling reference to ${name}`)
    return doc
  }
  const serviceMap = new Map(data.services.map(s => [s.id, s]))
  unique(data.services.map(s => s.id)); unique(data.services.map(s => s.slug))
  for (const s of data.services) {
    keys(s, [...stampFields, 'id', 'slug', 'name', 'description', 'category', 'durationMinutes', 'bookingDurationMinutes', 'priceVnd', 'coverImageId', 'isActive', 'displayOrder'], ['__v', 'images'])
    slug(s.id, 80); slug(s.slug, 120); str(s.name); str(s.description, 2000); str(s.category, 80)
    keys(s.durationMinutes, ['min', 'max'])
    int(s.durationMinutes.min, 1, 480); int(s.durationMinutes.max, s.durationMinutes.min, 480)
    int(s.bookingDurationMinutes, s.durationMinutes.min, s.durationMinutes.max)
    int(s.priceVnd, 0, 100000000); int(s.displayOrder, 0, 100000); bool(s.isActive)
    if (s.__v !== undefined) int(s.__v, 0, Number.MAX_SAFE_INTEGER)
    if (s.images) {
    arr(s.images, 1, 10)
    unique(s.images.map(i => oid(i.imageId)))
    for (const i of s.images) {
      keys(i, ['imageId'], ['alt']); ref('images', i.imageId)
      if (i.alt !== undefined) str(i.alt, 200)
    }
    ref('images', s.coverImageId)
    assert(s.images.some(i => oid(i.imageId) === oid(s.coverImageId)), 'cover must belong to gallery')
    }
  }

  unique(data.accounts.map(a => a.emailNormalized))
  for (const a of data.accounts) {
    keys(a, [...stampFields, 'emailNormalized', 'roles', 'status', 'authRevision'], ['passwordHash', 'emailVerifiedAt'])
    str(a.emailNormalized, 254); assert.match(a.emailNormalized, /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    assert.equal(a.emailNormalized, a.emailNormalized.toLowerCase())
    arr(a.roles, 1, 3); unique(a.roles); a.roles.forEach(r => assert(['customer', 'stylist', 'owner'].includes(r)))
    assert(['pending_verification', 'pending_password', 'active', 'disabled'].includes(a.status))
    int(a.authRevision, 0, Number.MAX_SAFE_INTEGER)
    if (a.passwordHash !== undefined) str(a.passwordHash, 255, 20)
    if (a.emailVerifiedAt) assert(time(a.emailVerifiedAt) <= time(a.updatedAt))
    if (['active', 'pending_password'].includes(a.status)) assert(a.emailVerifiedAt, 'verified account required')
    if (a.status === 'active') assert(a.passwordHash, 'active account needs password')
    if (a.status === 'pending_verification' && a.roles.includes('customer')) assert(a.passwordHash, 'signup needs password hash')
    if (a.status === 'pending_password') assert(a.roles.some(r => ['stylist', 'owner'].includes(r)), 'staff activation state')
  }
  unique(data.auth_challenges.map(c => oid(c.accountId) + ':' + c.purpose))
  for (const c of data.auth_challenges) {
    keys(c, [...stampFields, 'accountId', 'purpose', 'generation', 'codeDigest', 'issuedAt', 'expiresAt', 'resendAvailableAt', 'failedAttempts'], ['consumedAt', 'verifiedAt', 'grantDigest', 'grantExpiresAt', 'grantConsumedAt'])
    const a = ref('accounts', c.accountId)
    assert(['activate_customer', 'activate_staff', 'reset_password'].includes(c.purpose))
    if (c.purpose === 'activate_customer') assert(a.roles.includes('customer'))
    if (c.purpose === 'activate_staff') assert(a.roles.some(r => ['stylist', 'owner'].includes(r)))
    int(c.generation, 1, Number.MAX_SAFE_INTEGER); str(c.codeDigest, 255, 20)
    int(c.failedAttempts, 0, 5)
    const issued = time(c.issuedAt), expires = time(c.expiresAt)
    assert.equal(expires - issued, 300000); assert.equal(time(c.resendAvailableAt) - issued, 60000)
    assert(issued >= time(c.createdAt) && issued <= time(c.updatedAt))
    for (const k of ['consumedAt', 'verifiedAt']) if (c[k]) assert(time(c[k]) >= issued && time(c[k]) < expires && time(c[k]) <= time(c.updatedAt))
    assert.equal(Boolean(c.verifiedAt), Boolean(c.consumedAt), 'successful verification consumes code')
    if (c.verifiedAt) assert(c.failedAttempts < 5, 'exhausted code cannot verify')
    assert.equal(Boolean(c.grantDigest), Boolean(c.grantExpiresAt), 'grant pair')
    if (c.grantDigest) {
      assert(c.purpose !== 'activate_customer' && c.verifiedAt, 'password grant purpose')
      str(c.grantDigest, 255, 20); assert(time(c.grantExpiresAt) > time(c.verifiedAt) && time(c.grantExpiresAt) <= expires)
    }
    if (c.grantConsumedAt) assert(c.grantDigest && time(c.grantConsumedAt) >= time(c.verifiedAt) && time(c.grantConsumedAt) < time(c.grantExpiresAt))
  }
  unique(data.images.map(i => `${i.cloudName}:${i.cloudinaryAssetId}`))
  unique(data.images.map(i => `${i.cloudName}:${i.publicId}`))
  for (const i of data.images) {
    keys(i, [...stampFields, 'cloudName', 'cloudinaryAssetId', 'publicId', 'url', 'originalName', 'width', 'height', 'bytes', 'format', 'isActive'], ['uploadedByAccountId'])
    str(i.cloudName, 100); assert.match(i.cloudName, /^[A-Za-z0-9_-]+$/)
    str(i.cloudinaryAssetId, 128); str(i.publicId, 255); str(i.url, 2048); str(i.originalName, 255)
    const u = new URL(i.url)
    assert(u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && !u.username && !u.password && u.pathname.startsWith(`/${i.cloudName}/image/upload/`), 'image URL/cloud mismatch')
    int(i.width, 1, 20000); int(i.height, 1, 20000); int(i.bytes, 1, 10485760)
    assert(['jpg', 'png', 'webp'].includes(i.format), 'image format'); bool(i.isActive)
    if (i.uploadedByAccountId) assert(ref('accounts', i.uploadedByAccountId).roles.some(r => r === 'owner'), 'image uploader role')
    // Imported legacy assets may lack an uploader. Existing links may point to archived assets.
  }
  for (const name of ['customers', 'staff']) {
    unique(data[name].filter(x => x.accountId).map(x => oid(x.accountId)))
    for (const doc of data[name]) {
      if (doc.accountId) assert(ref('accounts', doc.accountId).roles.some(r => name === 'staff' ? ['stylist', 'owner'].includes(r) : r === 'customer'), 'profile role')
      str(doc.displayName)
    }
  }
  for (const c of data.customers) {
    keys(c, [...stampFields, 'displayName', 'bookingRevision'], ['accountId', 'phone'])
    int(c.bookingRevision, 0, Number.MAX_SAFE_INTEGER)
    if (c.phone !== undefined) phone(c.phone)
  }

  for (const s of data.staff) {
    keys(s, [...stampFields, 'displayName', 'isActive', 'serviceIds', 'bookingRevision', 'accountId'])
    bool(s.isActive); int(s.bookingRevision, 0, Number.MAX_SAFE_INTEGER)
    arr(s.serviceIds, 0, 50); unique(s.serviceIds)
    s.serviceIds.forEach(id => assert(serviceMap.has(id), 'staff service reference'))
  }
  for (const s of data.staff_shifts) {
    keys(s, [...stampFields, 'staffId', 'localDate', 'startAt', 'endAt', 'status'])
    ref('staff', s.staffId)
    const start = time(s.startAt), end = time(s.endAt)
    assert(start < end && start % 60000 === 0 && end % 60000 === 0)
    assert.equal(s.localDate, local(start).date); assert.equal(local(end - 1).date, s.localDate)
    assert(['active', 'cancelled'].includes(s.status))
  }
  for (const [i, a] of data.staff_shifts.entries()) for (const b of data.staff_shifts.slice(i + 1))
    if (oid(a.staffId) === oid(b.staffId) && a.status === 'active' && b.status === 'active')
      assert(!overlaps(time(a.startAt), time(a.endAt), time(b.startAt), time(b.endAt)), 'shift overlap')
  for (const o of data.staff_time_off) {
    keys(o, [...stampFields, 'staffId', 'startAt', 'endAt'], ['reason'])
    ref('staff', o.staffId)
    const duration = time(o.endAt) - time(o.startAt)
    assert(duration > 0 && duration <= 31 * 86400000 && time(o.startAt) % 60000 === 0 && time(o.endAt) % 60000 === 0)
    if (o.reason !== undefined) str(o.reason, 200)
  }
  for (const a of data.appointments) {
    keys(a, [...stampFields, 'customerId', 'staffId', 'createdByAccountId', 'bookingMode', 'customerSnapshot', 'staffNameSnapshot', 'items', 'totalPriceVnd', 'totalDurationMinutes', 'bufferAfterMinutes', 'startAt', 'endAt', 'occupiedFrom', 'occupiedUntil', 'timeZone', 'localDate', 'status', 'revision', 'confirmedAt'], ['startedAt', 'completedAt', 'cancelledAt', 'noShowAt', 'lastRescheduledAt', 'lastCommand', 'estimatedEndAt', 'contactAttemptedAt'])
    const c = ref('customers', a.customerId), s = ref('staff', a.staffId), actor = ref('accounts', a.createdByAccountId)
    assert(actor.roles.includes('owner') || (c.accountId && oid(c.accountId) === oid(actor._id)), 'creator ownership')
    assert(['customer', 'owner_scheduled', 'owner_walkin'].includes(a.bookingMode))
    if (a.bookingMode === 'customer') assert(c.accountId && oid(c.accountId) === oid(actor._id))
    else assert(actor.roles.includes('owner'))
    keys(a.customerSnapshot, ['displayName', 'phone']); str(a.customerSnapshot.displayName)
    if (a.customerSnapshot.phone !== undefined) phone(a.customerSnapshot.phone)
    str(a.staffNameSnapshot); arr(a.items, 1, 5); unique(a.items.map(i => i.serviceId))
    for (const i of a.items) {
      keys(i, ['serviceId', 'name', 'priceVnd', 'durationMinutes'])
      assert(serviceMap.has(i.serviceId), 'item reference'); str(i.name)
      int(i.priceVnd, 0, 100000000); int(i.durationMinutes, 1, 480)
      // Do not compare historical snapshots with current catalog price/duration.
      // Current capabilities may change; validate them at create/reschedule, not against history.
    }
    int(a.totalPriceVnd, 0, 500000000); int(a.totalDurationMinutes, 1, 2400)
    assert.equal(a.totalPriceVnd, a.items.reduce((n, i) => n + i.priceVnd, 0))
    assert.equal(a.totalDurationMinutes, a.items.reduce((n, i) => n + i.durationMinutes, 0))
    assert.equal(a.bufferAfterMinutes, 10)
    const start = time(a.startAt), end = time(a.endAt), until = time(a.occupiedUntil), confirmed = time(a.confirmedAt)

    if (a.bookingMode !== 'owner_walkin' || a.lastRescheduledAt) assert.equal(start % 900000, 0, '15 minute slot')
    else if (!a.lastRescheduledAt) assert.equal(start, confirmed, 'walkin server now')
    assert.equal(end, start + a.totalDurationMinutes * 60000)
    const expectedFrom = a.status === 'completed' ? time(a.startedAt) : a.status === 'in_progress' ? Math.min(start, time(a.startedAt)) : start
    const expectedUntil = a.status === 'completed' ? time(a.completedAt) + 600000 : a.status === 'in_progress' ? Math.max(end, a.estimatedEndAt ? time(a.estimatedEndAt) : end) + 600000 : end + 600000
    assert.equal(time(a.occupiedFrom), expectedFrom); assert.equal(until, expectedUntil)
    if (a.estimatedEndAt) assert(a.status === 'in_progress' && time(a.estimatedEndAt) > end)

    assert.equal(a.timeZone, 'Asia/Ho_Chi_Minh'); assert.equal(a.localDate, local(start).date)
    assert.equal(local(end + 600000 - 1).date, a.localDate, 'planned reservation crosses local day')
    assert(confirmed >= time(a.createdAt) && confirmed <= time(a.updatedAt))
    const creation = data.appointment_events.find(e => oid(e.appointmentId) === oid(a._id) && e.kind === 'created')
    const originalStart = a.lastRescheduledAt ? time(creation.after.startAt) : start
    assert(confirmed <= originalStart)
    const localDaysAhead = (Date.parse(local(originalStart).date) - Date.parse(local(confirmed).date)) / 86400000
    assert(localDaysAhead >= 0 && localDaysAhead <= 7, 'booking horizon fixture')
    if (a.bookingMode === 'customer') assert(originalStart - confirmed >= 1800000, 'customer lead 30 minutes')
    int(a.revision, 0, Number.MAX_SAFE_INTEGER)
    assert.equal(Object.hasOwn(a, 'lastCommand'), a.revision > 0, 'receipt required after a command')
    assert(['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(a.status), 'status enum')
    const expected = { confirmed: [], in_progress: ['startedAt'], completed: ['startedAt', 'completedAt'], cancelled: ['cancelledAt'], no_show: ['noShowAt'] }[a.status]
    for (const key of ['startedAt', 'completedAt', 'cancelledAt', 'noShowAt']) assert.equal(Object.hasOwn(a, key), expected.includes(key), `status timestamp ${key}`)
    for (const key of [...expected, ...(a.lastRescheduledAt ? ['lastRescheduledAt'] : [])]) assert(time(a[key]) >= confirmed && time(a[key]) <= time(a.updatedAt))
    if (a.startedAt) assert(time(a.startedAt) >= confirmed, 'actual start after creation')
    if (a.completedAt) assert(time(a.completedAt) >= time(a.startedAt))
    if (a.cancelledAt) assert(time(a.cancelledAt) < start)
    if (a.noShowAt) assert(time(a.noShowAt) >= start + 15 * 60000 && a.contactAttemptedAt && time(a.contactAttemptedAt) <= time(a.noShowAt))
    else assert(!a.contactAttemptedAt)
    if (a.lastRescheduledAt) assert(time(a.lastRescheduledAt) < start)
    if (a.lastCommand) {
      keys(a.lastCommand, ['key', 'actorId', 'hash', 'resultRevision'])
      str(a.lastCommand.key, 100, 16); ref('accounts', a.lastCommand.actorId)
      assert.match(a.lastCommand.hash, /^[0-9a-f]{64}$/); assert.equal(a.lastCommand.resultRevision, a.revision)
    }
    if (['confirmed', 'in_progress'].includes(a.status)) {

      // Planned reservation must fit a scheduled shift. Overrun is recorded and alerted, not rejected.
      assert(data.staff_shifts.some(h => oid(h.staffId) === oid(s._id) && h.status === 'active' && time(h.startAt) <= Math.min(start, time(a.occupiedFrom)) && time(h.endAt) >= end + 600000), 'outside dated shift')
      for (const o of data.staff_time_off.filter(o => oid(o.staffId) === oid(s._id))) assert(!overlaps(start, until, time(o.startAt), time(o.endAt)), 'time off overlap')
    }
  }

  // Pair check covers ordinary reservations. ETA overruns can conflict legitimately;
  // the mutation service must return those conflicts as alerts (not undo the actual work).
  for (const [i, a] of data.appointments.entries()) for (const b of data.appointments.slice(i + 1)) {
    if (!blocking.has(a.status) || !blocking.has(b.status)) continue
    const ordinary = !a.estimatedEndAt && !b.estimatedEndAt
    if (ordinary && oid(a.staffId) === oid(b.staffId))
      assert(!overlaps(time(a.occupiedFrom), time(a.occupiedUntil), time(b.occupiedFrom), time(b.occupiedUntil)), 'staff overlap')
    if (!ordinary && oid(a.staffId) === oid(b.staffId)) {
      const base = x => x.status === 'in_progress' ? [time(x.startAt), time(x.endAt) + 600000] : [time(x.occupiedFrom), time(x.occupiedUntil)]
      assert(!overlaps(...base(a), ...base(b)), 'planned staff overlap is not an ETA exception')
    }
    if (ordinary && oid(a.customerId) === oid(b.customerId))
      assert(!overlaps(time(a.occupiedFrom), time(a.completedAt || a.endAt), time(b.occupiedFrom), time(b.completedAt || b.endAt)), 'customer profile overlap')
  }
  unique(data.booking_requests.map(r => oid(r.actorId) + ':' + r.key))
  for (const r of data.booking_requests) {
    keys(r, [...stampFields, 'actorId', 'appointmentId', 'key', 'requestHash', 'expiresAt'])
    const a = ref('appointments', r.appointmentId); ref('accounts', r.actorId)
    assert.equal(oid(r.actorId), oid(a.createdByAccountId)); str(r.key, 100, 16); assert.match(r.requestHash, /^[0-9a-f]{64}$/)
    assert.equal(time(r.expiresAt) - time(r.createdAt), 86400000)
  }
  unique(data.appointment_events.map(e => oid(e.appointmentId) + ':' + e.revision))
  const snapshotKeys = ['status', 'startAt', 'endAt', 'occupiedFrom', 'occupiedUntil', 'startedAt', 'completedAt', 'estimatedEndAt', 'staffId']
  for (const e of data.appointment_events) {
    keys(e, [...stampFields, 'appointmentId', 'actorId', 'revision', 'kind', 'occurredAt', 'before', 'after'], ['reason'])
    const a = ref('appointments', e.appointmentId), actor = ref('accounts', e.actorId)
    int(e.revision, 0, a.revision); assert(time(e.occurredAt) >= time(a.confirmedAt) && time(e.occurredAt) <= time(a.updatedAt))
    assert(['created', 'rescheduled', 'started', 'completed', 'cancelled', 'no_show', 'eta_updated', 'corrected'].includes(e.kind))
    keys(e.before, [], snapshotKeys); keys(e.after, ['status'], snapshotKeys)
    if (e.reason !== undefined) str(e.reason, 500)
    if (e.kind === 'created') assert(e.revision === 0 && Object.keys(e.before).length === 0)
    if (e.kind === 'corrected') {
      assert(actor.roles.includes('owner') && e.reason, 'owner and reason for correction')
      assert((e.before.status === 'in_progress' && e.after.status === 'confirmed') || (e.before.status === 'completed' && e.after.status === 'in_progress'), 'correction transition')
    }
    for (const s of [e.before, e.after]) for (const [k, v] of Object.entries(s)) {
      if (k === 'staffId') ref('staff', v)
      else if (k.endsWith('At') || ['occupiedFrom', 'occupiedUntil'].includes(k)) time(v)
      else assert(['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(v))
    }
  }
  for (const a of data.appointments) {
    const events = data.appointment_events.filter(e => oid(e.appointmentId) === oid(a._id)).sort((x,y) => x.revision-y.revision)
    assert.equal(events.length, a.revision + 1, 'complete event history')
    events.forEach((e,i) => { assert.equal(e.revision,i); if(i) assert.deepEqual(e.before, events[i-1].after, 'audit chain') })
    const current = Object.fromEntries(snapshotKeys.filter(k => a[k] !== undefined).map(k => [k,a[k]]))
    assert.deepEqual(events.at(-1).after, current, 'audit current state')
  }
  const dtoKeys = ['id', 'slug', 'name', 'description', 'category', 'durationMinutes', 'priceVnd', 'imageUrl']
  keys(data.response, ['data'])
  const projected = data.services.filter(s => s.isActive).sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id)).map(s => Object.fromEntries(dtoKeys.map(k => [k, k === 'imageUrl' ? ref('images', s.coverImageId).url : s[k]])))
  data.response.data.forEach(s => keys(s, dtoKeys))
  assert.deepEqual(data.response.data, projected, 'GET services DTO/projection/sort')
}

const data = Object.fromEntries(await Promise.all(collections.map(async name => [
  name, JSON.parse(await readFile(resolve(root, 'examples', `${name}.json`), 'utf8')),
])))
data.response = JSON.parse(await readFile(resolve(root, 'examples/services-response.json'), 'utf8'))
validate(data)
console.log(`PASS: ${collections.length} collections, ${collections.reduce((n, c) => n + data[c].length, 0)} fake documents; references, bounds, image metadata/gallery/cover, timestamps, snapshots, totals, shifts, overlap and DTO.`)

if (process.argv.includes('--self-test')) {
  const mutations = [
    d => { d.services[0].durationMinutes.min = 61 },
    d => { d.services[0].priceVnd = 1.5 },
    d => { d.appointments[0].staffId = { $oid: 'f'.repeat(24) } },
    d => { d.appointments[0].totalPriceVnd++ },
    d => { d.appointments[0].status = 'paid' },
    d => { d.appointments[0].completedAt = d.appointments[0].endAt },
    d => { d.staff_shifts = [] },
    d => { d.appointments[0].localDate = '2026-10-04' },
    d => { d.response.data[0].bookingDurationMinutes = 60 },
    d => { d.customers[1].accountId = d.customers[0].accountId },
    d => { delete d.appointments[3].lastCommand },
    d => { d.appointments[0].updatedAt = { $date: '2026-10-02T01:59:00.000Z' } },
    d => { d.services[0].images[0].imageId = { $oid: 'f'.repeat(24) } },
    d => { d.services[0].coverImageId = d.images[4]._id },
    d => { d.services[0].images.push(structuredClone(d.services[0].images[0])) },
    d => { d.services[0].images = [] },
    d => { d.services[0].images = Array.from({ length: 11 }, () => structuredClone(d.services[0].images[0])) },
    d => { d.images[1].cloudinaryAssetId = d.images[0].cloudinaryAssetId },
    d => { d.images[1].publicId = d.images[0].publicId },
    d => { d.images[0].url = 'https://res.cloudinary.com.evil.invalid/sol-fake/image/upload/cut' },
    d => { d.images[0].cloudName = 'wrong-cloud' },
    d => { d.images[0].bytes = 10485761 },
    d => { d.images[0].width = 0 },
    d => { d.images[0].format = 'svg' },
    d => { d.images[0].uploadedByAccountId = d.accounts[0]._id },
    d => { d.services[0].images[0].alt = null },

    d => { d.response.data[0].imageUrl = d.images[3].url },
    d => { d.accounts[2].roles = ['receptionist'] },
    d => { delete d.accounts[0].emailVerifiedAt },
    d => { delete d.accounts[0].passwordHash },
    d => { d.auth_challenges[0].expiresAt = d.auth_challenges[0].resendAvailableAt },
    d => { d.auth_challenges[0].failedAttempts = 6 },
    d => { d.auth_challenges[0].purpose = 'activate_customer' },
    d => { d.auth_challenges[0].resendAvailableAt = d.auth_challenges[0].issuedAt },
    d => { d.staff_shifts.push({...d.staff_shifts[0], _id: {$oid: 'f'.repeat(24)}}) },
    d => { delete d.appointments[0].customerSnapshot.phone },
    d => { d.appointments[0].bookingMode = 'owner_walkin' },
    d => { d.booking_requests[0].expiresAt = d.booking_requests[0].createdAt },
    d => { d.appointment_events.pop() },
    d => { d.appointment_events[0].after.status = 'cancelled' },
    d => { const a = d.appointments[0]; a.startAt = { $date: '2026-10-05T02:05:00.000Z' } },
    d => { const a = d.appointments[0]; a.confirmedAt = a.createdAt = a.updatedAt = { $date: '2026-10-05T01:31:00.000Z' } },
    d => { const a = d.appointments[0]; a.confirmedAt = a.createdAt = a.updatedAt = { $date: '2026-09-20T01:00:00.000Z' } },
    d => { d.appointments[0].items = Array.from({ length: 6 }, () => d.appointments[0].items[0]) },
    d => { d.booking_requests.push({ ...d.booking_requests[0], _id: { $oid: 'f'.repeat(24) } }) },

  ]
  mutations.forEach((mutate, i) => { const copy = structuredClone(data); mutate(copy); assert.throws(() => validate(copy), `negative case ${i + 1}`) })
  console.log(`PASS: ${mutations.length} invalid in-memory variants rejected; not DB/concurrency tests.`)

  const positiveCases = [
    ['profile phone may be absent before booking', d => { delete d.customers[0].phone }],
    ['current capabilities do not rewrite historical bookings', d => { d.staff[0].serviceIds = [] }],
    ['hidden catalog preserves snapshots', d => { d.services[0].isActive = false; d.response.data = d.response.data.filter(s => s.id !== d.services[0].id) }],
    ['optional gallery is absent', d => { delete d.services[0].images }],
    ['five service snapshots fit one dated shift', d => {
      const extra = [4, 5].map(n => ({ ...structuredClone(d.services[0]), _id: { $oid: String(400 + n).padStart(24, '0') }, id: `service-example-${n}`, slug: `example-${n}`, isActive: false, durationMinutes: { min: 30, max: 30 }, bookingDurationMinutes: 30, priceVnd: 100000 }))
      d.services.push(...extra)
      const a = structuredClone(d.appointments[0])
      a._id = { $oid: '000000000000000000000509' }; a.bookingMode = 'owner_scheduled'; a.createdByAccountId = d.accounts[2]._id
      a.startAt = { $date: '2026-10-06T02:00:00.000Z' }; a.localDate = '2026-10-06'
      a.items = d.services.map(s => ({ serviceId: s.id, name: s.name, priceVnd: s.priceVnd, durationMinutes: s.bookingDurationMinutes }))
      a.totalPriceVnd = a.items.reduce((n, i) => n + i.priceVnd, 0); a.totalDurationMinutes = a.items.reduce((n, i) => n + i.durationMinutes, 0)
      a.endAt = { $date: new Date(time(a.startAt) + a.totalDurationMinutes * 60000).toISOString() }
      a.occupiedFrom = a.startAt; a.occupiedUntil = { $date: new Date(time(a.endAt) + 600000).toISOString() }
      d.appointments.push(a)
      const snapshot = Object.fromEntries(['status', 'startAt', 'endAt', 'occupiedFrom', 'occupiedUntil', 'staffId'].map(k => [k, a[k]]))
      d.appointment_events.push({ _id: { $oid: '000000000000000000000950' }, appointmentId: a._id, actorId: a.createdByAccountId, revision: 0, kind: 'created', occurredAt: a.confirmedAt, before: {}, after: snapshot, createdAt: a.createdAt, updatedAt: a.createdAt })
    }],
  ]
  for (const [label, mutate] of positiveCases) { const copy = structuredClone(data); mutate(copy); assert.doesNotThrow(() => validate(copy), label) }
  const customerOverlap = structuredClone(data)
  customerOverlap.appointments[2].customerId = customerOverlap.appointments[0].customerId
  assert.throws(() => validate(customerOverlap), /customer profile overlap/)
  const noContact = structuredClone(data)
  delete noContact.appointments.find(a => a.status === 'no_show').contactAttemptedAt
  assert.throws(() => validate(noContact))
  const corrected = structuredClone(data)
  const a = corrected.appointments.find(x => x.status === 'completed')
  const before = structuredClone(corrected.appointment_events.find(e => oid(e.appointmentId) === oid(a._id) && e.revision === a.revision).after)
  a.status = 'in_progress'; delete a.completedAt; a.occupiedFrom = a.startAt
  a.occupiedUntil = { $date: new Date(time(a.endAt) + 600000).toISOString() }
  a.updatedAt = { $date: '2026-10-04T02:56:00.000Z' }; a.revision++; a.lastCommand.resultRevision = a.revision; a.lastCommand.actorId = corrected.accounts[2]._id
  const after = Object.fromEntries(['status', 'startAt', 'endAt', 'occupiedFrom', 'occupiedUntil', 'startedAt', 'staffId'].map(k => [k, a[k]]))
  const correction = { _id: { $oid: '000000000000000000000951' }, appointmentId: a._id, actorId: corrected.accounts[2]._id, revision: a.revision, kind: 'corrected', occurredAt: a.updatedAt, before, after, reason: 'Dữ liệu giả: bấm hoàn tất nhầm', createdAt: a.updatedAt, updatedAt: a.updatedAt }
  corrected.appointment_events.push(correction)
  assert.doesNotThrow(() => validate(corrected), 'owner correction preserves prior completed event')
  delete correction.reason; assert.throws(() => validate(corrected), /owner and reason/)
  correction.reason = 'Dữ liệu giả'; correction.actorId = corrected.accounts[1]._id
  assert.throws(() => validate(corrected), /owner and reason/)
  console.log(`PASS: ${positiveCases.length + 1} valid variants accepted; customer overlap, no-show contact and owner/reason correction checks.`)
}

// File links and named collection coverage, not a semantic proof of the design.
let linkCount = 0
for (const folder of [root, resolve(root, 'diagrams'), resolve(root, 'examples')]) {
  for (const file of await readdir(folder)) {
    if (!file.endsWith('.md')) continue
    const text = await readFile(resolve(folder, file), 'utf8')
    for (const [, target] of text.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(target)) continue
      const [path, anchor] = target.split('#')
      const destination = resolve(folder, path || file)
      await access(destination)
      if (anchor) assert((await readFile(destination, 'utf8')).includes(`id="${anchor}"`), `missing explicit anchor ${target}`)
      linkCount++
    }
  }
}
const diagram = await readFile(resolve(root, 'diagrams/sol-db-baseline.mmd'), 'utf8')
const schema = await readFile(resolve(root, 'schema.md'), 'utf8')
const indexes = await readFile(resolve(root, 'queries-and-indexes.md'), 'utf8')
for (const name of collections) for (const text of [diagram, schema, indexes]) assert(text.includes(name), `missing collection ${name}`)
console.log(`PASS: ${linkCount} internal file/anchor links; collection names present in schema, diagram and indexes.`)

const nativeDiagram = JSON.parse(await readFile(resolve(root, 'diagrams/sol-db-baseline.visualeaf.json'), 'utf8'))
assert.deepEqual(nativeDiagram.collections.map(c => c.name).sort(), [...collections].sort(), 'native diagram collections')
for (const connection of nativeDiagram.connections) for (const end of [connection.source, connection.target]) {
  const collection = nativeDiagram.collections.find(c => c.name === end.collection)
  assert(collection?.fields.some(f => f.path === end.path), `native diagram missing endpoint ${end.collection}.${end.path}`)
}
for (const [source, path, target, type] of [
  ['services', 'coverImageId', 'images', 'N-1'],
  ['services', 'images[].imageId', 'images', 'N-N'],
  ['images', 'uploadedByAccountId', 'accounts', 'N-1'],
]) assert(nativeDiagram.connections.some(c => c.source.collection === source && c.source.path === path && c.target.collection === target && c.target.path === '_id' && c.type === type), `native diagram image reference ${path}`)
assert(!nativeDiagram.collections.find(c => c.name === 'services').fields.some(f => f.path === 'imageUrl'), 'native target schema stores cover, not legacy URL')
console.log(`PASS: native diagram ${nativeDiagram.collections.length} collections, ${nativeDiagram.collections.reduce((n, c) => n + c.fields.length, 0)} fields, ${nativeDiagram.connections.length} references; endpoints and image cardinalities.`)
