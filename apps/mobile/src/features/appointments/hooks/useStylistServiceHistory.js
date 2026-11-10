/**
 * Author: Tô Thị Thảo Trang (Account: trangtttce191027)
 * Student ID: CE191027
 * Task ID / Use Case: SOL-038 - Mobile Appointment Management & Service
 * File Purpose: Hook quản lý việc tải danh sách lịch sử dịch vụ của khách hàng theo ngữ cảnh cuộc hẹn hiện tại của stylist.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { fetchMyStaff } from '../../staff/api/staff.api.js'
import { listStylistServiceHistory } from '../api/stylist-service-history.api.js'
import { createStylistServiceHistoryReader } from './stylist-service-history-reader.js'
import { bindAppointmentLifecycle } from './customer-appointments-reader.js'

/**
 * Hook khởi tạo reader đọc lịch sử dịch vụ khách hàng với phân trang và tự làm mới khi focus lại màn hình.
 */
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
