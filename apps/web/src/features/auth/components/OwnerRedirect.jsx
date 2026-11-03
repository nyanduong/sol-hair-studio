import { useEffect, useRef } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { useAuth } from '../hooks/useAuth.js'

// A full navigation enters the EJS workspace. The token travels in a POST body,
// never in the dashboard URL; the server validates the role and issues its cookie.
export default function OwnerRedirect({ children }) {
  const { token, account, isAuthenticated, isSessionChecking } = useAuth()
  const form = useRef(null)
  const owner = isAuthenticated && account?.roles?.includes('owner')

  useEffect(() => {
    if (owner && !isSessionChecking) form.current?.submit()
  }, [owner, token, isSessionChecking])

  if (isSessionChecking) return <p role="status" className="p-8 text-center">Đang kiểm tra phiên đăng nhập…</p>
  if (!owner) return children
  return (
    <main className="p-8 text-center">
      <p role="status">Đang chuyển đến trang quản trị…</p>
      <form ref={form} method="post" action={`${apiBaseUrl}/admin/session`}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="mt-4 underline">Mở dashboard quản trị</button>
      </form>
    </main>
  )
}
