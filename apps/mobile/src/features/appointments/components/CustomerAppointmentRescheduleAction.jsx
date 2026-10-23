import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { rescheduleBlockReason } from '../hooks/customer-reschedule.js'
import { styles } from '../styles/appointments.styles.js'
import { styles as form } from '../styles/reschedule.styles.js'

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
