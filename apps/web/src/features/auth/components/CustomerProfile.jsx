import { useEffect, useRef, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { useBookingQuery } from '../../booking/hooks/useBookingQuery.js'
import { updateBookingProfile } from '../../booking/api/booking.api.js'
import { contactInput } from '../../../../../../shared/booking.js'

export default function CustomerProfile({ token, onSaved }) {
  const query = useBookingQuery('profile', token, {})
  const [draft, setDraft] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(null)
  useEffect(() => () => request.current?.abort(), [])
  const value = draft || query.value?.customer || { displayName: '', phone: '' }
  async function save(event) {
    event.preventDefault()
    if (busy) return
    try {
      const input = contactInput(value.displayName, value.phone)
      setBusy(true); setNotice('')
      const controller = new AbortController(); request.current = controller
      await updateBookingProfile(apiBaseUrl, token, input, controller.signal)
      if (controller.signal.aborted) return
      setDraft(input); setNotice('Đã lưu thông tin. Lịch đã đặt giữ nguyên thông tin lúc đặt.'); onSaved?.()
    } catch (error) { if (!request.current?.signal.aborted) setNotice(error.message) }
    finally { if (!request.current?.signal.aborted) setBusy(false) }
  }
  if (query.kind === 'loading' || query.kind === 'idle') return <p role="status">Đang tải hồ sơ…</p>
  if (query.kind === 'error') return <div role="alert">Chưa tải được hồ sơ. <button onClick={query.retry} className="min-h-11 underline">Thử lại</button></div>
  return <form onSubmit={save} className="space-y-5">
    <p className="text-sm text-muted">Thông tin dùng cho các lịch mới. Email đăng nhập: {query.value.email}</p>
    <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
      <label className="text-sm font-semibold">Tên khách hàng<input required maxLength={120} value={value.displayName || ''} onChange={event => setDraft({ ...value, displayName: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-border px-4 font-normal" /></label>
      <label className="text-sm font-semibold">Số điện thoại<input required type="tel" value={value.phone || ''} onChange={event => setDraft({ ...value, phone: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-border px-4 font-normal" /></label>
    </fieldset>
    <p role="status" className="text-sm text-terracotta">{notice}</p>
    <button disabled={busy} className="min-h-11 rounded-xl bg-terracotta px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Đang lưu…' : 'Lưu thông tin'}</button>
  </form>
}
