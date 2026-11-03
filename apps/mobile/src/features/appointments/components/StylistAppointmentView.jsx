import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../../theme/tokens.js'
import { appointmentCardText, getStatusTheme } from '../appointment-presentation.js'
import { styles } from '../styles/appointments.styles.js'
import { styles as local } from '../styles/stylist-appointments.styles.js'

const actual = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

const WEEKDAY_SHORT = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

export function StylistAction({ label, onPress, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  )
}

export function StylistHeader({ navigation, detail = false, title }) {
  return (
    <View style={styles.header}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          style={styles.back}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate(detail ? 'StylistAppointments' : 'Home')}
        >
          <Feather name="arrow-left" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.brand}>SOL HAIR STUDIO</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        {title ?? (detail ? 'Chi tiết lịch hẹn' : 'Lịch hẹn được giao')}
      </Text>
      {!detail && (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('StylistShifts')}
          style={local.shiftBtn}
        >
          <Feather name="clock" size={14} color={colors.copper} />
          <Text style={local.shiftBtnText}>Xem ca làm việc của tôi</Text>
        </Pressable>
      )}
    </View>
  )
}

export function StylistLoading() {
  return (
    <View style={[styles.center, styles.gate]}>
      <ActivityIndicator color={colors.copper} accessibilityLabel="Đang tải lịch được giao" />
      <Text style={styles.stateText}>Đang tải lịch được giao…</Text>
    </View>
  )
}

export function StylistReadError({ state }) {
  const message = state.kind === 'notFound'
    ? 'Không tìm thấy lịch hoặc lịch không còn được giao cho bạn.'
    : state.kind === 'invalid'
      ? 'Mã lịch không hợp lệ. Hãy quay lại danh sách.'
      : state.kind === 'denied'
        ? 'Phiên, quyền hoặc hồ sơ Stylist đã thay đổi. Dữ liệu cũ đã được xóa.'
        : state.restartRequired
          ? 'Phân trang không còn hợp lệ. Hãy tải lại danh sách.'
          : 'Không tải được lịch hẹn. Vui lòng thử lại.'

  return (
    <View style={styles.center}>
      <Text accessibilityRole="alert" style={styles.stateText}>{message}</Text>
      {state.kind !== 'invalid' && (
        <StylistAction
          label={state.restartRequired ? 'Tải lại danh sách' : 'Thử lại'}
          onPress={state.retry}
        />
      )}
    </View>
  )
}

export function StylistGate({ isLoading, navigation }) {
  if (isLoading) return <StylistLoading />
  return (
    <View style={[styles.center, styles.gate]}>
      <Text accessibilityRole="alert" style={styles.stateText}>
        Màn hình này chỉ dành cho Stylist đang hoạt động.
      </Text>
      <StylistAction
        label="Đăng nhập"
        onPress={() => navigation.navigate('Login', { returnTo: 'CustomerAppointments' })}
      />
    </View>
  )
}

export function StylistAppointmentCard({ appointment, onPress, detail = false }) {
  const text = appointmentCardText(appointment)
  const theme = getStatusTheme(appointment.status)
  const customer = appointment.customerSnapshot || {}
  const customerInitial = customer.displayName ? customer.displayName.charAt(0).toUpperCase() : 'K'

  // Date metadata for detail tile
  const d = new Date(appointment.startAt)
  const vnTime = new Date(d.getTime() + 7 * 3600_000)
  const weekday = WEEKDAY_SHORT[vnTime.getUTCDay()]
  const day = String(vnTime.getUTCDate()).padStart(2, '0')
  const month = `Tháng ${vnTime.getUTCMonth() + 1}`

  if (detail) {
    return (
      <View style={{ gap: 14 }}>
        {/* Main Detail Header Card */}
        <View style={styles.detailCard}>
          <View style={styles.detailHeaderRow}>
            <View style={styles.codeRow}>
              <Text style={styles.codeLabel}>Mã lịch:</Text>
              <Text selectable style={styles.codeValue}>#{appointment.id}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <View style={[styles.badgeDot, { backgroundColor: theme.dot }]} />
              <Text style={[styles.badgeText, { color: theme.text }]}>{theme.label}</Text>
            </View>
          </View>

          {/* Calendar Tile Box */}
          <View style={styles.calendarTileBox}>
            <View style={styles.calendarTile}>
              <Text style={styles.calendarTileWeekday}>{weekday}</Text>
              <Text style={styles.calendarTileDay}>{day}</Text>
              <Text style={styles.calendarTileMonth}>{month}</Text>
            </View>
            <View style={styles.calendarTileInfo}>
              <Text style={styles.timeRangeText}>{text.time}</Text>
              <Text style={styles.timeRangeMeta}>{text.date}</Text>
              <Text style={styles.timeRangeMeta}>Tổng thời lượng: {text.duration}</Text>
              <Text style={styles.timeNotice}>Giờ Việt Nam · Giờ hẹn dự kiến</Text>
            </View>
          </View>

          {/* Customer Info Card */}
          <View style={local.customerCard}>
            <View style={local.customerAvatarLarge}>
              <Text style={local.customerAvatarLargeText}>{customerInitial}</Text>
            </View>
            <View style={local.customerCardContent}>
              <Text style={local.customerCardTag}>Khách hàng</Text>
              <Text style={local.customerCardName}>{customer.displayName || 'Khách hàng'}</Text>
              {customer.phone ? (
                <View style={local.customerPhoneRow}>
                  <Feather name="phone" size={13} color={colors.copper} />
                  <Text selectable style={local.customerPhoneText}>{customer.phone}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Services Detail Card */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Feather name="scissors" size={16} color={colors.copper} />
            <Text style={styles.sectionTitle}>Dịch vụ cần thực hiện</Text>
          </View>

          {appointment.items.map((service, index) => (
            <View style={styles.serviceItemRow} key={service.serviceId + ':' + index}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.serviceItemName}>{service.name}</Text>
                <Text style={styles.serviceItemMeta}>{service.durationMinutes} phút</Text>
              </View>
              <Text style={styles.serviceItemPrice}>{money.format(service.priceVnd)}</Text>
            </View>
          ))}

          <View style={styles.total}>
            <Text style={styles.totalLabel}>Tổng giá theo lịch</Text>
            <Text style={styles.price}>{text.price}</Text>
          </View>
        </View>

        {/* Actual progress / ETA card if available */}
        {(appointment.estimatedEndAt || appointment.startedAt || appointment.completedAt) && (
          <View style={styles.actualCard}>
            <View style={styles.sectionHeaderRow}>
              <Feather name="activity" size={16} color={colors.copper} />
              <Text style={styles.sectionTitle}>Tiến độ thực tế</Text>
            </View>
            {appointment.startedAt && (
              <View style={styles.actualRow}>
                <Feather name="play-circle" size={14} color={colors.muted} />
                <Text style={styles.actualText}>Bắt đầu: {actual.format(new Date(appointment.startedAt))}</Text>
              </View>
            )}
            {appointment.estimatedEndAt && (
              <View style={styles.actualRow}>
                <Feather name="clock" size={14} color={colors.copper} />
                <Text style={styles.actualText}>Dự kiến xong (ETA): {actual.format(new Date(appointment.estimatedEndAt))}</Text>
              </View>
            )}
            {appointment.completedAt && (
              <View style={styles.actualRow}>
                <Feather name="check-circle" size={14} color="#059669" />
                <Text style={styles.actualText}>Hoàn tất: {actual.format(new Date(appointment.completedAt))}</Text>
              </View>
            )}
            <Text style={styles.infoNotice}>
              Dịch vụ, giá và thời lượng theo snapshot đã đặt. ETA là dự kiến, khác với thời gian hoàn tất thực tế.
            </Text>
          </View>
        )}
      </View>
    )
  }

  // List Item Card
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Lịch của ${customer.displayName || 'Khách'}, ${text.time}, ${text.status}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {/* Top row: Date & Status Badge */}
      <View style={styles.cardTop}>
        <Text style={styles.date}>{text.date}</Text>
        <View style={[styles.badge, { backgroundColor: theme.bg, borderColor: theme.border }]}>
          <View style={[styles.badgeDot, { backgroundColor: theme.dot }]} />
          <Text style={[styles.badgeText, { color: theme.text }]}>{theme.label}</Text>
        </View>
      </View>

      {/* Time & Duration Box */}
      <View style={styles.timeBox}>
        <View style={styles.timeBoxTop}>
          <View>
            <Text style={styles.timeBoxLabel}>GIỜ HẸN LÀM VIỆC</Text>
            <Text style={styles.timeBoxDate}>{text.time}</Text>
            <View style={styles.timeBoxRow}>
              <Feather name="clock" size={12} color={colors.copper} />
              <Text style={styles.timeBoxTime}>{text.duration}</Text>
            </View>
          </View>
          <View style={styles.priceBox}>
            <Text style={styles.priceLabel}>GIÁ DỊCH VỤ</Text>
            <Text style={styles.priceValue}>{text.price}</Text>
          </View>
        </View>
      </View>

      {/* Customer Snippet */}
      <View style={local.customerSnippet}>
        <View style={local.customerAvatarSmall}>
          <Text style={local.customerAvatarSmallText}>{customerInitial}</Text>
        </View>
        <View style={local.customerSnippetContent}>
          <Text style={local.customerSnippetName} numberOfLines={1}>
            Khách: {customer.displayName || 'Khách hàng'}
          </Text>
          {customer.phone ? (
            <Text style={local.customerSnippetPhone}>{customer.phone}</Text>
          ) : null}
        </View>
      </View>

      {/* Service row */}
      <View style={styles.serviceRow}>
        <Feather name="scissors" size={14} color={colors.copper} />
        <Text style={styles.service}>
          {text.services}
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.viewDetailText}>Xem chi tiết</Text>
        <Feather name="chevron-right" size={14} color={colors.copper} />
      </View>
    </Pressable>
  )
}
