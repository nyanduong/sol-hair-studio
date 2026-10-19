import { requestJson } from '../../../lib/http.js'

// Token do phiên đăng nhập cung cấp theo từng request; module không lưu token.
async function staffRequest(baseUrl, token, path, { signal, method, body, fetchImpl } = {}) {
  if (typeof token !== 'string' || !token.trim()) throw new Error('Cần đăng nhập để quản lý nhân sự.')
  const response = await requestJson(path, {
    baseUrl,
    signal,
    fetchImpl,
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body,
  })
  return response.data
}

const staffPath = (staffId) => `/api/staff/${encodeURIComponent(staffId)}`
const shiftsPath = (staffId) => `${staffPath(staffId)}/shifts`

export function listStaff(baseUrl, token, { signal, fetchImpl } = {}) {
  return staffRequest(baseUrl, token, '/api/staff', { signal, fetchImpl })
}

export function createStaff(baseUrl, token, input, { signal, fetchImpl } = {}) {
  return staffRequest(baseUrl, token, '/api/staff', { signal, fetchImpl, method: 'POST', body: input })
}

export function updateStaff(baseUrl, token, staffId, input, { signal, fetchImpl } = {}) {
  return staffRequest(baseUrl, token, staffPath(staffId), { signal, fetchImpl, method: 'PATCH', body: input })
}

export function listShifts(baseUrl, token, staffId, { fromDate, toDate, signal, fetchImpl } = {}) {
  const query = new URLSearchParams()
  if (fromDate) query.set('fromDate', fromDate)
  if (toDate) query.set('toDate', toDate)
  const suffix = query.size ? `?${query}` : ''
  return staffRequest(baseUrl, token, shiftsPath(staffId) + suffix, { signal, fetchImpl })
}

export function createShift(baseUrl, token, staffId, input, { signal, fetchImpl } = {}) {
  return staffRequest(baseUrl, token, shiftsPath(staffId), { signal, fetchImpl, method: 'POST', body: input })
}

export function updateShift(baseUrl, token, staffId, shiftId, input, { signal, fetchImpl } = {}) {
  return staffRequest(baseUrl, token, `${shiftsPath(staffId)}/${encodeURIComponent(shiftId)}`, { signal, fetchImpl, method: 'PATCH', body: input })
}

export function cancelShift(baseUrl, token, staffId, shiftId, { signal, fetchImpl } = {}) {
  return staffRequest(baseUrl, token, `${shiftsPath(staffId)}/${encodeURIComponent(shiftId)}`, { signal, fetchImpl, method: 'DELETE' })
}
