import { Route, Routes } from 'react-router-dom'
import OwnerAppointmentsPage from '../pages/OwnerAppointmentsPage.jsx'
import StylistAppointmentsPage from '../pages/StylistAppointmentsPage.jsx'

// Chỉ kiểm tra các component cũ và phần dùng chung. Các route Owner này đã gỡ
// khỏi AppRoutes thật; admin-navigation.test.jsx kiểm tra việc gỡ route đó.
export default function LegacyAppointmentsFixture() {
  return (
    <Routes>
      <Route path="/quan-ly/lich-hen" element={<OwnerAppointmentsPage />} />
      <Route path="/quan-ly/lich-hen/:appointmentId" element={<OwnerAppointmentsPage />} />
      <Route path="/nhan-vien/lich-hen" element={<StylistAppointmentsPage />} />
      <Route path="/nhan-vien/lich-hen/:appointmentId" element={<StylistAppointmentsPage />} />
    </Routes>
  )
}
