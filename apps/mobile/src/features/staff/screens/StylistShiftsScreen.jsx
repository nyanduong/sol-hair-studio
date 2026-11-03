import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import BottomNav from '../../../navigation/BottomNav.jsx'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { useStylistShifts } from '../hooks/useStylistShifts.js'
import {
  currentWeekRange,
  formatShiftDate,
  formatShiftTime,
  moveWeek,
  shiftStatusLabel,
  weekLabel,
} from '../staff-presentation.js'
import { styles } from '../styles/stylist-shifts.styles.js'
import { useState } from 'react'

export default function StylistShiftsScreen({ navigation }) {
  const { isAuthenticated, isLoading, isStylist, token } = useAuth()
  const [range, setRange] = useState(() => currentWeekRange())
  const { state, retry } = useStylistShifts(token, range)

  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated || !isStylist) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safe}>
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={styles.copy}>Khu vực ca làm chỉ dành cho stylist đã đăng nhập.</Text>
          <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.primaryButtonText}>Đăng nhập</Text>
          </Pressable>
        </View>
        <BottomNav navigation={navigation} active="StylistShifts" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.brand}>SOL HAIR STUDIO</Text>
        <Text accessibilityRole="header" style={styles.title}>Ca làm của tôi</Text>
        <Text style={styles.copy}>Xem các ca đã được chủ tiệm xếp cho bạn.</Text>
        <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => navigation.navigate('StylistAppointments')}>
          <Text style={styles.primaryButtonText}>Lịch hẹn được giao</Text>
        </Pressable>
      </View>
      <View style={styles.weekControls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Tuần trước" style={styles.iconButton} onPress={() => setRange(moveWeek(range, -1))}>
          <Feather name="chevron-left" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.weekLabel}>{weekLabel(range)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Tuần sau" style={styles.iconButton} onPress={() => setRange(moveWeek(range, 1))}>
          <Feather name="chevron-right" size={22} color={colors.ink} />
        </Pressable>
      </View>
      <ShiftContent state={state} retry={retry} />
      <BottomNav navigation={navigation} active="StylistShifts" />
    </SafeAreaView>
  )
}

function ShiftContent({ state, retry }) {
  if (state.kind === 'loading') return <LoadingScreen />
  if (state.kind === 'error') {
    return <View style={styles.center}><Text accessibilityRole="alert" style={styles.error}>{state.message}</Text><Pressable style={styles.primaryButton} onPress={retry}><Text style={styles.primaryButtonText}>Thử lại</Text></Pressable></View>
  }
  if (!state.data.shifts.length) return <View style={styles.center}><Text style={styles.copy}>Bạn chưa có ca làm nào trong tuần này.</Text></View>
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={styles.staffName}>{state.data.staff.displayName}</Text>
      {state.data.shifts.map((shift) => <View key={shift.shiftId} style={styles.shiftCard}>
        <View><Text style={styles.shiftDate}>{formatShiftDate(shift.localDate)}</Text><Text style={styles.shiftTime}>{formatShiftTime(shift.startAt)} – {formatShiftTime(shift.endAt)}</Text></View>
        <Text style={[styles.status, shift.status === 'cancelled' && styles.cancelled]}>{shiftStatusLabel(shift.status)}</Text>
      </View>)}
    </ScrollView>
  )
}

function LoadingScreen() {
  return <View style={styles.center}><ActivityIndicator accessibilityLabel="Đang tải ca làm" color={colors.copper} /><Text style={styles.copy}>Đang tải ca làm…</Text></View>
}
