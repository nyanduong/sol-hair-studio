import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import {
  fetchStylistAppointments,
  getStylistAppointmentsErrorMessage,
} from '../api/appointments.api.js'

export function useStylistAppointments(token, localDate) {
  const [state, setState] = useState({ kind: 'loading' })
  const requestManager = useMemo(() => createLatestRequest(), [])

  const load = useCallback(async () => {
    if (!token) return
    setState({ kind: 'loading' })
    const result = await requestManager.run((signal) =>
      fetchStylistAppointments(apiBaseUrl, token, localDate, { signal }),
    )
    if (result.kind === 'success') setState({ kind: 'success', data: result.value })
    else if (result.kind === 'error') {
      setState({ kind: 'error', message: getStylistAppointmentsErrorMessage(result.error) })
    }
  }, [localDate, requestManager, token])

  const retry = useCallback(() => {
    if (state.kind === 'loading') return
    void load()
  }, [load, state.kind])

  useEffect(() => {
    const initialRequest = setTimeout(() => {
      void load()
    }, 0)
    return () => {
      clearTimeout(initialRequest)
      requestManager.cancel()
    }
  }, [load, requestManager])

  return { state, retry }
}
