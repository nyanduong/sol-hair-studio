import { useEffect, useRef, useState } from 'react'
import { ownerServicePayload, useOwnerAppointmentCommand } from '../hooks/useOwnerAppointmentCommand.js'

const button = 'min-h-11 rounded-full px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'
const date = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })

export default function OwnerAppointmentService({ token, appointment, operation, onChanged, onClose, personalStaffId }) {
  const dialog = useRef(null)
  const command = useOwnerAppointmentCommand(token, appointment.id, operation, personalStaffId)
  const [confirmed, setConfirmed] = useState(false)
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
      const payload = command.pending?.payload ?? ownerServicePayload(appointment, operation, confirmed)
      const result = await command.submit(payload)
      if (result.kind === 'success') { onChanged(result.value, operation); onClose() }
    } catch (error) { setLocalError(error.message) }
  }
  return <OwnerServiceDialog dialogRef={dialog} appointment={appointment} operation={operation}
    command={command} confirmed={confirmed} onConfirmed={setConfirmed} localError={localError}
    onConfirm={confirm} onClose={onClose} onReload={() => { onChanged(); onClose() }} />
}

export function OwnerServiceDialog({ dialogRef, appointment, operation, command, confirmed, onConfirmed, localError, onConfirm, onClose, onReload }) {
  const starting = operation === 'start'
  const title = starting ? 'Bắt đầu phục vụ' : 'Hoàn tất phục vụ'
  const eligible = appointment.status === (starting ? 'confirmed' : 'in_progress') &&
    Number.isSafeInteger(appointment.revision) && appointment.revision >= 0 && appointment.revision < Number.MAX_SAFE_INTEGER
  const error = command.error
  const ambiguous = Boolean(command.pending) && command.kind !== 'loading'
  const reloadRequired = !command.pending && [401, 403, 404, 409].includes(error?.status)
  const messages = {
    APPOINTMENT_REVISION_CONFLICT: 'Lịch đã được cập nhật. Hãy tải lại trước khi thao tác.',
    APPOINTMENT_STATE_CONFLICT: 'Trạng thái lịch đã thay đổi. Hãy tải lại lịch.',
    START_OUTSIDE_SHIFT: 'Khoảng phục vụ và dọn sau dịch vụ không nằm trọn trong ca làm của stylist.',
    START_TIME_OFF_CONFLICT: 'Stylist có lịch nghỉ trùng khoảng phục vụ.',
    START_APPOINTMENT_CONFLICT: 'Khoảng phục vụ bị trùng với lịch khác của stylist hoặc khách hàng.',
    INVALID_COMPLETION_TIME: 'Thời gian hoàn tất chưa hợp lệ. Hãy tải lại lịch trước khi thao tác.',
  }
  const message = localError || (error && (ambiguous
    ? 'Chưa xác định được kết quả. Hãy thử lại cùng yêu cầu; không tạo thao tác khác.'
    : [401, 403, 404].includes(error.status)
      ? 'Phiên hoặc quyền Owner đã thay đổi, hoặc lịch không còn tồn tại. Hãy tải lại lịch.'
      : messages[error.code] ?? (error.status === 409 ? 'Lịch đã thay đổi. Hãy tải lại lịch.'
        : 'Không thực hiện được yêu cầu. Vui lòng thử lại.')))
  return (
    <dialog ref={dialogRef} aria-labelledby="owner-service-title" aria-describedby="owner-service-description"
      onCancel={event => { event.preventDefault(); if (!command.locked) onClose() }}
      className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-3xl border border-border bg-canvas p-6 text-ink shadow-xl backdrop:bg-ink/40 sm:p-8">
      <h2 id="owner-service-title" className="font-display text-3xl">{title}?</h2>
      <p id="owner-service-description" className="mt-3 text-sm text-muted">
        {starting ? 'Chỉ bắt đầu khi khách đã đến. Có thể bắt đầu sớm nếu stylist rảnh, trong ca và không trùng lịch khác.'
          : 'Chỉ hoàn tất khi đã thực sự phục vụ xong. Stylist tiếp tục có 10 phút dọn sau thời điểm hoàn tất.'}
      </p>
      <dl className="mt-4 space-y-2 rounded-2xl border border-border bg-soft-surface p-4 text-sm">
        <div><dt className="text-muted">Mã lịch</dt><dd className="break-all">{appointment.id}</dd></div>
        <div><dt className="text-muted">Khách hàng</dt><dd>{appointment.customerSnapshot.displayName} · {appointment.customerSnapshot.phone}</dd></div>
        <div><dt className="text-muted">Stylist</dt><dd>{appointment.staffNameSnapshot}</dd></div>
        <div><dt className="text-muted">Thời gian hẹn (Việt Nam)</dt><dd>{date.format(new Date(appointment.startAt))} – {date.format(new Date(appointment.endAt))}</dd></div>
        <div><dt className="text-muted">Dịch vụ</dt><dd>{appointment.items.map(item => item.name).join(' · ')}</dd></div>
      </dl>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" required checked={confirmed} disabled={command.locked}
          onChange={event => onConfirmed(event.target.checked)} />
        {starting ? 'Tôi xác nhận khách đã đến salon và sẵn sàng được phục vụ.' : 'Tôi xác nhận đã thực sự phục vụ xong.'}
      </label>
      {!eligible && !command.pending && <p role="alert" className="mt-4 text-sm text-terracotta">Trạng thái hoặc revision không còn hợp lệ. Hãy tải lại lịch.</p>}
      {message && <p role="alert" className="mt-4 text-sm text-terracotta">{message}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button className={button + ' border border-border bg-soft-surface text-ink'} disabled={command.locked} onClick={onClose}>Quay lại</button>
        {reloadRequired && <button className={button + ' border border-border text-ink'} onClick={onReload}>Tải lại lịch</button>}
        <button className={button + ' bg-terracotta text-white'}
          disabled={command.kind === 'loading' || (!command.pending && (!eligible || !confirmed || reloadRequired))}
          onClick={onConfirm}>{command.kind === 'loading' ? 'Đang xử lý…' : ambiguous ? 'Thử lại cùng yêu cầu' : 'Xác nhận ' + (starting ? 'bắt đầu' : 'hoàn tất')}</button>
      </div>
    </dialog>
  )
}
