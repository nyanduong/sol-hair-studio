import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { randomUUID } from 'expo-crypto'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { getCustomerAppointment, getCustomerRescheduleOptions, rescheduleCustomerAppointment } from '../api/appointments.api.js'
import { createCustomerReschedule } from './customer-reschedule.js'
import { bindRescheduleLifecycle } from './customer-reschedule.js'

export function useCustomerReschedule(token, accountId, appointmentId) {
  const command = useMemo(() => createCustomerReschedule({
    accountId, appointmentId, newKey: randomUUID,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readDetail: (id, signal) => getCustomerAppointment(apiBaseUrl, token, id, signal),
    readOptions: (id, date, signal) => getCustomerRescheduleOptions(apiBaseUrl, token, id, date, signal),
    send: (payload, key, signal) => rescheduleCustomerAppointment(apiBaseUrl, token, appointmentId, payload, key, signal),
  }), [token, accountId, appointmentId])
  const state = useSyncExternalStore(command.subscribe, command.getSnapshot, command.getSnapshot)
  useFocusEffect(useCallback(() => bindRescheduleLifecycle(command, AppState), [command]))
  useEffect(() => () => command.cancel(), [command])
  return { state, command }
}
