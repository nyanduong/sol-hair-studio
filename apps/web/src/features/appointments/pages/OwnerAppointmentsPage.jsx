import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { salonDate } from '../../../../../../shared/booking.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import SiteHeader from '../../home/components/SiteHeader.jsx'
import SiteFooter from '../../home/components/SiteFooter.jsx'
import OwnerAppointmentsView from '../components/OwnerAppointmentsView.jsx'
import { isOwnerAccount, useOwnerAppointmentRead, ownerAppointmentStatuses } from '../hooks/useOwnerAppointments.js'

const field = 'mt-1.5 min-h-10 w-full rounded-xl border border-[#efe6db] bg-white px-3 py-2 text-xs sm:text-sm font-medium text-ink focus:border-[#3E2317] focus:outline-none transition-colors'

function OwnerWorkspace({ token, appointmentId, onLogin }) {
  const [search, setSearch] = useSearchParams()
  const [today] = useState(() => salonDate())
  const filters = {
    localDate: search.get('localDate') ?? today,
    staffId: search.get('staffId') ?? '',
    status: search.get('status') ?? '',
  }
  const suffix = '?' + new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString()

  return (
    <>
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
          filters={filters}
          onChange={(name, value) => {
            const next = new URLSearchParams(Object.entries({ ...filters, [name]: value }).filter(([, item]) => item))
            setSearch(next, { replace: true })
          }}
        />
      )}
      <OwnerResults
        token={token}
        appointmentId={appointmentId}
        filters={filters}
        search={suffix}
        onLogin={onLogin}
      />
    </>
  )
}

function OwnerFilters({ token, filters, onChange }) {
  const staff = useOwnerAppointmentRead(token, 'staff', {})
  const people = staff.kind === 'success' ? staff.value : []

  return (
    <form
      aria-label="Bộ lọc lịch hẹn"
      className="mt-6 rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-4 sm:p-5 shadow-2xs"
      onSubmit={event => event.preventDefault()}
    >
      <div className="flex items-center justify-between border-b border-[#efe6db] pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-[#f0e8dc] text-terracotta">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-terracotta">
            Bộ lọc lịch hẹn
          </span>
        </div>
        <span className="text-xs text-muted">Dashboard quản lý</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
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

        <label className="text-xs font-semibold text-ink">
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
        </label>

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
    </form>
  )
}

function OwnerResults({ token, appointmentId, filters, search, onLogin }) {
  const state = useOwnerAppointmentRead(
    token,
    appointmentId ? 'detail' : 'list',
    appointmentId ? { id: appointmentId } : filters,
  )
  return <OwnerAppointmentsView state={state} detailed={Boolean(appointmentId)} search={search} onLogin={onLogin} />
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
