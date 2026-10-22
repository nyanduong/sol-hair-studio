import { useEffect, useMemo, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { readRescheduleOptions } from '../api/appointments.api.js'

export function useRescheduleOptions(token, appointmentId, localDate) {
  const signature = JSON.stringify([token, appointmentId, localDate])
  const latest = useMemo(() => createLatestRequest(), [])
  const [result, setResult] = useState({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const [session, id, date] = JSON.parse(signature)
    const timer = setTimeout(async () => {
      setResult({ kind: 'loading', signature })
      const response = await latest.run(signal => readRescheduleOptions(apiBaseUrl, session, id, date, signal))
      if (response.kind !== 'ignored') setResult({ ...response, signature })
    }, 0)
    return () => { clearTimeout(timer); latest.cancel() }
  }, [signature, latest, attempt])
  return { ...(result.signature === signature ? result : { kind: 'loading' }),
    retry: () => setAttempt(value => value + 1) }
}
