import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { fetchMyStaff } from '../../staff/api/staff.api.js'
import { listStylistServiceHistory } from '../api/stylist-service-history.api.js'
import { createStylistServiceHistoryReader } from './stylist-service-history-reader.js'
import { bindAppointmentLifecycle } from './customer-appointments-reader.js'

export function useStylistServiceHistory(token, accountId, appointmentId) {
  const reader = useMemo(() => createStylistServiceHistoryReader({
    accountId, appointmentId,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readStaff: signal => fetchMyStaff(apiBaseUrl, token, { signal }),
    readPage: (id, cursor, signal) => listStylistServiceHistory(apiBaseUrl, token, id, cursor, signal),
  }), [token, accountId, appointmentId])
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
  useFocusEffect(useCallback(() => bindAppointmentLifecycle(reader, AppState), [reader]))
  return { ...state, retry: reader.retry, refresh: reader.refresh, loadMore: reader.loadMore }
}
