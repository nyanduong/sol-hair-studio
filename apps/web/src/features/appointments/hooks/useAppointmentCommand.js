import { useEffect, useMemo, useRef, useState } from 'react'
import { createBookingSubmission } from '../../../../../../shared/booking.js'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { sendAppointmentCommand } from '../api/appointments.api.js'
import { isCustomerAccount } from './useCustomerAppointments.js'

export function assertCustomerAppointmentEditable(appointment, now = Date.now()) {
  if (appointment.status !== 'confirmed') throw new Error('Chỉ được đổi hoặc hủy lịch đã xác nhận.')
  if (new Date(appointment.startAt).getTime() - now < 7_200_000) {
    throw new Error('Lịch còn dưới 2 giờ hoặc đã quá giờ. Vui lòng liên hệ salon.')
  }
  if (!Number.isSafeInteger(appointment.revision)) throw new Error('Cần tải lại lịch trước khi thao tác.')
}

export function reschedulePayload(appointment, selection, options, now = Date.now()) {
  assertCustomerAppointmentEditable(appointment, now)
  if (!options || options.revision !== appointment.revision ||
      !options.stylists.some(staff => staff.staffId === selection.staffId && staff.slots.some(slot => slot.startAt === selection.startAt))) {
    throw new Error('Vui lòng chọn lại stylist và giờ trống mới nhất.')
  }
  const start = new Date(selection.startAt)
  if (!Number.isFinite(start.getTime()) || start.toISOString() !== selection.startAt ||
      start.getTime() < now + 1_800_000 || start.getTime() > now + 604_800_000 ||
      start.getUTCMinutes() % 15 || start.getUTCSeconds() || start.getUTCMilliseconds()) {
    throw new Error('Giờ mới phải theo mốc 15 phút, trước ít nhất 30 phút và trong 7 ngày tới.')
  }
  if (selection.staffId === appointment.staffId && selection.startAt === appointment.startAt) {
    throw new Error('Hãy chọn giờ hoặc stylist khác lịch hiện tại.')
  }
  return { expectedRevision: appointment.revision, staffId: selection.staffId, startAt: selection.startAt }
}

// Dùng cơ chế giữ intent/key của Booking; không dùng endpoint tạo lịch.
export function createAppointmentCommand(send, newKey) {
  return createBookingSubmission(send, newKey)
}

export function useAppointmentCommand(token, appointmentId, operation) {
  const current = useRef(null)
  const controller = useRef(null)
  const manager = useMemo(() => createAppointmentCommand(async (payload, key, signal) => {
    const profile = await getMe(apiBaseUrl, token, { signal })
    if (!isCustomerAccount(profile?.account ?? profile)) {
      throw Object.assign(new Error('Tài khoản không có quyền thực hiện.'), { status: 403 })
    }
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    return sendAppointmentCommand(apiBaseUrl, token, appointmentId, operation, payload, key, signal)
  }, () => crypto.randomUUID()), [token, appointmentId, operation])
  const [result, setResult] = useState({ kind: 'idle' })
  useEffect(() => {
    current.current = manager
    controller.current = new AbortController()
    return () => { current.current = null; controller.current?.abort() }
  }, [manager])
  async function submit(payload) {
    setResult({ kind: 'loading', manager })
    try {
      const value = await manager.run(payload, controller.current.signal)
      if (current.current !== manager) return { kind: 'ignored' }
      setResult({ kind: 'success', value, manager })
      return { kind: 'success', value }
    } catch (error) {
      if (current.current !== manager) return { kind: 'ignored' }
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
  return { ...state, submit, pending, locked }
}
