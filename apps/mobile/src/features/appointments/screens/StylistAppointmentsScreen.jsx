import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { salonDate } from '../../../../../../shared/booking.js'
import BottomNav from '../../../navigation/BottomNav.jsx'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { isAppointmentStylist, moveAppointmentDay } from '../appointment-presentation.js'
import { useStylistAppointments } from '../hooks/useStylistAppointments.js'
import { StylistAction, StylistAppointmentCard, StylistGate, StylistHeader, StylistReadError } from '../components/StylistAppointmentView.jsx'
import { styles } from '../styles/appointments.styles.js'
import { styles as local } from '../styles/stylist-appointments.styles.js'

const WEEKDAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

function formatDateTitle(dateStr) {
  if (!dateStr) return { title: '', isToday: false, dateFormatted: '' }
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const weekday = WEEKDAY_NAMES[dt.getUTCDay()]
  const isToday = dateStr === salonDate()
  const dateFormatted = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
  const title = isToday ? `Hôm nay · ${weekday}` : `${weekday}`
  return { title, isToday, dateFormatted }
}

function DateControls({ date, onChange }) {
  const { title, isToday, dateFormatted } = formatDateTitle(date)

  return (
    <View style={local.controls}>
      <View style={local.dateNavCard}>
        <View style={local.dateNavTopRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ngày trước"
            style={local.navArrowBtn}
            onPress={() => onChange(moveAppointmentDay(date, -1))}
          >
            <Feather name="chevron-left" size={20} color={colors.ink} />
          </Pressable>

          <View style={local.dateCenterInfo}>
            <Text style={local.dateMainText}>{title}</Text>
            <Text style={local.dateSubText}>{dateFormatted} · Giờ Việt Nam</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ngày sau"
            style={local.navArrowBtn}
            onPress={() => onChange(moveAppointmentDay(date, 1))}
          >
            <Feather name="chevron-right" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <View style={local.dateActionsRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onChange(moveAppointmentDay(date, -1))}
            style={local.quickDayChip}
          >
            <Text style={local.quickDayChipText}>Hôm trước</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => onChange(salonDate())}
            style={[local.todayPill, isToday && local.todayPillActive]}
          >
            <Text style={[local.todayPillText, isToday && local.todayPillTextActive]}>
              {isToday ? 'Đang xem hôm nay' : 'Về hôm nay'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => onChange(moveAppointmentDay(date, 1))}
            style={local.quickDayChip}
          >
            <Text style={local.quickDayChipText}>Hôm sau</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function PersonalList({ token, accountId, navigation }) {
  const [date, setDate] = useState(() => salonDate())
  const state = useStylistAppointments(token, accountId, date)
  const denied = state.kind === 'denied'

  return (
    <>
      <DateControls date={date} onChange={setDate} />
      <FlatList
        style={styles.viewport}
        data={denied ? [] : state.items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <StylistAppointmentCard
            appointment={item}
            onPress={() => navigation.navigate('StylistAppointmentDetail', { appointmentId: item.id })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshing={state.refreshing}
        onRefresh={state.refresh}
        alwaysBounceVertical
        ListEmptyComponent={
          state.kind === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải lịch được giao" />
              <Text style={styles.stateText}>Đang tải lịch hẹn được giao…</Text>
            </View>
          ) : state.kind === 'success' && !state.hasNextPage ? (
            <View style={[styles.center, { marginTop: 24 }]}>
              <View style={[styles.back, { width: 56, height: 56, borderRadius: 28, backgroundColor: '#f5ebe6' }]}>
                <Feather name="calendar" size={24} color={colors.copper} />
              </View>
              <Text style={styles.stateTitle}>Chưa có lịch được giao trong ngày này</Text>
              <Text style={styles.stateText}>
                Kéo xuống để cập nhật lại hoặc chọn ngày khác để xem lịch hẹn được giao.
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {['denied', 'error'].includes(state.kind) ? (
              <StylistReadError state={state} />
            ) : state.hasNextPage ? (
              <>
                {state.kind === 'loadingMore' && (
                  <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải thêm" />
                )}
                <StylistAction
                  label="Tải thêm lịch hẹn"
                  onPress={state.loadMore}
                  disabled={state.kind === 'loadingMore'}
                />
              </>
            ) : null}
          </View>
        }
      />
    </>
  )
}

export default function StylistAppointmentsScreen({ navigation }) {
  const auth = useAuth()
  const accountId = auth.account?.accountId ?? auth.account?.id

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
      <StylistHeader navigation={navigation} />
      {!auth.isLoading && auth.isAuthenticated && auth.token && isAppointmentStylist(auth.account) ? (
        <PersonalList
          key={JSON.stringify([auth.token, accountId, auth.account.roles, auth.account.status])}
          token={auth.token}
          accountId={accountId}
          navigation={navigation}
        />
      ) : (
        <StylistGate isLoading={auth.isLoading} navigation={navigation} />
      )}
      <BottomNav navigation={navigation} active="StylistAppointments" />
    </SafeAreaView>
  )
}
