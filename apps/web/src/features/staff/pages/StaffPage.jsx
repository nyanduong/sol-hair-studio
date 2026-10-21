import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createDemoApiClient } from '../api/staff-demo-transport.js'
import { ConflictList, LoadFeedback } from '../components/StaffFeedback.jsx'
import { addDays, formatWeekRange, weekStart } from '../demo.js'
import { useStaff } from '../hooks/useStaff.js'
import { staffActionErrorMessage } from '../staff-errors.js'

const button = 'rounded-full bg-terracotta px-5 py-3 text-sm font-semibold text-white hover:bg-terracotta-dark disabled:opacity-50'
const secondary = 'rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-soft-surface disabled:opacity-50'
const input = 'mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const dateLabel = (date) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
const timeLabel = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(date))

// Chuyển giờ tiệm sang ISO có múi giờ, kể cả biên 00:00 ngày kế tiếp.
function shiftInput(form) {
  const endDay = form.end === '00:00' ? addDays(form.date, 1) : form.date
  return { localDate: form.date, startAt: new Date(`${form.date}T${form.start}:00+07:00`).toISOString(), endAt: new Date(`${endDay}T${form.end}:00+07:00`).toISOString() }
}

// client được truyền từ phiên SOL-018 khi tích hợp; mặc định chỉ dùng dữ liệu mẫu.
export default function StaffPage({ client: suppliedClient }) {
  const demoClient = useMemo(() => createDemoApiClient(today()), [])
  const client = suppliedClient || demoClient
  const isDemo = !suppliedClient
  const [week, setWeek] = useState(() => weekStart(today()))
  const [profile, setProfile] = useState(null)
  const [shiftForm, setShiftForm] = useState(null)
  const [formError, setFormError] = useState('')
  const profileRef = useRef(null)
  const shiftRef = useRef(null)
  const profileOpen = Boolean(profile)
  const shiftOpen = Boolean(shiftForm)
  useEffect(() => { if (profileOpen) profileRef.current?.focus() }, [profileOpen])
  useEffect(() => { if (shiftOpen) shiftRef.current?.focus() }, [shiftOpen])
  const state = useStaff(client, week)
  const { current, people, services, actionState, shiftState, mutate } = state
  const working = actionState.kind === 'loading'
  const shifts = shiftState.kind === 'success' ? shiftState.data : []
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index))

  function clearMessages() { setFormError(''); state.clearAction() }
  function openProfile(person) {
    clearMessages(); setShiftForm(null)
    setProfile(person ? { ...person, serviceIds: [...person.serviceIds] } : { displayName: '', email: '', serviceIds: [] })
  }
  function openShift(shift) { clearMessages(); setProfile(null); setShiftForm(shift) }

  async function saveProfile(event) {
    event.preventDefault(); clearMessages()
    const displayName = profile.displayName.trim()
    if (!displayName || displayName.length > 120) return setFormError('Tên hiển thị là bắt buộc và tối đa 120 ký tự.')
    if (profile.serviceIds.length > 50) return setFormError('Chọn tối đa 50 dịch vụ.')
    const payload = { displayName, serviceIds: profile.serviceIds }
    if (!profile.staffId) payload.email = profile.email.trim()
    const result = await mutate((signal) => profile.staffId ? client.updateStaff(profile.staffId, payload, signal) : client.createStaff(payload, signal), 'people')
    if (result) { state.setSelected(result.staffId || profile.staffId); setProfile(null) }
  }
  async function changeActive() {
    clearMessages()
    await mutate((signal) => client.updateStaff(current.staffId, { isActive: !current.isActive }, signal), 'people')
  }
  async function saveShift(event) {
    event.preventDefault(); clearMessages()
    if (!shiftForm.date || !shiftForm.start || !shiftForm.end || (shiftForm.end !== '00:00' && shiftForm.end <= shiftForm.start) || (shiftForm.start === '00:00' && shiftForm.end === '00:00')) return setFormError('Chọn ngày và giờ kết thúc sau giờ bắt đầu.')
    const payload = shiftInput(shiftForm)
    const result = await mutate((signal) => shiftForm.shiftId ? client.updateShift(current.staffId, shiftForm.shiftId, payload, signal) : client.createShift(current.staffId, payload, signal), 'shifts')
    if (result) { setShiftForm(null); if (shiftForm.date < week || shiftForm.date > addDays(week, 6)) setWeek(weekStart(shiftForm.date)) }
  }
  async function cancelShift(shift) {
    clearMessages()
    await mutate((signal) => client.cancelShift(current.staffId, shift.shiftId, signal), 'shifts')
  }
  function selectPerson(id) { state.setSelected(id); setProfile(null); setShiftForm(null); clearMessages() }
  function changeWeek(days) { setShiftForm(null); clearMessages(); setWeek((value) => addDays(value, days)) }
  function refreshAfterError() { setProfile(null); setShiftForm(null); clearMessages(); void state.reloadPeople() }
  const availableServices = profile ? [...services, ...profile.serviceIds.filter((id) => !services.some((item) => item.id === id)).map((id) => ({ id, name: `Dịch vụ không có trong danh mục (${id})` }))] : []

  return <main className="min-h-screen pb-16">
    <header className="border-b border-border bg-white/70"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-8"><Link to="/" className="font-display text-xl font-semibold tracking-widest">SOL HAIR STUDIO</Link><Link to="/" className="text-sm text-muted hover:text-terracotta">← Trang chủ</Link></div></header>
    <div className="mx-auto max-w-7xl px-4 sm:px-8">
      {isDemo && <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Bản minh họa với dữ liệu mẫu.</strong> Thay đổi chỉ lưu trong bộ nhớ, không tạo tài khoản hay thay đổi dữ liệu thật. Phiên đăng nhập và màn xử lý lịch đang chờ các phần phụ thuộc.</div>}
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">Không gian quản lý</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">Nhân sự & ca làm</h1><p className="mt-3 text-sm text-muted">Quản lý đội ngũ, dịch vụ và lịch làm việc theo tuần.</p></div><button className={button} disabled={working || state.peopleState.kind !== 'success'} onClick={() => openProfile(null)}>+ Thêm nhân viên</button></div>
      {actionState.kind === 'loading' && <p role="status" className="mt-5 text-sm text-muted">Đang lưu thay đổi…</p>}
      {actionState.kind === 'success' && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{isDemo ? 'Đã lưu trong bản minh họa. Dữ liệu sẽ mất khi tải lại trang.' : 'Đã lưu thay đổi.'}</p>}
      {actionState.kind === 'error' && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p>{staffActionErrorMessage(actionState.error)}</p>{actionState.error?.code === 'APPOINTMENT_CONFLICT' && <ConflictList conflicts={actionState.error.conflicts} demo={isDemo} />}{(!actionState.error?.status || actionState.error.status >= 500) && <button type="button" onClick={refreshAfterError} className="mt-3 font-semibold underline">Tải lại dữ liệu</button>}</div>}
      <div className="mt-8 grid gap-6 lg:grid-cols-[300px_1fr]">
        <section aria-labelledby="team-heading" className="rounded-3xl border border-border bg-white p-5"><div className="flex items-center justify-between"><h2 id="team-heading" className="font-display text-2xl">Đội ngũ</h2>{state.peopleState.kind === 'success' && <span className="text-xs text-muted">{people.length} hồ sơ</span>}</div>
          <LoadFeedback state={state.peopleState} onRetry={state.reloadPeople} label="nhân sự và dịch vụ" />
          {state.peopleState.kind === 'success' && !people.length && <p className="mt-5 text-sm text-muted">Chưa có hồ sơ nhân viên. Chọn “Thêm nhân viên” để bắt đầu.</p>}
          <div className="mt-4 space-y-2">{people.map((person) => <button key={person.staffId} disabled={working} onClick={() => selectPerson(person.staffId)} aria-pressed={state.selected === person.staffId} className={`w-full rounded-2xl p-4 text-left disabled:opacity-50 ${state.selected === person.staffId ? 'bg-soft-surface ring-1 ring-terracotta/30' : 'hover:bg-soft-surface/60'}`}><span className="block font-semibold">{person.displayName} {person.owner && <span className="text-xs font-normal text-terracotta">· Chủ tiệm</span>}</span><span className="mt-1 block text-xs text-muted">{person.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}</span></button>)}</div>
        </section>
        {current && <div className="space-y-6"><section className="rounded-3xl border border-border bg-white p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-muted">Hồ sơ nhân sự</p><h2 className="mt-2 font-display text-3xl">{current.displayName}</h2><p className="mt-1 text-sm text-muted">{current.email && <>{current.email} · </>}{current.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}</p></div><div className="flex flex-wrap gap-2"><button className={secondary} disabled={working} onClick={() => openProfile(current)}>Sửa hồ sơ</button><button className={secondary} disabled={working} onClick={changeActive}>{current.isActive ? 'Ngừng hoạt động' : 'Hoạt động lại'}</button></div></div><div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-semibold">Dịch vụ thực hiện</h3><div className="mt-3 flex flex-wrap gap-2">{current.serviceIds.length ? current.serviceIds.map((id) => <span className="rounded-full bg-soft-surface px-3 py-1.5 text-xs" key={id}>{services.find((item) => item.id === id)?.name || `Dịch vụ không có trong danh mục (${id})`}</span>) : <span className="text-sm text-muted">Chưa gán dịch vụ.</span>}</div></div></section>
          <section className="rounded-3xl border border-border bg-white p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-muted">Lịch làm việc</p><h2 className="mt-1 font-display text-3xl">Ca theo tuần</h2></div><button className={button} disabled={working} onClick={() => openShift({ date: week, start: '09:00', end: '17:00' })}>+ Thêm ca</button></div><div className="mt-6 flex items-center justify-between gap-3"><button aria-label="Tuần trước" className={secondary} disabled={working} onClick={() => changeWeek(-7)}>←</button><div aria-live="polite" className="min-w-0 text-center"><span className="block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted">Tuần làm việc</span><span className="mt-1 block text-sm font-semibold leading-snug text-ink sm:text-base">{formatWeekRange(week)}</span></div><button aria-label="Tuần sau" className={secondary} disabled={working} onClick={() => changeWeek(7)}>→</button></div>
            <LoadFeedback state={shiftState} onRetry={state.reloadShifts} label="ca làm" />
            {shiftState.kind === 'success' && <><p className="mt-5 text-sm text-muted">{shifts.length ? `${shifts.length} ca trong tuần` : 'Chưa có ca trong tuần này.'}</p><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{days.map((day, index) => <div key={day} className="min-h-32 rounded-2xl bg-canvas p-4"><p className="text-xs font-semibold text-muted">{['THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY', 'CHỦ NHẬT'][index]} · {dateLabel(day)}</p>{shifts.filter((shift) => shift.localDate === day).map((shift) => <div key={shift.shiftId} className="mt-3 rounded-xl border border-border bg-white p-3"><p className={`text-sm font-semibold ${shift.status === 'active' ? '' : 'text-muted line-through'}`}>{timeLabel(shift.startAt)} – {timeLabel(shift.endAt)}</p><p className="mt-1 text-xs text-muted">{shift.status === 'active' ? 'Đang xếp' : 'Đã hủy'}</p>{shift.status === 'active' && <div className="mt-2 flex gap-3 text-xs font-semibold text-terracotta"><button disabled={working} onClick={() => openShift({ shiftId: shift.shiftId, date: shift.localDate, start: timeLabel(shift.startAt), end: timeLabel(shift.endAt) })}>Sửa</button><button disabled={working} onClick={() => cancelShift(shift)}>Hủy ca</button></div>}</div>)}{!shifts.some((shift) => shift.localDate === day) && <p className="mt-4 text-xs text-muted">Chưa có ca</p>}</div>)}</div></>}
          </section></div>}
      </div>
      {profile && <section ref={profileRef} tabIndex={-1} aria-labelledby="profile-title" className="mt-6 rounded-3xl border border-border bg-white p-6"><h2 id="profile-title" className="font-display text-3xl">{profile.staffId ? 'Sửa hồ sơ' : 'Thêm nhân viên'}</h2><form onSubmit={saveProfile} className="mt-4 space-y-4">{formError && <p role="alert" className="text-sm text-red-800">{formError}</p>}{actionState.kind === 'error' && <div className="text-sm text-red-800"><p>{staffActionErrorMessage(actionState.error)}</p><ConflictList conflicts={actionState.error.conflicts} demo={isDemo} /></div>}<div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Tên hiển thị<input className={input} value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} maxLength={120} required /></label>{!profile.staffId && <label className="text-sm font-semibold">Email<input className={input} type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required /></label>}</div><fieldset><legend className="text-sm font-semibold">Dịch vụ thực hiện</legend><div className="mt-3 flex flex-wrap gap-4">{availableServices.map((service) => <label key={service.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.serviceIds.includes(service.id)} onChange={(e) => setProfile({ ...profile, serviceIds: e.target.checked ? [...profile.serviceIds, service.id] : profile.serviceIds.filter((id) => id !== service.id) })} />{service.name}</label>)}</div>{!availableServices.length && <p className="mt-2 text-sm text-muted">Chưa có dịch vụ để gán.</p>}</fieldset><div className="flex gap-3"><button className={button} disabled={working}>{working ? 'Đang lưu…' : 'Lưu hồ sơ'}</button><button type="button" className={secondary} disabled={working} onClick={() => { setProfile(null); clearMessages() }}>Đóng</button></div></form></section>}
      {shiftForm && <section ref={shiftRef} tabIndex={-1} aria-labelledby="shift-title" className="mt-6 rounded-3xl border border-border bg-white p-6"><h2 id="shift-title" className="font-display text-3xl">{shiftForm.shiftId ? 'Sửa ca' : 'Thêm ca'} · {current?.displayName}</h2><p className="mt-2 text-sm text-muted">Giờ địa phương của tiệm (Việt Nam). Chọn 00:00 để kết thúc vào đầu ngày kế tiếp.</p><form onSubmit={saveShift} className="mt-4 space-y-4">{formError && <p role="alert" className="text-sm text-red-800">{formError}</p>}{actionState.kind === 'error' && <div className="text-sm text-red-800"><p>{staffActionErrorMessage(actionState.error)}</p><ConflictList conflicts={actionState.error.conflicts} demo={isDemo} /></div>}<div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold">Ngày<input className={input} type="date" required value={shiftForm.date} onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })} /></label><label className="text-sm font-semibold">Bắt đầu<input className={input} type="time" required value={shiftForm.start} onChange={(e) => setShiftForm({ ...shiftForm, start: e.target.value })} /></label><label className="text-sm font-semibold">Kết thúc<input className={input} type="time" required value={shiftForm.end} onChange={(e) => setShiftForm({ ...shiftForm, end: e.target.value })} /></label></div><div className="flex gap-3"><button className={button} disabled={working}>{working ? 'Đang lưu…' : 'Lưu ca'}</button><button type="button" className={secondary} disabled={working} onClick={() => { setShiftForm(null); clearMessages() }}>Đóng</button></div></form></section>}
    </div>
  </main>
}
