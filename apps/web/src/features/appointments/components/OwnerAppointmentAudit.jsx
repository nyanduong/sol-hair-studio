import { useRef } from 'react'
import { auditActions } from '../api/owner-audit.api.js'
import { ownerAppointmentStatuses, useOwnerAppointmentRead } from '../hooks/useOwnerAppointments.js'

const date = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' })
const labels = {
  status: 'Trạng thái',
  staffId: 'Mã stylist',
  startAt: 'Giờ hẹn',
  endAt: 'Kết thúc kế hoạch',
  occupiedFrom: 'Bắt đầu khoảng giữ',
  occupiedUntil: 'Kết thúc khoảng giữ',
  startedAt: 'Bắt đầu thực tế',
  completedAt: 'Hoàn tất thực tế',
  estimatedEndAt: 'ETA',
}
const button = 'min-h-11 rounded-full border border-[#efe6db] bg-white hover:bg-soft-surface px-6 py-2 text-xs sm:text-sm font-semibold text-ink shadow-2xs hover:shadow transition-all disabled:opacity-50'

export default function OwnerAppointmentAudit({ token, appointmentId }) {
  const state = useOwnerAppointmentRead(token, 'audit', { id: appointmentId })
  return <OwnerAuditView state={state} />
}

function Snapshot({ value, label }) {
  const isBefore = label === 'Trước thao tác'
  return (
    <div className={`min-w-0 rounded-2xl border p-4 shadow-2xs ${isBefore ? 'border-[#efe6db] bg-[#faf6f0]' : 'border-emerald-200/70 bg-emerald-50/40'}`}>
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <p className="text-xs font-bold uppercase tracking-wider text-ink">{label}</p>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isBefore ? 'bg-stone-100 text-stone-600' : 'bg-emerald-100 text-emerald-800'}`}>
          {isBefore ? 'Trước thao tác' : 'Sau thao tác'}
        </span>
      </div>
      {Object.keys(value).length ? (
        <dl className="mt-3 space-y-2 text-xs">
          {Object.entries(value).map(([field, entry]) => (
            <div key={field} className="rounded-lg bg-white/80 p-2 border border-border/40">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{labels[field]}</dt>
              <dd className="mt-0.5 font-semibold text-ink break-words">
                {field === 'status' ? ownerAppointmentStatuses[entry] : field === 'staffId' ? entry : date.format(new Date(entry))}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-xs text-muted italic">Không có trường được ghi nhận trong snapshot này.</p>
      )}
    </div>
  )
}

function AuditEventRow({ event }) {
  const dialogRef = useRef(null)

  return (
    <li className="group rounded-2xl border border-[#efe6db] bg-[#faf6f0]/70 p-4 shadow-2xs transition-all hover:border-[#a14f3d]/40 hover:bg-[#faf6f0]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-[#efe6db] bg-white text-xs font-bold text-terracotta shadow-2xs">
            #{event.revision}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-ink text-sm sm:text-base">
                {auditActions[event.kind]}
              </h3>
              <time dateTime={event.occurredAt} className="text-xs text-muted">
                · {date.format(new Date(event.occurredAt))}
              </time>
            </div>
            <p className="mt-0.5 break-words text-xs text-muted">
              Người thực hiện (mã tài khoản): <span className="font-mono text-ink font-medium">{event.actorId}</span> · Revision {event.revision}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#efe6db] bg-white px-4 py-1.5 text-xs font-semibold text-terracotta shadow-2xs transition-all hover:bg-terracotta hover:text-white"
        >
          Xem chi tiết
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {event.reason !== undefined && (
        <p className="mt-2 text-xs text-muted line-clamp-1 italic">
          Lý do: {event.reason}
        </p>
      )}

      {/* Modal Dialog */}
      <dialog
        ref={dialogRef}
        aria-labelledby={`audit-dialog-title-${event.id}`}
        onCancel={e => {
          e.preventDefault()
          dialogRef.current?.close()
        }}
        className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-[#efe6db] bg-[#faf6f0] p-6 text-ink shadow-2xl backdrop:bg-ink/50 sm:p-8"
      >
        <div className="flex items-start justify-between border-b border-[#efe6db] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-[#efe6db] bg-white px-2 py-0.5 text-xs font-bold text-terracotta">
                Revision #{event.revision}
              </span>
              <h3 id={`audit-dialog-title-${event.id}`} className="font-display text-2xl font-bold text-ink">
                {auditActions[event.kind]}
              </h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              Thời gian: <time dateTime={event.occurredAt}>{date.format(new Date(event.occurredAt))}</time>
            </p>
          </div>
          <button
            type="button"
            aria-label="Đóng hộp thoại"
            onClick={() => dialogRef.current?.close()}
            className="flex size-8 items-center justify-center rounded-full border border-[#efe6db] bg-white text-muted hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-[#efe6db] bg-white p-3 text-xs">
            <p className="text-muted">
              Người thực hiện (mã tài khoản): <span className="font-mono font-medium text-ink break-all">{event.actorId}</span> · Revision {event.revision}
            </p>
          </div>

          {event.reason !== undefined && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs">
              <p className="font-bold uppercase tracking-wider text-amber-900 text-[10px]">Lý do thao tác</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-ink font-medium">Lý do: {event.reason}</p>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Snapshot value={event.before} label="Trước thao tác" />
            <Snapshot value={event.after} label="Sau thao tác" />
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-[#efe6db] pt-4">
          <button
            type="button"
            className="min-h-10 rounded-full border border-border bg-white hover:bg-soft-surface px-6 py-2 text-xs sm:text-sm font-semibold text-ink transition-colors"
            onClick={() => dialogRef.current?.close()}
          >
            Đóng
          </button>
        </div>
      </dialog>
    </li>
  )
}

export function OwnerAuditView({ state }) {
  const denied = ['denied', 'notFound'].includes(state.kind)
  const events = denied ? [] : state.items ?? []
  return (
    <section
      aria-label="Lịch sử thao tác"
      aria-busy={['loading', 'loadingMore'].includes(state.kind)}
      className="mt-6 rounded-3xl border border-[#efe6db] bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f3eee6] pb-4">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink">Lịch sử thao tác</h2>
          <p className="mt-1 text-xs text-muted max-w-2xl leading-relaxed">
            Mới nhất trước theo thứ tự revision. Chỉ đọc, giữ nguyên event trước sửa nhầm. API hiện cung cấp mã người thực hiện, chưa có tên/vai trò tại thời điểm thao tác.
          </p>
        </div>
        {events.length > 0 && (
          <span className="inline-flex items-center rounded-full border border-[#efe6db] bg-[#faf6f0] px-3 py-1 text-xs font-semibold text-ink shadow-2xs">
            {events.length} bản ghi
          </span>
        )}
      </div>

      {state.kind === 'loading' && (
        <div role="status" className="mt-6 rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-6 text-center text-sm text-muted">
          <p>Đang tải lịch sử thao tác…</p>
        </div>
      )}

      {denied && (
        <p role="alert" className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-terracotta">
          Không có quyền Owner, phiên đã hết hạn hoặc lịch không còn tồn tại.
        </p>
      )}

      {state.kind === 'success' && !events.length && (
        <p role="status" className="mt-6 rounded-2xl border border-[#efe6db] bg-[#faf6f0] p-6 text-center text-sm text-muted">
          Chưa có event được ghi nhận cho lịch hẹn này.
        </p>
      )}

      {events.length > 0 && (
        <ol className="mt-6 space-y-3">
          {events.map(event => (
            <AuditEventRow key={event.id} event={event} />
          ))}
        </ol>
      )}

      {state.kind === 'error' && (
        <div role="alert" className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-terracotta">
          <p className="font-semibold">{state.restartRequired ? 'Phân trang bị lặp. Hãy tải lại lịch sử.' : 'Không tải được lịch sử thao tác. Vui lòng thử lại.'}</p>
          <button className={button + ' mt-3'} onClick={state.retry}>
            Thử lại lịch sử
          </button>
        </div>
      )}

      {state.hasNextPage && !['error', 'denied', 'notFound', 'loading'].includes(state.kind) && (
        <div className="mt-6 text-center">
          <button
            className={button}
            disabled={state.kind === 'loadingMore'}
            onClick={state.loadMore}
          >
            {state.kind === 'loadingMore' ? 'Đang tải thêm…' : 'Xem thêm lịch sử'}
          </button>
        </div>
      )}
    </section>
  )
}
