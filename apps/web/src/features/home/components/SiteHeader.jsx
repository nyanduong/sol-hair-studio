import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import UserNav from '../../auth/components/UserNav.jsx'
import { useAuth } from '../../auth/hooks/useAuth.js'

const links = [
  { href: '/#services', label: 'Dịch vụ' },
  { href: '/#experience', label: 'Trải nghiệm' },
  { href: '/#stories', label: 'Góc Sol' },
  { href: '/#contact', label: 'Về chúng tôi' },
]

export default function SiteHeader() {
  const { isAuthenticated, account, openLoginModal } = useAuth()
  const showAppointments = isAuthenticated && account?.status === 'active' &&
    Array.isArray(account.roles) && account.roles.includes('customer') &&
    !account.roles.some(role => ['owner', 'stylist'].includes(role))
  const showOwnerAppointments = isAuthenticated && account?.status === 'active' && account.roles?.includes('owner')
  const menuRef = useRef(null)
  const summaryRef = useRef(null)
  const closeMenu = () => { if (menuRef.current) menuRef.current.open = false }

  useEffect(() => {
    function dismiss(event) {
      if (event.type === 'keydown') {
        if (event.key !== 'Escape' || !menuRef.current?.open) return
        closeMenu()
        summaryRef.current?.focus()
      } else if (!menuRef.current?.contains(event.target)) closeMenu()
    }
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onBreakpoint = () => { if (desktop.matches) closeMenu() }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    desktop.addEventListener('change', onBreakpoint)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
      desktop.removeEventListener('change', onBreakpoint)
    }
  }, [])

  function navigate(event) {
    closeMenu()
    // Move focus out of the collapsed menu and into its destination.
    document.querySelector(event.currentTarget.hash)?.focus({ preventScroll: true })
  }

  function handleBookingClick(event) {
    if (!isAuthenticated) {
      event.preventDefault()
      closeMenu()
      openLoginModal('Vui lòng đăng nhập tài khoản để tiếp tục đặt lịch hẹn tại Sol Hair Studio.')
    } else {
      closeMenu()
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-canvas/95 backdrop-blur-md">
      <a href="#main-content" className="absolute left-4 top-3 -translate-y-24 rounded-full bg-ink px-5 py-3 text-sm text-white focus:translate-y-0">Bỏ qua điều hướng</a>
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <a href="/" aria-label="Sol Hair Studio — Trang chủ" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <img src="/logo/sol-logo.png" alt="" width="44" height="44" className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11" decoding="async" />
          <span className="min-w-0 leading-none">
            <span className="block font-display text-[1.05rem] font-semibold tracking-[0.13em] sm:text-xl sm:tracking-[0.18em]">SOL HAIR STUDIO</span>
            <span className="mt-1.5 block text-[0.46rem] font-medium tracking-[0.18em] text-muted sm:text-[0.5rem] sm:tracking-[0.25em]">BEAUTY SHINES WITHIN</span>
          </span>
        </a>
        <nav aria-label="Điều hướng chính" className="hidden items-center gap-5 lg:flex">
          {links.map(({ href, label }) => <a key={href} href={href} className="inline-flex min-h-11 items-center text-xs text-muted transition-colors hover:text-terracotta">{label}</a>)}
          {showOwnerAppointments && <Link to="/quan-ly/lich-hen" className="inline-flex min-h-11 items-center whitespace-nowrap text-xs text-muted transition-colors hover:text-terracotta">Lịch salon</Link>}
          {showAppointments && (
            <Link to="/lich-cua-toi" className="inline-flex min-h-11 items-center whitespace-nowrap text-xs text-muted transition-colors hover:text-terracotta">Lịch của tôi</Link>
          )}
          <a
            href="/booking"
            onClick={handleBookingClick}
            className="inline-flex min-h-11 items-center rounded-full bg-terracotta px-5 text-xs font-semibold text-white transition-colors hover:bg-terracotta-dark"
          >
            Đặt lịch
          </a>
          <UserNav />
        </nav>
        <details ref={menuRef} className="relative shrink-0 lg:hidden">
          <summary ref={summaryRef} className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full border border-border text-ink [&::-webkit-details-marker]:hidden">
            <span className="sr-only">Mở điều hướng</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </summary>
          <nav aria-label="Điều hướng chính trên điện thoại" className="absolute right-0 top-14 grid w-60 max-w-[calc(100vw-2rem)] gap-1 rounded-2xl border border-border bg-canvas p-2 shadow-lg">
            {links.map(({ href, label }) => <a key={href} href={href} onClick={navigate} className="flex min-h-11 items-center rounded-xl px-4 text-sm hover:bg-soft-surface">{label}</a>)}
            {showOwnerAppointments && <Link to="/quan-ly/lich-hen" onClick={closeMenu} className="flex min-h-11 items-center rounded-xl px-4 text-sm hover:bg-soft-surface">Lịch salon</Link>}
            {showAppointments && (
              <Link to="/lich-cua-toi" onClick={closeMenu} className="flex min-h-11 items-center rounded-xl px-4 text-sm hover:bg-soft-surface">Lịch của tôi</Link>
            )}
            <a
              href="/booking"
              onClick={handleBookingClick}
              className="flex min-h-11 items-center rounded-xl bg-terracotta/10 px-4 text-sm font-semibold text-terracotta hover:bg-terracotta/20"
            >
              Đặt lịch
            </a>
            <div className="mt-1 border-t border-border/60 pt-2 px-1">
              <UserNav />
            </div>
          </nav>
        </details>
      </div>
    </header>
  )
}
