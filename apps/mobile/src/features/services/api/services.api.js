import { requestJson } from '../../../lib/http.js'

export async function fetchServices(apiBaseUrl, { signal } = {}) {
  const response = await requestJson('/api/services', {
    baseUrl: apiBaseUrl,
    signal,
  })

  return response.data
}

export async function fetchManageServices(apiBaseUrl, token, { signal } = {}) {
  const response = await requestJson('/api/services/manage', {
    baseUrl: apiBaseUrl,
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  return response.data
}

export async function createService(apiBaseUrl, token, serviceData, { signal } = {}) {
  const response = await requestJson('/api/services', {
    baseUrl: apiBaseUrl,
    method: 'POST',
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: serviceData,
  })

  return response.data
}

export async function updateService(apiBaseUrl, token, id, updates, { signal } = {}) {
  const response = await requestJson(`/api/services/${encodeURIComponent(id)}`, {
    baseUrl: apiBaseUrl,
    method: 'PATCH',
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: updates,
  })

  return response.data
}

export async function uploadServiceImage(apiBaseUrl, token, imagePayload, { signal } = {}) {
  const response = await requestJson('/api/services/images', {
    baseUrl: apiBaseUrl,
    method: 'POST',
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: imagePayload,
  })

  return response.data
}

export function getServicesErrorMessage(error) {
  if (error instanceof Error && error.message.includes('hết thời gian chờ')) {
    return 'Tải dịch vụ quá lâu. Vui lòng thử lại.'
  }

  return 'Không thể tải danh mục dịch vụ. Vui lòng kiểm tra kết nối và thử lại.'
}

export function getServiceActionErrorMessage(error) {
  if (error?.code === 'DUPLICATE_SERVICE_ID') return 'Mã dịch vụ này đã tồn tại, vui lòng chọn mã khác.'
  if (error?.code === 'DUPLICATE_SERVICE_SLUG') return 'Tên hoặc slug dịch vụ này đã tồn tại.'
  if (error?.code === 'SERVICE_NOT_FOUND') return 'Không tìm thấy dịch vụ cần cập nhật.'
  if (error?.code === 'INVALID_DURATION') return 'Thời lượng min/max không hợp lệ (1 - 480 phút và min <= max).'
  if (error?.code === 'INVALID_BOOKING_DURATION') return 'Thời lượng đặt lịch phải nằm trong khoảng thời lượng min - max.'
  if (error?.code === 'MISSING_IMAGE') return 'Vui lòng cung cấp URL ảnh hợp lệ.'
  if (error?.code === 'IMAGE_NOT_FOUND') return 'Ảnh cover không tồn tại hoặc chưa hợp lệ.'
  if (error?.message) return error.message
  return 'Thao tác không thành công. Vui lòng thử lại.'
}
