import SiteHeader from '../../home/components/SiteHeader.jsx'
import SiteFooter from '../../home/components/SiteFooter.jsx'
import { useAuth } from '../hooks/useAuth.js'
import CustomerProfile from '../components/CustomerProfile.jsx'
import { Link } from 'react-router-dom'

export default function ProfilePage() {
  const { token, isAuthenticated, openLoginModal } = useAuth()
  return <><SiteHeader /><main id="main-content" className="mx-auto min-h-[60vh] max-w-4xl px-6 py-10"><Link to="/lich-cua-toi" className="text-sm text-terracotta">← Lịch của tôi</Link><h1 className="mt-5 font-display text-4xl">Thông tin cá nhân</h1><section className="mt-6 rounded-3xl border border-border bg-white p-8">{isAuthenticated ? <CustomerProfile key={token} token={token} /> : <button onClick={() => openLoginModal()} className="min-h-11 text-terracotta">Đăng nhập để xem hồ sơ</button>}</section></main><SiteFooter /></>
}
