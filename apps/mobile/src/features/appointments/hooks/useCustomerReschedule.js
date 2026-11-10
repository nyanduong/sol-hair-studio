/**
 * Author: Tô Thị Thảo Trang (Account: trangtttce191027)
 * Student ID: CE191027
 * Task ID / Use Case: SOL-038 - Mobile Appointment Management & Service
 * File Purpose: Hook quản lý toàn bộ luồng đổi lịch hẹn của khách hàng (tải giờ trống, đổi ngày, chọn chuyên viên và submit).
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { randomUUID } from 'expo-crypto'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { getCustomerAppointment, getCustomerRescheduleOptions, rescheduleCustomerAppointment } from '../api/appointments.api.js'
import { createCustomerReschedule } from './customer-reschedule.js'
import { bindRescheduleLifecycle } from './customer-reschedule.js'

/**
 * Hook khởi tạo command đổi lịch hẹn, lắng nghe trạng thái và tự động làm mới giờ trống khi app active.
 */
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
