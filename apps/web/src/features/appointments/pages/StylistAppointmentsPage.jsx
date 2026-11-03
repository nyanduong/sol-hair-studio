import AppointmentEta from '../components/AppointmentEta.jsx'
import StylistAppointmentCorrection from '../components/StylistAppointmentCorrection.jsx'
import { mergeAppointmentEta } from '../api/appointment-eta.api.js'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { salonDate } from '../../../../../../shared/booking.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import SiteHeader from '../../home/components/SiteHeader.jsx'
import SiteFooter from '../../home/components/SiteFooter.jsx'
import OwnerAppointmentsView from '../components/OwnerAppointmentsView.jsx'
import OwnerAppointmentService from '../components/OwnerAppointmentService.jsx'
import { isStylistAccount, useStylistAppointments } from '../hooks/useStylistAppointments.js'

function StylistWorkspace({ token, appointmentId, localDate, onLogin }) {
  const state = useStylistAppointments(token, appointmentId, localDate)
  const [operation, setOperation] = useState(null)
  const [notice, setNotice] = useState('')
  const [etaResult, setEtaResult] = useState(null)
  const displayed = mergeAppointmentEta(state, etaResult)
  const current = displayed.kind === 'success' ? displayed.value : null
  function changed(value, action) {
    if (value && action === 'eta') setEtaResult(value)
    if (value) setNotice(action?.startsWith('correct-') ? 'Đã sửa thao tác nhầm. Lịch sử cũ được giữ nguyên.' : action === 'eta' ? 'Đã cập nhật giờ dự kiến xong.' : action === 'start' ? 'Đã bắt đầu phục vụ.' : 'Đã hoàn tất phục vụ.')
    if (action?.startsWith('correct-')) setEtaResult(null)
    setOperation(null)
    void state.retry()
  }
  const canServe = current && ['confirmed', 'in_progress'].includes(current.status) &&
    Number.isSafeInteger(current.revision) && current.revision >= 0 && current.revision < Number.MAX_SAFE_INTEGER
  const canCorrect = current && ['in_progress', 'completed'].includes(current.status) &&
    Number.isSafeInteger(current.revision) && current.revision >= 0 && current.revision < Number.MAX_SAFE_INTEGER
  return <>
    {notice && <p role="status" className="mt-4 text-sm text-terracotta">{notice}</p>}
    <OwnerAppointmentsView state={displayed} detailed={Boolean(appointmentId)} audience="stylist" basePath="/nhan-vien/lich-hen"
      search={'?' + new URLSearchParams({ localDate })} onLogin={onLogin}
      actions={canServe || canCorrect ? <div className="flex flex-wrap justify-end gap-3 border-t border-[#f3eee6] bg-[#faf6f0]/50 px-6 py-5 sm:px-8">
        {canServe && <button className="min-h-11 rounded-full bg-terracotta hover:bg-terracotta-dark px-5 py-2 text-sm font-semibold text-white shadow-2xs hover:shadow transition-all"
          onClick={() => setOperation(current.status === 'confirmed' ? 'start' : 'complete')}>
          {current.status === 'confirmed' ? 'Bắt đầu phục vụ' : 'Hoàn tất phục vụ'}
        </button>}
        {canCorrect && <button className="min-h-11 rounded-full border border-border bg-white px-5 py-2 text-sm font-semibold text-ink hover:bg-soft-surface" onClick={() => setOperation('correction')}>Sửa thao tác nhầm</button>}
        {current.status === 'in_progress' && <button className="min-h-11 rounded-full border border-border bg-white hover:bg-soft-surface px-5 py-2 text-sm font-semibold text-ink transition-colors" onClick={() => setOperation('eta')}>Cập nhật giờ dự kiến xong</button>}
      </div> : null} />
    {current && operation === 'correction' && <StylistAppointmentCorrection key={current.id + ':' + current.revision}
      token={token} appointment={current} onClose={() => setOperation(null)} onChanged={changed} />}
    {current && operation === 'eta' && <AppointmentEta actor="stylist" token={token} appointment={current}
      onClose={() => setOperation(null)} onChanged={changed} />}
    {current && ['start', 'complete'].includes(operation) && <OwnerAppointmentService key={current.id + ':' + current.revision + ':' + operation}
      actor="stylist" token={token} appointment={current} operation={operation}
      onClose={() => setOperation(null)} onChanged={changed} />}
  </>
}

export default function StylistAppointmentsPage() {
  const { appointmentId } = useParams()
  const [search, setSearch] = useSearchParams()
  const [today] = useState(() => salonDate())
  const localDate = search.get('localDate') ?? today
  const { token, account, isAuthenticated, openLoginModal } = useAuth()
  const onLogin = () => openLoginModal('Đăng nhập tài khoản stylist để xem lịch được giao.')
  return <>
    <SiteHeader />
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">{appointmentId ? 'Chi tiết lịch được giao' : 'Lịch của tôi'}</h1>
      <p className="mt-2 text-sm text-muted">Lịch được phân công cho bạn · thời gian Việt Nam.</p>
      {!isAuthenticated || !token ? <section className="mt-6 rounded-2xl border border-border bg-white p-6 text-sm">
        <p>Đăng nhập bằng tài khoản stylist để tiếp tục.</p>
        <button className="mt-4 min-h-11 rounded-full bg-terracotta px-5 py-2 text-white" onClick={onLogin}>Đăng nhập để xem lịch</button>
      </section> : !isStylistAccount(account) ? <p role="alert" className="mt-6 rounded-2xl border border-border bg-white p-6 text-sm">Trang này chỉ dành cho Stylist đang hoạt động.</p> : <>
        {appointmentId ? <Link to={'/nhan-vien/lich-hen?' + new URLSearchParams({ localDate })} className="mt-4 inline-flex min-h-11 items-center text-sm text-terracotta">← Về lịch của tôi</Link>
          : <label className="mt-6 block max-w-xs text-sm font-semibold">Ngày hẹn
            <input type="date" required value={localDate}
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-ink"
              onChange={event => setSearch({ localDate: event.target.value }, { replace: true })} />
          </label>}
        <StylistWorkspace key={JSON.stringify([token, account.accountId ?? account.id, account.roles, account.status, appointmentId, localDate])}
          token={token} appointmentId={appointmentId} localDate={localDate} onLogin={onLogin} />
      </>}
    </main>
    <SiteFooter />
  </>
}
