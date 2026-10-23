import CustomerAppointmentRescheduleAction from '../components/CustomerAppointmentRescheduleAction.jsx'
import CustomerAppointmentCancellation from '../components/CustomerAppointmentCancellation.jsx'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import {
  appointmentCardText,
  getCalendarTileParts,
  getShiftLabel,
  getStatusTheme,
  isAppointmentCustomer,
} from '../appointment-presentation.js'
import { useCustomerAppointmentDetail } from '../hooks/useCustomerAppointmentDetail.js'
import { styles } from '../styles/appointments.styles.js'

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
const actualTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function DetailContent({ state }) {
  if (state.kind === 'loading') {
    return (
      <View style={[styles.center, styles.gate]}>
        <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải chi tiết lịch hẹn" />
        <Text style={styles.stateText}>Đang tải chi tiết lịch hẹn…</Text>
      </View>
    )
  }

  if (state.kind !== 'success') {
    const message = {
      notFound: 'Không tìm thấy lịch hẹn hoặc bạn không có quyền xem lịch này.',
      denied: 'Phiên đăng nhập hoặc quyền khách hàng đã thay đổi. Vui lòng đăng nhập lại.',
      invalid: 'Mã lịch hẹn không hợp lệ. Hãy quay lại danh sách và chọn lịch.',
      error: 'Không tải được chi tiết lịch hẹn. Vui lòng thử lại.',
    }[state.kind]

    return (
      <View style={[styles.center, styles.gate]}>
        <Text accessibilityRole="alert" style={styles.stateText}>{message}</Text>
        {state.kind !== 'invalid' && (
          <Pressable accessibilityRole="button" onPress={state.retry} style={styles.button}>
            <Text style={styles.buttonText}>Thử lại</Text>
          </Pressable>
        )}
      </View>
    )
  }

  const item = state.appointment
  const text = appointmentCardText(item)
  const theme = getStatusTheme(item.status)
  const tile = getCalendarTileParts(item.startAt)
  const shift = getShiftLabel(item.startAt)

  return (
    <ScrollView style={styles.viewport} contentContainerStyle={styles.list}>
      {/* ── Main Detail Card ── */}
      <View style={styles.detailCard}>
        {/* Header: Mã hẹn & Status badge */}
        <View style={styles.detailHeaderRow}>
          <View style={styles.codeRow}>
            <Text style={styles.codeLabel}>Mã hẹn:</Text>
            <Text selectable style={styles.codeValue}>{item.id}</Text>
          </View>

          <View style={[styles.badge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <View style={[styles.badgeDot, { backgroundColor: theme.dot }]} />
            <Text style={[styles.badgeText, { color: theme.text }]}>{theme.label}</Text>
          </View>
        </View>

        {/* Calendar Tile & Time */}
        <View style={styles.calendarTileBox}>
          <View style={styles.calendarTile}>
            <Text style={styles.calendarTileWeekday}>{tile.weekday}</Text>
            <Text style={styles.calendarTileDay}>{tile.day}</Text>
            <Text style={styles.calendarTileMonth}>{tile.month}</Text>
          </View>

          <View style={styles.calendarTileInfo}>
            <Text style={styles.timeRangeText}>{text.time}</Text>
            <Text style={styles.timeRangeMeta}>{text.date}</Text>
            <Text style={styles.timeRangeMeta}>
              {text.duration}{shift ? ' · ' + shift : ''}
            </Text>
            <Text style={styles.timeNotice}>Thời gian theo giờ Việt Nam</Text>
          </View>
        </View>

        {/* Stylist Section */}
        <View style={styles.stylistCard}>
          <View style={styles.stylistAvatar}>
            <Feather name="user" size={20} color={colors.copper} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stylistRole}>Stylist tạo mẫu</Text>
            <Text style={styles.stylistName}>{text.stylist}</Text>
          </View>
        </View>
      </View>

      {/* ── Services Section Card ── */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Feather name="scissors" size={16} color={colors.copper} />
          <Text accessibilityRole="header" style={styles.sectionTitle}>Dịch vụ đã đặt</Text>
        </View>

        {item.items.map((service, index) => (
          <View key={service.serviceId + ':' + index} style={styles.serviceItemRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.serviceItemName}>{service.name}</Text>
              <Text style={styles.serviceItemMeta}>{service.durationMinutes} phút</Text>
            </View>
            <Text style={styles.serviceItemPrice}>{money.format(service.priceVnd)}</Text>
          </View>
        ))}

        <View style={styles.total}>
          <Text style={styles.totalLabel}>Tổng giá dự kiến</Text>
          <Text style={styles.price}>{text.price}</Text>
        </View>

        <Text style={styles.infoNotice}>
          Tên dịch vụ, giá và thời lượng theo thông tin đã lưu trong lịch hẹn.
        </Text>
      </View>

      {/* ── Actual Serving Time Card (nếu có) ── */}
      {(item.startedAt || item.completedAt) && (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Feather name="clock" size={16} color={colors.copper} />
            <Text style={styles.sectionTitle}>Thời gian phục vụ thực tế</Text>
          </View>
          {item.startedAt && (
            <View style={styles.actualRow}>
              <Feather name="play-circle" size={14} color={colors.copper} />
              <Text style={styles.actualText}>Bắt đầu: {actualTime.format(new Date(item.startedAt))}</Text>
            </View>
          )}
          {item.completedAt && (
            <View style={styles.actualRow}>
              <Feather name="check-circle" size={14} color="#10b981" />
              <Text style={styles.actualText}>Hoàn tất: {actualTime.format(new Date(item.completedAt))}</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  )
}

function Detail({ token, accountId, appointmentId, navigation }) {
  const state = useCustomerAppointmentDetail(token, accountId, appointmentId)
  return (
    <>
      <DetailContent state={state} />
      <CustomerAppointmentRescheduleAction appointment={state.kind === 'success' ? state.appointment : null} navigation={navigation} />
      <CustomerAppointmentCancellation
        token={token}
        accountId={accountId}
        appointmentId={appointmentId}
        appointment={state.kind === 'success' ? state.appointment : null}
        onChanged={state.refresh}
      />
    </>
  )
}

export default function CustomerAppointmentDetailScreen({ navigation, route }) {
  const { token, account, isAuthenticated, isLoading } = useAuth()
  const accountId = account?.accountId ?? account?.id
  const appointmentId = route.params?.appointmentId

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
      <View style={styles.header}>
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại danh sách lịch hẹn"
            style={styles.back}
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('CustomerAppointments'))}
          >
            <Feather name="arrow-left" size={20} color={colors.ink} />
          </Pressable>
          <View style={styles.brandPill}>
            <Text style={styles.brand}>SOL HAIR STUDIO</Text>
          </View>
        </View>
        <Text accessibilityRole="header" style={styles.title}>Chi tiết lịch hẹn</Text>
      </View>

      {isLoading ? (
        <View style={[styles.center, styles.gate]}>
          <ActivityIndicator color={colors.copper} />
        </View>
      ) : !isAuthenticated || !token || !isAppointmentCustomer(account) ? (
        <View style={[styles.center, styles.gate]}>
          <Text accessibilityRole="alert" style={styles.stateText}>
            Đăng nhập bằng tài khoản Customer đang hoạt động để xem lịch của mình.
          </Text>
          {!isAuthenticated && (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => navigation.navigate('Login', { returnTo: 'CustomerAppointments' })}
            >
              <Text style={styles.buttonText}>Đăng nhập</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Detail
          key={JSON.stringify([token, accountId, appointmentId, account?.roles, account?.status])}
          navigation={navigation}
          token={token}
          accountId={accountId}
          appointmentId={appointmentId}
        />
      )}
    </SafeAreaView>
  )
}
