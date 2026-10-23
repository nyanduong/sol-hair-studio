import { mergeAppointmentEta } from '../api/appointment-eta.api.js'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { salonDate } from '../../../../../../shared/booking.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import SiteHeader from '../../home/components/SiteHeader.jsx'
import SiteFooter from '../../home/components/SiteFooter.jsx'
import OwnerAppointmentsView from '../components/OwnerAppointmentsView.jsx'
import OwnerAppointmentManagement from '../components/OwnerAppointmentManagement.jsx'
import { mergeOwnerServiceResult } from '../hooks/useOwnerAppointmentCommand.js'
import { isOwnerAccount, useOwnerAppointmentRead, ownerAppointmentStatuses } from '../hooks/useOwnerAppointments.js'

const field = 'mt-1.5 min-h-10 w-full rounded-xl border border-[#efe6db] bg-white px-3 py-2 text-xs sm:text-sm font-medium text-ink focus:border-[#3E2317] focus:outline-none transition-colors'

function OwnerWorkspace({ token, appointmentId, onLogin }) {
  const [search, setSearch] = useSearchParams()
  const [today] = useState(() => salonDate())
  const personal = search.get('view') === 'mine'
  const filters = {
    localDate: search.get('localDate') ?? today,
    staffId: search.get('staffId') ?? '',
    status: search.get('status') ?? '',
  }
  const suffix = '?' + new URLSearchParams(Object.entries({ ...filters, ...(personal ? { view: 'mine' } : {}) }).filter(([, value]) => value)).toString()

  return (
    <>
      <nav aria-label="Phạm vi lịch hẹn" className="mt-4 flex flex-wrap gap-2">
        {[['salon', 'Lịch toàn salon'], ['mine', 'Lịch của tôi']].map(([view, label]) => (
          <Link key={view} aria-current={(personal ? 'mine' : 'salon') === view ? 'page' : undefined}
            to={'/quan-ly/lich-hen?' + new URLSearchParams(Object.entries({ ...filters, ...(view === 'mine' ? { view } : {}) }).filter(([, value]) => value))}
            className={'min-h-10 rounded-full border px-5 py-2 text-sm font-semibold ' + ((personal ? 'mine' : 'salon') === view ? 'border-terracotta bg-terracotta text-white' : 'border-border bg-white text-ink')}>
            {label}
          </Link>
        ))}
      </nav>
      {appointmentId ? (
        <div className="mt-4">
          <Link
            to={'/quan-ly/lich-hen' + suffix}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#efe6db] bg-white px-4 py-1.5 text-xs font-semibold text-terracotta shadow-2xs hover:bg-soft-surface transition-colors"
          >
            ← Về lịch hẹn trong ngày
          </Link>
        </div>
      ) : (
        <OwnerFilters
          token={token}
          personal={personal}
          filters={filters}
          onChange={(name, value) => {
            const next = new URLSearchParams(Object.entries({ ...filters, [name]: value, ...(personal ? { view: 'mine' } : {}) }).filter(([, item]) => item))
            setSearch(next, { replace: true })
          }}
        />
      )}
      {personal ? <OwnerPersonalWorkspace key={JSON.stringify([appointmentId, filters])} token={token} appointmentId={appointmentId}
        filters={filters} search={suffix} onLogin={onLogin} /> : <OwnerResults
        key={JSON.stringify([appointmentId, filters])}
        token={token}
        appointmentId={appointmentId}
        filters={filters}
        search={suffix}
        onLogin={onLogin}
      />}
    </>
  )
}

function OwnerPersonalWorkspace({ token, appointmentId, filters, search, onLogin }) {
  const profile = useOwnerAppointmentRead(token, 'my-staff', {})
  if (profile.kind === 'loading') return <p role="status" className="mt-6 text-sm text-muted">Đang xác định hồ sơ stylist của bạn…</p>
  if (profile.kind !== 'success') return <section role="alert" className="mt-6 rounded-2xl border border-border bg-white p-6 text-sm">
    <p>Không xác định được hồ sơ stylist của phiên hiện tại.</p>
    <button onClick={profile.retry} className="mt-3 min-h-10 rounded-full border border-border px-4">Thử lại</button>
  </section>
  if (!profile.value) return <p role="status" className="mt-6 rounded-2xl border border-border bg-white p-6 text-sm">Tài khoản của bạn chưa có hồ sơ stylist được liên kết. Không thể hiển thị lịch được giao.</p>
  const mine = profile.value
  return <>
    <p className="mt-4 text-sm text-muted">Lịch được giao cho {mine.displayName}.</p>
    <OwnerResults key={JSON.stringify([appointmentId, filters, mine.staffId])} token={token} appointmentId={appointmentId}
      filters={{ ...filters, staffId: mine.staffId }} mineStaffId={mine.staffId} search={search} onLogin={onLogin} />
  </>
}

function OwnerFilters({ token, filters, onChange, personal = false }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const staff = useOwnerAppointmentRead(token, 'staff', {})
  const people = staff.kind === 'success' ? staff.value : []
  const activeCount = [personal ? '' : filters.staffId, filters.status].filter(Boolean).length

  return (
    <form
      aria-label="Bộ lọc lịch hẹn"
      className="mt-6 rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-4 sm:p-5 shadow-2xs"
      onSubmit={event => event.preventDefault()}
    >
      {/* Header bar: Trên mobile bấm vào để xổ xuống / thu gọn */}
      <div
        className="flex items-center justify-between cursor-pointer sm:cursor-default select-none border-b border-[#efe6db] pb-3"
        onClick={() => setIsMobileOpen(prev => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={isMobileOpen}
        onKeyDown={e => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            setIsMobileOpen(prev => !prev)
          }
        }}
      >
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-[#f0e8dc] text-terracotta">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-terracotta">
            Bộ lọc lịch hẹn
          </span>
          {activeCount > 0 && (
            <span className="rounded-full bg-terracotta px-1.5 py-0.2 text-[10px] font-bold text-white sm:hidden">
              {activeCount}
            </span>
          )}
        </div>

        {/* Nút toggle trên mobile / Nhãn trên desktop */}
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">Dashboard quản lý</span>
          <button
            type="button"
            aria-label={isMobileOpen ? 'Thu gọn bộ lọc' : 'Mở rộng bộ lọc'}
            className="flex items-center gap-1 text-xs font-medium text-terracotta sm:hidden"
            onClick={e => {
              e.stopPropagation()
              setIsMobileOpen(prev => !prev)
            }}
          >
            <span>{isMobileOpen ? 'Thu gọn' : 'Lọc lịch'}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${isMobileOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Nội dung các trường lọc: Trên mobile thu lại mặc định, click xổ xuống; desktop luôn hiển thị */}
      <div className={`${isMobileOpen ? 'block' : 'hidden'} mt-4 sm:block sm:mt-4`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-ink">
            Ngày hẹn
            <input
              type="date"
              required
              className={field}
              value={filters.localDate}
              onChange={event => onChange('localDate', event.target.value)}
            />
          </label>

          {!personal && <label className="text-xs font-semibold text-ink">
            Stylist
            <select
              className={field}
              value={filters.staffId}
              onChange={event => onChange('staffId', event.target.value)}
            >
              <option value="">Tất cả stylist</option>
              {filters.staffId && !people.some(person => person.staffId === filters.staffId) && (
                <option value={filters.staffId}>Stylist đã chọn</option>
              )}
              {people.map(person => (
                <option key={person.staffId} value={person.staffId}>
                  {person.displayName}
                  {person.isActive ? '' : ' (ngừng hoạt động)'}
                </option>
              ))}
            </select>
            {staff.kind === 'loading' && (
              <span role="status" className="mt-1 block text-[11px] font-normal text-muted">
                Đang tải stylist…
              </span>
            )}
            {['error', 'denied'].includes(staff.kind) && (
              <span role="alert" className="mt-1 block text-[11px] font-normal text-terracotta">
                Không tải được danh sách stylist.{' '}
                <button type="button" onClick={staff.retry} className="underline">
                  Thử lại
                </button>
              </span>
            )}
          </label>}

          <label className="text-xs font-semibold text-ink">
            Trạng thái
            <select
              className={field}
              value={filters.status}
              onChange={event => onChange('status', event.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(ownerAppointmentStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </form>
  )
}

function OwnerResults({ token, appointmentId, filters, search, onLogin, mineStaffId }) {
  const [notice, setNotice] = useState('')
  const [serviceResult, setServiceResult] = useState(null)
  const [etaResult, setEtaResult] = useState(null)
  const state = useOwnerAppointmentRead(
    token,
    appointmentId ? 'detail' : 'list',
    appointmentId ? { id: appointmentId, ...(mineStaffId ? { mineStaffId } : {}) } : { ...filters, ...(mineStaffId ? { mineStaffId } : {}) },
  )
  const displayed = mergeAppointmentEta(mergeOwnerServiceResult(state, serviceResult), etaResult)
  function changed(value, operation) {
    if (value && operation === 'eta') setEtaResult(value)
    if (value && ['start', 'complete'].includes(operation)) setServiceResult(value)
    if (value) setNotice(operation === 'eta' ? 'Đã cập nhật giờ dự kiến xong.' : operation === 'start' ? 'Đã bắt đầu phục vụ.' : operation === 'complete' ? 'Đã hoàn tất phục vụ.' : operation === 'reschedule' ? 'Đã đổi lịch hẹn.' : operation === 'cancel' ? 'Đã hủy lịch hẹn.' : 'Đã đánh dấu không đến.')
    void state.retry()
  }
  return <>
    {notice && <p role="status" className="mt-4 text-sm text-terracotta">{notice}</p>}
    <OwnerAppointmentsView state={displayed} detailed={Boolean(appointmentId)} search={search} onLogin={onLogin}
      actions={appointmentId && displayed.kind === 'success' ? (
        <OwnerAppointmentManagement key={displayed.value.id + ':' + displayed.value.revision}
          token={token} appointment={displayed.value} personalStaffId={mineStaffId} onChanged={changed} />
      ) : null} />
  </>
}

export default function OwnerAppointmentsPage() {
  const { appointmentId } = useParams()
  const { token, account, isAuthenticated, openLoginModal } = useAuth()
  const onLogin = () => openLoginModal('Đăng nhập tài khoản chủ tiệm để xem lịch salon.')

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex min-h-10 items-center text-xs sm:text-sm text-muted hover:text-ink transition-colors">
          ← Về trang chủ
        </Link>

        {/* ── Page Header Dashboard ── */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-[#efe6db] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#f0e8dc] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-terracotta">
                Vận hành salon
              </span>
              <span className="text-xs text-muted">· Lịch salon</span>
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold text-ink sm:text-4xl">
              {appointmentId ? 'Chi tiết lịch hẹn' : 'Lịch hẹn trong ngày'}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted">
              Theo dõi lịch toàn salon · thời gian hiển thị theo giờ Việt Nam.
            </p>
          </div>
        </div>

        {/* ── Content Area ── */}
        <div className="mt-6">
          {!isAuthenticated || !token ? (
            <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
              <p className="text-sm text-ink">Đăng nhập bằng tài khoản chủ tiệm để tiếp tục.</p>
              <button
                className="mt-4 inline-flex min-h-11 items-center rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-terracotta-dark"
                onClick={onLogin}
              >
                Đăng nhập để xem lịch
              </button>
            </section>
          ) : !isOwnerAccount(account) ? (
            <p role="alert" className="rounded-2xl border border-border bg-white p-6 text-sm text-ink shadow-sm">
              Trang này chỉ dành cho Owner đang hoạt động.
            </p>
          ) : (
            <OwnerWorkspace
              key={JSON.stringify([token, account.accountId ?? account.id, account.roles, account.status])}
              token={token}
              appointmentId={appointmentId}
              onLogin={onLogin}
            />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
