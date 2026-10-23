import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { appointmentCardText, isAppointmentCustomer } from '../appointment-presentation.js'
import { useCustomerAppointmentDetail } from '../hooks/useCustomerAppointmentDetail.js'
import { styles } from '../styles/appointments.styles.js'

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
const actualTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

function Detail({ token, accountId, appointmentId }) {
  const state = useCustomerAppointmentDetail(token, accountId, appointmentId)
  if (state.kind === 'loading') return <View style={[styles.center, styles.gate]}>
    <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải chi tiết lịch hẹn" />
    <Text style={styles.stateText}>Đang tải chi tiết lịch hẹn…</Text>
  </View>
  if (state.kind !== 'success') {
    const message = {
      notFound: 'Không tìm thấy lịch hẹn hoặc bạn không có quyền xem lịch này.',
      denied: 'Phiên đăng nhập hoặc quyền khách hàng đã thay đổi. Vui lòng đăng nhập lại.',
      invalid: 'Mã lịch hẹn không hợp lệ. Hãy quay lại danh sách và chọn lịch.',
      error: 'Không tải được chi tiết lịch hẹn. Vui lòng thử lại.',
    }[state.kind]
    return <View style={[styles.center, styles.gate]}>
      <Text accessibilityRole="alert" style={styles.stateText}>{message}</Text>
      {state.kind !== 'invalid' && <Pressable accessibilityRole="button" onPress={state.retry} style={styles.button}>
        <Text style={styles.buttonText}>Thử lại</Text>
      </Pressable>}
    </View>
  }
  const item = state.appointment, text = appointmentCardText(item)
  return <ScrollView style={styles.viewport} contentContainerStyle={styles.list}>
    <View style={styles.card}>
      <View style={styles.badge}><Text style={styles.badgeText}>{text.status}</Text></View>
      <Text selectable style={styles.meta}>Mã lịch: {item.id}</Text>
      <Text style={styles.service}>{text.date}</Text>
      <Text style={styles.time}>{text.time}</Text>
      <Text style={styles.meta}>Giờ bắt đầu – kết thúc dự kiến · Giờ Việt Nam</Text>
      <Text style={styles.service}>Stylist: {text.stylist}</Text>
      <Text style={styles.meta}>Tổng thời lượng: {text.duration}</Text>
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.service}>Dịch vụ đã đặt</Text>
      {item.items.map((service, index) => <View key={service.serviceId + ':' + index} style={styles.total}>
        <View style={styles.viewport}><Text style={styles.service}>{service.name}</Text>
          <Text style={styles.meta}>{service.durationMinutes} phút</Text></View>
        <Text style={styles.price}>{money.format(service.priceVnd)}</Text>
      </View>)}
      <View style={styles.total}><Text style={styles.service}>Tổng giá dự kiến</Text><Text style={styles.price}>{text.price}</Text></View>
      <Text style={styles.copy}>Tên, giá và thời lượng theo thông tin đã lưu trong lịch hẹn.</Text>
    </View>
    {(item.startedAt || item.completedAt) && <View style={styles.card}>
      <Text style={styles.service}>Thời gian phục vụ thực tế</Text>
      {item.startedAt && <Text style={styles.meta}>Bắt đầu: {actualTime.format(new Date(item.startedAt))}</Text>}
      {item.completedAt && <Text style={styles.meta}>Hoàn tất: {actualTime.format(new Date(item.completedAt))}</Text>}
    </View>}
  </ScrollView>
}

export default function CustomerAppointmentDetailScreen({ navigation, route }) {
  const { token, account, isAuthenticated, isLoading } = useAuth()
  const accountId = account?.accountId ?? account?.id
  const appointmentId = route.params?.appointmentId
  return <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
    <View style={styles.header}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại danh sách lịch hẹn" style={styles.back}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('CustomerAppointments')}>
          <Feather name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.brand}>SOL HAIR STUDIO</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>Chi tiết lịch hẹn</Text>
    </View>
    {isLoading ? <View style={[styles.center, styles.gate]}><ActivityIndicator color={colors.copper} /></View>
      : !isAuthenticated || !token || !isAppointmentCustomer(account) ? <View style={[styles.center, styles.gate]}>
        <Text accessibilityRole="alert" style={styles.stateText}>Đăng nhập bằng tài khoản Customer đang hoạt động để xem lịch của mình.</Text>
        {!isAuthenticated && <Pressable accessibilityRole="button" style={styles.button}
          onPress={() => navigation.navigate('Login', { returnTo: 'CustomerAppointments' })}>
          <Text style={styles.buttonText}>Đăng nhập</Text>
        </Pressable>}
      </View> : <Detail key={JSON.stringify([token, accountId, appointmentId, account.roles, account.status])}
        token={token} accountId={accountId} appointmentId={appointmentId} />}
  </SafeAreaView>
}
