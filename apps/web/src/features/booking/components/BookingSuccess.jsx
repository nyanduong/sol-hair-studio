import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiBaseUrl } from '../../../config/env.js'
import { money, slotTime } from '../../../../../../shared/booking.js'
import { BookingServiceImage } from './BookingServiceCard.jsx'

export default function BookingSuccess({ receipt, services = [], owner = false }) {
  const [copyNotice, setCopyNotice] = useState('')
  const headingRef = useRef(null)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])
  const day = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(receipt.startAt))
  const duration = receipt.totalDurationMinutes
  const hours = Math.floor(duration / 60)
  const minutes = duration % 60
  async function copyReference() {
    try {
      await navigator.clipboard.writeText(receipt.referenceCode)
      setCopyNotice('Đã sao chép mã lịch hẹn.')
    } catch {
      setCopyNotice('Chưa thể sao chép. Bạn có thể chọn và sao chép mã bên trên.')
    }
  }
  return (
    <div className="mx-auto max-w-3xl pb-36 lg:pb-4">
      <div className="mb-6 text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-terracotta bg-terracotta/5 text-terracotta"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-7"
          >
            <path d="m5 12 4 4L19 6" />
          </svg>
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="outline-none font-display text-3xl sm:text-5xl"
        >
          Đặt lịch thành công
        </h1>
        <p role="status" className="mt-3 text-sm leading-6 text-muted">
          Sol đã ghi nhận cuộc hẹn của bạn. Hẹn gặp bạn tại tiệm!
        </p>
      </div>
      <section
        aria-label="Thông tin lịch đã đặt"
        className="rounded-2xl border border-border bg-white p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Cuộc hẹn tại Sol</h2>
          <span className="rounded-full bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
            {receipt.status === 'cancelled'
              ? 'Đã hủy'
              : receipt.status === 'completed'
                ? 'Đã hoàn tất'
                : receipt.status === 'in_progress'
                  ? 'Đang phục vụ'
                  : receipt.status === 'no_show'
                    ? 'Không đến'
                    : 'Đã xác nhận'}
          </span>
        </div>
        {receipt.referenceCode ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-canvas p-3">
            <div>
              <p className="text-xs text-muted">Mã lịch hẹn</p>
              <p className="mt-1 select-all font-mono text-lg font-semibold tracking-wider text-terracotta">
                {receipt.referenceCode}
              </p>
            </div>
            <button
              type="button"
              onClick={copyReference}
              className="min-h-11 rounded-lg px-2 text-sm font-semibold text-terracotta"
            >
              Sao chép
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Xem thông tin lịch hẹn trong trang chi tiết.</p>
        )}
        {copyNotice && (
          <p role="status" className="mt-2 text-xs text-muted">
            {copyNotice}
          </p>
        )}
        <dl className="my-5 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Ngày hẹn</dt>
            <dd className="mt-1 font-semibold capitalize">{day}</dd>
          </div>
          <div>
            <dt className="text-muted">Giờ chăm sóc</dt>
            <dd className="mt-1 text-lg font-semibold">
              {slotTime(receipt.startAt)} – {slotTime(receipt.endAt)}
            </dd>
            <dd className="mt-1 text-xs text-muted">
              {hours > 0 ? `${hours} giờ` : ''}
              {hours && minutes ? ' ' : ''}
              {minutes > 0 ? `${minutes} phút` : ''} · Giờ Việt Nam
            </dd>
          </div>
          <div>
            <dt className="text-muted">Stylist</dt>
            <dd className="mt-1 font-semibold">
              {receipt.staffDisplayName || 'Xem trong chi tiết lịch hẹn'}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Khách hàng</dt>
            <dd className="mt-1 font-semibold">
              {receipt.customerDisplayName || 'Xem trong chi tiết lịch hẹn'}
            </dd>
          </div>
        </dl>
        <h2 className="border-t border-border pt-4 font-display text-xl">Dịch vụ đã đặt</h2>
        <ul className="mt-3 divide-y divide-border">
          {receipt.items.map((item) => (
            <li key={item.serviceId} className="flex items-center gap-3 py-3">
              <BookingServiceImage
                service={{
                  ...item,
                  imageUrl: services.find((service) => service.id === item.serviceId)?.imageUrl,
                }}
                className="h-14 w-16 shrink-0 rounded-lg"
              />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg leading-tight">{item.name}</p>
                <p className="mt-1 text-xs text-muted">{item.durationMinutes} phút</p>
              </div>
              <strong className="shrink-0 text-sm">{money(item.priceVnd)}</strong>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="font-display text-xl">Tổng dịch vụ</span>
          <strong className="text-xl text-terracotta">{money(receipt.totalPriceVnd)}</strong>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">
          Đây là giá trị dịch vụ, chưa phải xác nhận thanh toán.
        </p>
      </section>
      <section className="mt-4 rounded-xl border border-border bg-soft-surface p-4 text-sm">
        <h2 className="font-semibold">Trước khi đến Sol</h2>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-muted">
          <li>Bạn nên đến sớm 5–10 phút để chuẩn bị.</li>
          <li>Xem điều kiện đổi hoặc hủy trong chi tiết lịch hẹn.</li>
        </ul>
      </section>
      <div className="fixed inset-x-0 bottom-0 z-40 grid gap-2 border-t border-border bg-canvas p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:static lg:mt-4 lg:grid-cols-2 lg:border-0 lg:bg-transparent lg:p-0">
        {owner ? (
          <a
            href={`${apiBaseUrl}/admin/appointments/${encodeURIComponent(receipt.id)}?view=mine`}
            className="flex min-h-12 items-center justify-center rounded-xl bg-terracotta px-4 py-3 text-sm font-semibold text-white"
          >
            Xem lịch hẹn đã đặt →
          </a>
        ) : (
          <Link
            to={`/lich-cua-toi/${encodeURIComponent(receipt.id)}`}
            className="flex min-h-12 items-center justify-center rounded-xl bg-terracotta px-4 py-3 text-sm font-semibold text-white"
          >
            Xem lịch hẹn của tôi →
          </Link>
        )}
        <Link
          to="/"
          className="flex min-h-11 items-center justify-center rounded-xl px-4 text-sm text-terracotta lg:border lg:border-terracotta"
        >
          Về trang chủ
        </Link>
      </div>
    </div>
  )
}
