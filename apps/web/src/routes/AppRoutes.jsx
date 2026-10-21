import CustomerAppointmentsPage from '../features/appointments/pages/CustomerAppointmentsPage.jsx'
import { Route, Routes } from 'react-router-dom'
import LoginPage from '../features/auth/pages/LoginPage.jsx'
import HealthPage from '../features/health/pages/HealthPage.jsx'
import HomePage from '../features/home/pages/HomePage.jsx'
import StaffRoute from '../features/staff/pages/StaffRoute.jsx'
import MainLayout from '../layouts/MainLayout.jsx'
import BookingPage from '../features/booking/pages/BookingPage.jsx'

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/booking" element={<BookingPage />} />
        <Route path="/lich-cua-toi" element={<CustomerAppointmentsPage />} />
        <Route path="/quan-ly/nhan-su" element={<StaffRoute />} />
      </Route>
    </Routes>
  )
}
