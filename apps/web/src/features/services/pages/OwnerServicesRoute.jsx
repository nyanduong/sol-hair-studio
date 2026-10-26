import { Link } from 'react-router-dom'
import { apiBaseUrl } from '../../../config/env.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import OwnerServicesPage from './OwnerServicesPage.jsx'

const card = 'mx-auto mt-16 max-w-xl rounded-3xl border border-border bg-white p-8 text-center shadow-sm'

export default function OwnerServicesRoute() {
  const { token, account, isAuthenticated, openLoginModal } = useAuth()

  if (!isAuthenticated) {
    return (
      <main className={card}>
        <div className="mx-auto size-12 grid place-items-center rounded-full bg-soft-surface text-terracotta">
          <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold text-ink">Quản lý dịch vụ & hình ảnh</h1>
        <p className="mt-3 text-sm text-muted">
          Vui lòng đăng nhập bằng tài khoản chủ tiệm để truy cập trang quản lý dịch vụ.
        </p>
        <button
          type="button"
          className="mt-6 rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-terracotta-dark transition-colors"
          onClick={() => openLoginModal('Vui lòng đăng nhập bằng tài khoản chủ tiệm.')}
        >
          Đăng nhập ngay
        </button>
      </main>
    )
  }

  if (!account?.roles?.includes('owner')) {
    return (
      <main className={card}>
        <div className="mx-auto size-12 grid place-items-center rounded-full bg-rose-50 text-rose-600">
          <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold text-ink">Không có quyền truy cập</h1>
        <p className="mt-3 text-sm text-muted">
          Trang quản lý dịch vụ chỉ dành cho tài khoản có vai trò chủ tiệm (Owner).
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-ink hover:bg-soft-surface transition-colors"
        >
          ← Về trang chủ
        </Link>
      </main>
    )
  }

  return <OwnerServicesPage apiBaseUrl={apiBaseUrl} token={token} />
}
