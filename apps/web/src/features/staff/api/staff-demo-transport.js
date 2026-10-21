import { HttpError } from '../../../lib/http.js'
import { createStaffClient } from './staff-client.js'
import { createDemoStaffClient } from './staff-demo-client.js'

// Chỉ dùng trong bản minh họa: không gửi request ra mạng hoặc tạo phiên thật.
const demoOrigin = 'http://staff-demo.invalid'
const demoToken = 'demo-session'
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function createDemoFetch(today) {
  const data = createDemoStaffClient(today)
  return async (address, options = {}) => {
    const url = new URL(address)
    if (url.origin !== demoOrigin) throw new Error('Địa chỉ bản minh họa không hợp lệ.')
    const authorization = options.headers instanceof Headers ? options.headers.get('Authorization') : options.headers?.Authorization
    if (url.pathname.startsWith('/api/staff') && authorization !== `Bearer ${demoToken}`) return json({ code: 'UNAUTHORIZED' }, 401)
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const method = options.method || 'GET'
    const body = options.body ? JSON.parse(options.body) : undefined
    const signal = options.signal
    try {
      let result
      if (url.pathname === '/api/services' && method === 'GET') result = await data.listServices(signal)
      else if (parts[0] === 'api' && parts[1] === 'staff') {
        const [, , staffId, resource, shiftId] = parts
        if (!staffId && method === 'GET') result = await data.listStaff(signal)
        else if (!staffId && method === 'POST') result = await data.createStaff(body, signal)
        else if (staffId && !resource && method === 'PATCH') result = await data.updateStaff(staffId, body, signal)
        else if (resource === 'shifts' && !shiftId && method === 'GET') result = await data.listShifts(staffId, url.searchParams.get('fromDate'), url.searchParams.get('toDate'), signal)
        else if (resource === 'shifts' && !shiftId && method === 'POST') result = await data.createShift(staffId, body, signal)
        else if (resource === 'shifts' && shiftId && method === 'PATCH') result = await data.updateShift(staffId, shiftId, body, signal)
        else if (resource === 'shifts' && shiftId && method === 'DELETE') result = await data.cancelShift(staffId, shiftId, signal)
        else return json({ code: 'NOT_FOUND' }, 404)
      } else return json({ code: 'NOT_FOUND' }, 404)
      return json({ data: result }, method === 'POST' ? 201 : 200)
    } catch (error) {
      if (error instanceof HttpError) return json({ code: error.code, message: error.apiMessage, conflicts: error.conflicts }, error.status)
      throw error
    }
  }
}

export function createDemoApiClient(today) {
  return createStaffClient(demoOrigin, demoToken, { fetchImpl: createDemoFetch(today) })
}
