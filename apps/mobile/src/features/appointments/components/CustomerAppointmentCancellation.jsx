import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { usePreventRemove } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { randomUUID } from 'expo-crypto'
import { apiBaseUrl } from '../../../config/env.js'
import { colors } from '../../../theme/tokens.js'
import { getMe } from '../../auth/api/auth.api.js'
import { cancelCustomerAppointment, getCustomerAppointment } from '../api/appointments.api.js'
import { appointmentCardText } from '../appointment-presentation.js'
import { cancellationBlockReason, createCustomerCancellation } from '../hooks/customer-cancellation.js'
import { styles } from '../styles/cancellation.styles.js'

export default function CustomerAppointmentCancellation({ token, accountId, appointmentId, appointment, onChanged }) {
  const command = useMemo(() => createCustomerCancellation({
    accountId, appointmentId, newKey: randomUUID, onChanged,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readDetail: (id, signal) => getCustomerAppointment(apiBaseUrl, token, id, signal),
    send: (payload, key, signal) => cancelCustomerAppointment(apiBaseUrl, token, appointmentId, payload, key, signal),
  }), [token, accountId, appointmentId, onChanged])
  const state = useSyncExternalStore(command.subscribe, command.getSnapshot, command.getSnapshot)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => () => command.cancel(), [command])
  const busy = state.kind === 'loading'
  const locked = busy || Boolean(state.pending)
  usePreventRemove(locked, () => Alert.alert('Yêu cầu hủy chưa được xác nhận',
    'Vui lòng chờ hoặc kiểm tra và thử lại cùng yêu cầu trước khi rời màn hình.'))
  const reason = cancellationBlockReason(appointment, now)
  const modalReason = cancellationBlockReason(state.appointment, now)
  const text = state.appointment ? appointmentCardText(state.appointment) : null
  const confirmDisabled = busy || state.kind === 'rejected' || (!state.pending && Boolean(modalReason))
  return <>
    {state.kind === 'success' ? <View style={styles.footer}>
      <Text accessibilityRole="alert" style={styles.message}>{state.message}</Text>
    </View> : appointment && !state.visible ? <View style={styles.footer}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(reason) }} disabled={Boolean(reason)}
        onPress={() => command.open(appointment)} style={[styles.cancel, reason && styles.disabled]}>
        <Text style={styles.cancelText}>Hủy lịch hẹn</Text>
      </Pressable>
      {reason && <Text style={styles.copy}>{reason}</Text>}
    </View> : null}
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={command.close}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.dialog} accessibilityViewIsModal onAccessibilityEscape={command.close}>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <Text accessibilityRole="header" style={styles.title}>Hủy lịch hẹn?</Text>
            <Text style={styles.copy}>Lịch đã hủy không thể mở lại. Bạn cần đặt lịch mới nếu muốn quay lại salon.</Text>
            {text && <View style={styles.summary}>
              <Text selectable style={styles.copy}>Mã lịch: {state.appointment.id}</Text>
              <Text style={styles.label}>{text.date} · {text.time}</Text>
              <Text style={styles.copy}>Stylist: {text.stylist}</Text>
              <Text style={styles.copy}>{text.services}</Text>
            </View>}
            {state.message ? <Text accessibilityRole="alert" style={styles.message}>{state.message}</Text> : null}
            {modalReason && !state.pending && <Text accessibilityRole="alert" style={styles.copy}>{modalReason}</Text>}
            {busy && <ActivityIndicator color={colors.copper} accessibilityLabel="Đang xác nhận hủy lịch" />}
            {state.kind === 'rejected' ? <Pressable accessibilityRole="button" onPress={command.reload} style={styles.confirm}>
              <Text style={styles.confirmText}>Tải lại lịch</Text>
            </Pressable> : <Pressable accessibilityRole="button" accessibilityState={{ disabled: confirmDisabled }}
              disabled={confirmDisabled} onPress={command.submit} style={[styles.confirm, confirmDisabled && styles.disabled]}>
              <Text style={styles.confirmText}>{busy ? 'Đang xử lý…' : state.pending ? 'Kiểm tra và thử lại' : 'Xác nhận hủy'}</Text>
            </Pressable>}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: locked }} disabled={locked}
              onPress={command.close} style={[styles.cancel, locked && styles.disabled]}>
              <Text style={styles.cancelText}>{state.kind === 'rejected' ? 'Đóng và tải lại lịch' : 'Giữ lịch'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  </>
}
