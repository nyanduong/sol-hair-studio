import { useEffect } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { useAuth } from '../../auth/hooks/useAuth.js'

// Giữ liên kết React cũ hoạt động, nhưng giao diện quản trị chính thức là EJS.
export default function LegacyStaffRedirect() {
  const { token } = useAuth()

  useEffect(() => {
    const target = new URL('/admin/nhan-su', apiBaseUrl)
    if (token) target.searchParams.set('token', token)
    window.location.replace(target.toString())
  }, [token])

  return <main className="mx-auto mt-16 max-w-xl rounded-3xl border border-border bg-white p-8 text-center">
    <h1 className="font-display text-3xl">Đang mở quản trị nhân sự…</h1>
    <p className="mt-3 text-sm text-muted">Bạn sẽ được chuyển đến cổng quản trị của Sol Hair Studio.</p>
  </main>
}
