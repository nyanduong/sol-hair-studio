import { requestJson } from '../../../lib/http.js'

const headers = (token) => ({ Authorization: `Bearer ${token}` })

export async function readBookingData(baseUrl, token, kind, params, signal) {
  const paths = { profile: '/api/auth/me', availability: '/api/availability' }
  const search = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(Array.isArray(value) ? value.join(',') : value)}`,
    )
    .join('&')
  return (
    await requestJson(paths[kind] + (search ? `?${search}` : ''), {
      baseUrl,
      headers: headers(token),
      signal,
    })
  ).data
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
  if (!response.data?.id) throw new Error('Chưa nhận được mã lịch hẹn. Hãy thử lại cùng yêu cầu.')
  return response.data
}
