import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { fetchServices, getServicesErrorMessage } from '../api/services.api.js'

export function useServices() {
  const [state, setState] = useState({ kind: 'loading' })
  const requestManager = useMemo(() => createLatestRequest(), [])

  const loadServices = useCallback(async () => {
    const result = await requestManager.run((signal) =>
      fetchServices(apiBaseUrl, { signal }),
    )

    if (result.kind === 'success') {
      setState({ kind: 'success', data: result.value })
    } else if (result.kind === 'error') {
      setState({ kind: 'error', message: getServicesErrorMessage(result.error) })
    }
  }, [requestManager])

  const retry = useCallback(() => {
    if (state.kind === 'loading') return
    setState({ kind: 'loading' })
    void loadServices()
  }, [loadServices, state.kind])

  useEffect(() => {
    const initialRequest = setTimeout(() => {
      void loadServices()
    }, 0)

    return () => {
      clearTimeout(initialRequest)
      requestManager.cancel()
    }
  }, [loadServices, requestManager])

  return { state, retry }
}
