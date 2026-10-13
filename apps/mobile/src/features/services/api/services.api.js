import { requestJson } from '../../../lib/http.js'

export async function fetchServices(apiBaseUrl, { signal } = {}) {
  const response = await requestJson('/api/services', {
    baseUrl: apiBaseUrl,
    signal,
  })

  return response.data
}

export function getServicesErrorMessage(error) {
  if (error instanceof Error && error.message.includes('hết thời gian chờ')) {
    return 'Tải dịch vụ quá lâu. Vui lòng thử lại.'
  }

  return 'Không thể tải danh mục dịch vụ. Vui lòng kiểm tra kết nối và thử lại.'
}
