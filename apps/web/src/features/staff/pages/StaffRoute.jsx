import { Link } from 'react-router-dom'
import { apiBaseUrl } from '../../../config/env.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { createStaffClient } from '../api/staff-client.js'
import StaffPage from './StaffPage.jsx'

const card = 'mx-auto mt-16 max-w-xl rounded-3xl border border-border bg-white p-8 text-center'

export default function StaffRoute() {
  const { token, account, isAuthenticated, openLoginModal } = useAuth()
  const client = useMemo(() => createStaffClient(apiBaseUrl, token), [token])
  if (!isAuthenticated) return <main className={card}><h1 className="font-display text-3xl">Quản lý nhân sự</h1><p className="mt-3 text-sm text-muted">Đăng nhập bằng tài khoản chủ tiệm để tiếp tục.</p><button className="mt-6 rounded-full bg-terracotta px-5 py-3 text-sm font-semibold text-white" onClick={() => openLoginModal('Vui lòng đăng nhập bằng tài khoản chủ tiệm.')}>Đăng nhập</button></main>
  if (!account?.roles?.includes('owner')) return <main className={card}><h1 className="font-display text-3xl">Không có quyền truy cập</h1><p className="mt-3 text-sm text-muted">Trang này chỉ dành cho chủ tiệm.</p><Link to="/" className="mt-6 inline-block text-sm font-semibold text-terracotta">← Trang chủ</Link></main>
  return <StaffPage client={client} />
}
import { useMemo } from 'react'
