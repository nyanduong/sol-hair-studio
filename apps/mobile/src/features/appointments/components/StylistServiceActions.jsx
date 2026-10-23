import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { usePreventRemove } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { randomUUID } from 'expo-crypto'
import Feather from '@expo/vector-icons/Feather'
import { apiBaseUrl } from '../../../config/env.js'
import { colors } from '../../../theme/tokens.js'
import { getMe } from '../../auth/api/auth.api.js'
import { fetchMyStaff } from '../../staff/api/staff.api.js'
import { getStylistAppointment, sendStylistServiceCommand } from '../api/stylist-appointments.api.js'
import { appointmentCardText } from '../appointment-presentation.js'
import { createStylistServiceCommand, stylistServiceOperation } from '../hooks/stylist-service-command.js'
import { StylistAction } from './StylistAppointmentView.jsx'
import { styles } from '../styles/cancellation.styles.js'
import { styles as local } from '../styles/stylist-service.styles.js'

export default function StylistServiceActions({ token, accountId, appointmentId, appointment, onChanged }) {
  const command = useMemo(() => createStylistServiceCommand({
    accountId, appointmentId, newKey: randomUUID, onChanged,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readStaff: signal => fetchMyStaff(apiBaseUrl, token, { signal }),
    readDetail: (id, signal) => getStylistAppointment(apiBaseUrl, token, id, signal),
    send: (operation, payload, key, signal) => sendStylistServiceCommand(apiBaseUrl, token, appointmentId, operation, payload, key, signal),
  }), [token, accountId, appointmentId, onChanged])
  const state = useSyncExternalStore(command.subscribe, command.getSnapshot, command.getSnapshot)
  useEffect(() => () => command.cancel(), [command])
  const busy = state.kind === 'loading', locked = busy || Boolean(state.pending)
  usePreventRemove(locked, () => Alert.alert('Thao tác phục vụ chưa được xác nhận',
    'Vui lòng chờ hoặc kiểm tra và thử lại cùng yêu cầu trước khi rời màn hình.'))
  const operation = stylistServiceOperation(appointment)
  const starting = state.operation === 'start'
  const title = starting ? 'Bắt đầu phục vụ' : 'Hoàn tất phục vụ'
  const text = state.appointment ? appointmentCardText(state.appointment) : null
  return <>
    {(operation || state.kind === 'success') && !state.visible && <View style={styles.footer}>
      {state.kind === 'success' && <Text accessibilityRole="alert" style={styles.message}>{state.message}</Text>}
      {operation && <StylistAction label={operation === 'start' ? 'Bắt đầu phục vụ' : 'Hoàn tất phục vụ'}
        onPress={() => command.open(appointment, operation)} />}
    </View>}
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={command.close}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.dialog} accessibilityViewIsModal onAccessibilityEscape={command.close}>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <Text accessibilityRole="header" style={styles.title}>{title}?</Text>
            <Text style={styles.copy}>{starting
              ? 'Chỉ bắt đầu khi khách đã đến salon. Backend kiểm tra ca làm, lịch nghỉ và xung đột; có thể bắt đầu sớm nếu đủ điều kiện.'
              : 'Chỉ hoàn tất khi đã thực sự phục vụ xong. Backend ghi giờ hoàn tất và giữ 10 phút dọn dẹp; hoàn tất không đồng nghĩa đã thanh toán.'}</Text>
            {text && <View style={styles.summary}>
              <Text selectable style={styles.copy}>Mã lịch: {state.appointment.id}</Text>
              <Text style={styles.label}>Khách: {state.appointment.customerSnapshot.displayName}</Text>
              <Text selectable style={styles.copy}>Điện thoại: {state.appointment.customerSnapshot.phone}</Text>
              <Text style={styles.copy}>{text.date} · {text.time}</Text>
              <Text style={styles.copy}>Stylist: {text.stylist}</Text>
              <Text style={styles.copy}>{text.services} · {text.duration}</Text>
            </View>}
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: state.attested, disabled: locked || state.kind === 'rejected' }}
              disabled={locked || state.kind === 'rejected'} onPress={() => command.attest(!state.attested)} style={local.checkboxRow}>
              <View style={[local.checkbox, state.attested && local.checked]}>
                {state.attested && <Feather name="check" size={16} color={colors.surface} />}
              </View>
              <Text style={local.checkboxText}>{starting ? 'Tôi xác nhận khách đã đến salon.' : 'Tôi xác nhận đã thực sự phục vụ xong.'}</Text>
            </Pressable>
            {state.message ? <Text accessibilityRole="alert" style={styles.message}>{state.message}</Text> : null}
            {busy && <ActivityIndicator color={colors.copper} accessibilityLabel="Đang ghi nhận phục vụ" />}
            {state.kind === 'rejected' ? <StylistAction label="Tải lại lịch" onPress={command.reload} />
              : <StylistAction label={busy ? 'Đang xử lý…' : state.pending ? 'Kiểm tra và thử lại' : 'Xác nhận ' + (starting ? 'bắt đầu' : 'hoàn tất')}
                onPress={command.submit} disabled={busy || (!state.pending && !state.attested)} />}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: locked }} disabled={locked}
              onPress={command.close} style={[styles.cancel, locked && local.disabled]}>
              <Text style={styles.cancelText}>{state.kind === 'rejected' ? 'Đóng và tải lại lịch' : 'Quay lại'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  </>
}
