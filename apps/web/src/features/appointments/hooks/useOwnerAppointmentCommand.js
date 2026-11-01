import { sendOwnerCorrection } from '../api/owner-corrections.api.js'
import { updateAppointmentEta } from '../api/appointment-eta.api.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createBookingSubmission } from '../../../../../../shared/booking.js'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { sendOwnerAppointmentCommand } from '../api/owner-appointments.api.js'
import { isStylistAccount } from './useStylistAppointments.js'
import { readStylistAppointment, sendStylistServiceCommand } from '../api/stylist-appointments.api.js'
import { isOwnerAccount, readOwnerAppointmentScope } from './useOwnerAppointments.js'
import { rescheduleSelectionPayload } from './useAppointmentCommand.js'

// Quyền cuối cùng, cutoff và giờ server vẫn được API kiểm tra tại lúc ghi.
export function ownerAppointmentActions(appointment, now = Date.now()) {
  const start = Date.parse(appointment.startAt)
  const valid = appointment.status === 'confirmed' && Number.isFinite(start) &&
    Number.isSafeInteger(appointment.revision) && appointment.revision >= 0
  return { cancel: valid, noShow: valid && now >= start + 900_000,
    reasonRequired: valid && start - now < 7_200_000 }
}

export function ownerAppointmentPayload(appointment, operation, fields, now = Date.now()) {
  const actions = ownerAppointmentActions(appointment, now)
  if (!actions.cancel) throw new Error('Chỉ thao tác trên lịch đã xác nhận. Hãy tải lại lịch.')
  const payload = { expectedRevision: appointment.revision }
  if (operation === 'cancel') {
    const reason = fields.reason ?? ''
    if (typeof reason !== 'string' || reason.length > 500 || (reason && !reason.trim())) {
      throw new Error('Lý do phải có nội dung và không quá 500 ký tự.')
    }
    if (actions.reasonRequired && !reason.trim()) throw new Error('Hủy sát giờ hoặc quá giờ hẹn cần nhập lý do.')
    if (reason.trim()) payload.reason = reason.trim()
    return payload
  }
  if (operation !== 'no-show') throw new Error('Thao tác không hợp lệ.')
  if (!actions.noShow) throw new Error('Chưa đủ 15 phút sau giờ hẹn.')
  if (fields.confirmedAbsent !== true) throw new Error('Cần xác nhận khách chưa đến và đã liên hệ.')
  // datetime-local được nhập theo giờ salon, không theo múi giờ máy Owner.
  if (typeof fields.contactLocal !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fields.contactLocal)) {
    throw new Error('Nhập thời gian thực tế đã liên hệ khách theo giờ Việt Nam.')
  }
  const contact = new Date(fields.contactLocal + ':00+07:00')
  if (!Number.isFinite(contact.getTime()) ||
      new Date(contact.getTime() + 25_200_000).toISOString().slice(0, 16) !== fields.contactLocal ||
      contact.getTime() > now) {
    throw new Error('Thời gian liên hệ không hợp lệ hoặc nằm trong tương lai.')
  }
  return { ...payload, contactAttemptedAt: contact.toISOString() }
}

// Tái sử dụng cơ chế deduplicate và giữ nguyên intent/key khi kết quả chưa rõ.
export function createOwnerAppointmentCommand({ readProfile, send, verify, authorize = isOwnerAccount }, newKey) {
  return createBookingSubmission(async (body, key, signal) => {
    const profile = await readProfile(signal)
    if (!authorize(profile?.account ?? profile)) {
      throw Object.assign(new Error('Tài khoản không có quyền thực hiện thao tác này.'), { status: 403 })
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (verify) await verify(profile?.account ?? profile, signal)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return send(body, key, signal)
  }, newKey)
}

export function useOwnerAppointmentCommand(token, id, operation, personalStaffId, actor = 'owner') {
  const active = useRef(null)
  const manager = useMemo(() => createOwnerAppointmentCommand({
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    authorize: actor === 'stylist' ? isStylistAccount : isOwnerAccount,
    verify: ['start', 'complete', 'eta', 'correct-start', 'correct-complete'].includes(operation) ? async (profile, signal) => {
      if (actor === 'stylist') { await readStylistAppointment(apiBaseUrl, token, id, signal); return }
      if (['eta', 'correct-start', 'correct-complete'].includes(operation)) return
      if (!personalStaffId) throw Object.assign(new Error('Personal scope required'), { status: 403 })
      await readOwnerAppointmentScope({ baseUrl: apiBaseUrl, token, kind: 'detail', query: { id, mineStaffId: personalStaffId }, signal, profile })
    } : undefined,
    send: (body, key, signal) => ['correct-start', 'correct-complete'].includes(operation) ? sendOwnerCorrection(apiBaseUrl, token, id, operation, body, key, signal, actor) : operation === 'eta' ? updateAppointmentEta(apiBaseUrl, token, id, body, key, signal, actor) : actor === 'stylist' ? sendStylistServiceCommand(apiBaseUrl, token, id, operation, body, key, signal) : sendOwnerAppointmentCommand(apiBaseUrl, token, id, operation, body, key, signal),
  }, () => crypto.randomUUID()), [token, id, operation, personalStaffId, actor])
  const [result, setResult] = useState({ kind: 'idle' })
  useEffect(() => {
    const scope = { manager, controller: new AbortController() }
    active.current = scope
    return () => { if (active.current === scope) active.current = null; scope.controller.abort() }
  }, [manager])
  async function submit(payload) {
    const scope = active.current
    if (scope?.manager !== manager) return { kind: 'ignored' }
    setResult({ kind: 'loading', manager })
    try {
      const value = await manager.run(payload, scope.controller.signal)
      if (active.current !== scope) return { kind: 'ignored' }
      setResult({ kind: 'success', value, manager })
      return { kind: 'success', value }
    } catch (error) {
      if (active.current !== scope) return { kind: 'ignored' }
      setResult({ kind: 'error', error, manager })
      return { kind: 'error', error }
    }
  }
  const state = result.manager === manager ? result : { kind: 'idle' }
  const pending = manager.getPending()
  const locked = state.kind === 'loading' || Boolean(pending)
  useEffect(() => {
    if (!locked) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [locked])
  return { ...state, pending, locked, submit }
}

// Cập nhật nút/lý do ngay khi qua mốc 2h hoặc chạm mốc no-show 15 phút.
export function watchOwnerAppointmentTime(startAt, update) {
  let timer
  const start = Date.parse(startAt)
  const thresholds = [start - 7_200_000 + 1, start + 900_000]
  function tick() {
    clearTimeout(timer)
    const now = Date.now()
    update(now)
    const next = Math.min(...thresholds.filter(value => value > now), now + 60_000)
    timer = setTimeout(tick, Math.max(1, next - now))
  }
  timer = setTimeout(tick, 0)
  window.addEventListener('focus', tick)
  document.addEventListener('visibilitychange', tick)
  return () => {
    clearTimeout(timer)
    window.removeEventListener('focus', tick)
    document.removeEventListener('visibilitychange', tick)
  }
}

export function useOwnerAppointmentTime(startAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => watchOwnerAppointmentTime(startAt, setNow), [startAt])
  return now
}

// Owner dùng cùng snapshot/slot đã đọc, nhưng không chịu cutoff/lead-time Customer.
export function ownerReschedulePayload(appointment, selection, options, reason = '', now = Date.now(), customerAgreementConfirmed = false) {
  if (!ownerAppointmentActions(appointment, now).cancel) throw new Error('Chỉ được đổi lịch đã xác nhận. Hãy tải lại lịch.')
  const payload = rescheduleSelectionPayload(appointment, selection ?? {}, options, now, 0)
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) {
    throw new Error('Cần nhập lý do đổi lịch có nội dung và không quá 500 ký tự.')
  }
  if (customerAgreementConfirmed !== true) {
    throw new Error('Cần xác nhận đã trao đổi và thống nhất lịch mới với khách.')
  }
  // Xác nhận chỉ kiểm tra tại Web; không thêm field ngoài API contract.
  payload.reason = reason.trim()
  return payload
}

// Xác nhận thao tác thực tế trên Web, không gửi check-in hoặc giờ client.
export function ownerServicePayload(appointment, operation, confirmed) {
  const expected = operation === 'start' ? 'confirmed' : operation === 'complete' ? 'in_progress' : null
  if (!expected || appointment.status !== expected) throw new Error('Trạng thái lịch không cho phép thao tác này. Hãy tải lại lịch.')
  if (!Number.isSafeInteger(appointment.revision) || appointment.revision < 0 || appointment.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Cần tải lại revision hợp lệ.')
  if (confirmed !== true) throw new Error(operation === 'start'
    ? 'Cần xác nhận khách đã đến salon.' : 'Cần xác nhận đã thực sự phục vụ xong.')
  return { expectedRevision: appointment.revision }
}

// Giữ response POST đã xác nhận khi GET đang làm mới; GET cũng trả actual timestamps.
// Không gắn thời gian cũ sang một revision mới hoặc giữ dữ liệu sau lỗi quyền.
export function mergeOwnerServiceResult(state, command) {
  if (state.kind !== 'success' || !command || command.id !== state.value?.id) return state
  if (command.revision > state.value.revision) return { ...state, value: command }
  if (command.revision !== state.value.revision || command.status !== state.value.status) return state
  return { ...state, value: { ...state.value,
    ...(command.startedAt ? { startedAt: command.startedAt } : {}),
    ...(command.completedAt ? { completedAt: command.completedAt } : {}),
  } }
}
