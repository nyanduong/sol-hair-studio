import { useState } from 'react'
import CustomerAppointmentManagement from '../components/CustomerAppointmentManagement.jsx'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/hooks/useAuth.js'
import SiteHeader from '../../home/components/SiteHeader.jsx'
import SiteFooter from '../../home/components/SiteFooter.jsx'
import CustomerAppointmentDetail from '../components/CustomerAppointmentDetail.jsx'
import { isCustomerAccount } from '../hooks/useCustomerAppointments.js'
import { useCustomerAppointmentDetail } from '../hooks/useCustomerAppointmentDetail.js'

function AppointmentDetail({ token, appointmentId, onLogin }) {
  const state = useCustomerAppointmentDetail(token, appointmentId)
  const [search, setSearch] = useSearchParams()
  const [notice, setNotice] = useState('')
  function changed(value, operation) {
    if (value) setNotice(operation === 'cancel' ? 'Đã hủy lịch hẹn.' : 'Đã đổi lịch hẹn.')
    state.retry()
  }
  const close = () => setSearch(previous => {
    const next = new URLSearchParams(previous)
    next.delete('action')
    return next
  }, { replace: true })
  return <>
    {notice && <p role="status" className="mt-5 text-sm text-terracotta">{notice}</p>}
    <CustomerAppointmentDetail state={state} onLogin={onLogin} actions={state.kind === 'success' ? (
      <CustomerAppointmentManagement token={token} appointment={state.value} onChanged={changed}
        initialAction={search.get('action')} onClose={close} />
    ) : null} />
  </>
}

export default function CustomerAppointmentDetailPage() {
  const { appointmentId } = useParams()
  const { token, account, isAuthenticated, openLoginModal } = useAuth()
  const onLogin = () => openLoginModal('Đăng nhập tài khoản khách hàng để xem chi tiết lịch hẹn.')
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <Link to="/lich-cua-toi" className="inline-flex min-h-11 items-center text-sm text-muted">← Về lịch hẹn của tôi</Link>
        <h1 className="mt-4 font-display text-4xl sm:text-5xl">Chi tiết lịch hẹn</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Thông tin cuộc hẹn dành riêng cho bạn tại Sol Hair Studio.</p>
        {!isAuthenticated || !token ? (
          <section className="mt-6 rounded-3xl border border-border bg-white p-6">
            <p className="text-sm">Đăng nhập bằng tài khoản khách hàng để xem chi tiết lịch hẹn.</p>
            <button onClick={onLogin} className="mt-4 min-h-11 rounded-xl bg-terracotta px-5 py-2 text-sm font-semibold text-white">Đăng nhập để xem lịch</button>
          </section>
        ) : !isCustomerAccount(account) ? (
          <p role="alert" className="mt-6 rounded-3xl border border-border bg-white p-6 text-sm">Trang này chỉ dành cho tài khoản khách hàng đang hoạt động.</p>
        ) : (
          <AppointmentDetail
            key={JSON.stringify([token, account.id ?? account.accountId, account.roles, account.status, appointmentId])}
            token={token} appointmentId={appointmentId} onLogin={onLogin}
          />
        )}
      </main>
      <SiteFooter />
    </>
  )
}
