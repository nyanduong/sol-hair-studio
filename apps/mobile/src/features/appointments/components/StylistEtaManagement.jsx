import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { usePreventRemove } from '@react-navigation/native'
import { randomUUID } from 'expo-crypto'
import { apiBaseUrl } from '../../../config/env.js'
import { colors } from '../../../theme/tokens.js'
import { getMe } from '../../auth/api/auth.api.js'
import { fetchMyStaff } from '../../staff/api/staff.api.js'
import { getStylistAppointment } from '../api/stylist-appointments.api.js'
import { updateStylistEta } from '../api/stylist-eta.api.js'
import { createStylistEtaCommand } from '../hooks/stylist-eta-command.js'
import { canUpdateStylistEta, etaInputToIso, formatEtaTime } from '../appointment-eta.js'
import { appointmentCardText, appointmentStatuses } from '../appointment-presentation.js'
import { StylistAction } from './StylistAppointmentView.jsx'
import { styles } from '../styles/cancellation.styles.js'
import { styles as card } from '../styles/appointments.styles.js'
import { styles as local } from '../styles/stylist-eta.styles.js'

export function StylistEtaSummary({ appointment, previousRead = false }) {
  if (!appointment || appointment.status !== 'in_progress') return null
  const warnings = appointment.affectedAppointments
  return <View style={card.sectionCard}>
    <Text accessibilityRole="header" style={card.sectionTitle}>Giờ dự kiến xong và ảnh hưởng</Text>
    {previousRead && <Text style={card.infoNotice}>Dữ liệu từ lần cập nhật đã xác nhận; hãy tải lại để có cảnh báo mới nhất.</Text>}
    <Text style={card.copy}>Kết thúc theo kế hoạch: {formatEtaTime(appointment.endAt)}</Text>
    <Text style={card.copy}>{appointment.estimatedEndAt ? 'ETA đã ghi nhận: ' + formatEtaTime(appointment.estimatedEndAt) : 'Chưa có ETA được ghi nhận.'}</Text>
    <Text style={card.infoNotice}>Khoảng giữ gồm 10 phút dọn dẹp sau ETA. ETA không phải giờ hoàn tất thực tế và không tự đổi trạng thái.</Text>
    {Array.isArray(warnings) && <>
      <Text accessibilityRole={appointment.ownerReviewRequired ? 'alert' : undefined} style={local.warning}>
        {appointment.ownerReviewRequired
          ? warnings.length ? 'Có lịch bị ảnh hưởng. Hãy báo chủ tiệm kiểm tra; hệ thống không tự đổi hoặc hủy lịch.'
            : 'Có ảnh hưởng cần chủ tiệm kiểm tra. Không có thông tin chi tiết trong phạm vi bạn được xem.'
          : 'Chưa ghi nhận lịch bị ảnh hưởng trong lần kiểm tra này.'}
      </Text>
      {warnings.map(item => <View key={item.id} style={local.warningRow}>
        <Text selectable style={card.copy}>Mã lịch: {item.id}</Text>
        <Text style={card.copy}>{appointmentStatuses[item.status]}</Text>
        <Text style={card.copy}>Bắt đầu: {formatEtaTime(item.startAt)}</Text>
        <Text style={card.copy}>Kết thúc dự kiến: {formatEtaTime(item.endAt)}</Text>
        <Text style={card.copy}>{item.reasons.map(reason => reason === 'staff_overlap'
          ? 'Trùng khoảng phục vụ/dọn dẹp của stylist' : 'Trùng thời gian của cùng hồ sơ khách').join(' · ')}</Text>
      </View>)}
    </>}
  </View>
}

export default function StylistEtaManagement({ token, accountId, appointmentId, appointment, onChanged }) {
  const command = useMemo(() => createStylistEtaCommand({
    accountId, appointmentId, newKey: randomUUID, onChanged,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readStaff: signal => fetchMyStaff(apiBaseUrl, token, { signal }),
    readDetail: (id, signal) => getStylistAppointment(apiBaseUrl, token, id, signal),
    send: (payload, key, signal) => updateStylistEta(apiBaseUrl, token, appointmentId, payload, key, signal),
  }), [token, accountId, appointmentId, onChanged])
  const state = useSyncExternalStore(command.subscribe, command.getSnapshot, command.getSnapshot)
  useEffect(() => () => command.cancel(), [command])
  const busy = state.kind === 'loading', locked = busy || Boolean(state.pending)
  usePreventRemove(locked, () => Alert.alert('Cập nhật ETA chưa được xác nhận',
    'Hãy chờ hoặc kiểm tra và thử lại cùng yêu cầu trước khi rời màn hình.'))
  const text = state.appointment ? appointmentCardText(state.appointment) : null
  return <>
    {canUpdateStylistEta(appointment) && !state.visible && <View style={styles.footer}>
      {state.kind === 'success' && <Text accessibilityRole="alert" style={styles.message}>{state.message}</Text>}
      {canUpdateStylistEta(appointment) && <StylistAction label="Cập nhật thời gian dự kiến" onPress={() => command.open(appointment)} />}
    </View>}
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={command.close}>
      <SafeAreaView style={styles.overlay}>
        <KeyboardAvoidingView style={local.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.dialog} accessibilityViewIsModal onAccessibilityEscape={command.close}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={styles.title}>Cập nhật giờ dự kiến xong</Text>
            {text && <View style={styles.summary}>
              <Text style={styles.label}>Khách: {state.appointment.customerSnapshot.displayName}</Text>
              <Text style={styles.copy}>Stylist: {text.stylist}</Text>
              <Text style={styles.copy}>{text.services}</Text>
              <Text style={styles.copy}>Lịch ban đầu: {text.date} · {text.time}</Text>
              <Text style={styles.copy}>Kết thúc theo kế hoạch: {formatEtaTime(state.appointment.endAt)}</Text>
              <Text style={styles.copy}>{state.appointment.estimatedEndAt ? 'ETA hiện tại: ' + formatEtaTime(state.appointment.estimatedEndAt) : 'Chưa có ETA.'}</Text>
            </View>}
            {state.confirming ? <View style={styles.summary}>
              <Text style={styles.label}>Xác nhận ETA mới (giờ Việt Nam)</Text>
              <Text style={styles.copy}>{formatEtaTime(etaInputToIso(state.date, state.time))}</Text>
              <Text style={styles.copy}>Giữ nguyên giờ hẹn, dịch vụ và trạng thái. Sau khi lưu, hệ thống trả cảnh báo ảnh hưởng nếu có; không tự dời lịch khác.</Text>
            </View> : <>
              <Text style={styles.label}>Ngày dự kiến xong · Giờ Việt Nam</Text>
              <TextInput accessibilityLabel="Ngày ETA YYYY-MM-DD" maxLength={10} placeholder="YYYY-MM-DD" autoCapitalize="none"
                autoCorrect={false} value={state.date} onChangeText={value => command.edit('date', value)}
                editable={!locked && state.kind !== 'rejected'} style={local.input} />
              <Text style={styles.label}>Giờ dự kiến xong</Text>
              <TextInput accessibilityLabel="Giờ ETA HH:mm hoặc HH:mm:ss" maxLength={8} placeholder="HH:mm:ss" autoCorrect={false}
                value={state.time} onChangeText={value => command.edit('time', value)}
                editable={!locked && state.kind !== 'rejected'} style={local.input} />
              <Text style={styles.copy}>Ví dụ 18:45 hoặc 18:45:30. ETA phải ở tương lai và sau giờ kết thúc theo kế hoạch.</Text>
            </>}
            {state.message ? <Text accessibilityRole="alert" style={styles.message}>{state.message}</Text> : null}
            {busy && <ActivityIndicator color={colors.copper} accessibilityLabel="Đang cập nhật ETA" />}
            {state.kind === 'rejected' ? <StylistAction label="Tải lại lịch" onPress={command.reload} />
              : state.confirming ? <StylistAction label={busy ? 'Đang lưu…' : state.pending ? 'Kiểm tra và thử lại' : 'Xác nhận cập nhật ETA'}
                onPress={command.submit} disabled={busy} />
                : <StylistAction label="Kiểm tra ETA mới" onPress={command.confirm} disabled={locked} />}
            {state.confirming && !locked && state.kind !== 'rejected' && <StylistAction label="Sửa thời gian" onPress={command.back} />}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: locked }} disabled={locked}
              onPress={command.close} style={[styles.cancel, locked && local.disabled]}>
              <Text style={styles.cancelText}>{state.kind === 'rejected' ? 'Đóng và tải lại' : 'Quay lại'}</Text>
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </>
}
