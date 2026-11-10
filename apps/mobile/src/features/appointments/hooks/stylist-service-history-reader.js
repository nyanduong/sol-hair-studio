/**
 * Author: Tô Thị Thảo Trang (Account: trangtttce191027)
 * Student ID: CE191027
 * Task ID / Use Case: SOL-038 - Mobile Appointment Management & Service
 * File Purpose: Bộ đọc danh sách lịch sử dịch vụ của khách hàng với phân trang cursor và kiểm tra tính hợp lệ của ngữ cảnh cuộc hẹn.
 */
import { createAppointmentListReader } from './customer-appointments-reader.js'
import { readStylistSession } from './stylist-appointments-reader.js'
import { isAppointmentStylist } from '../appointment-presentation.js'
import { assertServiceHistoryContext } from '../api/stylist-service-history.api.js'

/**
 * Tạo reader đọc lịch sử dịch vụ của khách hàng theo ngữ cảnh ca hẹn hiện tại của stylist.
 */
export function createStylistServiceHistoryReader({ accountId, appointmentId, readProfile, readStaff, readPage }) {
  let staffId
  return createAppointmentListReader({ accountId, authorize: isAppointmentStylist,
    readProfile: async signal => {
      assertServiceHistoryContext(appointmentId)
      const session = await readStylistSession({ accountId, readProfile, readStaff }, signal)
      if (staffId && staffId !== session.staffId) {
        staffId = session.staffId
        throw Object.assign(new Error('Hồ sơ Stylist đã thay đổi. Hãy tải lại.'), { status: 403 })
      }
      staffId = session.staffId
      return session.profile
    },
    readPage: (cursor, signal) => readPage(appointmentId, cursor, signal),
    compareAppointments: (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || b.id.localeCompare(a.id),
  })
}
