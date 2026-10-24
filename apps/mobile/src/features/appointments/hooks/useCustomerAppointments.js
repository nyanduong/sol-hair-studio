import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { listCustomerAppointments } from '../api/appointments.api.js'
import { bindAppointmentLifecycle, createCustomerAppointmentsReader } from './customer-appointments-reader.js'

export function useCustomerAppointments(token, accountId) {
  const reader = useMemo(() => createCustomerAppointmentsReader({
    accountId,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readPage: (cursor, signal) => listCustomerAppointments(apiBaseUrl, token, cursor, signal),
  }), [token, accountId])
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
  useFocusEffect(useCallback(() => bindAppointmentLifecycle(reader, AppState), [reader]))
  return { ...state, refresh: reader.refresh, retry: reader.retry, loadMore: reader.loadMore }
}
