import { Route, Routes } from 'react-router-dom'
import HomePage from '../features/home/pages/HomePage.jsx'
import HealthPage from '../features/health/pages/HealthPage.jsx'
import StaffPage from '../features/staff/pages/StaffPage.jsx'
import MainLayout from '../layouts/MainLayout.jsx'

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/quan-ly/nhan-su" element={<StaffPage />} />
      </Route>
    </Routes>
  )
}
