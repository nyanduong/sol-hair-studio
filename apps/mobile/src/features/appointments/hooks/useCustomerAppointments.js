/**
 * Author: Tô Thị Thảo Trang (Account: trangtttce191027)
 * Student ID: CE191027
 * Task ID / Use Case: SOL-038 - Mobile Appointment Management & Service
 * File Purpose: Hook quản lý danh sách lịch hẹn của khách hàng, đồng bộ vòng đời màn hình và cung cấp các hàm tải thêm, làm mới.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { listCustomerAppointments } from '../api/appointments.api.js'
import { bindAppointmentLifecycle, createCustomerAppointmentsReader } from './customer-appointments-reader.js'

/**
 * Hook kết nối reader danh sách lịch hẹn khách hàng, lắng nghe focus màn hình và xuất state cùng các hàm điều khiển.
 */
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
