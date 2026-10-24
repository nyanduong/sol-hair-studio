import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import BottomNav from '../../../navigation/BottomNav.jsx'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import {
  appointmentCardText,
  customerAppointmentTab,
  getShiftLabel,
  getStatusTheme,
  isAppointmentCustomer,
} from '../appointment-presentation.js'
import { useCustomerAppointments } from '../hooks/useCustomerAppointments.js'
import { styles } from '../styles/appointments.styles.js'

function Action({ label, onPress, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  )
}

function AppointmentCard({ item, navigation }) {
  const text = appointmentCardText(item)
  const theme = getStatusTheme(item.status)
  const shift = getShiftLabel(item.startAt)

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => navigation.navigate('CustomerAppointmentDetail', { appointmentId: item.id })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityLabel={'Lịch hẹn ' + text.date + ', ' + text.status}
    >
      <View style={styles.cardTop}>
        <View style={[styles.badge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
          <View style={[styles.badgeDot, { backgroundColor: theme.dot }]} />
          <Text style={[styles.badgeText, { color: theme.text }]}>{theme.label}</Text>
        </View>

        <View style={styles.atelierTag}>
          <Feather name="shield" size={12} color={colors.copper} />
          <Text style={styles.atelierTagText}>Sol Atelier</Text>
        </View>
      </View>

      <View style={styles.timeBox}>
        <View style={styles.timeBoxTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.timeBoxLabel}>Thời gian hẹn</Text>
            <Text style={styles.timeBoxDate}>{text.date}</Text>
            <View style={styles.timeBoxRow}>
              <Feather name="clock" size={13} color={colors.copper} />
              <Text style={styles.timeBoxTime}>{text.time}</Text>
              {shift ? <Text style={styles.timeBoxShift}>({shift})</Text> : null}
            </View>
          </View>
          <View style={styles.priceBox}>
            <Text style={styles.durationText}>{text.duration}</Text>
            <Text style={styles.priceLabel}>Giá theo lịch</Text>
            <Text style={styles.priceValue}>{text.price}</Text>
          </View>
        </View>
      </View>

      <View style={styles.serviceRow}>
        <Feather name="scissors" size={14} color={colors.ink} />
        <Text style={styles.service}>{text.services}</Text>
      </View>

      <View style={styles.metaRow}>
        <Feather name="user" size={13} color={colors.muted} />
        <Text style={styles.meta}>Stylist: {text.stylist}</Text>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.viewDetailText}>Xem chi tiết</Text>
        <Feather name="chevron-right" size={13} color={colors.copper} />
      </View>
    </Pressable>
  )
}

function CustomerList({ navigation, token, accountId }) {
  const state = useCustomerAppointments(token, accountId)
  const [tab, setTab] = useState('upcoming')
  const view = customerAppointmentTab(state, tab)
  const denied = state.kind === 'denied'
  const login = () =>
    navigation.navigate('Login', { returnTo: 'CustomerAppointments', notice: 'Đăng nhập lại để xem lịch hẹn của bạn.' })

  const header = (
    <View style={{ marginBottom: 4 }}>
      <Text style={styles.stateText}>Thời gian hiển thị theo giờ Việt Nam.</Text>
      <View style={styles.tabs} accessibilityRole="tablist">
        {[
          ['upcoming', 'Sắp tới'],
          ['history', 'Lịch sử'],
        ].map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.tabSelected]}
          >
            <Text style={[styles.tabText, tab === value && styles.tabActive]}>
              {label}
              {view.counts ? ' (' + view.counts[value] + ')' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
      {view.incomplete && !denied && (
        <Text style={[styles.copy, { marginBottom: 14 }]}>
          Danh sách còn trang. Tải thêm để xem đầy đủ lịch trong mỗi mục.
        </Text>
      )}
    </View>
  )

  const empty =
    state.kind === 'loading' ? (
      <View style={styles.center}>
        <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải lịch hẹn" />
        <Text style={styles.stateText}>Đang tải lịch hẹn…</Text>
      </View>
    ) : view.empty ? (
      <View style={styles.center}>
        <Feather name="calendar" size={36} color={colors.copper} />
        <Text style={styles.stateTitle}>{tab === 'upcoming' ? 'Bạn chưa có lịch sắp tới' : 'Bạn chưa có lịch sử hẹn'}</Text>
        <Text style={styles.stateText}>Kéo xuống để tải lại danh sách.</Text>
      </View>
    ) : null

  const footer = (
    <View style={styles.footer}>
      {denied ? (
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={styles.stateText}>
            Phiên hoặc quyền khách hàng đã thay đổi. Danh sách cũ đã được xóa.
          </Text>
          <Action label="Đăng nhập lại" onPress={login} />
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={styles.stateText}>
            {state.restartRequired
              ? 'Phân trang không còn hợp lệ. Hãy tải lại danh sách.'
              : 'Không tải được lịch hẹn. Vui lòng thử lại.'}
          </Text>
          <Action label={state.restartRequired ? 'Tải lại danh sách' : 'Thử lại'} onPress={state.retry} />
        </View>
      ) : state.hasNextPage ? (
        <View>
          {state.kind === 'loadingMore' && (
            <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải thêm lịch hẹn" />
          )}
          <Action
            label={state.kind === 'loadingMore' ? 'Đang tải thêm…' : 'Tải thêm lịch hẹn'}
            onPress={state.loadMore}
            disabled={state.kind === 'loadingMore'}
          />
        </View>
      ) : null}
    </View>
  )

  return (
    <FlatList
      style={styles.viewport}
      data={denied ? [] : view.items}
      keyExtractor={item => item.id}
      renderItem={({ item }) => <AppointmentCard item={item} navigation={navigation} />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      refreshing={state.refreshing}
      onRefresh={state.refresh}
      alwaysBounceVertical
    />
  )
}

export default function CustomerAppointmentsScreen({ navigation }) {
  const { token, account, isAuthenticated, isLoading } = useAuth()
  const accountId = account?.accountId ?? account?.id

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
      <View style={styles.header}>
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            style={styles.back}
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
          >
            <Feather name="arrow-left" size={20} color={colors.ink} />
          </Pressable>
          <View style={styles.brandPill}>
            <Text style={styles.brand}>SOL HAIR STUDIO</Text>
          </View>
        </View>
        <Text accessibilityRole="header" style={styles.title}>Lịch hẹn của tôi</Text>
        <Text style={styles.copy}>Theo dõi những cuộc hẹn chăm sóc mái tóc của bạn.</Text>
      </View>

      {isLoading ? (
        <View style={[styles.center, styles.gate]}>
          <ActivityIndicator color={colors.copper} accessibilityLabel="Đang kiểm tra phiên" />
        </View>
      ) : !isAuthenticated || !token ? (
        <View style={[styles.center, styles.gate]}>
          <Text style={styles.stateText}>Đăng nhập bằng tài khoản khách hàng để xem lịch của mình.</Text>
          <Action
            label="Đăng nhập để xem lịch"
            onPress={() => navigation.navigate('Login', { returnTo: 'CustomerAppointments' })}
          />
        </View>
      ) : !isAppointmentCustomer(account) ? (
        <View style={[styles.center, styles.gate]}>
          <Text accessibilityRole="alert" style={styles.stateText}>
            Màn hình này chỉ dành cho tài khoản Customer đang hoạt động.
          </Text>
        </View>
      ) : (
        <CustomerList
          key={JSON.stringify([token, accountId, account.roles, account.status])}
          navigation={navigation}
          token={token}
          accountId={accountId}
        />
      )}

      <BottomNav navigation={navigation} active="CustomerAppointments" />
    </SafeAreaView>
  )
}
