import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { getCustomerAppointment } from '../api/appointments.api.js'
import { bindAppointmentLifecycle } from './customer-appointments-reader.js'
import { createCustomerAppointmentDetailReader } from './customer-appointment-detail-reader.js'

export function useCustomerAppointmentDetail(token, accountId, appointmentId) {
  const reader = useMemo(() => createCustomerAppointmentDetailReader({
    accountId, appointmentId,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readDetail: (id, signal) => getCustomerAppointment(apiBaseUrl, token, id, signal),
  }), [token, accountId, appointmentId])
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
  useFocusEffect(useCallback(() => bindAppointmentLifecycle(reader, AppState), [reader]))
  return { ...state, retry: reader.retry, refresh: reader.refresh }
}
