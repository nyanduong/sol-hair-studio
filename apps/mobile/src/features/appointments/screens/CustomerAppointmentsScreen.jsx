import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import BottomNav from '../../../navigation/BottomNav.jsx'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { appointmentCardText, customerAppointmentTab, isAppointmentCustomer } from '../appointment-presentation.js'
import { useCustomerAppointments } from '../hooks/useCustomerAppointments.js'
import { styles } from '../styles/appointments.styles.js'

function Action({ label, onPress, disabled = false }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>
}

function AppointmentCard({ item }) {
  const text = appointmentCardText(item)
  return <View style={styles.card} accessibilityLabel={'Lịch hẹn ' + text.date + ', ' + text.status}>
    <View style={styles.cardTop}>
      <Text style={styles.date}>{text.date}</Text>
      <View style={styles.badge}><Text style={styles.badgeText}>{text.status}</Text></View>
    </View>
    <Text style={styles.time}>{text.time}</Text>
    <Text style={styles.service}>{text.services}</Text>
    <Text style={styles.meta}>Stylist: {text.stylist}</Text>
    <View style={styles.total}>
      <Text style={styles.meta}>{text.duration}</Text>
      <View><Text style={styles.meta}>Giá theo lịch</Text><Text style={styles.price}>{text.price}</Text></View>
    </View>
  </View>
}

function CustomerList({ navigation, token, accountId }) {
  const state = useCustomerAppointments(token, accountId)
  const [tab, setTab] = useState('upcoming')
  const view = customerAppointmentTab(state, tab)
  const denied = state.kind === 'denied'
  const login = () => navigation.navigate('Login', { returnTo: 'CustomerAppointments', notice: 'Đăng nhập lại để xem lịch hẹn của bạn.' })
  const header = <View>
    <Text style={styles.stateText}>Thời gian hiển thị theo giờ Việt Nam.</Text>
    <View style={styles.tabs} accessibilityRole="tablist">
      {[['upcoming', 'Sắp tới'], ['history', 'Lịch sử']].map(([value, label]) => <Pressable key={value}
        accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: tab === value }}
        onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabSelected]}>
        <Text style={[styles.tabText, tab === value && styles.tabActive]}>{label}{view.counts ? ' (' + view.counts[value] + ')' : ''}</Text>
      </Pressable>)}
    </View>
    {view.incomplete && !denied && <Text style={[styles.copy, { marginBottom: 14 }]}>Danh sách còn trang. Tải thêm để xem đầy đủ lịch trong mỗi mục.</Text>}
  </View>
  const empty = state.kind === 'loading' ? <View style={styles.center}>
    <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải lịch hẹn" />
    <Text style={styles.stateText}>Đang tải lịch hẹn…</Text>
  </View> : view.empty ? <View style={styles.center}>
    <Feather name="calendar" size={34} color={colors.copper} />
    <Text style={styles.stateTitle}>{tab === 'upcoming' ? 'Bạn chưa có lịch sắp tới' : 'Bạn chưa có lịch sử hẹn'}</Text>
    <Text style={styles.stateText}>Kéo xuống để tải lại danh sách.</Text>
  </View> : null
  const footer = <View style={styles.footer}>
    {denied ? <View style={styles.center}>
      <Text accessibilityRole="alert" style={styles.stateText}>Phiên hoặc quyền khách hàng đã thay đổi. Danh sách cũ đã được xóa.</Text>
      <Action label="Đăng nhập lại" onPress={login} />
    </View> : state.kind === 'error' ? <View style={styles.center}>
      <Text accessibilityRole="alert" style={styles.stateText}>{state.restartRequired ? 'Phân trang không còn hợp lệ. Hãy tải lại danh sách.' : 'Không tải được lịch hẹn. Vui lòng thử lại.'}</Text>
      <Action label={state.restartRequired ? 'Tải lại danh sách' : 'Thử lại'} onPress={state.retry} />
    </View> : state.hasNextPage ? <View>
      {state.kind === 'loadingMore' && <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải thêm lịch hẹn" />}
      <Action label={state.kind === 'loadingMore' ? 'Đang tải thêm…' : 'Tải thêm lịch hẹn'} onPress={state.loadMore} disabled={state.kind === 'loadingMore'} />
    </View> : null}
  </View>
  return <FlatList style={styles.viewport} data={denied ? [] : view.items} keyExtractor={item => item.id} renderItem={({ item }) => <AppointmentCard item={item} />}
    contentContainerStyle={styles.list} ListHeaderComponent={header} ListEmptyComponent={empty} ListFooterComponent={footer}
    refreshing={state.refreshing} onRefresh={state.refresh} alwaysBounceVertical />
}

export default function CustomerAppointmentsScreen({ navigation }) {
  const { token, account, isAuthenticated, isLoading } = useAuth()
  const accountId = account?.accountId ?? account?.id
  return <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
    <View style={styles.header}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.back}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')}>
          <Feather name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.brand}>SOL HAIR STUDIO</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>Lịch hẹn của tôi</Text>
      <Text style={styles.copy}>Theo dõi những cuộc hẹn chăm sóc mái tóc của bạn.</Text>
    </View>
    {isLoading ? <View style={[styles.center, styles.gate]}><ActivityIndicator color={colors.copper} accessibilityLabel="Đang kiểm tra phiên" /></View>
      : !isAuthenticated || !token ? <View style={[styles.center, styles.gate]}>
        <Text style={styles.stateText}>Đăng nhập bằng tài khoản khách hàng để xem lịch của mình.</Text>
        <Action label="Đăng nhập để xem lịch" onPress={() => navigation.navigate('Login', { returnTo: 'CustomerAppointments' })} />
      </View> : !isAppointmentCustomer(account) ? <View style={[styles.center, styles.gate]}>
        <Text accessibilityRole="alert" style={styles.stateText}>Màn hình này chỉ dành cho tài khoản Customer đang hoạt động.</Text>
      </View> : <CustomerList key={JSON.stringify([token, accountId, account.roles, account.status])} navigation={navigation} token={token} accountId={accountId} />}
    <BottomNav navigation={navigation} active="CustomerAppointments" />
  </SafeAreaView>
}
