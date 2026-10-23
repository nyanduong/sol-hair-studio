import { useCallback, useEffect, useRef, useState } from 'react'
import { RescheduleForm } from './CustomerAppointmentManagement.jsx'
import { ownerAppointmentActions, ownerReschedulePayload, useOwnerAppointmentCommand } from '../hooks/useOwnerAppointmentCommand.js'

export default function OwnerAppointmentReschedule({ token, appointment, now, onClose, onChanged }) {
  const dialog = useRef(null)
  const command = useOwnerAppointmentCommand(token, appointment.id, 'reschedule')
  const [selection, setSelection] = useState(null)
  const [reason, setReason] = useState('')
  const [customerAgreementConfirmed, setCustomerAgreementConfirmed] = useState(false)
  const handleSelection = useCallback(next => {
    setSelection(next)
    setCustomerAgreementConfirmed(false)
  }, [])
  const [localError, setLocalError] = useState('')
  const actions = ownerAppointmentActions(appointment, now)
  useEffect(() => {
    const previous = document.activeElement
    const node = dialog.current
    node.showModal()
    return () => { node.close(); previous?.focus() }
  }, [])
  async function confirm() {
    setLocalError('')
    try {
      const payload = command.pending?.payload ?? ownerReschedulePayload(appointment, selection, selection?.options, reason, Date.now(), customerAgreementConfirmed)
      const result = await command.submit(payload)
      if (result.kind === 'success') { onChanged(result.value, 'reschedule'); onClose() }
    } catch (error) { setLocalError(error.message) }
  }
  return (
    <dialog ref={dialog} aria-labelledby="owner-reschedule-title"
      onCancel={event => { event.preventDefault(); if (!command.locked) onClose() }}
      className="fixed inset-0 m-auto max-h-[92svh] w-[calc(100%_-_2rem)] max-w-5xl overflow-y-auto rounded-[28px] border border-[#efe6db] bg-canvas p-6 text-ink shadow-2xl backdrop:bg-ink/40 sm:p-8">
      <h2 id="owner-reschedule-title" className="font-display text-2xl font-bold text-ink sm:text-3xl">Đổi lịch hẹn</h2>
      <p className="mt-1 text-sm text-muted">Khách: {appointment.customerSnapshot.displayName} · Mã lịch: {appointment.id}</p>
      <RescheduleForm token={token} appointment={appointment} locked={command.locked}
        onSelect={handleSelection} selection={selection} command={command} editable={actions.cancel}
        localError={localError} error={command.error} ambiguous={Boolean(command.pending) && command.kind !== 'loading'}
        onConfirm={confirm} onClose={onClose} onReload={() => { onChanged(); onClose() }}
        confirmDisabled={!reason.trim() || !customerAgreementConfirmed}
        extraFields={
          <div className="space-y-3">
            <label className="block text-sm font-medium text-ink">Lý do đổi lịch (bắt buộc)
              <textarea rows={3} maxLength={500} required disabled={command.locked}
                value={reason} onChange={event => setReason(event.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm disabled:opacity-50" />
            </label>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" required className="mt-1" checked={customerAgreementConfirmed}
                disabled={command.locked || !selection}
                onChange={event => setCustomerAgreementConfirmed(event.target.checked)} />
              Tôi đã trao đổi và thống nhất ngày, giờ, stylist mới với khách.
            </label>
          </div>
        } />
    </dialog>
  )
}
