import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { fetchMyShifts, fetchMyStaff, getStaffErrorMessage } from '../api/staff.api.js'

export function useStylistShifts(token, range) {
  const [state, setState] = useState({ kind: 'loading' })
  const requestManager = useMemo(() => createLatestRequest(), [])

  const load = useCallback(async () => {
    if (!token) return
    setState({ kind: 'loading' })
    const result = await requestManager.run(async (signal) => {
      const staff = await fetchMyStaff(apiBaseUrl, token, { signal })
      if (staff.length !== 1) {
        const error = new Error('Không tìm thấy đúng một hồ sơ stylist cho phiên hiện tại.')
        error.code = 'STAFF_PROFILE_UNAVAILABLE'
        throw error
      }
      const shifts = await fetchMyShifts(apiBaseUrl, token, staff[0].staffId, range, { signal })
      return { staff: staff[0], shifts }
    })

    if (result.kind === 'success') setState({ kind: 'success', data: result.value })
    else if (result.kind === 'error') setState({ kind: 'error', message: getStaffErrorMessage(result.error) })
  }, [range, requestManager, token])

  const retry = useCallback(() => {
    if (state.kind === 'loading') return
    setState({ kind: 'loading' })
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
