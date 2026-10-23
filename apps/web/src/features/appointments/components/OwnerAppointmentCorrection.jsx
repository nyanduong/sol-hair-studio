import { useEffect, useRef, useState } from 'react'
import { correctionPayload, correctionConflicts } from '../api/owner-corrections.api.js'
import { useOwnerAppointmentCommand, useOwnerAppointmentTime } from '../hooks/useOwnerAppointmentCommand.js'

const date = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })
const format = value => date.format(new Date(value))
const button = 'min-h-11 rounded-full border border-border px-5 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed'

export default function OwnerAppointmentCorrection({ token, appointment, onChanged, onClose }) {
  const dialog = useRef(null)
  const operation = appointment.status === 'in_progress' ? 'correct-start' : 'correct-complete'
  const command = useOwnerAppointmentCommand(token, appointment.id, operation)
  const [fields, setFields] = useState({ reason: '', confirmed: false, etaLocal: '' })
  const [localError, setLocalError] = useState('')
  const now = useOwnerAppointmentTime(appointment.endAt)
  useEffect(() => {
    const previous = document.activeElement, node = dialog.current
    node.showModal()
    return () => { node.close(); previous?.focus() }
  }, [])
  async function confirm() {
    setLocalError('')
    try {
      const body = command.pending?.payload ?? correctionPayload(appointment, operation, fields)
      const result = await command.submit(body)
      if (result.kind === 'success') { onChanged(result.value, operation); onClose() }
    } catch (error) { setLocalError(error.message) }
  }
  return <OwnerCorrectionDialog dialogRef={dialog} appointment={appointment} operation={operation} now={now} command={command}
    fields={fields} onFields={setFields} localError={localError} onConfirm={confirm} onClose={onClose} onReload={() => { onChanged(); onClose() }} />
}

export function OwnerCorrectionDialog({ dialogRef, appointment, operation, now, command, fields, onFields, localError, onConfirm, onClose, onReload }) {
  const starting = operation === 'correct-start'
  const eligible = (starting ? appointment.status === 'in_progress' : appointment.status === 'completed') &&
    Number.isSafeInteger(appointment.revision) && appointment.revision >= 0 && appointment.revision < Number.MAX_SAFE_INTEGER
  const etaRequired = !starting && Date.parse(appointment.endAt) <= now
  const ambiguous = Boolean(command.pending)
  const error = command.error
  const reloadRequired = !ambiguous && [401, 403, 404, 409].includes(error?.status)
  const conflicts = error?.code === 'CORRECTION_CONFLICT' ? correctionConflicts(error.details) : null
  const messages = {
    CORRECTION_CONFLICT: 'Không thể khôi phục khoảng phục vụ vì có xung đột. Owner cần xử lý riêng trước khi thử lại.',
    CORRECTION_ETA_REQUIRED: 'Theo giờ server, cần nhập ETA tương lai để tiếp tục phục vụ.',
    INVALID_ETA: 'ETA phải ở tương lai và muộn hơn giờ kết thúc kế hoạch.',
    INVALID_REASON: 'Lý do phải có nội dung và không quá 500 ký tự.',
    CORRECTION_REASON_REQUIRED: 'Cần nhập lý do sửa nhầm.',
    APPOINTMENT_REVISION_CONFLICT: 'Lịch đã thay đổi. Tải lại và kiểm tra trước khi gửi lại.',
    APPOINTMENT_STATE_CONFLICT: 'Trạng thái lịch đã thay đổi. Tải lại để kiểm tra.',
  }
  const message = localError || (error && (ambiguous ? 'Chưa rõ kết quả. Thử lại cùng yêu cầu, không tạo thao tác khác.'
    : messages[error.code] ?? (reloadRequired ? 'Phiên, quyền hoặc lịch đã thay đổi. Hãy tải lại lịch.' : 'Không sửa được trạng thái. Vui lòng thử lại.')))
  const update = patch => onFields({ ...fields, ...patch, confirmed: false })
  return <dialog ref={dialogRef} aria-labelledby="owner-correction-title"
    onCancel={event => { event.preventDefault(); if (!command.locked) onClose() }}
    className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-3xl border border-border bg-canvas p-6 text-ink shadow-xl backdrop:bg-ink/40 sm:p-8">
    <h2 id="owner-correction-title" className="font-display text-2xl font-bold">Sửa trạng thái bị nhầm</h2>
    <p className="mt-3 text-sm text-muted">Thao tác quản trị: Backend sẽ kiểm tra ca làm, nghỉ và lịch xung đột. Không tự dời/hủy lịch khác; lịch sử cũ được giữ nguyên.</p>
    <dl className="mt-4 space-y-2 rounded-2xl border border-border bg-white p-4 text-sm">
      <div><dt>Khách hàng</dt><dd>{appointment.customerSnapshot.displayName} · {appointment.customerSnapshot.phone}</dd></div>
      <div><dt>Stylist</dt><dd>{appointment.staffNameSnapshot}</dd></div>
      <div><dt>Dịch vụ</dt><dd>{appointment.items.map(item => item.name).join(' · ')}</dd></div>
      <div><dt>Giờ hẹn (Việt Nam)</dt><dd>{format(appointment.startAt)} – {format(appointment.endAt)}</dd></div>
      <div><dt>Chuyển trạng thái</dt><dd>{starting ? 'Đang phục vụ → Đã xác nhận' : 'Đã hoàn tất → Đang phục vụ'}</dd></div>
    </dl>
    <fieldset disabled={command.locked} className="mt-4 space-y-4">
      <label className="block text-sm font-semibold">Lý do sửa nhầm (bắt buộc)
        <textarea required maxLength={500} rows={3} value={fields.reason} className="mt-2 w-full rounded-xl border border-border bg-white p-3"
          onChange={event => update({ reason: event.target.value })} />
      </label>
      {!starting && <label className="block text-sm font-semibold">Giờ dự kiến xong mới (Việt Nam) {etaRequired ? '— bắt buộc' : '— không bắt buộc'}
        <input type="datetime-local" required={etaRequired} step={60} value={fields.etaLocal}
          className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3 py-2" onChange={event => update({ etaLocal: event.target.value })} />
        <span className="mt-1 block text-xs font-normal text-muted">Nếu giờ kế hoạch đã hết, cần ETA tương lai và muộn hơn giờ kết thúc kế hoạch, cộng 10 phút dọn.</span>
      </label>}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={fields.confirmed} onChange={event => onFields({ ...fields, confirmed: event.target.checked })} />
        {starting ? 'Tôi xác nhận đã bấm Bắt đầu nhầm; thực tế khách chưa được phục vụ.'
          : 'Tôi xác nhận đã bấm Hoàn tất nhầm; thực tế khách vẫn đang được phục vụ.'}
      </label>
    </fieldset>
    {message && <p role="alert" className="mt-4 text-sm text-terracotta">{message}</p>}
    {conflicts && <section aria-label="Xung đột khi sửa nhầm" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      {conflicts.shiftConflict && <p>Khoảng giữ không nằm trọn trong một ca làm hợp lệ.</p>}
      {conflicts.timeOffConflicts.map((item, index) => <p key={index}>Trùng lịch nghỉ: {format(item.startAt)} – {format(item.endAt)}</p>)}
      <ul className="space-y-2">{conflicts.conflictingAppointments.map(item => <li key={item.id} className="break-words">
        <p>Lịch xung đột: {item.id}</p><p>{format(item.startAt)} – {format(item.endAt)}</p>
        <p>{item.reasons.map(reason => reason === 'staff_overlap' ? 'Trùng khoảng giữ stylist' : 'Trùng thời gian khách').join(' · ')}</p>
      </li>)}</ul>
    </section>}
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button className={button} disabled={command.locked} onClick={onClose}>Quay lại</button>
      {reloadRequired && <button className={button} onClick={onReload}>Tải lại lịch</button>}
      <button className={button + ' bg-terracotta text-white'} onClick={onConfirm}
        disabled={command.kind === 'loading' || (!ambiguous && (!eligible || !fields.reason.trim() || !fields.confirmed || (etaRequired && !fields.etaLocal) || reloadRequired))}>
        {command.kind === 'loading' ? 'Đang lưu…' : ambiguous ? 'Thử lại cùng yêu cầu' : 'Xác nhận sửa nhầm'}
      </button>
    </div>
  </dialog>
}
