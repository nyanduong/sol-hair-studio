import { useEffect, useRef, useState } from 'react'
import OwnerAppointmentReschedule from './OwnerAppointmentReschedule.jsx'
import { ownerAppointmentActions, ownerAppointmentPayload, useOwnerAppointmentCommand, useOwnerAppointmentTime } from '../hooks/useOwnerAppointmentCommand.js'

const primary = 'min-h-11 rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
const secondary = 'min-h-11 rounded-full border border-border bg-soft-surface px-5 py-2 text-sm font-semibold text-ink disabled:opacity-50'
const field = 'mt-2 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-ink disabled:opacity-50'
const date = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })

export default function OwnerAppointmentManagement({ token, appointment, onChanged }) {
  const [operation, setOperation] = useState(null)
  const now = useOwnerAppointmentTime(appointment.startAt)
  const actions = ownerAppointmentActions(appointment, now)
  if (!actions.cancel) return null
  return (
    <div className="border-t border-border px-6 py-5 sm:px-8">
      <div className="flex flex-wrap justify-end gap-3">
        <button className={secondary} onClick={() => setOperation('reschedule')}>Đổi lịch</button>
        <button className={secondary} onClick={() => setOperation('cancel')}>Hủy lịch</button>
        <button className={primary} disabled={!actions.noShow} onClick={() => setOperation('no-show')}>Đánh dấu không đến</button>
      </div>
      {!actions.noShow && <p className="mt-2 text-right text-xs text-muted">Không đến: chỉ ghi nhận từ 15 phút sau giờ hẹn, khi đã liên hệ và khách chưa đến.</p>}
      {operation === 'reschedule' && <OwnerAppointmentReschedule token={token} appointment={appointment} now={now}
        onClose={() => setOperation(null)} onChanged={onChanged} />}
      {operation && operation !== 'reschedule' && <OwnerCommandDialog key={operation} token={token} appointment={appointment}
        operation={operation} now={now} onClose={() => setOperation(null)} onChanged={onChanged} />}
    </div>
  )
}

function OwnerCommandDialog({ token, appointment, operation, now, onClose, onChanged }) {
  const dialog = useRef(null)
  const command = useOwnerAppointmentCommand(token, appointment.id, operation)
  const [fields, setFields] = useState({ reason: '', contactLocal: '', confirmedAbsent: false })
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
      // Retry không thay revision, thời gian liên hệ hoặc key của lần chưa rõ kết quả.
      const payload = command.pending?.payload ?? ownerAppointmentPayload(appointment, operation, fields)
      const result = await command.submit(payload)
      if (result.kind === 'success') { onChanged(result.value, operation); onClose() }
    } catch (error) { setLocalError(error.message) }
  }
  return <OwnerAppointmentCommandDialog dialogRef={dialog} appointment={appointment} operation={operation}
    now={now} command={command} fields={fields} localError={localError} onFields={setFields}
    onConfirm={confirm} onClose={onClose} onReload={() => { onChanged(); onClose() }} />
}

// Phần hiển thị riêng để kiểm chứng đủ trạng thái lỗi mà không gọi database.
export function OwnerAppointmentCommandDialog({ dialogRef, appointment, operation, now, command, fields, localError, onFields, onConfirm, onClose, onReload }) {
  const actions = ownerAppointmentActions(appointment, now)
  const cancellation = operation === 'cancel'
  const error = command.error
  const ambiguous = Boolean(command.pending) && command.kind !== 'loading'
  const reloadRequired = !command.pending && [401, 403, 404, 409].includes(error?.status)
  const messages = {
    CANCELLATION_REASON_REQUIRED: 'Hủy sát giờ hoặc quá giờ hẹn cần nhập lý do.',
    INVALID_REASON: 'Lý do phải có nội dung và không quá 500 ký tự.',
    INVALID_CONTACT_ATTEMPTED_AT: 'Thời gian liên hệ không hợp lệ hoặc sau giờ hiện tại của server. Hãy kiểm tra lại.',
    NO_SHOW_TOO_EARLY: 'Theo giờ server, chưa đủ 15 phút sau giờ hẹn. Hãy tải lại và chờ đủ thời gian.',
    APPOINTMENT_REVISION_CONFLICT: 'Lịch đã được cập nhật. Hãy tải lại và kiểm tra trước khi thao tác.',
    APPOINTMENT_STATE_CONFLICT: 'Trạng thái lịch đã thay đổi. Hãy tải lại lịch.',
    COMMAND_KEY_CONFLICT: 'Yêu cầu không còn phù hợp với dữ liệu hiện tại. Hãy tải lại lịch.',
  }
  const message = localError || (error && (ambiguous
    ? 'Chưa xác định được kết quả. Hãy thử lại cùng yêu cầu, không tạo thao tác khác.'
    : [401, 403, 404].includes(error.status)
      ? 'Phiên hoặc quyền Owner đã thay đổi, hoặc lịch không còn tồn tại. Hãy tải lại lịch.'
      : messages[error.code] ?? (error.status === 409
        ? 'Lịch đã thay đổi. Hãy tải lại trước khi thao tác.'
        : 'Không thực hiện được yêu cầu. Vui lòng thử lại.')))
  const eligible = cancellation ? actions.cancel : actions.noShow
  const ready = cancellation
    ? !actions.reasonRequired || Boolean(fields.reason.trim())
    : fields.confirmedAbsent && Boolean(fields.contactLocal)
  return (
    <dialog ref={dialogRef} aria-labelledby="owner-command-title" aria-describedby="owner-command-description"
      onCancel={event => { event.preventDefault(); if (!command.locked) onClose() }}
      className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-3xl border border-border bg-canvas p-6 text-ink shadow-xl backdrop:bg-ink/40 sm:p-8">
      <h2 id="owner-command-title" className="font-display text-3xl">{cancellation ? 'Hủy lịch hẹn?' : 'Đánh dấu khách không đến?'}</h2>
      <p id="owner-command-description" className="mt-3 text-sm text-muted">
        {cancellation ? 'Lịch đã hủy không thể mở lại. Hãy kiểm tra đúng khách và giờ hẹn trước khi xác nhận.'
          : 'Chỉ xác nhận khi khách chưa đến và bạn đã liên hệ. Lịch không đến không mở lại; khách quay lại cần đặt lịch mới.'}
      </p>
      <dl className="mt-4 space-y-2 rounded-2xl border border-border bg-soft-surface p-4 text-sm">
        <div><dt className="text-muted">Mã lịch</dt><dd className="break-all">{appointment.id}</dd></div>
        <div><dt className="text-muted">Khách hàng</dt><dd>{appointment.customerSnapshot.displayName} · {appointment.customerSnapshot.phone}</dd></div>
        <div><dt className="text-muted">Giờ hẹn (Việt Nam)</dt><dd>{date.format(new Date(appointment.startAt))}</dd></div>
        <div><dt className="text-muted">Stylist</dt><dd>{appointment.staffNameSnapshot}</dd></div>
        <div><dt className="text-muted">Dịch vụ</dt><dd>{appointment.items.map(item => item.name).join(' · ')}</dd></div>
      </dl>
      <fieldset disabled={command.locked} className="mt-4">
        {cancellation ? (
          <label className="block text-sm font-medium">Lý do hủy {actions.reasonRequired ? '(bắt buộc)' : '(không bắt buộc)'}
            <textarea className={field} maxLength={500} required={actions.reasonRequired} rows={3} value={fields.reason}
              onChange={event => onFields({ ...fields, reason: event.target.value })} />
          </label>
        ) : (
          <>
            <label className="block text-sm font-medium">Thời gian thực tế đã liên hệ (giờ Việt Nam)
              <input className={field} type="datetime-local" required step={60} value={fields.contactLocal}
                onChange={event => onFields({ ...fields, contactLocal: event.target.value })} />
            </label>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input className="mt-1" type="checkbox" checked={fields.confirmedAbsent}
                onChange={event => onFields({ ...fields, confirmedAbsent: event.target.checked })} />
              Tôi xác nhận đã liên hệ và khách chưa đến salon.
            </label>
          </>
        )}
      </fieldset>
      {!eligible && !command.pending && <p role="alert" className="mt-4 text-sm text-terracotta">Lịch chưa đủ hoặc không còn đủ điều kiện thao tác. Hãy kiểm tra lại lịch và thời gian.</p>}
      {message && <p role="alert" className="mt-4 text-sm text-terracotta">{message}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button className={secondary} disabled={command.locked} onClick={onClose}>Quay lại</button>
        {reloadRequired && <button className={secondary} onClick={onReload}>Tải lại lịch</button>}
        <button className={primary} disabled={command.kind === 'loading' || (!command.pending && (!eligible || !ready || reloadRequired))}
          onClick={onConfirm}>{command.kind === 'loading' ? 'Đang xử lý…' : ambiguous ? 'Thử lại cùng yêu cầu'
            : cancellation ? 'Xác nhận hủy lịch' : 'Xác nhận không đến'}</button>
      </div>
    </dialog>
  )
}
