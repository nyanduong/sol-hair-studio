import { Link } from 'react-router-dom'
import { useState } from 'react'
import { isAppointmentCutoffReached, useAppointmentListView } from '../hooks/useAppointmentListView.js'


const HISTORY_STATUSES  = new Set(['completed', 'cancelled', 'no_show'])

const STATUS_CONFIG = {
  confirmed: {
    label: 'Đã xác nhận',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
    canReschedule: true,
  },
  in_progress: {
    label: 'Đang phục vụ',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-800 border-blue-200/60',
    canReschedule: false,
  },
  completed: {
    label: 'Đã hoàn tất',
    dot: 'bg-stone-500',
    badge: 'bg-stone-100 text-stone-700 border-stone-200/80',
    canReschedule: false,
  },
  cancelled: {
    label: 'Đã hủy',
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border-rose-200/60',
    canReschedule: false,
  },
  no_show: {
    label: 'Không đến',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-800 border-amber-200/60',
    canReschedule: false,
  },
}

const fmtDate    = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtWeekday = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long' })
const fmtTime    = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const fmtPrice   = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

function cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str
}

function fmtDuration(minutes) {
  if (!minutes || minutes <= 0) return '60 phút'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} phút`
  if (m === 0) return `${h} giờ (${h}h)`
  return `${minutes} phút (${(minutes / 60).toFixed(1).replace('.0', '')}h)`
}

function shiftLabel(isoStr) {
  const h = new Date(isoStr).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hour12: false })
  const hourNum = Number(h)
  return hourNum < 12 ? 'Buổi sáng' : hourNum < 18 ? 'Chiều' : 'Buổi tối'
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: 'Chưa xác định',
    dot: 'bg-stone-400',
    badge: 'bg-stone-50 text-stone-600 border-stone-200',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badge}`}>
      <span className={`size-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  )
}

function SkeletonCard() {
  return (
    <li className="animate-pulse overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#f3eee6] px-5 py-3">
        <div className="h-4 w-24 rounded-full bg-soft-surface" />
        <div className="h-4 w-20 rounded bg-soft-surface" />
      </div>
      <div className="p-5">
        <div className="rounded-xl border border-border/60 bg-[#faf7f2] p-4">
          <div className="flex justify-between">
            <div className="space-y-2">
              <div className="h-3 w-20 rounded bg-soft-surface" />
              <div className="h-7 w-48 rounded bg-soft-surface" />
              <div className="h-4 w-32 rounded bg-soft-surface" />
            </div>
            <div className="space-y-2 text-right">
              <div className="h-3 w-20 rounded bg-soft-surface" />
              <div className="h-3 w-14 rounded bg-soft-surface" />
              <div className="h-6 w-24 rounded bg-soft-surface" />
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2.5 pt-1">
          <div className="h-3.5 w-3/4 rounded bg-soft-surface" />
          <div className="h-3.5 w-1/2 rounded bg-soft-surface" />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[#f3eee6] bg-[#fbf9f5] px-5 py-3">
        <div className="h-3 w-36 rounded bg-soft-surface" />
        <div className="flex gap-2">
          <div className="h-8 w-18 rounded-lg bg-soft-surface" />
          <div className="h-8 w-20 rounded-lg bg-soft-surface" />
        </div>
      </div>
    </li>
  )
}

function AppointmentCard({ appointment, isUpcomingSoon, now }) {
  const start = new Date(appointment.startAt)
  const cfg = STATUS_CONFIG[appointment.status] ?? STATUS_CONFIG.completed
  const shift = shiftLabel(appointment.startAt)
  const isPast = HISTORY_STATUSES.has(appointment.status)
  const isLocked = isUpcomingSoon || !cfg.canReschedule

  return (
    <li className="group relative overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-all hover:shadow-md">
      {/* ── Cảnh báo sát giờ (< 2 giờ) ── */}
      {isUpcomingSoon && (
        <div className="flex items-center justify-between gap-2 border-b border-[#fcd5c9] bg-[#fdf0ed] px-5 py-2.5 text-xs text-[#9c2d1b]">
          <div className="flex items-center gap-2 font-medium">
            <span className="font-bold">!</span>
            <span>{start.getTime() <= now ? 'Lịch hẹn đã đến hoặc quá giờ.' : 'Lịch hẹn chỉ còn dưới 2 giờ.'}</span>
          </div>
        </div>
      )}

      {/* ── Card Header: Trạng thái & Sol Atelier ── */}
      <div className="flex items-center justify-between gap-3 border-b border-[#f3eee6] px-5 py-3">
        <StatusBadge status={appointment.status} />

        <div className="flex items-center gap-2">
          {isUpcomingSoon && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fcd5c9] bg-[#fef5f2] px-2.5 py-0.5 text-[11px] font-medium text-[#c2410c]">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Khóa đổi trực tuyến (&lt; 2h)
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#a14f3d]">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            Sol Atelier
          </span>
        </div>
      </div>

      {/* ── Card Body ── */}
      <div className="p-5">
        {/* Khung thời gian nền be/kem chuẩn style ảnh */}
        <div className="rounded-xl border border-[#efe6db] bg-[#faf6f0] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#8c827a]">Thời gian hẹn</p>
              <p className="mt-1 font-display text-2xl font-bold leading-tight text-ink">
                <time dateTime={appointment.startAt}>
                  {cap(fmtWeekday.format(start))}, {fmtDate.format(start)}
                </time>
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-terracotta">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <time dateTime={appointment.startAt}>{fmtTime.format(start)}</time>
                <span className="text-[#a14f3d]/80">({shift})</span>
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-xs font-medium text-[#6f665e]">
                {fmtDuration(appointment.totalDurationMinutes)}
              </p>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-[#8c827a]">
                {isPast ? 'Thanh toán' : 'Ước tính'}
              </p>
              {/* Kiểu chữ giá tiền: dùng font-sans hiện đại, số rõ ràng, không dùng font serif */}
              <p className="mt-0.5 font-sans text-[#a14f3d] font-bold tracking-tight sm:text-2xl">
                {appointment.totalPriceVnd > 0 ? fmtPrice.format(appointment.totalPriceVnd) : 'Liên hệ'}
              </p>
            </div>
          </div>
        </div>

        {/* Thông tin dịch vụ & stylist từ API response */}
        <div className="mt-4">
          <dl className="grid gap-2 text-xs">
            <div className="flex items-center justify-between gap-3 border-b border-[#f3eee6] pb-2">
              <dt className="shrink-0 font-medium text-muted">Dịch vụ:</dt>
              <dd className="min-w-0 break-words text-right font-semibold text-ink">
                {appointment.items.map(item => item.name).join(' · ')}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-[#f3eee6] pb-2">
              <dt className="shrink-0 font-medium text-muted">Stylist:</dt>
              <dd className="text-right font-semibold text-ink">
                {appointment.staffNameSnapshot || '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 pt-0.5">
              <dt className="shrink-0 font-medium text-muted">Thao tác trực tuyến:</dt>
              <dd className={`font-medium ${isLocked ? 'text-muted' : 'text-emerald-700'}`}>
                {isLocked ? 'Đã khóa do sát giờ hoặc trạng thái' : 'Đủ điều kiện dời / hủy'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* ── Card Footer ── */}
      <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-[#f3eee6] px-5 py-3 ${isPast ? 'bg-white' : 'bg-[#fbf9f5]'}`}>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>
            {isUpcomingSoon
              ? 'Đã khóa dời/hủy trực tuyến do sát giờ.'
              : appointment.status === 'confirmed'
                ? 'Dời/hủy trước tối thiểu 2 giờ.'
                : cfg.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/lich-cua-toi/${appointment.id}`}
            className="inline-flex min-h-8 items-center rounded-lg border border-[#e2d5c3] bg-[#f6efe6] px-4 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-[#ede3d6]"
          >
            Chi tiết
          </Link>

          {isUpcomingSoon ? (
            <a
              href="tel:19006828"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[#7a3426] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#63281c]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
              </svg>
              Hỗ trợ
            </a>
          ) : cfg.canReschedule ? (
            <a
              href={`/booking?reschedule=${appointment.id}`}
              className="inline-flex min-h-8 items-center rounded-lg bg-[#7a3426] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#63281c]"
            >
              Đổi lịch
            </a>
          ) : null}
        </div>
      </div>
    </li>
  )
}


function Toolbar({ activeTab, onTabChange, counts }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Cụm tab trái: Chỉ có "Sắp tới" và "Lịch sử" */}
      <div className="flex items-center rounded-full bg-[#f3eee6] p-1">
        <button
          type="button"
          onClick={() => onTabChange('upcoming')}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
            activeTab === 'upcoming'
              ? 'bg-white text-ink shadow-sm'
              : 'text-muted hover:text-ink'
          }`}
        >
          <span>Sắp tới</span>
          {counts.upcoming > 0 && (
            <span className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${
              activeTab === 'upcoming' ? 'bg-[#f4ebe6] text-terracotta' : 'bg-[#e7ded4] text-muted'
            }`}>
              {counts.upcoming}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onTabChange('history')}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
            activeTab === 'history'
              ? 'bg-white text-ink shadow-sm'
              : 'text-muted hover:text-ink'
          }`}
        >
          <span>Lịch sử</span>
          {counts.history > 0 && (
            <span className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${
              activeTab === 'history' ? 'bg-[#f4ebe6] text-terracotta' : 'bg-[#e7ded4] text-muted'
            }`}>
              {counts.history}
            </span>
          )}
        </button>
      </div>

      {/* Legend dot bên phải theo chuẩn trạng thái */}
      <div className="hidden items-center gap-4 text-xs text-muted md:flex">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Đã xác nhận
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-stone-500" aria-hidden="true" />
          Đã hoàn tất
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-rose-500" aria-hidden="true" />
          Đã dời/huỷ
        </span>
      </div>
    </div>
  )
}

function EmptyState({ hasOtherAppointments }) {
  return (
    <div
      role="status"
      className="mt-6 flex flex-col items-center gap-6 rounded-3xl border border-border bg-white px-6 py-20 text-center shadow-sm"
    >
      {/* Icon đồng hồ báo thức có hoa terracotta góc trên phải */}
      <div className="relative">
        <span className="flex size-24 items-center justify-center rounded-full bg-[#f4eee7] text-[#7a3426]">
          <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="13" r="8"/>
            <path d="M12 9v4l2.5 2.5"/>
            <path d="M6.5 4.5 4 7"/>
            <path d="M17.5 4.5 20 7"/>
            <path d="M9 2h6"/>
          </svg>
        </span>
        <span className="absolute right-0.5 top-0.5 flex size-6 items-center justify-center rounded-full bg-[#fdeee9] text-terracotta ring-2 ring-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <circle cx="12" cy="6" r="2"/>
            <circle cx="12" cy="18" r="2"/>
            <circle cx="6" cy="12" r="2"/>
            <circle cx="18" cy="12" r="2"/>
          </svg>
        </span>
      </div>

      <div className="max-w-md space-y-2">
        <p className="text-xs font-bold uppercase tracking-[.22em] text-terracotta">
          Khoảng lặng an yên
        </p>
        <p className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          {hasOtherAppointments ? 'Bạn chưa có lịch hẹn trong mục này' : 'Bạn chưa có lịch hẹn nào'}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">
          Hãy dành cho mình một khoảng thời gian thư thái để chăm sóc mái tóc và tái tạo năng lượng cùng các chuyên gia hàng đầu tại Sol Hair Studio.
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/#services"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#7a3426] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#63281c]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
          </svg>
          Khám phá dịch vụ
        </a>
        <a
          href="/booking"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e8e2d8] px-6 py-2.5 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-[#dcd5c9]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Đặt lịch ngay
        </a>
      </div>
    </div>
  )
}


export default function CustomerAppointmentList({ state, onLogin }) {
  const [tab, setTab] = useState('upcoming')
  const view = useAppointmentListView(state, tab)

  if (state.kind === 'denied') {
    return (
      <section role="alert" className="mt-6 flex flex-col items-start gap-4 rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
          <p className="text-sm font-medium text-ink">
            {state.error?.status === 401
              ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
              : 'Tài khoản không có quyền xem danh sách này.'}
          </p>
        </div>
        {state.error?.status === 401 && (
          <button
            type="button"
            className="inline-flex min-h-10 items-center rounded-xl bg-[#7a3426] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#63281c]"
            onClick={onLogin}
          >
            Đăng nhập lại
          </button>
        )}
      </section>
    )
  }

  const { items: currentItems, counts, empty: isEmpty } = view

  return (
    <section aria-label="Danh sách lịch hẹn" aria-busy={['loading', 'loadingMore'].includes(state.kind)}>

      <Toolbar
        activeTab={tab}
        onTabChange={setTab}
        counts={counts}
      />

      {view.incomplete && (
        <p role="status" className="mt-6 text-sm text-muted">
          {currentItems.length === 0
            ? 'Chưa tìm thấy lịch trong mục này ở phần đã tải. Hãy xem thêm để kiểm tra các lịch còn lại.'
            : 'Danh sách chưa tải hết. Xem thêm để có đầy đủ lịch trong hai mục.'}
        </p>
      )}

      {/* ── Loading Skeleton ── */}
      {state.kind === 'loading' && (
        <ul className="mt-6 grid gap-5 md:grid-cols-2" role="status" aria-label="Đang tải lịch hẹn">
          <SkeletonCard />
          <SkeletonCard />
        </ul>
      )}

      {/* ── Empty State ── */}
      {isEmpty && <EmptyState hasOtherAppointments={state.items.length > 0} />}

      {/* ── Danh sách Cards (khi không rỗng) ── */}
      {!isEmpty && currentItems.length > 0 && (
        <ul className="mt-6 grid gap-5 md:grid-cols-2">
          {currentItems.map(appointment => {
            const isUpcomingSoon = isAppointmentCutoffReached(appointment, view.now)

            return (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                isUpcomingSoon={isUpcomingSoon}
                now={view.now}
              />
            )
          })}
        </ul>
      )}

      {/* ── Lỗi tải dữ liệu ── */}
      {state.kind === 'error' && (
        <div role="alert" className="mt-6 flex flex-col items-start gap-4 rounded-2xl border border-border bg-soft-surface p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </span>
            <p className="text-sm text-ink">
              {state.restartRequired ? state.error.message : 'Chưa tải được lịch hẹn. Vui lòng kiểm tra kết nối và thử lại.'}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex min-h-10 items-center rounded-xl bg-[#7a3426] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#63281c]"
            onClick={state.retry}
          >
            {state.restartRequired ? 'Tải lại danh sách' : 'Thử lại'}
          </button>
        </div>
      )}

      {/* ── Nút Tải thêm (Pagination) ── */}
      {state.hasNextPage && state.kind !== 'error' && (
        <div className="mt-8 text-center">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full border border-terracotta px-6 py-2.5 text-sm font-semibold text-terracotta transition-colors hover:bg-terracotta hover:text-white disabled:cursor-wait disabled:opacity-50"
            disabled={state.kind === 'loadingMore'}
            onClick={state.loadMore}
          >
            {state.kind === 'loadingMore' ? 'Đang tải thêm…' : 'Xem thêm lịch hẹn'}
          </button>
        </div>
      )}
      {state.kind === 'loadingMore' && <p role="status" className="sr-only">Đang tải thêm lịch hẹn</p>}
    </section>
  )
}
