import { requestJson } from '../../../lib/http.js'

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` }
}

export async function fetchMyStaff(apiBaseUrl, token, { signal } = {}) {
  const response = await requestJson('/api/staff', {
    baseUrl: apiBaseUrl,
    signal,
    headers: authHeaders(token),
  })
  return response.data
}

export async function fetchMyShifts(apiBaseUrl, token, staffId, range, { signal } = {}) {
  const query = new URLSearchParams({
    fromDate: range.fromDate,
    toDate: range.toDate,
  })
  const response = await requestJson(`/api/staff/${staffId}/shifts?${query}`, {
    baseUrl: apiBaseUrl,
    signal,
    headers: authHeaders(token),
  })
  return response.data
}

export function getStaffErrorMessage(error) {
  if (error?.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (error?.status === 403) return 'Tài khoản này không có quyền xem ca làm.'
  if (error?.status === 404) return 'Không tìm thấy hồ sơ stylist của bạn.'
  return error instanceof Error ? error.message : 'Không thể tải ca làm. Vui lòng thử lại.'
}
