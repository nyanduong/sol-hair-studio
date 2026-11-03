import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { salonDate } from '../../../../../../shared/booking.js'
import BottomNav from '../../../navigation/BottomNav.jsx'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { useStylistAppointments } from '../hooks/useStylistAppointments.js'
import {
  appointmentDateLabel,
  appointmentStatusLabel,
  formatShiftTime,
  moveLocalDate,
} from '../staff-presentation.js'
import { styles } from '../styles/stylist-shifts.styles.js'

export default function StylistAppointmentsScreen({ navigation }) {
  const { isAuthenticated, isLoading, isStylist, token } = useAuth()
  const [localDate, setLocalDate] = useState(() => salonDate())
  const { state, retry } = useStylistAppointments(token, localDate)

  if (isLoading) return <Loading />
  if (!isAuthenticated || !isStylist) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safe}>
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={styles.copy}>Khu vực lịch hẹn chỉ dành cho stylist đã đăng nhập.</Text>
          <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.primaryButtonText}>Đăng nhập</Text>
          </Pressable>
        </View>
        <BottomNav navigation={navigation} active="StylistAppointments" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.brand}>SOL HAIR STUDIO</Text>
        <Text accessibilityRole="header" style={styles.title}>Lịch hẹn của tôi</Text>
        <Text style={styles.copy}>Chỉ hiển thị các lịch được phân công cho bạn.</Text>
      </View>
      <View style={styles.weekControls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Ngày trước" style={styles.iconButton} onPress={() => setLocalDate(moveLocalDate(localDate, -1))}>
          <Feather name="chevron-left" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.weekLabel}>{appointmentDateLabel(localDate)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Ngày sau" style={styles.iconButton} onPress={() => setLocalDate(moveLocalDate(localDate, 1))}>
          <Feather name="chevron-right" size={22} color={colors.ink} />
        </Pressable>
      </View>
      <AppointmentContent state={state} retry={retry} />
      <BottomNav navigation={navigation} active="StylistAppointments" />
    </SafeAreaView>
  )
}

function AppointmentContent({ state, retry }) {
  if (state.kind === 'loading') return <Loading />
  if (state.kind === 'error') {
    return <View style={styles.center}><Text accessibilityRole="alert" style={styles.error}>{state.message}</Text><Pressable style={styles.primaryButton} onPress={retry}><Text style={styles.primaryButtonText}>Thử lại</Text></Pressable></View>
  }
  if (!state.data.items.length) return <View style={styles.center}><Text style={styles.copy}>Bạn chưa có lịch hẹn nào trong ngày này.</Text></View>
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {state.data.items.map((appointment) => <View key={appointment.id} style={styles.appointmentCard}>
        <View style={styles.appointmentHeader}>
          <Text style={styles.appointmentTime}>{formatShiftTime(appointment.startAt)} – {formatShiftTime(appointment.endAt)}</Text>
          <Text style={[styles.status, appointment.status === 'in_progress' && styles.inProgress, appointment.status === 'completed' && styles.completed]}>{appointmentStatusLabel(appointment.status)}</Text>
        </View>
        <Text style={styles.appointmentCustomer}>{appointment.customerSnapshot.displayName}</Text>
        <Text style={styles.appointmentPhone}>{appointment.customerSnapshot.phone}</Text>
        <Text style={styles.appointmentServices}>{appointment.items.map((item) => item.name).join(' · ')}</Text>
      </View>)}
    </ScrollView>
  )
}

function Loading() {
  return <View style={styles.center}><ActivityIndicator accessibilityLabel="Đang tải lịch hẹn" color={colors.copper} /><Text style={styles.copy}>Đang tải lịch hẹn…</Text></View>
}
