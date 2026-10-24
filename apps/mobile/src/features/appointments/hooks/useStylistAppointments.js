import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { fetchMyStaff } from '../../staff/api/staff.api.js'
import { getStylistAppointment, listStylistAppointments } from '../api/stylist-appointments.api.js'
import { bindAppointmentLifecycle } from './customer-appointments-reader.js'
import { createStylistAppointmentReader } from './stylist-appointments-reader.js'

export function useStylistAppointments(token, accountId, localDate, appointmentId) {
  const reader = useMemo(() => createStylistAppointmentReader({
    accountId, appointmentId,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readStaff: signal => fetchMyStaff(apiBaseUrl, token, { signal }),
    ...(appointmentId !== undefined ? { readDetail: (id, signal) => getStylistAppointment(apiBaseUrl, token, id, signal) }
      : { readPage: (cursor, signal) => listStylistAppointments(apiBaseUrl, token, localDate, cursor, signal) }),
  }), [token, accountId, localDate, appointmentId])
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
  useFocusEffect(useCallback(() => bindAppointmentLifecycle(reader, AppState), [reader]))
  return { ...state, retry: reader.retry, refresh: reader.refresh, loadMore: reader.loadMore }
}
