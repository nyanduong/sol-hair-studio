import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { usePreventRemove } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { randomUUID } from 'expo-crypto'
import { apiBaseUrl } from '../../../config/env.js'
import { colors } from '../../../theme/tokens.js'
import { getMe } from '../../auth/api/auth.api.js'
import { fetchMyStaff } from '../../staff/api/staff.api.js'
import { getStylistAppointment } from '../api/stylist-appointments.api.js'
import { sendStylistCorrection, stylistCorrectionOperation } from '../api/stylist-corrections.api.js'
import { createStylistCorrectionCommand } from '../hooks/stylist-correction-command.js'
import { StylistAction } from './StylistAppointmentView.jsx'
import { styles } from '../styles/cancellation.styles.js'

export default function StylistCorrectionActions({ token, accountId, appointmentId, appointment, onChanged }) {
  const command = useMemo(() => createStylistCorrectionCommand({
    accountId, appointmentId, newKey: randomUUID, onChanged,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readStaff: signal => fetchMyStaff(apiBaseUrl, token, { signal }),
    readDetail: (id, signal) => getStylistAppointment(apiBaseUrl, token, id, signal),
    send: (operation, body, key, signal) => sendStylistCorrection(apiBaseUrl, token, appointmentId, operation, body, key, signal),
  }), [token, accountId, appointmentId, onChanged])
  const state = useSyncExternalStore(command.subscribe, command.getSnapshot, command.getSnapshot)
  useEffect(() => () => command.cancel(), [command])
  const busy = state.kind === 'loading'
  const locked = busy || Boolean(state.pending)
  usePreventRemove(locked, () => Alert.alert('Yêu cầu sửa nhầm chưa được xác nhận', 'Chờ kết quả hoặc thử lại cùng yêu cầu trước khi rời màn hình.'))
  const starting = state.appointment?.status === 'in_progress'
  const title = starting ? 'Sửa bắt đầu nhầm' : 'Sửa hoàn tất nhầm'
  const editable = !locked && state.kind !== 'rejected'
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 48, padding: 12, color: colors.ink, backgroundColor: colors.surface }
  return <>
    {!state.visible && (stylistCorrectionOperation(appointment) || state.kind === 'success') && <View style={styles.footer}>
      {state.message ? <Text accessibilityRole="alert" style={styles.message}>{state.message}</Text> : null}
      {stylistCorrectionOperation(appointment) && <StylistAction label="Sửa thao tác nhầm" onPress={() => command.open(appointment)} />}
    </View>}
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={command.close}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.dialog} accessibilityViewIsModal onAccessibilityEscape={command.close}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={styles.copy}>Chỉ sửa lịch được giao cho bạn khi thực sự bấm nhầm. Lịch sử cũ được giữ; không tự dời hoặc hủy lịch khác.</Text>
            {state.appointment && <View style={styles.summary}>
              <Text selectable style={styles.copy}>Mã lịch: {state.appointment.id}</Text>
              <Text style={styles.label}>{state.appointment.customerSnapshot.displayName}</Text>
              <Text style={styles.copy}>{state.appointment.staffNameSnapshot}</Text>
              <Text style={styles.copy}>{starting ? 'Đang phục vụ → Đã xác nhận' : 'Đã hoàn tất → Đang phục vụ'}</Text>
            </View>}
            <Text style={styles.label}>Lý do sửa nhầm (bắt buộc)</Text>
            <TextInput accessibilityLabel="Lý do sửa nhầm" multiline maxLength={500} editable={editable}
              value={state.fields.reason} onChangeText={reason => command.edit({ reason })} style={inputStyle} />
            {!starting && <>
              <Text style={styles.label}>ETA mới theo giờ Việt Nam</Text>
              <Text style={styles.copy}>Nếu đã qua giờ kết thúc kế hoạch, bắt buộc nhập ETA tương lai. Nếu chưa qua giờ, có thể để trống cả hai ô.</Text>
              <TextInput accessibilityLabel="Ngày ETA" placeholder="YYYY-MM-DD" value={state.fields.date} editable={editable}
                onChangeText={date => command.edit({ date })} style={inputStyle} />
              <TextInput accessibilityLabel="Giờ ETA" placeholder="HH:mm" value={state.fields.time} editable={editable}
                onChangeText={time => command.edit({ time })} style={inputStyle} />
            </>}
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: state.fields.confirmed, disabled: !editable }}
              disabled={!editable} onPress={() => command.attest(!state.fields.confirmed)} style={styles.summary}>
              <Text style={styles.label}>{state.fields.confirmed ? '☑' : '☐'} {starting ? 'Tôi bấm bắt đầu nhầm, thực tế chưa phục vụ.' : 'Tôi bấm hoàn tất nhầm, thực tế vẫn đang phục vụ.'}</Text>
            </Pressable>
            {state.message ? <Text accessibilityRole="alert" style={styles.message}>{state.message}</Text> : null}
            {busy && <ActivityIndicator color={colors.copper} />}
            {state.kind === 'rejected' ? <StylistAction label="Tải lại lịch" onPress={command.reload} /> :
              <StylistAction label={busy ? 'Đang xử lý…' : state.pending ? 'Thử lại cùng yêu cầu' : 'Xác nhận sửa nhầm'}
                disabled={busy || (!state.pending && (!state.fields.confirmed || !state.fields.reason.trim()))} onPress={command.submit} />}
            <Pressable accessibilityRole="button" disabled={locked} onPress={command.close} style={[styles.cancel, locked && styles.disabled]}>
              <Text style={styles.cancelText}>Quay lại</Text>
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  </>
}
