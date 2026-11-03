import { staffErrorMessage } from '../staff-errors.js'

const timeFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })
const dateFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })

function formatAppointmentTime(value, formatter) {
  const date = new Date(value)
  return value && Number.isFinite(date.getTime()) ? formatter.format(date) : 'Không có thông tin'
}

// Chỉ trình bày dữ liệu lịch được API cho phép trả về; không tự tạo link M5.
export function ConflictList({ conflicts, demo = false }) {
  if (!conflicts?.length) return null
  return <div className="mt-3"><p>Hãy xử lý từng lịch trước rồi thử lại. Màn xử lý lịch chưa được kết nối.</p><ul className="mt-3 space-y-2">{conflicts.map((item, index) => <li key={item.appointmentId || index} className="rounded-xl border border-red-200 bg-white/70 p-3"><span className="font-semibold">{demo ? 'Lịch mẫu' : 'Lịch hẹn'} {item.appointmentId || ''}</span><span className="mt-1 block">{formatAppointmentTime(item.startAt, dateFormat)} · {formatAppointmentTime(item.startAt, timeFormat)} – {formatAppointmentTime(item.endAt, timeFormat)}</span><span className="mt-1 block text-xs">Trạng thái: {item.status === 'confirmed' ? 'Đã xác nhận' : item.status === 'in_progress' ? 'Đang phục vụ' : item.status || 'Không có thông tin'}</span></li>)}</ul></div>
}

export function LoadFeedback({ state, onRetry, label }) {
  if (state.kind === 'loading') return <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted"><span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-terracotta/25 border-t-terracotta motion-reduce:animate-none" />Đang tải {label}…</p>
  if (state.kind === 'error') return <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-900 motion-safe:animate-rise-in motion-reduce:animate-none"><p>{staffErrorMessage(state.error)}</p><button type="button" onClick={onRetry} className="mt-3 font-semibold underline transition-colors hover:text-terracotta-dark focus-visible:rounded">Thử lại</button></div>
  return null
}
