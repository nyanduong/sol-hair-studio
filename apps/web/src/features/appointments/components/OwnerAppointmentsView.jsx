import { Link } from 'react-router-dom'
import { ownerAppointmentStatuses } from '../hooks/useOwnerAppointments.js'

const date = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
const button = 'min-h-10 rounded-full border border-terracotta px-5 py-2 text-xs sm:text-sm font-semibold text-terracotta hover:bg-terracotta hover:text-white transition-colors disabled:opacity-50'

const STATUS_CONFIG = {
  confirmed: {
    label: 'Đã xác nhận',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/60',
  },
  in_progress: {
    label: 'Đang phục vụ',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-800 border-blue-200/60',
  },
  completed: {
    label: 'Đã hoàn tất',
    dot: 'bg-stone-500',
    badge: 'bg-stone-100 text-stone-700 border-stone-200/80',
  },
  cancelled: {
    label: 'Đã hủy',
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border-rose-200/60',
  },
  no_show: {
    label: 'Không đến',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-800 border-amber-200/60',
  },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: ownerAppointmentStatuses[status] ?? status,
    dot: 'bg-stone-400',
    badge: 'bg-stone-50 text-stone-600 border-stone-200',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.badge}`}>
      <span className={`size-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {ownerAppointmentStatuses[status] ?? cfg.label}
    </span>
  )
}

function CompactAppointmentCard({ appointment, search }) {
  const start = new Date(appointment.startAt)
  const end = new Date(appointment.endAt)

  return (
    <article className="group flex h-full flex-col justify-between rounded-2xl border border-[#efe6db] bg-white p-4 shadow-2xs transition-all hover:border-[#a14f3d] hover:shadow-sm sm:p-5">
      <div>
        {/* Row 1: Time range + Status */}
        <div className="flex items-center justify-between gap-2 border-b border-[#f3eee6] pb-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#faf6f0] text-terracotta">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span className="font-display text-xl font-bold text-ink sm:text-2xl">
              <time dateTime={appointment.startAt}>{time.format(start)}</time>
              <span className="font-normal text-muted text-sm sm:text-base"> – </span>
              <time dateTime={appointment.endAt}>{time.format(end)}</time>
            </span>
          </div>
          <StatusBadge status={appointment.status} />
        </div>

        {/* Row 2: Customer & Stylist (Compact 2 cols) */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-xl border border-[#efe6db] bg-[#faf6f0] p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Khách hàng</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-ink">
              {appointment.customerSnapshot.displayName}
            </p>
            <p className="text-[11px] text-muted">{appointment.customerSnapshot.phone}</p>
          </div>

          <div className="rounded-xl border border-[#efe6db] bg-[#faf6f0] p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Stylist</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-ink">
              {appointment.staffNameSnapshot}
            </p>
            <p className="text-[11px] text-muted">Thời lượng: <span className="font-semibold text-ink">{appointment.totalDurationMinutes} phút</span></p>
          </div>
        </div>

        {/* Row 3: Services (Compact Tags) */}
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c827a]">Dịch vụ đã đặt</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {appointment.items.map(item => (
              <span
                key={item.serviceId}
                className="inline-flex items-center rounded-lg border border-[#efe6db] bg-[#faf6f0] px-2.5 py-1 text-xs font-medium text-ink"
              >
                {item.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Card Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-[#f3eee6] pt-3">
        <span className="text-[11px] text-muted">
          {date.format(start)} · Giờ Việt Nam
        </span>
        <Link
          to={'/quan-ly/lich-hen/' + appointment.id + search}
          className="inline-flex items-center gap-1 text-xs font-semibold text-terracotta hover:underline"
        >
          Xem chi tiết →
        </Link>
      </div>
    </article>
  )
}

function DetailedAppointmentView({ appointment, actions }) {
  const start = new Date(appointment.startAt)
  const end = new Date(appointment.endAt)

  return (
    <article className="overflow-hidden rounded-3xl border border-[#efe6db] bg-white shadow-sm">
      {/* ── Detail Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f3eee6] px-6 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Chi tiết lịch hẹn:</span>
          <span className="font-mono text-sm font-semibold text-ink">
            Mã lịch: {appointment.id}
          </span>
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      {/* ── Detail Body 2 Columns Layout ── */}
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-12">
        {/* Cột trái: Thời gian & Nhân sự / Khách hàng */}
        <div className="space-y-4 lg:col-span-5">
          {/* Card Thời gian hẹn */}
          <section aria-label="Thời gian hẹn" className="rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-5 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8c827a]">Thời gian hẹn</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold text-ink">
                <time dateTime={appointment.startAt}>{time.format(start)}</time>
                {' – '}
                <time dateTime={appointment.endAt}>{time.format(end)}</time>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {date.format(start)} · Giờ Việt Nam
            </p>
            <p className="mt-2 text-xs text-muted">
              Thời lượng dịch vụ: <span className="font-semibold text-ink">{appointment.totalDurationMinutes} phút</span>
            </p>
          </section>

          {['in_progress', 'completed'].includes(appointment.status) && (
            <section aria-label="Thời gian phục vụ thực tế" className="rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-5 shadow-2xs">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8c827a]">Thời gian phục vụ thực tế</p>
              <p className="mt-2 text-xs text-muted">Bắt đầu thực tế: <span className="font-semibold text-ink">{appointment.startedAt ? date.format(new Date(appointment.startedAt)) + ' ' + time.format(new Date(appointment.startedAt)) : 'Chưa có thông tin.'}</span></p>
              {appointment.status === 'completed' && <p className="mt-2 text-xs text-muted">Hoàn tất thực tế: <span className="font-semibold text-ink">{appointment.completedAt ? date.format(new Date(appointment.completedAt)) + ' ' + time.format(new Date(appointment.completedAt)) : 'Chưa có thông tin.'}</span></p>}
            </section>
          )}

          {/* Card Khách hàng */}
          <section aria-label="Khách hàng" className="rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-5 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8c827a]">Khách hàng</p>
            <p className="mt-2 text-base font-bold text-ink">{appointment.customerSnapshot.displayName}</p>
            <p className="mt-0.5 text-xs text-muted">{appointment.customerSnapshot.phone}</p>
          </section>

          {/* Card Stylist */}
          <section aria-label="Stylist" className="rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-5 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8c827a]">Stylist phụ trách</p>
            <p className="mt-2 text-base font-bold text-ink">{appointment.staffNameSnapshot}</p>
          </section>
        </div>

        {/* Cột phải: Dịch vụ & Giá */}
        <div className="space-y-4 lg:col-span-7">
          <section aria-label="Dịch vụ đã đặt" className="rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-5 sm:p-6 shadow-2xs">
            <div className="flex items-center justify-between border-b border-[#efe6db] pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-terracotta">
                Dịch vụ đã đặt
              </h2>
              <span className="text-xs text-muted">{appointment.items.length} dịch vụ</span>
            </div>

            <ul className="mt-4 space-y-3">
              {appointment.items.map(item => (
                <li
                  key={item.serviceId}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#efe6db] bg-white p-3.5 shadow-2xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink text-sm sm:text-base">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted">{item.durationMinutes} phút</p>
                  </div>
                  <p className="font-sans text-sm sm:text-base font-bold text-terracotta">
                    {money.format(item.priceVnd)}
                  </p>
                </li>
              ))}
            </ul>

            {/* Tổng giá */}
            <div className="mt-5 flex items-center justify-between border-t border-[#efe6db] pt-4">
              <span className="text-sm font-semibold text-muted">Tổng giá dự kiến</span>
              <span className="font-sans text-xl sm:text-2xl font-bold text-terracotta">
                {money.format(appointment.totalPriceVnd)}
              </span>
            </div>
          </section>
        </div>
      </div>
      {actions}
    </article>
  )
}

export default function OwnerAppointmentsView({ state, detailed = false, search = '', onLogin, actions }) {
  if (state.kind === 'denied' || state.kind === 'notFound') {
    return (
      <section role="alert" className="mt-6 rounded-2xl border border-border bg-white p-6 text-sm">
        <p>
          {state.error?.code === 'APPOINTMENT_NOT_ASSIGNED' ? 'Lịch này không được phân công cho bạn. Quay về Lịch toàn salon để quản lý.' : state.kind === 'notFound'
            ? 'Không tìm thấy lịch hẹn hoặc bạn không có quyền xem.'
            : state.error?.status === 401
              ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
              : 'Tài khoản không có quyền truy cập dữ liệu Owner.'}
        </p>
        {state.error?.status === 401 && (
          <button className={button + ' mt-4'} onClick={onLogin}>
            Đăng nhập lại
          </button>
        )}
      </section>
    )
  }

  return (
    <section
      className="mt-6"
      aria-label={detailed ? 'Chi tiết lịch hẹn Owner' : 'Danh sách lịch hẹn trong ngày'}
      aria-busy={['loading', 'loadingMore'].includes(state.kind)}
    >
      {state.kind === 'loading' && (
        <p role="status" className="rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-6 text-sm text-muted">
          Đang tải lịch hẹn…
        </p>
      )}

      {detailed && state.kind === 'success' && (
        <DetailedAppointmentView appointment={state.value} actions={actions} />
      )}

      {!detailed && (
        <>
          {state.kind === 'success' && state.items.length === 0 && (
            <p role="status" className="rounded-2xl border border-border bg-white p-6 text-sm text-muted">
              Không có lịch hẹn phù hợp với bộ lọc này.
            </p>
          )}

          {/* Grid compact dashboard cards: 2 cột trên md, 3 cột trên 2xl */}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.items.map(appointment => (
              <li key={appointment.id}>
                <CompactAppointmentCard appointment={appointment} search={search} />
              </li>
            ))}
          </ul>
        </>
      )}

      {state.kind === 'error' && (
        <div role="alert" className="mt-4 rounded-2xl border border-terracotta/20 bg-terracotta/5 p-5 text-sm text-ink">
          <p>
            {state.restartRequired
              ? state.error.message
              : state.error?.status === 400
                ? 'Ngày, bộ lọc hoặc mã lịch không hợp lệ.'
                : 'Không tải được dữ liệu. Vui lòng thử lại.'}
          </p>
          <button className={button + ' mt-4'} onClick={state.retry}>
            {state.restartRequired ? 'Tải lại danh sách' : 'Thử lại'}
          </button>
        </div>
      )}

      {!detailed && state.hasNextPage && state.kind !== 'error' && (
        <div className="mt-6 text-center">
          <button
            className={button}
            disabled={state.kind === 'loadingMore'}
            onClick={state.loadMore}
          >
            {state.kind === 'loadingMore' ? 'Đang tải thêm…' : 'Xem thêm lịch hẹn'}
          </button>
        </div>
      )}
    </section>
  )
}
