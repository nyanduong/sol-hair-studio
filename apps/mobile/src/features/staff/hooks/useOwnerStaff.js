import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { fetchStaff } from '../api/staff.api.js'

export function useOwnerStaff(token, enabled) {
  const [state, setState] = useState({ kind: 'idle' })
  const requestManager = useMemo(() => createLatestRequest(), [])

  const load = useCallback(async () => {
    if (!enabled || !token) {
      setState({ kind: 'idle' })
      return
    }

    setState({ kind: 'loading' })
    const result = await requestManager.run(signal => fetchStaff(apiBaseUrl, token, { signal }))
    if (result.kind === 'success') setState({ kind: 'success', data: result.value })
    else if (result.kind === 'error') {
      setState({ kind: 'error', message: result.error instanceof Error ? result.error.message : 'Không thể tải danh sách nhân viên.' })
    }
  }, [enabled, requestManager, token])

  useEffect(() => {
    const initialRequest = setTimeout(() => {
      void load()
    }, 0)
    return () => {
      clearTimeout(initialRequest)
      requestManager.cancel()
    }
  }, [load, requestManager])

  return { state, retry: load }
}
