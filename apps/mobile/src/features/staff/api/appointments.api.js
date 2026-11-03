import { requestJson } from '../../../lib/http.js'

export async function fetchStylistAppointments(apiBaseUrl, token, localDate, { signal } = {}) {
  const query = new URLSearchParams({ localDate })
  const response = await requestJson(`/api/appointments?${query}`, {
    baseUrl: apiBaseUrl,
    signal,
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.data
}

export function getStylistAppointmentsErrorMessage(error) {
  if (error?.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (error?.status === 403) return 'Tài khoản này không có quyền xem lịch hẹn.'
  if (error?.status === 404) return 'Không tìm thấy hồ sơ stylist của bạn.'
  return error instanceof Error ? error.message : 'Không thể tải lịch hẹn. Vui lòng thử lại.'
}
