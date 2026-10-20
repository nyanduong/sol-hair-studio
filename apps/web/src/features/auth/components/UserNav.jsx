import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'

function getRoleLabel(roles = []) {
  if (roles.includes('owner')) return 'Chủ tiệm'
  if (roles.includes('stylist')) return 'Stylist'
  return 'Khách hàng'
}

export default function UserNav() {
  const { isAuthenticated, account, openLoginModal, logout } = useAuth()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('pointerdown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
    }
  }, [isDropdownOpen])

  if (!isAuthenticated || !account) {
    return (
      <button
        type="button"
        onClick={() => openLoginModal()}
        className="inline-flex min-h-11 items-center rounded-full border border-border bg-white px-4 text-xs font-medium text-ink transition hover:border-terracotta hover:text-terracotta"
      >
        Đăng nhập
      </button>
    )
  }

  const roleLabel = getRoleLabel(account.roles)

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsDropdownOpen((prev) => !prev)}
        aria-expanded={isDropdownOpen}
        aria-haspopup="true"
        className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:border-terracotta"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-soft-surface text-[0.65rem] font-bold text-terracotta">
          {account.email?.charAt(0).toUpperCase()}
        </span>
        <span className="max-w-[100px] truncate text-left sm:max-w-[140px]">
          {account.email}
        </span>
        <svg
          className={`h-3.5 w-3.5 text-muted transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isDropdownOpen && (
        <div
          role="menu"
          className="absolute right-0 top-13 z-50 w-56 rounded-2xl border border-border bg-canvas p-2 shadow-xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="border-b border-border/70 px-3 py-2">
            <p className="truncate text-xs font-semibold text-ink">{account.email}</p>
            <span className="mt-1 inline-block rounded-md bg-soft-surface px-2 py-0.5 text-[0.65rem] font-medium text-muted">
              {roleLabel}
            </span>
          </div>

          <div className="pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsDropdownOpen(false)
                void logout()
              }}
              className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-xs text-terracotta hover:bg-terracotta/10 transition"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
