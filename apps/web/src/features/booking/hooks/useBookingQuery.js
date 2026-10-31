import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { readBookingData } from '../api/booking.api.js'
import { watchAvailability } from '../api/availability-live.js'

export function useBookingQuery(kind, token, params, onSuccess) {
  const signature = JSON.stringify({ kind, token, params })
  const manager = useMemo(() => createLatestRequest(), [])
  const [result, setResult] = useState({ kind: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const [live, setLive] = useState(false)
  const accept = useEffectEvent((value) => onSuccess?.(value))
  const enabled = kind === 'availability' && Boolean(token && params)
  useEffect(() => {
    if (!enabled) return
    return watchAvailability(apiBaseUrl, token, () => setAttempt((value) => value + 1), setLive)
  }, [enabled, token])
  useEffect(() => {
    if (!enabled) return
    const refresh = () => setAttempt((value) => value + 1)
    // Reconcile missed signals too; Socket.IO is an invalidation hint, not a durable log.
    const timer = setInterval(refresh, live ? 60_000 : 15_000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [enabled, live])
  useEffect(() => {
    const query = JSON.parse(signature)
    if (!query.token || query.params === null) return
    const timer = setTimeout(async () => {
      setResult((previous) =>
        previous.signature === signature && previous.kind === 'success'
          ? { ...previous, refreshing: true }
          : { kind: 'loading', signature },
      )
      const response = await manager.run((signal) =>
        readBookingData(apiBaseUrl, query.token, query.kind, query.params, signal),
      )
      if (response.kind !== 'ignored') {
        setResult({ ...response, signature })
        if (response.kind === 'success') accept(response.value)
      }
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
  return { ...state, live: enabled && live, retry: () => setAttempt((value) => value + 1) }
}
