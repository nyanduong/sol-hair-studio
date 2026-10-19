export function staffErrorMessage(error) {
  if (error?.code === 'APPOINTMENT_CONFLICT') return 'Không thể lưu thay đổi vì có lịch hẹn bị ảnh hưởng.'
  if (error?.code === 'SHIFT_OVERLAP') return 'Ca làm bị chồng với một ca đang hoạt động.'
  if (error?.code === 'STAFF_ALREADY_EXISTS') return 'Tài khoản hoặc hồ sơ nhân viên đã tồn tại.'
  if (error?.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (error?.status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  if (error?.status >= 400 && error?.status < 500 && error.apiMessage) return error.apiMessage
  return 'Không thể hoàn tất yêu cầu. Vui lòng kiểm tra kết nối và thử lại.'
}

// Sau lỗi mạng khi ghi, server có thể đã lưu dù client không nhận được kết quả.
export function staffActionErrorMessage(error) {
  if (!error?.status || error.status >= 500) return 'Không xác định được kết quả lưu. Vui lòng tải lại dữ liệu và kiểm tra trước khi thử lại.'
  return staffErrorMessage(error)
}
