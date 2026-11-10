/**
 * Author: Tô Thị Thảo Trang (Account: trangtttce191027)
 * Student ID: CE191027
 * Task ID / Use Case: SOL-038 - Mobile Appointment Management & Service
 * File Purpose: Hook quản lý việc đọc dữ liệu chi tiết một cuộc hẹn của khách hàng kèm cơ chế tự động làm mới khi quay lại màn hình.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { getCustomerAppointment } from '../api/appointments.api.js'
import { bindAppointmentLifecycle } from './customer-appointments-reader.js'
import { createCustomerAppointmentDetailReader } from './customer-appointment-detail-reader.js'

/**
 * Hook lấy dữ liệu chi tiết cuộc hẹn khách hàng theo appointmentId và tự động reload khi màn hình được focus.
 */
export function useCustomerAppointmentDetail(token, accountId, appointmentId) {
  const reader = useMemo(() => createCustomerAppointmentDetailReader({
    accountId, appointmentId,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readDetail: (id, signal) => getCustomerAppointment(apiBaseUrl, token, id, signal),
  }), [token, accountId, appointmentId])
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
  useFocusEffect(
    useCallback(() =>
      bindAppointmentLifecycle(reader, AppState), [reader]
  ))
  return { ...state, retry: reader.retry, refresh: reader.refresh }
}
