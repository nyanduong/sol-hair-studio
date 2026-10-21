import { useEffect, useMemo, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { readBookingData } from '../api/booking.api.js'

export function useBookingQuery(kind, token, params) {
  const signature = JSON.stringify({ kind, token, params })
  const manager = useMemo(() => createLatestRequest(), [])
  const [result, setResult] = useState({ kind: 'idle' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const query = JSON.parse(signature)
    if (!query.token || query.params === null) return
    const timer = setTimeout(async () => {
      setResult({ kind: 'loading', signature })
      const response = await manager.run((signal) =>
        readBookingData(apiBaseUrl, query.token, query.kind, query.params, signal),
      )
      if (response.kind !== 'ignored') setResult({ ...response, signature })
    }, 0)
    return () => {
      clearTimeout(timer)
      manager.cancel()
    }
  }, [signature, manager, attempt])
  const state =
    !token || params === null
      ? { kind: 'idle' }
      : result.signature === signature
        ? result
        : { kind: 'loading' }
  return { ...state, retry: () => setAttempt((value) => value + 1) }
}
