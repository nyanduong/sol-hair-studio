/**
 * Author: Tô Thị Thảo Trang (Account: trangtttce191027)
 * Student ID: CE191027
 * Task ID / Use Case: SOL-038 - Mobile Appointment Management & Service
 * File Purpose: Nút bấm điều hướng sang màn hình đổi lịch hẹn, tự động kiểm tra điều kiện thời gian cho phép đổi lịch.
 */
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { rescheduleBlockReason } from '../hooks/customer-reschedule.js'
import { styles } from '../styles/appointments.styles.js'
import { styles as form } from '../styles/reschedule.styles.js'

/**
 * Hiển thị nút Đổi lịch hẹn nếu thỏa mãn điều kiện thời gian (trước >= 2 giờ).
 */
export default function CustomerAppointmentRescheduleAction({ appointment, navigation }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  if (!appointment || appointment.status !== 'confirmed') return null
  const reason = rescheduleBlockReason(appointment, now)
  return <View style={form.action}>
    <Pressable accessibilityRole="button" disabled={Boolean(reason)} accessibilityState={{ disabled: Boolean(reason) }}
      style={[styles.button, reason && styles.disabled]}
      onPress={() => navigation.navigate('CustomerAppointmentReschedule', { appointmentId: appointment.id })}>
      <Text style={styles.buttonText}>Đổi lịch hẹn</Text>
    </Pressable>
    {reason ? <Text style={form.note}>{reason}</Text> : null}
  </View>
}
