import { requestJson } from '../../../lib/http.js'

const headers = (token) => ({ Authorization: `Bearer ${token}` })

export async function readBookingData(baseUrl, token, kind, params, signal) {
  const paths = {
    profile: '/api/auth/me',
    customers: '/api/customers',
    availability: '/api/availability',
  }
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '')
      search.set(key, Array.isArray(value) ? value.join(',') : value)
  }
  const response = await requestJson(paths[kind] + (search.size ? `?${search}` : ''), {
    baseUrl,
    headers: headers(token),
    signal,
  })
  return response.data
}

export async function updateBookingProfile(baseUrl, token, profile, signal) {
  return (
    await requestJson('/api/auth/me', {
      baseUrl,
      method: 'PATCH',
      headers: headers(token),
      body: profile,
      signal,
    })
  ).data
}

export async function createBooking(baseUrl, token, payload, key, signal) {
  const response = await requestJson('/api/appointments', {
    baseUrl,
    method: 'POST',
    headers: { ...headers(token), 'Idempotency-Key': key },
    body: payload,
    signal,
  })
  // A malformed success response is ambiguous: retry the same intent/key.
  if (!response.data?.id) throw new Error('Chưa nhận được mã lịch hẹn. Hãy thử lại cùng yêu cầu.')
  return response.data
}
