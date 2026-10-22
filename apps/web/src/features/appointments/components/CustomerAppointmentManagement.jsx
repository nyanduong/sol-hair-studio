import { useEffect, useMemo, useRef, useState } from 'react'
import { salonDate, slotTime, money } from '../../../../../../shared/booking.js'
import { useAppointmentListView, isAppointmentCutoffReached } from '../hooks/useAppointmentListView.js'
import { assertCustomerAppointmentEditable, reschedulePayload, useAppointmentCommand } from '../hooks/useAppointmentCommand.js'
import { useRescheduleOptions } from '../hooks/useRescheduleOptions.js'

const primary = 'inline-flex min-h-11 items-center justify-center rounded-full bg-terracotta px-6 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
const secondary = 'inline-flex min-h-11 items-center justify-center rounded-full bg-soft-surface px-6 py-2 text-sm font-semibold text-ink disabled:opacity-50'

const fmtWeekday = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  weekday: 'long',
})

function formatScheduleSummary(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  const time = slotTime(isoString)
  const weekday = fmtWeekday.format(d)
  const vnTime = new Date(d.getTime() + 7 * 3600_000)
  const day = String(vnTime.getUTCDate()).padStart(2, '0')
  const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0')
  return `${time} – ${weekday}, ${day}/${month}`
}

export default function CustomerAppointmentManagement({ token, appointment, onChanged, initialAction, onClose }) {
  const [operation, setOperation] = useState(() => ['cancel', 'reschedule'].includes(initialAction) ? initialAction : null)
  const items = useMemo(() => [appointment], [appointment])
  const view = useAppointmentListView({ kind: 'success', items }, 'upcoming')
  const editable = appointment.status === 'confirmed' && !isAppointmentCutoffReached(appointment, view.now)
  const close = () => { setOperation(null); onClose?.() }
  return (
    <>
      <div className="mt-5 flex flex-wrap justify-end gap-3 px-6 sm:px-8">
        {editable ? (
          <>
            <button className={primary} onClick={() => setOperation('reschedule')}>Đổi lịch hẹn</button>
            <button className={secondary} onClick={() => setOperation('cancel')}>Hủy lịch hẹn</button>
          </>
        ) : <p className="text-sm text-muted">Lịch này không còn đủ điều kiện đổi/hủy trực tuyến.</p>}
      </div>
      {operation && <CommandDialog key={operation} token={token} appointment={appointment}
        operation={operation} editable={editable} onClose={close} onChanged={onChanged} />}
    </>
  )
}

function CommandDialog({ token, appointment, operation, editable, onClose, onChanged }) {
  const dialog = useRef(null)
  const command = useAppointmentCommand(token, appointment.id, operation)
  const [localError, setLocalError] = useState('')
  const [selection, setSelection] = useState(null)
  useEffect(() => {
    const previous = document.activeElement
    const node = dialog.current
    node.showModal()
    return () => { node.close(); previous?.focus() }
  }, [])
  async function confirm() {
    setLocalError('')
    try {
      const payload = command.pending?.payload ?? (() => {
        assertCustomerAppointmentEditable(appointment)
        return operation === 'cancel' ? { expectedRevision: appointment.revision } :
          reschedulePayload(appointment, selection ?? {}, selection?.options)
      })()
      const result = await command.submit(payload)
      if (result.kind === 'success') { onChanged(result.value, operation); onClose() }
    } catch (error) { setLocalError(error.message) }
  }
  const error = command.error
  const ambiguous = Boolean(command.pending) && command.kind !== 'loading'

  if (operation === 'cancel') {
    return (
      <dialog ref={dialog} aria-labelledby="appointment-command-title"
        onCancel={event => { event.preventDefault(); if (!command.locked) onClose() }}
        className="fixed inset-0 m-auto max-h-[90svh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-3xl border border-border bg-canvas p-6 text-ink shadow-xl backdrop:bg-ink/40 sm:p-8">
        <h2 id="appointment-command-title" className="font-display text-3xl">Hủy lịch hẹn?</h2>
        <p className="mt-3 text-sm text-muted">
          Bạn có chắc muốn hủy lịch này? Lịch đã hủy không thể mở lại; nếu cần, bạn đặt một lịch mới.
        </p>
        {!editable && !command.pending && <p role="alert" className="mt-4 text-sm">Lịch không còn đủ điều kiện đổi/hủy. Hãy tải lại lịch.</p>}
        {(localError || error) && <p role="alert" className="mt-4 text-sm text-terracotta">
          {localError || (ambiguous ? 'Chưa xác định được kết quả. Thử lại cùng yêu cầu; không tạo thao tác khác.' :
            error.status === 409 ? 'Lịch hoặc giờ trống đã thay đổi. Tải lại lịch và chọn lại trước khi xác nhận.' :
            [401, 403, 404].includes(error.status) ? 'Phiên đăng nhập hoặc quyền truy cập đã thay đổi. Hãy đăng nhập/tải lại lịch.' :
            'Không thực hiện được yêu cầu. Vui lòng thử lại.')}
        </p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button className={secondary} disabled={command.locked} onClick={onClose}>Quay lại</button>
          {error?.status === 409 && !command.pending && <button className={secondary} onClick={() => { onChanged(); onClose() }}>Tải lại lịch</button>}
          <button className={primary} disabled={command.kind === 'loading' || (!command.pending && !editable)}
            onClick={confirm}>{command.kind === 'loading' ? 'Đang xử lý…' : ambiguous ? 'Thử lại cùng yêu cầu' : 'Xác nhận hủy lịch'}</button>
        </div>
      </dialog>
    )
  }

  return (
    <dialog ref={dialog} aria-labelledby="appointment-command-title"
      onCancel={event => { event.preventDefault(); if (!command.locked) onClose() }}
      className="fixed inset-0 m-auto max-h-[92svh] w-[calc(100%_-_2rem)] max-w-5xl overflow-y-auto rounded-[28px] border border-[#efe6db] bg-canvas p-6 text-ink shadow-2xl backdrop:bg-ink/40 sm:p-8">
      <div>
        <h2 id="appointment-command-title" className="font-display text-2xl font-bold text-ink sm:text-3xl">Đổi lịch hẹn</h2>
        <p className="mt-1 text-sm text-muted">
          Chọn chuyên viên, ngày và giờ trống mới. Dịch vụ, giá và thời lượng đã đặt được giữ nguyên.
        </p>
      </div>

      <RescheduleForm
        token={token}
        appointment={appointment}
        locked={command.locked}
        onSelect={setSelection}
        selection={selection}
        command={command}
        editable={editable}
        localError={localError}
        error={error}
        ambiguous={ambiguous}
        onConfirm={confirm}
        onClose={onClose}
        onReload={() => { onChanged(); onClose() }}
      />
    </dialog>
  )
}

export function RescheduleForm({
  token,
  appointment,
  locked,
  onSelect,
  selection,
  command,
  editable,
  localError,
  error,
  ambiguous,
  onConfirm,
  onClose,
  onReload,
}) {
  const [stylistMode, setStylistMode] = useState('current')
  const [otherStaffId, setOtherStaffId] = useState('')
  const [localDate, setLocalDate] = useState(() => salonDate())
  const [startAt, setStartAt] = useState('')

  const options = useRescheduleOptions(token, appointment.id, localDate)
  const allStylists = options.value?.stylists ?? []
  const otherStylists = allStylists.filter(item => item.staffId !== appointment.staffId)

  const activeStaffId = stylistMode === 'current' ? appointment.staffId : otherStaffId
  const activeStaffObj = allStylists.find(item => item.staffId === activeStaffId)

  const ready = options.kind === 'success' && options.value.revision === appointment.revision
  const selected = ready && activeStaffObj?.slots.some(slot => slot.startAt === startAt)

  useEffect(() => {
    if (!selected) onSelect(null)
  }, [selected, onSelect])

  function handleModeChange(mode) {
    setStylistMode(mode)
    setStartAt('')
    onSelect(null)
    if (mode === 'other' && !otherStaffId && otherStylists.length > 0) {
      setOtherStaffId(otherStylists[0].staffId)
    }
  }

  function handleSelectOther(staffId) {
    setOtherStaffId(staffId)
    setStartAt('')
    onSelect(null)
  }

  function chooseDate(newDate) {
    setLocalDate(newDate)
    setStartAt('')
    onSelect(null)
  }

  function chooseSlot(slotStartAt) {
    setStartAt(slotStartAt)
    onSelect({
      staffId: activeStaffId,
      startAt: slotStartAt,
      options: options.value,
    })
  }

  const baseToday = useMemo(() => salonDate(), [])
  const upcomingDays = useMemo(() => {
    const [y, m, d] = baseToday.split('-').map(Number)
    const list = []
    const weekdayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
    for (let i = 0; i < 7; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0))
      const dateStr = dt.toISOString().slice(0, 10)
      list.push({
        dateStr,
        dayNum: dt.getUTCDate(),
        weekday: weekdayNames[dt.getUTCDay()],
        month: dt.getUTCMonth() + 1,
        year: dt.getUTCFullYear(),
      })
    }
    return list
  }, [baseToday])

  const currentDayIdx = upcomingDays.findIndex(d => d.dateStr === localDate)
  const currentDayMeta = upcomingDays[currentDayIdx >= 0 ? currentDayIdx : 0]
  const monthDisplay = currentDayMeta ? `Tháng ${currentDayMeta.month}, ${currentDayMeta.year}` : ''

  function handlePrevDay() {
    if (currentDayIdx > 0) {
      chooseDate(upcomingDays[currentDayIdx - 1].dateStr)
    }
  }

  function handleNextDay() {
    if (currentDayIdx >= 0 && currentDayIdx < upcomingDays.length - 1) {
      chooseDate(upcomingDays[currentDayIdx + 1].dateStr)
    }
  }

  const activeStylistDisplayName =
    activeStaffObj?.displayName ||
    (stylistMode === 'current'
      ? appointment.staffNameSnapshot || 'Chuyên viên hiện tại'
      : otherStylists.find(s => s.staffId === otherStaffId)?.displayName || 'Chưa chọn chuyên viên')

  return (
    <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* ── CỘT TRÁI (lg:col-span-7): Chọn chuyên viên & Thời gian ── */}
      <fieldset disabled={locked} className="space-y-6 lg:col-span-7">
        {/* 1. Chọn chuyên viên */}
        <section aria-labelledby="section-stylist-heading">
          <h3 id="section-stylist-heading" className="text-sm font-bold uppercase tracking-wider text-ink">
            1. Chọn chuyên viên
          </h3>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Giữ chuyên viên hiện tại */}
            <div
              role="radio"
              aria-checked={stylistMode === 'current'}
              tabIndex={0}
              onClick={() => handleModeChange('current')}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') handleModeChange('current') }}
              className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                stylistMode === 'current'
                  ? 'border-[#a14f3d] bg-[#fbf9f5] shadow-xs ring-1 ring-[#a14f3d]'
                  : 'border-[#efe6db] bg-white hover:border-[#a14f3d]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`flex size-4 items-center justify-center rounded-full border ${
                  stylistMode === 'current' ? 'border-[#3E2317]' : 'border-stone-400'
                }`}>
                  {stylistMode === 'current' && <span className="size-2 rounded-full bg-terracotta" />}
                </span>
                <span className="text-sm font-semibold text-ink">Giữ chuyên viên hiện tại</span>
              </div>

              <div className="mt-3 flex items-center gap-3 pl-6">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f0e8dc] text-sm font-bold text-terracotta ring-1 ring-[#e2d5c3]">
                  {appointment.staffNameSnapshot ? appointment.staffNameSnapshot.charAt(0) : 'S'}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {appointment.staffNameSnapshot || 'Chuyên viên hiện tại'}
                  </p>
                  <p className="text-xs text-muted">Chuyên viên đang phụ trách lịch hẹn này.</p>
                </div>
              </div>
            </div>

            {/* Chọn chuyên viên khác */}
            <div
              role="radio"
              aria-checked={stylistMode === 'other'}
              tabIndex={0}
              onClick={() => handleModeChange('other')}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') handleModeChange('other') }}
              className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                stylistMode === 'other'
                  ? 'border-[#3E2317] bg-[#fbf9f5] shadow-xs ring-1 ring-[#3E2317]'
                  : 'border-[#efe6db] bg-white hover:border-[#a14f3d]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`flex size-4 items-center justify-center rounded-full border ${
                    stylistMode === 'other' ? 'border-[#3E2317]' : 'border-stone-400'
                  }`}>
                    {stylistMode === 'other' && <span className="size-2 rounded-full bg-[#3E2317]" />}
                  </span>
                  <span className="text-sm font-semibold text-ink">Chọn chuyên viên khác</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>

              <div className="mt-3 flex items-center gap-3 pl-6">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#f3eee6] text-muted ring-1 ring-[#e2d5c3]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">Xem lịch trống của stylist khác</p>
                  {stylistMode === 'other' && (
                    <div className="mt-1" onClick={e => e.stopPropagation()}>
                      {options.kind === 'loading' ? (
                        <span className="text-xs text-muted">Đang tải chuyên viên…</span>
                      ) : otherStylists.length === 0 ? (
                        <span className="text-xs text-terracotta">Không có chuyên viên khác cho dịch vụ này</span>
                      ) : (
                        <select
                          aria-label="Chọn chuyên viên khác"
                          value={otherStaffId}
                          onChange={e => handleSelectOther(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#efe6db] bg-white px-2 py-1 text-xs font-medium text-ink focus:border-[#3E2317] focus:outline-none"
                        >
                          <option value="">-- Chọn chuyên viên --</option>
                          {otherStylists.map(item => (
                            <option key={item.staffId} value={item.staffId}>
                              {item.displayName}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Chọn thời gian mới */}
        <section aria-labelledby="section-datetime-heading" className="space-y-4">
          <h3 id="section-datetime-heading" className="text-sm font-bold uppercase tracking-wider text-ink">
            2. Chọn thời gian mới
          </h3>

          {/* Ngày trong tuần & Tháng navigator */}
          <div>
            <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-ink">
              <span>Ngày trong tuần</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Ngày trước"
                  disabled={currentDayIdx <= 0}
                  onClick={handlePrevDay}
                  className="flex size-7 items-center justify-center rounded-lg border border-[#efe6db] bg-white text-ink transition-colors hover:bg-soft-surface disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ‹
                </button>
                <span className="min-w-[100px] text-center font-medium text-ink">{monthDisplay}</span>
                <button
                  type="button"
                  aria-label="Ngày sau"
                  disabled={currentDayIdx >= upcomingDays.length - 1}
                  onClick={handleNextDay}
                  className="flex size-7 items-center justify-center rounded-lg border border-[#efe6db] bg-white text-ink transition-colors hover:bg-soft-surface disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ›
                </button>
              </div>
            </div>

            {/* 7-day strip */}
            <div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">
              {upcomingDays.map(day => {
                const isSelected = day.dateStr === localDate
                return (
                  <button
                    type="button"
                    key={day.dateStr}
                    onClick={() => chooseDate(day.dateStr)}
                    className={`flex flex-col items-center justify-center rounded-2xl p-2 sm:p-2.5 text-center transition-all ${
                      isSelected
                        ? 'bg-terracotta text-white shadow-xs'
                        : 'border border-[#efe6db] bg-white text-ink hover:border-[#a14f3d]'
                    }`}
                  >
                    <span className={`text-[11px] font-medium ${isSelected ? 'text-white/80' : 'text-muted'}`}>
                      {day.weekday}
                    </span>
                    <span className="my-0.5 font-display text-xl sm:text-2xl font-bold leading-tight">
                      {day.dayNum}
                    </span>
                    <span className={`text-[10px] font-medium leading-none ${isSelected ? 'text-[#fbf9f5]' : 'text-transparent'}`}>
                      {isSelected ? 'Đang chọn' : '·'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Khung giờ salon */}
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-ink">
              <span>Khung giờ salon</span>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" /> Còn sẵn
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#3E2317]" /> Đã chọn
                </span>
              </div>
            </div>

            <div className="mt-3">
              {options.kind === 'loading' && (
                <p role="status" className="rounded-xl border border-dashed border-[#efe6db] bg-white/60 p-6 text-center text-sm text-muted">
                  Đang tìm giờ trống…
                </p>
              )}

              {options.kind === 'error' && (
                <div role="alert" className="rounded-xl border border-terracotta/20 bg-terracotta/5 p-4 text-sm text-terracotta">
                  Không tải được giờ trống. <button type="button" onClick={options.retry} className="font-semibold underline">Thử lại</button>
                </div>
              )}

              {options.kind === 'success' && !ready && (
                <p role="alert" className="rounded-xl border border-terracotta/20 bg-terracotta/5 p-4 text-sm text-terracotta">
                  Lịch đã thay đổi. Đóng hộp thoại và tải lại lịch.
                </p>
              )}

              {ready && (
                <>
                  {(!activeStaffObj || !activeStaffObj.slots.length) ? (
                    <p role="status" className="rounded-xl border border-[#efe6db] bg-white p-6 text-center text-sm text-muted">
                      {stylistMode === 'current'
                        ? 'Chuyên viên hiện tại không có giờ trống trong ngày này. Hãy chọn ngày khác hoặc chọn chuyên viên khác.'
                        : 'Chuyên viên được chọn không có giờ trống trong ngày này. Hãy chọn ngày hoặc chuyên viên khác.'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {activeStaffObj.slots.map(slot => {
                        const isSelected = startAt === slot.startAt
                        const isCurrentSlot = activeStaffId === appointment.staffId && slot.startAt === appointment.startAt
                        return (
                          <button
                            type="button"
                            key={slot.startAt}
                            disabled={locked || isCurrentSlot}
                            onClick={() => chooseSlot(slot.startAt)}
                            className={`flex flex-col items-center justify-center rounded-xl p-3 text-center transition-all ${
                              isSelected
                                ? 'bg-[#3E2317] text-white shadow-xs'
                                : isCurrentSlot
                                  ? 'border border-[#efe6db] bg-[#f3eee6] text-muted opacity-60 cursor-not-allowed'
                                  : 'border border-[#efe6db] bg-white text-ink hover:border-[#3E2317]'
                            }`}
                          >
                            <span className="font-semibold text-sm sm:text-base">{slotTime(slot.startAt)}</span>
                            <span className={`text-[11px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-muted'}`}>
                              {isSelected ? 'Đã chọn' : isCurrentSlot ? 'Lịch hiện tại' : 'Còn chỗ'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </fieldset>

      {/* ── CỘT PHẢI (lg:col-span-5): Banner, Tóm tắt, Chú thích & Nút bấm ── */}
      <div className="space-y-4 lg:col-span-5">
        {/* Banner */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#efe6db] bg-[#fbf9f5] p-4 shadow-2xs">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#f0e8dc] text-terracotta">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
            </svg>
          </div>
          {appointment.items.length > 0 && (
            appointment.items.map(item => (
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#8c827a]">Dịch vụ</p>
                <p className="mt-0.5 font-display text-sm italic font-semibold text-ink">
                  {item.name}
                </p>
                <p className="mt-1 text-[11px] text-muted flex gap-1 items-center">
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
            ))
          )}
        </div>

        {/* Card Tóm tắt thay đổi */}
        <div className="rounded-2xl border border-[#efe6db] bg-[#fbf9f5] p-5 shadow-xs">
          <div className="flex items-center gap-2 border-b border-[#efe6db] pb-3 text-xs font-bold uppercase tracking-wider text-terracotta">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Tóm tắt thay đổi</span>
          </div>

          <dl className="mt-4 space-y-2.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted shrink-0">Lịch cũ:</dt>
              <dd className="font-medium text-ink text-right">
                {formatScheduleSummary(appointment.startAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted shrink-0">Lịch mới dự kiến:</dt>
              <dd className="font-semibold text-terracotta text-right">
                {startAt ? formatScheduleSummary(startAt) : 'Chưa chọn giờ mới'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted shrink-0">Chuyên viên:</dt>
              <dd className="font-medium text-ink text-right">
                {activeStylistDisplayName}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted shrink-0">Dịch vụ:</dt>
              <dd className="font-medium text-ink text-right">
                Giữ nguyên ({appointment.items?.length || 0} dịch vụ)
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted shrink-0">Thời lượng:</dt>
              <dd className="font-medium text-ink text-right">
                {appointment.totalDurationMinutes} phút (đã bao gồm dọn)
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-[#efe6db] pt-3 text-sm font-semibold">
              <dt className="text-ink shrink-0">Tổng giá dự kiến:</dt>
              <dd className="text-terracotta text-right">
                {money(appointment.totalPriceVnd)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Chú thích thông tin */}
        <div className="flex items-start gap-2.5 rounded-xl border border-[#efe6db] bg-[#fbf9f5] p-3 text-xs text-muted">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted mt-0.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p>Dịch vụ, giá và thời lượng giữ nguyên theo lịch hẹn ban đầu. Bạn chỉ thay đổi ngày, giờ và (nếu chọn) chuyên viên.</p>
        </div>

        {/* Thông báo lỗi / trạng thái */}
        {!editable && !command.pending && (
          <p role="alert" className="text-xs text-terracotta">Lịch không còn đủ điều kiện đổi/hủy. Hãy tải lại lịch.</p>
        )}
        {(localError || error) && (
          <p role="alert" className="text-xs text-terracotta">
            {localError || (ambiguous ? 'Chưa xác định được kết quả. Thử lại cùng yêu cầu; không tạo thao tác khác.' :
              error.status === 409 ? 'Lịch hoặc giờ trống đã thay đổi. Tải lại lịch và chọn lại trước khi xác nhận.' :
              [401, 403, 404].includes(error.status) ? 'Phiên đăng nhập hoặc quyền truy cập đã thay đổi. Hãy đăng nhập/tải lại lịch.' :
              'Không thực hiện được yêu cầu. Vui lòng thử lại.')}
          </p>
        )}

        {/* Các nút bấm hành động */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            className="w-full inline-flex min-h-12 items-center justify-center rounded-full bg-terracotta hover:bg-[#2b170e] px-6 py-3 text-sm font-semibold text-white shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            disabled={command.kind === 'loading' || (!command.pending && (!editable || !selection))}
            onClick={onConfirm}
          >
            {command.kind === 'loading'
              ? 'Đang xử lý…'
              : ambiguous
                ? 'Thử lại cùng yêu cầu'
                : 'Xác nhận đổi lịch hẹn →'}
          </button>
          <button
            type="button"
            className="w-full inline-flex min-h-11 items-center justify-center rounded-full bg-[#f3eee6] hover:bg-[#eae2d7] px-6 py-2.5 text-sm font-semibold text-ink transition-colors disabled:opacity-50"
            disabled={locked}
            onClick={onClose}
          >
            Quay lại
          </button>
          {error?.status === 409 && !command.pending && (
            <button
              type="button"
              className="w-full inline-flex min-h-11 items-center justify-center rounded-full bg-soft-surface px-6 py-2 text-sm font-semibold text-ink hover:bg-[#eae2d7]"
              onClick={onReload}
            >
              Tải lại lịch
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export const RescheduleFields = RescheduleForm
