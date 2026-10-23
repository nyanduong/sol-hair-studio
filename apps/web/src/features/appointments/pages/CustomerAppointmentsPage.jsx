import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/hooks/useAuth.js'
import SiteHeader from '../../home/components/SiteHeader.jsx'
import SiteFooter from '../../home/components/SiteFooter.jsx'
import CustomerAppointmentList from '../components/CustomerAppointmentList.jsx'
import { isCustomerAccount, useCustomerAppointments } from '../hooks/useCustomerAppointments.js'

function CustomerAppointments({ token, onLogin }) {
  const state = useCustomerAppointments(token)
  return <CustomerAppointmentList state={state} onLogin={onLogin} />
}

export default function CustomerAppointmentsPage() {
  const { token, account, isAuthenticated, openLoginModal } = useAuth()
  const onLogin = () => openLoginModal('Đăng nhập tài khoản khách hàng để xem lịch hẹn.')
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex min-h-11 items-center text-sm text-muted">← Về trang chủ</Link>

        {/* ── page header ── */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mt-2 font-display text-4xl sm:text-5xl text-ink">Lịch hẹn của tôi</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Theo dõi và quản lý những cuộc hẹn làm đẹp của bạn với nghệ nhân tạo mẫu tóc tại Sol Hair Studio.
            </p>
          </div>
          <Link
            to="/booking"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#7a3426] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#63281c]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Đặt lịch mới
          </Link>
        </div>

        {/* ── content ── */}
        <div className="mt-6">
          {!isAuthenticated || !token ? (
            <section className="rounded-2xl border border-border bg-white p-6">
              <p>Đăng nhập bằng tài khoản khách hàng để xem lịch hẹn của bạn.</p>
              <button className="mt-4 min-h-11 rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-terracotta-dark" onClick={onLogin}>
                Đăng nhập để xem lịch
              </button>
            </section>
          ) : !isCustomerAccount(account) ? (
            <p role="alert" className="rounded-2xl border border-border bg-white p-6">
              Trang này chỉ dành cho tài khoản khách hàng đang hoạt động.
            </p>
          ) : (
            <CustomerAppointments
              key={JSON.stringify([token, account.id ?? account.accountId, account.roles, account.status])}
              token={token}
              onLogin={onLogin}
            />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
