import { useEffect, useRef, useState } from 'react'
import { appointmentEtaPayload } from '../api/appointment-eta.api.js'
import { useOwnerAppointmentCommand } from '../hooks/useOwnerAppointmentCommand.js'

const button = 'min-h-11 rounded-full px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'
const date = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })
const format = value => date.format(new Date(value))

export function AppointmentEtaSummary({ appointment }) {
  if (appointment.status !== 'in_progress') return null
  const hasWarnings = Array.isArray(appointment.affectedAppointments)
  return (
    <section aria-label="Giờ dự kiến xong" className="rounded-2xl border border-amber-200/80 bg-gradient-to-b from-[#fdfbf7] to-[#faf6f0] p-5 text-sm shadow-2xs">
      <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </span>
          <h2 className="font-semibold text-ink text-base">Giờ dự kiến xong (ETA)</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
          <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" aria-hidden="true" />
          Đang phục vụ
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="rounded-xl border border-[#efe6db] bg-white p-3 shadow-2xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Kế hoạch ban đầu</p>
          <p className="mt-1 text-xs font-medium text-ink">Kết thúc theo kế hoạch: {format(appointment.endAt)}</p>
        </div>
        <div className={`rounded-xl border p-3 shadow-2xs ${appointment.estimatedEndAt ? 'border-terracotta/30 bg-terracotta/5' : 'border-[#efe6db] bg-white'}`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Ước tính mới nhất</p>
          <p className="mt-1 text-xs font-medium text-ink">
            {appointment.estimatedEndAt ? 'ETA đã ghi nhận: ' + format(appointment.estimatedEndAt) : 'Chưa có ETA được ghi nhận.'}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        ETA là dự kiến, không đổi giờ hẹn và không phải thời gian hoàn tất thực tế. Khoảng giữ tính thêm 10 phút dọn dẹp.
      </p>

      {!hasWarnings && appointment.estimatedEndAt && (
        <p className="mt-2 text-xs text-muted">
          Chưa tải được cảnh báo lịch bị ảnh hưởng. Hãy tải lại trang để kiểm tra.
        </p>
      )}

      {hasWarnings && (
        <div
          className={`mt-4 rounded-xl border p-4 ${appointment.ownerReviewRequired ? 'border-amber-300 bg-amber-50/70 text-amber-950' : 'border-[#efe6db] bg-white text-ink'}`}
          role={appointment.ownerReviewRequired ? 'alert' : 'status'}
        >
          <div className="flex items-start gap-2">
            {appointment.ownerReviewRequired && (
              <span className="mt-0.5 text-amber-600 font-bold" aria-hidden="true">⚠️</span>
            )}
            <p className="text-xs font-medium leading-relaxed">
              {appointment.ownerReviewRequired
                ? 'Có lịch bị ảnh hưởng. Owner cần kiểm tra và xử lý riêng; không lịch nào được tự động dời hoặc hủy.'
                : 'Không có lịch bị ảnh hưởng tại thời điểm tải dữ liệu.'}
            </p>
          </div>

          {appointment.ownerReviewRequired && !appointment.affectedAppointments.length && (
            <p className="mt-2 text-xs text-muted">
              Chi tiết lịch bị ảnh hưởng nằm ngoài quyền xem của bạn. Hãy trao đổi với Owner.
            </p>
          )}

          {appointment.affectedAppointments.length > 0 && (
            <ul className="mt-3 space-y-2">
              {appointment.affectedAppointments.map(item => (
                <li key={item.id} className="break-words rounded-xl border border-amber-200/80 bg-white p-3 shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs font-semibold text-ink">Mã lịch: {item.id}</p>
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      {item.status === 'confirmed' ? 'Đã xác nhận' : 'Đang phục vụ'}
                    </span>
                  </div>
                  <p className="mt-1 font-semibold text-ink text-sm">{format(item.startAt)} – {format(item.endAt)}</p>
                  <p className="mt-1 text-xs text-muted">
                    {item.status === 'confirmed' ? 'Đã xác nhận' : 'Đang phục vụ'} · {item.reasons.map(reason => reason === 'staff_overlap' ? 'Trùng khoảng giữ stylist (gồm dọn dẹp)' : 'Trùng thời gian phục vụ khách').join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2.5 text-[11px] text-muted">
            Cảnh báo được cập nhật khi tải dữ liệu; không có lịch nào được tự động điều chỉnh.
          </p>
        </div>
      )}
    </section>
  )
}

function defaultEtaLocal(appointment, now = Date.now()) {
  const plannedEnd = Date.parse(appointment?.endAt)
  const existingEta = appointment?.estimatedEndAt ? Date.parse(appointment.estimatedEndAt) : NaN
  if (Number.isFinite(existingEta) && existingEta > now && existingEta > plannedEnd) {
    return new Date(existingEta + 25_200_000).toISOString().slice(0, 16)
  }
  const base = Math.max(Number.isFinite(now) ? now : 0, Number.isFinite(plannedEnd) ? plannedEnd : 0)
  // Mặc định lùi thêm 15 phút từ mốc lớn hơn giữa hiện tại và kế hoạch, làm tròn theo mốc 5 phút
  const candidate = new Date(Math.ceil((base + 15 * 60_000) / 300_000) * 300_000)
  return new Date(candidate.getTime() + 25_200_000).toISOString().slice(0, 16)
}

export default function AppointmentEta({ token, appointment, actor = 'owner', onChanged, onClose }) {
  const dialog = useRef(null)
  const command = useOwnerAppointmentCommand(token, appointment.id, 'eta', undefined, actor)
  const [fields, setFields] = useState(() => ({
    localTime: defaultEtaLocal(appointment),
    confirmed: false,
  }))
  const [localError, setLocalError] = useState('')
  useEffect(() => {
    const previous = document.activeElement
    const node = dialog.current
    node.showModal()
    return () => { node.close(); previous?.focus() }
  }, [])
  async function confirm() {
    setLocalError('')
    try {
      const payload = command.pending?.payload ?? appointmentEtaPayload(appointment, fields.localTime, fields.confirmed)
      const result = await command.submit(payload)
      if (result.kind === 'success') { onChanged(result.value, 'eta'); onClose() }
    } catch (error) { setLocalError(error.message) }
  }
  return <AppointmentEtaDialog dialogRef={dialog} appointment={appointment} fields={fields} onFields={setFields}
    command={command} localError={localError} onConfirm={confirm} onClose={onClose} onReload={() => { onChanged(); onClose() }} />
}

export function AppointmentEtaDialog({ dialogRef, appointment, fields, onFields, command, localError, onConfirm, onClose, onReload }) {
  const ambiguous = Boolean(command.pending)
  const reloadRequired = !ambiguous && [401, 403, 404, 409].includes(command.error?.status)
  const eligible = appointment.status === 'in_progress' && Number.isSafeInteger(appointment.revision) &&
    appointment.revision >= 0 && appointment.revision < Number.MAX_SAFE_INTEGER
  const message = localError || (command.error && (ambiguous ? 'Chưa rõ kết quả. Thử lại cùng yêu cầu để tránh cập nhật hai lần.'
    : reloadRequired ? 'Quyền, revision hoặc trạng thái lịch đã thay đổi. Tải lại và kiểm tra trước khi gửi lại.'
      : command.error.code === 'INVALID_ETA' ? 'Theo giờ server, ETA phải ở tương lai và muộn hơn giờ kết thúc kế hoạch. Hãy chọn lại.'
        : 'Không lưu được ETA. Vui lòng kiểm tra và thử lại.'))
  return <dialog ref={dialogRef} aria-labelledby="appointment-eta-title"
    onCancel={event => { event.preventDefault(); if (!command.locked) onClose() }}
    className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-3xl border border-[#efe6db] bg-[#faf6f0] p-6 text-ink shadow-2xl backdrop:bg-ink/40 sm:p-8">
    <div className="flex items-center justify-between border-b border-[#efe6db] pb-3">
      <h2 id="appointment-eta-title" className="font-display text-2xl sm:text-3xl font-bold text-ink">Cập nhật giờ dự kiến xong</h2>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
        <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" aria-hidden="true" />
        Đang phục vụ
      </span>
    </div>
    <dl className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 rounded-2xl border border-[#efe6db] bg-white p-4 text-xs shadow-2xs">
      <div><dt className="text-[10px] font-bold uppercase tracking-wider text-muted">Khách hàng</dt><dd className="mt-0.5 text-sm font-semibold text-ink">{appointment.customerSnapshot.displayName}</dd></div>
      <div><dt className="text-[10px] font-bold uppercase tracking-wider text-muted">Stylist</dt><dd className="mt-0.5 text-sm font-semibold text-ink">{appointment.staffNameSnapshot}</dd></div>
      <div className="sm:col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted">Dịch vụ</dt><dd className="mt-0.5 text-xs font-medium text-ink">{appointment.items.map(item => item.name).join(' · ')}</dd></div>
      <div className="sm:col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted">Giờ hẹn ban đầu (Việt Nam)</dt><dd className="mt-0.5 text-xs font-semibold text-ink">{format(appointment.startAt)} – {format(appointment.endAt)}</dd></div>
    </dl>
    <div className="mt-4"><AppointmentEtaSummary appointment={appointment} /></div>
    <fieldset disabled={command.locked} className="mt-4 space-y-3">
      <label className="block text-sm font-semibold text-ink">Giờ dự kiến hoàn tất mới (giờ Việt Nam)
        <input type="datetime-local" step={60} required value={fields.localTime}
          className="mt-1.5 min-h-11 w-full rounded-xl border border-[#efe6db] bg-white px-3 py-2 text-sm text-ink focus:border-[#3E2317] focus:outline-none transition-colors"
          onChange={event => onFields({ localTime: event.target.value, confirmed: false })} />
      </label>
      <label className="flex items-start gap-2.5 text-xs text-muted cursor-pointer select-none">
        <input type="checkbox" checked={fields.confirmed} onChange={event => onFields({ ...fields, confirmed: event.target.checked })}
          className="mt-0.5 size-4 rounded border-border text-terracotta focus:ring-terracotta" />
        Tôi xác nhận giờ dự kiến mới; lịch khác không tự động được dời hoặc hủy.
      </label>
    </fieldset>
    {message && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{message}</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-[#efe6db] pt-4">
      <button className={button + ' border border-border bg-white hover:bg-soft-surface transition-colors'} disabled={command.locked} onClick={onClose}>Quay lại</button>
      {reloadRequired && <button className={button + ' border border-border bg-white hover:bg-soft-surface transition-colors'} onClick={onReload}>Tải lại lịch</button>}
      <button className={button + ' bg-terracotta hover:bg-terracotta-dark text-white shadow-2xs hover:shadow transition-all'} onClick={onConfirm}
        disabled={command.kind === 'loading' || (!ambiguous && (!eligible || !fields.confirmed || !fields.localTime || reloadRequired))}>
        {command.kind === 'loading' ? 'Đang lưu…' : ambiguous ? 'Thử lại cùng yêu cầu' : 'Xác nhận lưu ETA'}
      </button>
    </div>
  </dialog>
}
