// Offline documentation checker. No app imports, environment reads or DB access.
import assert from 'node:assert/strict'
import { readFile, readdir, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const collections = ['services', 'accounts', 'customers', 'staff', 'staff_time_off', 'appointments', 'images']
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
    keys(s, [...stampFields, 'id', 'slug', 'name', 'description', 'category', 'durationMinutes', 'bookingDurationMinutes', 'priceVnd', 'coverImageId', 'images', 'isActive', 'displayOrder'], ['__v'])
    slug(s.id, 80); slug(s.slug, 120); str(s.name); str(s.description, 2000); str(s.category, 80)
    keys(s.durationMinutes, ['min', 'max'])
    int(s.durationMinutes.min, 1, 480); int(s.durationMinutes.max, s.durationMinutes.min, 480)
    int(s.bookingDurationMinutes, s.durationMinutes.min, s.durationMinutes.max, 5)
    int(s.priceVnd, 0, 100000000); int(s.displayOrder, 0, 100000); bool(s.isActive)
    if (s.__v !== undefined) int(s.__v, 0, Number.MAX_SAFE_INTEGER)
    arr(s.images, 1, 10)
    unique(s.images.map(i => oid(i.imageId)))
    for (const i of s.images) {
      keys(i, ['imageId'], ['alt']); ref('images', i.imageId)
      if (i.alt !== undefined) str(i.alt, 200)
    }
    ref('images', s.coverImageId)
    assert(s.images.some(i => oid(i.imageId) === oid(s.coverImageId)), 'cover must belong to gallery')
  }
  unique(data.accounts.map(a => a.emailNormalized))
  for (const a of data.accounts) {
    keys(a, [...stampFields, 'emailNormalized', 'passwordHash', 'roles', 'isActive'])
    str(a.emailNormalized, 254); assert.match(a.emailNormalized, /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    assert.equal(a.emailNormalized, a.emailNormalized.toLowerCase()); str(a.passwordHash, 255, 20)
    arr(a.roles, 1, 4); unique(a.roles); a.roles.forEach(r => assert(['customer', 'stylist', 'receptionist', 'owner'].includes(r)))
    bool(a.isActive)
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
    if (i.uploadedByAccountId) assert(ref('accounts', i.uploadedByAccountId).roles.some(r => ['owner', 'receptionist'].includes(r)), 'image uploader role')
    // Imported legacy assets may lack an uploader. Existing links may point to archived assets.
  }
  for (const name of ['customers', 'staff']) {
    unique(data[name].filter(x => x.accountId).map(x => oid(x.accountId)))
    for (const doc of data[name]) {
      if (doc.accountId) assert(ref('accounts', doc.accountId).roles.includes(name === 'staff' ? 'stylist' : 'customer'), 'profile role')
      str(doc.displayName)
    }
  }
  for (const c of data.customers) {
    keys(c, [...stampFields, 'displayName'], ['accountId', 'phone'])
    if (c.phone !== undefined) phone(c.phone)
  }
  for (const s of data.staff) {
    keys(s, [...stampFields, 'displayName', 'isActive', 'serviceIds', 'weeklyHours', 'bookingRevision'], ['accountId'])
    bool(s.isActive); int(s.bookingRevision, 0, Number.MAX_SAFE_INTEGER)
    arr(s.serviceIds, 0, 50); unique(s.serviceIds)
    s.serviceIds.forEach(id => assert(serviceMap.has(id), 'staff service reference'))
    arr(s.weeklyHours, 0, 7); unique(s.weeklyHours.map(x => x.weekday))
    for (const day of s.weeklyHours) {
      keys(day, ['weekday', 'intervals']); int(day.weekday, 1, 7); arr(day.intervals, 1, 3)
      let lastEnd = -1
      for (const range of day.intervals) {
        keys(range, ['startMinute', 'endMinute'])
        int(range.startMinute, 0, 1435, 5); int(range.endMinute, 5, 1440, 5)
        assert(range.startMinute >= lastEnd && range.startMinute < range.endMinute, 'invalid weekly shift')
        lastEnd = range.endMinute
      }
    }
  }
  for (const o of data.staff_time_off) {
    keys(o, [...stampFields, 'staffId', 'startAt', 'endAt'], ['reason'])
    ref('staff', o.staffId)
    const duration = time(o.endAt) - time(o.startAt)
    assert(duration > 0 && duration <= 31 * 86400000 && time(o.startAt) % 60000 === 0 && time(o.endAt) % 60000 === 0)
    if (o.reason !== undefined) str(o.reason, 200)
  }
  unique(data.appointments.map(a => `${oid(a.createdByAccountId)}:${a.requestKey}`))
  for (const a of data.appointments) {
    keys(a, [...stampFields, 'customerId', 'staffId', 'createdByAccountId', 'requestKey', 'requestHash', 'customerSnapshot', 'staffNameSnapshot', 'items', 'totalPriceVnd', 'totalDurationMinutes', 'bufferAfterMinutes', 'startAt', 'endAt', 'occupiedUntil', 'timeZone', 'localDate', 'status', 'revision', 'confirmedAt'], ['startedAt', 'completedAt', 'cancelledAt', 'noShowAt', 'lastRescheduledAt', 'lastCommand'])
    const c = ref('customers', a.customerId), s = ref('staff', a.staffId), actor = ref('accounts', a.createdByAccountId)
    assert(actor.roles.some(r => ['owner', 'receptionist'].includes(r)) || (c.accountId && oid(c.accountId) === oid(actor._id)), 'creator ownership')
    str(a.requestKey, 100, 16); assert.match(a.requestHash, /^[0-9a-f]{64}$/)
    keys(a.customerSnapshot, ['displayName'], ['phone']); str(a.customerSnapshot.displayName)
    if (a.customerSnapshot.phone !== undefined) phone(a.customerSnapshot.phone)
    str(a.staffNameSnapshot); arr(a.items, 1, 3); unique(a.items.map(i => i.serviceId))
    for (const i of a.items) {
      keys(i, ['serviceId', 'name', 'priceVnd', 'durationMinutes'])
      assert(serviceMap.has(i.serviceId), 'item reference'); str(i.name)
      int(i.priceVnd, 0, 100000000); int(i.durationMinutes, 5, 480, 5)
      // Do not compare historical snapshots with current catalog price/duration.
      if (['confirmed', 'in_progress'].includes(a.status)) assert(s.serviceIds.includes(i.serviceId) && s.isActive, 'future staff capability')
    }
    int(a.totalPriceVnd, 0, 300000000); int(a.totalDurationMinutes, 5, 480, 5)
    assert.equal(a.totalPriceVnd, a.items.reduce((n, i) => n + i.priceVnd, 0))
    assert.equal(a.totalDurationMinutes, a.items.reduce((n, i) => n + i.durationMinutes, 0))
    assert.equal(a.bufferAfterMinutes, 10)
    const start = time(a.startAt), end = time(a.endAt), until = time(a.occupiedUntil), confirmed = time(a.confirmedAt)
    assert.equal(start % 300000, 0); assert.equal(end, start + a.totalDurationMinutes * 60000); assert.equal(until, end + 600000)
    assert.equal(a.timeZone, 'Asia/Ho_Chi_Minh'); assert.equal(a.localDate, local(start).date)
    assert.equal(local(until - 1).date, a.localDate, 'cross local day')
    assert(confirmed <= start && confirmed >= time(a.createdAt) && confirmed <= time(a.updatedAt))
    const bookedAt = a.lastRescheduledAt ? time(a.lastRescheduledAt) : confirmed
    const localDaysAhead = (Date.parse(local(start).date) - Date.parse(local(bookedAt).date)) / 86400000
    assert(localDaysAhead >= 0 && localDaysAhead <= 90, 'booking horizon fixture')
    int(a.revision, 0, Number.MAX_SAFE_INTEGER)
    assert.equal(Object.hasOwn(a, 'lastCommand'), a.revision > 0, 'receipt required after a command')
    assert(['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(a.status), 'status enum')
    const expected = { confirmed: [], in_progress: ['startedAt'], completed: ['startedAt', 'completedAt'], cancelled: ['cancelledAt'], no_show: ['noShowAt'] }[a.status]
    for (const key of ['startedAt', 'completedAt', 'cancelledAt', 'noShowAt']) assert.equal(Object.hasOwn(a, key), expected.includes(key), `status timestamp ${key}`)
    for (const key of [...expected, ...(a.lastRescheduledAt ? ['lastRescheduledAt'] : [])]) assert(time(a[key]) >= confirmed && time(a[key]) <= time(a.updatedAt))
    if (a.startedAt) assert(time(a.startedAt) >= start && time(a.startedAt) < end, 'start within reserved service time')
    if (a.completedAt) assert(time(a.completedAt) >= time(a.startedAt))
    if (a.cancelledAt) assert(time(a.cancelledAt) < start)
    if (a.noShowAt) assert(time(a.noShowAt) >= start + 15 * 60000)
    if (a.lastRescheduledAt) assert(time(a.lastRescheduledAt) < start)
    if (a.lastCommand) {
      keys(a.lastCommand, ['key', 'actorId', 'hash', 'resultRevision'])
      str(a.lastCommand.key, 100, 16); ref('accounts', a.lastCommand.actorId)
      assert.match(a.lastCommand.hash, /^[0-9a-f]{64}$/); assert.equal(a.lastCommand.resultRevision, a.revision)
    }
    if (['confirmed', 'in_progress'].includes(a.status)) {
      const shift = s.weeklyHours.find(h => h.weekday === local(start).weekday)
      const endMinute = local(start).minute + a.totalDurationMinutes + a.bufferAfterMinutes
      assert(shift?.intervals.some(h => h.startMinute <= local(start).minute && h.endMinute >= endMinute), 'outside shift')
      for (const o of data.staff_time_off.filter(o => oid(o.staffId) === oid(s._id))) assert(!overlaps(start, until, time(o.startAt), time(o.endAt)), 'time off overlap')
    }
  }
  for (const [i, a] of data.appointments.entries()) for (const b of data.appointments.slice(i + 1)) {
    if (oid(a.staffId) === oid(b.staffId) && blocking.has(a.status) && blocking.has(b.status)) assert(!overlaps(time(a.startAt), time(a.occupiedUntil), time(b.startAt), time(b.occupiedUntil)), 'blocking appointments overlap')
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
    d => { d.staff[0].weeklyHours = [] },
    d => { d.appointments[1].startAt = d.appointments[0].startAt; d.appointments[1].endAt = { $date: '2026-10-05T03:15:00.000Z' }; d.appointments[1].occupiedUntil = { $date: '2026-10-05T03:25:00.000Z' } },
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
  ]
  mutations.forEach((mutate, i) => { const copy = structuredClone(data); mutate(copy); assert.throws(() => validate(copy), `negative case ${i + 1}`) })
  console.log(`PASS: ${mutations.length} invalid in-memory variants rejected; not DB/concurrency tests.`)
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
