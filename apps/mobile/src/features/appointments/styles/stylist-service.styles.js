/**
 * Author: Tô Thị Thảo Trang (Account: trangtttce191027)
 * Student ID: CE191027
 * Task ID / Use Case: SOL-038 - Mobile Appointment Management & Service
 * File Purpose: Định nghĩa stylesheet cho modal và checkbox xác nhận bắt đầu/hoàn tất ca phục vụ.
 */
import { StyleSheet } from 'react-native'
import { colors } from '../../../theme/tokens.js'

export const styles = StyleSheet.create({
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: colors.copper, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  checked: { backgroundColor: colors.copper },
  checkboxText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 22 },
  disabled: { opacity: 0.5 },
})
