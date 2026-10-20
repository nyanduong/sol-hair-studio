import { Route, Routes } from 'react-router-dom'
import HealthPage from '../features/health/pages/HealthPage.jsx'
import HomePage from '../features/home/pages/HomePage.jsx'
import LoginPage from '../features/auth/pages/LoginPage.jsx'
import MainLayout from '../layouts/MainLayout.jsx'

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Route>
    </Routes>
  )
}
