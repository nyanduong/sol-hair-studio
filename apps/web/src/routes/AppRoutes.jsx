import { Route, Routes } from 'react-router-dom'
import LoginPage from '../features/auth/pages/LoginPage.jsx'
import HealthPage from '../features/health/pages/HealthPage.jsx'
import HomePage from '../features/home/pages/HomePage.jsx'
import StaffRoute from '../features/staff/pages/StaffRoute.jsx'
import MainLayout from '../layouts/MainLayout.jsx'

export default function AppRoutes() {
  return <Routes><Route element={<MainLayout />}>
    <Route path="/" element={<HomePage />} />
    <Route path="/health" element={<HealthPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/quan-ly/nhan-su" element={<StaffRoute />} />
  </Route></Routes>
}
