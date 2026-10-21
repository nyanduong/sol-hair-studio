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

const fmtWeekday = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  weekday: 'long',
})

const fmtDate = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const fmtDay = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
})

const fmtMonth = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  month: 'numeric',
})

const fmtTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

const button =
  'mt-4 inline-flex min-h-11 items-center rounded-xl bg-terracotta px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-terracotta-dark'

function cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str
}

export default function CustomerAppointmentDetail({ state, onLogin }) {
  if (state.kind === 'loading') {
    return (
      <section role="status" aria-busy="true" className="mt-6 rounded-3xl border border-border bg-white p-6 sm:p-8 shadow-sm">
        <p className="text-sm font-medium text-muted">Đang tải chi tiết lịch hẹn…</p>
        <div aria-hidden="true" className="mt-6 grid animate-pulse gap-6 motion-reduce:animate-none lg:grid-cols-12">
          <div className="h-64 rounded-2xl bg-soft-surface lg:col-span-5" />
          <div className="h-64 rounded-2xl bg-soft-surface lg:col-span-7" />
        </div>
      </section>
    )
  }

  if (state.kind !== 'success') {
    const status = state.error?.status
    const message =
      state.kind === 'notFound'
        ? 'Không tìm thấy lịch hẹn hoặc bạn không có quyền xem lịch này.'
        : state.kind === 'invalid'
          ? 'Đường dẫn lịch hẹn không hợp lệ.'
          : status === 401
            ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
            : state.kind === 'denied'
              ? 'Tài khoản không có quyền xem chi tiết lịch hẹn này.'
              : 'Chưa tải được chi tiết lịch hẹn. Vui lòng kiểm tra kết nối và thử lại.'

    return (
      <section role="alert" className="mt-6 rounded-3xl border border-border bg-white p-6 sm:p-8 shadow-sm">
        <p className="text-sm leading-6 text-ink">{message}</p>
        {state.kind === 'error' && (
          <button className={button} onClick={state.retry}>
            Thử lại
          </button>
        )}
        {status === 401 && (
          <button className={button} onClick={onLogin}>
            Đăng nhập lại
          </button>
        )}
      </section>
    )
  }

  const appointment = state.value
  const startDate = new Date(appointment.startAt)
  const endDate = new Date(appointment.endAt)
  const statusCfg = STATUS_CONFIG[appointment.status] ?? {
    label: 'Chưa xác định',
    dot: 'bg-stone-400',
    badge: 'bg-stone-50 text-stone-600 border-stone-200',
  }

  return (
    <article
      aria-label="Thông tin lịch hẹn"
      className="mt-6 overflow-hidden rounded-3xl border border-border bg-white shadow-sm"
    >
      {/* ── Header: Mã lịch hẹn & Trạng thái (chuẩn theo Card_detail.png) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f3eee6] px-6 py-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Mã hẹn:</span>
          <span className="font-mono text-sm font-semibold text-ink sm:text-base">
            {appointment.id}
          </span>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusCfg.badge}`}
        >
          <span className={`size-1.5 rounded-full ${statusCfg.dot}`} aria-hidden="true" />
          {statusCfg.label}
        </span>
      </div>

      {/* ── Main Grid: Thời gian + Dịch vụ ── */}
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-12">
        {/* ── Cột trái (lg:col-span-5): Lịch hẹn & Stylist ── */}
        <div className="space-y-5 lg:col-span-5">
          {/* Card Thời gian hẹn */}
          <section
            aria-label="Thời gian và Stylist"
            className="rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-5 shadow-xs"
          >
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#8c827a]">
              Thời gian hẹn
            </p>

            <div className="mt-3 flex items-start gap-4">
              {/* Calendar badge tile */}
              <div className="flex min-w-[70px] shrink-0 flex-col items-center justify-center rounded-xl border border-[#e8ded1] bg-white p-2.5 text-center shadow-xs">
                <span className="text-[10px] font-bold uppercase text-muted">
                  {cap(fmtWeekday.format(startDate))}
                </span>
                <span className="font-display text-3xl font-bold leading-tight text-ink">
                  {fmtDay.format(startDate)}
                </span>
                <span className="text-[11px] font-medium text-muted">
                  Th {fmtMonth.format(startDate)}
                </span>
              </div>

              {/* Chi tiết giờ và ngày */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-ink">
                    <time dateTime={appointment.startAt}>{fmtTime.format(startDate)}</time>
                  </span>
                  <span className="rounded-full bg-[#f0e8dc] px-2.5 py-0.5 text-[11px] font-medium text-[#6f665e]">
                    Dự kiến: {appointment.totalDurationMinutes} phút
                  </span>
                </div>

                <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-terracotta">
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
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <time dateTime={appointment.startAt}>{fmtTime.format(startDate)}</time>
                  {' – '}
                  <time dateTime={appointment.endAt}>{fmtTime.format(endDate)}</time>
                </p>

                <p className="mt-1 text-xs text-muted">
                  Ngày <time dateTime={appointment.startAt}>{fmtDate.format(startDate)}</time> · Giờ Việt Nam (Asia/Ho_Chi_Minh)
                </p>
              </div>
            </div>

            {/* Chú thích dời hẹn */}
            <div className="mt-4 flex items-center gap-2 border-t border-[#efe6db] pt-3 text-xs text-muted">
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
                className="shrink-0 text-muted"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 11v6m0-10h.01" />
              </svg>
              <span>Quy định đổi lịch: Chỉ áp dụng cho lịch đã xác nhận và còn ít nhất 2 giờ trước giờ hẹn.</span>
            </div>
          </section>

          {/* Card Stylist */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-4 sm:p-5 shadow-xs">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#f0e8dc] text-base font-bold text-terracotta ring-1 ring-[#e2d5c3]">
              {appointment.staffNameSnapshot ? appointment.staffNameSnapshot.charAt(0) : 'S'}
            </div>
            <dl className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[#8c827a]">
                Stylist
              </dt>
              <dd className="truncate text-base font-semibold text-ink">
                {appointment.staffNameSnapshot}
              </dd>
              <dd className="text-xs text-muted">
                Tổng thời lượng dịch vụ: {appointment.totalDurationMinutes} phút
              </dd>
            </dl>
          </div>
        </div>

        {/* ── Cột phải (lg:col-span-7): Dịch vụ đã đăng ký ── */}
        <section
          aria-label="Dịch vụ đã đăng ký"
          className="rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-5 sm:p-6 shadow-xs lg:col-span-7"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-terracotta">
              Dịch vụ đã đăng ký
            </h2>
            <span className="text-xs text-muted">{appointment.items.length} dịch vụ</span>
          </div>

          <ul className="mt-4 space-y-3">
            {appointment.items.map(item => (
              <li
                key={item.serviceId}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#efe6db] bg-white p-4 shadow-2xs"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-display text-xl font-bold leading-snug text-ink sm:text-2xl">
                    {item.name}
                  </h3>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {item.durationMinutes} phút
                  </p>
                </div>
                <p className="font-sans text-base font-bold text-terracotta sm:text-lg">
                  {money.format(item.priceVnd)}
                </p>
              </li>
            ))}
          </ul>

          {/* Tổng giá dự kiến */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#efe6db] pt-5">
            <p className="text-sm font-semibold text-muted">Tổng giá dự kiến</p>
            <p className="font-sans text-2xl font-bold text-terracotta sm:text-3xl">
              {money.format(appointment.totalPriceVnd)}
            </p>
          </div>

          <p className="mt-3 text-xs leading-5 text-muted">
            Thông tin dịch vụ, giá và thời lượng được lưu tại thời điểm đặt lịch.
          </p>
        </section>
      </div>

      {/* ── Quy trình đón tiếp tại Atelier (lấy cảm hứng từ Card_detail.png) ── */}
      <div className="border-t border-[#f3eee6] bg-[#faf6f0] px-6 py-5 sm:px-8">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-terracotta">
          Quy trình đón tiếp tại Atelier
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#7a3426] text-xs font-bold text-white">
              1
            </span>
            <div>
              <p className="text-xs font-bold text-ink">Đón tiếp</p>
              <p className="mt-0.5 text-[11px] text-muted">Trà mộc quế &amp; tư vấn</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#e8ded1] text-xs font-bold text-[#6f665e]">
              2
            </span>
            <div>
              <p className="text-xs font-bold text-ink">Thực hiện dịch vụ chuẩn salon</p>
              <p className="mt-0.5 text-[11px] text-muted">Dưỡng chất hữu cơ Ý thuần khiết</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#e8ded1] text-xs font-bold text-[#6f665e]">
              3
            </span>
            <div>
              <p className="text-xs font-bold text-ink">Hoàn thiện &amp; Hướng dẫn sấy</p>
              <p className="mt-0.5 text-[11px] text-muted">Tặng cẩm nang chăm sóc tại nhà</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
