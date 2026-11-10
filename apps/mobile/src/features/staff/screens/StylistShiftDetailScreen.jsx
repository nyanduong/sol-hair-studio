import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { apiBaseUrl } from '../../../config/env.js'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { recordShiftAttendance } from '../api/staff.api.js'
import { useStylistShifts } from '../hooks/useStylistShifts.js'
import { formatShiftDate, formatShiftTime, shiftAttendanceAction, shiftAttendanceLabel, shiftStatusLabel } from '../staff-presentation.js'
import { styles } from '../styles/stylist-shifts.styles.js'
import { useMemo, useState } from 'react'

export default function StylistShiftDetailScreen({ navigation, route }) {
  const { isAuthenticated, isLoading, isStylist, token } = useAuth()
  const shiftId = route.params?.shiftId
  const localDate = route.params?.localDate
  const range = useMemo(() => ({ fromDate: localDate, toDate: localDate }), [localDate])
  const { state, retry } = useStylistShifts(token, range)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const shift = state.kind === 'success' ? state.data.shifts.find(item => item.shiftId === shiftId) : null

  async function recordAttendance() {
    const action = shiftAttendanceAction(shift)
    if (!action || !state.data?.staff || pending) return
    setError(null)
    setPending(true)
    try {
      await recordShiftAttendance(apiBaseUrl, token, state.data.staff.staffId, shift.shiftId, action)
      retry()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể ghi nhận ca làm. Vui lòng thử lại.')
    } finally {
      setPending(false)
    }
  }

  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safe}>
    <View style={styles.detailHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Quay lại danh sách ca" onPress={() => navigation.goBack()} style={styles.iconButton}>
        <Feather name="arrow-left" size={22} color={colors.ink} />
      </Pressable>
      <View><Text style={styles.brand}>SOL HAIR STUDIO</Text><Text accessibilityRole="header" style={styles.detailTitle}>Chi tiết ca làm</Text></View>
    </View>
    {isLoading ? <Loading /> : !isAuthenticated || !isStylist ? <Gate navigation={navigation} />
      : state.kind === 'loading' ? <Loading />
        : state.kind === 'error' ? <ErrorState message={state.message} retry={retry} />
          : !shift ? <ErrorState message="Không tìm thấy ca làm này." retry={() => navigation.goBack()} />
            : <Detail shift={shift} pending={pending} error={error} onAttendance={recordAttendance} />}
  </SafeAreaView>
}

function Detail({ shift, pending, error, onAttendance }) {
  const action = shiftAttendanceAction(shift)
  return <ScrollView contentContainerStyle={styles.detailContent}>
    <View style={styles.detailCard}>
      <Text style={styles.shiftDate}>{formatShiftDate(shift.localDate)}</Text>
      <Text style={styles.detailTime}>{formatShiftTime(shift.startAt)} – {formatShiftTime(shift.endAt)}</Text>
      <Text style={[styles.status, shift.status === 'cancelled' && styles.cancelled]}>{shiftStatusLabel(shift.status)}</Text>
    </View>
    <View style={styles.detailCard}>
      <Text style={styles.detailLabel}>Trạng thái chấm công</Text>
      <Text style={styles.detailValue}>{shiftAttendanceLabel(shift)}</Text>
      {shift.actualStartedAt && <Text style={styles.detailCopy}>Bắt đầu ca: {formatShiftTime(shift.actualStartedAt)}</Text>}
      {shift.actualEndedAt && <Text style={styles.detailCopy}>Kết thúc ca: {formatShiftTime(shift.actualEndedAt)}</Text>}
      {!shift.actualStartedAt && <Text style={styles.detailCopy}>Giờ chấm công được ghi nhận theo giờ của máy chủ.</Text>}
    </View>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {action && <Pressable accessibilityRole="button" disabled={pending} onPress={onAttendance} style={[styles.attendanceButton, pending && styles.disabled]}>
      <Text style={styles.attendanceButtonText}>{pending ? 'Đang lưu…' : action === 'check-in' ? 'Bắt đầu ca' : 'Kết thúc ca'}</Text>
    </Pressable>}
  </ScrollView>
}

function Loading() {
  return <View style={styles.center}><ActivityIndicator color={colors.copper} /><Text style={styles.copy}>Đang tải chi tiết ca…</Text></View>
}

function Gate({ navigation }) {
  return <View style={styles.center}><Text accessibilityRole="alert" style={styles.copy}>Đăng nhập bằng tài khoản stylist để xem ca làm.</Text><Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Login')}><Text style={styles.primaryButtonText}>Đăng nhập</Text></Pressable></View>
}

function ErrorState({ message, retry }) {
  return <View style={styles.center}><Text accessibilityRole="alert" style={styles.error}>{message}</Text><Pressable style={styles.primaryButton} onPress={retry}><Text style={styles.primaryButtonText}>Thử lại</Text></Pressable></View>
}
