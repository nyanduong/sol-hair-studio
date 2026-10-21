import { useEffect, useMemo, useRef, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createBooking } from '../api/booking.api.js'
import { createBookingSubmission } from '../../../../../../shared/booking.js'

export function useBookingSubmission(token) {
  const [state, setState] = useState({ kind: 'idle' })
  const current = useRef(null)
  const controller = useRef(null)
  const manager = useMemo(
    () =>
      createBookingSubmission(
        (payload, key, signal) => createBooking(apiBaseUrl, token, payload, key, signal),
        () => crypto.randomUUID(),
      ),
    [token],
  )
  useEffect(() => {
    current.current = manager
    return () => {
      current.current = null
      controller.current?.abort()
    }
  }, [manager])
  async function submit(payload) {
    setState({ kind: 'loading', manager })
    try {
      controller.current ??= new AbortController()
      const data = await manager.run(payload, controller.current.signal)
      if (current.current === manager) setState({ kind: 'success', data, manager })
      return { kind: 'success', data }
    } catch (error) {
      if (current.current === manager) setState({ kind: 'error', error, manager })
      return { kind: 'error', error }
    }
  }
  const view = state.manager === manager ? state : { kind: 'idle' }
  const preventExit = view.kind === 'loading' || Boolean(manager.getPending())
  useEffect(() => {
    if (!preventExit) return
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [preventExit])
  return { ...view, submit, pending: manager.getPending() }
}
